import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { normalizePath, nowIso, safeJsonParse } from "./store.mjs";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const TEXT_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  ".json",
  ".md",
  ".prisma",
  ".yml",
  ".yaml",
  ".toml",
  ".css",
]);
const SPECIAL_FILES = new Set(["AGENTS.md", "CLAUDE.md", ".env.example"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".expo",
  ".graphrag",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "web-build",
  "docsredesign",
  "android",
  "ios",
]);
const MAX_FILE_BYTES = 1024 * 1024;

function loadTypeScript(root) {
  const candidates = [root, process.cwd(), path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..")];
  for (const candidate of candidates) {
    try {
      return createRequire(path.join(candidate, "package.json"))("typescript");
    } catch {
      // Try the next dependency root.
    }
  }
  throw new Error("No se pudo resolver TypeScript desde el proyecto.");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function languageFor(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const names = {
    ".ts": "typescript",
    ".tsx": "typescript-react",
    ".js": "javascript",
    ".jsx": "javascript-react",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".prisma": "prisma",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".css": "css",
  };
  return names[extension] ?? "text";
}

export function authorityFor(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized === "CLAUDE.md" || normalized === "AGENTS.md") return 1;
  if (/^apps\/mobile\/(?:CLAUDE|AGENTS)\.md$/.test(normalized)) return 0.98;
  if (/^\.remember\/(?:now|recent|today-[^/]+)\.md$/.test(normalized)) return 0.9;
  if (
    normalized === "README.md" ||
    normalized === "docs/blitzy-tech-spec.md" ||
    normalized === "docs/ROADMAP.md"
  ) {
    return 0.2;
  }
  if (normalized.startsWith("docs/")) return 0.68;
  if (normalized.startsWith("apps/mobile/")) return 0.88;
  if (normalized.startsWith("src/app/api/")) return 0.86;
  if (normalized.startsWith("prisma/")) return 0.88;
  if (CODE_EXTENSIONS.has(path.extname(normalized))) return 0.8;
  return 0.55;
}

function shouldSkipDirectory(relativePath, name) {
  if (IGNORED_DIRECTORIES.has(name)) return true;
  const normalized = normalizePath(relativePath);
  return (
    normalized.startsWith(".remember/logs") ||
    normalized.startsWith(".remember/tmp") ||
    normalized.startsWith("scripts/bot-eval/reports") ||
    normalized.startsWith("scripts/bot-eval/real")
  );
}

function shouldIncludeFile(relativePath, stat) {
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return false;
  const base = path.basename(relativePath);
  if (base === ".env" || /^\.env\..+/.test(base) && base !== ".env.example") return false;
  if (normalizePath(relativePath) === ".claude/settings.local.json") return false;
  if (
    /\.(?:json|txt)$/i.test(base) &&
    /(?:firebase-adminsdk|service-account|credentials|private-key)/i.test(base)
  ) {
    return false;
  }
  if (SPECIAL_FILES.has(base)) return true;
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

export function listIndexableFiles(root) {
  const results = [];
  const walk = (directory, relativeDirectory = "") => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relativePath = normalizePath(path.join(relativeDirectory, entry.name));
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(relativePath, entry.name)) {
          walk(absolutePath, relativePath);
        }
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (shouldIncludeFile(relativePath, stat)) {
        results.push({ absolutePath, relativePath, stat });
      }
    }
  };
  walk(root);
  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function declarationName(ts, node, sourceFile) {
  if (node.name?.getText) {
    const ownName = node.name.getText(sourceFile);
    if (ts.isMethodDeclaration(node) && node.parent?.name?.getText) {
      return `${node.parent.name.getText(sourceFile)}.${ownName}`;
    }
    return ownName;
  }
  return null;
}

function hasModifier(ts, node, kind) {
  return Boolean(node?.modifiers?.some((modifier) => modifier.kind === kind));
}

function callNames(ts, declaration, sourceFile) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression)) {
        names.add(expression.text);
      } else if (ts.isPropertyAccessExpression(expression)) {
        names.add(expression.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  return [...names].slice(0, 120);
}

function declarationKind(ts, node, name, text) {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isFunctionDeclaration(node)) {
    return /^[A-Z]/.test(name ?? "") && /<[A-Za-z]/.test(text) ? "component" : "function";
  }
  if (ts.isVariableDeclaration(node)) {
    return /^[A-Z]/.test(name ?? "") && /<[A-Za-z]/.test(text) ? "component" : "variable";
  }
  return null;
}

