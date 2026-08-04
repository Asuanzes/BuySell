#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCollaborationTask,
  collaborationStatus,
  getCurrentRequirement,
  upsertHostPrompt,
} from "./lib/collaboration.mjs";
import { openStore } from "./lib/store.mjs";

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit", "notebookedit"]);
const FILE_MUTATION_TOOL = /(?:^|__)(?:write(?:_text)?_file|edit_file|apply_patch|create_directory|move_file|rename_file|delete_file|remove_file)$/i;

function readInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function findProjectRoot(value) {
  const fallback = path.resolve(String(value || process.cwd()));
  let current = fallback;
  while (true) {
    if (
      fs.existsSync(path.join(current, ".graphrag", "nidokey.sqlite")) ||
      fs.existsSync(path.join(current, "tools", "graphrag", "lib", "store.mjs")) ||
      fs.existsSync(path.join(current, ".git")) ||
      fs.existsSync(path.join(current, ".mcp.json")) ||
      fs.existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return fallback;
    current = parent;
  }
}

function eventName(input) {
  return String(input.hook_event_name ?? input.hookEventName ?? "").trim();
}

function hostSessionId(input) {
  return String(input.session_id ?? input.sessionId ?? "").trim();
}

function toolName(input) {
  return String(input.tool_name ?? input.toolName ?? "").trim();
}

function shellCommand(input) {
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  return String(toolInput.command ?? toolInput.cmd ?? toolInput.script ?? "").trim();
}

function isShellTool(name) {
  return /(?:^|__)(?:bash|powershell|shell|shell_command)$/i.test(name) ||
    /^(?:bash|powershell|shell|shell_command)$/i.test(name);
}

function isReadOnlyGit(segment) {
  const match = segment.match(/^git(?:\.exe)?\s+([^\s]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return false;
  const subcommand = match[1].toLowerCase();
  const args = String(match[2] ?? "").trim();
  if (/--(?:output|exec-path|ext-diff)(?:=|\s|$)|--textconv(?:\s|$)|-c\s/i.test(args)) {
    return false;
  }
  if (["status", "diff", "log", "show", "rev-parse", "ls-files", "grep", "blame", "shortlog", "describe"].includes(subcommand)) {
    return true;
  }
  if (subcommand === "remote") return args === "-v" || args === "--verbose" || args === "show";
  if (subcommand === "branch") {
    return !args || /^(?:--show-current|-a|--all|-r|--remotes|-v|-vv|--list)(?:\s|$)/.test(args);
  }
  if (subcommand === "tag") return !args || /^(?:-l|--list)(?:\s|$)/.test(args);
  if (subcommand === "config") return /^(?:--get|--get-all|--get-regexp|--list)(?:\s|$)/.test(args);
  return false;
}

function isReadOnlySegment(value) {
  const segment = value.trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (!segment) return false;
  if (/^(?:pwd|ls|dir|tree|whoami|hostname|date)(?:\.exe)?(?:\s|$)/i.test(segment)) return true;
  if (/^(?:rg|rg\.exe|grep|head|tail|wc|which|where|where\.exe)(?:\s|$)/i.test(segment)) {
    return !/\s--pre(?:-glob)?(?:=|\s)/i.test(segment);
  }
  if (/^sed(?:\.exe)?\s+-n(?:\s|$)/i.test(segment)) return !/\s-i(?:\s|$)/i.test(segment);
  if (/^find(?:\.exe)?(?:\s|$)/i.test(segment)) {
    return !/\s(?:-delete|-exec|-execdir|-ok|-okdir)(?:\s|$)/i.test(segment);
  }
  if (isReadOnlyGit(segment)) return true;
  if (/^node(?:\.exe)?\s+--check\s+(?:"[^"]+"|'[^']+'|[^\s]+)$/i.test(segment)) return true;
  return /^(?:Get-(?:ChildItem|Content|Item|ItemProperty|Location|Process|Command|Date|CimInstance|FileHash|Variable)|Select-Object|Where-Object|Sort-Object|Group-Object|Measure-Object|Format-(?:Table|List|Wide|Custom)|Test-Path|Resolve-Path|Join-Path|Split-Path|ConvertFrom-Json|ConvertTo-Json|Out-String)(?:\s|$)/i.test(segment);
}

function isReadOnlyShell(command) {
  if (!command) return false;
  if (/[;&\r\n]|\|\||[<>]|`|\$\(/.test(command)) return false;
  if (/\b(?:Set-|Add-|Remove-|Move-|Copy-|Rename-|New-|Clear-|Out-File|Tee-Object|Invoke-Expression|Start-Process)\w*/i.test(command)) {
    return false;
  }
  if (/\b(?:rm|del|erase|mv|cp|mkdir|rmdir|touch|chmod|chown|kill|taskkill|npm\s+(?:install|uninstall)|pnpm\s+(?:add|remove)|yarn\s+(?:add|remove))\b/i.test(command)) {
    return false;
  }
  const segments = command.split("|");
  return segments.length > 0 && segments.every(isReadOnlySegment);
}

function isValidationShell(command) {
  const value = String(command ?? "").trim();
  return /^(?:npm(?:\.cmd)?\s+(?:test|run\s+(?:test|typecheck|lint|build|graphrag:test))|pnpm(?:\.cmd)?\s+(?:test|run\s+(?:test|typecheck|lint|build))|yarn(?:\.cmd)?\s+(?:test|typecheck|lint|build)|node(?:\.exe)?\s+(?:--no-warnings\s+)?--test\s+[^;&|<>`]+)$/i.test(value);
}

function denyPreTool(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

function blockStop(reason) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
}

function publishHostContext(id) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `NIDOKEY-GRAPH: pasa host_session_id="${id}" a session_context. ` +
          "Es obligatorio para correlacionar esta sesión Claude sin carreras.",
      },
    })}\n`,
  );
}

function loadHost(store, id) {
  if (!id) return null;
  return store.db
    .prepare("SELECT * FROM collaboration_hosts WHERE host_session_id = ?")
    .get(id) ?? null;
}

function currentStatusForHost(store, host) {
  if (!host?.graph_session_id) return null;
  const requirement = getCurrentRequirement(store, {
    graphSessionId: host.graph_session_id,
  });
  if (!requirement || requirement.hostSessionId !== host.host_session_id) return null;
  return collaborationStatus(store, { requirementId: requirement.id });
}

function pendingStatusForHost(store, host) {
  if (!host?.host_session_id) return null;
  const pending = store.db
    .prepare(`
      SELECT id FROM collaboration_requirements
      WHERE host_session_id = ? AND required = 1 AND state != 'completed'
      ORDER BY updated_at DESC LIMIT 1
    `)
    .get(host.host_session_id);
  return pending
    ? collaborationStatus(store, { requirementId: pending.id })
    : null;
}

function activeClaimsForSession(store, graphSessionId) {
  return store.db
    .prepare(`
      SELECT scope FROM claims
      WHERE session_id = ? AND status = 'active' AND expires_at > ?
    `)
    .all(graphSessionId, new Date().toISOString());
}

function normalizeFilesystemPath(value, root) {
  const resolved = path.resolve(root, String(value ?? ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function claimCoversPath(store, claim, targetPath) {
  const root = normalizeFilesystemPath(store.root, store.root);
  const target = normalizeFilesystemPath(targetPath, store.root);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return false;
  if (claim.scope === "*") return true;
  const claimed = normalizeFilesystemPath(claim.scope, store.root);
  return target === claimed || target.startsWith(`${claimed}${path.sep}`);
}

function mutatingToolPaths(input) {
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  return [
    toolInput.file_path,
    toolInput.path,
    toolInput.notebook_path,
    toolInput.source,
    toolInput.destination,
    toolInput.source_path,
    toolInput.destination_path,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function preToolUse(store, input) {
  const name = toolName(input);
  const normalizedName = name.toLowerCase();
  const shell = isShellTool(name);
  const command = shellCommand(input);
  const validationShell = shell && isValidationShell(command);
  const fileMutation =
    MUTATING_TOOLS.has(normalizedName) || FILE_MUTATION_TOOL.test(name);
  const gated = fileMutation || validationShell || (shell && !isReadOnlyShell(command));
  if (!gated) return;

  const hostId = hostSessionId(input);
  const host = loadHost(store, hostId);
  if (!host) {
    denyPreTool("Colaboracion obligatoria: falta registrar el prompt actual. Ejecuta session_context antes de modificar archivos o usar shell no verificablemente de solo lectura.");
    return;
  }
  const status = currentStatusForHost(store, host);
  if (!status?.requirement) {
    denyPreTool("Colaboracion obligatoria: session_context aun no ha ligado esta tarea de Claude con nidokey-graph.");
    return;
  }
  const claims = activeClaimsForSession(store, status.requirement.graphSessionId);
  if (!claims.length) {
    denyPreTool("Colaboracion obligatoria: reclama primero el ambito minimo mediante claim_scope.");
    return;
  }
  if (status.requirement.required && !status.gates.peerStarted) {
    denyPreTool("Colaboracion obligatoria: Codex debe estar ejecutandose de forma comprobable antes de que Claude modifique el proyecto. Inicia o reintenta la tarea peer.");
    return;
  }
  if (fileMutation) {
    const targets = mutatingToolPaths(input);
    if (!targets.length || !targets.every((target) => claims.some((claim) =>
      claimCoversPath(store, claim, target),
    ))) {
      denyPreTool("El archivo que intentas modificar no está cubierto por un claim activo de esta sesión.");
    }
    return;
  }
  if (validationShell) return;
  if (shell) {
    denyPreTool(
      "El shell mutante o arbitrario no está autorizado por un claim. Usa Edit/Write dentro del repositorio o un comando exacto de test, lint, typecheck o build.",
    );
  }
}

function stop(store, input) {
  const repeatedStop = input.stop_hook_active === true || input.stopHookActive === true;
  const host = loadHost(store, hostSessionId(input));
  if (!host) {
    blockStop("No existe evidencia del prompt actual en nidokey-graph. Recupera session_context y completa la colaboracion antes de terminar.");
    return;
  }
  const pendingStatus = pendingStatusForHost(store, host);
  const promptClassification = classifyCollaborationTask(host.latest_prompt);
  if (!pendingStatus && !promptClassification.required) return;

  const status = pendingStatus ?? currentStatusForHost(store, host);
  if (!status?.requirement) {
    blockStop("Esta tarea requiere colaboracion, pero no esta ligada a una sesion del grafo. Llama session_context para crear y lanzar el trabajo de Codex.");
    return;
  }
  if (!status.requirement.required) return;

  const missing = [];
  if (!status.gates.peerDelivered) missing.push("resultado de Codex entregado");
  if (!status.gates.reviewed) missing.push("resultado de Codex revisado por Claude");
  if (!status.gates.handoff) missing.push("handoff conjunto publicado");
  if (missing.length) {
    if (
      repeatedStop &&
      (status.requirement.state === "blocked" ||
        ["failed", "cancelled"].includes(status.evidence.task?.status))
    ) {
      return;
    }
    blockStop(
      `No puedes cerrar una tarea colaborativa: falta ${missing.join(", ")}. ` +
        "Consulta get_delegated_task con detail=summary cuando termine Codex, integra sus conclusiones y publica publish_handoff.",
    );
  }
}

let store;
let input = {};
try {
  input = readInput();
  const event = eventName(input);
  const root = process.env.NIDOKEY_GRAPH_ROOT
    ? path.resolve(process.env.NIDOKEY_GRAPH_ROOT)
    : findProjectRoot(input.cwd);
  store = openStore({ root });

  if (event === "UserPromptSubmit") {
    const hostId = hostSessionId(input);
    upsertHostPrompt(store, {
      hostSessionId: hostId,
      cwd: input.cwd ?? root,
      prompt: input.prompt,
    });
    publishHostContext(hostId);
  } else if (event === "PreToolUse") {
    preToolUse(store, input);
  } else if (event === "Stop") {
    stop(store, input);
  }
} catch (error) {
  const message = `nidokey-graph no pudo verificar la colaboracion: ${error.message}`;
  const event = eventName(input);
  if (event === "PreToolUse") {
    denyPreTool(message);
  } else if (event === "Stop") {
    blockStop(message);
  } else {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
} finally {
  store?.close();
}
