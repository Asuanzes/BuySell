/**
 * Script CLI (solo lectura): métricas F0 del scraping de inmuebles.
 *
 * Imprime la query de referencia de docs/ANALITICA.md §"Métricas operativas
 * del scraping de inmuebles (F0)": tasa de éxito del recheck por portal.
 *
 * Uso: npm run f0-metrics
 */
import { prisma } from "../src/lib/db";

async function main() {
  console.log("F0 · listing_recheck (14 días) — tasa de éxito por portal\n");

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT "props" ->> 'portal' AS portal,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'ok') AS ok,
           ROUND(100.0 * COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'ok') / NULLIF(COUNT(*), 0), 1) AS ok_pct,
           COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'blocked') AS blocked,
           COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'gone') AS gone,
           COUNT(*) FILTER (WHERE "props" ->> 'outcome' = 'error') AS errores
    FROM "AnalyticsEvent"
    WHERE name = 'listing_recheck' AND "createdAt" > now() - interval '14 days'
    GROUP BY 1 ORDER BY total DESC
  `);

  if (rows.length === 0) {
    console.log("  (sin eventos listing_recheck en los últimos 14 días)");
  } else {
    console.table(rows);
  }

  // Últimos 10 eventos del tipo, para ver de dónde vienen y con qué outcome.
  console.log("\nÚltimos 10 listing_recheck:\n");
  const recent = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT "createdAt" AS ts, "props" ->> 'portal' AS portal,
           "props" ->> 'outcome' AS outcome,
           "props" ->> 'durationMs' AS durationMs,
           "props" ->> 'listingId' AS listingId
    FROM "AnalyticsEvent"
    WHERE name = 'listing_recheck'
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);
  if (recent.length === 0) {
    console.log("  (ninguno en toda la tabla)");
  } else {
    console.table(recent);
  }

  // Totales absolutos para orientar (¿hay evento alguno en la tabla?).
  const totalEvents = await prisma.analyticsEvent.count();
  const perName = await prisma.analyticsEvent.groupBy({
    by: ["name"],
    _count: { _all: true },
    orderBy: { _count: { name: "desc" } },
    take: 15,
  });
  console.log(`\nTotal de eventos en AnalyticsEvent: ${totalEvents}`);
  console.table(perName.map((r) => ({ name: r.name, n: r._count._all })));
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
