import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
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
import {
  classifyCollaborationTask,
  upsertHostPrompt,
  upsertRequirement,
} from "./lib/collaboration.mjs";

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

test("clasifica la colaboración obligatoria con excepciones estrechas", () => {
  for (const task of [
    "Implementa autenticación robusta",
    "Corrige el bug de login",
    "Refactoriza el chat en tiempo real",
    "Haz una revisión adversarial de seguridad",
    "Mejora la app",
    "Haz un análisis del proyecto",
    "Haz una auditoría del proyecto",
    "Añade un botón",
    "Completa la pantalla",
    "Termina la app",
    "Elimina el componente",
    "Modifica la pantalla",
    "Explica el flujo y analiza vulnerabilidades",
    "Escribe un prompt y analiza la autenticación",
    "Comprueba el estado y analiza la seguridad",
    "Explica el flujo e implementa la corrección",
    "Escribe un prompt y refactoriza el componente",
    "Corrige una errata en README y refactoriza el componente",
  ]) {
    assert.equal(classifyCollaborationTask(task).required, true, task);
  }
  for (const task of [
    "¿Qué es TaskOutput?",
    "Comprueba si Codex sigue trabajando",
    "Escribe un prompt para Claude",
    "Corrige una errata en README",
    "Escribe un prompt para Claude sobre Catastro",
    "¿Qué es un MCP?",
    "Comprueba el estado de seguridad",
    "¿Qué es OAuth?",
    "Hola",
    "Gracias",
    "¿Qué es un análisis de seguridad?",
    "Explica qué contiene una auditoría",
    "Sí",
    "Cambia una coma en README",
  ]) {
    assert.equal(classifyCollaborationTask(task).required, false, task);
  }
});

