#!/usr/bin/env node
import readline from "node:readline";
import { openStore } from "./lib/store.mjs";
import { refreshIndex } from "./lib/indexer.mjs";
import {
  findNode,
  graphSearch,
  graphStatus,
  impactAnalysis,
  traceRelationships,
} from "./lib/retrieval.mjs";
import {
  activeWork,
  claimScope,
  publishHandoff,
  recordDecision,
  registerAgent,
  releaseClaim,
  releaseSessionClaims,
  touchAgent,
} from "./lib/coordination.mjs";
import {
  authorizeBackgroundTasks,
  cancelDelegatedTask,
  claimDelegatedTask,
  completeDelegatedTask,
  delegateTask,
  dispatchEligibleTasks,
  getDelegatedTask,
  listDelegatedTasks,
  orchestrationStatus,
  reconcileExpiredTasks,
  releaseManualSessionTasks,
} from "./lib/orchestration.mjs";
import { executorAvailability } from "./lib/executors.mjs";

const SERVER_NAME = "nidokey-graph";
const SERVER_VERSION = "0.5.0";
const SESSION_CONTEXT_MAX_CHARACTERS = 4000;
const SESSION_CONTEXT_DEFAULT_RESULTS = 2;
const TOOL_RESPONSE_BUDGETS = {
  session_context: SESSION_CONTEXT_MAX_CHARACTERS,
  list_delegated_tasks: 4000,
  active_work: 5000,
  orchestration_status: 2500,
  graph_status: 4000,
  graph_search: 10000,
  get_node: 8000,
  trace_relationships: 10000,
  impact_analysis: 10000,
};
const TRUSTED_AGENTS = new Set(["codex", "claude-code"]);
const PRIVILEGED_TOOLS = new Set([
  "delegate_task",
  "claim_delegated_task",
  "complete_delegated_task",
  "cancel_delegated_task",
  "dispatch_tasks",
  "claim_scope",
  "release_claim",
  "record_decision",
  "publish_handoff",
]);
const store = openStore();
const state = {
  initialized: false,
  agent: process.env.NIDOKEY_GRAPH_AGENT ?? "unknown",
  sessionId: null,
  clientInfo: {},
  indexChecked: false,
  startupRefresh: null,
  delegatedTaskId: process.env.NIDOKEY_GRAPH_TASK_ID ?? null,
  deliveredContextTasks: new Set(),
  contextBootstrapDelivered: false,
  contextSnapshot: null,
};

const baseInstructions = [
  "Grafo local compartido de Nidokey para Codex y Claude Code.",
  "PRIMERA ACCIÓN OBLIGATORIA de cada tarea: llama session_context con el objetivo actual; evita releer todo el repositorio.",
  "Revisa taskInbox: puedes reclamar una tarea recibida o delegar trabajo no solapado al otro agente.",
  "Antes de editar: revisa el trabajo activo devuelto y reclama el ámbito mínimo con claim_scope.",
  "No edites un ámbito reclamado por otra sesión.",
  "Usa graph_search/trace_relationships para localizar contexto y verifica siempre las citas en el código.",
  "Para seguimiento frecuente usa orchestration_status; solicita detail=summary o full solo bajo demanda.",
  "Tras cambios: refresh_index, record_decision si hubo una decisión no trivial, publish_handoff y release_claim.",
  "El índice se actualiza incrementalmente al abrir y cerrar la sesión; las decisiones y handoffs lo enriquecen entre agentes.",
  "CLAUDE.md y el código actual son la fuente de verdad; README y docs históricas tienen menor autoridad.",
].join(" ");

