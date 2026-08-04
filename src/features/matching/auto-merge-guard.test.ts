/**
 * Tests del guard de auto-merge (operación-aware).
 * Ejecutar:  node --import tsx --test src/features/matching/auto-merge-guard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { autoMergeSafety, comparablePrice, type MergeGuardProperty } from "./auto-merge-guard";

const sale = (price: number | null, type = "PISO"): MergeGuardProperty => ({
  type,
  operationType: "SALE",
  currentPrice: price,
  monthlyRent: null,
});
const rent = (rentCents: number | null, type = "PISO"): MergeGuardProperty => ({
  type,
  operationType: "RENT",
  currentPrice: null,
  monthlyRent: rentCents,
});

test("misma operación, precios casi iguales → no bloquea", () => {
  const r = autoMergeSafety(sale(18_500_000), sale(18_600_000));
  assert.equal(r.blocked, false);
});

test("misma operación (venta), precios muy distintos → bloquea por precio", () => {
  const r = autoMergeSafety(sale(18_500_000), sale(30_000_000));
  assert.equal(r.priceTooDifferent, true);
  assert.equal(r.blocked, true);
});

test("tipo distinto → bloquea aunque el precio cuadre", () => {
  const r = autoMergeSafety(sale(18_500_000, "PISO"), sale(18_500_000, "LOCAL"));
  assert.equal(r.typeMismatch, true);
  assert.equal(r.blocked, true);
});

test("caso MIXTO: venta + alquiler del mismo inmueble → NO bloquea por precio", () => {
  // 185.000 € de venta vs 850 €/mes de alquiler: importes incomparables, pero
  // es el mismo piso (mismo catastro/fotos lo detectó). Debe permitir la fusión.
  const r = autoMergeSafety(sale(18_500_000), rent(85_000));
  assert.equal(r.priceTooDifferent, false);
  assert.equal(r.blocked, false);
});

test("dos alquileres con rentas muy distintas → bloquea por renta", () => {
  const r = autoMergeSafety(rent(85_000), rent(200_000));
  assert.equal(r.priceTooDifferent, true);
  assert.equal(r.blocked, true);
});

/**
 * `comparablePrice` dejó de ser sólo cosa del guard de fusión: el buscador
 * (`/api/rentals/search`) lo usa para decidir qué importe devuelve cada ficha.
 * Antes elegía la columna por la operación BUSCADA y, en una búsqueda mixta,
 * toda venta salía con precio null. Es la única definición del proyecto de "el
 * precio de esta ficha", así que se prueba directamente.
 */
test("comparablePrice: sólo el alquiler puro vive en monthlyRent", () => {
  const base = { type: "PISO", currentPrice: 22_000_000, monthlyRent: 90_000 };

  assert.equal(comparablePrice({ ...base, operationType: "SALE" }), 22_000_000);
  assert.equal(comparablePrice({ ...base, operationType: "RENT" }), 90_000);
  // El alquiler con opción a compra guarda su importe como precio de venta:
  // misma convención que import-listing, el recheck y el buscador.
  assert.equal(comparablePrice({ ...base, operationType: "RENT_TO_OWN" }), 22_000_000);
});

test("comparablePrice: sin importe en su columna devuelve null, no el de la otra", () => {
  assert.equal(
    comparablePrice({ type: "PISO", operationType: "RENT", currentPrice: 22_000_000, monthlyRent: null }),
    null
  );
  assert.equal(
    comparablePrice({ type: "PISO", operationType: "SALE", currentPrice: null, monthlyRent: 90_000 }),
    null
  );
});
