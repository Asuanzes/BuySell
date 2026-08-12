import { api } from "@/lib/api";

/**
 * C7 — subcategorías personalizadas de libros (solo libros de momento).
 * `bookIds` viene del servidor para que el filtro de la lista sea client-side
 * sin tocar la ruta genérica /api/records.
 */
export type BookSubcategory = { id: string; name: string; bookIds: string[] };

export async function fetchBookSubcategories(): Promise<BookSubcategory[]> {
  const { items } = await api<{ items: BookSubcategory[] }>("/api/book-subcategories");
  return items;
}

export async function createBookSubcategory(name: string): Promise<BookSubcategory> {
  const { item } = await api<{ item: BookSubcategory }>("/api/book-subcategories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return item;
}

export function deleteBookSubcategory(id: string): Promise<unknown> {
  return api(`/api/book-subcategories/${id}`, { method: "DELETE" });
}

/** Reemplaza el set de subcategorías de un libro propio (idempotente). */
export function setBookSubcategories(bookId: string, subcategoryIds: string[]): Promise<unknown> {
  return api(`/api/records/${bookId}/subcategories?type=book`, {
    method: "PUT",
    body: JSON.stringify({ subcategoryIds }),
  });
}
