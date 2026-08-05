import { test } from "node:test";
import assert from "node:assert/strict";
import { computePriceVariation, priceSeriesForField } from "./property-stats";

test("variación: bajada del 8 % entre dos puntos", () => {
  const r = computePriceVariation(
    [
      { price: 1_150_00, observedAt: "2026-07-20T10:00:00Z" },
      { price: 1_058_00, observedAt: "2026-08-01T10:00:00Z" },
    ],
    { now: Date.parse("2026-08-05T00:00:00Z") }
  );
  assert.ok(r);
  assert.equal(r!.direction, "drop");
  assert.equal(r!.pct, -8);
  assert.equal(r!.deltaCents, -92_00);
  assert.equal(r!.thisMonthCents, -92_00); // ambos dentro de la ventana de 31 días
  assert.equal(r!.changeCount, 1);
});

test("variación: subida y flat", () => {
  const up = computePriceVariation([
    { price: 100_00, observedAt: "2026-01-01T00:00:00Z" },
    { price: 120_00, observedAt: "2026-02-01T00:00:00Z" },
  ]);
  assert.equal(up!.direction, "up");
  assert.equal(up!.pct, 20);

  const flat = computePriceVariation([
    { price: 100_00, observedAt: "2026-01-01T00:00:00Z" },
    { price: 100_00, observedAt: "2026-02-01T00:00:00Z" },
  ]);
  assert.equal(flat!.direction, "flat");
  assert.equal(flat!.pct, 0);
});

test("variación: null con menos de 2 puntos o precio inválido", () => {
  assert.equal(computePriceVariation([{ price: 1_000_00, observedAt: "2026-01-01T00:00:00Z" }]), null);
  assert.equal(
    computePriceVariation([
      { price: 0, observedAt: "2026-01-01T00:00:00Z" },
      { price: 1_000_00, observedAt: "2026-02-01T00:00:00Z" },
    ]),
    null
  );
});

test("variación: ordena por fecha aunque lleguen desordenadas", () => {
  const r = computePriceVariation([
    { price: 1_100_00, observedAt: "2026-08-01T00:00:00Z" },
    { price: 1_200_00, observedAt: "2026-07-01T00:00:00Z" },
  ]);
  assert.equal(r!.deltaCents, -100_00); // 1.100 (último) - 1.200 (previo)
});

test("variación: thisMonth null si no hay punto reciente", () => {
  const now = Date.parse("2026-09-01T00:00:00Z");
  const r = computePriceVariation(
    [
      { price: 1_000_00, observedAt: "2026-01-01T00:00:00Z" },
      { price: 1_100_00, observedAt: "2026-08-01T00:00:00Z" },
    ],
    { now }
  );
  assert.ok(r);
  assert.equal(r!.thisMonthCents, null); // 1 enero fuera de la ventana de 31 días
});

test("series: filtra por campo de operación", () => {
  const history = [
    { price: 1, observedAt: "a", listing: { operationType: "SALE" } },
    { price: 2, observedAt: "b", listing: { operationType: "RENT" } },
    { price: 3, observedAt: "c", listing: { operationType: "RENT_TO_OWN" } },
    { price: 4, observedAt: "d", listing: null }, // legado → venta
  ] as Parameters<typeof priceSeriesForField>[0];

  const rent = priceSeriesForField(history, "rent");
  assert.deepEqual(rent.map((p) => p.price), [2, 3]);

  const sale = priceSeriesForField(history, "price");
  assert.deepEqual(sale.map((p) => p.price), [1, 4]);
});
