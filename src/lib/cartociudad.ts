import { canonicalProvinceLoose } from "@/lib/geo-es";

/**
 * Cliente del geocodificador de CartoCiudad (IGN/CNIG). Gratis, sin clave y
 * oficial para España: devuelve municipio, código INE de municipio, provincia y
 * código postal, que es justo lo que Nominatim no da bien.
 *
 * Se usa para NORMALIZAR el corpus (Fase 3 de `docs/BUSCADOR-ALQUILER.md`), no
 * en el camino caliente de una petición del usuario. El throttle de módulo de
 * abajo funciona aquí porque el proceso es UNO (un script en un portátil); en
 * Vercel no serviría, que es el defecto documentado de `src/lib/geocode.ts`.
 *
 * Docs: https://github.com/IDEESpain/Cartociudad (servicio REST "geocoder").
 * Datos © Instituto Geográfico Nacional — requiere atribución al mostrarlos.
 */

const BASE = "https://www.cartociudad.es/geocoder/api/geocoder/candidates";
const UA = "Nidokey/1.0 (normalizacion de fichas propias; contacto en nidokey.es)";

export type CartoCiudadCandidate = {
  id?: string;
  /** callejero | portal | municipio | poblacion | provincia | Codpost | … */
  type?: string;
  address?: string | null;
  muni?: string | null;
  /** Código INE de municipio (5 dígitos). */
  muniCode?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  poblacion?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** 1 = resultado exacto; valores mayores, cada vez más laxos. */
  state?: number | null;
  stateMsg?: string | null;
};

/**
 * Precisión del candidato, de más a menos. Un `provincia` o una `comunidad
 * autonoma` NO sirven para poner ciudad: son el equivalente al centroide
 * administrativo que ya nos mordió en `geocode.ts` el 2026-07-30.
 */
const TYPE_RANK: Record<string, number> = {
  portal: 0,
  callejero: 1,
  poblacion: 2,
  municipio: 3,
  Codpost: 4,
};

let lastCall = 0;
async function throttle(minGapMs: number) {
  const wait = Math.max(0, minGapMs - (Date.now() - lastCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function cartociudadCandidates(
  query: string,
  opts: { limit?: number; provinceFilter?: string; timeoutMs?: number; minGapMs?: number } = {}
): Promise<CartoCiudadCandidate[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  // 1 req/s, el mismo listón de cortesía que ya nos aplicamos con Nominatim.
  await throttle(opts.minGapMs ?? 1000);

  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 8),
    countrycodes: "es",
  });
  if (opts.provinceFilter) params.set("provincia_filter", opts.provinceFilter);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return [];
    // El servicio responde a veces con content-type text/plain: parsear a mano
    // en vez de confiar en res.json(), y tolerar un objeto suelto.
    const parsed = JSON.parse(await res.text()) as unknown;
    if (Array.isArray(parsed)) return parsed as CartoCiudadCandidate[];
    return parsed && typeof parsed === "object" ? [parsed as CartoCiudadCandidate] : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export type GeoMatch = {
  city: string;
  /** Provincia canónica en castellano (la misma tabla que usa todo el producto). */
  province: string;
  /** Código INE de municipio, si el servicio lo dio. */
  municipalityCode: string | null;
  /** Tipo de candidato del que salió (para poder auditar la decisión). */
  matchedType: string;
  /** `state` del IGN: 1 = exacto; valores mayores, cada vez más laxos. */
  state: number | null;
};

/**
 * Elige el mejor candidato para poner municipio y provincia a una ficha.
 * Función PURA: es la que se testea; la red no.
 *
 * Política deliberada, heredada del incidente de los centroides
 * (`src/lib/geocode.ts:88-94`): **antes sin dato que con un dato inventado**.
 * Por eso descarta lo que no llegue a nivel de municipio y devuelve `null` en
 * vez de "lo más parecido".
 */
export function pickBestMunicipality(
  candidates: CartoCiudadCandidate[],
  hint: { province?: string; onlyMunicipalityLevel?: boolean } = {}
): GeoMatch | null {
  const hintedProvince = canonicalProvinceLoose(hint.province);
  // Consulta demasiado amplia (sólo el nombre de una provincia): un resultado
  // de calle o portal sería un homónimo, no la ubicación de la ficha.
  const minRank = hint.onlyMunicipalityLevel ? TYPE_RANK.poblacion : 0;

  const usable = candidates
    .map((c) => {
      const city = (c.muni ?? c.poblacion ?? "").trim();
      const province = canonicalProvinceLoose(c.province);
      const type = c.type ?? "";
      return { c, city, province, type, rank: TYPE_RANK[type] };
    })
    // Sin municipio, sin provincia reconocible o de un tipo demasiado grueso
    // (provincia, comunidad autónoma…) no vale: pondría un dato falso.
    .filter((x) => x.city && x.province && x.rank !== undefined && x.rank >= minRank);

  if (!usable.length) return null;

  // Si la ficha YA apuntaba a una provincia, sólo valen los candidatos de esa
  // provincia. Que ninguno case es AMBIGÜEDAD, no permiso para coger otro: si
  // la ficha dice Asturias y el IGN sólo ofrece un homónimo de Badajoz, poner
  // ese municipio deja la ficha internamente contradictoria (Villanueva,
  // Asturias) — peor que dejarla sin normalizar. Objeción de Codex en la
  // revisión de la Fase 3, aceptada.
  let pool = usable;
  if (hintedProvince) {
    pool = usable.filter((x) => x.province === hintedProvince);
    if (!pool.length) return null;
  }

  const best = pool.slice().sort((a, b) => {
    if (a.rank !== b.rank) return a.rank! - b.rank!;
    return (a.c.state ?? 99) - (b.c.state ?? 99);
  })[0];

  return {
    city: best.city,
    province: best.province!,
    municipalityCode: best.c.muniCode?.trim() || null,
    matchedType: best.type,
    state: best.c.state ?? null,
  };
}