test("correlaciona hosts explícitos y reutiliza el requisito tras reconectar MCP", () => {
  const root = fixture();
  const store = openStore({ root });
  try {
    upsertHostPrompt(store, {
      hostSessionId: "host-a",
      cwd: root,
      prompt: "Implementa autenticación robusta",
    });
    upsertHostPrompt(store, {
      hostSessionId: "host-b",
      cwd: root,
      prompt: "Implementa el chat",
    });
    const rawSecret = "abcdefghijklmnopqrstuvwxyz123456";
    const sanitizedHost = upsertHostPrompt(store, {
      hostSessionId: "host-secret",
      cwd: root,
      prompt: `Implementa el login con token=${rawSecret}`,
    });
    assert.equal(sanitizedHost.latestPrompt.includes(rawSecret), false);
    assert.match(sanitizedHost.latestPrompt, /\[REDACTED\]/);
    const first = upsertRequirement(
      store,
      { agent: "claude-code", sessionId: "graph-a-1", hostSessionId: "host-a" },
      { task: "Implementa autenticación robusta", contextKey: "auth" },
    );
    const other = upsertRequirement(
      store,
      { agent: "claude-code", sessionId: "graph-b-1", hostSessionId: "host-b" },
      { task: "Implementa el chat", contextKey: "auth" },
    );
    const reconnected = upsertRequirement(
      store,
      { agent: "claude-code", sessionId: "graph-a-2", hostSessionId: "host-a" },
      { task: "Implementa autenticación robusta", contextKey: "auth" },
    );
    assert.notEqual(first.id, other.id);
    assert.equal(reconnected.id, first.id);
    assert.equal(reconnected.graphSessionId, "graph-a-2");
    assert.throws(
      () =>
        upsertRequirement(
          store,
          {
            agent: "claude-code",
            sessionId: "graph-unknown",
            hostSessionId: "host-does-not-exist",
          },
          { task: "Implementa pagos", contextKey: "payments" },
        ),
      /host_session_id no registrado/,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("el hook bloquea edición y cierre si Claude omite la colaboración", () => {
  const root = fixture();
  const hookPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "collaboration-hook.mjs",
  );
  const invoke = (payload) =>
    spawnSync(process.execPath, ["--no-warnings", hookPath], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify(payload),
    });
  try {
    const prompt = invoke({
      hook_event_name: "UserPromptSubmit",
      session_id: "host-required",
      cwd: root,
      prompt: "Implementa autenticación robusta",
    });
    assert.equal(prompt.status, 0);
    const edit = invoke({
      hook_event_name: "PreToolUse",
      session_id: "host-required",
      cwd: root,
      tool_name: "Edit",
      tool_input: { file_path: path.join(root, "src", "auth.ts") },
    });
    const editDecision = JSON.parse(edit.stdout);
    assert.equal(editDecision.hookSpecificOutput.permissionDecision, "deny");
    for (const command of [
      "npm test",
      "npm run build",
      "npm run lint -- --fix",
      "npm test -- --updateSnapshot",
      "node --test evil.mjs",
      "npx tsc",
      "git status & node evil.js",
      "ls & node evil.js",
    ]) {
      const shell = invoke({
        hook_event_name: "PreToolUse",
        session_id: "host-required",
        cwd: root,
        tool_name: "Bash",
        tool_input: { command },
      });
      assert.equal(
        JSON.parse(shell.stdout).hookSpecificOutput.permissionDecision,
        "deny",
        command,
      );
    }
    const stop = invoke({
      hook_event_name: "Stop",
      session_id: "host-required",
      cwd: root,
      stop_hook_active: false,
    });
    assert.equal(JSON.parse(stop.stdout).decision, "block");
    const loopGuard = invoke({
      hook_event_name: "Stop",
      session_id: "host-required",
      cwd: root,
      stop_hook_active: true,
    });
    assert.equal(JSON.parse(loopGuard.stdout).decision, "block");

    invoke({
      hook_event_name: "UserPromptSubmit",
      session_id: "host-trivial",
      cwd: root,
      prompt: "¿Qué es TaskOutput?",
    });
    const trivialStop = invoke({
      hook_event_name: "Stop",
      session_id: "host-trivial",
      cwd: root,
    });
    assert.equal(trivialStop.stdout.trim(), "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

test("los análisis delegados son no exclusivos y conviven con el editor", () => {
  const root = fixture();
  const store = openStore({ root });
  const claude = { agent: "claude-code", sessionId: "claude-editor" };
  try {
    refreshIndex(store);
    const editorClaim = claimScope(store, claude, {
      scope: "src/auth.ts",
      task: "Implementar validación",
      ttl_minutes: 30,
    });
    assert.equal(editorClaim.acquired, true);

    const analysis = delegateTask(store, claude, {
      target_agent: "codex",
      title: "Revisión paralela",
      instructions: "Analiza la validación sin modificar archivos.",
      scope: "src/auth.ts",
      mode: "analyze",
      priority: 3,
    }).task;
    const edit = delegateTask(store, claude, {
      target_agent: "codex",
      title: "Edición conflictiva",
      instructions: "Intenta editar la misma validación.",
      scope: "src/auth.ts",
      mode: "edit",
      priority: 2,
    }).task;
    authorizeBackgroundTasks(store, claude, [analysis.id, edit.id]);

    const leased = leaseNextEligibleTask(store, { taskIds: [analysis.id] });
    assert.equal(leased.task.id, analysis.id);
    assert.equal(leased.claimId, null);
    assert.equal(
      store.db.prepare("SELECT COUNT(*) AS count FROM claims WHERE status = 'active'").get()
        .count,
      1,
    );
    const board = listDelegatedTasks(store, { limit: 10 });
    assert.equal(
      board.tasks.find((task) => task.id === edit.id).eligibility.state,
      "waiting_scope",
    );
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
  // deepseek: wrapper API solo-análisis. Guardas de entorno para no depender
  // del orden de tests ni de claves reales.
  const previousDeepseekKey = process.env.DEEPSEEK_API_KEY;
  const previousTestExecutor = process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT;
  const deepseekInput = {
    task: { ...base, targetAgent: "deepseek" },
    root: process.cwd(),
    schemaPath,
    resultPath: path.join(os.tmpdir(), "deepseek-result.json"),
    mcpConfigPath: path.join(process.cwd(), ".mcp.json"),
  };
  assert.throws(() => buildExecution(deepseekInput), /DEEPSEEK_API_KEY/);
  process.env.DEEPSEEK_API_KEY = "test-not-a-real-key";
  const deepseek = buildExecution(deepseekInput);
  assert.equal(deepseek.args[0], "--use-system-ca");
  assert.ok(deepseek.args[1].endsWith("deepseek-runner.mjs"));
  assert.ok(deepseek.args.includes("--output-last-message"));
  assert.equal(deepseek.source, "api-wrapper");
  assert.equal(deepseek.args.includes(base.instructions), false);
  assert.throws(
    () =>
      buildExecution({
        ...deepseekInput,
        task: { ...base, targetAgent: "deepseek", mode: "edit", scope: "." },
      }),
    /mode=analyze/,
  );
  assert.equal(sanitizedEnvironment().DEEPSEEK_API_KEY, "test-not-a-real-key");
  if (previousDeepseekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = previousDeepseekKey;
  if (previousTestExecutor !== undefined) {
    process.env.NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT = previousTestExecutor;
  }
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
    assert.equal(initialized.result.serverInfo.version, "0.6.0");
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

function startMcpClient(agent, root, databasePath, extraEnvironment = {}) {
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.mjs");
  const child = spawn(
    process.execPath,
    ["--no-warnings", serverPath, "--root", root, "--db", databasePath],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...extraEnvironment,
        NIDOKEY_GRAPH_AGENT: agent,
      },
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

test("Claude autoarranca una única revisión Codex y no puede cerrar sin integrarla", async () => {
  const root = fixture();
  const databasePath = path.join(root, ".graphrag", "mandatory.sqlite");
  const fakeExecutor = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "fake-agent.mjs",
  );
  const bootstrap = openStore({ root, databasePath });
  refreshIndex(bootstrap);
  upsertHostPrompt(bootstrap, {
    hostSessionId: "host-mandatory",
    cwd: root,
    prompt: "Implementa una validación robusta de autenticación",
  });
  bootstrap.close();
  const claude = startMcpClient("claude-code", root, databasePath, {
    NODE_ENV: "test",
    NIDOKEY_GRAPH_TEST_EXECUTOR_SCRIPT: fakeExecutor,
    NIDOKEY_GRAPH_TEST_DELAY_MS: "1200",
    NIDOKEY_GRAPH_TEST_HEARTBEAT_MS: "100",
    NIDOKEY_GRAPH_COLLAB_POLICY: "required",
    NIDOKEY_GRAPH_COLLAB_DAILY_LIMIT: "8",
    NIDOKEY_GRAPH_COLLAB_TIMEOUT_MINUTES: "5",
  });
  try {
    await claude.initialize();
    let session = await claude.request("tools/call", {
      name: "session_context",
      arguments: {
        task: "Implementa una validación robusta de autenticación",
        context_key: "mandatory-auth",
        scope_hint: "src/auth.ts",
        host_session_id: "host-mandatory",
      },
    });
    let payload = JSON.parse(session.result.content[0].text);
    assert.equal(payload.collaboration.required, true);
    assert.equal(payload.collaboration.classification, "critical");
    const peerTaskId = payload.collaboration.peerTask.id;

    const earlyHandoff = await claude.request("tools/call", {
      name: "publish_handoff",
      arguments: { summary: "No debe cerrar todavía" },
    });
    assert.equal(earlyHandoff.result.isError, true);

    const startDeadline = Date.now() + 5000;
    let claimPayload = { acquired: false };
    while (Date.now() < startDeadline && !claimPayload.acquired) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const claim = await claude.request("tools/call", {
        name: "claim_scope",
        arguments: {
          scope: "src/auth.ts",
          task: "Implementar validación",
        },
      });
      claimPayload = JSON.parse(claim.result.content[0].text);
      if (!claimPayload.acquired) {
        assert.equal(claimPayload.gate.state, "waiting_peer_start");
      }
    }
    assert.equal(claimPayload.acquired, true);
    session = await claude.request("tools/call", {
      name: "session_context",
      arguments: {
        task: "Implementa una validación robusta de autenticación",
        context_key: "mandatory-auth",
        scope_hint: "src/auth.ts",
        host_session_id: "host-mandatory",
      },
    });
    payload = JSON.parse(session.result.content[0].text);
    assert.equal(payload.collaboration.gates.peerStarted, true);
    assert.equal(payload.collaboration.gates.graphContextUsed, true);
    assert.ok(payload.collaboration.run.workerPid > 0);
    assert.ok(payload.collaboration.run.childPid > 0);
    assert.equal(payload.collaboration.run.externalSessionId, "fake-thread");

    const hookPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "collaboration-hook.mjs",
    );
    const invokeHook = (filePath) => spawnSync(
      process.execPath,
      ["--no-warnings", hookPath],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NIDOKEY_GRAPH_DB: databasePath,
          NIDOKEY_GRAPH_ROOT: root,
        },
        input: JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: "host-mandatory",
          cwd: root,
          tool_name: "Edit",
          tool_input: { file_path: filePath },
        }),
      },
    );
    assert.equal(
      invokeHook(path.join(root, "src", "auth.ts")).stdout.trim(),
      "",
    );
    const outsideClaim = JSON.parse(
      invokeHook(path.join(root, "src", "route.ts")).stdout,
    );
    assert.equal(
      outsideClaim.hookSpecificOutput.permissionDecision,
      "deny",
    );

    const claimReuse = await claude.request("tools/call", {
      name: "claim_scope",
      arguments: { scope: "src/auth.ts", task: "Implementar validación" },
    });
    assert.equal(JSON.parse(claimReuse.result.content[0].text).acquired, true);

    let taskStatus = "running";
    const resultDeadline = Date.now() + 7000;
    while (Date.now() < resultDeadline && taskStatus === "running") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const status = await claude.request("tools/call", {
        name: "get_delegated_task",
        arguments: { task_id: peerTaskId, detail: "status" },
      });
      taskStatus = JSON.parse(status.result.content[0].text).task.status;
    }
    assert.equal(taskStatus, "succeeded");
    const beforeSummary = await claude.request("tools/call", {
      name: "publish_handoff",
      arguments: { summary: "Todavía no se ha leído Codex" },
    });
    assert.equal(beforeSummary.result.isError, true);
    const summary = await claude.request("tools/call", {
      name: "get_delegated_task",
      arguments: { task_id: peerTaskId, detail: "summary" },
    });
    assert.equal(JSON.parse(summary.result.content[0].text).collaboration.marked, true);
    const handoff = await claude.request("tools/call", {
      name: "publish_handoff",
      arguments: {
        summary: "Validación implementada e integrada con la revisión Codex.",
        paths: ["src/auth.ts"],
        tests: ["fake-agent"],
        peer_task_id: peerTaskId,
        peer_findings_disposition: [
          "Aceptado: mantener validación server-side y cubrir el caso sin token.",
        ],
      },
    });
    const handoffPayload = JSON.parse(handoff.result.content[0].text);
    assert.ok(handoffPayload.id);
    assert.equal(handoffPayload.collaboration.readyForStop, true);

    const verification = openStore({ root, databasePath });
    try {
      const peers = verification.db
        .prepare(`
          SELECT COUNT(*) AS count FROM delegated_tasks
          WHERE created_by_agent = 'claude-code'
            AND target_agent = 'codex'
            AND idempotency_key LIKE 'mandatory-collab:%'
        `)
        .get().count;
      assert.equal(peers, 1);
      assert.equal(
        verification.db
          .prepare("SELECT COUNT(*) AS count FROM claims WHERE session_id LIKE 'runner:%'")
          .get().count,
        0,
      );
    } finally {
      verification.close();
    }
  } finally {
    await claude.close();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 29) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
});

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

test("habla MCP por stdio con framing Content-Length (compatible VS Code/Copilot)", async () => {
  const root = fixture();
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.mjs");
  const protocolDatabase = path.join(root, ".graphrag", "protocol.sqlite");
  const seeded = openStore({ root, databasePath: protocolDatabase });
  seeded.close();

  const child = spawn(
    process.execPath,
    ["--no-warnings", serverPath, "--root", root, "--db", protocolDatabase],
    { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NIDOKEY_GRAPH_AGENT: "codex" } },
  );

  let outBuf = Buffer.alloc(0);
  const pending = new Map();
  const parseFramed = () => {
    for (;;) {
      const hdrEnd = outBuf.indexOf("\r\n\r\n");
      if (hdrEnd === -1) return;
      const header = outBuf.subarray(0, hdrEnd).toString("utf8");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) return;
      const length = parseInt(match[1], 10);
      if (outBuf.length < hdrEnd + 4 + length) return;
      const body = outBuf.subarray(hdrEnd + 4, hdrEnd + 4 + length).toString("utf8");
      outBuf = outBuf.subarray(hdrEnd + 4 + length);
      const message = JSON.parse(body);
      if (pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    }
  };
  child.stdout.on("data", (chunk) => {
    outBuf = Buffer.concat([outBuf, chunk]);
    parseFramed();
  });

  const request = (id, method, params = {}) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MCP CL timeout: ${method}`)), 8000);
      pending.set(id, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
      const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
      child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
      child.stdin.write(body);
    });

  try {
    const initialized = await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "vs-code-test", version: "1.0.0" },
      capabilities: {},
    });
    assert.equal(initialized.result.serverInfo.name, "nidokey-graph");
    const listed = await request(2, "tools/list");
    assert.ok(listed.result.tools.some((tool) => tool.name === "session_context"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "claim_scope"));
    assert.ok(listed.result.tools.some((tool) => tool.name === "publish_handoff"));
  } finally {
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
