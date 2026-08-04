#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openStore } from "./lib/store.mjs";
import { refreshIndex } from "./lib/indexer.mjs";
import {
  delegatedTaskUsedSessionContext,
  dispatchEligibleTasks,
  finalizeRunner,
  heartbeatRun,
  setRunPaths,
  taskInstructionsForRunner,
} from "./lib/orchestration.mjs";
import {
  buildExecution,
  buildTaskPrompt,
  extractExternalSessionId,
  parseTaskOutput,
  redactObviousSecrets,
  sanitizedEnvironment,
} from "./lib/executors.mjs";

const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const HEARTBEAT_MS =
  process.env.NODE_ENV === "test" && process.env.NIDOKEY_GRAPH_TEST_HEARTBEAT_MS
    ? Math.max(Number(process.env.NIDOKEY_GRAPH_TEST_HEARTBEAT_MS), 50)
    : 5000;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const runId = argumentValue("--run") ?? process.env.NIDOKEY_GRAPH_RUN_ID;
if (!runId) throw new Error("--run es obligatorio");

const store = openStore();
const taskId = store.db
  .prepare("SELECT task_id FROM task_runs WHERE id = ?")
  .get(runId)?.task_id;
const details = taskInstructionsForRunner(store, taskId);
const task = details.task;
const runDirectory = path.join(store.root, ".graphrag", "runs");
fs.mkdirSync(runDirectory, { recursive: true });
const logPath = path.join(runDirectory, `${runId}.log`);
const resultPath = path.join(runDirectory, `${runId}.result.json`);
const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(runtimeDirectory, "task-output.schema.json");
const mcpConfigPath = path.join(runtimeDirectory, "worker-mcp.json");
const prompt = buildTaskPrompt(task, details.dependencies);
const execution = buildExecution({
  task,
  root: store.root,
  schemaPath,
  resultPath,
  mcpConfigPath,
});

setRunPaths(store, runId, {
  logPath: path.relative(store.root, logPath).replaceAll("\\", "/"),
  resultPath: path.relative(store.root, resultPath).replaceAll("\\", "/"),
});

const logStream = fs.createWriteStream(logPath, { flags: "a", mode: 0o600 });
let capturedStdout = Buffer.alloc(0);
let capturedStderr = Buffer.alloc(0);
let logBytes = 0;
let finished = false;
let cancellationRequested = false;
let terminationStarted = false;
let externalSessionRecorded = false;
let child;
let heartbeatTimer;
let timeoutTimer;

function appendBounded(current, chunk) {
  const next = Buffer.concat([current, Buffer.from(chunk)]);
  return next.length <= MAX_CAPTURE_BYTES
    ? next
    : next.subarray(next.length - MAX_CAPTURE_BYTES);
}

function writeLog(channel, message) {
  if (logBytes >= MAX_LOG_BYTES) return;
  const payload = Buffer.from(
    `[${new Date().toISOString()}] ${channel} ${redactObviousSecrets(message)}\n`,
  );
  const remaining = MAX_LOG_BYTES - logBytes;
  const bounded = payload.subarray(0, remaining);
  logStream.write(bounded);
  logBytes += bounded.length;
}

