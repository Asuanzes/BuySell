import type { Portal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logImportEvent } from "@/lib/import-log";
import { priceChangeDir, trackEvent } from "@/lib/analytics-events";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { notifyLinkedConversations } from "@/lib/chat/context-events";
import type { PortalAdapter } from "./types";
import { planRecheck, type RecheckPlan, type RecheckSummary } from "./recheck-plan";
import { idealistaAdapter } from "./adapters/idealista";
import { fotocasaAdapter } from "./adapters/fotocasa";
import { pisosAdapter } from "./adapters/pisos";
import { milanunciosAdapter } from "./adapters/milanuncios";
import { habitacliaAdapter } from "./adapters/habitaclia";
import { yaencontreAdapter } from "./adapters/yaencontre";
import { thinkspainAdapter } from "./adapters/thinkspain";
import { indomioAdapter } from "./adapters/indomio";

const ADAPTERS: PortalAdapter[] = [
  idealistaAdapter,
  fotocasaAdapter,
  pisosAdapter,
  milanunciosAdapter,
  habitacliaAdapter,
  yaencontreAdapter,
  thinkspainAdapter,
  indomioAdapter,
];

export function pickAdapter(url: string): PortalAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

export type CheckSummary = RecheckSummary;

/** Ventana de vigilancia de anuncios REMOVED: si reaparecen dentro de estos
 *  días se reactivan solos; pasada la ventana dejan de comprobarse. */
const REMOVED_WATCH_DAYS = 45;

/**
 * Presupuesto de una pasada del cron.
 *
 * La ruta declara `maxDuration = 300` y el workflow llama con `--max-time 320`,
 * así que pasarse no degrada: Vercel mata la función a media petición y el job
 * sale en rojo. Antes el bucle recorría TODOS los anuncios sin tope, de modo que
 * el barrido completo dejaba de caber en cuanto el corpus creciera — a ~3 s por
 * anuncio (1 s de pausa + la descarga) el techo estaba alrededor de los 100.
 *
 * El presupuesto no se gasta hasta el final: antes de empezar cada anuncio se
 * reserva su PEOR coste posible (`WORST_CASE_ITEM_MS`), porque la ruta genérica
 * puede tardar ~50 s ella sola —15 s de `fetchPage` más 35 s del navegador— y
 * arrancar uno tarde dejaría la función muriendo a mitad. Con 280 s de
 * presupuesto y 55 s de reserva se deja de empezar a los 225 s: en el peor caso
 * se termina sobre los 280, y en el normal (~3 s por anuncio) da para el tope
 * de 80 sin agotar el reloj.
 */
const RUN_BUDGET_MS = 280_000;
const WORST_CASE_ITEM_MS = 55_000;
const MAX_PER_RUN = 80;

/**
 * Un anuncio comprobado hace menos de esto no se vuelve a tocar.
 *
 * Es la pieza que permite correr el cron varias veces al día SIN multiplicar las
 * descargas: las pasadas extra no repiten trabajo, sólo vacían la cola de lo que
 * no cupo — lo pendiente sigue rancio, así que entra en la pasada siguiente sin
 * necesidad de bajar este umbral.
 *
 * 22 h y no 24 para que un desfase de minutos no empuje una comprobación al día
 * siguiente, y no menos para no acortar la cadencia: cada hora que se le quita
 * son descargas de más contra portales que ya bloquean.
 */
const STALE_AFTER_HOURS = 22;

/**
 * A quién le toca recomprobación. Se extrae de la consulta porque un `AND` de
 * dos `OR` no falla ruidosamente cuando está mal montado: devuelve el conjunto
 * equivocado y nadie se entera — o se recomprueba todo cada dos horas, o no se
 * recomprueba nada nunca. Aquí se puede verificar su forma sin BBDD, igual que
 * `buildRentalWhere` en el buscador.
 *
 * Dos condiciones, ambas obligatorias:
 *  1. Vigilable: activo, o retirado hace poco (para detectar reapariciones).
 *  2. Rancio: nunca comprobado, o comprobado hace más de `staleAfterHours`.
 */
