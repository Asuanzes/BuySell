import { prisma } from "@/lib/db";
import type { RecordType, BaseRecord, Book } from "@nidokey/shared";
import {
  bookToBaseRecord,
  cryptoToBaseRecord,
  marketToBaseRecord,
  jobToBaseRecord,
  propertyToBaseRecord,
} from "@/lib/records/mapper";
import { isLazyCover } from "@/features/sources/upsert";
import { mergeProperties } from "@/features/matching/merge";

/**
 * Fusión de duplicados de REGISTROS: conserva `keepId`, vuelca al superviviente
 * TODO lo que no degrade (estado más avanzado, portada real, notas, datos que el
 * keep no tenga) y borra los demás. Robusto a CUALQUIER `keepId` (el cliente elige
 * por portada, así que el backend rescata el resto). Owner-scoped + atómico
 * ($transaction). Snapshots de los drops se REASIGNAN al superviviente (no se pierde
 * histórico). Solo-sugerir: lo dispara el usuario desde la UI.
 */
export type MergeOutcome =
  | { ok: true; record: BaseRecord; deleted: number }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "UNSUPPORTED_TYPE" };

const MERGE_TYPES: RecordType[] = ["book", "crypto", "market", "job", "property"];

// ── helpers ────────────────────────────────────────────────────────────────────

/** Une las notas de usuario distintas de varias filas (separador visible). */
function concatNotes(metas: Array<Record<string, unknown> | null | undefined>): string | undefined {
  const notes = Array.from(
    new Set(
      metas
        .map((m) => (m as { userNotes?: unknown } | null | undefined)?.userNotes)
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim()),
    ),
  );
  return notes.length ? notes.join("\n\n———\n\n") : undefined;
}

/** Estado "más avanzado" según un ranking (mayor gana; null = 0). */
function pickStatus(statuses: Array<string | null>, rank: (s: string | null) => number): string | null {
  let best: string | null = null;
  for (const s of statuses) if (rank(s) > rank(best)) best = s;
  return best;
}

/** Rellena los campos NULL/vacíos del `book` base con los de los donantes (no
 *  degrada: nunca pisa un valor existente). Los arrays (authors/categories/tags)
 *  solo se toman del donante si el base los tiene VACÍOS — `??` no les aplica.
 *  Exportada para test (puro, sin Prisma). */
export function fillBook(base: Book | undefined, donors: Array<Book | undefined>): Book | undefined {
  if (!base) return donors.find((d): d is Book => !!d);
  let out: Book = { ...base };
  for (const d of donors) {
    if (!d) continue;
    out = {
      ...out,
      subtitle: out.subtitle ?? d.subtitle ?? null,
      authors: out.authors?.length ? out.authors : d.authors ?? [],
      description: out.description ?? d.description ?? null,
      averageRating: out.averageRating ?? d.averageRating ?? null,
      ratingsCount: out.ratingsCount ?? d.ratingsCount ?? null,
      isbn13: out.isbn13 ?? d.isbn13 ?? null,
      isbn10: out.isbn10 ?? d.isbn10 ?? null,
      language: out.language ?? d.language ?? null,
      regionHint: out.regionHint ?? d.regionHint ?? null,
      publisher: out.publisher ?? d.publisher ?? null,
      pageCount: out.pageCount ?? d.pageCount ?? null,
      publishedYear: out.publishedYear ?? d.publishedYear ?? null,
      publishedDate: out.publishedDate ?? d.publishedDate ?? null,
      detailUrl: out.detailUrl ?? d.detailUrl ?? null,
      categories: out.categories?.length ? out.categories : d.categories ?? [],
      tags: out.tags?.length ? out.tags : d.tags ?? [],
      externalIds: { ...(d.externalIds ?? {}), ...(out.externalIds ?? {}) },
    };
  }
  return out;
}

// ── merge ───────────────────────────────────────────────────────────────────────

