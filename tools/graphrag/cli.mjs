#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openStore } from "./lib/store.mjs";
import { refreshIndex } from "./lib/indexer.mjs";
import { graphSearch, graphStatus, impactAnalysis, traceRelationships } from "./lib/retrieval.mjs";
import { activeWork } from "./lib/coordination.mjs";
import {
  authorizeBackgroundTasks,
  cancelDelegatedTask,
  dispatchEligibleTasks,
  getDelegatedTask,
  listDelegatedTasks,
  orchestrationStatus,
} from "./lib/orchestration.mjs";
import { executorAvailability } from "./lib/executors.mjs";

const rawArguments = process.argv.slice(2);
const positional = [];
for (let index = 0; index < rawArguments.length; index += 1) {
  const value = rawArguments[index];
  if (value === "--force" || value === "--confirm") continue;
  if (value === "--root" || value === "--db") {
    index += 1;
    continue;
  }
  positional.push(value);
}
const [command = "status", ...args] = positional;
const currentCliPath = fileURLToPath(import.meta.url);
const protectedCliPath = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, ".nidokey-graph", "runtime", "cli.mjs")
  : null;
if (
  ["dispatch", "cancel", "orchestrator"].includes(command) &&
  protectedCliPath &&
  path.resolve(currentCliPath).toLowerCase() !== path.resolve(protectedCliPath).toLowerCase()
) {
  if (!fs.existsSync(protectedCliPath)) {
    throw new Error("No está instalado el runtime protegido de nidokey-graph");
  }
  const forwarded = [...rawArguments];
  if (!rawArguments.includes("--root")) {
    forwarded.push(
      "--root",
      process.env.NIDOKEY_GRAPH_ROOT ?? process.cwd(),
    );
  }
  const child = spawnSync(
    process.execPath,
    ["--no-warnings", protectedCliPath, ...forwarded],
    { cwd: process.cwd(), stdio: "inherit", shell: false },
  );
  process.exit(child.status ?? 1);
}
const store = openStore();

try {
  let result;
  switch (command) {
    case "index":
    case "refresh":
      result = refreshIndex(store, { force: process.argv.includes("--force") });
      break;
    case "status":
      result = graphStatus(store);
      break;
    case "query":
    case "search":
      if (!store.metadata("last_indexed_at")) refreshIndex(store);
      result = graphSearch(store, {
        query: args.join(" "),
        max_results: 10,
        max_hops: 1,
        max_relations: 20,
        include_metadata: true,
      });
      break;
    case "get":
    case "trace":
      if (!store.metadata("last_indexed_at")) refreshIndex(store);
      result = traceRelationships(store, { start: args.join(" "), depth: 2 });
      break;
    case "impact":
      if (!store.metadata("last_indexed_at")) refreshIndex(store);
      result = impactAnalysis(store, { reference: args.join(" "), depth: 3 });
      break;
    case "active":
      result = activeWork(store, { includeHistory: true, historyLimit: 10 });
      break;
    case "tasks":
      result = listDelegatedTasks(store, { limit: 100, detail: "full" });
      break;
    case "task":
      result = getDelegatedTask(store, args[0], { detail: "full" });
      break;
    case "orchestrator":
      result = { ...orchestrationStatus(store), executors: executorAvailability() };
      break;
    case "dispatch":
      if (!process.argv.includes("--confirm")) {
        throw new Error("dispatch consume cuota; repite con --confirm");
      }
      if (!args.length) throw new Error("dispatch requiere uno o más task-id");
      result = {
        ...authorizeBackgroundTasks(
          store,
          {
            agent: "operator",
            sessionId: `cli-${process.pid}`,
            operator: true,
          },
          args,
        ),
        ...dispatchEligibleTasks(store),
      };
      break;
    case "cancel":
      result = cancelDelegatedTask(
        store,
        {
          agent: "operator",
          sessionId: `cli-${process.pid}`,
          operator: true,
        },
        { task_id: args[0], reason: args.slice(1).join(" ") || "Cancelada desde CLI" },
      );
      break;
    default:
      throw new Error(
        `Comando desconocido: ${command}. Usa index, status, query, trace, impact, active, tasks, task, orchestrator, dispatch o cancel.`,
      );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  store.close();
}
