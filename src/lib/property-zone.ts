import type { PropertyStatus, PropertyType } from "@prisma/client";

/**
 * Comparativa de zona (Tier 1, datos propios del usuario): la ficha actual
 * contra las demás del MISMO dueño con la MISMA operación, estratificada por
 * [ciudad, barrio, tipo] → [ciudad, tipo] → [ciudad].
 *
 * Lógica PURA (sin prisma ni red) para poder testearla igual que
 * `recheck-plan.ts`. El precio de comparación es la RENTA si la operación es
 * de alquiler (RENT/RENT_TO_OWN) y el PRECIO de venta si no.
 *
 * Reglas:
 *  - `coldStart` = la muestra total (alternativas + ficha actual) es menor que
 *    `minSample`: la UI muestra una nota en vez de dar stats con confianza.
 *  - `stats` (min/mediana/máx y €/m²) se calculan sobre las ALTERNATIVAS
 *    (el "precio de zona"); la ficha actual se resalta aparte.
 *  - El nivel elegido es el más fino con muestra suficiente; si ni siquiera
 *    [ciudad] llega, se usa [ciudad] igualmente (la nota de cold-start avisa).
 */

export type ZoneComparable = {
  id: string;
  title: string;
  type: PropertyType;
  city: string;
  neighborhood: string | null;
  status: PropertyStatus;
  /** Precio de comparación en céntimos (renta o venta según la operación). */
  price: number | null;
  builtArea: number | null;
};

export type ZoneLevel = "city" | "city_type" | "city_neighborhood_type";

export type ZoneStats = {
  count: number;
  min: number;
  median: number;
  max: number;
  /** €/m² enteros, solo si hay >= 2 muestras con superficie. */
  perSqm: { min: number; median: number; max: number } | null;
};

export type ZoneContextResult = {
  level: ZoneLevel;
  scope: { city: string; neighborhood: string | null; type: PropertyType };
  /** Muestra demasiado pequeña: mostrar nota en vez de dar stats con confianza. */
  coldStart: boolean;
  /** Total de fichas en el alcance (alternativas + ficha actual). */
  count: number;
  stats: ZoneStats | null;
  /** Las alternativas (sin la ficha actual), mismas zona+tipo según el nivel. */
  alternatives: ZoneComparable[];
};

/** Umbral mínimo de muestra (incluida la ficha actual) para no marcar cold-start. */
export const ZONE_MIN_SAMPLE = 3;

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Stats de precio (y €/m²) de una lista de comparables. null si hay < 2 precios. */
export function zoneStats(items: ZoneComparable[]): ZoneStats | null {
  const prices = items.map((i) => i.price).filter((p): p is number => p != null && p > 0);
  if (prices.length < 2) return null;
  const perSqm = items
    .map((i) => (i.price != null && i.builtArea ? Math.round(i.price / 100 / i.builtArea) : null))
    .filter((v): v is number => v != null && v > 0);
  return {
    count: items.length,
    min: Math.min(...prices),
    median: median(prices),
    max: Math.max(...prices),
    perSqm:
      perSqm.length >= 2
        ? { min: Math.min(...perSqm), median: median(perSqm), max: Math.max(...perSqm) }
        : null,
  };
}

export function buildZoneContext(opts: {
  current: ZoneComparable;
  others: ZoneComparable[];
  minSample?: number;
}): ZoneContextResult {
  const minSample = opts.minSample ?? ZONE_MIN_SAMPLE;
  const { current, others } = opts;

  const byCity = others.filter((o) => o.city === current.city);
  const byCityType = byCity.filter((o) => o.type === current.type);
  const byCityNbType =
    current.neighborhood != null ? byCityType.filter((o) => o.neighborhood === current.neighborhood) : [];

  // El nivel más fino con muestra suficiente: necesita >= 2 alternativas (para
  // min/mediana/máx útiles) y total >= minSample.
  let level: ZoneLevel;
  let alternatives: ZoneComparable[];
  if (byCityNbType.length >= 2 && byCityNbType.length + 1 >= minSample) {
    level = "city_neighborhood_type";
    alternatives = byCityNbType;
  } else if (byCityType.length >= 2 && byCityType.length + 1 >= minSample) {
    level = "city_type";
    alternatives = byCityType;
  } else {
    level = "city";
    alternatives = byCity;
  }

  const count = alternatives.length + 1;
  return {
    level,
    scope: { city: current.city, neighborhood: current.neighborhood, type: current.type },
    coldStart: count < minSample,
    count,
    stats: alternatives.length >= 2 ? zoneStats(alternatives) : null,
    alternatives,
  };
}
