import * as cheerio from "cheerio";
import {
  fromGoogleBooks,
  fromOpenLibrary,
  isValidIsbn10,
  isValidIsbn13,
  type Book,
} from "@nidokey/shared";

import { googleBooksSearch } from "@/features/sources/providers/google-books";
import {
  openLibrarySearch,
  openLibraryWorkDescription,
} from "@/features/sources/providers/open-library";
import type { NormalizedRecord } from "@/features/sources/types";
import type { BookHints, ResolveResult } from "./types";

/**
 * Pipeline robusto de importación de LIBROS desde una URL.
 *
 *   resolveBookFromUrl(url)
 *     A) fetchPageHtml(url)                → HTML (la página es solo una PISTA)
 *     B) extractBookHintsFromHtml(html)    → { isbn?, title?, authors? }
 *        - JSON-LD schema.org/Book·Product (primario)
 *        - microdata itemprop, meta tags, regex de ISBN (fallbacks)
 *     C) si hay ISBN → lookupBookByIsbn   (Open Library → Google Books, match exacto)
 *        si no       → lookupBookByTitleAuthor (búsqueda + scoring fuzzy)
 *     D) Normaliza al modelo de dominio `Book` (lo hacen fromGoogleBooks/OL)
 *     E) Devuelve ResolveResult (ok+book | error tipado)
 *
 * Resiliencia: si un proveedor está caído/sin cuota (lanza
 * ProviderUnavailableError) y NINGÚN proveedor confirma el libro, NO se
 * devuelve BOOK_NOT_FOUND (sería mentira) sino PROVIDERS_UNAVAILABLE, para que
 * la app muestre "servicio no disponible, reintenta" en lugar de "no existe".
 *
 * Sin reglas por dominio: nos apoyamos en datos estructurados + APIs de
 * metadatos. Donde se podría enchufar un LLM en el futuro: en `pickBest` para
 * desambiguar candidatos cuando el scoring por título+autor es flojo (ver nota).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── Paso A — descargar el HTML ────────────────────────────────────────────────

/** Descarga el HTML de la página. Lanza en fallo de red/HTTP (lo captura el
 *  orquestador → NETWORK_ERROR). Mínimo y genérico: no toca cabeceras por sitio. */
export async function fetchPageHtml(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Paso B — extraer pistas del HTML ──────────────────────────────────────────

/** Extrae { isbn?, title?, authors? } de la página. Prioriza datos
 *  estructurados (schema.org/Book) y cae a meta tags y regex de ISBN. */
export function extractBookHintsFromHtml(html: string): BookHints {
  const hints: BookHints = {};
  let $: ReturnType<typeof cheerio.load>;
  try {
    $ = cheerio.load(html);
  } catch {
    const i = isbnFromText(html);
    return i ? { isbn: i } : {};
  }

  // 1) JSON-LD schema.org/Book | Product (la señal primaria).
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    for (const node of flattenJsonLd(data)) {
      const type = jsonLdType(node);
      if (!(type.includes("book") || type.includes("product"))) continue;
      if (!hints.isbn) {
        const i = normalizeIsbn(firstString(node.isbn ?? node.gtin13 ?? node.gtin ?? node.gtin14));
        if (i) hints.isbn = i;
      }
      if (!hints.title && typeof node.name === "string") {
        const t = cleanTitle(node.name);
        if (t.length >= 2) hints.title = t;
      }
      if (!hints.authors) {
        const a = parseAuthors(node.author);
        if (a.length) hints.authors = a;
      }
    }
  });

  // 2) Microdata schema.org/Book.
  if (!hints.isbn) {
    const mi = $('[itemprop="isbn"]').attr("content") ?? $('[itemprop="isbn"]').first().text();
    const i = normalizeIsbn(mi);
    if (i) hints.isbn = i;
  }
  if (!hints.title) {
    const mt = $('[itemtype*="schema.org/Book"] [itemprop="name"]').first().text();
    if (mt) {
      const t = cleanTitle(mt);
      if (t.length >= 2) hints.title = t;
    }
  }
  if (!hints.authors) {
    const authors = $('[itemtype*="schema.org/Book"] [itemprop="author"]')
      .map((_, el) => $(el).attr("content") || $(el).text())
      .get()
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .slice(0, 5);
    if (authors.length) hints.authors = authors;
  }

  // 3) Meta tags (book:isbn / og:isbn / product:isbn / og:title).
  if (!hints.isbn) {
    const m =
      $('meta[property="book:isbn"]').attr("content") ??
      $('meta[property="og:isbn"]').attr("content") ??
      $('meta[property="product:isbn"]').attr("content") ??
      $('meta[name="isbn"]').attr("content");
    const i = normalizeIsbn(m);
    if (i) hints.isbn = i;
  }
  if (!hints.title) {
    const og = $('meta[property="og:title"]').attr("content") ?? $("title").first().text();
    if (og) {
      const t = cleanTitle(og);
      if (t.length >= 2) hints.title = t;
    }
  }

  // 4) Último recurso: ISBN-13 por regex en el texto de la página.
  if (!hints.isbn) {
    const i = isbnFromText(html);
    if (i) hints.isbn = i;
  }

  return hints;
}

