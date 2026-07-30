import type { Portal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logImportEvent } from "@/lib/import-log";
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
 * Re-check de un listing. La DECISIÓN vive en planRecheck (pura, testeada);
 * aquí solo se scrapea, se aplica el plan (transacción + guard optimista
 * contra carreras) y se disparan los efectos (alertas, hilos, log).
 */
export async function checkListing(listingId: string): Promise<CheckSummary> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error(`Listing ${listingId} no encontrado`);

  const adapter = pickAdapter(listing.url);
  if (!adapter) {
    await prisma.listing.update({
      where: { id: listingId },
      data: { lastCheckedAt: new Date(), lastCheckResult: "error", lastCheckDetail: "Sin adaptador" },
    });
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
  return prisma.$transaction(async (tx) => {
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
}

/**
 * Recorre todos los listings vigilables y los re-comprueba:
 *  - activos (ACTIVE, PRICE_DROP, PRICE_UP, UNKNOWN), y
 *  - REMOVED recientes (vistos en los últimos REMOVED_WATCH_DAYS días), para
 *    detectar reapariciones — antes un REMOVED era irreversible.
 */
export async function checkAllActiveListings(opts?: {
  onProgress?: (idx: number, total: number, summary: CheckSummary) => void;
}): Promise<{ total: number; results: CheckSummary[] }> {
  const removedCutoff = new Date(Date.now() - REMOVED_WATCH_DAYS * 24 * 3600_000);
  const listings = await prisma.listing.findMany({
    where: {
      OR: [
        { status: { in: ["ACTIVE", "PRICE_DROP", "PRICE_UP", "UNKNOWN"] } },
        { status: "REMOVED", lastSeenAt: { gte: removedCutoff } },
      ],
    },
    select: { id: true },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
  });
  const results: CheckSummary[] = [];
  let i = 0;
  for (const { id } of listings) {
    let summary: CheckSummary;
    try {
      summary = await checkListing(id);
    } catch (err) {
      summary = { listingId: id, outcome: "error", detail: (err as Error).message };
    }
    results.push(summary);
    i++;
    opts?.onProgress?.(i, listings.length, summary);
    // Pequeña pausa para no martillear los portales
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { total: listings.length, results };
}
