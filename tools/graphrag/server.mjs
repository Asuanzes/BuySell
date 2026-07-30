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
const SERVER_VERSION = "0.4.1";
const SESSION_CONTEXT_MAX_CHARACTERS = 6000;
const SESSION_CONTEXT_DEFAULT_RESULTS = 4;
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
};

const baseInstructions = [
  "Grafo local compartido de Nidokey para Codex y Claude Code.",
  "PRIMERA ACCIÓN OBLIGATORIA de cada tarea: llama session_context con el objetivo actual; evita releer todo el repositorio.",
  "Revisa taskInbox: puedes reclamar una tarea recibida o delegar trabajo no solapado al otro agente.",
  "Antes de editar: revisa el trabajo activo devuelto y reclama el ámbito mínimo con claim_scope.",
  "No edites un ámbito reclamado por otra sesión.",
  "Usa graph_search/trace_relationships para localizar contexto y verifica siempre las citas en el código.",
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
          items: { type: "string" },
          maxItems: 30,
          default: [],
        },
        mode: { type: "string", enum: ["analyze", "edit"], default: "analyze" },
        priority: { type: "integer", minimum: 0, maximum: 3, default: 1 },
        depends_on: { type: "array", items: { type: "string" }, default: [] },
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
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
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
      properties: { task_id: { type: "string", minLength: 1 } },
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
        summary: { type: "string", minLength: 1, maxLength: 16000 },
        changed_paths: { type: "array", items: { type: "string" }, default: [] },
        tests: { type: "array", items: { type: "string" }, default: [] },
        next_steps: { type: "array", items: { type: "string" }, default: [] },
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
        max_results: { type: "integer", minimum: 1, maximum: 20, default: 8 },
        max_hops: { type: "integer", minimum: 0, maximum: 3, default: 1 },
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
      properties: { reference: { type: "string", minLength: 1 } },
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
      "Muestra agentes activos, ámbitos reclamados, decisiones y handoffs recientes para coordinar trabajo paralelo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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

function resultText(value) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text: text.length > 48000 ? `${text.slice(0, 48000)}\n…truncated` : text }],
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

function withSessionBudget(payload) {
  let squeezed = false;
  const measure = () => JSON.stringify(payload, null, 2).length;
  payload.responseBudget = {
    mode: "compact",
    maxCharacters: SESSION_CONTEXT_MAX_CHARACTERS,
    actualCharacters: 0,
    approximateTokens: 0,
    squeezed: false,
  };
  payload.responseBudget.actualCharacters = measure();
  payload.responseBudget.approximateTokens = Math.ceil(
    payload.responseBudget.actualCharacters / 4,
  );

  if (measure() > SESSION_CONTEXT_MAX_CHARACTERS) {
    squeezed = true;
    payload.relevantContext.results = payload.relevantContext.results
      .slice(0, 2)
      .map((item) => ({ ...item, excerpt: clipText(item.excerpt, 240) }));
    payload.relevantContext.relations = [];
    payload.coordination.agents = payload.coordination.agents.slice(0, 2);
    payload.coordination.claims = payload.coordination.claims.slice(0, 3);
    if (payload.coordination.latestDecision) {
      payload.coordination.latestDecision.rationale = clipText(
        payload.coordination.latestDecision.rationale,
        160,
      );
    }
    if (payload.coordination.latestHandoff) {
      payload.coordination.latestHandoff.summary = clipText(
        payload.coordination.latestHandoff.summary,
        220,
      );
    }
    payload.taskInbox.tasks = payload.taskInbox.tasks.slice(0, 3);
    payload.orchestration.activeRuns = payload.orchestration.activeRuns.slice(0, 2);
  }

  payload.responseBudget.squeezed = squeezed;
  payload.responseBudget.actualCharacters = measure();
  payload.responseBudget.approximateTokens = Math.ceil(
    payload.responseBudget.actualCharacters / 4,
  );
  if (measure() > SESSION_CONTEXT_MAX_CHARACTERS) {
    const citations = payload.relevantContext.results.slice(0, 3).map((item) => ({
      citation: item.citation,
      name: item.name,
    }));
    return withSessionBudget({
      session: payload.session,
      contextAlreadyProvided: payload.contextAlreadyProvided ?? false,
      index: payload.index,
      coordination: {
        agents: payload.coordination.agents.slice(0, 2),
        claims: payload.coordination.claims.slice(0, 2),
        latestDecision: payload.coordination.latestDecision
          ? {
              id: payload.coordination.latestDecision.id,
              title: payload.coordination.latestDecision.title,
            }
          : null,
        latestHandoff: payload.coordination.latestHandoff
          ? {
              id: payload.coordination.latestHandoff.id,
              summary: clipText(payload.coordination.latestHandoff.summary, 160),
            }
          : null,
      },
      taskInbox: {
        count: payload.taskInbox.count,
        tasks: payload.taskInbox.tasks.slice(0, 2),
      },
      orchestration: {
        backgroundEnabled: payload.orchestration.backgroundEnabled,
        counts: payload.orchestration.counts,
        activeRuns: payload.orchestration.activeRuns.slice(0, 1),
      },
      relevantContext: { citations },
      requiredNextActions: payload.requiredNextActions.slice(0, 3),
      detailsAvailableVia: payload.detailsAvailableVia,
    });
  }
  return payload;
}

