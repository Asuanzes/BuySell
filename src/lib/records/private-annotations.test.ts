import { test } from "node:test";
import assert from "node:assert/strict";

import { withoutPrivateAnnotations } from "./private-annotations";

test("adoptar un libro compartido NO se lleva la nota privada del dueño", () => {
  const libroDelDueno = {
    title: "Sapiens",
    isbn: "9788499926223",
    meta: {
      book: { pages: 496 },
      userNotes: "Me lo recomendó Marta; el capítulo 4 es lo que buscaba",
      userNotesAt: "2026-08-10T10:00:00.000Z",
    },
  };

  const copia = withoutPrivateAnnotations(libroDelDueno);
  const meta = copia.meta as Record<string, unknown>;

  assert.equal(meta.userNotes, undefined, "la nota privada no puede viajar a otra cuenta");
  assert.equal(meta.userNotesAt, undefined);
  // Lo que SÍ es la ficha se conserva: compartir comparte el registro.
  assert.deepEqual(meta.book, { pages: 496 });
  assert.equal(copia.title, "Sapiens");
  assert.equal(copia.isbn, "9788499926223");
});

test("no muta la fila original (la nota del dueño sigue en su registro)", () => {
  const original = { meta: { userNotes: "mía" } };
  withoutPrivateAnnotations(original);
  assert.equal(original.meta.userNotes, "mía");
});

test("las columnas de anotación de inmueble tampoco se copian", () => {
  const piso = {
    title: "Piso en Uría",
    notes: "la dueña acepta 175k",
    notesUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
    currentPrice: 18_500_000,
  };

  const copia = withoutPrivateAnnotations(piso);

  assert.equal("notes" in copia, false);
  assert.equal("notesUpdatedAt" in copia, false);
  assert.equal(copia.currentPrice, 18_500_000);
});

test("aguanta registros sin meta y con meta que no es objeto", () => {
  assert.deepEqual(withoutPrivateAnnotations({ title: "x" }), { title: "x" });
  assert.deepEqual(withoutPrivateAnnotations({ meta: null }), { meta: null });
  // Un array no es un blob de meta: se deja tal cual en vez de destriparlo.
  assert.deepEqual(withoutPrivateAnnotations({ meta: [1, 2] }), { meta: [1, 2] });
});
