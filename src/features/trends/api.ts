import type { Prisma, Trend, TrendSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { trendNews } from "@/features/trends/news";
import type { TrendDTO } from "@/features/trends/types";

export const TREND_SOURCE_VALUES = [
  "twitter",
  "reddit",
  "linkedin",
  "xiaohongshu",
  "xueqiu",
  "instagram",
  "tiktok",
  "youtube",
  "googletrends",
  "hackernews",
  "twitch",
] as const satisfies readonly TrendSource[];

export type TrendDbRead = {
  trend: {
    findMany(args: any): Promise<Trend[]>;
    findUnique(args: any): Promise<Trend | null>;
  };
};

export function isTrendSource(value: string): value is TrendSource {
  return (TREND_SOURCE_VALUES as readonly string[]).includes(value);
}

export function parseLimit(raw: string | null, def: number, max: number): number | null {
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, max);
}

export function trendToDTO(t: Trend): TrendDTO {
  return {
    id: t.id,
    name: t.name,
    source: t.source,
    query: t.query,
    locale: t.locale,
    rank: t.rank,
    volume: t.volume,
    url: t.url,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTrends(params: URLSearchParams, db: TrendDbRead = prisma) {
  const limit = parseLimit(params.get("limit"), 30, 100);
  if (!limit) return { status: 400 as const, body: { error: "limit inválido" } };

  const source = params.get("source") ?? "all";
  if (source !== "all" && !isTrendSource(source)) {
    return { status: 400 as const, body: { error: "source inválido" } };
  }
  const locale = (params.get("locale") ?? "ES").toUpperCase();
  const cursor = params.get("cursor");

  const where: Prisma.TrendWhereInput = {
    locale,
    ...(source !== "all" ? { source } : {}),
  };
  const rows = await db.trend.findMany({
    where,
    orderBy: [{ rank: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit).map(trendToDTO);
  return {
    status: 200 as const,
    body: { items, nextCursor: rows.length > limit ? rows[limit].id : null },
  };
}

export async function getTrend(id: string, db: TrendDbRead = prisma) {
  const trend = await db.trend.findUnique({ where: { id } });
  if (!trend) return { status: 404 as const, body: { error: "Tendencia no encontrada" } };
  return { status: 200 as const, body: trendToDTO(trend) };
}

export async function getTrendRelatedNews(
  id: string,
  params: URLSearchParams,
  opts: {
    db?: TrendDbRead;
    news?: typeof trendNews;
    /** Idioma/región del feed; sin él, Google News devuelve siempre español. */
    locale?: { hl: string; gl: string; ceid: string };
  } = {},
) {
  const db = opts.db ?? prisma;
  const news = opts.news ?? trendNews;
  // Tope duro a 7: son las noticias que entran en la pantalla de detalle sin
  // hacer scroll. default y máx = 7 (ignora ?limit mayor del cliente).
  const limit = parseLimit(params.get("limit"), 7, 7);
  if (!limit) return { status: 400 as const, body: { error: "limit inválido" } };
  const offsetRaw = params.get("cursor");
  const offset = offsetRaw ? Number(offsetRaw) : 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return { status: 400 as const, body: { error: "cursor inválido" } };
  }

  const trend = await db.trend.findUnique({ where: { id } });
  if (!trend) return { status: 404 as const, body: { error: "Tendencia no encontrada" } };

  const items = await news(trend.query || trend.name, {
    limit: offset + limit + 1,
    locale: opts.locale,
  });
  const slice = items.slice(offset, offset + limit);
  return {
    status: 200 as const,
    body: { items: slice, nextCursor: items.length > offset + limit ? String(offset + limit) : null },
  };
}