export async function mergeRecords(
  ownerId: string,
  type: RecordType,
  keepId: string,
  dropIds: string[],
): Promise<MergeOutcome> {
  if (!MERGE_TYPES.includes(type)) return { ok: false, code: "UNSUPPORTED_TYPE" };
  const drops = Array.from(new Set(dropIds.filter((id) => typeof id === "string" && id)));
  if (!keepId || drops.length === 0 || drops.includes(keepId)) return { ok: false, code: "INVALID" };
  const ids = [keepId, ...drops];

  // Inmuebles: reusa el motor inmobiliario `mergeProperties` (mueve Listings,
  // PriceSnapshots y Media al superviviente, deduplica por phash, rellena
  // campos vacíos y borra el origen). Owner-scoped y atómico por llamada.
  if (type === "property") {
    const rows = await prisma.property.findMany({ where: { id: { in: ids }, ownerId } });
    if (rows.length !== ids.length) return { ok: false, code: "NOT_FOUND" };
    for (const dropId of drops) {
      try {
        await mergeProperties(dropId, keepId);
      } catch (e) {
        console.error("[dedup/merge] property:", (e as Error).message);
        return { ok: false, code: "INVALID" };
      }
    }
    const survivor = await prisma.property.findUnique({
      where: { id: keepId },
      include: {
        media: { orderBy: { order: "asc" }, take: 1, select: { url: true, kind: true } },
      },
    });
    if (!survivor) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, record: propertyToBaseRecord(survivor), deleted: drops.length };
  }

  if (type === "book") {
    const rows = await prisma.bookRecord.findMany({ where: { id: { in: ids }, ownerId } });
    if (rows.length !== ids.length) return { ok: false, code: "NOT_FOUND" };
    const keep = rows.find((r) => r.id === keepId)!;

    const status = pickStatus(
      rows.map((r) => r.status),
      (s) => (s === "READ" ? 3 : s === "READING" ? 2 : s === "WISHLIST" ? 1 : 0),
    );

    const meta = { ...((keep.meta as Record<string, unknown>) ?? {}) };
    let book = fillBook(
      meta.book as Book | undefined,
      rows.map((r) => (r.meta as { book?: Book } | null)?.book),
    );

    // Portada: si la del superviviente falta/es perezosa, tomar una real de un donante
    // (con sus imageUrls completas, para conservar la versión grande).
    let imageUrl = keep.imageUrl;
    if (isLazyCover(imageUrl)) {
      const donor = rows.find((r) => r.imageUrl && !isLazyCover(r.imageUrl));
      if (donor) {
        imageUrl = donor.imageUrl;
        const donorImgs = (donor.meta as { book?: Book } | null)?.book?.imageUrls;
        if (book) book = { ...book, imageUrls: donorImgs ?? { thumbnail: imageUrl, large: imageUrl } };
      }
    }
    if (book) {
      meta.book = book;
      // Denormalizados de meta: se refrescan desde el book fusionado (pueden
      // haber ganado autores/ISBN de un donante — p. ej. Fnac sin autor + Google
      // con autor). La lista agrupa por autor (B7): sin esto, el hueco persiste.
      if (book.authors?.length) meta.authors = book.authors.join(", ");
      if (book.isbn13) meta.isbn13 = book.isbn13;
    }
    const notes = concatNotes(rows.map((r) => r.meta as Record<string, unknown> | null));
    if (notes) meta.userNotes = notes;

    // Columnas denormalizadas de la fila: mismo criterio que el resto de tipos
    // (keep primero, donante si el keep no tenía; el book fusionado de respaldo).
    const authorsCol =
      keep.authors ??
      rows.map((r) => r.authors).find(Boolean) ??
      (book?.authors?.length ? book.authors.join(", ") : null);
    const subtitleCol =
      keep.subtitle ??
      rows.map((r) => r.subtitle).find(Boolean) ??
      (book ? [book.authors[0], book.publishedYear].filter(Boolean).join(" · ") || null : null);
    const isbn13Col = keep.isbn13 ?? rows.map((r) => r.isbn13).find(Boolean) ?? book?.isbn13 ?? null;
    const ratingCol =
      keep.currentValue ??
      rows.map((r) => r.currentValue).find((v) => v != null) ??
      (book?.averageRating != null ? Math.round(book.averageRating * 100) : null);

    const [, updated, del] = await prisma.$transaction([
      prisma.recordNote.updateMany({
        where: { userId: ownerId, recordType: "book", recordId: { in: drops } },
        data: { recordId: keep.id },
      }),
      prisma.bookRecord.update({
        where: { id: keep.id },
        data: {
          status,
          imageUrl,
          authors: authorsCol,
          subtitle: subtitleCol,
          isbn13: isbn13Col,
          currentValue: ratingCol,
          meta: meta as object,
        },
      }),
      prisma.bookRecord.deleteMany({ where: { id: { in: drops }, ownerId } }),
    ]);
    return { ok: true, record: bookToBaseRecord(updated), deleted: del.count };
  }

  if (type === "crypto") {
    const rows = await prisma.cryptoHolding.findMany({ where: { id: { in: ids }, ownerId } });
    if (rows.length !== ids.length) return { ok: false, code: "NOT_FOUND" };
    const keep = rows.find((r) => r.id === keepId)!;
    const meta = { ...((keep.meta as Record<string, unknown>) ?? {}) };
    const notes = concatNotes(rows.map((r) => r.meta as Record<string, unknown> | null));
    if (notes) meta.userNotes = notes;
    const data = {
      imageUrl: keep.imageUrl ?? rows.map((r) => r.imageUrl).find(Boolean) ?? null,
      quantity: keep.quantity ?? rows.map((r) => r.quantity).find((q) => q != null) ?? null,
      status: pickStatus(rows.map((r) => r.status), (s) => (s === "HOLDING" ? 2 : s === "WATCH" ? 1 : 0)),
      meta: meta as object,
    };
    const [, , updated, del] = await prisma.$transaction([
      prisma.recordNote.updateMany({
        where: { userId: ownerId, recordType: "crypto", recordId: { in: drops } },
        data: { recordId: keep.id },
      }),
      prisma.cryptoSnapshot.updateMany({ where: { holdingId: { in: drops } }, data: { holdingId: keep.id } }),
      prisma.cryptoHolding.update({ where: { id: keep.id }, data }),
      prisma.cryptoHolding.deleteMany({ where: { id: { in: drops }, ownerId } }),
    ]);
    return { ok: true, record: cryptoToBaseRecord(updated), deleted: del.count };
  }

  if (type === "market") {
    const rows = await prisma.marketInstrument.findMany({ where: { id: { in: ids }, ownerId } });
    if (rows.length !== ids.length) return { ok: false, code: "NOT_FOUND" };
    const keep = rows.find((r) => r.id === keepId)!;
    const meta = { ...((keep.meta as Record<string, unknown>) ?? {}) };
    const notes = concatNotes(rows.map((r) => r.meta as Record<string, unknown> | null));
    if (notes) meta.userNotes = notes;
    const data = {
      imageUrl: keep.imageUrl ?? rows.map((r) => r.imageUrl).find(Boolean) ?? null,
      quantity: keep.quantity ?? rows.map((r) => r.quantity).find((q) => q != null) ?? null,
      status: pickStatus(rows.map((r) => r.status), (s) => (s === "HOLDING" ? 2 : s === "WATCH" ? 1 : 0)),
      meta: meta as object,
    };
    const [, , updated, del] = await prisma.$transaction([
      prisma.recordNote.updateMany({
        where: { userId: ownerId, recordType: "market", recordId: { in: drops } },
        data: { recordId: keep.id },
      }),
      prisma.marketSnapshot.updateMany({ where: { instrumentId: { in: drops } }, data: { instrumentId: keep.id } }),
      prisma.marketInstrument.update({ where: { id: keep.id }, data }),
      prisma.marketInstrument.deleteMany({ where: { id: { in: drops }, ownerId } }),
    ]);
    return { ok: true, record: marketToBaseRecord(updated), deleted: del.count };
  }

  // job
  const rows = await prisma.jobListing.findMany({ where: { id: { in: ids }, ownerId } });
  if (rows.length !== ids.length) return { ok: false, code: "NOT_FOUND" };
  const keep = rows.find((r) => r.id === keepId)!;
  const meta = { ...((keep.meta as Record<string, unknown>) ?? {}) };
  const notes = concatNotes(rows.map((r) => r.meta as Record<string, unknown> | null));
  if (notes) meta.userNotes = notes;
  const data = {
    imageUrl: keep.imageUrl ?? rows.map((r) => r.imageUrl).find(Boolean) ?? null,
    url: keep.url ?? rows.map((r) => r.url).find(Boolean) ?? null,
    status: pickStatus(rows.map((r) => r.status), (s) => (s === "OPEN" ? 2 : s === "CLOSED" ? 1 : 0)),
    meta: meta as object,
  };
  const [, , updated, del] = await prisma.$transaction([
    prisma.recordNote.updateMany({
      where: { userId: ownerId, recordType: "job", recordId: { in: drops } },
      data: { recordId: keep.id },
    }),
    prisma.jobSnapshot.updateMany({ where: { listingId: { in: drops } }, data: { listingId: keep.id } }),
    prisma.jobListing.update({ where: { id: keep.id }, data }),
    prisma.jobListing.deleteMany({ where: { id: { in: drops }, ownerId } }),
  ]);
  return { ok: true, record: jobToBaseRecord(updated), deleted: del.count };
}
