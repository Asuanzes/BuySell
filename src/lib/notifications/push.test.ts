// Ejecutar: node --import tsx --test src/lib/notifications/push.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inQuietHours, localHourIn } from "./push";

test("sin franja configurada nunca silencia", () => {
  assert.equal(inQuietHours(3, null, null), false);
  assert.equal(inQuietHours(3, 23, null), false);
  assert.equal(inQuietHours(3, null, 8), false);
});

test("franja normal (1 → 6) silencia dentro y no fuera", () => {
  assert.equal(inQuietHours(0, 1, 6), false);
  assert.equal(inQuietHours(1, 1, 6), true); // inicio incluido
  assert.equal(inQuietHours(5, 1, 6), true);
  assert.equal(inQuietHours(6, 1, 6), false); // fin excluido
  assert.equal(inQuietHours(12, 1, 6), false);
});

test("franja que cruza medianoche (23 → 8) silencia a ambos lados", () => {
  assert.equal(inQuietHours(23, 23, 8), true);
  assert.equal(inQuietHours(2, 23, 8), true);
  assert.equal(inQuietHours(7, 23, 8), true);
  assert.equal(inQuietHours(8, 23, 8), false); // fin excluido
  assert.equal(inQuietHours(22, 23, 8), false);
  assert.equal(inQuietHours(15, 23, 8), false);
});

test("franja degenerada (start === end) no silencia (evita silenciar 24h)", () => {
  assert.equal(inQuietHours(10, 9, 9), false);
});

test("localHourIn respeta la zona y aguanta zonas inválidas", () => {
  // 2026-07-26T22:30:00Z = 00:30 del 27 en Madrid (CEST, +2)
  const t = new Date("2026-07-26T22:30:00Z");
  assert.equal(localHourIn("Europe/Madrid", t), 0);
  assert.equal(localHourIn("UTC", t), 22);
  // Zona basura → no lanza, cae al default (Madrid)
  assert.equal(localHourIn("Marte/Olympus", t), 0);
  assert.equal(localHourIn(null, t), 0);
});

test("caso real: alerta de madrugada con franja 23→8 se silencia en Madrid pero no en México", () => {
  const t = new Date("2026-07-26T22:30:00Z"); // 00:30 Madrid · 16:30 Ciudad de México
  assert.equal(inQuietHours(localHourIn("Europe/Madrid", t), 23, 8), true);
  assert.equal(inQuietHours(localHourIn("America/Mexico_City", t), 23, 8), false);
});
