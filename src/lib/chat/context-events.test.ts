/**
 * Tests del texto de eventos de registro vinculado (mensajes SYSTEM del chat).
 * Ejecutar:  node --import tsx --test src/lib/chat/context-events.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { contextEventText } from "./context-events";

test("contextEventText: bajada y subida de precio con importes formateados", () => {
  const down = contextEventText({ oldCents: 10_000_000, newCents: 9_500_000 });
  assert.ok(down?.includes("ha bajado"));
  assert.ok(down?.includes("📉"));
  const up = contextEventText({ oldCents: 9_500_000, newCents: 10_000_000 });
  assert.ok(up?.includes("ha subido"));
  assert.ok(up?.includes("📈"));
});

test("contextEventText: renta usa 'la renta' (ficha mixta) y el título prefija", () => {
  const t = contextEventText({ oldCents: 90_000, newCents: 85_000, isRent: true });
  assert.ok(t?.startsWith("📉 la renta"));
  const withTitle = contextEventText({ oldCents: 90_000, newCents: 85_000 }, "Piso en Gascona");
  assert.ok(withTitle?.includes("«Piso en Gascona»"));
});

test("contextEventText: vendido y retirado tienen prioridad sobre el precio", () => {
  assert.ok(contextEventText({ oldCents: 1, newCents: 2, status: "SOLD" })?.includes("VENDIDO"));
  assert.ok(contextEventText({ oldCents: 1, newCents: 2, status: "REMOVED" })?.includes("desaparecido"));
});

test("contextEventText: sin cambio o sin datos no hay mensaje", () => {
  assert.equal(contextEventText({ oldCents: 100, newCents: 100 }), null);
  assert.equal(contextEventText({ oldCents: null, newCents: 100 }), null);
  assert.equal(contextEventText({ oldCents: 100, newCents: null }), null);
  // Estado no noticiable tampoco.
  assert.equal(contextEventText({ oldCents: 100, newCents: 100, status: "ACTIVE" }), null);
});
