import { prisma } from "@/lib/db";
import type { CryptoHolding, MarketInstrument, JobListing, BookRecord, Holiday } from "@prisma/client";
import type { NormalizedRecord } from "@/features/sources/types";
import type { Book } from "@nidokey/shared";
import {
  openLibraryWorkDescription,
  openLibraryWorkRatings,
  openLibraryRatingByIsbn,
} from "@/features/sources/providers/open-library";

/**
 * Persiste un NormalizedRecord en su tabla de tipo. Generaliza el split
 * create/update de importListing: dedupe por la unique del tipo, actualiza
 * `currentValue` y escribe un *Snapshot SOLO si el valor cambió.
 *
 * De momento solo CRIPTO; al añadir tipos se amplía el switch.
 */
export async function upsertRecord(
  ownerId: string,
  normalized: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  if (normalized.recordType === "crypto") return upsertCrypto(ownerId, normalized);
  if (normalized.recordType === "market") return upsertMarket(ownerId, normalized);
  if (normalized.recordType === "job") return upsertJob(ownerId, normalized);
  if (normalized.recordType === "book") return upsertBook(ownerId, normalized);
  if (normalized.recordType === "holiday") return upsertHoliday(ownerId, normalized);
  throw new Error(`upsertRecord: tipo no soportado todavía: ${normalized.recordType}`);
}

async function upsertCrypto(
  ownerId: string,
  n: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  const meta = (n.meta ?? {}) as Record<string, unknown>;
  const symbol = String(meta.symbol ?? "").toUpperCase();
  const quoteCurrency = String(meta.quoteCurrency ?? n.currency ?? "EUR").toUpperCase();
  const source = n.source;
  const value = n.currentValue ?? null;

  const existing = await prisma.cryptoHolding.findFirst({
    where: { ownerId, symbol, quoteCurrency, source },
  });

  if (!existing) {
    const created = await prisma.cryptoHolding.create({
      data: {
        ownerId,
        title: n.title,
        subtitle: n.subtitle ?? null,
        status: n.status ?? "WATCH",
        symbol,
        quoteCurrency,
        currentValue: value,
        currency: n.currency ?? quoteCurrency,
        imageUrl: n.imageUrl ?? null,
        source,
        externalId: n.externalId ?? null,
        lastCheckedAt: n.observedAt,
        meta: meta as object,
        snapshots:
          value != null
            ? { create: [{ value, source, observedAt: n.observedAt }] }
            : undefined,
      },
    });
    return { id: created.id, created: true, valueChanged: value != null };
  }

  const valueChanged = value != null && value !== existing.currentValue;
  await prisma.cryptoHolding.update({
    where: { id: existing.id },
    data: {
      // rellena solo lo que falta o el valor que sí cambia (no pisa edición)
      title: existing.title || n.title,
      imageUrl: existing.imageUrl ?? n.imageUrl ?? null,
      externalId: existing.externalId ?? n.externalId ?? null,
      currentValue: value ?? existing.currentValue,
      lastCheckedAt: n.observedAt,
      // refresca los datos de mercado (%24h, volumen, sparkline…)
      meta: { ...((existing.meta as Record<string, unknown>) ?? {}), ...meta } as object,
      ...(valueChanged
        ? { snapshots: { create: [{ value: value!, source, observedAt: n.observedAt }] } }
        : {}),
    },
  });
  return { id: existing.id, created: false, valueChanged };
}

/** Recarga la fila para devolverla mapeada a BaseRecord. */
export function getCryptoById(id: string): Promise<CryptoHolding | null> {
  return prisma.cryptoHolding.findUnique({ where: { id } });
}