// ── Paso C — lookups contra APIs de metadatos ─────────────────────────────────

/** «No hay resultado Y algún proveedor estaba caído» → no se puede afirmar que
 *  el libro no exista. El orquestador lo traduce a PROVIDERS_UNAVAILABLE. */
export class BookProvidersUnavailableError extends Error {
  constructor() {
    super("Proveedores de metadatos de libros no disponibles");
    this.name = "BookProvidersUnavailableError";
  }
}

/** Resuelve un libro por ISBN (pivote fiable): Open Library primero (keyless,
 *  SIN cuota — no depende de la cuota diaria de Google) y Google Books como
 *  respaldo. Si OL acierta pero viene sin sinopsis, se injerta la de Google
 *  (best-effort). Devuelve null solo si algún proveedor respondió y ninguno
 *  tiene el libro; lanza BookProvidersUnavailableError si no hay resultado y
 *  hubo proveedores caídos (no sabemos si existe). */
export async function lookupBookByIsbn(isbn: string): Promise<Book | null> {
  const norm = normalizeIsbn(isbn);
  if (!norm) return null;
  let book: Book | null = null;
  let unavailable = false;
  try {
    const docs = await openLibrarySearch(norm);
    if (docs[0]) book = await enrichOl(fromOpenLibrary(docs[0]));
  } catch {
    unavailable = true;
  }
  if (!book) {
    try {
      const items = await googleBooksSearch(`isbn:${norm}`);
      if (items[0]) book = fromGoogleBooks(items[0]);
    } catch {
      unavailable = true;
    }
  } else if (!book.description) {
    // OL sin sinopsis ni en el work (frecuente) → injerta la de Google si la
    // tiene. Decorativo: el libro ya está resuelto, un fallo aquí no bloquea.
    try {
      const items = await googleBooksSearch(`isbn:${norm}`);
      const alt = items[0] ? fromGoogleBooks(items[0]) : null;
      if (alt?.description) book = { ...book, description: alt.description };
      if (alt && book.averageRating == null && alt.averageRating != null) {
        book = { ...book, averageRating: alt.averageRating, ratingsCount: alt.ratingsCount };
      }
    } catch {
      /* decorativo */
    }
  }
  if (!book && unavailable) throw new BookProvidersUnavailableError();
  return book ? await recoverCover(book, norm) : null;
}

/** Muchas ediciones concretas de Google Books (las que casan por ISBN exacto) NO
 *  traen portada, aunque la obra sí tenga una. Si el libro resuelto se queda sin
 *  portada, usamos la portada por ISBN de Open Library (URL directa, sin API key).
 *  `?default=false` → 404 si OL tampoco la tiene (expo-image muestra su placeholder). */
function withIsbnCoverFallback(book: Book, isbn: string): Book {
  if (book.imageUrls.thumbnail || book.imageUrls.large) return book;
  return {
    ...book,
    imageUrls: {
      thumbnail: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
      large: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
    },
  };
}

/** Injerta una portada de un candidato hermano (misma búsqueda título+autor) cuando
 *  la edición elegida no trae ninguna: sin coste de red, reutiliza los candidatos ya
 *  descargados. El primer hermano CON portada es de la misma obra → portada válida. */