export function buildRecheckWhere(opts?: {
  staleAfterHours?: number;
  removedWatchDays?: number;
  now?: Date;
}): Prisma.ListingWhereInput {
  const now = opts?.now?.getTime() ?? Date.now();
  const staleAfterHours = opts?.staleAfterHours ?? STALE_AFTER_HOURS;
  const removedWatchDays = opts?.removedWatchDays ?? REMOVED_WATCH_DAYS;
  return {
    AND: [
      {
        OR: [
          { status: { in: ["ACTIVE", "PRICE_DROP", "PRICE_UP", "UNKNOWN"] } },
          {
            status: "REMOVED",
            lastSeenAt: { gte: new Date(now - removedWatchDays * 24 * 3600_000) },
          },
        ],
      },
      {
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: new Date(now - staleAfterHours * 3600_000) } },
        ],
      },
    ],
  };
}

/**
 * Re-check de un listing. La DECISIÓN vive en planRecheck (pura, testeada);
 * aquí solo se scrapea, se aplica el plan (transacción + guard optimista
 * contra carreras) y se disparan los efectos (alertas, hilos, log).
 */
export async function checkListing(listingId: string): Promise<CheckSummary> {
  const startedAt = Date.now();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error(`Listing ${listingId} no encontrado`);

  // F0 · métricas: tasa de éxito del recheck por portal (cron y manual). El
  // userId va null a propósito: es una métrica de pipeline, no de usuario.
  const track = (outcome: string, extra: Record<string, unknown> = {}) =>
    void trackEvent("listing_recheck", {
      userId: null,
      props: { listingId, portal: listing.portal, outcome, durationMs: Date.now() - startedAt, ...extra },
    });

  const adapter = pickAdapter(listing.url);
  if (!adapter) {
    await prisma.listing.update({
      where: { id: listingId },
      data: { lastCheckedAt: new Date(), lastCheckResult: "error", lastCheckDetail: "Sin adaptador" },
    });
    track("error", { detail: "Sin adaptador" });
    return { listingId, outcome: "error", detail: "Sin adaptador" };
  }

  if (adapter.manualOnly) {
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        lastCheckedAt: new Date(),
        lastCheckResult: "manual",
        lastCheckDetail: "Portal manual (anti-bot): re-importa desde la app para actualizar",
      },
    });
    track("blocked", { detail: "manual" });
    return { listingId, outcome: "blocked", detail: "Manual-only (anti-bot)" };
  }

  // El adaptador necesita el precio previo (filtra banners fuera de rango) y
  // la operación (banda de venta vs renta mensual).
  const outcome = await adapter.scrape(listing.url, {
    previousPriceCents: listing.lastPrice,
    operationType: listing.operationType,
  });

  const plan = planRecheck(listing, outcome);
  const applied = await applyRecheckPlan(listing.id, listing.propertyId, listing.portal, plan);

  if (!applied) {
    // Otra ejecución concurrente aplicó este mismo cambio primero: no hay
    // snapshot duplicado ni doble alerta. Solo tocamos la marca de comprobación.
    await prisma.listing.update({
      where: { id: listingId },
      data: { lastCheckedAt: new Date(), lastCheckResult: "ok", lastCheckDetail: null },
    });
    track("ok", { priceChanged: false, detail: "Cambio ya aplicado por otra ejecución" });
    return {
      listingId,
      outcome: "ok",
      priceChanged: false,
      detail: "Cambio ya aplicado por otra ejecución",
      previousPrice: listing.lastPrice,
      newPrice: listing.lastPrice,
    };
  }

  // Efectos secundarios FUERA de la transacción (nunca deben romper el recheck;
  // evaluateAlerts y notifyLinkedConversations ya no lanzan por diseño).
  if (plan.logEvent) {
    // F0 · métricas: cambio sospechoso rechazado por cordura (plan.logEvent
    // solo se marca en ese caso).
    const scraped = plan.logEvent.meta.scrapedPrice as number | null | undefined;
    const dir = priceChangeDir(listing.lastPrice, scraped ?? null);
    await trackEvent("listing_price_change", {
      userId: null,
      props: {
        portal: listing.portal,
        sanityRejected: true,
        direction: dir?.direction ?? null,
        pct: dir?.pct ?? null,
        ...plan.logEvent.meta,
      },
    });
    await logImportEvent("RECHECK", {
      propertyId: listing.propertyId,
      ok: false,
      message: plan.logEvent.message,
      meta: { ...plan.logEvent.meta, url: listing.url },
    });
  }
  if (plan.alert) {
    await evaluateAlerts("property", listing.propertyId, plan.alert.field, {
      oldCents: plan.alert.oldCents,
      newCents: plan.alert.newCents,
      status: plan.alert.status,
    });
  }
  if (plan.notify) {
    await notifyLinkedConversations("property", listing.propertyId, plan.notify);
  }

  track(plan.summary.outcome, { priceChanged: plan.summary.priceChanged ?? false });
  return plan.summary;
}

