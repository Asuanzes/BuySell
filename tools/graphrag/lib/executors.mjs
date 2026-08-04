import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LC_ALL",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
];

export function sanitizedEnvironment(extra = {}) {
  const environment = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  for (const key of [
    "NIDOKEY_CODEX_EXECUTABLE",
    "NIDOKEY_CLAUDE_EXECUTABLE",
    "NIDOKEY_GRAPH_DISABLE_BACKGROUND",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_API_URL",
    "NIDOKEY_DEEPSEEK_MODEL",
  ]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  if (process.env.NODE_ENV === "test") {
    environment.NODE_ENV = "test";
    for (const key of [
      "NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT",
      "NIDOKEY_GRAPH_TEST_DELAY_MS",
      "NIDOKEY_GRAPH_TEST_HEARTBEAT_MS",
    ]) {
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
  }
  return { ...environment, ...extra };
}

export function containsObviousSecret(value) {
  const text = String(value ?? "");
  return [
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/i,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/i,
    /\bAKIA[A-Z0-9]{16}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{24,}/i,
  ].some((pattern) => pattern.test(text));
}

export function redactObviousSecrets(value) {
  return String(value ?? "")
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/gi, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gi, "[REDACTED_SLACK_TOKEN]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED_JWT]",
    )
    .replace(
      /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{24,}/gi,
      "$1=[REDACTED]",
    );
}

function existingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

function appDataPath(...parts) {
  return process.env.APPDATA ? path.join(process.env.APPDATA, ...parts) : null;
}

export function resolveExecutor(agent) {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT &&
    fs.existsSync(process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT)
  ) {
    return {
      command: process.execPath,
      prefixArgs: [process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT],
      source: "test-double",
    };
  }
  if (agent === "codex") {
    const configured = process.env.NIDOKEY_CODEX_EXECUTABLE;
    const native = existingFile([
      configured,
      appDataPath(
        "npm",
        "node_modules",
        "@openai",
        "codex",
        "node_modules",
        "@openai",
        "codex-win32-x64",
        "vendor",
        "x86_64-pc-windows-msvc",
        "bin",
        "codex.exe",
      ),
    ]);
    if (native) return { command: native, prefixArgs: [], source: "native" };
    const script = existingFile([
      appDataPath("npm", "node_modules", "@openai", "codex", "bin", "codex.js"),
    ]);
    if (script) {
      return {
        command: process.execPath,
        prefixArgs: [script],
        source: "node-wrapper",
      };
    }
    if (process.platform !== "win32") {
      return { command: configured ?? "codex", prefixArgs: [], source: "path" };
    }
    throw new Error("No se encontró el ejecutable local de Codex");
  }

  if (agent === "claude-code") {
    const configured = process.env.NIDOKEY_CLAUDE_EXECUTABLE;
    const executable = existingFile([
      configured,
      appDataPath(
        "npm",
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        "claude.exe",
      ),
    ]);
    if (executable) return { command: executable, prefixArgs: [], source: "native" };
    if (process.platform !== "win32") {
      return { command: configured ?? "claude", prefixArgs: [], source: "path" };
    }
    throw new Error("No se encontró el ejecutable local de Claude Code");
  }

  if (agent === "deepseek") {
    // Sin CLI agéntico propio: wrapper node contra la API (solo análisis).
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error("Falta DEEPSEEK_API_KEY en el entorno");
    }
    const script = existingFile([
      process.env.NIDOKEY_DEEPSEEK_RUNNER,
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "agents",
        "deepseek-runner.mjs",
      ),
    ]);
    if (script) {
      return {
        command: process.execPath,
        // --use-system-ca: el TLS de este equipo intercepta con una CA local y
        // el entorno saneado no propaga NODE_OPTIONS del usuario.
        prefixArgs: ["--use-system-ca", script],
        source: "api-wrapper",
      };
    }
    throw new Error("No se encontró agents/deepseek-runner.mjs");
  }
  throw new Error(`Ejecutor no permitido: ${agent}`);
}

