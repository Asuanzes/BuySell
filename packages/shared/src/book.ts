/**
 * Modelo de dominio UNIFICADO de LIBROS.
 *
 * Independiente del proveedor: aquí NO entran tipos "GoogleBook" ni "OpenLibrary".
 * Los adaptadores (fromGoogleBooks, fromOpenLibrary…) traducen la respuesta CRUDA
 * de cada API a este `Book`. Así la app y el backend conocen UN solo modelo y
 * cambiar/combinar proveedores no toca la UI.
 *
 * Compartido web ↔ mobile vía @nidokey/shared (solo tipos + helpers puros, sin
 * Prisma ni Node). Encaja con el patrón de verticales `BaseRecord` (records.ts):
 * un `Book` se proyecta a `BaseRecord` con `bookToRecord()` para reusar la
 * lista/cabecera genéricas; el `Book` completo viaja en `record.meta.book`.
 */

import type { BaseRecord } from "./records";

/** Proveedor PRINCIPAL del registro (fuente de la verdad de este `Book`).
 *  - GOOGLE_BOOKS: fuente primaria.
 *  - OPEN_LIBRARY: fallback / enriquecimiento.
 *  - NYT / HARDCOVER: listas y ratings (futuro).
 *  - MANUAL: alta a mano. */
export type BookSource = "GOOGLE_BOOKS" | "OPEN_LIBRARY" | "NYT" | "HARDCOVER" | "MANUAL";

/** IDs del libro en sistemas externos. Campos con NOMBRE de proveedor pero solo
 *  strings opacos (no "tipos" del proveedor): sirven para DEDUPLICAR y enriquecer
 *  cruzando APIs sin acoplar el dominio. Todos opcionales (un libro puede venir de
 *  una sola fuente). */
export interface BookExternalIds {
  /** Google Books volumeId (ej. "zyTCAlFPjgYC"). */
  googleVolumeId?: string;
  /** Open Library work key (ej. "OL45804W") — agrupa todas las ediciones. */
  openLibraryWorkId?: string;
  /** Open Library edition key (ej. "OL7353617M") — edición concreta (por ISBN). */
  openLibraryEditionId?: string;
  goodreadsId?: string;
  hardcoverId?: string;
  /** Amazon ASIN (por si abrimos ficha de compra). */
  asin?: string;
}

/** Portadas por tamaño. Mínimo viable: `thumbnail` (listas) y `large` (detalle).
 *  Ambas opcionales (hay libros sin portada). El adaptador normaliza SIEMPRE a
 *  https y quita el sufijo `&edge=curl` de Google (rompe en algún WebView/Image). */
export interface BookImageUrls {
  /** Pequeña/media → tarjetas de lista (carga rápida). */
  thumbnail?: string | null;
  /** Grande → detalle, compartir (captura) y zoom. */
  large?: string | null;
}

/**
 * Libro: modelo de dominio definitivo.
 *
 * Convención de opcionalidad (igual que el resto de @nidokey/shared):
 *  - Campos "de lista" que SIEMPRE deben existir → requeridos, con default []/{}.
 *  - Datos que las APIs traen a medias → `?: T | null` (null = "sabemos que no hay").
 */
export interface Book {
  // ── Identidad ──────────────────────────────────────────────────────────────
  /** ID interno en NUESTRO sistema (estable, lo controlamos nosotros).
   *  En ingest conviene derivarlo determinista para UPSERT idempotente
   *  (ej. `gbooks:${volumeId}` o `isbn:${isbn13}`) o usar un id de BD y dejar la
   *  clave externa en `externalIds`. */
  id: string;
  /** Proveedor principal de este registro. */
  source: BookSource;
  /** IDs en sistemas externos (dedupe + enriquecimiento cruzado). */
  externalIds: BookExternalIds;
  /** ISBN-10 / ISBN-13: claves naturales para deduplicar entre proveedores.
   *  Opcionales (ebooks/libros antiguos pueden no tenerlos). */
  isbn10?: string | null;
  isbn13?: string | null;

  // ── Contenido ──────────────────────────────────────────────────────────────
  title: string;
  subtitle?: string | null;
  /** Autores como nombres planos. Default `[]` (la lista nunca peta). */
  authors: string[];
  /** Sinopsis/contraportada en TEXTO PLANO. Las APIs a veces la dan con HTML:
   *  el adaptador lo limpia antes de guardarlo aquí. */
  description?: string | null;
  publisher?: string | null;
  pageCount?: number | null;

  // ── i18n / geo (palancas de recomendación futura) ──────────────────────────
  /** Idioma del libro, ISO 639-1 ("es", "en"). Palanca #1: más adelante
   *  priorizaremos `language === idioma del usuario`. */
  language?: string | null;
  /** Pista de región/mercado, ISO 3166-1 alpha-2 ("ES", "US", "MX"). Palanca #2:
   *  para ordenar/recomendar por país del usuario (geolocalización futura).
   *  En Google viene de `saleInfo.country`; puede faltar → opcional. */
  regionHint?: string | null;

