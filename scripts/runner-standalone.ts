/**
 * Entry del runner autónomo del VPS (F1 · parte 2).
 *
 * Ejecuta `checkAllActiveListings` directamente contra Neon (sin pasar por
 * Vercel ni por el tope de 300 s de una función). Se compila a un único
 * archivo con `npm run build:runner` (`dist/runner.cjs`) y se programa con un
 * timer de systemd (ver `gateway/nidokey-runner.{service,timer}` y
 * `docs/DEPLOY-RUNNER.md`).
 *
 * Entorno (via /etc/nidokey-runner.env):
 *   DATABASE_URL               (Neon, pooled) — obligatoria para Prisma
 *   SCRAPER_URL / SCRAPER_TOKEN del sidecar local (default 127.0.0.1:4201)
 *   RUNNER_MAX_PER_RUN         anuncios por pasada (0 = sin tope; default 80)
 *   RUNNER_BUDGET_MS           presupuesto en ms (0 = sin tope; default 280s)
 *   RUNNER_STALE_AFTER_HOURS   ranciedad del anuncio (default 22)
 *   RUNNER_LOCK_FILE           dónde crear el lock (default /tmp/nidokey-runner.lock)
 *   RUNNER_LOCK_STALE_MS       antigüedad que invalida un lock huérfano (default 6 h)
 *
 * Lock: evita dos pasadas solapadas (un timer + un manual). Si un proceso
 * anterior murió sin limpiarlo, el lock se considera huérfano pasado el umbral
 * y se reaprovecha.
 */
import { open, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkAllActiveListings } from "../src/features/scraping/runner";

const LOCK_FILE = process.env.RUNNER_LOCK_FILE ?? "/tmp/nidokey-runner.lock";
const LOCK_STALE_MS = Number(process.env.RUNNER_LOCK_STALE_MS ?? 6 * 3600_000);

async function acquireLock(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(LOCK_FILE, "wx");
      await fh.writeFile(String(process.pid));
      await fh.close();
      return true;
    } catch {
      // Ya existe: ¿es de una pasada viva o un huérfano?
      try {
        const st = await stat(LOCK_FILE);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          console.warn(`[runner] Lock huérfano (>${LOCK_STALE_MS} ms): lo elimino y reintento.`);
          await unlink(LOCK_FILE);
          continue;
        }
      } catch {
        // El fichero desapareció entre medias: reintentamos.
        continue;
      }
      return false;
    }
  }
  return false;
}

async function releaseLock(): Promise<void> {
  try {
    await unlink(LOCK_FILE);
  } catch {
    /* si ya no existe, mejor */
  }
}

const ICON: Record<string, string> = {
  ok: "✓",
  gone: "✗",
  blocked: "⊘",
  error: "!",
};

async function main(): Promise<void> {
  if (!(await acquireLock())) {
    console.log("[runner] Otra pasada en marcha (lock presente). Salgo sin tocar nada.");
    return;
  }
  const t0 = Date.now();
  console.log(`[runner] Pasada iniciada ${new Date(t0).toISOString()}`);
  try {
    const { total, results, stoppedEarly, pending } = await checkAllActiveListings({
      onProgress: (idx, total, s) => {
        const ic = ICON[s.outcome] ?? "?";
        const detail = s.outcome === "ok" && s.priceChanged ? `cambio ${(s.previousPrice ?? 0) / 100}€ → ${(s.newPrice ?? 0) / 100}€` : (s.detail ?? "");
        console.log(`[runner] [${idx}/${total}] ${ic} ${s.outcome} ${s.listingId} ${detail}`.trimEnd());
      },
    });
    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {});
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const resumen = {
      comprobados: results.length,
      deUnTotal: total,
      porOutcome: counts,
      segundos: Number(dt),
      stoppedEarly,
      pendientes: pending,
    };
    console.log(`[runner] RESUMEN ${JSON.stringify(resumen)}`);
    // Código de salida: 0 aunque haya pendientes (es normal en un lote); 1 si
    // la pasada reventó del todo. Si la BBDD está caída, checkAllActiveListings
    // lanzará y saldremos con error → journald lo marca.
  } finally {
    await releaseLock();
  }
}

main().catch((e) => {
  console.error("[runner] Error fatal:", e instanceof Error ? e.stack ?? e.message : e);
  process.exitCode = 1;
});
