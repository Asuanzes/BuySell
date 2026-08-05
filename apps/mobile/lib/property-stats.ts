import type { PriceHistoryPoint } from "@/lib/records/property";

/**
 * Cómputo de la variación de precio de una ficha a partir de su histórico
 * (`PriceSnapshot`). PURA (sin red ni UI) para poder testearla.
 *
 * La ficha puede ser MIXTA (venta + alquiler): la serie se filtra por el campo
 * de operación — "rent" → snapshots de anuncios RENT/RENT_TO_OWN; "price" →
 * snapshots de anuncios SALE (o legado sin listing, que era venta).
 */

export type PriceVariation = {
  direction: "drop" | "up" | "flat";
  /** Variación % entera (redondeada) entre el último y el penúltimo punto. */
  pct: number;
  deltaCents: number;
  /** Cambio en céntimos en los últimos 31 días, si hay un punto en esa ventana. */
  thisMonthCents: number | null;
  /** Nº de cambios de precio distintos (consecutivos) en la serie. */
  changeCount: number;
};

/** Serie de precio (céntimos) que corresponde al campo de la ficha. */
export function priceSeriesForField(
  history: Pick<PriceHistoryPoint, "price" | "observedAt" | "listing">[],
  field: "price" | "rent"
): { price: number; observedAt: string }[] {
  return history
    .filter((h) => {
      const op = h.listing?.operationType ?? "SALE"; // legado sin listing → venta
      return field === "rent" ? op !== "SALE" : op === "SALE";
    })
    .map((h) => ({ price: h.price, observedAt: h.observedAt }));
}

export function computePriceVariation(
  series: { price: number; observedAt: string }[],
  opts?: { now?: number }
): PriceVariation | null {
  if (series.length < 2) return null;
  const now = opts?.now ?? Date.now();
  const sorted = [...series].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const prev = sorted[sorted.length - 2].price;
  const last = sorted[sorted.length - 1].price;
  if (prev <= 0 || last <= 0) return null;

  const deltaCents = last - prev;
  const pct = Math.round((deltaCents / prev) * 100);
  const direction: PriceVariation["direction"] =
    deltaCents < 0 ? "drop" : deltaCents > 0 ? "up" : "flat";

  const monthAgo = now - 31 * 24 * 3600 * 1000;
  let thisMonthCents: number | null = null;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (Date.parse(sorted[i].observedAt) >= monthAgo) {
      thisMonthCents = last - sorted[i].price;
      break;
    }
  }

  let changeCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].price !== sorted[i - 1].price) changeCount++;
  }

  return { direction, pct, deltaCents, thisMonthCents, changeCount };
}