function sessionContext(input) {
  const task = clipText(input.task, 1000);
  if (!task) throw new Error("task es obligatorio");
  const taskKey = task.toLowerCase();
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
    { mine: true, limit: 20 },
    context(),
  );
  const taskInbox = compactTaskInbox(rawTaskInbox);
  const rawOrchestration = orchestrationStatus(store);
  const orchestration = compactOrchestration(rawOrchestration, reconciledTasks);
  const session = {
    agent: state.agent,
    sessionId: state.sessionId,
    task,
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

  if (state.deliveredContextTasks.has(taskKey)) {
    return withSessionBudget({
      session,
      contextAlreadyProvided: true,
      message:
        "Este contexto ya se entregó en esta sesión; reutiliza el resultado anterior y amplía solo bajo demanda.",
      automaticIndexing: {
        atSessionStart: true,
        atSessionEnd: true,
        refresh,
      },
      index,
      coordination: {
        agents: [],
        claims: [],
        latestDecision: null,
        latestHandoff: null,
      },
      taskInbox,
      orchestration,
      relevantContext: { query: task, resultCount: 0, results: [], relations: [] },
      requiredNextActions: [
        "Reutilizar el contexto ya recibido.",
        "Ampliar únicamente con una herramienta de detalle si falta evidencia.",
      ],
      detailsAvailableVia,
    });
  }

  const work = compactWork(activeWork(store));
  const search = compactSearch(
    graphSearch(store, {
      query: task,
      max_results: Math.min(
        Math.max(Number(input.max_results) || SESSION_CONTEXT_DEFAULT_RESULTS, 1),
        6,
      ),
      max_hops: Math.min(Math.max(Number(input.max_hops) || 0, 0), 1),
    }),
  );
  state.deliveredContextTasks.add(taskKey);
  return withSessionBudget({
    session,
    contextAlreadyProvided: false,
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
    requiredNextActions: [
      "Verificar en el código las citas relevantes.",
      "Ampliar solo si hace falta con graph_search, trace_relationships o impact_analysis.",
      state.delegatedTaskId
        ? "El runner ya reservó el ámbito de esta tarea; no vuelvas a reclamarlo."
        : "Ejecutar claim_scope sobre el ámbito mínimo antes de editar.",
      "Al terminar: refresh_index, registrar decisiones no triviales, publicar handoff y liberar el claim.",
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
  const work = activeWork(store);
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
      return { ...delegated, dispatch };
    }
    case "list_delegated_tasks":
      return listDelegatedTasks(store, input, context());
    case "get_delegated_task":
      return getDelegatedTask(store, input.task_id);
    case "claim_delegated_task":
      return claimDelegatedTask(store, context(), input);
    case "complete_delegated_task": {
      const completed = completeDelegatedTask(store, context(), input);
      return { ...completed, dispatch: dispatchEligibleTasks(store) };
    }
    case "cancel_delegated_task": {
      const cancelled = cancelDelegatedTask(store, context(), input);
      return { ...cancelled, dispatch: dispatchEligibleTasks(store) };
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
    case "active_work":
      return {
        ...activeWork(store),
        delegation: listDelegatedTasks(store, { limit: 30 }, context()),
        orchestration: orchestrationStatus(store),
      };
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
      writeMessage({ jsonrpc: "2.0", id, result: resultText(handleToolCall(name, input)) });
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
