import type { ListingStatus } from "@prisma/client";

/**
 * Estado en que queda un anuncio tras observarlo. Una sola definición.
 *
 * Vivía DUPLICADA: el mismo ternario de cuatro niveles estaba en
 * `src/lib/import-listing.ts` (cuando el usuario reimporta) y en
 * `src/features/scraping/recheck-plan.ts` (cuando lo recomprueba el cron). Sólo
 * una de las dos copias tenía pruebas, y la regla ya se había tenido que
 * arreglar una vez tras una revisión — el tipo de sitio donde el siguiente
 * arreglo llega a una copia y no a la otra.
 *
 * Las dos reglas que codifica no son evidentes:
 *
 *  - **El primer precio conocido es línea base, no una bajada.** Un anuncio con
 *    "precio a consultar" que por fin publica cifra salía etiquetado como
 *    PRICE_DROP, porque `previousPrice` era null y cualquier número es menor que
 *    nada. No es una bajada: es la primera vez que se sabe el precio.
 *
 *  - **Reaparecer reactiva.** Un anuncio dado por REMOVED o SOLD que vuelve a
 *    responder está vivo otra vez, así que se devuelve a ACTIVE en lugar de
 *    dejarlo enterrado — antes un REMOVED era irreversible.
 *
 * `fallbackStatus` es entrada EXPLÍCITA y no un detalle interno, porque las dos
 * llamadas difieren justo ahí y la diferencia es correcta: el recheck observa un
 * estado nuevo en la página y lo usa; la importación no observa ninguno, así que
 * conserva el que ya tenía el anuncio.
 */
export function nextListingStatus(input: {
  priceChanged: boolean;
  previousPrice: number | null;
  /** Precio observado ahora, en céntimos. Sólo se mira si `priceChanged`. */
  newPrice: number | null;
  /** El anuncio estaba dado por REMOVED o SOLD. */
  wasGone: boolean;
  /** Estado al que caer si no hay motivo para cambiarlo. */
  fallbackStatus: ListingStatus;
}): ListingStatus {
  const { priceChanged, previousPrice, newPrice, wasGone, fallbackStatus } = input;

  if (!priceChanged) return wasGone ? "ACTIVE" : fallbackStatus;
  // Primer precio conocido: ni bajada ni subida.
  if (previousPrice == null) return wasGone ? "ACTIVE" : fallbackStatus;
  return (newPrice ?? 0) < previousPrice ? "PRICE_DROP" : "PRICE_UP";
}

/** Un anuncio se considera desaparecido en estos dos estados. */
export function isGoneStatus(status: ListingStatus): boolean {
  return status === "REMOVED" || status === "SOLD";
}