async function upsertMarket(
  ownerId: string,
  n: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  const meta = (n.meta ?? {}) as Record<string, unknown>;
  const symbol = String(meta.symbol ?? "").toUpperCase();
  const source = n.source;
  const value = n.currentValue ?? null;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const quoteCurrency = String(meta.quoteCurrency ?? n.currency ?? "USD").toUpperCase();

  const existing = await prisma.marketInstrument.findFirst({
    where: { ownerId, symbol, source },
  });

  if (!existing) {
    const created = await prisma.marketInstrument.create({
      data: {
        ownerId,
        title: n.title,
        subtitle: n.subtitle ?? null,
        status: n.status ?? "WATCH",
        symbol,
        exchange: str("exchange"),
        quoteCurrency,
        currentValue: value,
        currency: n.currency ?? quoteCurrency,
        imageUrl: n.imageUrl ?? null,
        source,
        externalId: n.externalId ?? symbol,
        lastCheckedAt: n.observedAt,
        meta: meta as object,
        snapshots:
          value != null ? { create: [{ value, source, observedAt: n.observedAt }] } : undefined,
      },
    });
    return { id: created.id, created: true, valueChanged: value != null };
  }

  const valueChanged = value != null && value !== existing.currentValue;
  await prisma.marketInstrument.update({
    where: { id: existing.id },
    data: {
      title: existing.title || n.title,
      currentValue: value ?? existing.currentValue,
      lastCheckedAt: n.observedAt,
      // refresca %día/volumen/sparkline (cambian aunque el precio no)
      meta: { ...((existing.meta as Record<string, unknown>) ?? {}), ...meta } as object,
      ...(valueChanged
        ? { snapshots: { create: [{ value: value!, source, observedAt: n.observedAt }] } }
        : {}),
    },
  });
  return { id: existing.id, created: false, valueChanged };
}

export function getMarketById(id: string): Promise<MarketInstrument | null> {
  return prisma.marketInstrument.findUnique({ where: { id } });
}

