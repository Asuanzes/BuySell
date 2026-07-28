import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizePath, nowIso, safeJsonParse } from "./store.mjs";
import {
  containsObviousSecret,
  redactObviousSecrets,
  sanitizedEnvironment,
} from "./executors.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = path.resolve(MODULE_DIR, "../runner.mjs");
const TARGET_AGENTS = new Set(["codex", "claude-code"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const ACTIVE_RUN_STATUSES = new Set(["starting", "running", "cancel_requested"]);
const MAX_TOTAL_RUNNING = 3;
const MAX_RUNNING_PER_AGENT = 2;
const DEFAULT_LEASE_SECONDS = 45;
const MAX_EVENT_PAYLOAD_CHARS = 24000;

function normalizeAgent(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  if (normalized.includes("claude")) return "claude-code";
  if (normalized.includes("codex") || normalized.includes("chatgpt")) return "codex";
  return normalized;
}

function normalizeScope(value, root) {
  const scope = normalizePath(String(value ?? "").trim()).replace(/\/+$/, "");
  const segments = scope.split("/");
  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, scope);
  const relative = path.relative(rootPath, resolved);
  if (!scope) throw new Error("scope es obligatorio");
  if (
    scope === "*" ||
    scope === "." ||
    path.isAbsolute(scope) ||
    segments.some((segment) => segment === "." || segment === "..") ||
    scope.includes(":") ||
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative) ||
    /^(?:\.git|\.graphrag|node_modules)(?:\/|$)/i.test(scope) ||
    /(?:^|\/)(?:\.claude|\.codex|tools\/graphrag)(?:\/|$)/i.test(scope) ||
    /(?:^|\/)(?:\.env(?:\.|$)|credentials?|private-key|service-account)(?:\/|$)/i.test(scope)
  ) {
    throw new Error("scope debe ser una ruta relativa, acotada y no sensible del repositorio");
  }
  return scope;
}