/**
 * Aplica el plan en BBDD. Con cambio de precio: transacción con guard
 * optimista (updateMany condicionado a lastPrice) — si otra ejecución ganó la
 * carrera, devuelve false y no se crea snapshot ni se toca el Property.
 */
async function applyRecheckPlan(
  listingId: string,
  propertyId: string,
  portal: Portal,
  plan: RecheckPlan
): Promise<boolean> {
  if (!plan.snapshot) {
    await prisma.listing.update({ where: { id: listingId }, data: plan.listingData });
    return true;
  }
  const applied = await prisma.$transaction(async (tx) => {
    const guarded =
      plan.guardPrevPrice !== undefined
        ? { id: listingId, lastPrice: plan.guardPrevPrice }
        : { id: listingId };
    const upd = await tx.listing.updateMany({ where: guarded, data: plan.listingData });
    if (upd.count === 0) return false;
    await tx.priceSnapshot.create({
      data: {
        listingId,
        propertyId,
        price: plan.snapshot!.price,
        status: plan.snapshot!.status,
        source: portal,
        observedAt: plan.snapshot!.observedAt,
      },
    });
    if (plan.propertyPatch) {
      await tx.property.update({ where: { id: propertyId }, data: plan.propertyPatch });
    }
    return true;
  });
  // F0 · métricas: cambio de precio REAL aplicado por el recheck.
  if (applied) {
    const dir = priceChangeDir(plan.guardPrevPrice ?? null, plan.snapshot.price);
    await trackEvent("listing_price_change", {
      userId: null,
      props: {
        portal,
        sanityRejected: false,
        direction: dir?.direction ?? null,
        pct: dir?.pct ?? null,
        listingId,
        previousPrice: plan.guardPrevPrice ?? null,
        newPrice: plan.snapshot.price,
      },
    });
  }
  return applied;
}

/**
 * Recorre todos los listings vigilables y los re-comprueba:
 *  - activos (ACTIVE, PRICE_DROP, PRICE_UP, UNKNOWN), y
 *  - REMOVED recientes (vistos en los últimos REMOVED_WATCH_DAYS días), para
 *    detectar reapariciones — antes un REMOVED era irreversible.
 */
