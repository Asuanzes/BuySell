import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BOT_TOOLS } from "./tool-defs";
import { runTool } from "./bot-tools";

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

test("ningún workflow programado llama al worker de menús", () => {
  const wf = (name: string) => readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");
  assert.ok(!wf("refresh.yml").includes("food-menus"), "refresh.yml vuelve a llamar a food-menus");
  assert.ok(!wf("food-menus.yml").includes("schedule:"), "food-menus.yml recuperó su schedule");
  assert.ok(!wf("food-expire.yml").includes("schedule:"), "food-expire.yml recuperó su schedule");
});
