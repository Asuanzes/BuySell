import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestPropertyIds,
  buildCompareRows,
  fetchExistingProperties,
  hasMixedOperations,
  parseCompareIds,
  pricePerSqmCents,
  type ComparableProperty,
} from "./compare";

function property(partial: Partial<ComparableProperty> & { id: string }): ComparableProperty {
  return {
    id: partial.id,
    operationType: partial.operationType ?? "SALE",
    currentPrice: partial.currentPrice ?? null,
    monthlyRent: partial.monthlyRent ?? null,
    builtArea: partial.builtArea ?? null,
    rooms: partial.rooms ?? null,
    bathrooms: partial.bathrooms ?? null,
    floor: partial.floor ?? null,
    city: partial.city ?? "Gijon",
    neighborhood: partial.neighborhood ?? null,
    status: partial.status ?? "FOR_SALE",
    listings: partial.listings ?? [],
  };
}

test("calcula euros por metro en centimos segun la operacion", () => {
  assert.equal(pricePerSqmCents(property({ id: "sale", currentPrice: 120_000_00, builtArea: 80 })), 150_000);
  assert.equal(pricePerSqmCents(property({ id: "rent", operationType: "RENT", monthlyRent: 800_00, builtArea: 40 })), 2_000);
});

test("no calcula eur/m2 con precio o superficie ausentes", () => {
  assert.equal(pricePerSqmCents(property({ id: "missing-price", builtArea: 80 })), null);
  assert.equal(pricePerSqmCents(property({ id: "missing-area", currentPrice: 120_000_00 })), null);
  assert.equal(pricePerSqmCents(property({ id: "zero-area", currentPrice: 120_000_00, builtArea: 0 })), null);
});

test("marca mejores valores por objetivo e ignora ausentes", () => {
  const rows = buildCompareRows([
    property({ id: "a", currentPrice: 130_000_00, builtArea: 90 }),
    property({ id: "b", currentPrice: 120_000_00, builtArea: 80 }),
    property({ id: "c", currentPrice: null, builtArea: 110 }),
  ]);

  const sale = rows.find((r) => r.metric === "salePrice")!;
  assert.deepEqual(sale.cells.filter((c) => c.best).map((c) => c.propertyId), ["b"]);

  const area = rows.find((r) => r.metric === "builtArea")!;
  assert.deepEqual(area.cells.filter((c) => c.best).map((c) => c.propertyId), ["c"]);
});

test("marca eur/m2 por separado para ventas y alquileres mezclados", () => {
  const rows = buildCompareRows([
    property({ id: "sale-expensive", currentPrice: 120_000_00, builtArea: 80 }),
    property({ id: "sale-cheap", currentPrice: 110_000_00, builtArea: 100 }),
    property({ id: "rent-cheap", operationType: "RENT", monthlyRent: 900_00, builtArea: 90 }),
  ]);

  const perSqm = rows.find((r) => r.metric === "pricePerSqm")!;
  assert.deepEqual(perSqm.cells.filter((c) => c.best).map((c) => c.propertyId), ["sale-cheap"]);
  assert.equal(perSqm.cells.find((c) => c.propertyId === "rent-cheap")?.operationKind, "rent");
});

test("parsea ids string o array, deduplica y limita a tres", () => {
  assert.deepEqual(parseCompareIds("a,b,a,, c, d"), ["a", "b", "c"]);
  assert.deepEqual(parseCompareIds(["a,b", "b", " c "]), ["a", "b", "c"]);
});

test("filtra ids inexistentes sin duplicar columnas validas", async () => {
  const properties = await fetchExistingProperties(parseCompareIds(["a,a", "missing", "b"]), async (id) => {
    if (id === "missing") throw new Error("not found");
    return property({ id });
  });

  assert.deepEqual(properties.map((p) => p.id), ["a", "b"]);
});

test("no resalta si solo hay un valor comparable", () => {
  const best = bestPropertyIds(
    [property({ id: "a", currentPrice: 100_000_00 }), property({ id: "b", currentPrice: null })],
    (p) => p.currentPrice,
    "min",
  );
  assert.equal(best.size, 0);
});

test("detecta mezcla de venta y alquiler", () => {
  assert.equal(hasMixedOperations([property({ id: "a" }), property({ id: "b", operationType: "RENT" })]), true);
  assert.equal(hasMixedOperations([property({ id: "a" }), property({ id: "b" })]), false);
});