export function executorAvailability() {
  const result = {};
  for (const agent of ["codex", "claude-code", "deepseek"]) {
    try {
      const resolved = resolveExecutor(agent);
      result[agent] = {
        available: true,
        source: resolved.source,
        executable: resolved.command,
      };
    } catch (error) {
      result[agent] = { available: false, error: error.message };
    }
  }
  return result;
}

function promptExcerpt(value, maximum = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= maximum
    ? text
    : `${text.slice(0, Math.max(0, maximum - 1))}…`;
}

export function buildTaskPrompt(task, dependencies = []) {
  const acceptance = Array.isArray(task.acceptanceCriteria)
    ? task.acceptanceCriteria
    : [];
  return [
    "Eres un agente de desarrollo en segundo plano coordinado por nidokey-graph.",
    `TAREA_ID: ${task.id}`,
    `TAREA_PADRE: ${task.parentId ?? "ninguna"}`,
    `AGENTE: ${task.targetAgent}`,
    `MODO: ${task.mode}`,
    `${task.mode === "edit" ? "ÁMBITO EXCLUSIVO" : "FOCO DE ANÁLISIS NO EXCLUSIVO"}: ${task.scope}`,
    `TÍTULO: ${task.title}`,
    "",
    "INSTRUCCIONES:",
    task.instructions,
    acceptance.length ? `\nCRITERIOS DE ACEPTACIÓN:\n- ${acceptance.join("\n- ")}` : "",
    dependencies.length
      ? `\nDEPENDENCIAS COMPLETADAS:\n- ${dependencies
          .slice(0, 5)
          .map(
            (dependency) =>
              `${dependency.id}: ${promptExcerpt(
                dependency.result?.summary ?? dependency.title,
              )}`,
          )
          .join("\n- ")}`
      : "",
    "",
    "PROTOCOLO OBLIGATORIO:",
    `1. Usa nidokey-graph y ejecuta session_context con el objetivo de esta tarea y context_key="${task.id}".`,
    task.mode === "edit"
      ? "2. El runner ya ha reservado el ámbito; no reclames de nuevo la misma ruta."
      : "2. Trabajas en solo lectura y sin claim exclusivo para revisar en paralelo mientras el agente principal edita.",
    `3. No leas ni modifiques fuera de ${task.scope}, salvo archivos mínimos necesarios para comprender imports o ejecutar pruebas.`,
    "4. Verifica las citas del grafo en el código actual.",
    task.maxDepth > task.depth
      ? "5. Si necesitas delegar, usa delegate_task hacia el otro agente, indica esta TAREA_ID como parent_task_id y utiliza un ámbito no solapado."
      : "5. Esta revisión no puede crear subtareas: concentra el resultado en un único TaskOutput.",
    "6. Ejecuta validaciones proporcionales al cambio.",
    "7. Puedes registrar decisiones técnicas con record_decision. El runner publicará el handoff final.",
    "8. No hagas commit, push, pull request, deploy, publicación OTA, migraciones, cambios de pagos, secretos ni acciones de producción.",
    "9. No solicites permisos interactivos. Si falta autoridad o información, devuelve outcome=blocked y needsUserInput=true.",
    "10. Devuelve exclusivamente el objeto estructurado solicitado por el esquema TaskOutput.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildExecution({
  task,
  root,
  schemaPath,
  resultPath,
  mcpConfigPath,
}) {
  const resolved = resolveExecutor(task.targetAgent);
  const scopedPath = path.resolve(root, task.scope);
  let workingDirectory = root;
  if (task.mode === "edit") {
    if (!fs.existsSync(scopedPath)) {
      throw new Error(
        `El ámbito editable debe existir antes de delegarlo: ${task.scope}`,
      );
    }
    workingDirectory = fs.statSync(scopedPath).isDirectory()
      ? scopedPath
      : path.dirname(scopedPath);
  }
  if (task.targetAgent === "codex") {
    const serverPath = path.join(path.dirname(schemaPath), "server.mjs");
    const mandatoryReview = String(task.idempotencyKey ?? "").startsWith(
      "mandatory-collab:",
    );
    return {
      ...resolved,
      cwd: workingDirectory,
      args: [
        ...resolved.prefixArgs,
        "--ask-for-approval",
        "never",
        "exec",
        "--cd",
        workingDirectory,
        "--sandbox",
        task.mode === "edit" ? "workspace-write" : "read-only",
        "--strict-config",
        "--ignore-user-config",
        "--ignore-rules",
        ...(mandatoryReview
          ? ["-c", 'model_reasoning_effort="medium"']
          : []),
        "--json",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        resultPath,
        "-c",
        "mcp_servers={}",
        "-c",
        `mcp_servers.nidokey-graph.command=${JSON.stringify(process.execPath)}`,
        "-c",
        `mcp_servers.nidokey-graph.args=${JSON.stringify([
          "--no-warnings",
          serverPath,
          "--root",
          root,
        ])}`,
        "-c",
        "mcp_servers.nidokey-graph.required=true",
        "-",
      ],
    };
  }

  if (task.targetAgent === "deepseek") {
    if (task.mode === "edit") {
      throw new Error("deepseek solo admite mode=analyze");
    }
    return {
      ...resolved,
      cwd: workingDirectory,
      args: [...resolved.prefixArgs, "--output-last-message", resultPath],
    };
  }

  const schema = fs.readFileSync(schemaPath, "utf8");
  return {
    ...resolved,
    cwd: workingDirectory,
    args: [
      ...resolved.prefixArgs,
      "-p",
      "--output-format",
      "json",
      "--permission-mode",
      task.mode === "edit" ? "acceptEdits" : "plan",
      "--setting-sources",
      "user",
      "--mcp-config",
      mcpConfigPath,
      "--strict-mcp-config",
      "--json-schema",
      schema,
    ],
  };
}

