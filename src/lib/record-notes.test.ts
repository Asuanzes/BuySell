import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanRecordNoteBody,
  createRecordNote,
  deleteRecordNote,
  listRecordNotes,
  reassignRecordNotes,
  RecordNoteApiError,
  updateRecordNote,
  type RecordNoteView,
} from "./record-notes";

function makeDb() {
  const notes: RecordNoteView[] = [];
  let seq = 0;
  let tick = 0;
  const clone = (note: RecordNoteView) => ({ ...note });
  const matches = (note: RecordNoteView, where: any) => {
    if (where.id !== undefined && note.id !== where.id) return false;
    if (where.userId !== undefined && note.userId !== where.userId) return false;
    if (where.recordType !== undefined && note.recordType !== where.recordType) return false;
    if (where.recordId !== undefined) {
      if (typeof where.recordId === "object" && Array.isArray(where.recordId.in)) {
        if (!where.recordId.in.includes(note.recordId)) return false;
      } else if (note.recordId !== where.recordId) {
        return false;
      }
    }
    return true;
  };

  return {
    notes,
    recordNote: {
      findMany: async ({ where, take }: any) => {
        const rows = notes
          .filter((note) => matches(note, where))
          .sort((a, b) => {
            const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return byDate || b.id.localeCompare(a.id);
          })
          .map(clone);
        return typeof take === "number" ? rows.slice(0, take) : rows;
      },
      findFirst: async ({ where }: any) => notes.find((note) => matches(note, where)) ?? null,
      create: async ({ data }: any) => {
        const now = new Date(`2026-08-10T12:00:0${tick++}.000Z`);
        const note: RecordNoteView = {
          id: `n${++seq}`,
          userId: data.userId,
          recordType: data.recordType,
          recordId: data.recordId,
          body: data.body,
          createdAt: now,
          updatedAt: now,
        };
        notes.push(note);
        return clone(note);
      },
      update: async ({ where, data }: any) => {
        const note = notes.find((candidate) => candidate.id === where.id);
        if (!note) throw new Error("missing note");
        note.body = data.body;
        note.updatedAt = new Date("2026-08-10T13:00:00.000Z");
        return clone(note);
      },
      deleteMany: async ({ where }: any) => {
        const before = notes.length;
        for (let i = notes.length - 1; i >= 0; i--) {
          if (matches(notes[i], where)) notes.splice(i, 1);
        }
        return { count: before - notes.length };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const note of notes) {
          if (matches(note, where)) {
            note.recordId = data.recordId;
            count++;
          }
        }
        return { count };
      },
    },
  };
}

test("foreign records are hidden as 404", async () => {
  const db = makeDb();
  await assert.rejects(
    createRecordNote("u1", { recordType: "property", recordId: "p-ajeno", body: "nota" }, { prisma: db as any, ownsRecord: async () => false }),
    (error) => error instanceof RecordNoteApiError && error.status === 404
  );
});

test("el cuerpo se recorta de espacios; vacío y demasiado largo son 400", () => {
  assert.equal(cleanRecordNoteBody("  la dueña acepta 175k  "), "la dueña acepta 175k");
  assert.throws(() => cleanRecordNoteBody("   "), (error) => error instanceof RecordNoteApiError && error.status === 400);
  // Pasarse del tope RECHAZA en vez de recortar en silencio: quitarle al usuario
  // el final de lo que escribió, sin decírselo, en la pieza cuyo valor entero es
  // no perder su razonamiento, es peor que no guardar.
  assert.throws(
    () => cleanRecordNoteBody("a".repeat(4005)),
    (error) => error instanceof RecordNoteApiError && error.status === 400
  );
  assert.equal(cleanRecordNoteBody("a".repeat(4000)).length, 4000);
});

test("una nota HUÉRFANA (su registro ya no existe) se puede editar y borrar", async () => {
  const db = makeDb();
  // El registro existía al crear la nota…
  const nota = await createRecordNote(
    "u1",
    { recordType: "property", recordId: "p-borrado", body: "la dueña acepta 175k" },
    { prisma: db as any, ownsRecord: async () => true }
  );
  // …y después desaparece (borrado, o fusionado y perdido su id).
  const registroDesaparecido = { prisma: db as any, ownsRecord: async () => false };

  const editada = await updateRecordNote("u1", nota.id, "acepta 170k", registroDesaparecido);
  assert.equal(editada.body, "acepta 170k");
  const borrada = await deleteRecordNote("u1", nota.id, registroDesaparecido);
  assert.equal(borrada.deleted, 1);
  assert.deepEqual(db.notes, []);
});

test("la nota de OTRO usuario no se toca ni sabiendo su id", async () => {
  const db = makeDb();
  const ajena = await createRecordNote(
    "u2",
    { recordType: "property", recordId: "p1", body: "privada de u2" },
    { prisma: db as any, ownsRecord: async () => true }
  );
  const deps = { prisma: db as any, ownsRecord: async () => true };

  await assert.rejects(
    deleteRecordNote("u1", ajena.id, deps),
    (error) => error instanceof RecordNoteApiError && error.status === 404
  );
  await assert.rejects(
    updateRecordNote("u1", ajena.id, "pisada", deps),
    (error) => error instanceof RecordNoteApiError && error.status === 404
  );
  assert.equal(db.notes[0].body, "privada de u2");
});

test("multiple notes are listed by descending creation date", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true };
  await createRecordNote("u1", { recordType: "property", recordId: "p1", body: "primera" }, deps);
  await createRecordNote("u1", { recordType: "property", recordId: "p1", body: "segunda" }, deps);

  const notes = await listRecordNotes("u1", "property", "p1", deps);
  assert.deepEqual(notes.map((note) => note.body), ["segunda", "primera"]);
});

test("deleting one note does not delete sibling entries", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true };
  const first = await createRecordNote("u1", { recordType: "property", recordId: "p1", body: "primera" }, deps);
  const second = await createRecordNote("u1", { recordType: "property", recordId: "p1", body: "segunda" }, deps);

  const deleted = await deleteRecordNote("u1", first.id, deps);
  assert.equal(deleted.deleted, 1);
  assert.deepEqual(db.notes.map((note) => note.id), [second.id]);
});

test("reassignRecordNotes repoints dropped records to survivor", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true };
  await createRecordNote("u1", { recordType: "crypto", recordId: "drop-a", body: "a" }, deps);
  await createRecordNote("u1", { recordType: "crypto", recordId: "drop-b", body: "b" }, deps);
  await createRecordNote("u2", { recordType: "crypto", recordId: "drop-a", body: "otra cuenta" }, deps);

  const result = await reassignRecordNotes(db as any, { userId: "u1", recordType: "crypto", fromIds: ["drop-a", "drop-b"], toId: "keep" });

  assert.equal(result.count, 2);
  assert.deepEqual(
    db.notes.map((note) => ({ userId: note.userId, recordId: note.recordId })),
    [
      { userId: "u1", recordId: "keep" },
      { userId: "u1", recordId: "keep" },
      { userId: "u2", recordId: "drop-a" },
    ]
  );
});