function scopesOverlap(left, right) {
  let a = normalizePath(String(left ?? "")).replace(/\/+$/, "");
  let b = normalizePath(String(right ?? "")).replace(/\/+$/, "");
  if (process.platform === "win32") {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  return Boolean(a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

function normalizeArtifactPaths(values, root) {
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    try {
      normalized.push(normalizeScope(redactObviousSecrets(value), root));
    } catch {
      // Ignore paths outside the repository or sensitive locations.
    }
  }
  return [...new Set(normalized)].slice(0, 100);
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function boundedText(value, maximum, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} es obligatorio`);
  if (text.length > maximum) throw new Error(`${field} supera ${maximum} caracteres`);
  return text;
}

function canonicalJson(value, maximum = MAX_EVENT_PAYLOAD_CHARS) {
  const text = JSON.stringify(value ?? {});
  return text.length <= maximum
    ? text
    : JSON.stringify({ truncated: true, preview: text.slice(0, maximum) });
}

function taskFingerprint(input) {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.targetAgent,
        input.title.toLowerCase(),
        input.scope,
        input.mode,
        input.instructions.replace(/\s+/g, " ").trim(),
      ].join("\n"),
    )
    .digest("hex");
}

function ensureAgentNode(store, agent) {
  if (store.getNode(`agent:${agent}`)) return;
  store.upsertNode({
    id: `agent:${agent}`,
    kind: "agent",
    name: agent,
    signature: `Development agent ${agent}`,
    content: `${agent} trabaja sobre Nidokey mediante nidokey-graph.`,
    searchText: `${agent} development agent Nidokey delegation`,
    authority: 1,
    metadata: { configured: true },
  });
}

function hydrateTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    rootId: row.root_id,
    parentId: row.parent_id,
    createdByAgent: row.created_by_agent,
    createdBySession: row.created_by_session,
    targetAgent: row.target_agent,
    title: row.title,
    instructions: row.instructions,
    acceptanceCriteria: safeJsonParse(row.acceptance_json, []),
    scope: row.scope,
    mode: row.mode,
    backgroundAuthorized: Boolean(row.background_authorized),
    status: row.status,
    priority: row.priority,
    depth: row.depth,
    maxDepth: row.max_depth,
    maxDescendants: row.max_descendants,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    timeoutSeconds: row.timeout_seconds,
    idempotencyKey: row.idempotency_key,
    assignedSessionId: row.assigned_session_id,
    runId: row.run_id,
    claimId: row.claim_id,
    leaseExpiresAt: row.lease_expires_at,
    resultHandoffId: row.result_handoff_id,
    result: safeJsonParse(row.result_json, null),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function appendTaskEvent(store, taskId, event, context = {}, payload = {}) {
  store.db
    .prepare(`
      INSERT INTO task_events(task_id, event, agent, session_id, payload_json, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `)
    .run(
      taskId,
      event,
      context.agent ?? null,
      context.sessionId ?? null,
      canonicalJson(payload),
      nowIso(),
    );
}

function syncTaskNode(store, taskRow) {
  const task = hydrateTask(taskRow);
  ensureAgentNode(store, task.createdByAgent);
  ensureAgentNode(store, task.targetAgent);
  const resultSummary = task.result?.summary ?? "";
  store.upsertNode({
    id: `delegated_task:${task.id}`,
    kind: "delegated_task",
    name: task.title,
    signature: `${task.status} → ${task.targetAgent} [${task.scope}]`,
    content: [
      `Estado: ${task.status}`,
      `Ámbito: ${task.scope}`,
      `Delegado por: ${task.createdByAgent}`,
      `Asignado a: ${task.targetAgent}`,
      resultSummary ? `Resultado: ${resultSummary.slice(0, 4000)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    searchText: [
      task.title,
      task.scope,
      task.status,
      task.createdByAgent,
      task.targetAgent,
      resultSummary.slice(0, 8000),
    ].join("\n"),
    authority: 0.94,
    metadata: {
      rootId: task.rootId,
      parentId: task.parentId,
      status: task.status,
      targetAgent: task.targetAgent,
      scope: task.scope,
      mode: task.mode,
      backgroundAuthorized: task.backgroundAuthorized,
      depth: task.depth,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    },
  });
  store.upsertEdge({
    sourceId: `agent:${task.createdByAgent}`,
    targetId: `delegated_task:${task.id}`,
    relation: "DELEGATED",
  });
  store.upsertEdge({
    sourceId: `delegated_task:${task.id}`,
    targetId: `agent:${task.targetAgent}`,
    relation: "ASSIGNED_TO",
  });
  if (task.parentId && store.getNode(`delegated_task:${task.parentId}`)) {
    store.upsertEdge({
      sourceId: `delegated_task:${task.id}`,
      targetId: `delegated_task:${task.parentId}`,
      relation: "CHILD_OF",
    });
  }
  if (store.getNode(`file:${task.scope}`)) {
    store.upsertEdge({
      sourceId: `delegated_task:${task.id}`,
      targetId: `file:${task.scope}`,
      relation: "SCOPES",
    });
  }
}

function dependenciesFor(store, taskId) {
  return store.db
    .prepare(`
      SELECT dependency.*
      FROM task_dependencies link
      JOIN delegated_tasks dependency ON dependency.id = link.depends_on_task_id
      WHERE link.task_id = ?
      ORDER BY dependency.created_at
    `)
    .all(taskId)
    .map(hydrateTask);
}

function dependencyState(store, taskId) {
  const dependencies = dependenciesFor(store, taskId);
  if (dependencies.some((dependency) => dependency.status !== "succeeded")) {
    const terminalFailure = dependencies.find((dependency) =>
      ["failed", "cancelled", "needs_input"].includes(dependency.status),
    );
    return {
      eligible: false,
      state: terminalFailure ? "dependency_failed" : "waiting_dependencies",
      dependencies,
    };
  }
  return { eligible: true, state: "ready", dependencies };
}

function activeClaims(store) {
  return store.db
    .prepare(`
      SELECT * FROM claims
      WHERE status = 'active' AND expires_at > ?
      ORDER BY created_at
    `)
    .all(nowIso());
}

function releaseTaskClaim(store, taskRow, status = "released") {
  if (!taskRow?.claim_id) return;
  store.db
    .prepare(`
      UPDATE claims SET status = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
    `)
    .run(status, nowIso(), taskRow.claim_id);
  store.db.prepare("DELETE FROM node_fts WHERE id = ?").run(`claim:${taskRow.claim_id}`);
  store.db.prepare("DELETE FROM nodes WHERE id = ?").run(`claim:${taskRow.claim_id}`);
}

function createRunnerClaim(store, taskRow, runId, claimId, expiresAt) {
  const sessionId = `runner:${runId}`;
  store.db
    .prepare(`
      INSERT INTO claims(
        id, agent, session_id, scope, task, status,
        created_at, updated_at, expires_at
      ) VALUES(?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `)
    .run(
      claimId,
      taskRow.target_agent,
      sessionId,
      taskRow.scope,
      `Tarea delegada ${taskRow.id}: ${taskRow.title}`,
      nowIso(),
      nowIso(),
      expiresAt,
    );
  store.upsertNode({
    id: `claim:${claimId}`,
    kind: "work_claim",
    name: `${taskRow.target_agent}: ${taskRow.scope}`,
    signature: taskRow.title,
    content: `${taskRow.target_agent} reserva ${taskRow.scope} para la tarea ${taskRow.id}`,
    searchText: `${taskRow.target_agent} ${taskRow.scope} ${taskRow.title}`,
    authority: 0.95,
    metadata: {
      agent: taskRow.target_agent,
      sessionId,
      taskId: taskRow.id,
      scope: taskRow.scope,
      expiresAt,
    },
  });
  ensureAgentNode(store, taskRow.target_agent);
  store.upsertEdge({
    sourceId: `agent:${taskRow.target_agent}`,
    targetId: `claim:${claimId}`,
    relation: "CLAIMS",
    metadata: { expiresAt, taskId: taskRow.id },
  });
  if (store.getNode(`file:${taskRow.scope}`)) {
    store.upsertEdge({
      sourceId: `claim:${claimId}`,
      targetId: `file:${taskRow.scope}`,
      relation: "SCOPES",
    });
  }
}

export function delegateTask(store, context, input = {}) {
  if (!TARGET_AGENTS.has(context.agent)) {
    throw new Error("La identidad de esta sesión no está autorizada para delegar");
  }
  const targetAgent = normalizeAgent(input.target_agent);
  if (!TARGET_AGENTS.has(targetAgent)) {
    throw new Error("target_agent debe ser codex o claude-code");
  }
  if (targetAgent === context.agent) {
    throw new Error("La delegación cruzada debe dirigirse al otro agente");
  }
  const title = boundedText(input.title, 300, "title");
  const instructions = boundedText(input.instructions, 12000, "instructions");
  if (containsObviousSecret(instructions)) {
    throw new Error("Las instrucciones parecen contener una credencial; no se persistieron");
  }
  const scope = normalizeScope(input.scope, store.root);
  const acceptanceCriteria = Array.isArray(input.acceptance_criteria)
    ? input.acceptance_criteria.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30)
    : [];
  const mode = input.mode === "edit" ? "edit" : "analyze";
  const priority = clampInteger(input.priority, 0, 3, 1);
  const maxAttempts = clampInteger(input.max_attempts, 1, 3, 2);
  const timeoutSeconds = clampInteger(input.timeout_minutes, 5, 120, 45) * 60;
  const idempotencyKey = input.idempotency_key
    ? boundedText(input.idempotency_key, 200, "idempotency_key")
    : null;
  let parentId = null;
  if (context.delegatedTaskId) {
    if (
      input.parent_task_id !== undefined &&
      String(input.parent_task_id) !== context.delegatedTaskId
    ) {
      throw new Error("Una tarea en segundo plano solo puede delegar como hija de sí misma");
    }
    parentId = context.delegatedTaskId;
  } else if (input.parent_task_id !== undefined) {
    parentId = String(input.parent_task_id).trim();
    if (!parentId) throw new Error("parent_task_id no puede estar vacío");
  }
  const dependsOn = Array.isArray(input.depends_on)
    ? [...new Set(input.depends_on.map(String).filter(Boolean))]
    : [];
  const taskId = crypto.randomUUID();
  const createdAt = nowIso();
  let rootId = taskId;
  let depth = 0;
  let maxDepth = clampInteger(input.max_depth, 0, 3, 2);
  let maxDescendants = 8;
  let backgroundAuthorized = false;
  let parent = null;

  store.db.exec("BEGIN IMMEDIATE");
  try {
  if (parentId) {
    parent = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(parentId);
    if (!parent) throw new Error(`No existe la tarea padre ${parentId}`);
    const ownsBackgroundParent =
      context.delegatedTaskId === parent.id &&
      context.backgroundRunId &&
      parent.run_id === context.backgroundRunId;
    const ownsManualParent =
      parent.assigned_session_id === context.sessionId ||
      parent.created_by_session === context.sessionId;
    if (!ownsBackgroundParent && !ownsManualParent) {
      throw new Error("La sesión actual no posee la tarea padre");
    }
    rootId = parent.root_id;
    depth = parent.depth + 1;
    maxDepth = Math.min(parent.max_depth, maxDepth);
    maxDescendants = parent.max_descendants;
    backgroundAuthorized = Boolean(parent.background_authorized);
    if (depth > maxDepth) {
      throw new Error(`Profundidad máxima de delegación alcanzada (${maxDepth})`);
    }
    const directChildren = store.db
      .prepare("SELECT COUNT(*) AS count FROM delegated_tasks WHERE parent_id = ?")
      .get(parentId).count;
    if (directChildren >= 3) {
      throw new Error("Una tarea no puede crear más de 3 delegaciones directas");
    }
    const descendants = store.db
      .prepare("SELECT COUNT(*) AS count FROM delegated_tasks WHERE root_id = ? AND id <> ?")
      .get(rootId, rootId).count;
    if (descendants >= maxDescendants) {
      throw new Error(`La raíz ya alcanzó ${maxDescendants} tareas descendientes`);
    }
    if (!TERMINAL_STATUSES.has(parent.status) && scopesOverlap(parent.scope, scope)) {
      throw new Error(
        "El ámbito delegado se solapa con la tarea padre; divide el trabajo en rutas no solapadas",
      );
    }
  }

  for (const dependencyId of dependsOn) {
    const dependency = store.db
      .prepare("SELECT id, root_id FROM delegated_tasks WHERE id = ?")
      .get(dependencyId);
    if (!dependency) throw new Error(`No existe la dependencia ${dependencyId}`);
    if (parent && dependency.root_id !== rootId) {
      throw new Error("Las dependencias de una subtarea deben pertenecer a la misma raíz");
    }
    if (parent) {
      const ancestor = store.db
        .prepare(`
          WITH RECURSIVE ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM delegated_tasks WHERE id = ?
            UNION ALL
            SELECT task.id, task.parent_id
            FROM delegated_tasks task
            JOIN ancestors ON task.id = ancestors.parent_id
          )
          SELECT 1 AS found FROM ancestors WHERE id = ? LIMIT 1
        `)
        .get(parent.id, dependencyId);
      if (ancestor) {
        throw new Error("Una subtarea no puede depender de su padre ni de un ancestro");
      }
    }
  }

  const fingerprint = taskFingerprint({ targetAgent, title, scope, mode, instructions });
  const duplicateSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (idempotencyKey) {
    const existing = parent
      ? store.db
          .prepare(`
            SELECT * FROM delegated_tasks
            WHERE root_id = ? AND idempotency_key = ?
          `)
          .get(rootId, idempotencyKey)
      : store.db
          .prepare(`
            SELECT * FROM delegated_tasks
            WHERE parent_id IS NULL
              AND created_by_session = ?
              AND idempotency_key = ?
            ORDER BY created_at DESC LIMIT 1
          `)
          .get(context.sessionId, idempotencyKey);
    if (existing) {
      store.db.exec("COMMIT");
      return { created: false, idempotent: true, task: hydrateTask(existing) };
    }
  }
  const duplicate = parent
    ? store.db
        .prepare(`
          SELECT * FROM delegated_tasks
          WHERE root_id = ? AND fingerprint = ?
            AND status NOT IN ('failed', 'cancelled')
            AND created_at > ?
          ORDER BY created_at DESC LIMIT 1
        `)
        .get(rootId, fingerprint, duplicateSince)
    : store.db
        .prepare(`
          SELECT * FROM delegated_tasks
          WHERE parent_id IS NULL
            AND created_by_session = ?
            AND fingerprint = ?
            AND status NOT IN ('failed', 'cancelled')
            AND created_at > ?
          ORDER BY created_at DESC LIMIT 1
        `)
        .get(context.sessionId, fingerprint, duplicateSince);
  if (duplicate) {
    store.db.exec("COMMIT");
    return { created: false, duplicate: true, task: hydrateTask(duplicate) };
  }

    store.db
      .prepare(`
        INSERT INTO delegated_tasks(
          id, root_id, parent_id, created_by_agent, created_by_session,
          target_agent, title, instructions, acceptance_json, scope, mode,
          background_authorized, status, priority,
          depth, max_depth, max_descendants, attempt, max_attempts,
          timeout_seconds, idempotency_key, fingerprint,
          created_at, updated_at
        ) VALUES(
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?
        )
      `)
      .run(
        taskId,
        rootId,
        parentId,
        context.agent,
        context.sessionId,
        targetAgent,
        title,
        instructions,
        JSON.stringify(acceptanceCriteria),
        scope,
        mode,
        backgroundAuthorized ? 1 : 0,
        priority,
        depth,
        maxDepth,
        maxDescendants,
        maxAttempts,
        timeoutSeconds,
        idempotencyKey,
        fingerprint,
        createdAt,
        createdAt,
      );
    for (const dependencyId of dependsOn) {
      store.db
        .prepare(`
          INSERT INTO task_dependencies(task_id, depends_on_task_id)
          VALUES(?, ?)
        `)
        .run(taskId, dependencyId);
    }
    const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
    syncTaskNode(store, row);
    for (const dependencyId of dependsOn) {
      store.upsertEdge({
        sourceId: `delegated_task:${taskId}`,
        targetId: `delegated_task:${dependencyId}`,
        relation: "DEPENDS_ON",
      });
    }
    appendTaskEvent(store, taskId, "delegated", context, {
      targetAgent,
      scope,
      mode,
      parentId,
      dependsOn,
    });
  store.db.exec("COMMIT");
  return {
    created: true,
    task: hydrateTask(store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId)),
  };
  } catch (error) {
    try {
      store.db.exec("ROLLBACK");
    } catch {
      // Preserve the original error.
    }
    throw error;
  }
}