function declarationSignature(text) {
  const braceIndex = text.indexOf("{");
  const arrowIndex = text.indexOf("=>");
  let end = text.indexOf("\n");
  if (end < 0) end = text.length;
  if (braceIndex >= 0) end = Math.min(end, braceIndex);
  if (arrowIndex >= 0) end = Math.min(Math.max(end, arrowIndex + 2), 500);
  return text.slice(0, Math.max(1, end)).replace(/\s+/g, " ").slice(0, 500);
}

function extractCode(ts, relativePath, content, authority) {
  const extension = path.extname(relativePath).toLowerCase();
  const scriptKind =
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : extension === ".js" || extension === ".mjs" || extension === ".cjs"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const nodes = [];
  const imports = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const bindings = [];
      const clause = statement.importClause;
      if (clause?.name) bindings.push({ local: clause.name.text, imported: "default" });
      const namedBindings = clause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          bindings.push({
            local: element.name.text,
            imported: element.propertyName?.text ?? element.name.text,
          });
        }
      }
      imports.push({ specifier, bindings });
    }
  }

  const seen = new Map();
  const visit = (node) => {
    const isInteresting =
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      (ts.isVariableDeclaration(node) &&
        (Boolean(node.initializer && ts.isArrowFunction(node.initializer)) ||
          Boolean(node.initializer && ts.isFunctionExpression(node.initializer)) ||
          /^[A-Z]/.test(node.name?.getText(sourceFile) ?? "")));

    if (isInteresting) {
      const name = declarationName(ts, node, sourceFile);
      if (name) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const declarationText = content.slice(start, end);
        const kind = declarationKind(ts, node, name, declarationText);
        const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
        const key = `${kind}:${name}`;
        const occurrence = (seen.get(key) ?? 0) + 1;
        seen.set(key, occurrence);
        nodes.push({
          id: `symbol:${relativePath}:${kind}:${name}:${occurrence}`,
          kind,
          name,
          filePath: relativePath,
          startLine,
          endLine,
          signature: declarationSignature(declarationText),
          content: declarationText.slice(0, 12000),
          searchText: `${name}\n${declarationSignature(declarationText)}\n${declarationText.slice(0, 12000)}`,
          authority,
          metadata: {
            exported:
              hasModifier(ts, node, ts.SyntaxKind.ExportKeyword) ||
              hasModifier(ts, node.parent, ts.SyntaxKind.ExportKeyword),
            async:
              hasModifier(ts, node, ts.SyntaxKind.AsyncKeyword) ||
              hasModifier(ts, node.initializer, ts.SyntaxKind.AsyncKeyword),
            calls: callNames(ts, node, sourceFile),
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { nodes, imports };
}

function extractMarkdown(relativePath, content, authority) {
  const headings = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (match) headings.push({ level: match[1].length, title: match[2], line: index + 1 });
  }
  const nodes = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const next = headings[index + 1];
    const endLine = (next?.line ?? lines.length + 1) - 1;
    const section = lines.slice(heading.line - 1, endLine).join("\n").slice(0, 16000);
    nodes.push({
      id: `doc:${relativePath}:${heading.line}`,
      kind: "doc_section",
      name: heading.title,
      filePath: relativePath,
      startLine: heading.line,
      endLine,
      signature: `${"#".repeat(heading.level)} ${heading.title}`,
      content: section,
      searchText: `${heading.title}\n${section}`,
      authority,
      metadata: { level: heading.level },
    });
  }
  const references = [...content.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)].map(
    (match) => match[1],
  );
  return { nodes, references };
}

function extractPrisma(relativePath, content, authority) {
  const nodes = [];
  const blocks = [...content.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  for (const match of blocks) {
    const [full, blockKind, name, body] = match;
    const startLine = lineNumberAt(content, match.index);
    const endLine = startLine + full.split(/\r?\n/).length - 1;
    const fieldTypes = [];
    if (blockKind === "model") {
      for (const line of body.split(/\r?\n/)) {
        const field = /^\s*(\w+)\s+([A-Z]\w*)(?:\[\])?/.exec(line);
        if (field) fieldTypes.push(field[2]);
      }
    }
    nodes.push({
      id: `prisma:${blockKind}:${name}`,
      kind: blockKind === "model" ? "prisma_model" : "prisma_enum",
      name,
      filePath: relativePath,
      startLine,
      endLine,
      signature: `${blockKind} ${name}`,
      content: full,
      searchText: `${blockKind} ${name}\n${full}`,
      authority,
      metadata: { fieldTypes: [...new Set(fieldTypes)] },
    });
  }
  return { nodes };
}

function extractPackage(relativePath, content, authority) {
  try {
    const parsed = JSON.parse(content);
    if (!parsed.name && path.basename(relativePath) !== "package.json") return { nodes: [] };
    const dependencies = [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.peerDependencies ?? {}),
    ];
    return {
      nodes: [
        {
          id: `package:${parsed.name ?? relativePath}`,
          kind: "package",
          name: parsed.name ?? relativePath,
          filePath: relativePath,
          startLine: 1,
          endLine: content.split(/\r?\n/).length,
          signature: `${parsed.name ?? relativePath}@${parsed.version ?? "unknown"}`,
          content: JSON.stringify(
            {
              name: parsed.name,
              version: parsed.version,
              scripts: parsed.scripts,
              dependencies,
            },
            null,
            2,
          ),
          searchText: `${parsed.name ?? relativePath}\n${dependencies.join(" ")}\n${Object.keys(parsed.scripts ?? {}).join(" ")}`,
          authority,
          metadata: { dependencies },
        },
      ],
    };
  } catch {
    return { nodes: [] };
  }
}

function extractEnvironmentKeys(relativePath, content, authority) {
  if (path.basename(relativePath) !== ".env.example") return { nodes: [] };
  const nodes = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = /^\s*([A-Z][A-Z0-9_]+)\s*=/.exec(line);
    if (!match) continue;
    nodes.push({
      id: `env:${match[1]}`,
      kind: "env_key",
      name: match[1],
      filePath: relativePath,
      startLine: index + 1,
      endLine: index + 1,
      signature: match[1],
      content: match[1],
      searchText: match[1],
      authority,
      metadata: {},
    });
  }
  return { nodes };
}