function withBestCover(book: Book, siblings: Book[]): Book {
  if (book.imageUrls.thumbnail || book.imageUrls.large) return book;
  const covered = siblings.find((b) => b.imageUrls.thumbnail || b.imageUrls.large);
  return covered ? { ...book, imageUrls: covered.imageUrls } : book;
}

/** Recupera la portada de un libro que se quedó sin ella (típico al resolver por un
 *  ISBN cuya edición concreta no trae imagen). Orden: (1) buscar una edición CON
 *  portada de la MISMA obra por título+autor — Google/OL ya injertan hermanos, así
 *  que `alt.imageUrls` suele venir lleno; (2) último recurso, portada OL por ISBN
 *  (URL directa, 404→placeholder). Solo cambia `imageUrls`: el resto del libro
 *  resuelto (la edición correcta) manda. */
async function recoverCover(book: Book, fallbackIsbn?: string | null): Promise<Book> {
  if (book.imageUrls.thumbnail || book.imageUrls.large) return book;
  if (book.title) {
    try {
      const alt = await lookupBookByTitleAuthor(book.title, book.authors);
      if (alt && (alt.imageUrls.thumbnail || alt.imageUrls.large)) {
        return { ...book, imageUrls: alt.imageUrls };
      }
    } catch {
      /* sigue al respaldo por ISBN */
    }
  }
  const isbn = book.isbn13 ?? fallbackIsbn ?? null;
  return isbn ? withIsbnCoverFallback(book, isbn) : book;
}

/** Resuelve por título(+autor) cuando no hay ISBN: busca en Google Books / Open
 *  Library y elige el mejor candidato por similitud de título y solape de autor.
 *  Google primero (mejor ranking fuzzy en español); si está caído/sin cuota se
 *  cae a OL. Devuelve null si ninguno supera el umbral (evita "añadir el que
 *  sea"); lanza BookProvidersUnavailableError si no hubo candidato válido Y
 *  algún proveedor estaba caído (no podemos afirmar que no exista). */
export async function lookupBookByTitleAuthor(
  title: string,
  authors: string[],
): Promise<Book | null> {
  const q = [title, authors[0]].filter(Boolean).join(" ").trim();
  if (q.length < 2) return null;
  let unavailable = false;
  try {
    const cands = (await googleBooksSearch(q)).map(fromGoogleBooks);
    const best = pickBest(cands, title, authors);
    if (best) return withBestCover(best, cands);
  } catch {
    unavailable = true; // Google caído → probamos OL
  }
  try {
    const cands = (await openLibrarySearch(q)).map(fromOpenLibrary);
    const best = pickBest(cands, title, authors);
    if (best) return enrichOl(withBestCover(best, cands));
  } catch {
    unavailable = true;
  }
  if (unavailable) throw new BookProvidersUnavailableError();
  return null;
}

// ── Orquestador (inyectable para tests) ───────────────────────────────────────

export interface ResolveDeps {
  fetchHtml: typeof fetchPageHtml;
  extractHints: typeof extractBookHintsFromHtml;
  lookupByIsbn: typeof lookupBookByIsbn;
  lookupByTitleAuthor: typeof lookupBookByTitleAuthor;
}

const defaultDeps: ResolveDeps = {
  fetchHtml: fetchPageHtml,
  extractHints: extractBookHintsFromHtml,
  lookupByIsbn: lookupBookByIsbn,
  lookupByTitleAuthor: lookupBookByTitleAuthor,
};

/**
 * Orquesta A→E. `deps` se inyecta en tests para mockear red/APIs.
 * Devuelve un resultado etiquetado: `{ ok:true, book, via, hints }` o
 * `{ ok:false, code, message }`.
 */
