/**
 * Script CLI: vuelve a comprobar todos los listings activos.
 * Uso: npm run check-listings
 *
 * Pensado para programarse en Task Scheduler (Windows) o cron (Linux).
 */
import { checkAllActiveListings } from "../src/features/scraping/runner";

const ICON: Record<string, string> = {
  ok: "✓",
  gone: "✗",
  blocked: "⊘",
  error: "!",
};

async function main() {
  console.log("Re-check de listings activos…\n");
  const t0 = Date.now();
  // `total` es el tamaño del LOTE de esta pasada, no el total elegible: el
  // runner procesa por lotes acotados y `pending` dice cuántos quedan detrás.
  const { total, results, pending } = await checkAllActiveListings({
    onProgress: (idx, total, s) => {
      const ic = ICON[s.outcome] ?? "?";
      const detail =
        s.outcome === "ok" && s.priceChanged
          ? `${(s.previousPrice ?? 0) / 100}€ → ${(s.newPrice ?? 0) / 100}€`
          : s.detail ?? "sin cambios";
      console.log(`  [${idx}/${total}] ${ic} ${s.listingId}  ${detail}`);
    },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const priceDrops = results.filter((r) => r.outcome === "ok" && r.priceChanged).length;

  console.log("\nResumen:");
  console.log(
    `  Lote: ${total}  ·  Pendientes: ${pending}  ·  Tiempo: ${dt}s` +
      (pending > 0 ? "  (vuelve a ejecutarlo para seguir)" : "")
  );
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`  Precios cambiados: ${priceDrops}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