function routeNodes(relativePath, content, authority, extractedNodes) {
  const nodes = [];
  if (/^src\/app\/api\/.+\/route\.(?:ts|js)$/.test(relativePath)) {
    const routePath = relativePath
      .replace(/^src\/app/, "")
      .replace(/\/route\.(?:ts|js)$/, "")
      .replace(/\[([^\]]+)\]/g, ":$1");
    const methods = extractedNodes
      .filter((node) => ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(node.name))
      .map((node) => node.name);
    nodes.push({
      id: `route:${routePath}`,
      kind: "api_route",
      name: routePath,
      filePath: relativePath,
      startLine: 1,
      endLine: content.split(/\r?\n/).length,
      signature: `${[...new Set(methods)].join("|") || "HTTP"} ${routePath}`,
      content: content.slice(0, 5000),
      searchText: `${routePath}\n${methods.join(" ")}\n${content.slice(0, 5000)}`,
      authority,
      metadata: { methods: [...new Set(methods)] },
    });
  }
  if (
    /^apps\/mobile\/app\/.+\.(?:tsx|jsx)$/.test(relativePath) &&
    !relativePath.endsWith("/_layout.tsx")
  ) {
    const routePath = relativePath
      .replace(/^apps\/mobile\/app/, "")
      .replace(/\.(?:tsx|jsx)$/, "")
      .replace(/\/index$/, "/")
      .replace(/\[([^\]]+)\]/g, ":$1");
    nodes.push({
      id: `screen:${routePath}`,
      kind: "mobile_screen",
      name: routePath,
      filePath: relativePath,
      startLine: 1,
      endLine: content.split(/\r?\n/).length,
      signature: `Expo route ${routePath}`,
      content: content.slice(0, 5000),
      searchText: `${routePath}\n${content.slice(0, 5000)}`,
      authority,
      metadata: {},
    });
  }
  return nodes;
}