function taskEligibility(store, row) {
  if (row.status !== "queued") return { eligible: false, state: row.status };
  const dependency = dependencyState(store, row.id);
  if (!dependency.eligible) return dependency;
  const conflict = activeClaims(store).find((claim) => scopesOverlap(claim.scope, row.scope));
  if (conflict) {
    return {
      eligible: false,
      state: "waiting_scope",
      conflict: {
        agent: conflict.agent,
        scope: conflict.scope,
        task: conflict.task,
        expiresAt: conflict.expires_at,
      },
    };
  }
  return {
    eligible: true,
    state: row.background_authorized ? "ready_background" : "ready_manual",
  };
}

export function listDelegatedTasks(store, input = {}, context = {}) {
  const clauses = [];
  const parameters = [];
  if (input.target_agent) {
    clauses.push("target_agent = ?");
    parameters.push(normalizeAgent(input.target_agent));
  }
  if (input.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    parameters.push(...statuses.map(String));
  }
  if (input.root_id) {
    clauses.push("root_id = ?");
    parameters.push(String(input.root_id));
  }
  if (input.mine === true && context.agent) {
    clauses.push("(target_agent = ? OR created_by_agent = ?)");
    parameters.push(context.agent, context.agent);
  }
  const limit = clampInteger(input.limit, 1, 100, 30);
  parameters.push(limit);
  const rows = store.db
    .prepare(`
      SELECT * FROM delegated_tasks
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'needs_input' THEN 2 ELSE 3 END,
        priority DESC,
        updated_at DESC
      LIMIT ?
    `)
    .all(...parameters);
  return {
    tasks: rows.map((row) => ({
      ...hydrateTask(row),
      eligibility: taskEligibility(store, row),
    })),
  };
}

