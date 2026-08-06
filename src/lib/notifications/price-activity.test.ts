import { test } from "node:test";
import assert from "node:assert/strict";
import { priceActivityText } from "./price-activity";

test("priceActivityText — bajada de precio (venta)", () => {
  const t = priceActivityText({ kind: "price", field: "price", oldCents: 260_000, newCents: 250_000, status: "PRICE_DROP" }, "Casa en Torre-roja");
  assert.ok(t.startsWith("«Casa en Torre-roja» el precio ha bajado"), t);
  assert.ok(t.includes("→"), t);
});

test("priceActivityText — subida de renta", () => {
  const t = priceActivityText({ kind: "price", field: "rent", oldCents: 80_000, newCents: 85_000, status: "PRICE_UP" }, null);
  assert.ok(t.startsWith("la renta ha subido"), t);
  assert.ok(t.includes("→"), t);
});

test("priceActivityText — primer precio conocido (sin previo)", () => {
  const t = priceActivityText({ kind: "price", field: "price", oldCents: null, newCents: 180_000, status: "ACTIVE" }, "Piso Centro");
  assert.ok(t.startsWith("«Piso Centro» el precio ahora es"), t);
  assert.ok(!t.includes("→"), t);
});

test("priceActivityText — retirada del portal", () => {
  assert.equal(
    priceActivityText({ kind: "removed", oldCents: 250_000 }, "Casa adosada"),
    "«Casa adosada» el anuncio ha desaparecido del portal (vendido o retirado)."
  );
});

test("priceActivityText — sin título", () => {
  assert.equal(
    priceActivityText({ kind: "removed", oldCents: null }, ""),
    "el anuncio ha desaparecido del portal (vendido o retirado)."
  );
});
