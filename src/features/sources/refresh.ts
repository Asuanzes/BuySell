import { prisma } from "@/lib/db";
import type { RecordType } from "@nidokey/shared";
import { marketData, type CoinMarket } from "@/features/sources/adapters/coingecko";
import { yahooQuote } from "@/features/sources/providers/yahoo";
import { logImportEvent } from "@/lib/import-log";
import { evaluateAlerts } from "@/lib/alerts/evaluate";

/**
 * Ids de registros de este tipo que tienen alguna alerta activa. UNA consulta
 * por ejecución del cron en vez de una por registro: con nadie usando alertas,
 * el coste añadido al refresco es una sola query.
 */
async function recordsWithAlerts(recordType: RecordType): Promise<Set<string>> {
  const rows = await prisma.priceAlert.findMany({
    where: { recordType, active: true },
    select: { recordId: true },
    distinct: ["recordId"],
  });
  return new Set(rows.map((r) => r.recordId));
}

/**
 * Refresh por tipo. Generaliza checkAllActiveListings: actualiza el valor de
 * los registros y escribe un *Snapshot solo si cambia.
 *
 * Cripto/mercados usan BATCH (una llamada cubre todas las posiciones) → cabe en
 * los ~60 s de Vercel Hobby y no agota la free tier. Los tipos de scraping
 * (property…) se ejecutarán vía GitHub Actions en fases posteriores.
 */
export type RefreshSummary = {
  type: RecordType;
  checked: number;
  updated: number;
  errors: number;
};

export async function refreshType(type: RecordType): Promise<RefreshSummary> {
  if (type === "crypto") return refreshCrypto();
  if (type === "market") return refreshMarket();
  return { type, checked: 0, updated: 0, errors: 0 };
}

async function refreshCrypto(): Promise<RefreshSummary> {
  const holdings = await prisma.cryptoHolding.findMany({
    where: { source: "coingecko", externalId: { not: null } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
  });
  if (holdings.length === 0) {
    return { type: "crypto", checked: 0, updated: 0, errors: 0 };
  }

  // Agrupar por moneda de cotización → una llamada batch por grupo.
  const byQuote = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const q = (h.quoteCurrency || "EUR").toUpperCase();
    const arr = byQuote.get(q);
    if (arr) arr.push(h);
    else byQuote.set(q, [h]);
  }

  let checked = 0;
  let updated = 0;
  let errors = 0;
  const now = new Date();
  const alerted = await recordsWithAlerts("crypto");

  for (const [quote, group] of byQuote) {
    const ids = [...new Set(group.map((h) => h.externalId!).filter(Boolean))];
    let md: Record<string, CoinMarket> = {};
    try {
      md = await marketData(ids, quote);
    } catch {
      errors += group.length;
      continue;
    }
    for (const h of group) {
      checked++;
      const m = md[h.externalId!];
      if (!m) continue;
      const cents = m.priceCents;
      const changed = cents !== h.currentValue;
      await prisma.cryptoHolding.update({
        where: { id: h.id },
        data: {
          currentValue: cents,
          lastCheckedAt: now,
          // refresca siempre %24h/volumen/sparkline (cambian aunque el precio no)
          meta: {
            ...((h.meta as Record<string, unknown>) ?? {}),
            change24h: m.change24h,
            volume: m.volume,
            marketCap: m.marketCap,
            sparkline: m.sparkline,
          },
          ...(changed
            ? { snapshots: { create: [{ value: cents, source: "coingecko", observedAt: now }] } }
            : {}),
        },
      });
      if (changed) {
        updated++;
        if (alerted.has(h.id)) {
          await evaluateAlerts("crypto", h.id, "price", { oldCents: h.currentValue, newCents: cents });
        }
      }
    }
  }

  const summary = { type: "crypto" as const, checked, updated, errors };
  await logImportEvent("RECHECK", {
    ok: errors === 0,
    message: `crypto refresh: ${updated}/${checked} actualizados`,
    meta: summary,
  });
  return summary;
}

/**
 * Refresh de mercados (Yahoo Finance, no oficial). Una llamada por símbolo trae
 * precio, %día, volumen y serie → iteramos con el throttle del provider (sin
 * cuota dura, pero educados para evitar 429). Refrescamos también el sparkline
 * porque ya viene en la misma llamada. `take` acota por ejecución.
 */
async function refreshMarket(): Promise<RefreshSummary> {
  const instruments = await prisma.marketInstrument.findMany({
    where: { source: "yahoo", externalId: { not: null } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: 20,
  });

  let checked = 0;
  let updated = 0;
  let errors = 0;
  const now = new Date();
  const alerted = await recordsWithAlerts("market");

  for (const inst of instruments) {
    checked++;
    try {
      const q = await yahooQuote(inst.symbol);
      if (!q) {
        errors++;
        continue;
      }
      const cents = Math.round(q.price * 100);
      if (!Number.isFinite(cents)) {
        errors++;
        continue;
      }
      const changed = cents !== inst.currentValue;
      await prisma.marketInstrument.update({
        where: { id: inst.id },
        data: {
          currentValue: cents,
          lastCheckedAt: now,
          meta: {
            ...((inst.meta as Record<string, unknown>) ?? {}),
            change24h: q.changePercent,
            volume: q.volume,
            sparkline: q.sparkline,
          },
          ...(changed
            ? { snapshots: { create: [{ value: cents, source: "yahoo", observedAt: now }] } }
            : {}),
        },
      });
      if (changed) {
        updated++;
        if (alerted.has(inst.id)) {
          await evaluateAlerts("market", inst.id, "price", { oldCents: inst.currentValue, newCents: cents });
        }
      }
    } catch {
      errors++;
    }
  }

  const summary = { type: "market" as const, checked, updated, errors };
  await logImportEvent("RECHECK", {
    ok: errors === 0,
    message: `market refresh: ${updated}/${checked} actualizados`,
    meta: summary,
  });
  return summary;
}