export function getDelegatedTask(store, taskId) {
  const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
  if (!row) throw new Error(`No existe la tarea ${taskId}`);
  const runs = store.db
    .prepare(`
      SELECT * FROM task_runs WHERE task_id = ?
      ORDER BY started_at DESC LIMIT 10
    `)
    .all(taskId)
    .map((run) => ({
      id: run.id,
      agent: run.agent,
      status: run.status,
      workerPid: run.worker_pid,
      childPid: run.child_pid,
      externalSessionId: run.external_session_id,
      logPath: run.log_path,
      resultPath: run.result_path,
      attempt: run.attempt,
      startedAt: run.started_at,
      heartbeatAt: run.heartbeat_at,
      endedAt: run.ended_at,
      exitCode: run.exit_code,
      error: run.error,
    }));
  const events = store.db
    .prepare(`
      SELECT event, agent, session_id, payload_json, created_at
      FROM task_events WHERE task_id = ?
      ORDER BY id DESC LIMIT 50
    `)
    .all(taskId)
    .map((event) => ({
      event: event.event,
      agent: event.agent,
      sessionId: event.session_id,
      payload: safeJsonParse(event.payload_json),
      createdAt: event.created_at,
    }));
  return {
    task: hydrateTask(row),
    eligibility: taskEligibility(store, row),
    dependencies: dependenciesFor(store, taskId),
    children: store.db
      .prepare("SELECT * FROM delegated_tasks WHERE parent_id = ? ORDER BY created_at")
      .all(taskId)
      .map(hydrateTask),
    runs,
    events,
  };
}

export function claimDelegatedTask(store, context, input = {}) {
  const taskId = String(input.task_id ?? "");
  const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
  if (!row) throw new Error(`No existe la tarea ${taskId}`);
  if (row.target_agent !== context.agent) {
    throw new Error("La tarea está asignada al otro agente");
  }
  if (row.status !== "queued") {
    return { acquired: false, state: row.status, task: hydrateTask(row) };
  }
  const eligibility = taskEligibility(store, row);
  if (!eligibility.eligible) {
    return { acquired: false, ...eligibility, task: hydrateTask(row) };
  }
  const claimId = crypto.randomUUID();
  const ttlMinutes = clampInteger(input.ttl_minutes, 15, 240, 120);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  let acquired = false;
  store.withImmediateTransaction(() => {
    const current = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
    if (!current || current.status !== "queued") return;
    if (!dependencyState(store, taskId).eligible) return;
    if (activeClaims(store).some((claim) => scopesOverlap(claim.scope, current.scope))) return;
    const timestamp = nowIso();
    store.db
      .prepare(`
        INSERT INTO claims(
          id, agent, session_id, scope, task, status,
          created_at, updated_at, expires_at
        ) VALUES(?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `)
      .run(
        claimId,
        context.agent,
        context.sessionId,
        current.scope,
        `Tarea delegada ${current.id}: ${current.title}`,
        timestamp,
        timestamp,
        expiresAt,
      );
    store.upsertNode({
      id: `claim:${claimId}`,
      kind: "work_claim",
      name: `${context.agent}: ${current.scope}`,
      signature: current.title,
      content: `${context.agent} reserva ${current.scope} para la tarea ${current.id}`,
      searchText: `${context.agent} ${current.scope} ${current.title}`,
      authority: 0.95,
      metadata: {
        agent: context.agent,
        sessionId: context.sessionId,
        taskId: current.id,
        scope: current.scope,
        expiresAt,
      },
    });
    ensureAgentNode(store, context.agent);
    store.upsertEdge({
      sourceId: `agent:${context.agent}`,
      targetId: `claim:${claimId}`,
      relation: "CLAIMS",
      metadata: { expiresAt, taskId: current.id },
    });
    store.db
      .prepare(`
        UPDATE delegated_tasks
        SET status = 'running', assigned_session_id = ?, claim_id = ?,
            lease_expires_at = ?, started_at = COALESCE(started_at, ?),
            updated_at = ?
        WHERE id = ? AND status = 'queued'
      `)
      .run(
        context.sessionId,
        claimId,
        expiresAt,
        timestamp,
        timestamp,
        current.id,
      );
    appendTaskEvent(store, taskId, "claimed_by_session", context, {
      claimId,
      expiresAt,
    });
    syncTaskNode(
      store,
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId),
    );
    acquired = true;
  });
  const updated = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
  return {
    acquired,
    task: hydrateTask(updated),
    ...(acquired ? { claimId, expiresAt } : { eligibility: taskEligibility(store, updated) }),
  };
}