const tools = [
  {
    name: "session_context",
    description:
      "Bootstrap obligatorio al empezar una tarea: actualiza el índice, recupera contexto relevante y reúne trabajo activo, decisiones y handoffs.",
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: {
          type: "string",
          minLength: 1,
          maxLength: 1000,
          description: "Objetivo concreto de la tarea actual, expresado en lenguaje natural.",
        },
        refresh: {
          type: "boolean",
          description: "Actualizar incrementalmente el índice antes de recuperar contexto.",
          default: false,
        },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 6,
          default: SESSION_CONTEXT_DEFAULT_RESULTS,
        },
        max_hops: { type: "integer", minimum: 0, maximum: 1, default: 0 },
        context_key: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "Identificador estable opcional de la tarea; evita repetir contexto si cambia su redacción.",
        },
        force_context: {
          type: "boolean",
          default: false,
          description: "Forzar un bootstrap completo aunque ya se haya entregado en la sesión.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Recuperar contexto de sesión",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "delegate_task",
    description:
      "Crea una tarea persistente para el otro agente. Las raíces esperan dispatch_tasks; los hijos heredan el presupuesto autorizado de su raíz.",
    inputSchema: {
      type: "object",
      required: ["target_agent", "title", "instructions", "scope"],
      properties: {
        target_agent: { type: "string", enum: ["codex", "claude-code"] },
        title: { type: "string", minLength: 1, maxLength: 300 },
        instructions: { type: "string", minLength: 1, maxLength: 12000 },
        scope: {
          type: "string",
          minLength: 1,
          description: "Archivo o directorio relativo, acotado y no solapado.",
        },
        acceptance_criteria: {
          type: "array",
          items: { type: "string", maxLength: 500 },
          maxItems: 10,
          default: [],
        },
        mode: { type: "string", enum: ["analyze", "edit"], default: "analyze" },
        priority: { type: "integer", minimum: 0, maximum: 3, default: 1 },
        depends_on: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
          default: [],
        },
        parent_task_id: { type: "string" },
        idempotency_key: { type: "string", maxLength: 200 },
        max_depth: { type: "integer", minimum: 0, maximum: 3, default: 2 },
        max_attempts: { type: "integer", minimum: 1, maximum: 3, default: 2 },
        timeout_minutes: { type: "integer", minimum: 5, maximum: 120, default: 45 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Delegar tarea",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_delegated_tasks",
    description:
      "Lista la bandeja persistente de tareas delegadas, con estado, dependencias y elegibilidad.",
    inputSchema: {
      type: "object",
      properties: {
        target_agent: { type: "string", enum: ["codex", "claude-code"] },
        status: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        root_id: { type: "string" },
        mine: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
        detail: {
          type: "string",
          enum: ["status", "summary", "full"],
          default: "status",
          description: "Nivel de detalle; full solo debe usarse bajo demanda.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Ver tareas delegadas",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_delegated_task",
    description:
      "Obtiene el detalle auditable de una tarea: dependencias, hijos, ejecuciones y eventos.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string", minLength: 1 },
        detail: {
          type: "string",
          enum: ["status", "summary", "full"],
          default: "status",
          description:
            "status para seguimiento, summary para entrega acotada y full para auditoría explícita.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Detalle de tarea delegada",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "claim_delegated_task",
    description:
      "Acepta en la sesión actual una tarea en cola asignada a este agente y reserva su ámbito.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string", minLength: 1 },
        ttl_minutes: { type: "integer", minimum: 15, maximum: 240, default: 120 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Aceptar tarea delegada",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "complete_delegated_task",
    description:
      "Completa una tarea asignada, crea su TaskOutput y handoff, enlaza artefactos y libera el ámbito.",
    inputSchema: {
      type: "object",
      required: ["task_id", "summary"],
      properties: {
        task_id: { type: "string", minLength: 1 },
        outcome: {
          type: "string",
          enum: ["completed", "partial", "blocked", "failed"],
          default: "completed",
        },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        changed_paths: {
          type: "array",
          items: { type: "string", maxLength: 1000 },
          maxItems: 50,
          default: [],
        },
        tests: {
          type: "array",
          items: { type: "string", maxLength: 500 },
          maxItems: 20,
          default: [],
        },
        next_steps: {
          type: "array",
          items: { type: "string", maxLength: 500 },
          maxItems: 20,
          default: [],
        },
        needs_user_input: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Completar tarea delegada",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "cancel_delegated_task",
    description:
      "Cancela una tarea en cola o solicita detener únicamente su proceso de ejecución registrado.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string", minLength: 1 },
        reason: { type: "string", maxLength: 2000 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Cancelar tarea delegada",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "dispatch_tasks",
    description:
      "Despliega ejecutores locales en segundo plano para tareas elegibles. Consume cuota de Codex o Claude.",
    inputSchema: {
      type: "object",
      required: ["confirm_quota_use", "task_ids"],
      properties: {
        confirm_quota_use: { type: "boolean", const: true },
        task_ids: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 20,
        },
        maximum: { type: "integer", minimum: 1, maximum: 3, default: 3 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Desplegar agentes en segundo plano",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "orchestration_status",
    description:
      "Estado del orquestador: cola, límites, procesos activos y disponibilidad de Codex/Claude.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      title: "Estado de orquestación",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "graph_status",
    description:
      "Estado y cobertura del índice Graph RAG compartido: archivos, nodos, relaciones, agentes y antigüedad.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      title: "Estado del Graph RAG",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "refresh_index",
    description:
      "Actualiza incrementalmente el índice desde el working tree. No modifica el código fuente ni lee secretos.",
    inputSchema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Reindexar todo aunque el hash no haya cambiado.",
          default: false,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Actualizar índice",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "graph_search",
    description:
      "Recuperación híbrida: busca entidades relevantes y expande sus relaciones para entregar contexto con rutas y líneas.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        max_results: { type: "integer", minimum: 1, maximum: 12, default: 4 },
        max_hops: { type: "integer", minimum: 0, maximum: 3, default: 0 },
        max_relations: { type: "integer", minimum: 0, maximum: 20, default: 12 },
        include_metadata: {
          type: "boolean",
          default: false,
          description: "Incluir metadatos acotados de nodos solo cuando sean necesarios.",
        },
        node_kinds: {
          type: "array",
          items: { type: "string" },
          description: "Filtro opcional: file, function, component, api_route, prisma_model, etc.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Buscar en el grafo",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_node",
    description:
      "Obtiene una entidad por id, símbolo o ruta. Devuelve evidencia compacta con ubicación verificable.",
    inputSchema: {
      type: "object",
      required: ["reference"],
      properties: {
        reference: { type: "string", minLength: 1 },
        max_results: { type: "integer", minimum: 1, maximum: 8, default: 4 },
        include_metadata: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Obtener nodo",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "trace_relationships",
    description:
      "Recorre el grafo desde un archivo, símbolo, pantalla, endpoint, modelo, decisión o agente.",
    inputSchema: {
      type: "object",
      required: ["start"],
      properties: {
        start: { type: "string", minLength: 1 },
        depth: { type: "integer", minimum: 1, maximum: 5, default: 2 },
        max_nodes: { type: "integer", minimum: 1, maximum: 12, default: 10 },
        max_relations: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          default: 12,
        },
        include_metadata: { type: "boolean", default: false },
        relations: {
          type: "array",
          items: { type: "string" },
          description: "Relaciones opcionales: IMPORTS, CALLS, TESTS, CONTAINS, AFFECTS, etc.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Trazar relaciones",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "impact_analysis",
    description:
      "Estima consumidores y áreas afectadas por cambiar un símbolo o archivo. Es heurístico y exige verificación.",
    inputSchema: {
      type: "object",
      required: ["reference"],
      properties: {
        reference: { type: "string", minLength: 1 },
        depth: { type: "integer", minimum: 1, maximum: 5, default: 3 },
        max_nodes: { type: "integer", minimum: 1, maximum: 8, default: 8 },
        max_relations: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          default: 16,
        },
        include_metadata: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Analizar impacto",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "active_work",
    description:
      "Muestra agentes, ámbitos, tareas y ejecuciones activas. El historial es opcional y acotado.",
    inputSchema: {
      type: "object",
      properties: {
        include_history: { type: "boolean", default: false },
        history_limit: { type: "integer", minimum: 1, maximum: 3, default: 1 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Trabajo paralelo activo",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "claim_scope",
    description:
      "Reclama temporalmente un archivo o directorio antes de editarlo. Rechaza ámbitos solapados con otro agente.",
    inputSchema: {
      type: "object",
      required: ["scope", "task"],
      properties: {
        scope: {
          type: "string",
          minLength: 1,
          description: "Ruta relativa de archivo o directorio; usa * solo para una tarea realmente global.",
        },
        task: { type: "string", minLength: 1 },
        ttl_minutes: { type: "integer", minimum: 5, maximum: 1440, default: 120 },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Reclamar ámbito",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "release_claim",
    description: "Libera un ámbito reclamado por la sesión actual.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: { type: "string" },
        scope: { type: "string" },
      },
      anyOf: [{ required: ["claim_id"] }, { required: ["scope"] }],
      additionalProperties: false,
    },
    annotations: {
      title: "Liberar ámbito",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "record_decision",
    description:
      "Registra una decisión técnica no trivial y la conecta con los archivos afectados para el otro agente.",
    inputSchema: {
      type: "object",
      required: ["title", "rationale"],
      properties: {
        title: { type: "string", minLength: 1 },
        rationale: { type: "string", minLength: 1 },
        paths: { type: "array", items: { type: "string" }, default: [] },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Registrar decisión",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "publish_handoff",
    description:
      "Publica para el otro agente un resumen verificable de cambios, pruebas y siguientes pasos.",
    inputSchema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string", minLength: 1 },
        paths: { type: "array", items: { type: "string" }, default: [] },
        tests: { type: "array", items: { type: "string" }, default: [] },
        next_steps: { type: "array", items: { type: "string" }, default: [] },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Publicar handoff",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function responseBudgetFor(toolName, input = {}) {
  if (toolName === "get_delegated_task") {
    if (input.detail === "full") return 24000;
    if (input.detail === "summary") return 6000;
    return 3000;
  }
  if (toolName === "list_delegated_tasks") {
    if (input.detail === "full") return 16000;
    if (input.detail === "summary") return 8000;
  }
  if (toolName === "active_work" && input.include_history === true) return 8000;
  if (toolName === "graph_search" && input.include_metadata === true) return 16000;
  if (
    ["get_node", "trace_relationships", "impact_analysis"].includes(toolName) &&
    input.include_metadata === true
  ) {
    return 16000;
  }
  return TOOL_RESPONSE_BUDGETS[toolName] ?? 16000;
}

function emergencyResponseText(toolName, value, maximum) {
  const serialized = JSON.stringify(value);
  const payloadFor = (previewLength) => ({
    tool: toolName,
    responseTruncated: true,
    message:
      "La respuesta superó su presupuesto. Reduce resultados o solicita un nivel de detalle más compacto.",
    preview: serialized.slice(0, previewLength),
    responseBudget: {
      mode: "emergency",
      maxCharacters: maximum,
      originalCharacters: serialized.length,
    },
  });
  let lower = 0;
  let upper = Math.min(serialized.length, maximum);
  let best = JSON.stringify(payloadFor(0), null, 2);
  while (lower <= upper) {
    const candidateLength = Math.floor((lower + upper) / 2);
    const candidate = JSON.stringify(payloadFor(candidateLength), null, 2);
    if (candidate.length <= maximum) {
      best = candidate;
      lower = candidateLength + 1;
    } else {
      upper = candidateLength - 1;
    }
  }
  if (best.length > maximum) {
    return JSON.stringify({
      tool: toolName,
      responseTruncated: true,
      responseBudget: { mode: "emergency", maxCharacters: maximum },
    });
  }
  return best;
}

function resultText(toolName, value, input = {}) {
  const maximum = responseBudgetFor(toolName, input);
  let text = JSON.stringify(value, null, 2);
  if (text.length > maximum) {
    text = emergencyResponseText(toolName, value, maximum);
  }
  return {
    content: [{ type: "text", text }],
  };
}

function errorResponse(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function context() {
  return {
    agent: state.agent,
    sessionId: state.sessionId,
    delegatedTaskId: state.delegatedTaskId,
    backgroundRunId: process.env.NIDOKEY_GRAPH_RUN_ID ?? null,
  };
}

function ensureIndex() {
  if (state.indexChecked) return;
  if (!store.metadata("last_indexed_at")) refreshIndex(store);
  state.indexChecked = true;
}

function refreshSafely() {
  try {
    const result = refreshIndex(store);
    state.indexChecked = true;
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

function clipText(value, maximum) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
}

function compactWork(work) {
  const agentsByName = new Map();
  for (const agent of work.agents ?? []) {
    const current = agentsByName.get(agent.name) ?? {
      name: agent.name,
      sessions: 0,
      latestSeenAt: null,
      delegatedTasks: [],
    };
    current.sessions += 1;
    if (!current.latestSeenAt || agent.lastSeenAt > current.latestSeenAt) {
      current.latestSeenAt = agent.lastSeenAt;
    }
    if (
      agent.delegatedTaskId &&
      !current.delegatedTasks.includes(agent.delegatedTaskId) &&
      current.delegatedTasks.length < 3
    ) {
      current.delegatedTasks.push(agent.delegatedTaskId);
    }
    agentsByName.set(agent.name, current);
  }
  const latestDecision = work.decisions?.[0];
  const latestHandoff = work.handoffs?.[0];
  return {
    agents: [...agentsByName.values()].slice(0, 3),
    claims: (work.claims ?? []).slice(0, 5).map((claim) => ({
      id: claim.id,
      agent: claim.agent,
      scope: claim.scope,
      task: clipText(claim.task, 180),
      expiresAt: claim.expires_at,
    })),
    latestDecision: latestDecision
      ? {
          id: latestDecision.id,
          agent: latestDecision.agent,
          title: clipText(latestDecision.title, 180),
          rationale: clipText(latestDecision.rationale, 320),
          paths: (latestDecision.paths ?? []).slice(0, 5),
          createdAt: latestDecision.created_at,
        }
      : null,
    latestHandoff: latestHandoff
      ? {
          id: latestHandoff.id,
          agent: latestHandoff.agent,
          summary: clipText(latestHandoff.summary, 420),
          paths: (latestHandoff.paths ?? []).slice(0, 5),
          createdAt: latestHandoff.created_at,
        }
      : null,
  };
}

function compactTaskInbox(taskInbox) {
  const tasks = taskInbox.tasks ?? [];
  return {
    count: tasks.length,
    tasks: tasks.slice(0, 5).map((task) => ({
      id: task.id,
      title: clipText(task.title, 160),
      targetAgent: task.targetAgent,
      status: task.status,
      priority: task.priority,
      scope: task.scope,
      eligibility: task.eligibility?.state ?? task.status,
    })),
  };
}

function compactSearch(search) {
  return {
    query: clipText(search.query, 300),
    indexedAt: search.indexedAt,
    resultCount: search.resultCount,
    results: (search.context ?? []).slice(0, 6).map((item) => ({
      id: item.id,
      kind: item.kind,
      name: clipText(item.name, 120),
      citation: item.citation,
      excerpt: clipText(item.excerpt, 460),
      score: item.score,
      depth: item.depth,
    })),
    relations: (search.relations ?? []).slice(0, 6).map((relation) => ({
      source: relation.sourceId ?? relation.source,
      relation: relation.relation,
      target: relation.targetId ?? relation.target,
    })),
  };
}

function compactOrchestration(orchestration, reconciledTasks) {
  return {
    backgroundEnabled: orchestration.backgroundEnabled,
    limits: orchestration.limits,
    counts: orchestration.counts,
    activeRuns: (orchestration.activeRuns ?? []).slice(0, 3).map((run) => ({
      id: run.id,
      taskId: run.task_id,
      agent: run.agent,
      status: run.status,
      title: clipText(run.title, 140),
      scope: run.scope,
      startedAt: run.started_at,
    })),
    reconciledTasks: (reconciledTasks ?? []).slice(0, 3),
  };
}

function compactActiveWork(work, delegation, orchestration, input = {}) {
  const coordination = compactWork(work);
  const includeHistory = input.include_history === true;
  const historyLimit = Math.min(Math.max(Number(input.history_limit ?? 1), 1), 3);
  return {
    agents: coordination.agents,
    claims: coordination.claims,
    delegation: compactTaskInbox(delegation),
    orchestration: compactOrchestration(orchestration, []),
    ...(includeHistory
      ? {
          decisions: (work.decisions ?? []).slice(0, historyLimit).map((decision) => ({
            id: decision.id,
            agent: decision.agent,
            title: clipText(decision.title, 180),
            rationale: clipText(decision.rationale, 320),
            paths: (decision.paths ?? []).slice(0, 5),
            createdAt: decision.created_at,
          })),
          handoffs: (work.handoffs ?? []).slice(0, historyLimit).map((handoff) => ({
            id: handoff.id,
            agent: handoff.agent,
            summary: clipText(handoff.summary, 420),
            paths: (handoff.paths ?? []).slice(0, 5),
            tests: (handoff.tests ?? []).slice(0, 3).map((test) => clipText(test, 180)),
            nextSteps: (handoff.nextSteps ?? [])
              .slice(0, 3)
              .map((step) => clipText(step, 180)),
            createdAt: handoff.created_at,
          })),
        }
      : {}),
  };
}

function sessionSnapshot(work) {
  return {
    latestDecisionId: work.latestDecision?.id ?? null,
    latestHandoffId: work.latestHandoff?.id ?? null,
  };
}

function withSessionBudget(payload) {
  const stamp = (value, squeezed) => {
    value.responseBudget = {
      mode: "compact",
      maxCharacters: SESSION_CONTEXT_MAX_CHARACTERS,
      actualCharacters: 0,
      approximateTokens: 0,
      squeezed,
    };
    for (let iteration = 0; iteration < 2; iteration += 1) {
      value.responseBudget.actualCharacters = JSON.stringify(value, null, 2).length;
      value.responseBudget.approximateTokens = Math.ceil(
        value.responseBudget.actualCharacters / 4,
      );
    }
    return value;
  };
  const measure = (value) => JSON.stringify(value, null, 2).length;
  stamp(payload, false);
  if (measure(payload) <= SESSION_CONTEXT_MAX_CHARACTERS) return payload;

  const results = payload.relevantContext?.results ?? [];
  const squeezed = {
    session: payload.session,
    contextMode: payload.contextMode,
    contextAlreadyProvided: payload.contextAlreadyProvided ?? false,
    message: payload.message,
    automaticIndexing: payload.automaticIndexing,
    index: payload.index,
    coordination: {
      agents: (payload.coordination?.agents ?? []).slice(0, 2),
      claims: (payload.coordination?.claims ?? []).slice(0, 2),
      latestDecision: payload.coordination?.latestDecision
        ? {
            id: payload.coordination.latestDecision.id,
            title: payload.coordination.latestDecision.title,
          }
        : null,
      latestHandoff: payload.coordination?.latestHandoff
        ? {
            id: payload.coordination.latestHandoff.id,
            summary: clipText(payload.coordination.latestHandoff.summary, 160),
          }
        : null,
    },
    taskInbox: {
      count: payload.taskInbox?.count ?? 0,
      tasks: (payload.taskInbox?.tasks ?? []).slice(0, 2),
    },
    orchestration: {
      backgroundEnabled: payload.orchestration?.backgroundEnabled,
      counts: payload.orchestration?.counts,
      activeRuns: (payload.orchestration?.activeRuns ?? []).slice(0, 1),
    },
    relevantContext: {
      query: clipText(payload.relevantContext?.query, 200),
      resultCount: payload.relevantContext?.resultCount ?? results.length,
      results: results.slice(0, 2).map((item) => ({
        citation: item.citation,
        name: item.name,
        excerpt: clipText(item.excerpt, 180),
      })),
      relations: [],
    },
    requiredNextActions: (payload.requiredNextActions ?? []).slice(0, 2),
    detailsAvailableVia: (payload.detailsAvailableVia ?? []).slice(0, 4),
  };
  stamp(squeezed, true);
  if (measure(squeezed) <= SESSION_CONTEXT_MAX_CHARACTERS) return squeezed;

  squeezed.automaticIndexing = {
    atSessionStart: true,
    atSessionEnd: true,
  };
  squeezed.coordination.agents = squeezed.coordination.agents.slice(0, 1);
  squeezed.coordination.claims = squeezed.coordination.claims.slice(0, 1);
  squeezed.taskInbox.tasks = squeezed.taskInbox.tasks.slice(0, 1);
  squeezed.relevantContext.results = squeezed.relevantContext.results.slice(0, 1);
  squeezed.detailsAvailableVia = ["graph_search", "active_work", "get_delegated_task"];
  return stamp(squeezed, true);
}

function sessionContext(input) {
  const task = clipText(input.task, 1000);
  if (!task) throw new Error("task es obligatorio");
  const stableKey = clipText(input.context_key, 200);
  const taskKey = stableKey
    ? `key:${stableKey.toLowerCase()}`
    : `task:${task.toLowerCase()}`;
  const forceContext = input.force_context === true;
  const taskAlreadyDelivered = state.deliveredContextTasks.has(taskKey);
  const contextMode =
    forceContext || !state.contextBootstrapDelivered
      ? "bootstrap"
      : taskAlreadyDelivered
        ? "reuse"
        : "delta";
  const reconciledTasks = reconcileExpiredTasks(store);
  const refresh = input.refresh === true || !state.startupRefresh?.ok
    ? refreshSafely()
    : {
        ok: true,
        skipped: true,
        reason: "El índice ya se actualizó al abrir esta sesión",
      };
  ensureIndex();
  const status = graphStatus(store);
  const rawTaskInbox = listDelegatedTasks(
    store,
    {
      target_agent: state.agent,
      status: ["queued", "running", "needs_input", "cancel_requested", "retrying"],
      detail: "status",
      limit: 10,
    },
    context(),
  );
  const taskInbox = compactTaskInbox(rawTaskInbox);
  const rawOrchestration = orchestrationStatus(store);
  const orchestration = compactOrchestration(rawOrchestration, reconciledTasks);
  const session = {
    agent: state.agent,
    sessionId: state.sessionId,
    task,
    contextKey: stableKey || undefined,
  };
  const index = {
    schemaVersion: status.schemaVersion,
    lastIndexedAt: status.lastIndexedAt,
    files: status.files,
    nodes: status.nodes,
    edges: status.edges,
    activeClaims: status.activeClaims,
  };
  const detailsAvailableVia = [
    "graph_search",
    "get_node",
    "trace_relationships",
    "impact_analysis",
    "active_work",
    "get_delegated_task",
  ];

  const work = compactWork(
    activeWork(store, { includeHistory: true, historyLimit: 1 }),
  );
  const previousSnapshot = state.contextSnapshot;
  if (contextMode !== "bootstrap" && previousSnapshot) {
    if (work.latestDecision?.id === previousSnapshot.latestDecisionId) {
      work.latestDecision = null;
    }
    if (work.latestHandoff?.id === previousSnapshot.latestHandoffId) {
      work.latestHandoff = null;
    }
  }
  const search =
    contextMode === "reuse"
      ? { query: task, resultCount: 0, results: [], relations: [] }
      : compactSearch(
          graphSearch(store, {
            query: task,
            max_results: Math.min(
              Math.max(
                Number(input.max_results) || SESSION_CONTEXT_DEFAULT_RESULTS,
                1,
              ),
              6,
            ),
            max_hops: Math.min(Math.max(Number(input.max_hops) || 0, 0), 1),
            max_relations: 6,
            include_metadata: false,
          }),
        );
  state.deliveredContextTasks.add(taskKey);
  state.contextBootstrapDelivered = true;
  state.contextSnapshot = sessionSnapshot(
    compactWork(activeWork(store, { includeHistory: true, historyLimit: 1 })),
  );
  return withSessionBudget({
    session,
    contextMode,
    contextAlreadyProvided: contextMode === "reuse",
    message:
      contextMode === "reuse"
        ? "Contexto reutilizado; solo se entregan coordinación y estados actuales."
        : contextMode === "delta"
          ? "La sesión ya estaba inicializada; se entrega contexto relevante de la nueva tarea y solo novedades globales."
          : undefined,
    automaticIndexing: {
      atSessionStart: true,
      atSessionEnd: true,
      refresh: {
        ok: refresh.ok,
        skipped: Boolean(refresh.skipped),
        changedFiles: refresh.changedFiles ?? 0,
        removedFiles: refresh.removedFiles ?? 0,
        durationMs: refresh.durationMs ?? 0,
        reason: refresh.reason,
        error: refresh.error ? clipText(refresh.error, 240) : undefined,
      },
    },
    index,
    coordination: work,
    taskInbox,
    orchestration,
    relevantContext: search,
    requiredNextActions:
      contextMode === "reuse"
        ? [
            "Reutilizar el contexto ya recibido.",
            "Consultar detalle únicamente si cambió el estado o falta evidencia.",
          ]
        : [
            "Verificar en el código las citas relevantes.",
            state.delegatedTaskId
              ? "El runner ya reservó el ámbito; no lo reclames de nuevo."
              : "Reclamar el ámbito mínimo antes de editar.",
            "Al terminar: actualizar el índice, publicar handoff y liberar el claim.",
          ],
    detailsAvailableVia,
  });
}

function sessionInstructions(refresh, work) {
  const otherAgents = work.agents
    .filter((agent) => agent.sessionId !== state.sessionId)
    .slice(0, 3)
    .map((agent) => `${agent.name}:${agent.status}`);
  const claims = work.claims
    .slice(0, 5)
    .map((claim) => `${claim.agent}:${claim.scope}`);
  const latestHandoff = work.handoffs[0]?.summary?.slice(0, 300);
  const inbox = listDelegatedTasks(
    store,
    {
      target_agent: state.agent,
      status: ["queued", "running", "needs_input"],
      limit: 10,
    },
    context(),
  ).tasks;
  return [
    baseInstructions,
    refresh.ok
      ? `Bootstrap automático: ${refresh.files} archivos, ${refresh.nodes} nodos y ${refresh.edges} relaciones; ${refresh.changedFiles} archivos actualizados.`
      : `Aviso: la actualización automática falló (${refresh.error}); usa refresh_index antes de trabajar.`,
    otherAgents.length ? `Otros agentes recientes: ${otherAgents.join(", ")}.` : "No hay otro agente reciente.",
    claims.length ? `Ámbitos activos: ${claims.join(", ")}.` : "No hay ámbitos reclamados.",
    latestHandoff ? `Último handoff: ${latestHandoff}` : "No hay handoffs previos.",
    inbox.length
      ? `Bandeja delegada: ${inbox.length} tarea(s); revísalas con list_delegated_tasks.`
      : "No hay tareas delegadas pendientes para esta sesión.",
  ].join(" ");
}

function handleInitialize(message) {
  state.clientInfo = message.params?.clientInfo ?? {};
  state.agent = TRUSTED_AGENTS.has(process.env.NIDOKEY_GRAPH_AGENT)
    ? process.env.NIDOKEY_GRAPH_AGENT
    : "unknown";
  state.startupRefresh = refreshSafely();
  reconcileExpiredTasks(store);
  const registration = registerAgent(store, {
    agent: state.agent,
    client_name: state.clientInfo.name,
    client_version: state.clientInfo.version,
    task: "MCP session",
    delegated_task_id: state.delegatedTaskId,
    metadata: {
      transport: "stdio",
      delegatedTaskId: state.delegatedTaskId,
      backgroundRunId: process.env.NIDOKEY_GRAPH_RUN_ID ?? null,
    },
  });
  state.sessionId = registration.sessionId;
  state.initialized = true;
  const work = activeWork(store, { includeHistory: true, historyLimit: 1 });
  return {
    protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions: sessionInstructions(state.startupRefresh, work),
  };
}

function handleToolCall(name, input) {
  if (!state.sessionId) {
    const registration = registerAgent(store, {
      agent: state.agent,
      client_name: state.clientInfo.name,
      client_version: state.clientInfo.version,
      task: "MCP session",
      delegated_task_id: state.delegatedTaskId,
    });
    state.sessionId = registration.sessionId;
  }
  if (PRIVILEGED_TOOLS.has(name) && !TRUSTED_AGENTS.has(state.agent)) {
    throw new Error(
      "Esta operación requiere una identidad fijada por la configuración del servidor",
    );
  }
  touchAgent(store, context(), name);
  switch (name) {
    case "session_context":
      return sessionContext(input);
    case "delegate_task": {
      const delegated = delegateTask(store, context(), input);
      const dispatch =
        delegated.created && state.delegatedTaskId
          ? dispatchEligibleTasks(store)
          : { launched: [] };
      const { task: _fullTask, ...delegatedState } = delegated;
      return {
        ...delegatedState,
        task: getDelegatedTask(store, delegated.task.id, { detail: "status" }).task,
        dispatch,
      };
    }
    case "list_delegated_tasks":
      return listDelegatedTasks(
        store,
        {
          ...input,
          mine: input.mine !== false,
          detail: input.detail ?? "status",
          limit: input.limit ?? 10,
        },
        context(),
      );
    case "get_delegated_task":
      return getDelegatedTask(store, input.task_id, {
        detail: input.detail ?? "status",
      });
    case "claim_delegated_task": {
      const claimed = claimDelegatedTask(store, context(), input);
      const { task: _fullTask, ...claimState } = claimed;
      return {
        ...claimState,
        ...(claimed.task
          ? {
              task: getDelegatedTask(store, claimed.task.id, {
                detail: "status",
              }).task,
            }
          : {}),
      };
    }
    case "complete_delegated_task": {
      const completed = completeDelegatedTask(store, context(), input);
      const { task: _fullTask, ...completionState } = completed;
      return {
        ...completionState,
        task: getDelegatedTask(store, completed.task.id, {
          detail: "status",
        }).task,
        dispatch: dispatchEligibleTasks(store),
      };
    }
    case "cancel_delegated_task": {
      const cancelled = cancelDelegatedTask(store, context(), input);
      const { task: _fullTask, ...cancellationState } = cancelled;
      return {
        ...cancellationState,
        ...(cancelled.task
          ? {
              task: getDelegatedTask(store, cancelled.task.id, {
                detail: "status",
              }).task,
            }
          : {}),
        dispatch: dispatchEligibleTasks(store),
      };
    }
    case "dispatch_tasks":
      if (input.confirm_quota_use !== true) {
        throw new Error("confirm_quota_use=true es obligatorio");
      }
      return {
        ...authorizeBackgroundTasks(store, context(), input.task_ids),
        ...dispatchEligibleTasks(store, { maximum: input.maximum }),
      };
    case "orchestration_status":
      reconcileExpiredTasks(store);
      return { ...orchestrationStatus(store), executors: executorAvailability() };
    case "graph_status":
      return graphStatus(store);
    case "refresh_index":
      state.indexChecked = true;
      return refreshIndex(store, { force: Boolean(input.force) });
    case "graph_search":
      ensureIndex();
      return graphSearch(store, input);
    case "get_node":
      ensureIndex();
      return findNode(store, input);
    case "trace_relationships":
      ensureIndex();
      return traceRelationships(store, input);
    case "impact_analysis":
      ensureIndex();
      return impactAnalysis(store, input);
    case "active_work": {
      const includeHistory = input.include_history === true;
      const work = activeWork(store, {
        includeHistory,
        historyLimit: input.history_limit ?? 1,
      });
      const delegation = listDelegatedTasks(
        store,
        {
          status: ["queued", "running", "needs_input", "cancel_requested", "retrying"],
          detail: "status",
          limit: 10,
        },
        context(),
      );
      return compactActiveWork(
        work,
        delegation,
        orchestrationStatus(store),
        input,
      );
    }
    case "claim_scope":
      ensureIndex();
      return claimScope(store, context(), input);
    case "release_claim":
      return releaseClaim(store, context(), input);
    case "record_decision":
      ensureIndex();
      return recordDecision(store, context(), input);
    case "publish_handoff":
      ensureIndex();
      return publishHandoff(store, context(), input);
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

function handleRequest(message) {
  const { id, method } = message;
  if (method === "initialize") {
    writeMessage({ jsonrpc: "2.0", id, result: handleInitialize(message) });
    return;
  }
  if (method === "ping") {
    writeMessage({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    writeMessage({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }
  if (method === "tools/call") {
    const name = message.params?.name;
    const input = message.params?.arguments ?? {};
    try {
      writeMessage({
        jsonrpc: "2.0",
        id,
        result: resultText(name, handleToolCall(name, input), input),
      });
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: error?.stack ?? error?.message ?? String(error) }],
        },
      });
    }
    return;
  }
  if (method?.startsWith("notifications/")) return;
  errorResponse(id, -32601, `Método no soportado: ${method}`);
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    errorResponse(null, -32700, "JSON inválido", error.message);
    return;
  }
  try {
    handleRequest(message);
  } catch (error) {
    if (message.id !== undefined) {
      errorResponse(message.id, -32603, error.message, error.stack);
    }
  }
});

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  refreshSafely();
  if (state.sessionId) releaseManualSessionTasks(store, context());
  if (state.sessionId) releaseSessionClaims(store, context());
  store.close();
}

input.on("close", () => {
  cleanup();
});
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("uncaughtException", (error) => {
  process.stderr.write(`[${SERVER_NAME}] ${error.stack ?? error.message}\n`);
  cleanup();
  process.exit(1);
});
