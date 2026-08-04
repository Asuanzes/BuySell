import { XMLParser } from "fast-xml-parser";

/**
 * Noticias por símbolo desde el RSS público de Yahoo Finanzas (gratis, sin clave
 * — la MISMA fuente que ya usamos para los precios de mercado). La región y el
 * idioma los decide quien llama, a partir del idioma del usuario: antes iban
 * fijos a `ES`/`es-ES`, así que un usuario con la app en inglés recibía
 * titulares en español. Algunos símbolos de nicho (ETFs poco cubiertos)
 * devuelven 0 noticias; es esperado, y en idiomas distintos del español la
 * cobertura de valores europeos pequeños es todavía más fina.
 *
 * El `<link>` apunta a un artículo alojado en Yahoo (es-us.finanzas.yahoo.com);
 * el medio original (Reuters, ElEconomista…) suele venir en el prefijo de la
 * `<description>`, que intentamos extraer best-effort.
 */
const FEED = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

// Throttle a nivel de módulo (1 proceso) para no apretar a Yahoo.
let lastCall = 0;
async function throttle(ms = 300): Promise<void> {
  const wait = lastCall + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export type NewsItem = {
  title: string;
  url: string;
  summary: string | null;
  source: string | null; // medio (best-effort)
  publishedAt: string | null; // ISO
  symbol: string; // símbolo del activo del que viene la noticia
};

/** Extrae el medio del prefijo de la descripción: "… (Reuters) - …". */
function sourceFromSummary(summary: string | null): string | null {
  if (!summary) return null;
  const m = summary.match(/\(([^)]{2,30})\)\s*[-–—]/);
  return m ? m[1].trim() : null;
}

export async function yahooNews(
  symbol: string,
  locale: { region: string; lang: string } = { region: "ES", lang: "es-ES" }
): Promise<NewsItem[]> {
  await throttle();
  const url =
    `${FEED}?s=${encodeURIComponent(symbol)}` +
    `&region=${encodeURIComponent(locale.region)}&lang=${encodeURIComponent(locale.lang)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let json: { rss?: { channel?: { item?: unknown } } };
  try {
    json = parser.parse(await res.text());
  } catch {
    return [];
  }

  const raw = json?.rss?.channel?.item;
  if (!raw) return [];
  const arr = (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];

  const out: NewsItem[] = [];
  for (const it of arr) {
    const title = typeof it.title === "string" ? it.title.trim() : null;
    const link = typeof it.link === "string" ? it.link : null;
    if (!title || !link) continue;
    const summary = typeof it.description === "string" ? it.description.trim() : null;
    const pubRaw = typeof it.pubDate === "string" ? it.pubDate : null;
    const pub = pubRaw ? new Date(pubRaw) : null;
    out.push({
      title,
      url: link,
      summary,
      source: sourceFromSummary(summary),
      publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : null,
      symbol,
    });
  }
  return out;
}
