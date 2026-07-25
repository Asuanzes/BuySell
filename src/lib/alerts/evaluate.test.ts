// Ejecutar: node --import tsx --test src/lib/alerts/evaluate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldFire, alertMessage, ALERT_COOLDOWN_MS, type AlertRow } from "./evaluate";

const NOW = new Date("2026-07-26T12:00:00Z");

function alert(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "a1",
    kind: "PRICE_BELOW",
    threshold: 50_000_00, // 50.000 €
    baselineCents: 60_000_00,
    oneShot: true,
    lastFiredAt: null,
    ...over,
  };
}

// ── PRICE_BELOW ───────────────────────────────────────────────────────────
test("PRICE_BELOW salta al cruzar el umbral hacia abajo", () => {
  assert.equal(
    shouldFire(alert(), { oldCents: 50_100_00, newCents: 49_900_00 }, NOW),
    true
  );
});

test("PRICE_BELOW NO salta si ya estaba por debajo (evita spam en cada tick)", () => {
  assert.equal(
    shouldFire(alert(), { oldCents: 49_500_00, newCents: 49_400_00 }, NOW),
    false
  );
});

test("PRICE_BELOW salta sin valor anterior si la condición se cumple", () => {
  assert.equal(shouldFire(alert(), { oldCents: null, newCents: 49_000_00 }, NOW), true);
});

test("PRICE_BELOW no salta por encima del umbral", () => {
  assert.equal(shouldFire(alert(), { oldCents: 60_000_00, newCents: 55_000_00 }, NOW), false);
});

test("PRICE_BELOW salta justo EN el umbral (<=)", () => {
  assert.equal(shouldFire(alert(), { oldCents: 50_001_00, newCents: 50_000_00 }, NOW), true);
});

// ── PRICE_ABOVE ───────────────────────────────────────────────────────────
test("PRICE_ABOVE salta al cruzar hacia arriba y no si ya estaba encima", () => {
  const a = alert({ kind: "PRICE_ABOVE" });
  assert.equal(shouldFire(a, { oldCents: 49_000_00, newCents: 50_500_00 }, NOW), true);
  assert.equal(shouldFire(a, { oldCents: 51_000_00, newCents: 52_000_00 }, NOW), false);
});

// ── PRICE_DROP_PCT ────────────────────────────────────────────────────────
test("PRICE_DROP_PCT salta al alcanzar la caída desde la referencia", () => {
  const a = alert({ kind: "PRICE_DROP_PCT", threshold: 10, baselineCents: 100_000, oneShot: false });
  assert.equal(shouldFire(a, { oldCents: 95_000, newCents: 90_000 }, NOW), true); // -10 %
  assert.equal(shouldFire(a, { oldCents: 96_000, newCents: 95_000 }, NOW), false); // -5 %
});

test("PRICE_DROP_PCT sin referencia válida no salta", () => {
  const a = alert({ kind: "PRICE_DROP_PCT", threshold: 10, baselineCents: null, oneShot: false });
  assert.equal(shouldFire(a, { oldCents: 100, newCents: 1 }, NOW), false);
  const zero = alert({ kind: "PRICE_DROP_PCT", threshold: 10, baselineCents: 0, oneShot: false });
  assert.equal(shouldFire(zero, { oldCents: 100, newCents: 1 }, NOW), false);
});

// ── STATUS_CHANGE ─────────────────────────────────────────────────────────
test("STATUS_CHANGE salta con VENDIDO o RETIRADO, no con cambios de precio", () => {
  const a = alert({ kind: "STATUS_CHANGE", threshold: null, oneShot: false });
  assert.equal(shouldFire(a, { oldCents: 1, newCents: 1, status: "SOLD" }, NOW), true);
  assert.equal(shouldFire(a, { oldCents: 1, newCents: 1, status: "REMOVED" }, NOW), true);
  assert.equal(shouldFire(a, { oldCents: 1, newCents: 1, status: "PRICE_DROP" }, NOW), false);
  assert.equal(shouldFire(a, { oldCents: 1, newCents: 1, status: null }, NOW), false);
});

// ── Enfriamiento ──────────────────────────────────────────────────────────
test("una alerta repetible respeta el enfriamiento", () => {
  const recien = new Date(NOW.getTime() - 60_000);
  const hace7h = new Date(NOW.getTime() - ALERT_COOLDOWN_MS - 1000);
  const base = { kind: "PRICE_DROP_PCT" as const, threshold: 10, baselineCents: 100_000, oneShot: false };
  assert.equal(shouldFire(alert({ ...base, lastFiredAt: recien }), { oldCents: 95_000, newCents: 90_000 }, NOW), false);
  assert.equal(shouldFire(alert({ ...base, lastFiredAt: hace7h }), { oldCents: 95_000, newCents: 90_000 }, NOW), true);
});

test("el enfriamiento no aplica a las de un solo disparo (se desactivan al saltar)", () => {
  const recien = new Date(NOW.getTime() - 60_000);
  assert.equal(
    shouldFire(alert({ oneShot: true, lastFiredAt: recien }), { oldCents: 50_100_00, newCents: 49_000_00 }, NOW),
    true
  );
});

// ── Valores ausentes ──────────────────────────────────────────────────────
test("sin precio nuevo no se dispara nada", () => {
  assert.equal(shouldFire(alert(), { oldCents: 60_000_00, newCents: null }, NOW), false);
});

// ── Mensaje ───────────────────────────────────────────────────────────────
test("el mensaje incluye el enlace pulsable al registro", () => {
  const msg = alertMessage({
    kind: "PRICE_BELOW",
    recordType: "crypto",
    recordId: "abc123",
    title: "Bitcoin",
    field: "price",
    newCents: 49_000_00,
    threshold: 50_000_00,
    baselineCents: null,
  });
  assert.ok(msg.includes("[[crypto:abc123|Bitcoin]]"), msg);
  assert.ok(msg.includes("49.000"), msg);
});

test("el mensaje de alquiler se refiere a la renta", () => {
  const msg = alertMessage({
    kind: "PRICE_BELOW",
    recordType: "property",
    recordId: "p1",
    title: "Piso en Oviedo",
    field: "rent",
    newCents: 700_00,
    threshold: 750_00,
    baselineCents: null,
  });
  assert.ok(msg.startsWith("🔔 La renta de"), msg);
});
