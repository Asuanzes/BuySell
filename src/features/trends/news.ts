import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "@/features/sources/providers/yahoo-news";

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; items: NewsItem[] }>();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sourceFromItem(item: Record<string, unknown>): string | null {
  const source = item.source;
  if (typeof source === "string") return source.trim() || null;
  if (source && typeof source === "object") {
    const text = (source as Record<string, unknown>)["#text"];
    if (typeof text === "string") return text.trim() || null;
  }
  return null;
}

function asItems(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
}

export async function trendNews(
  query: string,
  opts: {
    limit?: number;
    /** Idioma y región del feed. Antes iban fijos a España para todo el mundo. */
    locale?: { hl: string; gl: string; ceid: string };
  } = {}
): Promise<NewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  const locale = opts.locale ?? { hl: "es-ES", gl: "ES", ceid: "ES:es" };
  // El idioma forma parte de la clave: si no, la primera consulta en español
  // serviría titulares en español a quien tenga la app en inglés hasta que
  // caducara la caché.
  const key = `${locale.hl}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items.slice(0, opts.limit ?? hit.items.length);

  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}` +
    `&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}` +
    `&ceid=${encodeURIComponent(locale.ceid)}`;
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

  const items: NewsItem[] = [];
  for (const it of asItems(json?.rss?.channel?.item)) {
    const title = typeof it.title === "string" ? it.title.trim() : null;
    const link = typeof it.link === "string" ? it.link.trim() : null;
    if (!title || !link) continue;
    const summary = typeof it.description === "string" ? stripTags(it.description) : null;
    const pubRaw = typeof it.pubDate === "string" ? it.pubDate : null;
    const pub = pubRaw ? new Date(pubRaw) : null;
    items.push({
      title,
      url: link,
      summary,
      source: sourceFromItem(it),
      publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : null,
      symbol: q,
    });
  }

  const sorted = items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  cache.set(key, { at: Date.now(), items: sorted });
  return sorted.slice(0, opts.limit ?? sorted.length);
}

