import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "./lib/store.mjs";
import { refreshIndex } from "./lib/indexer.mjs";
import {
  findNode,
  graphSearch,
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
} from "./lib/coordination.mjs";
import {
  authorizeBackgroundTasks,
  claimDelegatedTask,
  cancelDelegatedTask,
  completeDelegatedTask,
  delegateTask,
  dispatchEligibleTasks,
  getDelegatedTask,
  leaseNextEligibleTask,
  listDelegatedTasks,
} from "./lib/orchestration.mjs";
import {
  buildExecution,
  buildTaskPrompt,
  containsObviousSecret,
  parseTaskOutput,
  redactObviousSecrets,
  sanitizedEnvironment,
} from "./lib/executors.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nidokey-graph-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "CLAUDE.md"),
    "# Brief\n\nLa autenticación se valida siempre en servidor.\n",
  );
  fs.writeFileSync(
    path.join(root, "src", "auth.ts"),
    [
      "export function requireUserId(token: string) {",
      "  if (!token) throw new Error('unauthorized');",
      "  return token;",
      "}",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "src", "route.ts"),
    [
      "import { requireUserId } from './auth';",
      "export async function GET() {",
      "  return requireUserId('test');",
      "}",
    ].join("\n"),
  );
  return root;
}

test("indexa símbolos, imports y recupera contexto con citas", () => {
  const root = fixture();
  const store = openStore({ root });
  try {
    const result = refreshIndex(store);
    assert.equal(result.files, 3);
    assert.ok(result.nodes >= 6);
    assert.ok(result.edges >= 4);
    const search = graphSearch(store, {
      query: "autenticación require user",
      max_results: 5,
      max_hops: 1,
    });
    assert.ok(search.context.some((node) => node.name === "requireUserId"));
    assert.ok(search.context.some((node) => node.citation?.startsWith("src/auth.ts:")));
    assert.ok(search.context.every((node) => !("metadata" in node)));
    assert.ok(search.context.every((node) => node.excerpt.length <= 360));
    const bounded = graphSearch(store, {
      query: "autenticación require user",
      max_results: 1,
      max_hops: 1,
    });
    assert.equal(bounded.context.length, 1);
    const included = new Set(bounded.context.map((node) => node.id));
    assert.ok(
      bounded.relations.every(
        (relation) => included.has(relation.from) && included.has(relation.to),
      ),
    );
    const expanded = graphSearch(store, {
      query: "autenticación require user",
      max_results: 5,
      max_hops: 1,
    });
    assert.ok(expanded.context.some((node) => node.depth > 0));
    const impact = impactAnalysis(store, { reference: "requireUserId", depth: 3 });
    assert.ok(impact.affected.some((node) => node.citation?.startsWith("src/route.ts:")));
    const boundedImpact = impactAnalysis(store, {
      reference: "requireUserId",
      depth: 5,
      max_nodes: 1,
      max_relations: 1,
    });
    assert.ok(boundedImpact.affected.length <= 1);
    assert.ok(boundedImpact.relations.length <= 1);
    const trace = traceRelationships(store, {
      start: "requireUserId",
      depth: 5,
      max_nodes: 2,
      max_relations: 1,
    });
    assert.ok(trace.nodes.length <= 2);
    assert.ok(trace.relations.length <= 1);
    assert.equal("metadata" in findNode(store, { reference: "requireUserId" })[0], false);
    assert.equal(
      "metadata" in
        findNode(store, {
          reference: "requireUserId",
          include_metadata: true,
        })[0],
      true,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("coordina dos agentes y rechaza ámbitos solapados", () => {
  const root = fixture();
  const storeA = openStore({ root });
  const storeB = openStore({ root });
  try {
    refreshIndex(storeA);
    const codex = registerAgent(storeA, { agent: "codex", session_id: "codex-test" });
    const claude = registerAgent(storeB, {
      agent: "claude-code",
      session_id: "claude-test",
    });
    const first = claimScope(
      storeA,
      { agent: codex.agent, sessionId: codex.sessionId },
      { scope: "src", task: "Refactor auth" },
    );
    assert.equal(first.acquired, true);
    const conflict = claimScope(
      storeB,
      { agent: claude.agent, sessionId: claude.sessionId },
      { scope: "src/auth.ts", task: "Change auth" },
    );
    assert.equal(conflict.acquired, false);
    assert.equal(conflict.conflict.agent, "codex");
    const work = activeWork(storeB);
    assert.equal(work.claims.length, 1);
    const released = releaseClaim(
      storeA,
      { agent: codex.agent, sessionId: codex.sessionId },
      { claim_id: first.id },
    );
    assert.equal(released.released.length, 1);
  } finally {
    storeB.close();
    storeA.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("mantiene sesiones paralelas del mismo agente sin sobrescribirlas", () => {
  const root = fixture();
  const store = openStore({ root });
  try {
    refreshIndex(store);
    registerAgent(store, { agent: "codex", session_id: "codex-one" });
    registerAgent(store, { agent: "codex", session_id: "codex-two" });
    const work = activeWork(store);
    assert.equal(work.agents.filter((agent) => agent.name === "codex").length, 2);
    assert.deepEqual(
      new Set(work.agents.map((agent) => agent.sessionId)),
      new Set(["codex-one", "codex-two"]),
    );
    recordDecision(
      store,
      { agent: "codex", sessionId: "codex-one" },
      {
        title: "Decisión de prueba",
        rationale: "Mantener el contrato actual.",
        paths: ["src/auth.ts"],
      },
    );
    publishHandoff(
      store,
      { agent: "codex", sessionId: "codex-one" },
      {
        summary: "Entrega de prueba.",
        paths: ["src/auth.ts"],
      },
    );
    assert.equal(activeWork(store).decisions.length, 0);
    assert.equal(activeWork(store).handoffs.length, 0);
    const withHistory = activeWork(store, {
      includeHistory: true,
      historyLimit: 1,
    });
    assert.equal(withHistory.decisions.length, 1);
    assert.equal(withHistory.handoffs.length, 1);
    releaseSessionClaims(store, {
      agent: "codex",
      sessionId: "codex-two",
    });
    assert.deepEqual(
      activeWork(store).agents.map((agent) => agent.sessionId),
      ["codex-one"],
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("delega, evita duplicados y persiste TaskOutput con handoff", () => {
  const root = fixture();
  const store = openStore({ root });
  const codex = { agent: "codex", sessionId: "codex-delegator" };
  const claude = { agent: "claude-code", sessionId: "claude-worker" };
  try {
    refreshIndex(store);
    registerAgent(store, { agent: codex.agent, session_id: codex.sessionId });
    registerAgent(store, { agent: claude.agent, session_id: claude.sessionId });
    const delegated = delegateTask(store, codex, {
      target_agent: "claude-code",
      title: "Revisar autenticación",
      instructions: "Audita requireUserId y documenta el resultado.",
      acceptance_criteria: ["Citar el archivo afectado"],
      scope: "src/auth.ts",
      mode: "analyze",
      idempotency_key: "auth-review-v1",
    });
    assert.equal(delegated.created, true);
    const duplicate = delegateTask(store, codex, {
      target_agent: "claude-code",
      title: "Revisar autenticación",
      instructions: "Audita requireUserId y documenta el resultado.",
      scope: "src/auth.ts",
      mode: "analyze",
      idempotency_key: "auth-review-v1",
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.task.id, delegated.task.id);
    assert.equal(leaseNextEligibleTask(store), null);

    const claimed = claimDelegatedTask(store, claude, {
      task_id: delegated.task.id,
      ttl_minutes: 30,
    });
    assert.equal(claimed.acquired, true);
    assert.equal(claimed.task.status, "running");
    const completed = completeDelegatedTask(store, claude, {
      task_id: delegated.task.id,
      outcome: "completed",
      summary: "requireUserId valida el token antes de continuar.",
      changed_paths: [],
      tests: ["Revisión estática"],
      next_steps: ["Mantener la validación server-side"],
    });
    assert.equal(completed.status, "succeeded");
    assert.ok(completed.handoffId);
    const detail = getDelegatedTask(store, delegated.task.id);
    assert.equal(detail.task.result.summary, "requireUserId valida el token antes de continuar.");
    assert.equal(detail.events.some((event) => event.event === "succeeded"), true);
    const statusOnly = getDelegatedTask(store, delegated.task.id, {
      detail: "status",
    });
    assert.equal(statusOnly.task.status, "succeeded");
    assert.equal("instructions" in statusOnly.task, false);
    assert.equal("result" in statusOnly.task, false);
    assert.equal("events" in statusOnly, false);
    const summary = getDelegatedTask(store, delegated.task.id, {
      detail: "summary",
    });
    assert.equal(summary.task.result.summary, "requireUserId valida el token antes de continuar.");
    assert.ok(summary.events.length <= 5);
    const compactList = listDelegatedTasks(store, { limit: 10 });
    const compactTask = compactList.tasks.find((task) => task.id === delegated.task.id);
    assert.equal("instructions" in compactTask, false);
    assert.equal("result" in compactTask, false);
    const fullList = listDelegatedTasks(store, { limit: 10, detail: "full" });
    assert.equal(
      fullList.tasks.find((task) => task.id === delegated.task.id).result.summary,
      "requireUserId valida el token antes de continuar.",
    );
    assert.ok(store.getNode(`handoff:${completed.handoffId}`));
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("respeta dependencias, límites de profundidad y leases atómicos", () => {
  const root = fixture();
  const store = openStore({ root });
  const codex = { agent: "codex", sessionId: "codex-root" };
  const claude = { agent: "claude-code", sessionId: "claude-root" };
  try {
    refreshIndex(store);
    const first = delegateTask(store, codex, {
      target_agent: "claude-code",
      title: "Analizar auth",
      instructions: "Analiza el módulo auth.",
      scope: "src/auth.ts",
      mode: "analyze",
    }).task;
    const dependent = delegateTask(store, codex, {
      target_agent: "claude-code",
      title: "Analizar route",
      instructions: "Analiza el consumidor de auth.",
      scope: "src/route.ts",
      mode: "analyze",
      depends_on: [first.id],
    }).task;
    assert.throws(
      () =>
        delegateTask(store, codex, {
          target_agent: "claude-code",
          title: "Demasiadas dependencias",
          instructions: "No debe crearse.",
          scope: "src/route.ts",
          depends_on: Array.from({ length: 9 }, (_, index) => `dependency-${index}`),
        }),
      /máximo 8 dependencias/,
    );
    const board = listDelegatedTasks(store, { limit: 10 });
    assert.equal(
      board.tasks.find((task) => task.id === dependent.id).eligibility.state,
      "waiting_dependencies",
    );
    authorizeBackgroundTasks(store, codex, [first.id, dependent.id]);
    const leasedFirst = leaseNextEligibleTask(store);
    assert.equal(leasedFirst.task.id, first.id);
    completeDelegatedTask(
      store,
      {
        agent: "claude-code",
        sessionId: `runner:${leasedFirst.runId}`,
        delegatedTaskId: first.id,
        backgroundRunId: leasedFirst.runId,
      },
      {
        task_id: first.id,
        summary: "Auth revisado",
        outcome: "completed",
      },
    );
    const leasedDependent = leaseNextEligibleTask(store);
    assert.equal(leasedDependent.task.id, dependent.id);

    const child = delegateTask(store, {
      agent: "claude-code",
      sessionId: `runner:${leasedFirst.runId}`,
      delegatedTaskId: first.id,
      backgroundRunId: leasedFirst.runId,
    }, {
      target_agent: "codex",
      title: "Documentar resultado",
      instructions: "Documenta la decisión.",
      scope: "CLAUDE.md",
      parent_task_id: first.id,
      max_depth: 2,
    }).task;
    const childSession = { agent: "codex", sessionId: "codex-child" };
    assert.equal(
      claimDelegatedTask(store, childSession, { task_id: child.id }).acquired,
      true,
    );
    const grandchild = delegateTask(store, childSession, {
      target_agent: "claude-code",
      title: "Revisar documentación",
      instructions: "Revisa la sección generada.",
      scope: "src/auth.ts",
      parent_task_id: child.id,
      max_depth: 2,
    }).task;
    const grandchildSession = { agent: "claude-code", sessionId: "claude-grandchild" };
    assert.equal(
      claimDelegatedTask(store, grandchildSession, { task_id: grandchild.id }).acquired,
      true,
    );
    assert.throws(
      () =>
        delegateTask(store, grandchildSession, {
          target_agent: "codex",
          title: "Delegación recursiva",
          instructions: "No debe crearse.",
          scope: "package.json",
          parent_task_id: grandchild.id,
          max_depth: 2,
        }),
      /Profundidad máxima/,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rechaza suplantación de sesión, raíces recursivas y ámbitos escapados", () => {
  const root = fixture();
  const store = openStore({ root });
  const creator = { agent: "codex", sessionId: "creator-session" };
  const assignee = { agent: "claude-code", sessionId: "assignee-session" };
  try {
    refreshIndex(store);
    assert.throws(
      () =>
        delegateTask(store, creator, {
          target_agent: "claude-code",
          title: "Escape",
          instructions: "No debe persistirse.",
          scope: "src/..",
        }),
      /acotada/,
    );
    const delegated = delegateTask(store, creator, {
      target_agent: "claude-code",
      title: "Tarea protegida",
      instructions: "Comprueba la propiedad de sesión.",
      scope: "src/auth.ts",
    }).task;
    assert.throws(
      () =>
        completeDelegatedTask(
          store,
          { agent: "claude-code", sessionId: "unrelated-session" },
          { task_id: delegated.id, summary: "Resultado falsificado" },
        ),
      /ejecutándose/,
    );
    assert.equal(
      claimDelegatedTask(store, assignee, { task_id: delegated.id }).acquired,
      true,
    );
    assert.throws(
      () =>
        completeDelegatedTask(
          store,
          { agent: "claude-code", sessionId: "unrelated-session" },
          { task_id: delegated.id, summary: "Resultado falsificado" },
        ),
      /no posee/,
    );
    assert.throws(
      () =>
        cancelDelegatedTask(
          store,
          { agent: "codex", sessionId: "other-creator-session" },
          { task_id: delegated.id },
        ),
      /no puede cancelar/,
    );
    const completed = completeDelegatedTask(store, assignee, {
      task_id: delegated.id,
      outcome: "completed",
      summary: "Finalización legítima",
    });
    assert.equal(completed.status, "succeeded");
    const partialTask = delegateTask(store, creator, {
      target_agent: "claude-code",
      title: "Tarea parcial",
      instructions: "Devuelve un resultado parcial.",
      scope: "src/route.ts",
    }).task;
    assert.equal(
      claimDelegatedTask(store, assignee, { task_id: partialTask.id }).acquired,
      true,
    );
    const partial = completeDelegatedTask(store, assignee, {
      task_id: partialTask.id,
      outcome: "partial",
      summary: "Falta una decisión.",
    });
    assert.equal(partial.status, "needs_input");
    const assignedEdges = store.db
      .prepare(`
        SELECT COUNT(*) AS count FROM edges
        WHERE source_id = ? AND target_id = 'agent:claude-code'
          AND relation = 'ASSIGNED_TO'
      `)
      .get(`delegated_task:${delegated.id}`).count;
    assert.equal(assignedEdges, 1);
    assert.throws(
      () =>
        delegateTask(
          store,
          {
            agent: "claude-code",
            sessionId: "runner:any",
            delegatedTaskId: delegated.id,
            backgroundRunId: "any",
          },
          {
            target_agent: "codex",
            title: "Raíz evadida",
            instructions: "No debe crear otra raíz.",
            scope: "src/route.ts",
            parent_task_id: "",
          },
        ),
      /hija de sí misma/,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migra una base previa y sanea secretos persistibles", () => {
  const root = fixture();
  const first = openStore({ root });
  const databasePath = first.databasePath;
  first.close();
  const legacy = new DatabaseSync(databasePath);
  legacy.exec("ALTER TABLE delegated_tasks DROP COLUMN background_authorized");
  legacy.close();
  const migrated = openStore({ root });
  try {
    const columns = migrated.db
      .prepare("PRAGMA table_info(delegated_tasks)")
      .all()
      .map((column) => column.name);
    assert.ok(columns.includes("background_authorized"));
    const privateKey =
      "-----BEGIN PRIVATE KEY-----\nvery-secret-material\n-----END PRIVATE KEY-----";
    assert.equal(redactObviousSecrets(privateKey), "[REDACTED_PRIVATE_KEY]");
    assert.equal(
      redactObviousSecrets("Bearer abcdefghijklmnopqrstuvwxyz"),
      "Bearer [REDACTED]",
    );
  } finally {
    migrated.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("construye ejecutores sin shell ni prompt en la línea de comandos", () => {
  const schemaPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "task-output.schema.json",
  );
  const base = {
    id: "task-test",
    parentId: null,
    title: "Revisión",
    instructions: "Busca problemas.",
    acceptanceCriteria: [],
    scope: "src",
    mode: "analyze",
    timeoutSeconds: 300,
  };
  const prompt = buildTaskPrompt({ ...base, targetAgent: "codex" });
  assert.match(prompt, /TAREA_ID: task-test/);
  assert.match(prompt, /context_key="task-test"/);
  assert.match(prompt, /No hagas commit, push/);
  const promptWithDependency = buildTaskPrompt(
    { ...base, targetAgent: "codex" },
    [{ id: "dependency-long", result: { summary: "x".repeat(5000) } }],
  );
  assert.ok(promptWithDependency.length < prompt.length + 700);
  const oversizedOutput = parseTaskOutput(
    JSON.stringify({
      outcome: "completed",
      summary: "s".repeat(5000),
      changedPaths: [],
      tests: ["t".repeat(800)],
      nextSteps: ["n".repeat(800)],
      needsUserInput: false,
    }),
  );
  assert.equal(oversizedOutput.summary.length, 4000);
  assert.equal(oversizedOutput.tests[0].length, 500);
  assert.equal(oversizedOutput.nextSteps[0].length, 500);
  const codex = buildExecution({
    task: { ...base, targetAgent: "codex" },
    root: process.cwd(),
    schemaPath,
    resultPath: path.join(os.tmpdir(), "codex-result.json"),
    mcpConfigPath: path.join(process.cwd(), ".mcp.json"),
  });
  assert.ok(codex.args.includes("--json"));
  assert.ok(codex.args.includes("read-only"));
  assert.equal(codex.args.includes(base.instructions), false);
  const claude = buildExecution({
    task: { ...base, targetAgent: "claude-code" },
    root: process.cwd(),
    schemaPath,
    resultPath: path.join(os.tmpdir(), "claude-result.json"),
    mcpConfigPath: path.join(process.cwd(), ".mcp.json"),
  });
  assert.ok(claude.args.includes("-p"));
  assert.ok(claude.args.includes("plan"));
  assert.equal(claude.args.includes(base.instructions), false);
  process.env.NIDOKEY_TEST_SECRET = "do-not-forward";
  assert.equal(sanitizedEnvironment().NIDOKEY_TEST_SECRET, undefined);
  delete process.env.NIDOKEY_TEST_SECRET;
  assert.equal(
    containsObviousSecret("token=abcdefghijklmnopqrstuvwxyz123456"),
    true,
  );
});

test("ejecuta una tarea en segundo plano y persiste el resultado sin usar modelos", async () => {
  const root = fixture();
  const store = openStore({ root });
  const fakeExecutor = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "fake-agent.mjs",
  );
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFake = process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT;
  try {
    refreshIndex(store);
    const delegated = delegateTask(
      store,
      { agent: "claude-code", sessionId: "claude-background-test" },
      {
        target_agent: "codex",
        title: "Ejecución simulada",
        instructions: "Completa la tarea sin tocar archivos.",
        scope: "src/auth.ts",
        mode: "analyze",
      },
    );
    authorizeBackgroundTasks(
      store,
      { agent: "claude-code", sessionId: "claude-background-test" },
      [delegated.task.id],
    );
    process.env.NODE_ENV = "test";
    process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT = fakeExecutor;
    const dispatch = dispatchEligibleTasks(store, { maximum: 1 });
    assert.equal(dispatch.launched.length, 1);
    const deadline = Date.now() + 10000;
    let task;
    while (Date.now() < deadline) {
      task = getDelegatedTask(store, delegated.task.id).task;
      if (task.status === "succeeded" || task.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(task.status, "succeeded");
    assert.match(task.result.summary, /Ejecución simulada/);
    const detail = getDelegatedTask(store, delegated.task.id);
    assert.equal(detail.runs[0].exitCode, 0);
    assert.equal(detail.runs[0].externalSessionId, "fake-thread");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFake === undefined) delete process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT;
    else process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT = previousFake;
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cancela únicamente el proceso de la tarea registrada", async () => {
  const root = fixture();
  const store = openStore({ root });
  const fakeExecutor = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "fake-agent.mjs",
  );
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    fake: process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT,
    delay: process.env.NIDOKEY_GRAPH_TEST_DELAY_MS,
    heartbeat: process.env.NIDOKEY_GRAPH_TEST_HEARTBEAT_MS,
  };
  try {
    refreshIndex(store);
    const creator = { agent: "claude-code", sessionId: "claude-cancel-test" };
    const delegated = delegateTask(store, creator, {
      target_agent: "codex",
      title: "Tarea cancelable",
      instructions: "Espera hasta ser cancelada.",
      scope: "src/auth.ts",
      mode: "analyze",
    });
    authorizeBackgroundTasks(store, creator, [delegated.task.id]);
    process.env.NODE_ENV = "test";
    process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT = fakeExecutor;
    process.env.NIDOKEY_GRAPH_TEST_DELAY_MS = "15000";
    process.env.NIDOKEY_GRAPH_TEST_HEARTBEAT_MS = "100";
    dispatchEligibleTasks(store, { maximum: 1 });
    let detail;
    const startDeadline = Date.now() + 5000;
    while (Date.now() < startDeadline) {
      detail = getDelegatedTask(store, delegated.task.id);
      if (detail.runs[0]?.childPid) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const childPid = detail.runs[0].childPid;
    const workerPid = detail.runs[0].workerPid;
    assert.ok(childPid > 0);
    const cancelled = cancelDelegatedTask(store, creator, {
      task_id: delegated.task.id,
      reason: "Prueba de cancelación",
    });
    assert.equal(cancelled.task.status, "cancel_requested");
    const cancelDeadline = Date.now() + 8000;
    let task;
    while (Date.now() < cancelDeadline) {
      task = getDelegatedTask(store, delegated.task.id).task;
      if (task.status === "cancelled") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(task.status, "cancelled");
    assert.throws(() => process.kill(childPid, 0));
    const runnerDeadline = Date.now() + 5000;
    while (Date.now() < runnerDeadline) {
      try {
        process.kill(workerPid, 0);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        break;
      }
    }
    assert.throws(() => process.kill(workerPid, 0));
  } finally {
    const restore = (name, value) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("NODE_ENV", previous.nodeEnv);
    restore("NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT", previous.fake);
    restore("NIDOKEY_GRAPH_TEST_DELAY_MS", previous.delay);
    restore("NIDOKEY_GRAPH_TEST_HEARTBEAT_MS", previous.heartbeat);
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("habla MCP por stdio y publica sus herramientas", async () => {
  const root = fixture();
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.mjs");
  const protocolDatabase = path.join(root, ".graphrag", "protocol.sqlite");
  const seeded = openStore({ root, databasePath: protocolDatabase });
  const longText = "contexto histórico ".repeat(320);
  const escapedLongText = "\\ruta\\subcarpeta ".repeat(900).slice(0, 12000);
  for (let index = 0; index < 10; index += 1) {
    const createdAt = new Date(Date.now() - index * 1000).toISOString();
    seeded.db
      .prepare(`
        INSERT INTO decisions(
          id, agent, session_id, title, rationale, paths_json, created_at
        ) VALUES(?, 'codex', 'seed-session', ?, ?, '["src/auth.ts"]', ?)
      `)
      .run(`decision-${index}`, `Decisión extensa ${index}`, longText, createdAt);
    seeded.db
      .prepare(`
        INSERT INTO handoffs(
          id, agent, session_id, summary, paths_json, tests_json,
          next_steps_json, created_at
        ) VALUES(
          ?, 'claude-code', 'seed-session', ?, '["src/route.ts"]',
          '["test extenso"]', '["siguiente paso extenso"]', ?
        )
      `)
      .run(`handoff-${index}`, longText, createdAt);
  }
  const queuedTask = delegateTask(
    seeded,
    { agent: "claude-code", sessionId: "seed-claude" },
    {
      target_agent: "codex",
      title: "Tarea pendiente extensa",
      instructions: escapedLongText,
      acceptance_criteria: ["No repetir el contexto completo"],
      scope: "src/auth.ts",
      mode: "analyze",
    },
  ).task;
  const terminalTask = delegateTask(
    seeded,
    { agent: "claude-code", sessionId: "seed-claude" },
    {
      target_agent: "codex",
      title: "Tarea terminada extensa",
      instructions: escapedLongText,
      scope: "src/route.ts",
      mode: "analyze",
    },
  ).task;
  const terminalWorker = { agent: "codex", sessionId: "seed-codex-worker" };
  assert.equal(
    claimDelegatedTask(seeded, terminalWorker, {
      task_id: terminalTask.id,
    }).acquired,
    true,
  );
  completeDelegatedTask(seeded, terminalWorker, {
    task_id: terminalTask.id,
    summary: longText.slice(0, 3900),
    outcome: "completed",
  });
  seeded.close();
  const child = spawn(
    process.execPath,
    [
      "--no-warnings",
      serverPath,
      "--root",
      root,
      "--db",
      protocolDatabase,
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NIDOKEY_GRAPH_AGENT: "codex" },
    },
  );
  const output = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const messages = [];
  const waiters = [];
  output.on("line", (line) => {
    const message = JSON.parse(line);
    messages.push(message);
    const index = waiters.findIndex((waiter) => waiter.id === message.id);
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
  });
  const request = (id, method, params = {}) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 5000);
      waiters.push({
        id,
        resolve(message) {
          clearTimeout(timeout);
          resolve(message);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  try {
    const initialized = await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "codex-test", version: "1.0.0" },
      capabilities: {},
    });
    assert.equal(initialized.result.serverInfo.name, "nidokey-graph");
    assert.equal(initialized.result.serverInfo.version, "0.5.0");
    assert.match(initialized.result.instructions, /Bootstrap automático/);
    const listed = await request(2, "tools/list");
    assert.ok(listed.result.tools.some((tool) => tool.name === "session_context"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "delegate_task"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "dispatch_tasks"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "orchestration_status"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "graph_search"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "claim_scope"));
    const session = await request(3, "tools/call", {
      name: "session_context",
      arguments: {
        task: "revisar autenticación",
        context_key: "auth-review",
        refresh: false,
      },
    });
    const sessionPayload = JSON.parse(session.result.content[0].text);
    assert.equal(sessionPayload.session.task, "revisar autenticación");
    assert.equal(sessionPayload.automaticIndexing.atSessionStart, true);
    assert.ok(sessionPayload.relevantContext.results.length > 0);
    assert.ok(sessionPayload.taskInbox.tasks.some((task) => task.id === queuedTask.id));
    assert.ok(!sessionPayload.taskInbox.tasks.some((task) => task.id === terminalTask.id));
    assert.ok(session.result.content[0].text.length <= 4000);
    assert.ok(sessionPayload.responseBudget.actualCharacters <= 4000);
    const repeated = await request(4, "tools/call", {
      name: "session_context",
      arguments: {
        task: "auditar de nuevo el módulo de autenticación",
        context_key: "auth-review",
        refresh: false,
      },
    });
    const repeatedPayload = JSON.parse(repeated.result.content[0].text);
    assert.equal(repeatedPayload.contextAlreadyProvided, true);
    assert.equal(repeatedPayload.contextMode, "reuse");
    assert.equal(repeatedPayload.relevantContext.results.length, 0);
    assert.ok(repeated.result.content[0].text.length < 3000);
    const status = await request(5, "tools/call", {
      name: "graph_status",
      arguments: {},
    });
    assert.equal(status.result.isError, undefined);
    assert.match(status.result.content[0].text, /"recentlyActiveAgents": 1/);

    const taskList = await request(6, "tools/call", {
      name: "list_delegated_tasks",
      arguments: { mine: true, limit: 10 },
    });
    const taskListPayload = JSON.parse(taskList.result.content[0].text);
    assert.ok(taskList.result.content[0].text.length <= 4000);
    assert.ok(taskListPayload.tasks.some((task) => task.id === queuedTask.id));
    assert.ok(taskListPayload.tasks.every((task) => !("instructions" in task)));
    assert.ok(taskListPayload.tasks.every((task) => !("result" in task)));

    const oversizedFullList = await request(13, "tools/call", {
      name: "list_delegated_tasks",
      arguments: { mine: true, limit: 10, detail: "full" },
    });
    const oversizedFullPayload = JSON.parse(
      oversizedFullList.result.content[0].text,
    );
    assert.ok(oversizedFullList.result.content[0].text.length <= 16000);
    assert.equal(oversizedFullPayload.responseTruncated, true);

    const taskStatus = await request(7, "tools/call", {
      name: "get_delegated_task",
      arguments: { task_id: terminalTask.id, detail: "status" },
    });
    const taskStatusPayload = JSON.parse(taskStatus.result.content[0].text);
    assert.ok(taskStatus.result.content[0].text.length <= 3000);
    assert.equal(taskStatusPayload.task.status, "succeeded");
    assert.equal("result" in taskStatusPayload.task, false);
    assert.equal("events" in taskStatusPayload, false);

    const taskSummary = await request(8, "tools/call", {
      name: "get_delegated_task",
      arguments: { task_id: terminalTask.id, detail: "summary" },
    });
    const taskSummaryPayload = JSON.parse(taskSummary.result.content[0].text);
    assert.ok(taskSummary.result.content[0].text.length <= 6000);
    assert.ok(taskSummaryPayload.task.result.summary.length <= 1200);

    const active = await request(9, "tools/call", {
      name: "active_work",
      arguments: {},
    });
    const activePayload = JSON.parse(active.result.content[0].text);
    assert.ok(active.result.content[0].text.length <= 5000);
    assert.equal("decisions" in activePayload, false);
    assert.equal("handoffs" in activePayload, false);
    assert.ok(activePayload.delegation.tasks.some((task) => task.id === queuedTask.id));
    assert.ok(!activePayload.delegation.tasks.some((task) => task.id === terminalTask.id));

    const search = await request(10, "tools/call", {
      name: "graph_search",
      arguments: {
        query: "autenticación require user",
        max_results: 12,
        max_hops: 1,
      },
    });
    const searchPayload = JSON.parse(search.result.content[0].text);
    assert.ok(search.result.content[0].text.length <= 10000);
    assert.ok(searchPayload.context.length <= 12);
    assert.ok(searchPayload.context.every((node) => !("metadata" in node)));

    const nodeDetail = await request(14, "tools/call", {
      name: "get_node",
      arguments: {
        reference: "src",
        max_results: 8,
        include_metadata: true,
      },
    });
    const nodeDetailPayload = JSON.parse(nodeDetail.result.content[0].text);
    assert.ok(Array.isArray(nodeDetailPayload));
    assert.ok(nodeDetailPayload.length <= 8);
    assert.ok(nodeDetail.result.content[0].text.length <= 16000);

    const traced = await request(15, "tools/call", {
      name: "trace_relationships",
      arguments: {
        start: "src/auth.ts",
        depth: 5,
        max_nodes: 12,
        max_relations: 20,
        include_metadata: true,
      },
    });
    const tracedPayload = JSON.parse(traced.result.content[0].text);
    assert.equal(tracedPayload.responseTruncated, undefined);
    assert.ok(tracedPayload.nodes.length <= 12);
    assert.ok(tracedPayload.relations.length <= 20);
    assert.ok(traced.result.content[0].text.length <= 16000);

    const impacted = await request(16, "tools/call", {
      name: "impact_analysis",
      arguments: {
        reference: "requireUserId",
        depth: 5,
        max_nodes: 8,
        max_relations: 20,
        include_metadata: true,
      },
    });
    const impactedPayload = JSON.parse(impacted.result.content[0].text);
    assert.equal(impactedPayload.responseTruncated, undefined);
    assert.ok(impactedPayload.affected.length <= 8);
    assert.ok(impactedPayload.relations.length <= 20);
    assert.ok(impacted.result.content[0].text.length <= 16000);

    const delta = await request(11, "tools/call", {
      name: "session_context",
      arguments: {
        task: "revisar route require user",
        context_key: "route-review",
        refresh: false,
      },
    });
    const deltaPayload = JSON.parse(delta.result.content[0].text);
    assert.equal(deltaPayload.contextMode, "delta");
    assert.ok(deltaPayload.relevantContext.results.length > 0);
    assert.ok(delta.result.content[0].text.length <= 4000);

    const forced = await request(12, "tools/call", {
      name: "session_context",
      arguments: {
        task: "revisar route require user",
        context_key: "route-review",
        force_context: true,
        refresh: false,
      },
    });
    const forcedPayload = JSON.parse(forced.result.content[0].text);
    assert.equal(forcedPayload.contextMode, "bootstrap");
    assert.ok(forcedPayload.relevantContext.results.length > 0);
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once("exit", resolve));
    output.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function startMcpClient(agent, root, databasePath) {
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.mjs");
  const child = spawn(
    process.execPath,
    ["--no-warnings", serverPath, "--root", root, "--db", databasePath],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NIDOKEY_GRAPH_AGENT: agent },
    },
  );
  const output = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const waiters = new Map();
  output.on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = waiters.get(message.id);
    if (!waiter) return;
    waiters.delete(message.id);
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  });
  let nextId = 1;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timeout = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`MCP timeout (${agent}): ${method}`));
      }, 5000);
      waiters.set(id, { resolve, timeout });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  return {
    child,
    request,
    async initialize() {
      return request("initialize", {
        protocolVersion: "2025-06-18",
        clientInfo: { name: agent, version: "test" },
        capabilities: {},
      });
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve) => child.once("exit", resolve));
      output.close();
    },
  };
}

test("dos procesos MCP coordinan claims y liberan al desconectar", async () => {
  const root = fixture();
  const databasePath = path.join(root, ".graphrag", "parallel.sqlite");
  const bootstrap = openStore({ root, databasePath });
  refreshIndex(bootstrap);
  bootstrap.close();
  const codex = startMcpClient("codex", root, databasePath);
  const claude = startMcpClient("claude-code", root, databasePath);
  try {
    await Promise.all([codex.initialize(), claude.initialize()]);
    const first = await codex.request("tools/call", {
      name: "claim_scope",
      arguments: { scope: "src", task: "Codex task" },
    });
    const firstPayload = JSON.parse(first.result.content[0].text);
    assert.equal(firstPayload.acquired, true);
    const conflict = await claude.request("tools/call", {
      name: "claim_scope",
      arguments: { scope: "src/auth.ts", task: "Claude task" },
    });
    const conflictPayload = JSON.parse(conflict.result.content[0].text);
    assert.equal(conflictPayload.acquired, false);
    assert.equal(conflictPayload.conflict.agent, "codex");
    await codex.close();
    const afterDisconnect = await claude.request("tools/call", {
      name: "claim_scope",
      arguments: { scope: "src/auth.ts", task: "Claude task" },
    });
    const acquiredPayload = JSON.parse(afterDisconnect.result.content[0].text);
    assert.equal(acquiredPayload.acquired, true);
  } finally {
    if (codex.child.exitCode === null) await codex.close();
    if (claude.child.exitCode === null) await claude.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