function createResultHandoff(store, taskRow, result, context) {
  const handoffId = crypto.randomUUID();
  const createdAt = nowIso();
  const paths = Array.isArray(result.changedPaths) ? result.changedPaths.map(normalizePath) : [];
  const tests = Array.isArray(result.tests) ? result.tests.map(String) : [];
  const nextSteps = Array.isArray(result.nextSteps) ? result.nextSteps.map(String) : [];
  const summary = String(result.summary ?? "").trim() || `Tarea ${taskRow.id} completada`;
  store.db
    .prepare(`
      INSERT INTO handoffs(
        id, agent, session_id, summary, paths_json, tests_json, next_steps_json, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      handoffId,
      taskRow.target_agent,
      context.sessionId,
      summary,
      JSON.stringify(paths),
      JSON.stringify(tests),
      JSON.stringify(nextSteps),
      createdAt,
    );
  store.upsertNode({
    id: `handoff:${handoffId}`,
    kind: "handoff",
    name: `${taskRow.target_agent} handoff: ${taskRow.title}`,
    signature: summary.slice(0, 300),
    content: `${summary}\nTests: ${tests.join("; ")}\nSiguiente: ${nextSteps.join("; ")}`,
    searchText: `${taskRow.title}\n${summary}\n${paths.join(" ")}\n${tests.join(" ")}\n${nextSteps.join(" ")}`,
    authority: 0.94,
    metadata: {
      agent: taskRow.target_agent,
      sessionId: context.sessionId,
      taskId: taskRow.id,
      paths,
      tests,
      nextSteps,
      createdAt,
    },
  });
  ensureAgentNode(store, taskRow.target_agent);
  store.upsertEdge({
    sourceId: `agent:${taskRow.target_agent}`,
    targetId: `handoff:${handoffId}`,
    relation: "PUBLISHED",
  });
  store.upsertEdge({
    sourceId: `delegated_task:${taskRow.id}`,
    targetId: `handoff:${handoffId}`,
    relation: "PRODUCED",
  });
  for (const filePath of paths) {
    if (store.getNode(`file:${filePath}`)) {
      store.upsertEdge({
        sourceId: `handoff:${handoffId}`,
        targetId: `file:${filePath}`,
        relation: "AFFECTS",
      });
    }
  }
  return handoffId;
}

export function completeDelegatedTask(store, context, input = {}) {
  const taskId = String(input.task_id ?? context.delegatedTaskId ?? "");
  const result = {
    outcome: ["completed", "partial", "blocked", "failed"].includes(input.outcome)
      ? input.outcome
      : "completed",
    summary: redactObviousSecrets(boundedText(input.summary, 16000, "summary")),
    changedPaths: normalizeArtifactPaths(input.changed_paths, store.root),
    tests: Array.isArray(input.tests)
      ? input.tests.map(redactObviousSecrets).slice(0, 100)
      : [],
    nextSteps: Array.isArray(input.next_steps)
      ? input.next_steps.map(redactObviousSecrets).slice(0, 100)
      : [],
    needsUserInput: Boolean(input.needs_user_input),
  };
  const terminalStatus =
    result.needsUserInput ||
    result.outcome === "blocked" ||
    result.outcome === "partial"
      ? "needs_input"
      : result.outcome === "failed"
        ? "failed"
        : "succeeded";
  let handoffId = null;
  let alreadyTerminal = null;
  store.withImmediateTransaction(() => {
    const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
    if (!row) throw new Error(`No existe la tarea ${taskId}`);
    if (TERMINAL_STATUSES.has(row.status)) {
      alreadyTerminal = row;
      return;
    }
    if (row.target_agent !== context.agent) {
      throw new Error("Solo el agente asignado puede completar la tarea");
    }
    if (row.status !== "running") {
      throw new Error(`La tarea no está ejecutándose (${row.status})`);
    }
    const isRunner =
      row.run_id &&
      context.delegatedTaskId === row.id &&
      context.backgroundRunId === row.run_id;
    const isManual =
      !row.run_id && row.assigned_session_id === context.sessionId;
    if (!isRunner && !isManual) {
      throw new Error("La sesión actual no posee la ejecución de esta tarea");
    }
    const completedAt = nowIso();
    const expectedAssignment = row.run_id
      ? `runner:${row.run_id}`
      : context.sessionId;
    const transition = store.db
      .prepare(`
        UPDATE delegated_tasks
        SET status = ?, result_json = ?,
            error = ?, updated_at = ?, completed_at = ?, lease_expires_at = NULL
        WHERE id = ? AND status = 'running' AND assigned_session_id = ?
      `)
      .run(
        terminalStatus,
        JSON.stringify(result),
        terminalStatus === "failed" ? result.summary : null,
        completedAt,
        terminalStatus === "needs_input" ? null : completedAt,
        taskId,
        expectedAssignment,
      );
    if (transition.changes !== 1) {
      throw new Error("La tarea cambió de estado durante la finalización");
    }
    handoffId = createResultHandoff(store, row, result, context);
    store.db
      .prepare("UPDATE delegated_tasks SET result_handoff_id = ? WHERE id = ?")
      .run(handoffId, taskId);
    releaseTaskClaim(store, row);
    if (row.run_id) {
      store.db
        .prepare(`
          UPDATE task_runs
          SET status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND status IN ('starting', 'running', 'cancel_requested')
        `)
        .run(terminalStatus, completedAt, row.run_id);
    }
    appendTaskEvent(store, taskId, terminalStatus, context, {
      handoffId,
      outcome: result.outcome,
    });
    syncTaskNode(
      store,
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId),
    );
  });
  if (alreadyTerminal) {
    return {
      completed: alreadyTerminal.status === "succeeded",
      task: hydrateTask(alreadyTerminal),
    };
  }
  return {
    completed: terminalStatus === "succeeded",
    status: terminalStatus,
    handoffId,
    task: hydrateTask(store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId)),
  };
}

export function cancelDelegatedTask(store, context, input = {}) {
  const taskId = String(input.task_id ?? "");
  let changed = false;
  store.withImmediateTransaction(() => {
    const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
    if (!row) throw new Error(`No existe la tarea ${taskId}`);
    if (TERMINAL_STATUSES.has(row.status)) return;
    const ownsCreation =
      row.created_by_session === context.sessionId && !context.delegatedTaskId;
    const ownsManualRun =
      !row.run_id && row.assigned_session_id === context.sessionId;
    const ownsBackgroundRun =
      row.run_id &&
      context.delegatedTaskId === row.id &&
      context.backgroundRunId === row.run_id;
    if (!context.operator && !ownsCreation && !ownsManualRun && !ownsBackgroundRun) {
      throw new Error("La sesión actual no puede cancelar esta tarea");
    }
    const canCancelImmediately =
      row.status === "queued" ||
      row.status === "needs_input" ||
      (row.status === "running" && !row.run_id);
    const nextStatus = canCancelImmediately ? "cancelled" : "cancel_requested";
    const timestamp = nowIso();
    const transition = store.db
      .prepare(`
        UPDATE delegated_tasks
        SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = 'cancelled' THEN ? ELSE completed_at END
        WHERE id = ? AND status = ?
      `)
      .run(nextStatus, timestamp, nextStatus, timestamp, taskId, row.status);
    if (transition.changes !== 1) {
      throw new Error("La tarea cambió de estado durante la cancelación");
    }
    if (nextStatus === "cancelled") releaseTaskClaim(store, row);
    if (row.run_id) {
      store.db
        .prepare(`
          UPDATE task_runs SET status = ?
          WHERE id = ? AND status IN ('starting', 'running')
        `)
        .run(nextStatus, row.run_id);
    }
    appendTaskEvent(store, taskId, nextStatus, context, {
      reason: String(input.reason ?? "Cancelación solicitada"),
    });
    syncTaskNode(
      store,
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId),
    );
    changed = true;
  });
  return {
    changed,
    task: hydrateTask(store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId)),
  };
}

export function releaseManualSessionTasks(store, context) {
  let rows = [];
  const requeued = [];
  store.withImmediateTransaction(() => {
    rows = store.db
      .prepare(`
        SELECT * FROM delegated_tasks
        WHERE assigned_session_id = ?
          AND run_id IS NULL
          AND status = 'running'
      `)
      .all(context.sessionId);
    for (const row of rows) {
      const transition = store.db
        .prepare(`
          UPDATE delegated_tasks
          SET status = 'queued', assigned_session_id = NULL, claim_id = NULL,
              lease_expires_at = NULL, updated_at = ?, error = ?
          WHERE id = ? AND status = 'running' AND assigned_session_id = ?
        `)
        .run(
          nowIso(),
          "La sesión que aceptó la tarea se desconectó",
          row.id,
          context.sessionId,
        );
      if (transition.changes !== 1) continue;
      releaseTaskClaim(store, row);
      appendTaskEvent(store, row.id, "requeued", context, {
        reason: "manual_session_disconnected",
      });
      syncTaskNode(
        store,
        store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
      );
      requeued.push(row.id);
    }
  });
  return { requeued };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function reconcileExpiredTasks(store) {
  const expired = store.db
    .prepare(`
      SELECT task.*, run.worker_pid, run.child_pid, run.status AS run_status
      FROM delegated_tasks task
      LEFT JOIN task_runs run ON run.id = task.run_id
      WHERE task.status IN ('running', 'cancel_requested')
        AND task.lease_expires_at IS NOT NULL
        AND task.lease_expires_at <= ?
    `)
    .all(nowIso());
  const reconciled = [];
  for (const row of expired) {
    const processAlive = isProcessAlive(row.worker_pid) || isProcessAlive(row.child_pid);
    store.withImmediateTransaction(() => {
      const timestamp = nowIso();
      if (processAlive) {
        store.db
          .prepare(`
            UPDATE delegated_tasks
            SET status = 'needs_input', error = ?, updated_at = ?, lease_expires_at = NULL
            WHERE id = ?
          `)
          .run(
            "El lease expiró pero todavía existe un proceso asociado; requiere revisión humana",
            timestamp,
            row.id,
          );
        appendTaskEvent(store, row.id, "orphan_process_detected", {}, {
          workerPid: row.worker_pid,
          childPid: row.child_pid,
        });
      } else {
        const nextStatus = row.attempt < row.max_attempts ? "queued" : "failed";
        store.db
          .prepare(`
            UPDATE delegated_tasks
            SET status = ?, error = ?, run_id = NULL, claim_id = NULL,
                assigned_session_id = NULL, lease_expires_at = NULL,
                updated_at = ?, completed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
            WHERE id = ?
          `)
          .run(
            nextStatus,
            "El ejecutor dejó de responder",
            timestamp,
            nextStatus,
            timestamp,
            row.id,
          );
        releaseTaskClaim(store, row, "expired");
        appendTaskEvent(store, row.id, nextStatus === "queued" ? "requeued" : "failed", {}, {
          reason: "expired_lease",
        });
      }
      if (row.run_id) {
        store.db
          .prepare(`
            UPDATE task_runs
            SET status = 'orphaned', ended_at = ?, error = ?
            WHERE id = ?
          `)
          .run(timestamp, "Lease expirado", row.run_id);
      }
      syncTaskNode(
        store,
        store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
      );
    });
    reconciled.push({ taskId: row.id, processAlive });
  }
  return reconciled;
}

function runningCounts(store) {
  const rows = store.db
    .prepare(`
      SELECT target_agent, COUNT(*) AS count
      FROM delegated_tasks
      WHERE status IN ('running', 'cancel_requested')
      GROUP BY target_agent
    `)
    .all();
  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byAgent: Object.fromEntries(rows.map((row) => [row.target_agent, row.count])),
  };
}

export function leaseNextEligibleTask(store) {
  let leased = null;
  store.withImmediateTransaction(() => {
    const counts = runningCounts(store);
    if (counts.total >= MAX_TOTAL_RUNNING) return;
    const candidates = store.db
      .prepare(`
        SELECT * FROM delegated_tasks
        WHERE status = 'queued' AND background_authorized = 1
        ORDER BY priority DESC, created_at
        LIMIT 100
      `)
      .all();
    for (const candidate of candidates) {
      if ((counts.byAgent[candidate.target_agent] ?? 0) >= MAX_RUNNING_PER_AGENT) {
        continue;
      }
      if (!taskEligibility(store, candidate).eligible) continue;
      const runId = crypto.randomUUID();
      const claimId = crypto.randomUUID();
      const leaseExpiresAt = new Date(
        Date.now() + DEFAULT_LEASE_SECONDS * 1000,
      ).toISOString();
      const current = store.db
        .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
        .get(candidate.id);
      if (!current || current.status !== "queued") continue;
      if (!dependencyState(store, current.id).eligible) continue;
      if (activeClaims(store).some((claim) => scopesOverlap(claim.scope, current.scope))) {
        continue;
      }
      const timestamp = nowIso();
      createRunnerClaim(store, current, runId, claimId, leaseExpiresAt);
      const transition = store.db
        .prepare(`
          UPDATE delegated_tasks
          SET status = 'running', attempt = attempt + 1,
              assigned_session_id = ?, run_id = ?, claim_id = ?,
              lease_expires_at = ?, started_at = COALESCE(started_at, ?),
              updated_at = ?, error = NULL
          WHERE id = ? AND status = 'queued'
        `)
        .run(
          `runner:${runId}`,
          runId,
          claimId,
          leaseExpiresAt,
          timestamp,
          timestamp,
          current.id,
        );
      if (transition.changes !== 1) {
        throw new Error("La tarea cambió de estado durante el leasing");
      }
      store.db
        .prepare(`
          INSERT INTO task_runs(
            id, task_id, agent, status, attempt, started_at, heartbeat_at
          ) VALUES(?, ?, ?, 'starting', ?, ?, ?)
        `)
        .run(runId, current.id, current.target_agent, current.attempt + 1, timestamp, timestamp);
      appendTaskEvent(store, current.id, "leased", {
        agent: current.target_agent,
        sessionId: `runner:${runId}`,
      }, { runId, leaseExpiresAt });
      const updated = store.db
        .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
        .get(current.id);
      syncTaskNode(store, updated);
      leased = { task: hydrateTask(updated), runId, claimId };
      return;
    }
  });
  return leased;
}

export function authorizeBackgroundTasks(store, context, taskIds) {
  if (
    context.delegatedTaskId ||
    (!context.operator && !TARGET_AGENTS.has(context.agent))
  ) {
    throw new Error("Un worker no puede autorizar consumo adicional en segundo plano");
  }
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map(String).filter(Boolean))];
  if (!ids.length) throw new Error("task_ids debe contener al menos una tarea");
  const authorized = [];
  store.withImmediateTransaction(() => {
    const existingRoots = store.db
      .prepare(`
        SELECT COUNT(DISTINCT root_id) AS count
        FROM delegated_tasks
        WHERE background_authorized = 1
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `)
      .get().count;
    const newRoots = new Set();
    for (const taskId of ids) {
      const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId);
      if (!row) throw new Error(`No existe la tarea ${taskId}`);
      if (row.parent_id) {
        throw new Error("Solo se autoriza la raíz; sus descendientes heredan el presupuesto");
      }
      if (!context.operator && row.created_by_session !== context.sessionId) {
        throw new Error(`La sesión actual no creó la tarea ${taskId}`);
      }
      if (row.status !== "queued") {
        throw new Error(`La tarea ${taskId} no está en cola (${row.status})`);
      }
      if (!row.background_authorized) newRoots.add(row.root_id);
      if (existingRoots + newRoots.size > 3) {
        throw new Error("Máximo de 3 raíces activas autorizadas en segundo plano");
      }
      store.db
        .prepare(`
          UPDATE delegated_tasks
          SET background_authorized = 1, updated_at = ?
          WHERE root_id = ? AND status = 'queued'
        `)
        .run(nowIso(), row.root_id);
      appendTaskEvent(store, taskId, "background_authorized", context);
      syncTaskNode(
        store,
        store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(taskId),
      );
      authorized.push(taskId);
    }
  });
  return { authorized };
}

function markDispatchFailure(store, leased, error) {
  const safeError = redactObviousSecrets(error?.message ?? String(error));
  store.withImmediateTransaction(() => {
    const row = store.db
      .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
      .get(leased.task.id);
    if (!row) return;
    const nextStatus = row.attempt < row.max_attempts ? "queued" : "failed";
    const timestamp = nowIso();
    const transition = store.db
      .prepare(`
        UPDATE delegated_tasks
        SET status = ?, run_id = NULL, claim_id = NULL,
            assigned_session_id = NULL, lease_expires_at = NULL,
            error = ?, updated_at = ?,
            completed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
        WHERE id = ? AND run_id = ? AND status = 'running'
      `)
      .run(nextStatus, safeError, timestamp, nextStatus, timestamp, row.id, leased.runId);
    if (transition.changes !== 1) return;
    releaseTaskClaim(store, row);
    store.db
      .prepare(`
        UPDATE task_runs
        SET status = 'failed', error = ?, ended_at = ?
        WHERE id = ?
      `)
      .run(safeError, timestamp, leased.runId);
    appendTaskEvent(store, row.id, "dispatch_failed", {}, { error: safeError });
    syncTaskNode(
      store,
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
    );
  });
}

function spawnRunner(store, leased) {
  const child = spawn(
    process.execPath,
    [
      "--no-warnings",
      RUNNER_PATH,
      "--root",
      store.root,
      "--db",
      store.databasePath,
      "--run",
      leased.runId,
    ],
    {
      cwd: store.root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: sanitizedEnvironment({
        NIDOKEY_GRAPH_AGENT: leased.task.targetAgent,
        NIDOKEY_GRAPH_TASK_ID: leased.task.id,
        NIDOKEY_GRAPH_RUN_ID: leased.runId,
        NIDOKEY_GRAPH_ROOT: store.root,
        NIDOKEY_GRAPH_DB: store.databasePath,
      }),
    },
  );
  try {
    if (!Number.isInteger(child.pid)) {
      throw new Error("No se pudo obtener el PID del runner");
    }
    store.db
      .prepare("UPDATE task_runs SET worker_pid = ?, status = 'running' WHERE id = ?")
      .run(child.pid, leased.runId);
    appendTaskEvent(store, leased.task.id, "runner_started", {
      agent: leased.task.targetAgent,
      sessionId: `runner:${leased.runId}`,
    }, { runId: leased.runId, workerPid: child.pid });
    child.unref();
    return child.pid;
  } catch (error) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The child may already have exited.
    }
    throw error;
  }
}

export function dispatchEligibleTasks(store, options = {}) {
  if (process.env.NIDOKEY_GRAPH_DISABLE_BACKGROUND === "1") {
    return { enabled: false, launched: [], reason: "Deshabilitado por entorno" };
  }
  const reconciled = reconcileExpiredTasks(store);
  const launched = [];
  const maximum = clampInteger(options.maximum, 1, MAX_TOTAL_RUNNING, MAX_TOTAL_RUNNING);
  while (launched.length < maximum) {
    const leased = leaseNextEligibleTask(store);
    if (!leased) break;
    try {
      const workerPid = spawnRunner(store, leased);
      launched.push({
        taskId: leased.task.id,
        runId: leased.runId,
        targetAgent: leased.task.targetAgent,
        workerPid,
      });
    } catch (error) {
      markDispatchFailure(store, leased, error);
    }
  }
  return { enabled: true, reconciled, launched };
}

export function orchestrationStatus(store) {
  const counts = store.db
    .prepare(`
      SELECT status, COUNT(*) AS count
      FROM delegated_tasks GROUP BY status ORDER BY status
    `)
    .all();
  const activeRuns = store.db
    .prepare(`
      SELECT run.id, run.task_id, run.agent, run.status, run.worker_pid,
             run.child_pid, run.external_session_id, run.started_at,
             run.heartbeat_at, task.title, task.scope, task.mode
      FROM task_runs run
      JOIN delegated_tasks task ON task.id = run.task_id
      WHERE run.status IN ('starting', 'running', 'cancel_requested')
      ORDER BY run.started_at
    `)
    .all();
  return {
    backgroundEnabled: process.env.NIDOKEY_GRAPH_DISABLE_BACKGROUND !== "1",
    limits: {
      totalConcurrent: MAX_TOTAL_RUNNING,
      perAgentConcurrent: MAX_RUNNING_PER_AGENT,
      maxDepth: 3,
      maxDirectChildren: 3,
      maxDescendantsDefault: 8,
    },
    counts: Object.fromEntries(counts.map((row) => [row.status, row.count])),
    activeRuns,
    runnerPath: RUNNER_PATH,
  };
}

export function heartbeatRun(store, runId, childPid = null) {
  const run = store.db.prepare("SELECT * FROM task_runs WHERE id = ?").get(runId);
  if (!run) throw new Error(`No existe la ejecución ${runId}`);
  const task = store.db
    .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
    .get(run.task_id);
  if (!task) throw new Error(`No existe la tarea ${run.task_id}`);
  const timestamp = nowIso();
  const leaseExpiresAt = new Date(
    Date.now() + DEFAULT_LEASE_SECONDS * 1000,
  ).toISOString();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        UPDATE task_runs
        SET heartbeat_at = ?, child_pid = COALESCE(?, child_pid), status = 'running'
        WHERE id = ?
      `)
      .run(timestamp, childPid, runId);
    store.db
      .prepare(`
        UPDATE delegated_tasks SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('running', 'cancel_requested')
      `)
      .run(leaseExpiresAt, timestamp, task.id);
    if (task.claim_id) {
      store.db
        .prepare(`
          UPDATE claims SET expires_at = ?, updated_at = ?
          WHERE id = ? AND status = 'active'
        `)
        .run(leaseExpiresAt, timestamp, task.claim_id);
    }
  });
  return store.db
    .prepare("SELECT status FROM delegated_tasks WHERE id = ?")
    .get(task.id)?.status;
}