export async function resolveBookFromUrl(
  url: string,
  deps: Partial<ResolveDeps> = {},
): Promise<ResolveResult> {
  const d = { ...defaultDeps, ...deps };

  if (!isHttpUrl(url)) {
    return { ok: false, code: "INVALID_URL", message: "La URL no es válida." };
  }

  let html: string;
  try {
    html = await d.fetchHtml(url);
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: e instanceof Error ? `No se pudo abrir la página: ${e.message}` : "Fallo de red.",
    };
  }

  // Amazon y otras tiendas devuelven páginas de captcha/bot-check (HTTP 200) a
  // peticiones server-side. Extraer "pistas" de un captcha produce falsos
  // ISBN_NOT_FOUND → mentimos al usuario ("no existe"). Mejor decir "reintenta".
  if (isBotCheckPage(html)) {
    return {
      ok: false,
      code: "PROVIDERS_UNAVAILABLE",
      message:
        "La tienda bloqueó la lectura de la página (protección anti-bots). Inténtalo de nuevo o busca por título.",
    };
  }

  const hints = d.extractHints(html);
  let unavailable = false;

  // C1) ISBN → pivote fiable.
  if (hints.isbn) {
    try {
      const book = await d.lookupByIsbn(hints.isbn);
      if (book) return { ok: true, book, via: "isbn", hints };
    } catch (e) {
      if (!(e instanceof BookProvidersUnavailableError)) throw e;
      unavailable = true; // seguimos: quizá el título sí resuelve
    }
  }

  // C2) Título(+autor) → fuzzy con scoring.
  if (hints.title) {
    try {
      let book = await d.lookupByTitleAuthor(hints.title, hints.authors ?? []);
      if (book) {
        // Si la edición elegida no trae portada pero la página daba ISBN, respaldo OL.
        if (!book.imageUrls.thumbnail && !book.imageUrls.large && hints.isbn) {
          book = withIsbnCoverFallback(book, hints.isbn);
        }
        return { ok: true, book, via: "title-author", hints };
      }
    } catch (e) {
      if (!(e instanceof BookProvidersUnavailableError)) throw e;
      unavailable = true;
    }
  }

  if (!hints.isbn && !hints.title) {
    return {
      ok: false,
      code: "ISBN_NOT_FOUND",
      message: "No se pudo extraer ISBN ni título de la página.",
    };
  }
  if (unavailable) {
    return {
      ok: false,
      code: "PROVIDERS_UNAVAILABLE",
      message:
        "El servicio de libros no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.",
    };
  }
  return {
    ok: false,
    code: "BOOK_NOT_FOUND",
    message: "Libro no encontrado en Google Books ni Open Library.",
  };
}

// ── Mapeo a NormalizedRecord (para guardar vía upsertRecord / import) ──────────

/** Proyecta un `Book` resuelto a NormalizedRecord (la fila que persiste la app).
 *  La fuente se deriva del propio libro; el `Book` entero viaja en `meta.book`. */
export function bookToNormalized(book: Book): NormalizedRecord {
  const source =
    book.source === "OPEN_LIBRARY"
      ? "open_library"
      : book.source === "MANUAL"
      ? "manual"
      : "google_books";
  const externalId =
    book.isbn13 ??
    book.externalIds?.googleVolumeId ??
    book.externalIds?.openLibraryWorkId ??
    book.id;
  const author = book.authors[0] ?? null;
  return {
    recordType: "book",
    title: book.title || "Libro",
    subtitle: [author, book.publishedYear].filter(Boolean).join(" · ") || null,
    status: "WISHLIST",
    currentValue: book.averageRating != null ? Math.round(book.averageRating * 100) : null,
    currency: null,
    imageUrl: book.imageUrls.thumbnail ?? book.imageUrls.large ?? null,
    source,
    externalId,
    observedAt: new Date(),
    meta: { book, authors: book.authors.join(", "), isbn13: book.isbn13 ?? null },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type JsonNode = Record<string, unknown>;

function flattenJsonLd(data: unknown): JsonNode[] {
  const out: JsonNode[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    const node = v as JsonNode;
    out.push(node);
    if (Array.isArray(node["@graph"])) (node["@graph"] as unknown[]).forEach(visit);
  };
  visit(data);
  return out;
}

function jsonLdType(node: JsonNode): string {
  const t = node["@type"];
  if (typeof t === "string") return t.toLowerCase();
  if (Array.isArray(t)) return t.map((x) => String(x)).join(",").toLowerCase();
  return "";
}

function parseAuthors(a: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (v && typeof v === "object") {
      const name = (v as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) out.push(name.trim());
    }
  };
  if (Array.isArray(a)) a.forEach(push);
  else push(a);
  return out.slice(0, 5);
}

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string" || typeof x === "number");
    return s != null ? String(s) : undefined;
  }
  return undefined;
}

