import { prisma as defaultPrisma } from "@/lib/db";
import { isPrismaUniqueError } from "@/lib/decisions";

/**
 * C7 — subcategorías personalizadas de LIBROS (solo libros de momento).
 * Owner-scoping SIEMPRE en las escrituras: BookRecord.ownerId es nullable con
 * SetNull, así que la FK de la tabla puente no impide por sí sola tocar libros
 * ajenos (hallazgo Codex 7b5ad001). Nombre 1..40 tras trim; tope de 30 por
 * usuario para que el filtro siga siendo una fila de chips y no un catálogo.
 */

export const MAX_BOOK_SUBCATEGORIES = 30;

export class BookSubcategoryApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type BookSubcategoryView = { id: string; name: string; bookIds: string[] };

type SubcatDb = Pick<typeof defaultPrisma, "bookSubcategory" | "bookSubcategoryAssignment" | "bookRecord" | "$transaction">;

type Deps = { prisma?: SubcatDb };

function db(deps?: Deps): SubcatDb {
  return deps?.prisma ?? defaultPrisma;
}

export function normalizeSubcategoryName(value: unknown): string {
  if (typeof value !== "string") throw new BookSubcategoryApiError(400, "name es obligatorio");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) {
    throw new BookSubcategoryApiError(400, "el nombre debe tener entre 1 y 40 caracteres");
  }
  return name;
}

/** Mis subcategorías con los libros asignados (el filtro móvil filtra por bookIds). */
export async function listBookSubcategories(userId: string, deps?: Deps): Promise<BookSubcategoryView[]> {
  const rows = await db(deps).bookSubcategory.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { assignments: { select: { bookId: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, bookIds: row.assignments.map((a) => a.bookId) }));
}

export async function createBookSubcategory(userId: string, name: unknown, deps?: Deps): Promise<BookSubcategoryView> {
  const clean = normalizeSubcategoryName(name);
  const client = db(deps);
  const count = await client.bookSubcategory.count({ where: { userId } });
  if (count >= MAX_BOOK_SUBCATEGORIES) {
    throw new BookSubcategoryApiError(400, `Máximo ${MAX_BOOK_SUBCATEGORIES} subcategorías; borra alguna antes de crear otra.`);
  }
  try {
    const row = await client.bookSubcategory.create({ data: { userId, name: clean } });
    return { id: row.id, name: row.name, bookIds: [] };
  } catch (error) {
    if (isPrismaUniqueError(error)) throw new BookSubcategoryApiError(409, "Ya tienes una subcategoría con ese nombre.");
    throw error;
  }
}

export async function renameBookSubcategory(userId: string, id: string, name: unknown, deps?: Deps): Promise<void> {
  const clean = normalizeSubcategoryName(name);
  try {
    const res = await db(deps).bookSubcategory.updateMany({ where: { id, userId }, data: { name: clean } });
    if (res.count === 0) throw new BookSubcategoryApiError(404, "Not found");
  } catch (error) {
    if (isPrismaUniqueError(error)) throw new BookSubcategoryApiError(409, "Ya tienes una subcategoría con ese nombre.");
    throw error;
  }
}

/** Borra la subcategoría; sus asignaciones caen por cascada (los libros quedan). */
export async function deleteBookSubcategory(userId: string, id: string, deps?: Deps): Promise<void> {
  const res = await db(deps).bookSubcategory.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new BookSubcategoryApiError(404, "Not found");
}

/**
 * Reemplaza el conjunto de subcategorías de UN libro propio (la UI edita con
 * checkboxes y manda el set final). Valida libro Y subcategorías contra el
 * usuario; el createMany con skipDuplicates hace la operación idempotente.
 */
export async function setBookSubcategoriesForBook(
  userId: string,
  bookId: string,
  subcategoryIds: unknown,
  deps?: Deps
): Promise<{ subcategoryIds: string[] }> {
  if (!Array.isArray(subcategoryIds) || subcategoryIds.some((v) => typeof v !== "string" || !v.trim())) {
    throw new BookSubcategoryApiError(400, "subcategoryIds debe ser una lista de ids");
  }
  const ids = [...new Set(subcategoryIds.map((v) => String(v).trim()))];
  const client = db(deps);

  const book = await client.bookRecord.findFirst({ where: { id: bookId, ownerId: userId }, select: { id: true } });
  if (!book) throw new BookSubcategoryApiError(404, "Not found");

  if (ids.length > 0) {
    const owned = await client.bookSubcategory.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw new BookSubcategoryApiError(404, "Alguna subcategoría no existe o no es tuya.");
  }

  await client.$transaction([
    client.bookSubcategoryAssignment.deleteMany({ where: { userId, bookId, ...(ids.length ? { subcategoryId: { notIn: ids } } : {}) } }),
    client.bookSubcategoryAssignment.createMany({
      data: ids.map((subcategoryId) => ({ userId, bookId, subcategoryId })),
      skipDuplicates: true,
    }),
  ]);
  return { subcategoryIds: ids };
}
