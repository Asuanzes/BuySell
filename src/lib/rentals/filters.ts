import type { Prisma } from "@prisma/client";

import { canonicalProvince } from "@/lib/geo-es";

/**
 * Motor de filtros del buscador de inmuebles (Fase 1 de
 * `docs/BUSCADOR-ALQUILER.md`).
 *
 * Vive aparte de `src/lib/filters.ts` a propósito: aquel construye la consulta
 * de la LISTA del móvil (venta, `currentPrice`, sin orden ni paginación) y
 * cambiarlo arriesgaría una regresión en una pantalla en producción. Aquí sólo
 * hay ficheros nuevos.
 *
 * Reglas que no son obvias:
 *  - El rango de precio apunta a `monthlyRent` en alquiler y a `currentPrice`
 *    en venta. La misma clave de querystring, columna distinta: si no, filtrar
 *    alquiler por precio no devolvería NADA (en alquiler `currentPrice` es
 *    null) y parecería un corpus vacío en vez de un filtro mal cableado.
 *  - Entra en EUROS y sale en CÉNTIMOS (convención de CLAUDE.md §6).
 *  - Todo valor de enum y todo nombre de columna pasa por una lista blanca:
 *    una querystring nunca elige qué columna se consulta.
 *  - Por defecto se excluyen los estados terminales (alquilado, vendido,
 *    retirado). El filtro va por `status` y no por `operationType` porque las
 *    fichas antiguas conservan el `FOR_SALE` por defecto del esquema.
 */

export type RentalOperation = "RENT" | "SALE" | "ANY";
export type RentalSort = "recent" | "price_asc" | "price_desc" | "area_desc";

export type RentalFilters = {
  operation: RentalOperation;
  q?: string;
  province?: string;
  city?: string;
  neighborhood?: string;
  types: string[];
  /** Céntimos. */
  minPrice?: number;
  /** Céntimos. */
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
  minBaths?: number;
  /** m² construidos. */
  minArea?: number;
  maxArea?: number;
  furnished?: string;
  contractType?: string;
  petsAllowed?: boolean;
  utilitiesIncluded?: boolean;
  /** Claves de `FEATURE_COLUMNS` que el usuario exige. */
  features: string[];
  includeUnavailable: boolean;
  sort: RentalSort;
  limit: number;
  cursor?: string;
};

/** Extras → columna booleana. Lista blanca: la querystring no elige columna. */
const FEATURE_COLUMNS = {
  elevator: "hasElevator",
  garage: "hasGarage",
  storage: "hasStorage",
  terrace: "hasTerrace",
  fireplace: "hasFireplace",
  garden: "hasGarden",
  pool: "hasPool",
} as const satisfies Record<string, keyof Prisma.PropertyWhereInput>;

const PROPERTY_TYPES = new Set([
  "HOUSE", "PISO", "ATICO", "CHALET", "DUPLEX",
  "ESTUDIO", "LOFT", "LOCAL", "TERRENO", "OTRO",
]);
const FURNISHED_STATES = new Set(["UNFURNISHED", "SEMI", "FURNISHED"]);
const CONTRACT_TYPES = new Set(["RESIDENTIAL", "SEASONAL", "ROOM", "COMMERCIAL"]);
const SORTS = new Set<RentalSort>(["recent", "price_asc", "price_desc", "area_desc"]);

/** Estados en los que el inmueble ya no está disponible. */
const TERMINAL_STATUSES = ["RENTED", "SOLD", "WITHDRAWN"];

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** Tope de cordura del rango de precio, en euros (evita overflow de Int). */
const MAX_EUROS = 20_000_000;
const MAX_AREA = 100_000;

// ─────────────────────────────────────────────────────────────────────────
// Parseo
// ─────────────────────────────────────────────────────────────────────────

function clampInt(raw: string | null, min: number, max: number): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function boolParam(raw: string | null): boolean | undefined {
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

function pickFromSet(raw: string | null, allowed: Set<string>): string | undefined {
  const v = raw?.trim().toUpperCase();
  return v && allowed.has(v) ? v : undefined;
}

function listFromSet(raw: string | null, allowed: Set<string>): string[] {
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => allowed.has(s));
  return Array.from(new Set(values));
}

function text(raw: string | null, maxLength = 80): string | undefined {
  const v = raw?.trim();
  return v ? v.slice(0, maxLength) : undefined;
}

