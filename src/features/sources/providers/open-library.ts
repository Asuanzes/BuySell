/**
 * Cliente fino de Open Library (openlibrary.org) — fuente de LIBROS SIN clave
 * (keyless), fallback de Google Books. `search.json` devuelve docs planos con
 * portada/ISBN/año/rating; la sinopsis NO viene en la búsqueda (se enriquece con
 * el work API en el fetch). Devuelve datos CRUDOS; los normaliza el adaptador
 * con `fromOpenLibrary` (packages/shared/src/book.ts).
 *
 * Semántica de errores: búsqueda y work LANZAN ProviderUnavailableError si OL
 * está caído (red/5xx) — el caller distingue "no existe" de "no se pudo
 * consultar". Los enriquecimientos decorativos (sinopsis, ratings) siguen
 * siendo best-effort y devuelven null en cualquier fallo.
 */
import { getJsonStrict } from "./availability";

const SEARCH = "https://openlibrary.org/search.json";
const FIELDS =
  "key,title,author_name,first_publish_year,isbn,cover_i,language," +
  "number_of_pages_median,ratings_average,ratings_count,subject,publisher";
const UA = "Nidokey/1.0 (personal book tracker)";

/** Estricto: null solo si el recurso no existe; lanza si OL está caído.
 *  OL search es a veces lento (>9s); damos margen (la ruta tiene maxDuration 60). */
async function getJson(url: string): Promise<unknown | null> {
  return getJsonStrict(url, {
    provider: "Open Library",
    timeoutMs: 15000,
    headers: { "User-Agent": UA },
  });
}

/** Blando (best-effort): para los enriquecimientos decorativos (ratings), donde
 *  un fallo de OL no debe tumbar la operación principal. */
async function getJsonSoft(url: string): Promise<unknown | null> {
  try {
    return await getJson(url);
  } catch {
    return null;
  }
}

/** Busca libros por texto (título/autor). Devuelve los docs crudos. */
export async function openLibrarySearch(query: string): Promise<unknown[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&limit=5&fields=${encodeURIComponent(FIELDS)}`;
  const json = (await getJson(url)) as { docs?: unknown[] } | null;
  return json?.docs ?? [];
}

/** Detalle de un work (para la sinopsis en el fetch directo). */
export async function openLibraryWork(workId: string): Promise<unknown | null> {
  const id = workId.trim();
  if (!id) return null;
  return getJson(`https://openlibrary.org/works/${encodeURIComponent(id)}.json`);
}

/** Sinopsis (description) de un work, si la hay. La búsqueda NO la trae, así que
 *  se usa para enriquecer al guardar. `description` puede ser string o
 *  `{ value }`; limpia las referencias markdown típicas de OL. Best-effort:
 *  null también si OL está caído (la sinopsis es decoración, no bloquea). */
export async function openLibraryWorkDescription(workId: string): Promise<string | null> {
  let work: unknown | null;
  try {
    work = await openLibraryWork(workId);
  } catch {
    return null;
  }
  const d = (work as { description?: unknown })?.description;
  let txt =
    typeof d === "string"
      ? d
      : typeof (d as { value?: unknown })?.value === "string"
      ? (d as { value: string }).value
      : null;
  if (!txt) return null;
  txt = txt
    .replace(/\(\[[^\]]*\]\[\d+\]\)/g, "") // "([source][1])"
    .replace(/\n?\[\d+\]:\s*\S+/g, "") // "[1]: https://…"
    .replace(/\s+/g, " ")
    .trim();
  return txt || null;
}

/** Valoración agregada de un work: media (1-5) y nº de votos. La búsqueda ya trae
 *  rating, pero el fetch directo por work id y los libros de Google sin nota NO →
 *  se pide aquí. `summary.average` es la media; `summary.count` el nº de votos. */
export async function openLibraryWorkRatings(
  workId: string
): Promise<{ average: number; count: number | null } | null> {
  const id = workId.trim();
  if (!id) return null;
  const json = (await getJsonSoft(
    `https://openlibrary.org/works/${encodeURIComponent(id)}/ratings.json`
  )) as { summary?: { average?: number | null; count?: number | null } } | null;
  const avg = json?.summary?.average;
  // OL devuelve average:0 y count:0 para works SIN votos (no null): eso es
  // "sin nota", no una nota de cero — guardarlo pintaba "★ 0.0" en la ficha
  // (y currentValue=0). En una escala 1–5 un promedio 0 real es imposible.
  if (avg == null || !Number.isFinite(avg) || avg <= 0) return null;
  const count = json?.summary?.count;
  return { average: Math.round(avg * 10) / 10, count: typeof count === "number" ? count : null };
}

/** Valoración de Open Library a partir de un ISBN: resuelve ISBN → edición → work
 *  → ratings. Sirve para rellenar la nota cuando Google Books no la trae (OL
 *  agrega votos de TODAS las ediciones del work). 2 llamadas, best-effort. */
export async function openLibraryRatingByIsbn(
  isbn: string
): Promise<{ average: number; count: number | null } | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (clean.length < 10) return null;
  const ed = (await getJsonSoft(`https://openlibrary.org/isbn/${clean}.json`)) as
    | { works?: { key?: string }[] }
    | null;
  const workKey = ed?.works?.[0]?.key; // p.ej. "/works/OL12345W"
  if (!workKey) return null;
  return openLibraryWorkRatings(workKey.replace(/^\/works\//, ""));
}
