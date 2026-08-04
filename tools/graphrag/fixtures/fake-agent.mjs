import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output-last-message");
const outputPath = outputIndex >= 0 ? argumentsList[outputIndex + 1] : null;
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
if (
  process.env.NODE_ENV === "test" &&
  process.env.NIDOKEY_GRAPH_DB &&
  process.env.NIDOKEY_GRAPH_TASK_ID
) {
  const db = new DatabaseSync(process.env.NIDOKEY_GRAPH_DB);
  db.exec("PRAGMA busy_timeout = 10000");
  const timestamp = new Date().toISOString();
  const graphSessionId = `fake-codex-${process.pid}`;
  db.prepare(`
    INSERT OR REPLACE INTO agent_sessions(
      session_id, agent, current_task, delegated_task_id,
      status, last_seen_at, metadata_json
    ) VALUES(?, 'codex', 'fake session_context', ?, 'active', ?, '{}')
  `).run(graphSessionId, process.env.NIDOKEY_GRAPH_TASK_ID, timestamp);
  db.prepare(`
    INSERT INTO activity(agent, session_id, action, payload_json, created_at)
    VALUES('codex', ?, 'session_context', '{}', ?)
  `).run(graphSessionId, timestamp);
  db.close();
}
if (outputPath) {
  process.stdout.write(
    `${JSON.stringify({ type: "thread.started", thread_id: "fake-thread" })}\n`,
  );
}
const delayMs = Number(process.env.NIDOKEY_GRAPH_TEST_DELAY_MS ?? 0);
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

const result = {
  outcome: "completed",
  summary: `Ejecución simulada para ${process.env.NIDOKEY_GRAPH_TASK_ID ?? "sin tarea"}`,
  changedPaths: [],
  tests: ["fake-agent"],
  nextSteps: [],
  needsUserInput: false
};

if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(result));
  process.stdout.write(
    `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(result) } })}\n`,
  );
  process.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
} else {
  process.stdout.write(
    JSON.stringify({
      type: "result",
      session_id: "fake-session",
      structured_output: result,
      prompt_received: prompt.length > 0
    }),
  );
}