export function parseRentalFilters(sp: URLSearchParams): RentalFilters {
  const operation = ((): RentalOperation => {
    const v = sp.get("operation")?.trim().toUpperCase();
    return v === "SALE" || v === "ANY" ? v : "RENT";
  })();

  const minEuros = clampInt(sp.get("minPrice"), 0, MAX_EUROS);
  const maxEuros = clampInt(sp.get("maxPrice"), 0, MAX_EUROS);
  const minRooms = clampInt(sp.get("minRooms"), 0, 50);
  const maxRooms = clampInt(sp.get("maxRooms"), 0, 50);
  const minArea = clampInt(sp.get("minArea"), 0, MAX_AREA);
  const maxArea = clampInt(sp.get("maxArea"), 0, MAX_AREA);

  const sortParam = sp.get("sort")?.trim() as RentalSort | undefined;

  return {
    operation,
    q: text(sp.get("q")),
    // Provincia canónica: "bilbao" o "vizcaya" filtran por "Vizcaya". Si no se
    // reconoce, NO se filtra por provincia (búsqueda más amplia) — el mismo
    // criterio que empleo, y el aviso lo da la UI, no un resultado vacío.
    province: canonicalProvince(text(sp.get("province"))),
    city: text(sp.get("city")),
    neighborhood: text(sp.get("neighborhood")),
    types: listFromSet(sp.get("type"), PROPERTY_TYPES),
    // Céntimos: `Math.round(€ * 100)`.
    minPrice: minEuros != null ? minEuros * 100 : undefined,
    maxPrice: maxEuros != null ? maxEuros * 100 : undefined,
    minRooms,
    maxRooms,
    minBaths: clampInt(sp.get("minBaths"), 0, 50),
    minArea,
    maxArea,
    furnished: pickFromSet(sp.get("furnished"), FURNISHED_STATES),
    contractType: pickFromSet(sp.get("contractType"), CONTRACT_TYPES),
    petsAllowed: boolParam(sp.get("petsAllowed")),
    utilitiesIncluded: boolParam(sp.get("utilitiesIncluded")),
    features: (sp.get("features") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is keyof typeof FEATURE_COLUMNS => s in FEATURE_COLUMNS),
    includeUnavailable: boolParam(sp.get("includeUnavailable")) === true,
    sort: sortParam && SORTS.has(sortParam) ? sortParam : "recent",
    limit: clampInt(sp.get("limit"), 1, MAX_LIMIT) ?? DEFAULT_LIMIT,
    cursor: text(sp.get("cursor"), 64),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Consulta
// ─────────────────────────────────────────────────────────────────────────

/** Columna de precio de esta operación. Alquiler y venta NO comparten columna. */
export function priceColumn(operation: RentalOperation): "monthlyRent" | "currentPrice" {
  return operation === "SALE" ? "currentPrice" : "monthlyRent";
}

function range(min?: number, max?: number): Prisma.IntFilter | undefined {
  if (min == null && max == null) return undefined;
  return { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) };
}

/**
 * `where` de Prisma para estos filtros. NO incluye `ownerId`: el aislamiento por
 * dueño lo añade la ruta, que es quien conoce la sesión (y así se ve en la ruta,
 * no escondido tres capas abajo).
 */
export function buildRentalWhere(f: RentalFilters): Prisma.PropertyWhereInput {
  const and: Prisma.PropertyWhereInput[] = [];

  if (f.operation === "RENT") {
    // El alquiler con opción a compra ES alquiler para quien busca dónde vivir.
    and.push({ operationType: { in: ["RENT", "RENT_TO_OWN"] } });
  } else if (f.operation === "SALE") {
    and.push({ operationType: { in: ["SALE", "RENT_TO_OWN"] } });
  }

  if (!f.includeUnavailable) {
    and.push({ status: { notIn: TERMINAL_STATUSES as Prisma.EnumPropertyStatusFilter["notIn"] } });
  }

  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { neighborhood: { contains: f.q, mode: "insensitive" } },
        { address: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }

  if (f.province) and.push({ province: { equals: f.province, mode: "insensitive" } });
  // Municipio y barrio van por `contains`: el corpus tiene el nombre tal cual lo
  // escribió el portal ("Gijón/Xixón", "L'Hospitalet de Llobregat"). La Fase 3
  // los sustituye por el código INE y un slug de zona.
  if (f.city) and.push({ city: { contains: f.city, mode: "insensitive" } });
  if (f.neighborhood) {
    and.push({ neighborhood: { contains: f.neighborhood, mode: "insensitive" } });
  }

  if (f.types.length) {
    and.push({ type: { in: f.types as Prisma.EnumPropertyTypeFilter["in"] } });
  }

  const price = range(f.minPrice, f.maxPrice);
  if (price) and.push({ [priceColumn(f.operation)]: price });

  const rooms = range(f.minRooms, f.maxRooms);
  if (rooms) and.push({ rooms });
  if (f.minBaths != null) and.push({ bathrooms: { gte: f.minBaths } });

  const area = range(f.minArea, f.maxArea);
  if (area) and.push({ builtArea: area });

  if (f.furnished) {
    and.push({ furnished: f.furnished as Prisma.PropertyWhereInput["furnished"] });
  }
  if (f.contractType) {
    and.push({ contractType: f.contractType as Prisma.PropertyWhereInput["contractType"] });
  }
  if (f.petsAllowed != null) and.push({ petsAllowed: f.petsAllowed });
  if (f.utilitiesIncluded != null) and.push({ utilitiesIncluded: f.utilitiesIncluded });

  for (const feature of f.features) {
    const column = FEATURE_COLUMNS[feature as keyof typeof FEATURE_COLUMNS];
    if (column) and.push({ [column]: true });
  }

  return and.length ? { AND: and } : {};
}

/**
 * Orden estable. El desempate por `id` no es decorativo: sin él, la paginación
 * por cursor duplica y salta filas cuando varias comparten precio.
 * `nulls: "last"` deja al final las fichas sin precio en vez de esconderlas.
 */
export function rentalOrderBy(f: RentalFilters): Prisma.PropertyOrderByWithRelationInput[] {
  const asc = { sort: "asc", nulls: "last" } as const;
  const desc = { sort: "desc", nulls: "last" } as const;
  const byPrice = (dir: typeof asc | typeof desc) =>
    f.operation === "SALE" ? { currentPrice: dir } : { monthlyRent: dir };

  switch (f.sort) {
    case "price_asc":
      return [byPrice(asc), { id: "asc" }];
    case "price_desc":
      return [byPrice(desc), { id: "asc" }];
    case "area_desc":
      return [{ builtArea: desc }, { id: "asc" }];
    default:
      return [{ updatedAt: "desc" }, { id: "asc" }];
  }
}
