import crypto from "node:crypto";
import path from "node:path";
import { nowIso } from "./store.mjs";
import { redactObviousSecrets } from "./executors.mjs";

const HOST_ASSOCIATION_WINDOW_MS = 10 * 60 * 1000;
const DELIVERED_TASK_STATUSES = new Set(["succeeded", "needs_input"]);
const STARTED_TASK_STATUSES = new Set(["running", "succeeded", "needs_input"]);

const CRITICAL_SIGNALS = [
  ["security", /\b(seguridad|security|vulnerab\w*|auth(?:entication|orization)?|autentic\w*|autoriz\w*|oauth|login|permission\w*|permisos?|secret\w*|token\w*|cifrad\w*|encrypt\w*)\b/],
  ["payments", /\b(pagos?|payments?|stripe|billing|checkout|factur\w*|monetiz\w*|suscrip\w*)\b/],
  ["database-schema", /\b(base\s+de\s+datos|databases?|db|schema|esquema|sql|sqlite|postgres\w*|supabase|prisma|migraci\w*|migrations?)\b/],
  ["deploy-infrastructure", /\b(deploy\w*|desplieg\w*|infraestructur\w*|infrastructure|ci\s*\/?\s*cd|production|produccion|docker|kubernetes|terraform|cloudflare|vercel|eas\s+build|app\s+store|play\s+store)\b/],
  ["realtime-messaging", /\b(real[ -]?time|tiempo\s+real|mensajeri\w*|messaging|chats?|websockets?|sockets?|push\s+notifications?|notificaciones?\s+push)\b/],
  ["scraping", /\b(scrap\w*|crawlers?|crawling|extraccion\s+web|web\s+extraction|portales?\s+inmobiliarios?)\b/],
  ["artificial-intelligence", /\b(inteligencia\s+artificial|artificial\s+intelligence|machine\s+learning|llms?|embeddings?|vector\s+search|graph\s*rag|rag|mcp|agentes?\s+de\s+ia|ai\s+agents?)\b/],
  ["catastro", /\b(catastro|catastral\w*|cadastral\w*|referencia\s+catastral|ovc|cartociudad)\b/],
  ["ship-release", /\b(ship|shipping|release|releasing|publicar\w*|lanzar\w*|puesta\s+en\s+produccion)\b/],
  ["adversarial-review", /\b(adversarial|abversarial|revision\s+adversarial|red\s+team|threat\s+model)\b/],
];

const SUBSTANTIAL_SIGNAL = /\b(implement\w*|fix\w*|arregl\w*|corr(?:eg|ig)\w*|bugs?|fallos?|refactor\w*|anad\w*|agreg\w*|crear\w*|crea\w*|constru\w*|build\w*|mejor\w*|optimiz\w*|analiz\w*|analisis|revis\w*|audit\w*|investig\w*|explor\w*|compar\w*|plan\w*|complet\w*|termin\w*|integr\w*|desarroll\w*|modific\w*|cambi\w*|elimin\w*|borr\w*|reemplaz\w*|actualiz\w*|add|create|improve|analyze|analysis|review|audit|research|explore|compare|plan|complete|finish|integrate|develop|modify|change|delete|remove|replace|update)\b/;
const NONTRIVIAL_ACTION = /\b(implement\w*|bugs?|fallos?|refactor\w*|anad\w*|agreg\w*|crear\w*|crea\w*|constru\w*|build\w*|mejor\w*|optimiz\w*|analiz(?:a|ar|ad|and|e|o)\w*|revis(?:a|ar|ad|and|e|o)\w*|audit(?:a|ar|ad|and|e|o)\w*|investig(?:a|ar|ad|and|e|o)\w*|explor(?:a|ar|ad|and|e|o)\w*|compar(?:a|ar|ad|and|e|o)\w*|planific\w*|complet\w*|termin\w*|integr\w*|desarroll\w*|modific\w*|elimin\w*|borr\w*|reemplaz\w*|actualiz\w*|migr\w*|deploy\w*|add|create|improve|analyze|review|audit|research|explore|compare|plan|complete|finish|integrate|develop|modify|delete|remove|replace|update|migrate)\b/;
const NONTRIVIAL_FIX = /\b(?:fix\w*|arregl\w*|corr(?:eg|ig)\w*)\b[\s\S]*\b(?:bugs?|fallos?|errores?|vulnerab\w*|componentes?|funciones?|codigo|code|apis?|endpoints?|logica|logic|bases?\s+de\s+datos|databases?)\b/;

