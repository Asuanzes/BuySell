import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZoneContext, median, zoneStats, type ZoneComparable } from "./property-zone";

const mk = (over: Partial<ZoneComparable> & { id: string }): ZoneComparable => ({
  title: "Test",
  type: "PISO",
  city: "Oviedo",
  neighborhood: "El Cristo",
  status: "FOR_SALE",
  price: 100_000_00,
  builtArea: 80,
  ...over,
});

test("median: impar e par", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 3); // (2+4)/2 → redondeo
});

test("zoneStats: min/mediana/máx y €/m²", () => {
  const items = [
    mk({ id: "a", price: 90_000_00, builtArea: 90 }),
    mk({ id: "b", price: 110_000_00, builtArea: 100 }),
    mk({ id: "c", price: 130_000_00, builtArea: 100 }),
  ];
  const s = zoneStats(items);
  assert.ok(s);
  assert.equal(s!.min, 90_000_00);
  assert.equal(s!.median, 110_000_00);
  assert.equal(s!.max, 130_000_00);
  assert.equal(s!.perSqm!.min, 1000); // 90.000€ / 90 m²
  assert.equal(s!.perSqm!.median, 1100);
});

test("zoneStats: null con menos de 2 precios", () => {
  assert.equal(zoneStats([mk({ id: "a", price: 90_000_00 })]), null);
  assert.equal(zoneStats([mk({ id: "a", price: null }), mk({ id: "b", price: null })]), null);
});

test("strat: elige ciudad+barrio+tipo cuando hay muestra suficiente", () => {
  const current = mk({ id: "me", neighborhood: "El Cristo", type: "PISO" });
  const others = [
    mk({ id: "a", neighborhood: "El Cristo", type: "PISO" }),
    mk({ id: "b", neighborhood: "El Cristo", type: "PISO" }),
    // Misma ciudad+tipo pero otro barrio → NO debe entrar en el nivel fino.
    mk({ id: "c", neighborhood: "Ventanielles", type: "PISO" }),
  ];
  const r = buildZoneContext({ current, others });
  assert.equal(r.level, "city_neighborhood_type");
  assert.equal(r.alternatives.length, 2);
  assert.equal(r.coldStart, false);
  assert.equal(r.count, 3);
  assert.ok(r.stats);
});

test("strat: cae a ciudad+tipo si el barrio no tiene muestra", () => {
  const current = mk({ id: "me", neighborhood: "El Cristo", type: "PISO" });
  const others = [
    mk({ id: "a", neighborhood: "Ventanielles", type: "PISO" }),
    mk({ id: "b", neighborhood: "Ventanielles", type: "PISO" }),
  ];
  const r = buildZoneContext({ current, others });
  assert.equal(r.level, "city_type");
  assert.equal(r.alternatives.length, 2);
  assert.equal(r.coldStart, false);
});

test("strat: cae a ciudad si el tipo no tiene muestra", () => {
  const current = mk({ id: "me", type: "PISO", neighborhood: "El Cristo" });
  const others = [
    mk({ id: "a", type: "CHALET" }),
    mk({ id: "b", type: "CHALET" }),
  ];
  const r = buildZoneContext({ current, others });
  assert.equal(r.level, "city");
  assert.equal(r.alternatives.length, 2);
  assert.equal(r.coldStart, false);
});

test("coldStart: muestra por debajo del umbral marca nota y stats null", () => {
  const current = mk({ id: "me" });
  const r = buildZoneContext({ current, others: [mk({ id: "a" })] });
  assert.equal(r.coldStart, true);
  assert.equal(r.count, 2);
  assert.equal(r.stats, null);
});

test("coldStart: umbral personalizable", () => {
  const current = mk({ id: "me" });
  const others = [mk({ id: "a" }), mk({ id: "b" })];
  assert.equal(buildZoneContext({ current, others, minSample: 5 }).coldStart, true);
  assert.equal(buildZoneContext({ current, others, minSample: 3 }).coldStart, false);
});

test("sin alternativas: level city, coldStart, sin stats", () => {
  const current = mk({ id: "me" });
  const r = buildZoneContext({ current, others: [] });
  assert.equal(r.level, "city");
  assert.equal(r.coldStart, true);
  assert.equal(r.count, 1);
  assert.equal(r.stats, null);
  assert.deepEqual(r.alternatives, []);
});