async function upsertJob(
  ownerId: string,
  n: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  const meta = (n.meta ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const source = n.source;
  const externalId = n.externalId ?? null;
  const value = n.currentValue ?? null;
  const status = n.status ?? "OPEN";

  const existing = await prisma.jobListing.findFirst({
    where: { ownerId, externalId, source },
  });

  if (!existing) {
    const created = await prisma.jobListing.create({
      data: {
        ownerId,
        title: n.title,
        subtitle: n.subtitle ?? null,
        status,
        company: str("company"),
        location: str("location"),
        currentValue: value,
        currency: n.currency ?? "EUR",
        imageUrl: n.imageUrl ?? null,
        url: str("url"),
        platform: str("platform"),
        source,
        externalId,
        lastCheckedAt: n.observedAt,
        meta: meta as object,
        snapshots:
          value != null
            ? { create: [{ value, status, source: source ?? "apify", observedAt: n.observedAt }] }
            : undefined,
      },
    });
    return { id: created.id, created: true, valueChanged: value != null };
  }

  // Re-importar la misma oferta: refresca datos sin pisar lo que ya hubiera.
  await prisma.jobListing.update({
    where: { id: existing.id },
    data: {
      title: existing.title || n.title,
      imageUrl: existing.imageUrl ?? n.imageUrl ?? null,
      currentValue: value ?? existing.currentValue,
      lastCheckedAt: n.observedAt,
      meta: { ...((existing.meta as Record<string, unknown>) ?? {}), ...meta } as object,
    },
  });
  return { id: existing.id, created: false, valueChanged: false };
}

export function getJobById(id: string): Promise<JobListing | null> {
  return prisma.jobListing.findUnique({ where: { id } });
}

/** ¿Portada "perezosa" nuestra (URL OL por ISBN con `default=false`, que puede dar
 *  404) o ausente? Esas SÍ se reemplazan al reimportar si llega una portada real;
 *  las reales/manuales nunca se degradan. */
export function isLazyCover(url: string | null | undefined): boolean {
  return !url || /covers\.openlibrary\.org\/b\/isbn\/[^?]*\?default=false/.test(url);
}

async function upsertBook(
  ownerId: string,
  n: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  const meta = { ...((n.meta ?? {}) as Record<string, unknown>) };
  // El Book completo viaja en meta.book; lo enriquecemos al guardar (best-effort).
  let book = meta.book as Book | undefined;

  // 1) Sinopsis: Open Library no la trae en la búsqueda → la pedimos del work API
  //    (Google sí la trae en volumeInfo). Una llamada gratis; si falla, sin sinopsis.
  if (book?.source === "OPEN_LIBRARY" && !book.description && book.externalIds?.openLibraryWorkId) {
    try {
      const desc = await openLibraryWorkDescription(book.externalIds.openLibraryWorkId);
      if (desc) {
        book = { ...book, description: desc };
        meta.book = book;
      }
    } catch {
      /* sin sinopsis → seguimos */
    }
  }

  // 2) Valoración cruzada: muchos volúmenes de Google Books NO traen nota, pero
  //    Open Library agrega los votos de TODAS las ediciones del work y a menudo sí
  //    la tiene. Si falta el rating, lo rellenamos desde OL (por work id directo o
  //    resolviendo el ISBN). Best-effort; si falla, el libro se guarda sin nota.
  let enrichedRating: number | null = null;
  if (book && book.averageRating == null) {
    try {
      const r =
        (book.externalIds?.openLibraryWorkId
          ? await openLibraryWorkRatings(book.externalIds.openLibraryWorkId)
          : null) ?? (book.isbn13 ? await openLibraryRatingByIsbn(book.isbn13) : null);
      if (r) {
        book = { ...book, averageRating: r.average, ratingsCount: r.count };
        meta.book = book;
        enrichedRating = r.average;
      }
    } catch {
      /* sin rating → seguimos */
    }
  }

  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const source = n.source;
  const externalId = n.externalId ?? null;
  // currentValue = rating*100 (opcional). Si lo acabamos de enriquecer, derivarlo.
  const value = n.currentValue ?? (enrichedRating != null ? Math.round(enrichedRating * 100) : null);

  // Identidad: además de (externalId, source), el MISMO ISBN-13 ya guardado desde
  // OTRO proveedor es el mismo libro (OL cae → el reintento resuelve por Google y
  // sin esto se creaba un duplicado). El alta manual queda fuera del cruce: un
  // import de proveedor no debe "capturar" (ni pisar) un libro escrito a mano.
  const isbn13Key = str("isbn13");
  const existing = await prisma.bookRecord.findFirst({
    where:
      isbn13Key && source !== "manual"
        ? { ownerId, OR: [{ externalId, source }, { isbn13: isbn13Key, source: { not: "manual" } }] }
        : { ownerId, externalId, source },
  });

  if (!existing) {
    const created = await prisma.bookRecord.create({
      data: {
        ownerId,
        title: n.title,
        subtitle: n.subtitle ?? null,
        status: n.status ?? "WISHLIST",
        authors: str("authors"),
        isbn13: str("isbn13"),
        currentValue: value,
        currency: n.currency ?? null,
        imageUrl: n.imageUrl ?? null,
        source,
        externalId,
        lastCheckedAt: n.observedAt,
        meta: meta as object,
      },
    });
    return { id: created.id, created: true, valueChanged: value != null };
  }

  // Re-importar el mismo libro: refresca rating/portada/datos sin pisar lo editado.
  // NO degradar el rating: el merge superficial de meta reemplaza meta.book entero,
  // así que si el nuevo import viene sin nota (fuente más pobre) pero el guardado ya
  // la tenía, la conservamos (no la pisamos con null). currentValue ya preserva el
  // escalar con `value ?? existing.currentValue`.
  const existingMeta = (existing.meta as Record<string, unknown>) ?? {};
  const existingBook = existingMeta.book as Book | undefined;
  if (book && existingBook) {
    // Portada: una real entrante reemplaza a una ausente/"perezosa"; nunca al revés
    // (no degradamos una portada real/manual a la URL OL-por-ISBN que puede dar 404).
    const incomingCover = book.imageUrls.thumbnail ?? book.imageUrls.large ?? null;
    const existingCover = existingBook.imageUrls?.thumbnail ?? existingBook.imageUrls?.large ?? null;
    const keepExistingImgs = isLazyCover(incomingCover) && !isLazyCover(existingCover);
    meta.book = {
      ...book,
      imageUrls: keepExistingImgs ? existingBook.imageUrls : book.imageUrls,
      averageRating: book.averageRating ?? existingBook.averageRating ?? null,
      ratingsCount: book.ratingsCount ?? existingBook.ratingsCount ?? null,
      // La sinopsis guardada no se degrada a null por un reimport de fuente pobre.
      description: book.description ?? existingBook.description ?? null,
    };
  }
  // Misma regla para la columna que muestra la lista: refresca solo si la guardada
  // falta/es perezosa y la entrante es real.
  const incomingImage = n.imageUrl ?? null;
  const nextImage =
    isLazyCover(existing.imageUrl) && incomingImage && !isLazyCover(incomingImage)
      ? incomingImage
      : existing.imageUrl ?? incomingImage;
  const valueChanged = value != null && value !== existing.currentValue;
  await prisma.bookRecord.update({
    where: { id: existing.id },
    data: {
      title: existing.title || n.title,
      imageUrl: nextImage,
      currentValue: value ?? existing.currentValue,
      lastCheckedAt: n.observedAt,
      meta: { ...existingMeta, ...meta } as object,
    },
  });
  return { id: existing.id, created: false, valueChanged };
}

export function getBookById(id: string): Promise<BookRecord | null> {
  return prisma.bookRecord.findUnique({ where: { id } });
}

/** "2026-06-15" | ISO → Date, o null si no parsea. */
function toDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * VIAJES — persiste un viaje (record `holiday`). El detalle (transporte +
 * alojamiento + comisión) viaja en `meta` (HolidayTripMeta de @nidokey/shared);
 * `currentValue` = precio TOTAL en céntimos. Dedupe por (ownerId, externalId,
 * source). Snapshot del total solo si cambia (igual que el resto de verticales).
 */
async function upsertHoliday(
  ownerId: string,
  n: NormalizedRecord
): Promise<{ id: string; created: boolean; valueChanged: boolean }> {
  const meta = (n.meta ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  const source = n.source;
  const externalId = n.externalId ?? null;
  const value = n.currentValue ?? null;
  const status = n.status ?? "PLANNING";
  const destination = str("destination");
  const startDate = toDate(meta.startISO);
  const endDate = toDate(meta.endISO);

  const existing = await prisma.holiday.findFirst({
    where: { ownerId, externalId, source },
  });

  if (!existing) {
    const created = await prisma.holiday.create({
      data: {
        ownerId,
        title: n.title,
        subtitle: n.subtitle ?? null,
        status,
        destination,
        startDate,
        endDate,
        currentValue: value,
        currency: n.currency ?? "EUR",
        imageUrl: n.imageUrl ?? null,
        source,
        externalId,
        lastCheckedAt: n.observedAt,
        meta: meta as object,
        snapshots:
          value != null
            ? { create: [{ value, source: source ?? "travelpayouts", observedAt: n.observedAt }] }
            : undefined,
      },
    });
    return { id: created.id, created: true, valueChanged: value != null };
  }

  // Re-importar el mismo viaje: refresca el total/datos sin pisar lo editado.
  const valueChanged = value != null && value !== existing.currentValue;
  await prisma.holiday.update({
    where: { id: existing.id },
    data: {
      title: existing.title || n.title,
      imageUrl: existing.imageUrl ?? n.imageUrl ?? null,
      destination: existing.destination ?? destination,
      startDate: existing.startDate ?? startDate,
      endDate: existing.endDate ?? endDate,
      currentValue: value ?? existing.currentValue,
      lastCheckedAt: n.observedAt,
      meta: { ...((existing.meta as Record<string, unknown>) ?? {}), ...meta } as object,
      ...(valueChanged
        ? {
            snapshots: {
              create: [{ value: value!, source: source ?? "travelpayouts", observedAt: n.observedAt }],
            },
          }
        : {}),
    },
  });
  return { id: existing.id, created: false, valueChanged };
}

export function getHolidayById(id: string): Promise<Holiday | null> {
  return prisma.holiday.findUnique({ where: { id } });
}
