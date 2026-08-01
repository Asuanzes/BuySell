import path from "node:path";
import { normalizePath, safeJsonParse } from "./store.mjs";

const STOP_WORDS = new Set([
  "a",
  "al",
  "and",
  "como",
  "con",
  "de",
  "del",
  "desde",
  "donde",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "for",
  "from",
  "how",
  "la",
  "las",
  "los",
  "of",
  "para",
  "por",
  "que",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

function tokensFor(query) {
  return [
    ...new Set(
      query
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .match(/[\p{L}\p{N}_@.-]{2,}/gu)
        ?.filter((token) => !STOP_WORDS.has(token)) ?? [],
    ),
  ].slice(0, 20);
}

function ftsExpression(tokens) {
  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" OR ");
}

function excerpt(content, tokens, maxLength = 900) {
  if (!content) return "";
  const normalized = content.toLowerCase();
  const positions = tokens
    .map((token) => normalized.indexOf(token.toLowerCase()))
    .filter((position) => position >= 0);
  const first = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, first - Math.floor(maxLength / 3));
  const end = Math.min(content.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

function clipText(value, maximum) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= maximum
    ? text
    : `${text.slice(0, Math.max(0, maximum - 1))}…`;
}

function compactMetadata(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return clipText(value, 240);
  if (typeof value !== "object") return value;
  if (depth >= 2) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => compactMetadata(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .map(([key, item]) => [key, compactMetadata(item, depth + 1)]),
  );
}

function citation(node) {
  if (!node.filePath) return null;
  return node.startLine ? `${node.filePath}:${node.startLine}` : node.filePath;
}

function compactNode(node, tokens = [], options = {}) {
  const result = {
    id: node.id,
    kind: node.kind,
    name: clipText(node.name, 180),
    citation: citation(node),
    signature: node.signature ? clipText(node.signature, 240) : null,
    excerpt: excerpt(
      node.content,
      tokens,
      Math.min(Math.max(Number(options.excerptLength ?? 900), 120), 900),
    ),
    authority: node.authority,
  };
  if (options.includeMetadata === true) {
    result.metadata = compactMetadata(node.metadata);
  }
  return result;
}

function seedRows(store, query, maxResults, nodeKinds) {
  const tokens = tokensFor(query);
  const kindFilter = nodeKinds?.length
    ? ` AND n.kind IN (${nodeKinds.map(() => "?").join(", ")})`
    : "";
  let rows = [];
  if (tokens.length) {
    try {
      rows = store.db
        .prepare(`
          SELECT n.*, bm25(node_fts, 0.0, 7.0, 2.0, 1.0) AS fts_rank
          FROM node_fts
          JOIN nodes n ON n.id = node_fts.id
          WHERE node_fts MATCH ?${kindFilter}
          ORDER BY fts_rank ASC, n.authority DESC
          LIMIT ?
        `)
        .all(ftsExpression(tokens), ...(nodeKinds ?? []), maxResults);
    } catch {
      rows = [];
    }
  }
  if (!rows.length) {
    const like = `%${query.trim().slice(0, 120)}%`;
    rows = store.db
      .prepare(`
        SELECT n.*, 0 AS fts_rank
        FROM nodes n
        WHERE (n.name LIKE ? OR n.search_text LIKE ?)${kindFilter}
        ORDER BY n.authority DESC, n.name ASC
        LIMIT ?
      `)
      .all(like, like, ...(nodeKinds ?? []), maxResults);
  }
  return { rows, tokens };
}

function neighborRows(store, nodeId) {
  return store.db
    .prepare(`
      SELECT
        e.relation,
        e.source_id,
        e.target_id,
        e.metadata_json AS edge_metadata_json,
        CASE WHEN e.source_id = ? THEN 'out' ELSE 'in' END AS direction,
        n.*
      FROM edges e
      JOIN nodes n
        ON n.id = CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END
      WHERE e.source_id = ? OR e.target_id = ?
      ORDER BY n.authority DESC, e.relation, n.name
      LIMIT 80
    `)
    .all(nodeId, nodeId, nodeId, nodeId);
}

export function graphSearch(store, input) {
  const query = String(input.query ?? "").trim();
  if (!query) throw new Error("query es obligatorio");
  const maxResults = Math.min(Math.max(Number(input.max_results ?? 4), 1), 12);
  const maxHops = Math.min(Math.max(Number(input.max_hops ?? 0), 0), 3);
  const maxRelations = Math.min(Math.max(Number(input.max_relations ?? 12), 0), 20);
  const includeMetadata = input.include_metadata === true;
  const nodeKinds = Array.isArray(input.node_kinds) ? input.node_kinds : null;
  const seedLimit =
    maxHops > 0 && maxResults > 1
      ? Math.max(1, Math.ceil(maxResults * 0.6))
      : maxResults;
  const { rows, tokens } = seedRows(store, query, maxResults, nodeKinds);
  const seeds = rows.map((row) => store.hydrateNode(row));
  const primarySeeds = seeds.slice(0, seedLimit);
  const visited = new Map();
  const relations = [];
  let frontier = primarySeeds.map((node, index) => ({
    node,
    depth: 0,
    score: 100 - index * 4,
  }));

  for (const item of frontier) {
    visited.set(item.node.id, { ...item, seed: true });
  }

  for (let depth = 0; depth < maxHops; depth += 1) {
    const next = [];
    for (const item of frontier.filter((entry) => entry.depth === depth)) {
      for (const row of neighborRows(store, item.node.id)) {
        const neighbor = store.hydrateNode(row);
        relations.push({
          from: row.source_id,
          relation: row.relation,
          to: row.target_id,
          directionFromCurrent: row.direction,
        });
        if (visited.has(neighbor.id)) continue;
        const score = item.score * 0.62 + Number(neighbor.authority ?? 0) * 10;
        const neighborItem = { node: neighbor, depth: depth + 1, score, seed: false };
        visited.set(neighbor.id, neighborItem);
        next.push(neighborItem);
      }
    }
    frontier.push(...next);
  }

  if (visited.size < maxResults) {
    for (const [index, node] of seeds.entries()) {
      if (visited.size >= maxResults) break;
      if (visited.has(node.id)) continue;
      visited.set(node.id, {
        node,
        depth: 0,
        score: 100 - index * 4,
        seed: true,
      });
    }
  }

  const context = [...visited.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults)
    .map((item) => ({
      ...compactNode(item.node, tokens, {
        excerptLength: 360,
        includeMetadata,
      }),
      depth: item.depth,
      seed: item.seed,
      score: Math.round(item.score * 100) / 100,
    }));
  const included = new Set(context.map((item) => item.id));
  const seenRelations = new Set();

  return {
    query,
    indexedAt: store.metadata("last_indexed_at"),
    resultCount: context.length,
    context,
    relations: relations
      .filter((relation) => included.has(relation.from) && included.has(relation.to))
      .filter((relation) => {
        const key = `${relation.from}\0${relation.relation}\0${relation.to}`;
        if (seenRelations.has(key)) return false;
        seenRelations.add(key);
        return true;
      })
      .slice(0, maxRelations),
    guidance:
      "Usa las citas para verificar en el código. El grafo orienta la búsqueda, pero CLAUDE.md y el código actual son la fuente de verdad.",
  };
}

export function findNode(store, input) {
  const reference = String(input.reference ?? "").trim();
  if (!reference) throw new Error("reference es obligatorio");
  const maxResults = Math.min(Math.max(Number(input.max_results ?? 4), 1), 8);
  const normalized = normalizePath(reference.replace(/:\d+$/, ""));
  let rows = [];
  const exact = store.getNode(reference) ?? store.getNode(`file:${normalized}`);
  if (exact) rows = [exact];
  if (!rows.length) {
    rows = store.db
      .prepare(`
        SELECT * FROM nodes
        WHERE name = ? OR file_path = ? OR name LIKE ? OR file_path LIKE ?
        ORDER BY
          CASE WHEN name = ? OR file_path = ? THEN 0 ELSE 1 END,
          authority DESC
        LIMIT ?
      `)
      .all(
        reference,
        normalized,
        `%${reference}%`,
        `%${normalized}%`,
        reference,
        normalized,
        maxResults,
      )
      .map((row) => store.hydrateNode(row));
  }
  return rows.map((node) =>
    compactNode(node, tokensFor(reference), {
      excerptLength: 500,
      includeMetadata: input.include_metadata === true,
    }),
  );
}

export function traceRelationships(store, input) {
  const matches = findNode(store, { reference: input.start });
  if (!matches.length) return { start: input.start, nodes: [], relations: [] };
  const depthLimit = Math.min(Math.max(Number(input.depth ?? 2), 1), 5);
  const maxNodes = Math.min(Math.max(Number(input.max_nodes ?? 10), 1), 12);
  const maxRelations = Math.min(Math.max(Number(input.max_relations ?? 12), 0), 20);
  const includeMetadata = input.include_metadata === true;
  const allowed = new Set(
    Array.isArray(input.relations) ? input.relations.map((value) => String(value).toUpperCase()) : [],
  );
  const startId = matches[0].id;
  const visited = new Map([[startId, { node: store.getNode(startId), depth: 0 }]]);
  const relations = [];
  let frontier = [startId];
  let truncated = false;

  for (let depth = 0; depth < depthLimit; depth += 1) {
    const next = [];
    for (const nodeId of frontier) {
      for (const row of neighborRows(store, nodeId)) {
        if (allowed.size && !allowed.has(row.relation)) continue;
        if (relations.length < maxRelations * 4) {
          relations.push({
            from: row.source_id,
            relation: row.relation,
            to: row.target_id,
          });
        } else {
          truncated = true;
        }
        if (!visited.has(row.id)) {
          if (visited.size >= maxNodes) {
            truncated = true;
            continue;
          }
          visited.set(row.id, { node: store.hydrateNode(row), depth: depth + 1 });
          next.push(row.id);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  const nodes = [...visited.values()].map((item) => ({
    ...compactNode(item.node, [], {
      excerptLength: 360,
      includeMetadata,
    }),
    depth: item.depth,
  }));
  const included = new Set(nodes.map((node) => node.id));
  const seen = new Set();
  const boundedRelations = relations
    .filter((relation) => included.has(relation.from) && included.has(relation.to))
    .filter((relation) => {
      const key = `${relation.from}\0${relation.relation}\0${relation.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (boundedRelations.length > maxRelations) truncated = true;

  return {
    start: startId,
    nodes,
    relations: boundedRelations.slice(0, maxRelations),
    truncated,
    limits: { maxNodes, maxRelations, depth: depthLimit },
  };
}

export function impactAnalysis(store, input) {
  const matches = findNode(store, { reference: input.reference });
  if (!matches.length) return { reference: input.reference, affected: [], relations: [] };
  const depthLimit = Math.min(Math.max(Number(input.depth ?? 3), 1), 5);
  const maxAffected = Math.min(Math.max(Number(input.max_nodes ?? 8), 1), 8);
  const maxRelations = Math.min(Math.max(Number(input.max_relations ?? 16), 0), 20);
  const includeMetadata = input.include_metadata === true;
  const impactRelations = new Set([
    "IMPORTS",
    "CALLS",
    "TESTS",
    "REFERENCES",
    "IMPLEMENTED_BY",
    "RELATES_TO",
    "CONTAINS",
    "AFFECTS",
  ]);
  const startIds = matches.slice(0, 4).map((match) => match.id);
  const visited = new Map(startIds.map((id) => [id, { node: store.getNode(id), depth: 0, reason: "target" }]));
  const relations = [];
  let frontier = startIds;
  let truncated = false;

  for (let depth = 0; depth < depthLimit; depth += 1) {
    const next = [];
    for (const nodeId of frontier) {
      const rows = store.db
        .prepare(`
          SELECT e.*, n.*
          FROM edges e
          JOIN nodes n ON n.id = e.source_id
          WHERE e.target_id = ?
          ORDER BY n.authority DESC
          LIMIT 120
        `)
        .all(nodeId);
      for (const row of rows) {
        if (!impactRelations.has(row.relation)) continue;
        if (relations.length < maxRelations * 4) {
          relations.push({
            from: row.source_id,
            relation: row.relation,
            to: row.target_id,
          });
        } else {
          truncated = true;
        }
        if (!visited.has(row.source_id)) {
          if (visited.size - startIds.length >= maxAffected) {
            truncated = true;
            continue;
          }
          const hydrated = store.hydrateNode(row);
          visited.set(row.source_id, {
            node: hydrated,
            depth: depth + 1,
            reason: `${row.relation} → ${nodeId}`,
          });
          next.push(row.source_id);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  const affected = [...visited.values()]
    .filter((item) => item.depth > 0)
    .sort((left, right) => left.depth - right.depth || right.node.authority - left.node.authority)
    .slice(0, maxAffected)
    .map((item) => ({
      ...compactNode(item.node, [], {
        excerptLength: 360,
        includeMetadata,
      }),
      depth: item.depth,
      reason: item.reason,
    }));
  const included = new Set([...startIds, ...affected.map((item) => item.id)]);
  const seen = new Set();
  const boundedRelations = relations
    .filter((relation) => included.has(relation.from) && included.has(relation.to))
    .filter((relation) => {
      const key = `${relation.from}\0${relation.relation}\0${relation.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (boundedRelations.length > maxRelations) truncated = true;

  return {
    reference: input.reference,
    targets: startIds,
    affected,
    relations: boundedRelations.slice(0, maxRelations),
    truncated,
    limits: {
      maxAffected,
      maxRelations,
      depth: depthLimit,
    },
    warning:
      "Es un análisis estructural heurístico. Confirma los usos dinámicos, configuración, reflexión y consumidores externos antes de eliminar o cambiar código.",
  };
}

export function graphStatus(store) {
  const counts = store.db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM files) AS files,
        (SELECT COUNT(*) FROM nodes) AS nodes,
        (SELECT COUNT(*) FROM edges) AS edges,
        (SELECT COUNT(*) FROM claims WHERE status = 'active' AND expires_at > ?) AS activeClaims,
        (SELECT COUNT(*) FROM agent_sessions WHERE last_seen_at > ?) AS recentlyActiveAgents
    `)
    .get(
      new Date().toISOString(),
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    );
  const kinds = store.db
    .prepare("SELECT kind, COUNT(*) AS count FROM nodes GROUP BY kind ORDER BY count DESC")
    .all();
  return {
    root: store.root,
    databasePath: store.databasePath,
    schemaVersion: store.metadata("schema_version"),
    lastIndexedAt: store.metadata("last_indexed_at"),
    ...counts,
    kinds,
  };
}
