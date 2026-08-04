import type { ListingStatus, OperationType } from "@prisma/client";
import { isReasonablePriceChange, isRentOperation } from "@nidokey/shared";
import type { ScrapeOutcome } from "./types";
import { isGoneStatus, nextListingStatus } from "./listing-status";

/**
 * DECISIÓN pura del recheck de un anuncio: qué escribir en BBDD, si hay
 * snapshot, qué columna del Property tocar, qué alerta evaluar y con qué
 * guard optimista. Sin prisma ni red → cubierta por recheck-plan.test.ts con
 * la secuencia determinista completa (bajada/subida/sin cambios/gone/reaparece,
 * venta Y alquiler).
 *
 * Decisiones de producto codificadas aquí (ver ADR en el grafo):
 *  - AUTORIDAD DE PRECIO multi-anuncio: "el último cambio OBSERVADO gana" por
 *    columna de operación (venta → currentPrice, alquiler → monthlyRent). El
 *    histórico completo por anuncio queda en PriceSnapshot.listingId, así que
 *    ningún dato se pierde aunque dos portales discrepen.
 *  - RENT_TO_OWN se sigue por su precio de VENTA (currentPrice), igual que en
 *    la importación; la renta de la opción se gestiona como campo de la ficha.
 *  - "gone" solo dispara alerta/aviso en la TRANSICIÓN a REMOVED: un anuncio
 *    ya retirado que sigue sin existir no re-notifica.
 *  - Un anuncio REMOVED que responde OK se REACTIVA (reaparición).
 */

export type ListingState = {
  id: string;
  propertyId: string;
  operationType: OperationType;
  status: ListingStatus;
  lastPrice: number | null;
};

export type RecheckSummary = {
  listingId: string;
  outcome: ScrapeOutcome["kind"];
  detail?: string;
  priceChanged?: boolean;
  previousPrice?: number | null;
  newPrice?: number | null;
};

export type RecheckPlan = {
  summary: RecheckSummary;
  /** Parche del Listing (siempre hay uno: como mínimo lastCheckedAt+resultado). */
  listingData: {
    status?: ListingStatus;
    lastPrice?: number;
    lastSeenAt?: Date;
    lastCheckedAt: Date;
    lastCheckResult: "ok" | "gone" | "blocked" | "error";
    lastCheckDetail: string | null;
  };
  /** Snapshot SOLO si hubo cambio real de precio (nunca duplicados). */
  snapshot: { price: number; status: ListingStatus; observedAt: Date } | null;
  /** Columna de precio del Property según la operación del anuncio. */
  propertyPatch: { currentPrice: number } | { monthlyRent: number } | null;
  alert: { field: "price" | "rent"; oldCents: number | null; newCents: number | null; status: string } | null;
  notify: { oldCents: number | null; newCents: number | null; status: string; isRent?: boolean } | null;
  /**
   * Guard optimista contra carreras: aplicar el cambio SOLO si Listing.lastPrice
   * sigue valiendo esto (null = era null). undefined = sin guard (no hay cambio
   * de precio que proteger).
   */
  guardPrevPrice: number | null | undefined;
  /** Evento RECHECK para ImportLog (cambio rechazado por cordura). */
  logEvent: { message: string; meta: Record<string, unknown> } | null;
};

export function planRecheck(listing: ListingState, outcome: ScrapeOutcome, now: Date = new Date()): RecheckPlan {
  const wasGone = isGoneStatus(listing.status);

  if (outcome.kind === "gone") {
    return {
      summary: { listingId: listing.id, outcome: "gone", detail: outcome.reason },
      listingData: {
        status: "REMOVED",
        lastCheckedAt: now,
        lastCheckResult: "gone",
        lastCheckDetail: outcome.reason,
      },
      snapshot: null,
      propertyPatch: null,
      // Solo la transición notifica; un REMOVED que sigue gone es silencio.
      alert: wasGone
        ? null
        : { field: "price", oldCents: listing.lastPrice, newCents: listing.lastPrice, status: "REMOVED" },
      notify: wasGone
        ? null
        : { oldCents: listing.lastPrice, newCents: listing.lastPrice, status: "REMOVED" },
      guardPrevPrice: undefined,
      logEvent: null,
    };
  }

  if (outcome.kind !== "ok") {
    const detail = outcome.kind === "blocked" ? outcome.reason : outcome.error;
    return {
      summary: { listingId: listing.id, outcome: outcome.kind, detail },
      listingData: {
        lastCheckedAt: now,
        lastCheckResult: outcome.kind,
        lastCheckDetail: detail,
      },
      snapshot: null,
      propertyPatch: null,
      alert: null,
      notify: null,
      guardPrevPrice: undefined,
      logEvent: null,
    };
  }

  const r = outcome.result;
  const previousPrice = listing.lastPrice;

  // Cambio sospechoso (>2x o <0.5x) → NO tocar precio ni snapshot; solo
  // registrar para revisión. El anuncio sigue vigilándose.
  const sanity = isReasonablePriceChange(previousPrice, r.price);
  if (!sanity.ok) {
    return {
      summary: {
        listingId: listing.id,
        outcome: "error",
        detail: sanity.reason,
        previousPrice,
        newPrice: r.price ?? null,
      },
      listingData: {
        lastCheckedAt: now,
        lastCheckResult: "error",
        lastCheckDetail: sanity.reason,
      },
      snapshot: null,
      propertyPatch: null,
      alert: null,
      notify: null,
      guardPrevPrice: undefined,
      logEvent: {
        message: `Re-check rechazado: ${sanity.reason}`,
        meta: { listingId: listing.id, scrapedPrice: r.price, previousPrice, portal: r.portal },
      },
    };
  }

  const priceChanged = r.price != null && r.price !== previousPrice;
  // La regla vive en listing-status.ts porque la comparte con la importación.
  // Aquí el estado de respaldo es el OBSERVADO en la página (`r.status`); el
  // import no observa ninguno y pasa el que ya tenía el anuncio.
  const newStatus: ListingStatus = nextListingStatus({
    priceChanged,
    previousPrice,
    newPrice: r.price ?? null,
    wasGone,
    fallbackStatus: r.status,
  });
  const isRent = isRentOperation(listing.operationType);

  return {
    summary: {
      listingId: listing.id,
      outcome: "ok",
      priceChanged,
      previousPrice,
      newPrice: r.price ?? previousPrice,
    },
    listingData: {
      status: newStatus,
      ...(r.price != null ? { lastPrice: r.price } : {}),
      lastSeenAt: r.observedAt,
      lastCheckedAt: now,
      lastCheckResult: "ok",
      lastCheckDetail: null,
    },
    snapshot: priceChanged ? { price: r.price!, status: newStatus, observedAt: r.observedAt } : null,
    propertyPatch: priceChanged
      ? isRent
        ? { monthlyRent: r.price! }
        : { currentPrice: r.price! }
      : null,
    alert: priceChanged
      ? { field: isRent ? "rent" : "price", oldCents: previousPrice, newCents: r.price!, status: newStatus }
      : null,
    notify: priceChanged
      ? { oldCents: previousPrice, newCents: r.price!, status: newStatus, isRent }
      : null,
    guardPrevPrice: priceChanged ? previousPrice : undefined,
    logEvent: null,
  };
}