const PROMPT_WRITING = /(?:\b(?:escribe|redacta|crea|haz|dame|genera|prepara|mejora|optimiza|refactoriza|corrige|revisa)\b[\s\S]{0,60}\bprompt\b|\bprompt\b[\s\S]{0,40}\bpara\s+(?:claude|codex)\b|\binstrucciones?\s+para\s+(?:claude|codex)\b|\bsystem\s+prompt\b)/;
const STATUS_REQUEST = /(?:\b(estado|status|progreso|como\s+va|que\s+esta\s+haciendo|esta\s+trabajando|sigue\s+trabajando|limites?\s+de\s+uso|usage\s+limits?)\b|\b(?:comprueba|verifica|confirma|muestra)\b[\s\S]{0,80}\b(?:codex|claude(?:\s+code)?|agente|tarea|workflow)\b[\s\S]{0,80}\b(?:trabaj\w*|deleg\w*|ejecut\w*|activo|en\s+curso)\b)/;
const SUMMARY_REQUEST = /\b(?:dame|necesito|quiero|muestra|haz)\s+(?:un\s+)?(?:resumen|summary)\b/;
const DOC_TYPO = /\b(typos?|erratas?|ortografia|spelling|formato|formatting)\b[\s\S]*\b(documentacion|documentation|docs?|readme|comentarios?|comments?)\b|\b(documentacion|documentation|docs?|readme|comentarios?|comments?)\b[\s\S]*\b(typos?|erratas?|ortografia|spelling|formato|formatting)\b/;
const EXPLANATORY_QUESTION = /^(?:\?|¿)?\s*(?:(?:puedes|podrias|me\s+puedes|me\s+podrias|necesito\s+(?:que\s+me\s+)?|quiero\s+(?:que\s+me\s+)?)\s+)?(?:que|como|por\s+que|para\s+que|cual|cuando|donde|quien|explica(?:me)?|expliques?|describe|what|how|why|when|where|who|explain|describe)(?:\s|[?:,.!]|$)/;
const ACKNOWLEDGEMENT = /^(?:hola|buenas|gracias|muchas\s+gracias|si|no|vale|ok(?:ay)?|perfecto|de\s+acuerdo|entendido|continua|sigue|adelante)[.! ]*$/;
const MECHANICAL_COPY_EDIT = /\b(?:cambia|corrige|ajusta|update|change|fix)\b[\s\S]*\b(?:coma|punto|mayuscula|minuscula|texto|copy|readme|docs?|documentacion|comentario)\b/;

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasFollowupTechnicalAction(text) {
  return text
    .split(/(?:[.;]\s+|\b(?:y|e|pero|ademas|tambien|luego|despues)\b)/)
    .slice(1)
    .some((segment) =>
      NONTRIVIAL_ACTION.test(segment) || NONTRIVIAL_FIX.test(segment),
    );
}

