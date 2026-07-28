import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(MODULE_DIR, "../../..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function resolveProjectRoot(explicitRoot) {
  return path.resolve(
    explicitRoot ??
      argumentValue("--root") ??
      process.env.NIDOKEY_GRAPH_ROOT ??
      DEFAULT_ROOT,
  );
}

export function resolveDatabasePath(root, explicitPath) {
  return path.resolve(
    explicitPath ??
      argumentValue("--db") ??
      process.env.NIDOKEY_GRAPH_DB ??
      path.join(root, ".graphrag", "nidokey.sqlite"),
  );
}

export function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function openStore(options = {}) {
  const root = resolveProjectRoot(options.root);
  const databasePath = resolveDatabasePath(root, options.databasePath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA temp_store = MEMORY");

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      language TEXT NOT NULL,
      authority REAL NOT NULL DEFAULT 0.5,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT,
      start_line INTEGER,
      end_line INTEGER,
      signature TEXT,
      content TEXT,
      search_text TEXT NOT NULL,
      authority REAL NOT NULL DEFAULT 0.5,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
    CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);

    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      source_file TEXT,
      derived INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, relation, source_file)
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
    CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);

    CREATE TABLE IF NOT EXISTS agents (
      name TEXT PRIMARY KEY,
      client_name TEXT,
      client_version TEXT,
      session_id TEXT,
      current_task TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      last_seen_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      session_id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      client_name TEXT,
      client_version TEXT,
      current_task TEXT,
      delegated_task_id TEXT,
      parent_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_seen_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_agent_sessions_active
      ON agent_sessions(status, last_seen_at DESC, agent);

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_claims_active
      ON claims(status, expires_at, scope);

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      paths_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      paths_json TEXT NOT NULL DEFAULT '[]',
      tests_json TEXT NOT NULL DEFAULT '[]',
      next_steps_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      session_id TEXT,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created
      ON activity(created_at DESC);

    CREATE TABLE IF NOT EXISTS delegated_tasks (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      parent_id TEXT,
      created_by_agent TEXT NOT NULL,
      created_by_session TEXT NOT NULL,
      target_agent TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      acceptance_json TEXT NOT NULL DEFAULT '[]',
      scope TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'analyze',
      background_authorized INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 1,
      depth INTEGER NOT NULL DEFAULT 0,
      max_depth INTEGER NOT NULL DEFAULT 2,
      max_descendants INTEGER NOT NULL DEFAULT 8,
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      timeout_seconds INTEGER NOT NULL DEFAULT 2700,
      idempotency_key TEXT,
      fingerprint TEXT NOT NULL,
      assigned_session_id TEXT,
      run_id TEXT,
      claim_id TEXT,
      lease_expires_at TEXT,
      result_handoff_id TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY(parent_id) REFERENCES delegated_tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_delegated_tasks_queue
      ON delegated_tasks(status, priority DESC, created_at);
    CREATE INDEX IF NOT EXISTS idx_delegated_tasks_target
      ON delegated_tasks(target_agent, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_delegated_tasks_root
      ON delegated_tasks(root_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_delegated_tasks_idempotency
      ON delegated_tasks(root_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      PRIMARY KEY(task_id, depends_on_task_id),
      FOREIGN KEY(task_id) REFERENCES delegated_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(depends_on_task_id) REFERENCES delegated_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      event TEXT NOT NULL,
      agent TEXT,
      session_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES delegated_tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_events_task
      ON task_events(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'starting',
      worker_pid INTEGER,
      child_pid INTEGER,
      external_session_id TEXT,
      log_path TEXT,
      result_path TEXT,
      attempt INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      ended_at TEXT,
      exit_code INTEGER,
      error TEXT,
      FOREIGN KEY(task_id) REFERENCES delegated_tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_runs_active
      ON task_runs(status, heartbeat_at DESC);
  `);

  const delegatedColumns = new Set(
    db.prepare("PRAGMA table_info(delegated_tasks)").all().map((column) => column.name),
  );
  if (!delegatedColumns.has("background_authorized")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        "ALTER TABLE delegated_tasks ADD COLUMN background_authorized INTEGER NOT NULL DEFAULT 0",
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }

  db.exec(`
    DELETE FROM edges
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM edges
      GROUP BY source_id, target_id, relation, COALESCE(source_file, '')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_identity
      ON edges(source_id, target_id, relation, COALESCE(source_file, ''));
    PRAGMA user_version = 3;
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(
        id UNINDEXED,
        name,
        file_path,
        search_text,
        tokenize = 'unicode61 remove_diacritics 2'
      )
    `);
  } catch (error) {
    db.close();
    throw new Error(`SQLite FTS5 is required: ${error.message}`);
  }

  const statements = {
    getMetadata: db.prepare("SELECT value FROM metadata WHERE key = ?"),
    setMetadata: db.prepare(`
      INSERT INTO metadata(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
    upsertFile: db.prepare(`
      INSERT INTO files(path, hash, size, mtime_ms, language, authority, indexed_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        hash = excluded.hash,
        size = excluded.size,
        mtime_ms = excluded.mtime_ms,
        language = excluded.language,
        authority = excluded.authority,
        indexed_at = excluded.indexed_at
    `),
    deleteFile: db.prepare("DELETE FROM files WHERE path = ?"),
    upsertNode: db.prepare(`
      INSERT INTO nodes(
        id, kind, name, file_path, start_line, end_line, signature,
        content, search_text, authority, metadata_json, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        name = excluded.name,
        file_path = excluded.file_path,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        signature = excluded.signature,
        content = excluded.content,
        search_text = excluded.search_text,
        authority = excluded.authority,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `),
    deleteFts: db.prepare("DELETE FROM node_fts WHERE id = ?"),
    insertFts: db.prepare(`
      INSERT INTO node_fts(id, name, file_path, search_text)
      VALUES(?, ?, ?, ?)
    `),
    upsertEdge: db.prepare(`
      INSERT OR IGNORE INTO edges(
        source_id, target_id, relation, source_file, derived, metadata_json, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?)
    `),
    deleteEdgesForFile: db.prepare("DELETE FROM edges WHERE source_file = ?"),
  };

  function metadata(key, fallback = null) {
    return statements.getMetadata.get(key)?.value ?? fallback;
  }

  function setMetadata(key, value) {
    statements.setMetadata.run(key, String(value));
  }

  function upsertFile(file) {
    statements.upsertFile.run(
      file.path,
      file.hash,
      file.size,
      file.mtimeMs,
      file.language,
      file.authority,
      file.indexedAt ?? nowIso(),
    );
  }

  function upsertNode(node) {
    const updatedAt = node.updatedAt ?? nowIso();
    const metadataJson = JSON.stringify(node.metadata ?? {});
    statements.upsertNode.run(
      node.id,
      node.kind,
      node.name,
      node.filePath ?? null,
      node.startLine ?? null,
      node.endLine ?? null,
      node.signature ?? null,
      node.content ?? null,
      node.searchText ?? [node.name, node.signature, node.content].filter(Boolean).join("\n"),
      node.authority ?? 0.5,
      metadataJson,
      updatedAt,
    );
    statements.deleteFts.run(node.id);
    statements.insertFts.run(
      node.id,
      node.name,
      node.filePath ?? "",
      node.searchText ?? [node.name, node.signature, node.content].filter(Boolean).join("\n"),
    );
  }

  function upsertEdge(edge) {
    statements.upsertEdge.run(
      edge.sourceId,
      edge.targetId,
      edge.relation,
      edge.sourceFile ?? "",
      edge.derived ? 1 : 0,
      JSON.stringify(edge.metadata ?? {}),
      nowIso(),
    );
  }

  function deleteNodesForFile(filePath) {
    const ids = db
      .prepare("SELECT id FROM nodes WHERE file_path = ?")
      .all(filePath)
      .map((row) => row.id);
    statements.deleteEdgesForFile.run(filePath);
    for (const id of ids) statements.deleteFts.run(id);
    db.prepare("DELETE FROM nodes WHERE file_path = ?").run(filePath);
  }

  function withImmediateTransaction(operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original error.
      }
      throw error;
    }
  }

  function getNode(id) {
    const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id);
    return row ? hydrateNode(row) : null;
  }

  function hydrateNode(row) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      signature: row.signature,
      content: row.content,
      searchText: row.search_text,
      authority: row.authority,
      metadata: safeJsonParse(row.metadata_json),
      updatedAt: row.updated_at,
    };
  }

  return {
    root,
    databasePath,
    db,
    metadata,
    setMetadata,
    upsertFile,
    upsertNode,
    upsertEdge,
    deleteFile(filePath) {
      statements.deleteFile.run(filePath);
    },
    deleteNodesForFile,
    withImmediateTransaction,
    getNode,
    hydrateNode,
    close() {
      db.close();
    },
  };
}
