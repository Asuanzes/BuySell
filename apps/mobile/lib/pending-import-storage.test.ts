import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETED_IMPORT_TTL_MS,
  forgetPendingImport,
  getRememberedPendingImport,
  PENDING_IMPORT_TTL_MS,
  parseCompletedImport,
  parsePendingImport,
  rememberPendingImport,
  serializeCompletedImport,
  serializePendingImport,
} from "./pending-import-storage";

const NOW = 1_800_000_000_000;

test("un share recien guardado sobrevive al arranque en frio (BUG-15)", () => {
  const raw = serializePendingImport("book", "Sapiens https://amazon.es/dp/8499926223", NOW);
  const pending = parsePendingImport(raw, NOW + 5_000);

  assert.equal(pending?.kind, "book");
  assert.equal(pending?.value, "Sapiens https://amazon.es/dp/8499926223");
});

test("un share viejo NO resucita", () => {
  const raw = serializePendingImport("url", "https://www.idealista.com/inmueble/1", NOW);

  assert.ok(parsePendingImport(raw, NOW + PENDING_IMPORT_TTL_MS - 1));
  assert.equal(parsePendingImport(raw, NOW + PENDING_IMPORT_TTL_MS + 1), null);
});

test("un pendiente corrupto se descarta sin romper el arranque", () => {
  assert.equal(parsePendingImport(null, NOW), null);
  assert.equal(parsePendingImport("", NOW), null);
  assert.equal(parsePendingImport("{no es json", NOW), null);
  assert.equal(parsePendingImport('"una cadena"', NOW), null);
  assert.equal(parsePendingImport(JSON.stringify({ kind: "book" }), NOW), null);
  assert.equal(parsePendingImport(JSON.stringify({ kind: "otro", value: "x", at: NOW }), NOW), null);
  assert.equal(parsePendingImport(JSON.stringify({ kind: "url", value: "   ", at: NOW }), NOW), null);
});

test("un `at` en el futuro se trata como caducado, no como eterno", () => {
  // Si el reloj del dispositivo salta hacia atras, un pendiente con fecha futura
  // nunca cumpliria `now - at > TTL` y se quedaria pegado para siempre.
  const raw = serializePendingImport("url", "https://www.fotocasa.es/x", NOW + 60_000);
  assert.equal(parsePendingImport(raw, NOW), null);
});

test("remember hace visible el share inmediatamente antes de que setItem termine", () => {
  forgetPendingImport();

  rememberPendingImport("book", "Clean Code https://amazon.es/dp/0132350882", NOW);

  const pending = getRememberedPendingImport(NOW);
  assert.equal(pending?.kind, "book");
  assert.equal(pending?.value, "Clean Code https://amazon.es/dp/0132350882");
});

test("un pendiente recordado caducado no resucita y limpia el canal", () => {
  forgetPendingImport();
  rememberPendingImport("url", "https://www.idealista.com/inmueble/2", NOW);

  assert.equal(getRememberedPendingImport(NOW + PENDING_IMPORT_TTL_MS + 1), null);
  assert.equal(getRememberedPendingImport(NOW + 1), null);
});

test("forget borra el pendiente recordado al completar el import", () => {
  forgetPendingImport();
  rememberPendingImport("book", "Dune https://amazon.es/dp/0441172717", NOW);

  forgetPendingImport();

  assert.equal(getRememberedPendingImport(NOW), null);
});

test("recoger el pendiente no borra el canal recordado", () => {
  forgetPendingImport();
  rememberPendingImport("book", "Neuromancer https://amazon.es/dp/0441569595", NOW);

  const pending = getRememberedPendingImport(NOW + 1);
  assert.equal(pending?.kind, "book");
  assert.equal(pending?.value, "Neuromancer https://amazon.es/dp/0441569595");
});

test("un segundo remember sobrescribe al primero: gana el ultimo share", () => {
  forgetPendingImport();
  rememberPendingImport("url", "https://www.idealista.com/inmueble/1", NOW);
  rememberPendingImport("book", "Sapiens https://amazon.es/dp/8499926223", NOW + 1);

  const pending = getRememberedPendingImport(NOW + 2);
  assert.equal(pending?.kind, "book");
  assert.equal(pending?.value, "Sapiens https://amazon.es/dp/8499926223");
});

test("el ultimo share completado se recuerda para ignorar su re-entrega", () => {
  const raw = serializeCompletedImport("Echa un vistazo a esto en Amazon La asistenta", NOW);
  const completed = parseCompletedImport(raw, NOW + 60_000);

  assert.equal(completed?.value, "Echa un vistazo a esto en Amazon La asistenta");
  assert.equal(completed?.at, NOW);
});

test("un completado viejo deja de bloquear el mismo share", () => {
  const raw = serializeCompletedImport("Dune https://amazon.es/dp/0441172717", NOW);

  assert.ok(parseCompletedImport(raw, NOW + COMPLETED_IMPORT_TTL_MS - 1));
  assert.equal(parseCompletedImport(raw, NOW + COMPLETED_IMPORT_TTL_MS + 1), null);
});

test("un completado corrupto o con fecha futura no bloquea ningun share", () => {
  assert.equal(parseCompletedImport(null, NOW), null);
  assert.equal(parseCompletedImport("{no es json", NOW), null);
  assert.equal(parseCompletedImport(JSON.stringify({ value: "   ", at: NOW }), NOW), null);
  assert.equal(parseCompletedImport(JSON.stringify({ value: "x" }), NOW), null);
  // Reloj hacia atras: un `at` futuro se trata como caducado, no como eterno.
  assert.equal(parseCompletedImport(serializeCompletedImport("x", NOW + 60_000), NOW), null);
});