function boundedRedactedText(value, maximum = 4000) {
  const text = redactObviousSecrets(String(value ?? "")).trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function contextSessionId(context = {}) {
  return String(context.sessionId ?? context.session_id ?? context.graphSessionId ?? "").trim();
}

function contextHostSessionId(context = {}) {
  return String(context.hostSessionId ?? context.host_session_id ?? "").trim();
}

function contextKeyFor(task, value) {
  const explicit = String(value ?? "").trim();
  if (explicit) return explicit.slice(0, 200);
  return `task:${crypto.createHash("sha256").update(String(task)).digest("hex").slice(0, 24)}`;
}

function pathKey(value) {
  const resolved = path.resolve(String(value ?? "."));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function cwdBelongsToProject(cwd, root) {
  const candidate = pathKey(cwd);
  const project = pathKey(root);
  return candidate === project || candidate.startsWith(`${project}${path.sep}`);
}

function addActivity(store, agent, sessionId, action, payload = {}) {
  store.db
    .prepare(`
      INSERT INTO activity(agent, session_id, action, payload_json, created_at)
      VALUES(?, ?, ?, ?, ?)
    `)
    .run(agent ?? "claude-code", sessionId ?? null, action, JSON.stringify(payload), nowIso());
}

function hydrateHost(row) {
  if (!row) return null;
  return {
    hostSessionId: row.host_session_id,
    cwd: row.cwd,
    latestPrompt: row.latest_prompt,
    promptGeneration: row.prompt_generation,
    graphSessionId: row.graph_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateRequirement(row) {
  if (!row) return null;
  return {
    id: row.id,
    graphSessionId: row.graph_session_id,
    hostSessionId: row.host_session_id,
    contextKey: row.context_key,
    task: row.task,
    classification: row.classification,
    reason: row.reason,
    required: Boolean(row.required),
    peerTaskId: row.peer_task_id,
    state: row.state,
    reviewedAt: row.reviewed_at,
    handoffId: row.handoff_id,
    lastMutationAt: row.last_mutation_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hostForGraphSession(store, context) {
  const graphSessionId = contextSessionId(context);
  const explicitHostSessionId = contextHostSessionId(context);
  if (explicitHostSessionId) {
    const explicit = store.db
      .prepare("SELECT * FROM collaboration_hosts WHERE host_session_id = ?")
      .get(explicitHostSessionId);
    return explicit ?? null;
  }

  const linked = store.db
    .prepare(`
      SELECT * FROM collaboration_hosts
      WHERE graph_session_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `)
    .get(graphSessionId);
  if (linked) return linked;

  const cutoff = new Date(Date.now() - HOST_ASSOCIATION_WINDOW_MS).toISOString();
  return store.db
    .prepare(`
      SELECT * FROM collaboration_hosts
      WHERE graph_session_id IS NULL AND updated_at >= ?
      ORDER BY updated_at DESC LIMIT 20
    `)
    .all(cutoff)
    .find((host) => cwdBelongsToProject(host.cwd, store.root)) ?? null;
}

function resolveRequirementRow(store, selector = {}) {
  if (!selector) return null;
  if (typeof selector === "string") {
    return (
      store.db.prepare("SELECT * FROM collaboration_requirements WHERE id = ?").get(selector) ??
      store.db
        .prepare(`
          SELECT * FROM collaboration_requirements
          WHERE host_session_id = ? OR graph_session_id = ? OR peer_task_id = ?
          ORDER BY updated_at DESC LIMIT 1
        `)
        .get(selector, selector, selector) ??
      null
    );
  }

  const requirementId = selector.requirementId ?? selector.requirement_id ??
    (selector.classification && selector.id ? selector.id : null);
  if (requirementId) {
    return store.db
      .prepare("SELECT * FROM collaboration_requirements WHERE id = ?")
      .get(requirementId) ?? null;
  }

  const peerTaskId = selector.peerTaskId ?? selector.peer_task_id;
  if (peerTaskId) {
    return store.db
      .prepare(`
        SELECT * FROM collaboration_requirements
        WHERE peer_task_id = ? ORDER BY updated_at DESC LIMIT 1
      `)
      .get(peerTaskId) ?? null;
  }

  const hostSessionId = contextHostSessionId(selector);
  if (hostSessionId) {
    return store.db
      .prepare(`
        SELECT * FROM collaboration_requirements
        WHERE host_session_id = ? ORDER BY updated_at DESC LIMIT 1
      `)
      .get(hostSessionId) ?? null;
  }

  const graphSessionId = contextSessionId(selector);
  const contextKey = selector.contextKey ?? selector.context_key;
  if (graphSessionId && contextKey) {
    return store.db
      .prepare(`
        SELECT * FROM collaboration_requirements
        WHERE graph_session_id = ? AND context_key = ?
      `)
      .get(graphSessionId, contextKey) ?? null;
  }
  if (graphSessionId) {
    return store.db
      .prepare(`
        SELECT * FROM collaboration_requirements
        WHERE graph_session_id = ? ORDER BY updated_at DESC LIMIT 1
      `)
      .get(graphSessionId) ?? null;
  }
  return null;
}

export function classifyCollaborationTask(task) {
  const text = normalizedText(task);
  const hasFollowupAction = hasFollowupTechnicalAction(text);
  if (ACKNOWLEDGEMENT.test(text)) {
    return {
      classification: "trivial",
      required: false,
      reason: "Confirmacion conversacional sin trabajo nuevo",
    };
  }
  if (PROMPT_WRITING.test(text) && !hasFollowupAction) {
    return {
      classification: "trivial",
      required: false,
      reason: "Solicitud limitada a redactar un prompt",
    };
  }
  if (STATUS_REQUEST.test(text) && !hasFollowupAction) {
    return {
      classification: "trivial",
      required: false,
      reason: "Consulta de estado sin cambios solicitados",
    };
  }
  if (EXPLANATORY_QUESTION.test(text) && !hasFollowupAction) {
    return {
      classification: "trivial",
      required: false,
      reason: "Pregunta puramente explicativa",
    };
  }
  if ((DOC_TYPO.test(text) || MECHANICAL_COPY_EDIT.test(text)) && !hasFollowupAction) {
    return {
      classification: "trivial",
      required: false,
      reason: "Correccion mecanica de texto, erratas o formato",
    };
  }
  if (SUMMARY_REQUEST.test(text) && !hasFollowupAction) {
    return {
      classification: "trivial",
      required: false,
      reason: "Solicitud de resumen sin cambios solicitados",
    };
  }
  for (const [domain, pattern] of CRITICAL_SIGNALS) {
    if (pattern.test(text)) {
      return {
        classification: "critical",
        required: true,
        reason: `Dominio critico detectado: ${domain}`,
      };
    }
  }
  if (SUBSTANTIAL_SIGNAL.test(text)) {
    return {
      classification: "substantial",
      required: true,
      reason: "Trabajo de analisis o cambio sustancial detectado",
    };
  }
  if (text.length <= 40) {
    return {
      classification: "trivial",
      required: false,
      reason: "Mensaje breve sin una accion tecnica identificable",
    };
  }
  return {
    classification: "substantial",
    required: true,
    reason: "Solicitud ambigua: la politica fail-closed exige colaboracion",
  };
}

export function upsertHostPrompt(store, input = {}) {
  const hostSessionId = String(
    input.hostSessionId ?? input.host_session_id ?? input.sessionId ?? input.session_id ?? "",
  ).trim();
  if (!hostSessionId) throw new Error("host_session_id es obligatorio");
  const cwd = path.resolve(String(input.cwd ?? store.root));
  const prompt = boundedRedactedText(
    input.prompt ?? input.latestPrompt ?? input.latest_prompt,
  );
  if (!prompt) throw new Error("prompt es obligatorio");
  const timestamp = nowIso();

  store.withImmediateTransaction(() => {
    const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    store.db
      .prepare(`
        DELETE FROM collaboration_requirements
        WHERE updated_at < ? AND state IN ('completed', 'exempt')
      `)
      .run(retentionCutoff);
    store.db
      .prepare("DELETE FROM collaboration_hosts WHERE updated_at < ?")
      .run(retentionCutoff);
    store.db
      .prepare(`
        INSERT INTO collaboration_hosts(
          host_session_id, cwd, latest_prompt, prompt_generation,
          graph_session_id, created_at, updated_at
        ) VALUES(?, ?, ?, 1, NULL, ?, ?)
        ON CONFLICT(host_session_id) DO UPDATE SET
          cwd = excluded.cwd,
          latest_prompt = excluded.latest_prompt,
          prompt_generation = collaboration_hosts.prompt_generation + 1,
          graph_session_id = NULL,
          updated_at = excluded.updated_at
      `)
      .run(hostSessionId, cwd, prompt, timestamp, timestamp);
    addActivity(store, "claude-code", null, "collaboration_host_prompt", {
      hostSessionId,
      classification: classifyCollaborationTask(prompt).classification,
    });
  });
  return hydrateHost(
    store.db
      .prepare("SELECT * FROM collaboration_hosts WHERE host_session_id = ?")
      .get(hostSessionId),
  );
}

export function upsertRequirement(store, context, input = {}) {
  const graphSessionId = contextSessionId(context);
  if (!graphSessionId) throw new Error("graph session_id es obligatorio");
  const task = boundedRedactedText(input.task);
  if (!task) throw new Error("task es obligatorio");
  const host = hostForGraphSession(store, context);
  if (contextHostSessionId(context) && !host) {
    throw new Error(
      "host_session_id no registrado: el hook UserPromptSubmit debe ejecutarse antes de session_context",
    );
  }
  const baseContextKey = contextKeyFor(
    task,
    input.contextKey ?? input.context_key,
  );
  const contextKey = host
    ? `${baseContextKey}@prompt:${host.prompt_generation}`
    : baseContextKey;
  const detected = classifyCollaborationTask(
    host?.latest_prompt ? `${host.latest_prompt}\n${task}` : task,
  );
  const timestamp = nowIso();
  let requirementId;

  store.withImmediateTransaction(() => {
    const existingForGraph = store.db
      .prepare(`
        SELECT * FROM collaboration_requirements
        WHERE graph_session_id = ? AND context_key = ?
      `)
      .get(graphSessionId, contextKey);
    const existingForHost = host
      ? store.db
          .prepare(`
            SELECT * FROM collaboration_requirements
            WHERE host_session_id = ? AND context_key = ?
            ORDER BY updated_at DESC LIMIT 1
          `)
          .get(host.host_session_id, contextKey)
      : null;
    const existing = existingForGraph ?? existingForHost ?? null;
    const required = Boolean(existing?.required || detected.required);
    const classification = existing?.required && !detected.required
      ? {
          classification: existing.classification,
          required: true,
          reason: existing.reason,
        }
      : detected;
    requirementId = existing?.id ?? crypto.randomUUID();
    const initialState = required ? "awaiting_peer" : "exempt";

    if (host) {
      const explicitHost = Boolean(contextHostSessionId(context));
      store.db
        .prepare(`
          UPDATE collaboration_hosts
          SET graph_session_id = ?, updated_at = ?
          WHERE host_session_id = ?
            AND (? = 1 OR graph_session_id IS NULL OR graph_session_id = ?)
        `)
        .run(
          graphSessionId,
          timestamp,
          host.host_session_id,
          explicitHost ? 1 : 0,
          graphSessionId,
        );
    }
    if (existing) {
      store.db
        .prepare(`
          UPDATE collaboration_requirements
          SET graph_session_id = ?,
              host_session_id = COALESCE(?, host_session_id),
              task = ?, classification = ?, reason = ?, required = ?,
              state = CASE
                WHEN ? = 0 THEN 'exempt'
                WHEN peer_task_id IS NULL THEN 'awaiting_peer'
                ELSE state
              END,
              updated_at = ?
          WHERE id = ?
        `)
        .run(
          graphSessionId,
          host?.host_session_id ?? null,
          task,
          classification.classification,
          classification.reason,
          required ? 1 : 0,
          required ? 1 : 0,
          timestamp,
          requirementId,
        );
    } else {
      store.db
        .prepare(`
          INSERT INTO collaboration_requirements(
            id, graph_session_id, host_session_id, context_key, task,
            classification, reason, required, peer_task_id, state,
            reviewed_at, handoff_id, last_mutation_at, created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)
        `)
        .run(
          requirementId,
          graphSessionId,
          host?.host_session_id ?? null,
          contextKey,
          task,
          classification.classification,
          classification.reason,
          required ? 1 : 0,
          initialState,
          timestamp,
          timestamp,
        );
    }
    store.db
      .prepare(`
        UPDATE agent_sessions SET current_task = ?, last_seen_at = ? WHERE session_id = ?
      `)
      .run(task, timestamp, graphSessionId);
    if (context.agent) {
      store.db
        .prepare(`
          UPDATE agents SET current_task = ?, last_seen_at = ?
          WHERE name = ? AND session_id = ?
        `)
        .run(task, timestamp, context.agent, graphSessionId);
    }
    addActivity(store, context.agent ?? "claude-code", graphSessionId, "collaboration_required", {
      contextKey,
      hostSessionId: host?.host_session_id ?? null,
      ...classification,
    });
  });

  return getCurrentRequirement(store, { requirementId });
}

export function getCurrentRequirement(store, selector = {}) {
  return hydrateRequirement(resolveRequirementRow(store, selector));
}

export function attachPeerTask(store, selector, peerTaskIdInput) {
  const peerTaskId = String(
    peerTaskIdInput ?? selector?.peerTaskId ?? selector?.peer_task_id ?? "",
  ).trim();
  if (!peerTaskId) throw new Error("peer_task_id es obligatorio");
  const requirementRow = resolveRequirementRow(store, selector);
  if (!requirementRow) throw new Error("No existe un requisito de colaboracion activo");
  const peerTask = store.db
    .prepare("SELECT id, status FROM delegated_tasks WHERE id = ?")
    .get(peerTaskId);
  if (!peerTask) throw new Error(`No existe la tarea delegada ${peerTaskId}`);
  const timestamp = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        UPDATE collaboration_requirements
        SET peer_task_id = ?, state = 'peer_attached', reviewed_at = NULL,
            handoff_id = NULL, updated_at = ?
        WHERE id = ?
      `)
      .run(peerTaskId, timestamp, requirementRow.id);
    addActivity(store, "claude-code", requirementRow.graph_session_id, "collaboration_peer_attached", {
      requirementId: requirementRow.id,
      peerTaskId,
    });
  });
  return collaborationStatus(store, { requirementId: requirementRow.id });
}

export function markPeerReviewed(store, context, peerTaskIdInput) {
  const peerTaskId = String(
    peerTaskIdInput ?? context?.peerTaskId ?? context?.peer_task_id ?? "",
  ).trim();
  if (!peerTaskId) throw new Error("peer_task_id es obligatorio");
  const graphSessionId = contextSessionId(context);
  const row = graphSessionId
    ? store.db
        .prepare(`
          SELECT * FROM collaboration_requirements
          WHERE graph_session_id = ? AND peer_task_id = ?
          ORDER BY updated_at DESC LIMIT 1
        `)
        .get(graphSessionId, peerTaskId)
    : resolveRequirementRow(store, { peerTaskId });
  if (!row) throw new Error(`La tarea ${peerTaskId} no pertenece al requisito actual`);
  const task = store.db
    .prepare("SELECT status FROM delegated_tasks WHERE id = ?")
    .get(peerTaskId);
  if (!task || !DELIVERED_TASK_STATUSES.has(task.status)) {
    return { marked: false, reason: "peer_not_delivered", ...collaborationStatus(store, { requirementId: row.id }) };
  }
  const timestamp = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        UPDATE collaboration_requirements
        SET reviewed_at = ?, state = 'peer_reviewed', updated_at = ? WHERE id = ?
      `)
      .run(timestamp, timestamp, row.id);
    addActivity(store, context?.agent ?? "claude-code", row.graph_session_id, "collaboration_peer_reviewed", {
      requirementId: row.id,
      peerTaskId,
    });
  });
  return { marked: true, ...collaborationStatus(store, { requirementId: row.id }) };
}

export function markRequirementHandoff(store, context, handoffIdInput) {
  const handoffId = String(
    handoffIdInput ?? context?.handoffId ?? context?.handoff_id ?? "",
  ).trim();
  if (!handoffId) throw new Error("handoff_id es obligatorio");
  const row = resolveRequirementRow(store, context);
  if (!row) throw new Error("No existe un requisito de colaboracion activo");
  const handoff = store.db.prepare("SELECT id FROM handoffs WHERE id = ?").get(handoffId);
  if (!handoff) throw new Error(`No existe el handoff ${handoffId}`);
  const timestamp = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        UPDATE collaboration_requirements
        SET handoff_id = ?, state = 'completed', updated_at = ? WHERE id = ?
      `)
      .run(handoffId, timestamp, row.id);
    addActivity(store, context?.agent ?? "claude-code", row.graph_session_id, "collaboration_handoff", {
      requirementId: row.id,
      handoffId,
    });
  });
  return collaborationStatus(store, { requirementId: row.id });
}

export function markRequirementBlocked(store, selector, reasonInput) {
  const row = resolveRequirementRow(store, selector);
  if (!row) throw new Error("No existe un requisito de colaboracion activo");
  const reason = boundedRedactedText(reasonInput, 1000) || "Colaboracion bloqueada";
  const timestamp = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        UPDATE collaboration_requirements
        SET state = 'blocked', updated_at = ? WHERE id = ?
      `)
      .run(timestamp, row.id);
    addActivity(store, "claude-code", row.graph_session_id, "collaboration_blocked", {
      requirementId: row.id,
      reason,
    });
  });
  return collaborationStatus(store, { requirementId: row.id });
}