function normalizeTaskOutput(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (
    typeof candidate.summary === "string" &&
    typeof candidate.outcome === "string"
  ) {
    return {
      outcome: ["completed", "partial", "blocked", "failed"].includes(candidate.outcome)
        ? candidate.outcome
        : "partial",
      summary: promptExcerpt(candidate.summary, 4000),
      changedPaths: Array.isArray(candidate.changedPaths)
        ? candidate.changedPaths
            .map((item) => promptExcerpt(item, 1000))
            .slice(0, 50)
        : [],
      tests: Array.isArray(candidate.tests)
        ? candidate.tests
            .map((item) => promptExcerpt(item, 500))
            .slice(0, 20)
        : [],
      nextSteps: Array.isArray(candidate.nextSteps)
        ? candidate.nextSteps
            .map((item) => promptExcerpt(item, 500))
            .slice(0, 20)
        : [],
      needsUserInput: Boolean(candidate.needsUserInput),
    };
  }
  for (const key of ["structured_output", "structuredOutput", "result", "output"]) {
    const nested = candidate[key];
    if (typeof nested === "string") {
      try {
        const parsed = normalizeTaskOutput(JSON.parse(nested));
        if (parsed) return parsed;
      } catch {
        // Continue with other result fields.
      }
    } else {
      const parsed = normalizeTaskOutput(nested);
      if (parsed) return parsed;
    }
  }
  return null;
}

export function parseTaskOutput(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    const direct = normalizeTaskOutput(JSON.parse(trimmed));
    if (direct) return direct;
  } catch {
    // Some clients wrap the final JSON in surrounding output.
  }
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)?.[1];
  if (fenced) {
    try {
      const parsed = normalizeTaskOutput(JSON.parse(fenced));
      if (parsed) return parsed;
    } catch {
      // Fall through to the last JSON-looking line.
    }
  }
  const lines = trimmed.split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const parsed = normalizeTaskOutput(JSON.parse(line));
      if (parsed) return parsed;
    } catch {
      // Keep scanning.
    }
  }
  return null;
}

export function extractExternalSessionId(agent, text) {
  if (agent === "codex") {
    for (const line of String(text ?? "").split(/\r?\n/)) {
      try {
        const event = JSON.parse(line);
        if (event.type === "thread.started" && event.thread_id) {
          return String(event.thread_id);
        }
      } catch {
        // Ignore non-JSON diagnostic lines.
      }
    }
    return null;
  }
  try {
    const payload = JSON.parse(String(text ?? ""));
    return payload.session_id ? String(payload.session_id) : null;
  } catch {
    return null;
  }
}
