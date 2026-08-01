/**
 * Estado del cliente durante una búsqueda en streaming: un reductor PURO de
 * eventos a lo que se pinta en pantalla.
 *
 * Está aquí, y no dentro de la pantalla del móvil, porque es donde vive la
 * tolerancia a una red real: eventos que llegan tarde, repetidos, o un stream
 * que se corta y se reanuda. Esa lógica es la que hay que poder probar; el
 * componente solo pinta el resultado.
 *
 * Reglas:
 *   - `seq` manda. Un evento con seq ya visto se ignora, venga como venga.
 *   - Las ofertas se indexan por `candidateKey`: reconectar y recibir de nuevo
 *     una oferta la ACTUALIZA, no la duplica.
 *   - Un `searchId` distinto es una búsqueda nueva: se empieza de cero en vez de
 *     mezclar resultados de dos búsquedas.
 */
import type { NormalizedOffer, SearchProgressEvent, SearchRankings } from "./flights";

export type SearchPhase =
  | "idle"
  | "planning"
  | "scanning"
  | "verifying"
  | "completed"
  | "partial"
  | "failed";

export type SearchProgressState = {
  searchId: string | null;
  phase: SearchPhase;
  /** Último `seq` aplicado. Todo lo que venga por debajo es viejo. */
  lastSeq: number;
  candidatesTotal: number;
  candidatesAnalyzed: number;
  verifiedCount: number;
  /** Consultas al proveedor lanzadas / presupuesto. */
  quota: { used: number; max: number; dailyRemaining: number };
  offers: NormalizedOffer[];
  best: NormalizedOffer | null;
  baseline: NormalizedOffer | null;
  rankings: SearchRankings | null;
  summary: string | null;
  partial: boolean;
  error: string | null;
  /** Motivo por el que la búsqueda quedó a medias, si quedó. */
  partialReason: "budget" | "provider_error" | "cancelled" | "timeout" | null;
};

export const initialProgressState: SearchProgressState = {
  searchId: null,
  phase: "idle",
  lastSeq: -1,
  candidatesTotal: 0,
  candidatesAnalyzed: 0,
  verifiedCount: 0,
  quota: { used: 0, max: 0, dailyRemaining: 0 },
  offers: [],
  best: null,
  baseline: null,
  rankings: null,
  summary: null,
  partial: false,
  error: null,
  partialReason: null,
};

/** Inserta o reemplaza por `candidateKey`, manteniendo el orden por coste. */
function upsertOffer(offers: NormalizedOffer[], offer: NormalizedOffer): NormalizedOffer[] {
  const next = offers.filter((o) => o.candidateKey !== offer.candidateKey);
  next.push(offer);
  return next.sort((a, b) => a.totalTripCost - b.totalTripCost);
}

const cheapest = (offers: NormalizedOffer[]): NormalizedOffer | null =>
  offers.reduce<NormalizedOffer | null>((best, o) => (!best || o.totalTripCost < best.totalTripCost ? o : best), null);

/**
 * Aplica un evento al estado. Devuelve el MISMO objeto si el evento no aporta
 * nada, para que un render con igualdad por referencia no repinte de balde.
 */
export function applyProgressEvent(
  state: SearchProgressState,
  event: SearchProgressEvent
): SearchProgressState {
  // Búsqueda distinta: se empieza limpio en vez de mezclar dos resultados.
  if (state.searchId && event.searchId !== state.searchId) {
    if (event.type !== "search.started") return state;
    return applyProgressEvent({ ...initialProgressState }, event);
  }
  // Fuera de orden o repetido: el stream puede reordenar y una reconexión puede
  // reenviar. `seq` es lo único que decide, nunca la marca de tiempo.
  if (event.seq <= state.lastSeq) return state;

  const s: SearchProgressState = { ...state, lastSeq: event.seq, searchId: event.searchId };

  switch (event.type) {
    case "search.started":
      return { ...initialProgressState, searchId: event.searchId, lastSeq: event.seq, phase: "planning" };

    case "candidates.generated":
      return { ...s, phase: "scanning", candidatesTotal: event.total };

    case "cache.checked":
      return { ...s, phase: "scanning" };

    case "candidate.scored":
      return { ...s, phase: "scanning", candidatesAnalyzed: s.candidatesAnalyzed + 1 };

    case "provider.started":
      return { ...s, phase: "verifying", quota: { ...s.quota, max: Math.max(s.quota.max, event.total) } };

    case "offer.found":
    case "offer.improved": {
      const offers = upsertOffer(s.offers, event.offer);
      // El baseline NO se deduce de una oferta suelta: llega identificado en
      // `search.completed`. Adivinarlo por el ahorro pintaría un "vs normal"
      // contra algo que no es la búsqueda normal.
      return { ...s, phase: "verifying", offers, best: cheapest(offers), verifiedCount: offers.length };
    }

    case "candidate.rejected":
      return s;

    case "quota.updated":
      return {
        ...s,
        quota: { used: event.duffelCalls.used, max: event.duffelCalls.max, dailyRemaining: event.dailyRemaining },
      };

    case "search.partial": {
      // Las ofertas del evento parcial son la foto completa hasta ese momento:
      // se funden con lo que ya había en vez de sustituirlo.
      const offers = event.offers.reduce(upsertOffer, s.offers);
      return {
        ...s,
        phase: "partial",
        partial: true,
        partialReason: event.reason,
        offers,
        best: cheapest(offers),
        verifiedCount: offers.length,
      };
    }

    case "search.completed": {
      const r = event.response;
      const offers = r.offers.reduce(upsertOffer, s.offers);
      return {
        ...s,
        // Un parcial seguido de completed sigue siendo parcial: lo dice la
        // respuesta, no el hecho de haber terminado.
        phase: r.partial ? "partial" : "completed",
        offers,
        best: cheapest(offers),
        verifiedCount: offers.length,
        baseline: r.baseline,
        rankings: r.rankings,
        summary: r.summary,
        partial: r.partial,
        quota: {
          used: r.budget.duffelCalls.used,
          max: r.budget.duffelCalls.max,
          dailyRemaining: r.budget.dailyRemaining,
        },
      };
    }

    case "search.failed":
      return { ...s, phase: "failed", error: event.error };

    default:
      return s;
  }
}

// ── Lectura del cable (SSE) ─────────────────────────────────────────────────

/**
 * Trocea un buffer de texto SSE en eventos completos y devuelve el resto sin
 * terminar. Los chunks de red parten por donde quieren: sin conservar la cola,
 * un JSON cortado a la mitad se pierde entero.
 */
export function parseSseBuffer(buffer: string): { events: SearchProgressEvent[]; rest: string } {
  const events: SearchProgressEvent[] = [];
  // Los bloques se separan por línea en blanco. \r\n por si un proxy lo reescribe.
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as SearchProgressEvent;
      // Validación mínima: viene de la red y alimenta la UI. Un bloque roto se
      // salta; tirar la búsqueda entera por un evento malo sería peor.
      if (parsed && typeof parsed.type === "string" && typeof parsed.seq === "number") events.push(parsed);
    } catch {
      continue;
    }
  }
  return { events, rest };
}