export function collaborationStatus(store, selector = {}) {
  const requirementRow = resolveRequirementRow(store, selector);
  const requirement = hydrateRequirement(requirementRow);
  const task = requirementRow?.peer_task_id
    ? store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(requirementRow.peer_task_id)
    : null;
  const graphContextUsed = Boolean(
    task &&
      store.db
        .prepare(`
          SELECT 1 AS found
          FROM agent_sessions session
          JOIN activity event ON event.session_id = session.session_id
          WHERE session.delegated_task_id = ?
            AND session.agent = 'codex'
            AND event.action = 'session_context'
          LIMIT 1
        `)
        .get(task.id),
  );
  const run = task
    ? task.run_id
      ? store.db.prepare("SELECT * FROM task_runs WHERE id = ?").get(task.run_id)
      : store.db
          .prepare("SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1")
          .get(task.id)
    : null;
  const activeClaim = requirementRow
    ? store.db
        .prepare(`
          SELECT id, scope, task, expires_at
          FROM claims
          WHERE session_id = ? AND status = 'active' AND expires_at > ?
          ORDER BY updated_at DESC LIMIT 1
        `)
        .get(requirementRow.graph_session_id, nowIso())
    : null;

  const runEvidence = run
    ? {
        runId: run.id,
        status: run.status,
        workerPid: run.worker_pid,
        childPid: run.child_pid,
        externalSessionId: run.external_session_id,
        heartbeat: run.heartbeat_at,
        exit: run.exit_code,
        endedAt: run.ended_at,
        error: run.error,
      }
    : {
        runId: task?.run_id ?? null,
        status: null,
        workerPid: null,
        childPid: null,
        externalSessionId: null,
        heartbeat: null,
        exit: null,
        endedAt: null,
        error: null,
      };
  const taskEvidence = task
    ? {
        id: task.id,
        status: task.status,
        targetAgent: task.target_agent,
        mode: task.mode,
        backgroundAuthorized: Boolean(task.background_authorized),
        runId: task.run_id,
        resultHandoffId: task.result_handoff_id,
        startedAt: task.started_at,
        completedAt: task.completed_at,
        error: task.error,
      }
    : null;
  const hasExecutionIdentity = Boolean(
    runEvidence.runId &&
      runEvidence.workerPid &&
      runEvidence.childPid &&
      runEvidence.externalSessionId &&
      runEvidence.heartbeat,
  );
  const heartbeatFresh = Boolean(
    DELIVERED_TASK_STATUSES.has(task?.status) ||
      (runEvidence.heartbeat &&
        Date.now() - Date.parse(runEvidence.heartbeat) <= 60 * 1000),
  );
  const peerStarted = Boolean(
    task &&
      STARTED_TASK_STATUSES.has(task.status) &&
      hasExecutionIdentity &&
      heartbeatFresh &&
      graphContextUsed,
  );
  const peerDelivered = Boolean(task && DELIVERED_TASK_STATUSES.has(task.status));
  const reviewed = Boolean(requirementRow?.reviewed_at);
  const handoff = Boolean(requirementRow?.handoff_id);
  const required = Boolean(requirementRow?.required);

  return {
    requirement,
    evidence: {
      task: taskEvidence,
      run: runEvidence,
      activeClaim: activeClaim
        ? {
            id: activeClaim.id,
            scope: activeClaim.scope,
            task: activeClaim.task,
            expiresAt: activeClaim.expires_at,
          }
        : null,
    },
    gates: {
      peerStarted,
      heartbeatFresh,
      graphContextUsed,
      peerDelivered,
      reviewed,
      handoff,
    },
    readyForMutation: Boolean(requirement && activeClaim && (!required || peerStarted)),
    readyForStop: Boolean(requirement && (!required || (peerDelivered && reviewed && handoff))),
  };
}
