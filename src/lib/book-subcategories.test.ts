import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import {
  BookSubcategoryApiError,
  createBookSubcategory,
  deleteBookSubcategory,
  MAX_BOOK_SUBCATEGORIES,
  normalizeSubcategoryName,
  setBookSubcategoriesForBook,
} from "./book-subcategories";

/*
 * C7 subcategorías de libros. Lo peligroso: owner-scoping (BookRecord.ownerId
 * es nullable/SetNull, la FK no protege sola — Codex 7b5ad001), el tope por
 * usuario y el reemplazo idempotente del set (skipDuplicates).
 */

function uniqueError() {
  return new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
}

type Assignment = { userId: string; bookId: string; subcategoryId: string };

function makeDb(opts: { subcatCount?: number; ownedSubcats?: string[]; books?: Array<{ id: string; ownerId: string }> } = {}) {
  const assignments: Assignment[] = [];
  const calls: string[] = [];
  const db = {
    assignments,
    calls,
    bookSubcategory: {
      count: async ({ where }: any) => {
        if (where.id?.in) return opts.ownedSubcats ? where.id.in.filter((id: string) => opts.ownedSubcats!.includes(id)).length : 0;
        return opts.subcatCount ?? 0;
      },
      create: async ({ data }: any) => {
        calls.push("create");
        if (data.name === "duplicada") throw uniqueError();
        return { id: "s1", name: data.name };
      },
      updateMany: async () => ({ count: 1 }),
      deleteMany: async ({ where }: any) => ({ count: where.id === "mine" ? 1 : 0 }),
      findMany: async () => [],
    },
    bookSubcategoryAssignment: {
      deleteMany: async ({ where }: any) => {
        calls.push(`deleteMany:${JSON.stringify(where.subcategoryId?.notIn ?? null)}`);
        return { count: 0 };
      },
      createMany: async ({ data, skipDuplicates }: any) => {
        calls.push(`createMany:${data.length}:skip=${skipDuplicates}`);
        assignments.push(...data);
        return { count: data.length };
      },
    },
    bookRecord: {
      findFirst: async ({ where }: any) =>
        (opts.books ?? []).find((b) => b.id === where.id && b.ownerId === where.ownerId) ? { id: where.id } : null,
    },
    $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  };
  return db;
}

test("normalizeSubcategoryName: trim y espacios colapsados; vacío y >40 rechazados; 40 exactos pasan", () => {
  assert.equal(normalizeSubcategoryName("  novela   negra  "), "novela negra");
  assert.equal(normalizeSubcategoryName("a".repeat(40)), "a".repeat(40));
  for (const bad of ["", "   ", "a".repeat(41), 42, null]) {
    assert.throws(() => normalizeSubcategoryName(bad), BookSubcategoryApiError);
  }
});

test("createBookSubcategory: tope por usuario → 400; nombre duplicado → 409", async () => {
  const full = makeDb({ subcatCount: MAX_BOOK_SUBCATEGORIES });
  await assert.rejects(() => createBookSubcategory("u1", "otra", { prisma: full as any }), (e: unknown) => {
    assert.ok(e instanceof BookSubcategoryApiError);
    assert.equal(e.status, 400);
    return true;
  });

  const db = makeDb({ subcatCount: 3 });
  await assert.rejects(() => createBookSubcategory("u1", "duplicada", { prisma: db as any }), (e: unknown) => {
    assert.ok(e instanceof BookSubcategoryApiError);
    assert.equal(e.status, 409);
    return true;
  });
});

test("setBookSubcategoriesForBook: libro ajeno → 404; subcategoría ajena → 404", async () => {
  const db = makeDb({ books: [{ id: "b1", ownerId: "u1" }], ownedSubcats: ["s1"] });

  await assert.rejects(() => setBookSubcategoriesForBook("u2", "b1", ["s1"], { prisma: db as any }), (e: unknown) => {
    assert.ok(e instanceof BookSubcategoryApiError);
    assert.equal(e.status, 404);
    return true;
  });

  await assert.rejects(() => setBookSubcategoriesForBook("u1", "b1", ["s1", "ajena"], { prisma: db as any }), (e: unknown) => {
    assert.ok(e instanceof BookSubcategoryApiError);
    assert.equal(e.status, 404);
    return true;
  });
});

test("setBookSubcategoriesForBook: reemplaza el set con deleteMany(notIn)+createMany(skipDuplicates) y deduplica ids", async () => {
  const db = makeDb({ books: [{ id: "b1", ownerId: "u1" }], ownedSubcats: ["s1", "s2"] });
  const res = await setBookSubcategoriesForBook("u1", "b1", ["s1", "s2", "s1"], { prisma: db as any });
  assert.deepEqual(res.subcategoryIds, ["s1", "s2"]);
  assert.deepEqual(db.assignments.map((a) => a.subcategoryId), ["s1", "s2"]);
  assert.ok(db.calls.some((c) => c.startsWith("createMany:2:skip=true")));
  assert.ok(db.calls.some((c) => c.startsWith('deleteMany:["s1","s2"]')));
});

test("setBookSubcategoriesForBook: set vacío borra todas las asignaciones del libro", async () => {
  const db = makeDb({ books: [{ id: "b1", ownerId: "u1" }] });
  const res = await setBookSubcategoriesForBook("u1", "b1", [], { prisma: db as any });
  assert.deepEqual(res.subcategoryIds, []);
  assert.ok(db.calls.some((c) => c === "deleteMany:null"), "sin ids no debe haber notIn: se borra todo el set del libro");
});

test("deleteBookSubcategory: ajena → 404; propia borra (asignaciones caen por cascada)", async () => {
  const db = makeDb({});
  await deleteBookSubcategory("u1", "mine", { prisma: db as any });
  await assert.rejects(() => deleteBookSubcategory("u1", "ajena", { prisma: db as any }), (e: unknown) => {
    assert.ok(e instanceof BookSubcategoryApiError);
    assert.equal(e.status, 404);
    return true;
  });
});
