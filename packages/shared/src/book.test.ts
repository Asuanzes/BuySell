import { test } from "node:test";
import assert from "node:assert/strict";

import { createBook, bookToRecord } from "./book";

const base = createBook({ id: "b1", source: "OPEN_LIBRARY", title: "La asistenta" });

test("la nota real se proyecta como estrellas en la lista", () => {
  const rec = bookToRecord({ ...base, averageRating: 4.1, ratingsCount: 37 });
  assert.equal(rec.primaryValue, "★ 4.1");
});

test("averageRating 0 es 'sin votos' (artefacto OL), no una nota — sin ★ 0.0", () => {
  // Open Library devuelve average:0/count:0 para works sin votos; si eso llega
  // hasta el Book guardado, la lista no debe pintar "★ 0.0".
  const rec = bookToRecord({ ...base, averageRating: 0, ratingsCount: 0 });
  assert.equal(rec.primaryValue, null);
});

test("sin nota → sin estrellas", () => {
  const rec = bookToRecord({ ...base, averageRating: null, ratingsCount: null });
  assert.equal(rec.primaryValue, null);
});
