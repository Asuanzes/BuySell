// Ejecutar: node --import tsx --test src/lib/billing/entitlements.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { premiumFromRow } from "./entitlements";
import { PREMIUM_GRACE_DAYS } from "./plans";

const NOW = new Date("2026-07-24T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

test("sin fila no hay premium", () => {
  assert.equal(premiumFromRow(null, NOW), false);
});

test("ACTIVE con periodo vigente es premium", () => {
  assert.equal(
    premiumFromRow({ status: "ACTIVE", currentPeriodEnd: days(10), cancelAtPeriodEnd: false }, NOW),
    true
  );
});

test("ACTIVE sin periodo (webhook inicial) es premium", () => {
  assert.equal(
    premiumFromRow({ status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false }, NOW),
    true
  );
});

test("ACTIVE con cancelAtPeriodEnd sigue premium hasta el fin de periodo", () => {
  assert.equal(
    premiumFromRow({ status: "ACTIVE", currentPeriodEnd: days(5), cancelAtPeriodEnd: true }, NOW),
    true
  );
});

test("ACTIVE caducado dentro de la gracia sigue premium", () => {
  assert.equal(
    premiumFromRow(
      { status: "ACTIVE", currentPeriodEnd: days(-(PREMIUM_GRACE_DAYS - 1)), cancelAtPeriodEnd: false },
      NOW
    ),
    true
  );
});

test("ACTIVE caducado más allá de la gracia pierde premium", () => {
  assert.equal(
    premiumFromRow(
      { status: "ACTIVE", currentPeriodEnd: days(-(PREMIUM_GRACE_DAYS + 1)), cancelAtPeriodEnd: false },
      NOW
    ),
    false
  );
});

test("PAST_DUE mantiene el acceso durante la gracia", () => {
  assert.equal(
    premiumFromRow({ status: "PAST_DUE", currentPeriodEnd: days(-1), cancelAtPeriodEnd: false }, NOW),
    true
  );
});

test("PENDING y CANCELLED nunca son premium", () => {
  assert.equal(
    premiumFromRow({ status: "PENDING", currentPeriodEnd: days(30), cancelAtPeriodEnd: false }, NOW),
    false
  );
  assert.equal(
    premiumFromRow({ status: "CANCELLED", currentPeriodEnd: days(30), cancelAtPeriodEnd: false }, NOW),
    false
  );
});
