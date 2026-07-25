/**
 * Resetea por COMPLETO la caché de menús de los restaurantes de Google: borra las
 * líneas de carta guardadas (MenuItem/MenuCategory) y pone menuFetchedAt + menuSourceUrl
 * a NULL, dejándolos limpios para re-scrapearse con la cascada nueva (Crawl4AI + Groq →
 * Firecrawl de respaldo). Acotado a `source: "google"` → los menús del seed/manuales NO
 * se tocan. Idempotente y seguro de re-ejecutar.
 *
 * Antes de borrar imprime un diagnóstico de lo que había cacheado (nombre, ciudad, nº de
 * platos y la URL de origen), útil para entender por qué un sitio no saca carta.
 *
 * ⚠️ COSTE: al resetear, cada restaurante vuelve a la cola y su re-scrape gasta
 * saldo de Apify (actor de Glovo) y de Firecrawl. No es una operación gratuita.
 *
 * Uso: node --env-file=.env --import tsx scripts/reset-food-menus.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const google = await prisma.restaurant.findMany({
    where: { source: "google" },
    select: {
      id: true,
      name: true,
      city: true,
      menuFetchedAt: true,
      menuSourceUrl: true,
      _count: { select: { items: true } },
    },
  });
  const total = google.length;
  const attempted = google.filter((r) => r.menuFetchedAt != null).length;
  const withItems = google.filter((r) => r._count.items > 0);
  console.log(
    `[reset-food-menus] Restaurantes Google: ${total} (con intento/caché: ${attempted}, con platos guardados: ${withItems.length})`,
  );
  for (const r of withItems) {
    console.log(`  · ${r.name} (${r.city}) — ${r._count.items} platos · ${r.menuSourceUrl ?? "sin URL"}`);
  }

  const ids = google.map((r) => r.id);
  const delItems = await prisma.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
  const delCats = await prisma.menuCategory.deleteMany({ where: { restaurantId: { in: ids } } });
  const upd = await prisma.restaurant.updateMany({
    where: { source: "google" },
    data: { menuFetchedAt: null, menuSourceUrl: null },
  });
  console.log(
    `[reset-food-menus] Borrados ${delItems.count} platos y ${delCats.count} categorías; ` +
      `${upd.count} restaurantes reseteados → re-scrapearán al abrirlos/descubrirlos (Crawl4AI + Groq).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[reset-food-menus] error:", e);
    process.exit(1);
  });
