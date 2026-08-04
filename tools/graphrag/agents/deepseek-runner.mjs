#!/usr/bin/env node
// Ejecutor DeepSeek para nidokey-graph (rol: diseño de producto/UX, solo análisis).
// Contrato del runner: prompt por stdin → TaskOutput JSON por stdout y, si se
// pasa --output-last-message <ruta>, también a ese archivo. Sin acceso al
// working tree: DeepSeek nunca edita; changedPaths siempre queda vacío.
import fs from "node:fs";

const API_URL = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
// ponytail: deepseek-chat soporta response_format json_object; deepseek-reasoner no —
// si se fuerza NIDOKEY_DEEPSEEK_MODEL=deepseek-reasoner habrá que quitar response_format.
const MODEL = process.env.NIDOKEY_DEEPSEEK_MODEL ?? "deepseek-chat";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const SYSTEM_PROMPT = [
  "Eres DeepSeek, agente de diseño de producto y UX/UI coordinado por nidokey-graph.",
  "No implementas código ni tocas el sistema de archivos: entregas análisis, arquitectura de información, jerarquía, microcopy y estados.",
  "Responde EXCLUSIVAMENTE con un objeto JSON válido con esta forma exacta:",
  '{"outcome":"completed|partial|blocked|failed","summary":"<entrega completa en markdown>","changedPaths":[],"tests":[],"nextSteps":["<siguiente paso>"],"needsUserInput":false}',
  "Todo el entregable va dentro de summary (máximo ~4000 caracteres; prioriza decisiones sobre justificaciones).",
].join("\n");

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  process.stderr.write("Falta DEEPSEEK_API_KEY en el entorno\n");
  process.exit(1);
}
const prompt = fs.readFileSync(0, "utf8");

const response = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8192,
    stream: false,
  }),
});
if (!response.ok) {
  const detail = await response.text().catch(() => "");
  process.stderr.write(`DeepSeek API ${response.status}: ${detail.slice(0, 2000)}\n`);
  process.exit(1);
}
const payload = await response.json();
const content = payload.choices?.[0]?.message?.content ?? "";

let output = null;
try {
  const parsed = JSON.parse(content);
  if (typeof parsed.summary === "string" && typeof parsed.outcome === "string") {
    output = parsed;
  }
} catch {
  // El texto crudo sigue siendo la entrega; se envuelve abajo.
}
if (!output) output = { outcome: "partial", summary: String(content) };
output.changedPaths = [];
output.tests = Array.isArray(output.tests) ? output.tests : [];
output.nextSteps = Array.isArray(output.nextSteps) ? output.nextSteps : [];
output.needsUserInput = Boolean(output.needsUserInput);
if (payload.id) output.session_id = String(payload.id);

const text = JSON.stringify(output, null, 2);
const resultPath = argumentValue("--output-last-message");
if (resultPath) fs.writeFileSync(resultPath, text, { mode: 0o600 });
process.stdout.write(`${text}\n`);
