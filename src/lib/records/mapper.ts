import { formatPrice, formatMoney, formatDate, isRentOperation, type BaseRecord, type Book } from "@nidokey/shared";
import type { Property, Media, CryptoHolding, MarketInstrument, JobListing, BookRecord, Holiday } from "@prisma/client";

/**
 * Mapper server-side: Property (Prisma) -> BaseRecord (modelo unificado).
 *
 * Espeja el mapper móvil (apps/mobile/lib/records/mappers.ts) pero parte de la
 * fila Prisma (fechas como Date). De momento el tipo es siempre "property";
 * cuando se use el discriminador `recordType` de la tabla, se leerá aquí.
 */
export type PropertyWithCover = Property & { media?: (Pick<Media, "url"> & Partial<Pick<Media, "kind">>)[] };

export function propertyToBaseRecord(p: PropertyWithCover): BaseRecord {
  const subtitle = [p.city, p.neighborhood].filter(Boolean).join(" · ") || null;
  const footnote =
    [
      p.rooms != null ? `${p.rooms} hab` : null,
      p.bathrooms != null ? `${p.bathrooms} baño${p.bathrooms !== 1 ? "s" : ""}` : null,
      p.builtArea != null ? `${p.builtArea} m²` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  // Alquiler: el valor principal es la renta mensual con sufijo "/mes".
  const isRent = isRentOperation(p.operationType);
  const primaryValue = isRent
    ? p.monthlyRent != null
      ? `${formatPrice(p.monthlyRent)}/mes`
      : null
    : p.currentPrice != null
      ? formatPrice(p.currentPrice)
      : null;

  return {
    id: p.id,
    type: "property",
    title: p.title,
    subtitle,
    status: p.status,
    primaryValue,
    // Portada = primera FOTO. El detalle incluye TODO el media (planos
    // FLOORPLAN del Catastro incluidos) y el plano no es portada; las queries
    // de lista ya filtran PHOTO y entran por el fallback sin `kind`.
    imageUrl: (p.media?.find((m) => m.kind === "PHOTO") ?? p.media?.[0])?.url ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    meta: {
      propertyType: p.type,
      operationType: p.operationType,
      city: p.city,
      neighborhood: p.neighborhood,
      currentPrice: p.currentPrice,
      monthlyRent: p.monthlyRent,
      rooms: p.rooms,
      bathrooms: p.bathrooms,
      builtArea: p.builtArea,
      footnote,
    },
  };
}

/** CryptoHolding (Prisma) -> BaseRecord. */
export function cryptoToBaseRecord(c: CryptoHolding): BaseRecord {
  return {
    id: c.id,
    type: "crypto",
    title: c.title,
    subtitle: c.subtitle,
    status: c.status,
    primaryValue: c.currentValue != null ? formatMoney(c.currentValue, c.currency) : null,
    imageUrl: c.imageUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    meta: {
      symbol: c.symbol,
      quoteCurrency: c.quoteCurrency,
      quantity: c.quantity != null ? c.quantity.toString() : null,
      source: c.source,
      externalId: c.externalId,
      // Hora del último refresco real (no del último UPDATE de fila): la UI la
      // usa para mostrar "Actualizado hace X" y detectar datos congelados.
      lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
      ...((c.meta as Record<string, unknown> | null) ?? {}),
    },
  };
}

/** MarketInstrument (Prisma) -> BaseRecord. */
export function marketToBaseRecord(m: MarketInstrument): BaseRecord {
  return {
    id: m.id,
    type: "market",
    title: m.title,
    subtitle: m.subtitle,
    status: m.status,
    primaryValue: m.currentValue != null ? formatMoney(m.currentValue, m.currency) : null,
    imageUrl: m.imageUrl,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    meta: {
      symbol: m.symbol,
      exchange: m.exchange,
      quoteCurrency: m.quoteCurrency,
      quantity: m.quantity != null ? m.quantity.toString() : null,
      source: m.source,
      externalId: m.externalId,
      // Hora del último refresco real (ver cryptoToBaseRecord).
      lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
      ...((m.meta as Record<string, unknown> | null) ?? {}),
    },
  };
}

/** JobListing (Prisma) -> BaseRecord. Salario en primaryValue; resto en meta
 *  (company, location, url, platform, footnote…) que ya viene del normalizado. */
export function jobToBaseRecord(j: JobListing): BaseRecord {
  return {
    id: j.id,
    type: "job",
    title: j.title,
    subtitle: j.subtitle,
    status: j.status,
    primaryValue: j.currentValue != null ? formatMoney(j.currentValue, j.currency ?? "EUR") : null,
    imageUrl: j.imageUrl,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    meta: {
      company: j.company,
      location: j.location,
      url: j.url,
      platform: j.platform,
      source: j.source,
      externalId: j.externalId,
      lastCheckedAt: j.lastCheckedAt?.toISOString() ?? null,
      ...((j.meta as Record<string, unknown> | null) ?? {}),
    },
  };
}

/** BookRecord (Prisma) -> BaseRecord. El modelo `Book` completo viaja en
 *  `meta.book` (lo lee el detalle); `primaryValue` = ★ valoración media. */
export function bookToBaseRecord(b: BookRecord): BaseRecord {
  const stored = (b.meta as { book?: Book } | null) ?? {};
  const rating =
    b.currentValue != null ? b.currentValue / 100 : stored.book?.averageRating ?? null;
  return {
    id: b.id,
    type: "book",
    title: b.title,
    subtitle: b.subtitle,
    status: b.status,
    primaryValue: rating != null ? `★ ${rating.toFixed(1)}` : null,
    imageUrl: b.imageUrl,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    meta: {
      ...((b.meta as Record<string, unknown> | null) ?? {}),
      source: b.source,
      externalId: b.externalId,
      lastCheckedAt: b.lastCheckedAt?.toISOString() ?? null,
    },
  };
}

/** Holiday (Prisma) -> BaseRecord. `primaryValue` = total del viaje; el detalle
 *  (transporte + alojamiento + comisión) viaja en `meta` (HolidayTripMeta). */
export function holidayToBaseRecord(h: Holiday): BaseRecord {
  const dateRange =
    h.startDate || h.endDate
      ? [h.startDate, h.endDate]
          .filter(Boolean)
          .map((d) => formatDate(d as Date))
          .join(" – ")
      : null;
  const subtitle = h.subtitle ?? ([h.destination, dateRange].filter(Boolean).join(" · ") || null);
  return {
    id: h.id,
    type: "holiday",
    title: h.title,
    subtitle,
    status: h.status,
    primaryValue: h.currentValue != null ? formatMoney(h.currentValue, h.currency ?? "EUR") : null,
    imageUrl: h.imageUrl,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    meta: {
      destination: h.destination,
      startDate: h.startDate?.toISOString() ?? null,
      endDate: h.endDate?.toISOString() ?? null,
      source: h.source,
      externalId: h.externalId,
      lastCheckedAt: h.lastCheckedAt?.toISOString() ?? null,
      ...((h.meta as Record<string, unknown> | null) ?? {}),
    },
  };
}
