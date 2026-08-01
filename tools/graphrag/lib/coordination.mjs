import crypto from "node:crypto";
import { normalizePath, nowIso, safeJsonParse } from "./store.mjs";

function normalizeAgent(value) {
  const normalized = String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  if (normalized.includes("claude")) return "claude-code";
  if (normalized.includes("codex") || normalized.includes("chatgpt")) return "codex";
  return normalized || "unknown";
}

function normalizeScope(scope) {
  const normalized = normalizePath(String(scope ?? "").trim()).replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function scopesOverlap(left, right) {
  const a = normalizeScope(left);
  const b = normalizeScope(right);
  if (!a || !b) return false;
  if (a === "*" || b === "*") return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function addActivity(store, agent, sessionId, action, payload = {}) {
  store.db
    .prepare(`
      INSERT INTO activity(agent, session_id, action, payload_json, created_at)
      VALUES(?, ?, ?, ?, ?)
    `)
    .run(agent, sessionId ?? null, action, JSON.stringify(payload), nowIso());
}

function agentNode(store, agent, metadata = {}) {
  store.upsertNode({
    id: `agent:${agent}`,
    kind: "agent",
    name: agent,
    signature: `Development agent ${agent}`,
    content:
      agent === "claude-code"
        ? "Claude Code trabaja en paralelo sobre Nidokey mediante el Graph RAG compartido."
        : agent === "codex"
          ? "Codex trabaja en paralelo sobre Nidokey mediante el Graph RAG compartido."
          : `Agente de desarrollo ${agent}.`,
    searchText: `${agent} development agent parallel coordination`,
    authority: 1,
    metadata,
  });
}

export function registerAgent(store, input = {}) {
  const agent = normalizeAgent(input.agent);
  const sessionId = String(input.session_id ?? `${agent}-${process.pid}-${Date.now()}`);
  const timestamp = nowIso();
  const metadata = input.metadata ?? {};
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        INSERT INTO agents(
          name, client_name, client_version, session_id, current_task,
          status, last_seen_at, metadata_json
        ) VALUES(?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          client_name = excluded.client_name,
          client_version = excluded.client_version,
          session_id = excluded.session_id,
          current_task = excluded.current_task,
          status = 'active',
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json
      `)
      .run(
        agent,
        input.client_name ?? null,
        input.client_version ?? null,
        sessionId,
        input.task ?? null,
        timestamp,
        JSON.stringify(metadata),
      );
    store.db
      .prepare(`
        INSERT INTO agent_sessions(
          session_id, agent, client_name, client_version, current_task,
          delegated_task_id, parent_session_id, status, last_seen_at, metadata_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          agent = excluded.agent,
          client_name = excluded.client_name,
          client_version = excluded.client_version,
          current_task = excluded.current_task,
          delegated_task_id = excluded.delegated_task_id,
          parent_session_id = excluded.parent_session_id,
          status = 'active',
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json
      `)
      .run(
        sessionId,
        agent,
        input.client_name ?? null,
        input.client_version ?? null,
        input.task ?? null,
        input.delegated_task_id ?? null,
        input.parent_session_id ?? null,
        timestamp,
        JSON.stringify(metadata),
      );
    agentNode(store, agent, { sessionId, task: input.task ?? null, ...metadata });
    addActivity(store, agent, sessionId, "registered", { task: input.task ?? null });
  });
  return { agent, sessionId, registeredAt: timestamp };
}

export function touchAgent(store, context, action = "tool_call") {
  const timestamp = nowIso();
  store.db
    .prepare(`
      UPDATE agents SET last_seen_at = ?, status = 'active', session_id = ?
      WHERE name = ?
    `)
    .run(timestamp, context.sessionId, context.agent);
  store.db
    .prepare(`
      UPDATE agent_sessions
      SET last_seen_at = ?, status = 'active'
      WHERE session_id = ?
    `)
    .run(timestamp, context.sessionId);
  addActivity(store, context.agent, context.sessionId, action);
}

function expireClaims(store) {
  const expired = store.db
    .prepare(`
      SELECT id, agent, session_id FROM claims
      WHERE status = 'active' AND expires_at <= ?
    `)
    .all(nowIso());
  for (const claim of expired) {
    store.db
      .prepare("UPDATE claims SET status = 'expired', updated_at = ? WHERE id = ?")
      .run(nowIso(), claim.id);
    store.db.prepare("DELETE FROM node_fts WHERE id = ?").run(`claim:${claim.id}`);
    store.db.prepare("DELETE FROM nodes WHERE id = ?").run(`claim:${claim.id}`);
    addActivity(store, claim.agent, claim.session_id, "claim_expired", { claimId: claim.id });
  }
}

export function claimScope(store, context, input) {
  const scope = normalizeScope(input.scope);
  const task = String(input.task ?? "").trim();
  if (!scope) throw new Error("scope es obligatorio");
  if (!task) throw new Error("task es obligatorio");
  const ttlMinutes = Math.min(Math.max(Number(input.ttl_minutes ?? 120), 5), 1440);
  const claimId = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  let result;

  store.withImmediateTransaction(() => {
    expireClaims(store);
    const active = store.db
      .prepare(`
        SELECT * FROM claims
        WHERE status = 'active' AND expires_at > ?
        ORDER BY created_at
      `)
      .all(nowIso());
    const ownClaim = active.find(
      (claim) => claim.session_id === context.sessionId && claim.scope === scope,
    );
    if (ownClaim) {
      store.db
        .prepare(`
          UPDATE claims SET task = ?, updated_at = ?, expires_at = ? WHERE id = ?
        `)
        .run(task, createdAt, expiresAt, ownClaim.id);
      addActivity(store, context.agent, context.sessionId, "claim_refreshed", {
        claimId: ownClaim.id,
        scope,
        task,
        expiresAt,
      });
      result = {
        acquired: true,
        id: ownClaim.id,
        scope,
        task,
        expiresAt,
        refreshed: true,
      };
      return;
    }
    const conflict = active.find(
      (claim) =>
        claim.session_id !== context.sessionId && scopesOverlap(claim.scope, scope),
    );
    if (conflict) {
      addActivity(store, context.agent, context.sessionId, "claim_conflict", {
        scope,
        conflictingClaim: conflict.id,
        conflictingAgent: conflict.agent,
      });
      result = {
        acquired: false,
        scope,
        conflict: {
          id: conflict.id,
          agent: conflict.agent,
          sessionId: conflict.session_id,
          scope: conflict.scope,
          task: conflict.task,
          expiresAt: conflict.expires_at,
        },
        guidance:
          "No edites el ámbito solapado. Divide el trabajo, espera, o usa publish_handoff para coordinarte.",
      };
      return;
    }

    store.db
      .prepare(`
        INSERT INTO claims(
          id, agent, session_id, scope, task, status, created_at, updated_at, expires_at
        ) VALUES(?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `)
      .run(
        claimId,
        context.agent,
        context.sessionId,
        scope,
        task,
        createdAt,
        createdAt,
        expiresAt,
      );
    store.upsertNode({
      id: `claim:${claimId}`,
      kind: "work_claim",
      name: `${context.agent}: ${scope}`,
      signature: task,
      content: `${context.agent} reclama ${scope} para ${task}`,
      searchText: `${context.agent} ${scope} ${task}`,
      authority: 0.95,
      metadata: { agent: context.agent, sessionId: context.sessionId, scope, task, expiresAt },
    });
    store.upsertEdge({
      sourceId: `agent:${context.agent}`,
      targetId: `claim:${claimId}`,
      relation: "CLAIMS",
      metadata: { expiresAt },
    });
    const fileNode = store.getNode(`file:${scope}`);
    if (fileNode) {
      store.upsertEdge({
        sourceId: `claim:${claimId}`,
        targetId: fileNode.id,
        relation: "SCOPES",
      });
    }
    addActivity(store, context.agent, context.sessionId, "claim_acquired", {
      claimId,
      scope,
      task,
      expiresAt,
    });
    result = { acquired: true, id: claimId, scope, task, expiresAt };
  });
  return result;
}

export function releaseClaim(store, context, input = {}) {
  const claimId = input.claim_id ? String(input.claim_id) : null;
  const scope = input.scope ? normalizeScope(input.scope) : null;
  if (!claimId && !scope) throw new Error("claim_id o scope es obligatorio");
  let rows = [];
  store.withImmediateTransaction(() => {
    rows = claimId
      ? store.db
          .prepare(`
            SELECT * FROM claims
            WHERE id = ? AND session_id = ? AND status = 'active'
          `)
          .all(claimId, context.sessionId)
      : store.db
          .prepare(`
            SELECT * FROM claims
            WHERE scope = ? AND session_id = ? AND status = 'active'
          `)
          .all(scope, context.sessionId);
    for (const row of rows) {
      store.db
        .prepare("UPDATE claims SET status = 'released', updated_at = ? WHERE id = ?")
        .run(nowIso(), row.id);
      store.db.prepare("DELETE FROM node_fts WHERE id = ?").run(`claim:${row.id}`);
      store.db.prepare("DELETE FROM nodes WHERE id = ?").run(`claim:${row.id}`);
      addActivity(store, context.agent, context.sessionId, "claim_released", {
        claimId: row.id,
        scope: row.scope,
      });
    }
  });
  return { released: rows.map((row) => ({ id: row.id, scope: row.scope })) };
}

export function releaseSessionClaims(store, context) {
  try {
    const rows = store.db
      .prepare("SELECT id FROM claims WHERE session_id = ? AND status = 'active'")
      .all(context.sessionId);
    store.withImmediateTransaction(() => {
      for (const row of rows) {
        store.db
          .prepare("UPDATE claims SET status = 'released', updated_at = ? WHERE id = ?")
          .run(nowIso(), row.id);
        store.db.prepare("DELETE FROM node_fts WHERE id = ?").run(`claim:${row.id}`);
        store.db.prepare("DELETE FROM nodes WHERE id = ?").run(`claim:${row.id}`);
      }
      store.db
        .prepare("UPDATE agents SET status = 'disconnected', last_seen_at = ? WHERE name = ? AND session_id = ?")
        .run(nowIso(), context.agent, context.sessionId);
      store.db
        .prepare(`
          UPDATE agent_sessions
          SET status = 'disconnected', last_seen_at = ?
          WHERE session_id = ?
        `)
        .run(nowIso(), context.sessionId);
      addActivity(store, context.agent, context.sessionId, "disconnected");
    });
  } catch {
    // Shutdown cleanup is best-effort.
  }
}

export function activeWork(store, options = {}) {
  store.withImmediateTransaction(() => expireClaims(store));
  const activeSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const includeHistory = options.includeHistory === true;
  const historyLimit = Math.min(
    Math.max(Number(options.historyLimit ?? 1), 1),
    10,
  );
  return {
    agents: store.db
      .prepare(`
        SELECT agent AS name, client_name, client_version, session_id,
               current_task, delegated_task_id, parent_session_id,
               status, last_seen_at, metadata_json
        FROM agent_sessions
        WHERE last_seen_at > ? AND status != 'disconnected'
        ORDER BY last_seen_at DESC
      `)
      .all(activeSince)
      .map((row) => ({
        name: row.name,
        clientName: row.client_name,
        clientVersion: row.client_version,
        sessionId: row.session_id,
        currentTask: row.current_task,
        delegatedTaskId: row.delegated_task_id,
        parentSessionId: row.parent_session_id,
        status: row.status,
        lastSeenAt: row.last_seen_at,
        metadata: safeJsonParse(row.metadata_json),
      })),
    claims: store.db
      .prepare(`
        SELECT id, agent, session_id, scope, task, created_at, expires_at
        FROM claims
        WHERE status = 'active' AND expires_at > ?
        ORDER BY created_at
      `)
      .all(nowIso()),
    decisions: includeHistory
      ? store.db
          .prepare(`
            SELECT id, agent, session_id, title, rationale, paths_json, created_at
            FROM decisions ORDER BY created_at DESC LIMIT ?
          `)
          .all(historyLimit)
          .map((row) => ({ ...row, paths: safeJsonParse(row.paths_json, []) }))
      : [],
    handoffs: includeHistory
      ? store.db
          .prepare(`
            SELECT id, agent, session_id, summary, paths_json, tests_json,
                   next_steps_json, created_at
            FROM handoffs ORDER BY created_at DESC LIMIT ?
          `)
          .all(historyLimit)
          .map((row) => ({
            ...row,
            paths: safeJsonParse(row.paths_json, []),
            tests: safeJsonParse(row.tests_json, []),
            nextSteps: safeJsonParse(row.next_steps_json, []),
          }))
      : [],
  };
}

function linkPaths(store, sourceId, paths) {
  for (const rawPath of paths) {
    const filePath = normalizeScope(rawPath);
    const fileNode = store.getNode(`file:${filePath}`);
    if (fileNode) {
      store.upsertEdge({ sourceId, targetId: fileNode.id, relation: "AFFECTS" });
    }
  }
}

export function recordDecision(store, context, input) {
  const title = String(input.title ?? "").trim();
  const rationale = String(input.rationale ?? "").trim();
  const paths = Array.isArray(input.paths) ? input.paths.map(normalizeScope).filter(Boolean) : [];
  if (!title || !rationale) throw new Error("title y rationale son obligatorios");
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        INSERT INTO decisions(id, agent, session_id, title, rationale, paths_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, context.agent, context.sessionId, title, rationale, JSON.stringify(paths), createdAt);
    store.upsertNode({
      id: `decision:${id}`,
      kind: "decision",
      name: title,
      signature: `${context.agent} decision`,
      content: rationale,
      searchText: `${title}\n${rationale}\n${paths.join(" ")}`,
      authority: 0.92,
      metadata: { agent: context.agent, sessionId: context.sessionId, paths, createdAt },
    });
    store.upsertEdge({
      sourceId: `agent:${context.agent}`,
      targetId: `decision:${id}`,
      relation: "DECIDED",
    });
    linkPaths(store, `decision:${id}`, paths);
    addActivity(store, context.agent, context.sessionId, "decision_recorded", { id, title, paths });
  });
  return { id, title, paths, createdAt };
}

export function publishHandoff(store, context, input) {
  const summary = String(input.summary ?? "").trim();
  if (!summary) throw new Error("summary es obligatorio");
  const paths = Array.isArray(input.paths) ? input.paths.map(normalizeScope).filter(Boolean) : [];
  const tests = Array.isArray(input.tests) ? input.tests.map(String) : [];
  const nextSteps = Array.isArray(input.next_steps) ? input.next_steps.map(String) : [];
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  store.withImmediateTransaction(() => {
    store.db
      .prepare(`
        INSERT INTO handoffs(
          id, agent, session_id, summary, paths_json, tests_json, next_steps_json, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        context.agent,
        context.sessionId,
        summary,
        JSON.stringify(paths),
        JSON.stringify(tests),
        JSON.stringify(nextSteps),
        createdAt,
      );
    store.upsertNode({
      id: `handoff:${id}`,
      kind: "handoff",
      name: `${context.agent} handoff`,
      signature: summary.slice(0, 300),
      content: `${summary}\nTests: ${tests.join("; ")}\nSiguiente: ${nextSteps.join("; ")}`,
      searchText: `${summary}\n${paths.join(" ")}\n${tests.join(" ")}\n${nextSteps.join(" ")}`,
      authority: 0.92,
      metadata: {
        agent: context.agent,
        sessionId: context.sessionId,
        paths,
        tests,
        nextSteps,
        createdAt,
      },
    });
    store.upsertEdge({
      sourceId: `agent:${context.agent}`,
      targetId: `handoff:${id}`,
      relation: "PUBLISHED",
    });
    linkPaths(store, `handoff:${id}`, paths);
    addActivity(store, context.agent, context.sessionId, "handoff_published", {
      id,
      paths,
    });
  });
  return { id, summary, paths, tests, nextSteps, createdAt };
}

export function inferAgent(clientInfo = {}) {
  return normalizeAgent(process.env.NIDOKEY_GRAPH_AGENT ?? clientInfo.name ?? "unknown");
}