/** Normaliza a ISBN-13 o ISBN-10 (solo dígitos / X) validando el CHECKSUM.
 *  null si no es un ISBN real — un número con formato de ISBN pero checksum
 *  inválido (típico falso positivo de regex sobre HTML/URLs) se descarta y el
 *  pipeline cae a la resolución por título. */
export function normalizeIsbn(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/[^0-9Xx]/g, "").toUpperCase();
  if (isValidIsbn13(d)) return d; // ISBN-13 (checksum ok)
  if (isValidIsbn10(d)) return d; // ISBN-10 (checksum ok)
  return null;
}

/** Señales de página de reto anti-bot (captcha / bot-check) que devuelven
 *  algunas tiendas (Amazon…). La página SÍ es HTML con 200, pero no contiene el
 *  producto: contiene "Captcha", "robot check", referencias a cookies/blobs
 *  anti-bot, etc. Detectar aquí evita ISBN_NOT_FOUND engañoso. */
export function isBotCheckPage(html: string): boolean {
  if (!html || html.length < 2000) return false;
  const low = html.toLowerCase();
  const signals = [
    "captcha",
    "robot check",
    "api-services-support@amazon.com",
    "what is the value of this expression",
    "aws-waf-token",
    "cf-chl",
    "cf-challenge",
    "are you a robot",
    "verify you are human",
    "turnstile",
    "hcaptcha",
  ];
  for (const s of signals) {
    if (low.includes(s)) return true;
  }
  return false;
}

function isbnFromText(html: string): string | null {
  // "ISBN 978-84-..." o un EAN-13 suelto que empiece por 978/979. Itera los
  // matches y devuelve el primero con checksum válido (descarta números basura).
  for (const m of html.matchAll(/97[89][-\s]?(?:\d[-\s]?){9}\d/g)) {
    const norm = normalizeIsbn(m[0]);
    if (norm) return norm;
  }
  return null;
}

function cleanTitle(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  // Sufijo de tienda tras "|" (Fnac, Casa del Libro…) → quédate con lo de antes.
  if (t.includes("|")) t = t.split("|")[0].trim();
  return t.slice(0, 200);
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function enrichOl(book: Book): Promise<Book> {
  if (book.source === "OPEN_LIBRARY" && !book.description && book.externalIds?.openLibraryWorkId) {
    try {
      const d = await openLibraryWorkDescription(book.externalIds.openLibraryWorkId);
      if (d) return { ...book, description: d };
    } catch {
      /* sin sinopsis → seguimos */
    }
  }
  return book;
}

// ── Scoring fuzzy título+autor (sin dependencias; autocontenido) ──────────────
// NOTA: aquí es el punto natural para enchufar un LLM en el futuro — cuando el
// mejor `score` quede en una zona gris (p. ej. 0.35–0.6) o haya empate, pedir a
// un modelo que desambigüe entre los 2–3 candidatos top con título+autor+año.

function pickBest(books: Book[], title: string, authors: string[]): Book | null {
  if (!books.length) return null;
  const tq = bigrams(title);
  const aq = authors.map(normText).filter(Boolean);
  let best: { book: Book; score: number } | null = null;
  for (const b of books) {
    if (!b.title) continue;
    const titleScore = jaccard(tq, bigrams(b.title));
    const authorScore = authorOverlap(aq, b.authors.map(normText));
    const score = titleScore * 0.75 + authorScore * 0.25;
    if (!best || score > best.score) best = { book: b, score };
  }
  // Con autor exigimos menos al título (el autor confirma); sin autor, más.
  const threshold = authors.length ? 0.35 : 0.5;
  return best && best.score >= threshold ? best.book : null;
}

function authorOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  // Coincidencia por inclusión (apellido contenido) además de igualdad.
  for (const x of a) {
    if (setB.has(x)) return 1;
    for (const y of b) if (y.includes(x) || x.includes(y)) return 1;
  }
  return 0;
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const t = normText(s).replace(/ /g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