function extractDocument(ts, relativePath, content) {
  const authority = authorityFor(relativePath);
  const extension = path.extname(relativePath).toLowerCase();
  const baseName = path.basename(relativePath);
  const nodes = [];
  const metadata = { imports: [], references: [] };

  if (CODE_EXTENSIONS.has(extension)) {
    const code = extractCode(ts, relativePath, content, authority);
    nodes.push(...code.nodes);
    metadata.imports = code.imports;
    nodes.push(...routeNodes(relativePath, content, authority, code.nodes));
  } else if (extension === ".md" || baseName === "AGENTS.md" || baseName === "CLAUDE.md") {
    const markdown = extractMarkdown(relativePath, content, authority);
    nodes.push(...markdown.nodes);
    metadata.references = markdown.references;
  } else if (extension === ".prisma") {
    nodes.push(...extractPrisma(relativePath, content, authority).nodes);
  } else if (baseName === "package.json") {
    nodes.push(...extractPackage(relativePath, content, authority).nodes);
  }

  nodes.push(...extractEnvironmentKeys(relativePath, content, authority).nodes);

  const fileNode = {
    id: `file:${relativePath}`,
    kind: "file",
    name: relativePath,
    filePath: relativePath,
    startLine: 1,
    endLine: content.split(/\r?\n/).length,
    signature: relativePath,
    content: content.slice(0, 7000),
    searchText: `${relativePath}\n${content.slice(0, 10000)}`,
    authority,
    metadata,
  };

  const edges = nodes.map((node) => ({
    sourceId: fileNode.id,
    targetId: node.id,
    relation: "CONTAINS",
    sourceFile: relativePath,
  }));
  return { fileNode, nodes, edges };
}