export function finalizeRunner(store, runId, input = {}) {
  const run = store.db.prepare("SELECT * FROM task_runs WHERE id = ?").get(runId);
  if (!run) throw new Error(`No existe la ejecución ${runId}`);
  const row = store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(run.task_id);
  if (!row) throw new Error(`No existe la tarea ${run.task_id}`);
  const timestamp = nowIso();
  const safeError = input.error ? redactObviousSecrets(input.error) : null;
  if (row.status === "succeeded" || row.status === "needs_input") {
    store.db
      .prepare(`
        UPDATE task_runs
        SET status = ?, exit_code = ?, ended_at = ?, error = ?
        WHERE id = ?
      `)
      .run(row.status, input.exitCode ?? 0, timestamp, safeError, runId);
    return hydrateTask(row);
  }
  if (row.status === "cancel_requested") {
    store.withImmediateTransaction(() => {
      const current = store.db
        .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
        .get(row.id);
      if (!current || current.status !== "cancel_requested" || current.run_id !== runId) {
        return;
      }
      const transition = store.db
        .prepare(`
          UPDATE delegated_tasks
          SET status = 'cancelled', completed_at = ?, updated_at = ?,
              lease_expires_at = NULL
          WHERE id = ? AND status = 'cancel_requested' AND run_id = ?
        `)
        .run(timestamp, timestamp, row.id, runId);
      if (transition.changes !== 1) return;
      releaseTaskClaim(store, current);
      store.db
        .prepare(`
          UPDATE task_runs
          SET status = 'cancelled', exit_code = ?, ended_at = ?, error = ?
          WHERE id = ?
        `)
        .run(input.exitCode ?? null, timestamp, safeError ?? "Cancelada", runId);
      appendTaskEvent(store, row.id, "cancelled", {
        agent: row.target_agent,
        sessionId: `runner:${runId}`,
      });
      syncTaskNode(
        store,
        store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
      );
    });
    return hydrateTask(
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
    );
  }
  if (input.result) {
    let completed;
    try {
      completed = completeDelegatedTask(
        store,
        {
          agent: row.target_agent,
          sessionId: `runner:${runId}`,
          delegatedTaskId: row.id,
          backgroundRunId: runId,
        },
        {
          task_id: row.id,
          outcome: input.result.outcome,
          summary: input.result.summary,
          changed_paths: input.result.changedPaths,
          tests: input.result.tests,
          next_steps: input.result.nextSteps,
          needs_user_input: input.result.needsUserInput,
        },
      ).task;
    } catch (error) {
      const current = store.db
        .prepare("SELECT status FROM delegated_tasks WHERE id = ?")
        .get(row.id);
      if (current?.status === "cancel_requested") {
        return finalizeRunner(store, runId, { ...input, result: null });
      }
      throw error;
    }
    store.db
      .prepare(`
        UPDATE task_runs
        SET exit_code = ?, ended_at = COALESCE(ended_at, ?), error = ?
        WHERE id = ?
      `)
      .run(input.exitCode ?? 0, timestamp, safeError, runId);
    return completed;
  }
  const shouldRetry =
    Number(input.exitCode ?? 1) !== 0 && row.attempt < row.max_attempts;
  store.withImmediateTransaction(() => {
    const current = store.db
      .prepare("SELECT * FROM delegated_tasks WHERE id = ?")
      .get(row.id);
    if (!current || current.status !== "running" || current.run_id !== runId) return;
    const nextStatus = shouldRetry ? "queued" : "failed";
    const transition = store.db
      .prepare(`
        UPDATE delegated_tasks
        SET status = ?, error = ?, run_id = NULL, claim_id = NULL,
            assigned_session_id = NULL, lease_expires_at = NULL,
            updated_at = ?, completed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
        WHERE id = ? AND status = 'running' AND run_id = ?
      `)
      .run(
        nextStatus,
        safeError ?? `El proceso terminó con código ${input.exitCode ?? "desconocido"}`,
        timestamp,
        nextStatus,
        timestamp,
        row.id,
        runId,
      );
    if (transition.changes !== 1) return;
    releaseTaskClaim(store, current);
    store.db
      .prepare(`
        UPDATE task_runs
        SET status = ?, exit_code = ?, ended_at = ?, error = ?
        WHERE id = ?
      `)
      .run(
        shouldRetry ? "retrying" : "failed",
        input.exitCode ?? null,
        timestamp,
        safeError,
        runId,
      );
    appendTaskEvent(store, row.id, shouldRetry ? "retry_scheduled" : "failed", {
      agent: row.target_agent,
      sessionId: `runner:${runId}`,
    }, { exitCode: input.exitCode, error: safeError });
    syncTaskNode(
      store,
      store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
    );
  });
  return hydrateTask(
    store.db.prepare("SELECT * FROM delegated_tasks WHERE id = ?").get(row.id),
  );
}

export function setRunPaths(store, runId, input = {}) {
  store.db
    .prepare(`
      UPDATE task_runs
      SET log_path = ?, result_path = ?, child_pid = COALESCE(?, child_pid),
          external_session_id = COALESCE(?, external_session_id),
          heartbeat_at = ?
      WHERE id = ?
    `)
    .run(
      input.logPath ?? null,
      input.resultPath ?? null,
      input.childPid ?? null,
      input.externalSessionId ?? null,
      nowIso(),
      runId,
    );
}

export function taskInstructionsForRunner(store, taskId) {
  const details = getDelegatedTask(store, taskId);
  return details;
}

export const orchestrationLimits = {
  maxTotalRunning: MAX_TOTAL_RUNNING,
  maxRunningPerAgent: MAX_RUNNING_PER_AGENT,
};
