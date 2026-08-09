import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NAV_ALLOW } from "@nidokey/shared";

import { BOT_TOOLS } from "./tool-defs";
import { runTool } from "./bot-tools";
import { BOT_SYSTEM_PROMPT } from "./agent";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

// Guard de la fase 0 (food OFF, PRODUCT_LOOP.md CICLO 2): si alguien reintroduce
// las tools de comida o reengancha el cron de menús (gasto Apify/Firecrawl),
// este test lo caza antes del deploy.

const FOOD_TOOLS = ["buscar_restaurantes", "buscar_platos", "carta_restaurante"];

test("el bot no expone tools de comida", () => {
  const names = BOT_TOOLS.map((t) => t.function.name);
  for (const food of FOOD_TOOLS) {
    assert.ok(!names.includes(food), `tool de comida reintroducida: ${food}`);
  }
});

test("runTool rechaza las tools de comida como desconocidas", async () => {
  for (const food of FOOD_TOOLS) {
    const out = await runTool(food, "{}", "token-irrelevante");
    assert.deepEqual(JSON.parse(out), { error: "herramienta desconocida" });
  }
});

test("el prompt del agente y la whitelist de navegación no mencionan food", () => {
  const prompt = BOT_SYSTEM_PROMPT;
  for (const food of FOOD_TOOLS) assert.ok(!prompt.includes(food), `prompt anuncia ${food}`);
  assert.ok(!prompt.includes("/food/"), "prompt permite navegar a /food/*");
  for (const route of NAV_ALLOW) {
    assert.ok(!route.startsWith("/food"), `NAV_ALLOW reintroduce ${route}`);
  }
});

test("kill-switch server-side: food deshabilitada por defecto", async () => {
  assert.equal(foodEnabled(), false, "FOOD_ENABLED debería requerir opt-in explícito");
  const res = foodDisabledResponse();
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "food_disabled" });
});

test("ningún workflow programado llama al worker de menús", () => {
  const wf = (name: string) => readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
  assert.ok(!wf("refresh.yml").includes("food-menus"), "refresh.yml vuelve a llamar a food-menus");
  assert.ok(!wf("food-menus.yml").includes("schedule:"), "food-menus.yml recuperó su schedule");
  assert.ok(!wf("food-expire.yml").includes("schedule:"), "food-expire.yml recuperó su schedule");
});