  // ── Publicación ────────────────────────────────────────────────────────────
  /** Fecha como STRING ISO, posiblemente PARCIAL: "2017" | "2017-03" | "2017-03-15".
   *  Decisión: un `Date` no representa "solo año" (asumiría 1-ene y perderíamos
   *  precisión); el string la conserva tal cual la da la API. */
  publishedDate?: string | null;
  /** Año derivado de `publishedDate`, para ORDENAR/filtrar/recomendar barato
   *  (sin re-parsear el string en cada sitio). */
  publishedYear?: number | null;

  // ── Taxonomía ──────────────────────────────────────────────────────────────
  /** Géneros/temas PÚBLICOS normalizados del proveedor (ej. "Trading", "Crypto",
   *  "Economía"). Google los da jerárquicos y sucios
   *  ("Business & Economics / Investments"): el adaptador los aplana. Default `[]`. */
  categories: string[];
  /** Etiquetas NUESTRAS (curaduría interna), NO del proveedor: "crypto",
   *  "trading-psicologia", "macro". Para colecciones/recomendación propia y para
   *  encajar libros en las verticales de Nidokey. Default `[]`. */
  tags: string[];

  // ── Señales / enlaces ──────────────────────────────────────────────────────
  /** Nota media (0–5) y nº de votos. Opcionales (no todas las fuentes los dan). */
  averageRating?: number | null;
  ratingsCount?: number | null;
  /** Portadas por tamaño (thumbnail / large). */
  imageUrls: BookImageUrls;
  /** URL pública del libro en la web del proveedor (para abrir en WebView). */
  detailUrl?: string | null;

