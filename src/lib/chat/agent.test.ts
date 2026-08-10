import { test } from "node:test";
import assert from "node:assert/strict";

import { BOT_SYSTEM_PROMPT } from "./agent";

test("prompt exige ejecutar guardar_compartido antes de afirmar guardado", () => {
  assert.ok(
    BOT_SYSTEM_PROMPT.includes(
      "Tener el id solo te da el argumento: NO ejecuta nada por sí mismo.",
    ),
  );
  assert.ok(
    BOT_SYSTEM_PROMPT.includes(
      "la PRIMERA acción del turno es llamar a guardar_compartido",
    ),
  );
  assert.ok(
    BOT_SYSTEM_PROMPT.includes(
      "solo después de ver un resultado sin error redactas la respuesta",
    ),
  );
});

test("prompt limita la navegación a rutas permitidas sin presionar a enlazar de más", () => {
  assert.ok(BOT_SYSTEM_PROMPT.includes("Si mencionas una pantalla con ruta, enlázala"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("NUNCA inventes rutas que no estén en la lista"));
  assert.ok(!BOT_SYSTEM_PROMPT.includes("Cada pantalla/ruta de esa lista es enlazable"));
  assert.ok(!BOT_SYSTEM_PROMPT.includes("enlaza la de entrada y también la pantalla de destino"));
});

test("prompt resume capacidades en vez de enumerarlas", () => {
  assert.ok(BOT_SYSTEM_PROMPT.includes("NO recites herramientas ni verticales una a una"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("resume en 3-4 líneas cortas agrupadas"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("¿de cuál te cuento más?"));
});
