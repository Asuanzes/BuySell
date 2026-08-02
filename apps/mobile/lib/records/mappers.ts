import { formatPrice, type BaseRecord } from "@nidokey/shared";
import i18n from "@/lib/i18n";

/**
 * Mappers: traducen las respuestas de los endpoints existentes
 * (/api/properties) al modelo unificado `BaseRecord`. Aislar el mapeo aquí
 * permite cambiar el backend a /api/records en el futuro tocando solo el
 * repositorio, sin tocar la UI.
 */

/** Forma mínima de Property que devuelve GET /api/properties (lista). */
export type RawPropertyListItem = {
  id: string;
  title: string;
  city: string;
  neighborhood?: string | null;
  type: string;
  status: string;
  operationType?: string | null;
  currentPrice: number | null;
  monthlyRent?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  builtArea?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  media?: { url: string }[];
  /** Listing más antiguo (portal de origen del inmueble). */
  listings?: { portal: string }[];
};

export function propertyToRecord(p: RawPropertyListItem): BaseRecord {
  const subtitle = [p.city, p.neighborhood].filter(Boolean).join(" · ") || null;
  // Mapper de DATOS (no-React): usa la instancia i18n directamente. El footnote
  // queda en el idioma del momento del fetch; el refetch (60s/focus) lo refresca
  // tras un cambio de idioma — suficiente para una nota de pie de tarjeta.
  const footnote =
    [
      p.rooms != null ? i18n.t("card.rooms_count", { count: p.rooms }) : null,
      p.bathrooms != null ? i18n.t("card.baths", { count: p.bathrooms }) : null,
      p.builtArea != null ? `${p.builtArea} m²` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  // Alquiler: el valor principal es la renta mensual con sufijo "/mes".
  const isRent = p.operationType === "RENT";
  const primaryValue = isRent
    ? p.monthlyRent != null
      ? i18n.t("card.per_month", { value: formatPrice(p.monthlyRent) })
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
    imageUrl: p.media?.[0]?.url ?? null,
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
    meta: {
      propertyType: p.type,
      operationType: p.operationType ?? "SALE",
      city: p.city,
      neighborhood: p.neighborhood ?? null,
      currentPrice: p.currentPrice,
      monthlyRent: p.monthlyRent ?? null,
      rooms: p.rooms ?? null,
      bathrooms: p.bathrooms ?? null,
      builtArea: p.builtArea ?? null,
      footnote,
      portal: p.listings?.[0]?.portal ?? null,
    },
  };
}

/**
 * Forma de resultado que devuelve GET /api/rentals/search (buscador con
 * filtros). A diferencia de /api/properties, el backend ya ha elegido la
 * columna de precio correcta según la operación buscada y la envía como
 * `price` (céntimos), así que aquí no se decide nada de negocio.
 */
export type RawRentalSearchItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  operationType: string;
  price: number | null;
  city: string;
  province: string;
  neighborhood?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  builtArea?: number | null;
  imageUrl?: string | null;
  portal?: string | null;
  listingUrl?: string | null;
  lastSeenAt?: string | null;
  approximateLocation?: boolean;
};

export function rentalSearchItemToRecord(r: RawRentalSearchItem): BaseRecord {
  const isRent = r.operationType !== "SALE";
  const footnote =
    [
      r.rooms != null ? i18n.t("card.rooms_count", { count: r.rooms }) : null,
      r.bathrooms != null ? i18n.t("card.baths", { count: r.bathrooms }) : null,
      r.builtArea != null ? `${r.builtArea} m²` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  return {
    id: r.id,
    type: "property",
    title: r.title,
    subtitle: [r.city, r.neighborhood].filter(Boolean).join(" · ") || null,
    status: r.status,
    primaryValue:
      r.price == null
        ? null
        : isRent
          ? i18n.t("card.per_month", { value: formatPrice(r.price) })
          : formatPrice(r.price),
    imageUrl: r.imageUrl ?? null,
    meta: {
      propertyType: r.type,
      operationType: r.operationType,
      city: r.city,
      province: r.province,
      neighborhood: r.neighborhood ?? null,
      rooms: r.rooms ?? null,
      bathrooms: r.bathrooms ?? null,
      builtArea: r.builtArea ?? null,
      footnote,
      portal: r.portal ?? null,
      listingUrl: r.listingUrl ?? null,
      lastSeenAt: r.lastSeenAt ?? null,
      approximateLocation: r.approximateLocation ?? false,
    },
  };
}

/** Forma de resultado que devuelve GET /api/search (proyección reducida). */
export type RawSearchResult = {
  id: string;
  title: string;
  city: string;
  neighborhood?: string | null;
  currentPrice: number | null;
  type: string;
  media?: { url: string }[];
};

export function searchResultToRecord(r: RawSearchResult): BaseRecord {
  return {
    id: r.id,
    type: "property",
    title: r.title,
    subtitle: [r.city, r.neighborhood].filter(Boolean).join(" · ") || null,
    status: null,
    primaryValue: r.currentPrice != null ? formatPrice(r.currentPrice) : null,
    imageUrl: r.media?.[0]?.url ?? null,
    meta: { propertyType: r.type, city: r.city, neighborhood: r.neighborhood ?? null },
  };
}