export async function checkAllActiveListings(opts?: {
  onProgress?: (idx: number, total: number, summary: CheckSummary) => void;
  /** Tope de anuncios de esta pasada. Ver `MAX_PER_RUN`. */
  limit?: number;
  /** Presupuesto de tiempo en ms. Ver `RUN_BUDGET_MS`. */
  budgetMs?: number;
  /** Horas tras las que un anuncio vuelve a considerarse comprobable. */
  staleAfterHours?: number;
}): Promise<{
  total: number;
  results: CheckSummary[];
  /** Se acabó el tiempo o el tope con anuncios aún por comprobar. */
  stoppedEarly: boolean;
  /** Cuántos quedaron sin tocar en esta pasada. */
  pending: number;
}> {
  const limit = opts?.limit ?? MAX_PER_RUN;
  const budgetMs = opts?.budgetMs ?? RUN_BUDGET_MS;
  const staleAfterHours = opts?.staleAfterHours ?? STALE_AFTER_HOURS;
  const startedAt = Date.now();

  const listings = await prisma.listing.findMany({
    where: buildRecheckWhere({ staleAfterHours }),
    select: { id: true, url: true },
    // Los más rancios primero: así la cola rota sola y nadie se queda atrás
    // indefinidamente aunque no dé tiempo a todos en una pasada.
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });

  /**
   * Desde que `Listing` es único por `[url, ownerId]`, varios usuarios pueden
   * seguir el MISMO anuncio, y este bucle scrapea una vez por fila: N seguidores
   * = N descargas de la misma página, con lo que eso implica en portales que ya
   * bloquean. Agrupar por URL es la solución, pero es cirugía en el cron y hoy no
   * ahorraría nada (cero URLs repetidas). Se instrumenta para que el día que
   * empiece a doler se vea en el log en vez de descubrirlo por un bloqueo.
   */
  const distinctUrls = new Set(listings.map((l) => l.url)).size;
  if (distinctUrls < listings.length) {
    console.warn(
      `[recheck] ${listings.length} anuncios sobre ${distinctUrls} URLs distintas: ` +
        `${listings.length - distinctUrls} descargas repetidas. Toca agrupar por URL.`
    );
  }
  const results: CheckSummary[] = [];
  let i = 0;
  let stoppedEarly = false;
  for (const { id } of listings) {
    /**
     * Corte por TIEMPO, no sólo por número. Y reservando el peor caso ANTES de
     * empezar otro anuncio, no sólo mirando el reloj: la ruta genérica puede
     * costar ~50 s ella sola (15 s de `fetchPage` + 35 s de `browserFetchPage`),
     * así que arrancar uno a los 239 s lo dejaría terminando cerca del
     * `maxDuration` de 300 (objeción de Codex).
     *
     * Importa porque la escritura del anuncio es atómica pero sus efectos —
     * alertas y avisos a las conversaciones — van DESPUÉS y fuera de la
     * transacción. Si Vercel mata la función justo ahí, el precio queda escrito
     * sin su alerta y, como `lastCheckedAt` ya se actualizó, la siguiente pasada
     * no lo reintenta: la notificación se pierde en silencio. Mejor dejar de
     * empezar antes que arriesgarse a morir a mitad.
     */
    if (Date.now() - startedAt > budgetMs - WORST_CASE_ITEM_MS) {
      stoppedEarly = true;
      break;
    }
    let summary: CheckSummary;
    try {
      summary = await checkListing(id);
    } catch (err) {
      summary = { listingId: id, outcome: "error", detail: (err as Error).message };
      /**
       * Sellar el intento aunque haya reventado. Sin esto, un anuncio cuyo
       * scrape LANZA (en vez de devolver un resultado de error) nunca ve
       * actualizado su `lastCheckedAt`, así que vuelve a encabezar la cola en
       * cada pasada —va ordenada por el más rancio— y se come un hueco cada dos
       * horas para siempre. Un anuncio envenenado no puede monopolizar el cupo.
       */
      await prisma.listing
        .update({
          where: { id },
          data: {
            lastCheckedAt: new Date(),
            lastCheckResult: "error",
            lastCheckDetail: String((err as Error).message ?? "").slice(0, 300),
          },
        })
        .catch(() => {
          /* si ni esto se puede escribir, la BBDD tiene un problema mayor */
        });
    }
    results.push(summary);
    i++;
    opts?.onProgress?.(i, listings.length, summary);
    // Pequeña pausa para no martillear los portales
    await new Promise((r) => setTimeout(r, 1000));
  }

  /**
   * Cuántos quedan DE VERDAD esperando, no cuántos sobraron de esta página.
   * `listings.length - results.length` daría 0 cuando el `take` llena el cupo,
   * aunque hubiera 400 detrás — una falsa tranquilidad justo en el momento en
   * que hace falta enterarse (objeción de Codex). Una `count` por pasada es
   * gratis al lado de las descargas.
   */
  const elegibles = await prisma.listing.count({ where: buildRecheckWhere({ staleAfterHours }) });
  const pending = Math.max(0, elegibles - results.length);
  const hitCap = listings.length === limit;
  if (stoppedEarly || hitCap || pending > 0) {
    console.warn(
      `[recheck] pasada incompleta: ${results.length} comprobados, ${pending} pendientes` +
        (stoppedEarly ? " · cortada por tiempo" : "") +
        (hitCap ? ` · tope de ${limit} por pasada` : "")
    );
  }
  return { total: listings.length, results, stoppedEarly, pending };
}