  // ── Auditoría (la pone el backend al persistir) ────────────────────────────
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Crea un `Book` con DEFAULTS seguros para lista y detalle. Base de los
 *  adaptadores, tests y altas manuales. Lo único obligatorio es `id` + `source`;
 *  el resto se rellena vacío/null. (Recuerda dar `title`: la lista lo exige.) */
export function createBook(
  partial: Partial<Book> & Pick<Book, "id" | "source">,
): Book {
  return {
    externalIds: {},
    isbn10: null,
    isbn13: null,
    title: "",
    subtitle: null,
    authors: [],
    description: null,
    publisher: null,
    pageCount: null,
    language: null,
    regionHint: null,
    publishedDate: null,
    publishedYear: null,
    categories: [],
    tags: [],
    averageRating: null,
    ratingsCount: null,
    imageUrls: {},
    detailUrl: null,
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

/** Proyecta un `Book` a `BaseRecord` para reusar la lista/cabecera genéricas
 *  (records.ts). El `Book` completo viaja en `meta.book`; el detalle lo lee con
 *  `metaField(record, "book", …)`. Así LIBROS entra en la UI sin tocar pantallas. */
export function bookToRecord(book: Book): BaseRecord {
  const author = book.authors[0] ?? null;
  return {
    id: book.id,
    type: "book",
    title: book.title,
    subtitle: [author, book.publishedYear].filter(Boolean).join(" · ") || null,
    status: null,
    primaryValue:
      // > 0: un promedio 0 es "sin votos" (artefacto de OL), no una nota real —
      // pintar "★ 0.0" desprestigia el libro y el dato.
      book.averageRating != null && book.averageRating > 0
        ? `★ ${book.averageRating.toFixed(1)}`
        : null,
    imageUrl: book.imageUrls.thumbnail ?? book.imageUrls.large ?? null,
    createdAt: book.createdAt ?? null,
    updatedAt: book.updatedAt ?? null,
    meta: { book },
  };
}

// ── Adaptador: Google Books → Book ───────────────────────────────────────────
// Forma (parcial) de un "volume" de Google Books:
//   { id, volumeInfo:{ title, subtitle, authors[], publisher, publishedDate,
//     description, industryIdentifiers[{type,identifier}], pageCount, categories[],
//     averageRating, ratingsCount, language,
//     imageLinks{ smallThumbnail, thumbnail, small, medium, large, extraLarge },
//     infoLink, canonicalVolumeLink }, saleInfo:{ country } }

/** Mapea un volume de Google Books al modelo unificado. `any` a propósito: la
 *  respuesta cruda no la tipamos en el dominio (frontera con el proveedor). */
export function fromGoogleBooks(volume: any): Book {
  const v = volume?.volumeInfo ?? {};
  const ids: Array<{ type?: string; identifier?: string }> =
    v.industryIdentifiers ?? [];
  const img = v.imageLinks ?? {};

  return createBook({
    id: `gbooks:${volume?.id}`, // id interno determinista (UPSERT idempotente)
    source: "GOOGLE_BOOKS",
    externalIds: { googleVolumeId: volume?.id },
    isbn13: ids.find((i) => i.type === "ISBN_13")?.identifier ?? null,
    isbn10: ids.find((i) => i.type === "ISBN_10")?.identifier ?? null,
    title: v.title ?? "",
    subtitle: v.subtitle ?? null,
    authors: v.authors ?? [],
    description: stripHtml(v.description), // → texto plano
    publisher: v.publisher ?? null,
    pageCount: v.pageCount ?? null,
    language: v.language ?? null,
    regionHint: volume?.saleInfo?.country ?? null, // geo futura
    publishedDate: v.publishedDate ?? null,
    publishedYear: parseYear(v.publishedDate),
    categories: normalizeCategories(v.categories),
    tags: [], // curaduría nuestra, se rellena aparte
    averageRating: v.averageRating ?? null,
    ratingsCount: v.ratingsCount ?? null,
    imageUrls: {
      thumbnail: cleanGoogleImage(img.thumbnail ?? img.smallThumbnail),
      large: cleanGoogleImage(
        img.extraLarge ?? img.large ?? img.medium ?? img.small ?? img.thumbnail,
      ),
    },
    detailUrl: v.canonicalVolumeLink ?? v.infoLink ?? null,
  });
}

// ── helpers del adaptador ────────────────────────────────────────────────────
/** Fuerza https y quita `&edge=curl` (Google sirve http y un sufijo que rompe). */
function cleanGoogleImage(url?: string): string | null {
  if (!url) return null;
  return url.replace(/^http:/, "https:").replace(/&edge=curl/i, "");
}

/** Aplana y deduplica las categorías jerárquicas de Google
 *  ("Business & Economics / Investments" → ["Business & Economics","Investments"]). */
function normalizeCategories(raw?: string[]): string[] {
  if (!raw?.length) return [];
  const out = raw.flatMap((c) => c.split("/").map((s) => s.trim())).filter(Boolean);
  return Array.from(new Set(out));
}

/** "2017-03-15" | "2017-03" | "2017" → 2017 (o null). */
function parseYear(s?: string): number | null {
  const m = s?.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Quita etiquetas HTML de la sinopsis (Google la trae a veces con <p>, <br>…). */
function stripHtml(s?: string): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
}

// ── Adaptador: Open Library → Book ───────────────────────────────────────────
// Fuente KEYLESS (sin API key), fallback de Google Books. Doc de búsqueda de
// Open Library (search.json con `fields`):
//   { key:"/works/OL45804W", title, author_name[], first_publish_year, isbn[],
//     cover_i, language[], number_of_pages_median, ratings_average,
//     ratings_count, subject[], publisher[] }

/** Mapea un doc de búsqueda de Open Library al modelo unificado. La sinopsis NO
 *  viene en la búsqueda → `description` queda null (se enriquece en el fetch del
 *  work si se reimporta). Portadas vía covers.openlibrary.org. */
export function fromOpenLibrary(doc: any): Book {
  const workId = String(doc?.key ?? "").replace(/^\/works\//, "");
  const isbns: string[] = Array.isArray(doc?.isbn) ? doc.isbn : [];
  const coverId = doc?.cover_i;
  const year = typeof doc?.first_publish_year === "number" ? doc.first_publish_year : null;
  return createBook({
    id: workId ? `openlib:${workId}` : `openlib:${doc?.title ?? ""}`,
    source: "OPEN_LIBRARY",
    externalIds: workId ? { openLibraryWorkId: workId } : {},
    isbn13: isbns.find((x) => x.replace(/-/g, "").length === 13) ?? null,
    isbn10: isbns.find((x) => x.replace(/-/g, "").length === 10) ?? null,
    title: doc?.title ?? "",
    authors: Array.isArray(doc?.author_name) ? doc.author_name : [],
    publisher: Array.isArray(doc?.publisher) ? doc.publisher[0] ?? null : null,
    pageCount: typeof doc?.number_of_pages_median === "number" ? doc.number_of_pages_median : null,
    language: olLangTo639_1(Array.isArray(doc?.language) ? doc.language[0] : null),
    publishedDate: year != null ? String(year) : null,
    publishedYear: year,
    categories: Array.isArray(doc?.subject) ? doc.subject.slice(0, 6) : [],
    averageRating: typeof doc?.ratings_average === "number" ? round1(doc.ratings_average) : null,
    ratingsCount: typeof doc?.ratings_count === "number" ? doc.ratings_count : null,
    imageUrls: {
      thumbnail: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
      large: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    },
    detailUrl: workId ? `https://openlibrary.org/works/${workId}` : null,
  });
}

/** Open Library usa ISO 639-2/3 ("eng","spa"); el modelo guarda 639-1 ("en","es"). */
function olLangTo639_1(code: string | null | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    eng: "en", spa: "es", fre: "fr", fra: "fr", ger: "de", deu: "de",
    ita: "it", por: "pt", cat: "ca", dut: "nl", nld: "nl",
  };
  return map[code] ?? (code.length === 2 ? code : code.slice(0, 2));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