function resolveImportPath(sourcePath, specifier, availablePaths) {
  let base;
  if (specifier === "@nidokey/shared") {
    base = "packages/shared/src/index";
  } else if (specifier.startsWith("@nidokey/shared/")) {
    base = `packages/shared/src/${specifier.slice("@nidokey/shared/".length)}`;
  } else if (specifier.startsWith("@/")) {
    base = sourcePath.startsWith("apps/mobile/")
      ? `apps/mobile/${specifier.slice(2)}`
      : `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = normalizePath(path.join(path.dirname(sourcePath), specifier));
  } else {
    return null;
  }
  const candidates = [
    base,
    ...[...CODE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...CODE_EXTENSIONS].map((extension) => `${base}/index${extension}`),
    `${base}.json`,
  ];
  return candidates.find((candidate) => availablePaths.has(candidate)) ?? null;
}

function resolveReferencePath(sourcePath, reference, availablePaths) {
  if (/^(?:https?:|mailto:|#)/.test(reference)) return null;
  const candidate = normalizePath(path.join(path.dirname(sourcePath), reference));
  return availablePaths.has(candidate) ? candidate : null;
}

function rebuildDerivedEdges(store) {
  const db = store.db;
  db.prepare("DELETE FROM edges WHERE derived = 1").run();
  const rows = db
    .prepare("SELECT id, kind, name, file_path, metadata_json FROM nodes")
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byName = new Map();
  const byFile = new Map();
  for (const row of rows) {
    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name).push(row);
    if (row.file_path) {
      if (!byFile.has(row.file_path)) byFile.set(row.file_path, []);
      byFile.get(row.file_path).push(row);
    }
  }
  const availablePaths = new Set(byFile.keys());

  for (const row of rows) {
    const metadata = safeJsonParse(row.metadata_json);
    if (row.kind === "file") {
      for (const imported of metadata.imports ?? []) {
        const targetPath = resolveImportPath(row.file_path, imported.specifier, availablePaths);
        if (!targetPath) continue;
        store.upsertEdge({
          sourceId: row.id,
          targetId: `file:${targetPath}`,
          relation: row.file_path.includes(".test.") ? "TESTS" : "IMPORTS",
          sourceFile: row.file_path,
          derived: true,
          metadata: { specifier: imported.specifier, bindings: imported.bindings },
        });
        for (const binding of imported.bindings ?? []) {
          const target = (byFile.get(targetPath) ?? []).find(
            (candidate) =>
              candidate.name === binding.imported ||
              candidate.name.endsWith(`.${binding.imported}`),
          );
          const sources = (byFile.get(row.file_path) ?? []).filter(
            (candidate) =>
              safeJsonParse(candidate.metadata_json).calls?.includes(binding.local),
          );
          if (target) {
            for (const source of sources) {
              store.upsertEdge({
                sourceId: source.id,
                targetId: target.id,
                relation: "CALLS",
                sourceFile: row.file_path,
                derived: true,
                metadata: { viaImport: binding.local },
              });
            }
          }
        }
      }
      for (const reference of metadata.references ?? []) {
        const targetPath = resolveReferencePath(row.file_path, reference, availablePaths);
        if (targetPath) {
          store.upsertEdge({
            sourceId: row.id,
            targetId: `file:${targetPath}`,
            relation: "REFERENCES",
            sourceFile: row.file_path,
            derived: true,
          });
        }
      }
      continue;
    }

    for (const call of metadata.calls ?? []) {
      const localMatches = (byFile.get(row.file_path) ?? []).filter(
        (candidate) => candidate.name === call || candidate.name.endsWith(`.${call}`),
      );
      const globalMatches = byName.get(call) ?? [];
      const candidates =
        localMatches.length === 1
          ? localMatches
          : call.length >= 6 || /^[A-Z]/.test(call)
            ? globalMatches
            : [];
      if (candidates.length === 1 && candidates[0].id !== row.id) {
        store.upsertEdge({
          sourceId: row.id,
          targetId: candidates[0].id,
          relation: "CALLS",
          sourceFile: row.file_path,
          derived: true,
        });
      }
    }
  }

  const prismaNodes = rows.filter((row) => row.kind === "prisma_model");
  const prismaByName = new Map(prismaNodes.map((row) => [row.name, row]));
  for (const row of prismaNodes) {
    const metadata = safeJsonParse(row.metadata_json);
    for (const fieldType of metadata.fieldTypes ?? []) {
      const target = prismaByName.get(fieldType);
      if (target && target.id !== row.id) {
        store.upsertEdge({
          sourceId: row.id,
          targetId: target.id,
          relation: "RELATES_TO",
          sourceFile: row.file_path,
          derived: true,
        });
      }
    }
  }

  for (const row of rows.filter((candidate) => ["api_route", "mobile_screen"].includes(candidate.kind))) {
    const fileId = `file:${row.file_path}`;
    if (byId.has(fileId)) {
      store.upsertEdge({
        sourceId: row.id,
        targetId: fileId,
        relation: "IMPLEMENTED_BY",
        sourceFile: row.file_path,
        derived: true,
      });
    }
  }
}

export function refreshIndex(store, options = {}) {
  const startedAt = Date.now();
  const ts = loadTypeScript(store.root);
  const candidates = listIndexableFiles(store.root);
  const existingRows = store.db.prepare("SELECT path, hash FROM files").all();
  const existing = new Map(existingRows.map((row) => [row.path, row.hash]));
  const currentPaths = new Set(candidates.map((candidate) => candidate.relativePath));
  const removed = [...existing.keys()].filter((filePath) => !currentPaths.has(filePath));
  const documents = [];
  const skipped = [];

  for (const candidate of candidates) {
    let content;
    try {
      content = fs.readFileSync(candidate.absolutePath, "utf8");
    } catch (error) {
      skipped.push({ path: candidate.relativePath, reason: error.message });
      continue;
    }
    const hash = sha256(content);
    if (!options.force && existing.get(candidate.relativePath) === hash) continue;
    documents.push({
      candidate,
      content,
      hash,
      extraction: extractDocument(ts, candidate.relativePath, content),
    });
  }

  store.withImmediateTransaction(() => {
    for (const filePath of removed) {
      store.deleteNodesForFile(filePath);
      store.deleteFile(filePath);
    }
    for (const document of documents) {
      const { candidate, content, hash, extraction } = document;
      store.deleteNodesForFile(candidate.relativePath);
      store.upsertFile({
        path: candidate.relativePath,
        hash,
        size: Buffer.byteLength(content),
        mtimeMs: candidate.stat.mtimeMs,
        language: languageFor(candidate.relativePath),
        authority: authorityFor(candidate.relativePath),
      });
      store.upsertNode(extraction.fileNode);
      for (const node of extraction.nodes) store.upsertNode(node);
      for (const edge of extraction.edges) store.upsertEdge(edge);
    }
    for (const agent of ["codex", "claude-code"]) {
      store.upsertNode({
        id: `agent:${agent}`,
        kind: "agent",
        name: agent,
        signature: `Development agent ${agent}`,
        content: `${agent} trabaja sobre Nidokey mediante el Graph RAG compartido y coordina ámbitos, decisiones y handoffs.`,
        searchText: `${agent} development agent parallel coordination Nidokey`,
        authority: 1,
        metadata: { configured: true },
      });
    }
    rebuildDerivedEdges(store);
    store.setMetadata("schema_version", "3");
    store.setMetadata("last_indexed_at", nowIso());
    store.setMetadata("project_root", store.root);
    store.setMetadata("indexed_file_count", currentPaths.size);
  });

  const counts = store.db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM files) AS files,
        (SELECT COUNT(*) FROM nodes) AS nodes,
        (SELECT COUNT(*) FROM edges) AS edges
    `)
    .get();
  return {
    root: store.root,
    databasePath: store.databasePath,
    changedFiles: documents.length,
    removedFiles: removed.length,
    skipped,
    durationMs: Date.now() - startedAt,
    ...counts,
  };
}
