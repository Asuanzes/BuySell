/** Hosts de portales inmobiliarios soportados para importar por URL/compartir. */
export const PORTAL_HOSTS = [
  "fotocasa.", "pisos.com", "habitaclia.", "thinkspain.", "indomio.",
  "idealista.", "milanuncios.", "yaencontre.",
];

export function isPortalUrl(u: string): boolean {
  try {
    const hostname = new URL(u).hostname.toLowerCase();
    return PORTAL_HOSTS.some((h) => hostname.includes(h));
  } catch {
    return false;
  }
}

/**
 * Texto crudo de un share (expo-share-intent): `text` (p. ej. "Título … enlace")
 * o `webUrl`. Devuelve el TEXTO completo; la clasificación (inmueble por URL de
 * portal vs libro por isBookShareText) se hace fuera.
 *
 * Amazon: la app (y a veces la web) manda el título del libro en
 * `EXTRA_TITLE` → `meta.title`, y en `EXTRA_TEXT` SOLO la URL corta (amzn.eu/d/B0…).
 * Ese texto "solo URL" no es clasificable como libro (el ASIN B0… no es ISBN y el
 * slug ausente), así que perdíamos el libro sin error. Anteponemos `meta.title`
 * cuando existe y no está ya en el texto (el título del producto de Amazon suele
 * ser "Título · Autor", lo usaremos tal cual para buscar por título).
 */
export function extractSharedText(
  shareIntent:
    | { text?: string | null; webUrl?: string | null; meta?: { title?: unknown } | null }
    | null
    | undefined
): string | null {
  if (!shareIntent) return null;
  // expo-share-intent: texto plano en `text` (Amazon "Título … enlace") o un
  // enlace limpio en `webUrl`. Devolvemos lo que haya, recortado.
  const raw = shareIntent.text ?? shareIntent.webUrl ?? null;
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s.length) return null;
  // Amazon: título real del libro en EXTRA_TITLE mientras EXTRA_TEXT es solo URL.
  const title = typeof shareIntent.meta?.title === "string" ? shareIntent.meta.title.trim() : "";
  if (title && !s.toLowerCase().includes(title.toLowerCase())) {
    return `${title} ${s}`.trim();
  }
  return s;
}
