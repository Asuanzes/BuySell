import fs from "node:fs";

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output-last-message");
const outputPath = outputIndex >= 0 ? argumentsList[outputIndex + 1] : null;
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
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
    `${JSON.stringify({ type: "thread.started", thread_id: "fake-thread" })}\n`,
  );
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