async function terminateProcessTree() {
  if (!child || !Number.isInteger(child.pid) || child.exitCode !== null) return;
  if (terminationStarted) return;
  terminationStarted = true;
  cancellationRequested = true;

  if (process.platform === "win32") {
    child.kill("SIGTERM");
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  if (child.exitCode !== null) return;

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    const taskkillPath = systemRoot
      ? path.join(systemRoot, "System32", "taskkill.exe")
      : null;
    if (!taskkillPath || !fs.existsSync(taskkillPath)) return;
    await new Promise((resolve) => {
      const killer = spawn(
        taskkillPath,
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true, shell: false },
      );
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  setTimeout(() => {
    if (child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 5000).unref();
}

async function finalize(exitCode, signal, processError = null) {
  if (finished) return;
  finished = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (timeoutTimer) clearTimeout(timeoutTimer);

  try {
    const stdoutText = capturedStdout.toString("utf8");
    const stderrText = capturedStderr.toString("utf8");
    const externalSessionId = extractExternalSessionId(task.targetAgent, stdoutText);
    setRunPaths(store, runId, { externalSessionId });

    let resultText = "";
    try {
      if (fs.existsSync(resultPath)) resultText = fs.readFileSync(resultPath, "utf8");
    } catch {
      // Fall back to captured stdout.
    }
    if (!resultText) resultText = stdoutText;
    const parsedResult = parseTaskOutput(resultText);
    let result = parsedResult
      ? {
          ...parsedResult,
          summary: redactObviousSecrets(parsedResult.summary),
          changedPaths: parsedResult.changedPaths.map(redactObviousSecrets),
          tests: parsedResult.tests.map(redactObviousSecrets),
          nextSteps: parsedResult.nextSteps.map(redactObviousSecrets),
        }
      : null;
    const mandatoryReview = String(task.idempotencyKey ?? "").startsWith(
      "mandatory-collab:",
    );
    const graphProtocolMissing = Boolean(
      result &&
        mandatoryReview &&
        !delegatedTaskUsedSessionContext(store, task.id),
    );
    if (graphProtocolMissing) result = null;

    if (result) {
      try {
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), { mode: 0o600 });
      } catch {
        // The database result remains the canonical handoff.
      }
    } else {
      try {
        if (fs.existsSync(resultPath)) fs.rmSync(resultPath);
      } catch {
        // Never persist an invalid raw model response deliberately.
      }
    }

    const error =
      redactObviousSecrets(
        processError?.message ??
          (graphProtocolMissing
            ? "Codex no acreditó session_context en nidokey-graph"
            : null) ??
          (cancellationRequested
            ? "Cancelación solicitada"
            : exitCode === 0 && result
              ? ""
              : `El ejecutor terminó con código ${exitCode ?? "desconocido"}${signal ? ` (${signal})` : ""}${stderrText ? `: ${stderrText.slice(-2000)}` : ""}`),
      ) || null;

    finalizeRunner(store, runId, { exitCode, result, error });
    try {
      refreshIndex(store);
    } catch (refreshError) {
      writeLog("refresh-error", refreshError.message);
    }
    try {
      dispatchEligibleTasks(store);
    } catch (dispatchError) {
      writeLog("dispatch-error", dispatchError.message);
    }
  } catch (finalizeError) {
    writeLog(
      "finalize-error",
      redactObviousSecrets(finalizeError.stack ?? finalizeError.message),
    );
  } finally {
    logStream.end();
    store.close();
  }
}

child = spawn(execution.command, execution.args, {
  cwd: execution.cwd ?? store.root,
  shell: false,
  detached: process.platform !== "win32",
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"],
  env: sanitizedEnvironment({
    NIDOKEY_GRAPH_AGENT: task.targetAgent,
    NIDOKEY_GRAPH_TASK_ID: task.id,
    NIDOKEY_GRAPH_RUN_ID: runId,
    NIDOKEY_GRAPH_ROOT: store.root,
    NIDOKEY_GRAPH_DB: store.databasePath,
  }),
});

setRunPaths(store, runId, { childPid: child.pid });
writeLog("runner", `Ejecutor ${task.targetAgent} iniciado (pid ${child.pid})`);

child.stdout.on("data", (chunk) => {
  capturedStdout = appendBounded(capturedStdout, chunk);
  if (!externalSessionRecorded) {
    const externalSessionId = extractExternalSessionId(
      task.targetAgent,
      capturedStdout.toString("utf8"),
    );
    if (externalSessionId) {
      setRunPaths(store, runId, { externalSessionId });
      externalSessionRecorded = true;
      writeLog("runner", `Sesión externa confirmada (${externalSessionId})`);
    }
  }
  writeLog("stdout", `${chunk.length} bytes capturados; contenido omitido`);
});
child.stderr.on("data", (chunk) => {
  capturedStderr = appendBounded(capturedStderr, chunk);
  writeLog("stderr", `${chunk.length} bytes capturados; contenido omitido`);
});
child.once("error", (error) => {
  writeLog("process-error", error.stack ?? error.message);
  void finalize(null, null, error);
});
child.once("exit", (code, signal) => {
  void finalize(code, signal);
});
child.stdin.end(prompt);

heartbeatTimer = setInterval(async () => {
  try {
    const status = heartbeatRun(store, runId, child.pid);
    if (status === "cancel_requested") await terminateProcessTree();
  } catch (error) {
    writeLog("heartbeat-error", error.message);
  }
}, HEARTBEAT_MS);
heartbeatTimer.unref();

timeoutTimer = setTimeout(async () => {
  writeLog("timeout", `Tiempo máximo agotado (${task.timeoutSeconds}s)`);
  await terminateProcessTree();
}, task.timeoutSeconds * 1000);
timeoutTimer.unref();

process.on("SIGTERM", async () => {
  await terminateProcessTree();
});
process.on("SIGINT", async () => {
  await terminateProcessTree();
});
