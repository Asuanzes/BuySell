/**
 * Geografía canónica de España para búsqueda.
 *
 * Hoy es una FACHADA sobre la tabla que ya mantiene el vertical de empleo
 * (52 provincias en castellano + alias ciudad→provincia + normalización sin
 * acentos). La lista es la misma para todo el producto: duplicarla sólo
 * garantizaría que las dos copias diverjan.
 *
 * El nombre neutro existe por dos razones:
 *  1. que el buscador de alquiler no importe `sources/jobs/province`, que
 *     sugiere una dependencia del vertical de empleo que no existe;
 *  2. tener el sitio donde aterrizará la relación de municipios del INE
 *     (~8.100 filas) en la Fase 3 — ver `docs/BUSCADOR-ALQUILER.md` §5.
 */
import {
  isProvinceName,
  normLocation,
  resolveInfoJobsProvince,
} from "@/features/sources/jobs/province";

/**
 * Provincia canónica para lo que escriba el usuario ("bilbao" → "Vizcaya"),
 * o `undefined` si no se reconoce. Nunca lanza: no reconocer una provincia
 * significa "no filtres por provincia", no "búsqueda fallida".
 */
export const canonicalProvince = resolveInfoJobsProvince;

/** Normaliza texto geográfico: sin acentos, minúsculas, espacios colapsados. */
export const normalizeGeo = normLocation;

/** ¿El texto nombra una provincia entera y no una ciudad concreta? */
export const isProvince = isProvinceName;

/**
 * ¿La consulta sólo nombra una provincia o región (o "España")?
 *
 * Con un texto así, un candidato de CALLE o PORTAL es casi siempre un falso
 * positivo: buscar "Asturias" en el IGN devuelve la calle Asturias de Corvera,
 * no el concejo. Lo detectamos el 2026-08-02 en el informe previo a la primera
 * escritura — cinco fichas de Asturias iban a acabar todas en Corvera.
 */
export function isProvinceOnlyQuery(query: string): boolean {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return true;
  return parts.every((p) => isProvinceName(p) || /^espa(ñ|n)a$/i.test(p));
}

/** Marcador que pone la importación cuando el portal no dio ciudad. */
export const UNKNOWN_CITY = "Desconocida";

/**
 * ¿Este valor es un hueco disfrazado de dato? `province` es NOT NULL y `city`
 * tiene un marcador, así que "vacío" no es sólo `null`: hay que preguntarlo en
 * un único sitio o cada consumidor inventa su propia versión.
 */
export function isBlankGeo(value?: string | null): boolean {
  const v = value?.trim().toLowerCase();
  return !v || v === UNKNOWN_CITY.toLowerCase();
}

/**
 * Como `canonicalProvince`, pero además parte por "/" y "|".
 *
 * Las fuentes oficiales (INE, CartoCiudad/IGN) usan la forma bilingüe completa
 * —"Araba/Álava", "Valencia/València", "Balears, Illes"— y la tabla canónica
 * del producto está en castellano. Sin este desdoblamiento, normalizar el
 * corpus con datos del IGN dejaría sin provincia justo a las comunidades con
 * dos lenguas oficiales.
 */
export function canonicalProvinceLoose(input?: string | null): string | undefined {
  if (!input) return undefined;
  const direct = canonicalProvince(input);
  if (direct) return direct;
  for (const part of input.split(/[/|]/)) {
    const hit = canonicalProvince(part);
    if (hit) return hit;
  }
  return undefined;
}
