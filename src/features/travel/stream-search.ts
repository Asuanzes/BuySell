/**
 * Orquestador de la búsqueda inteligente: convierte una petición en un FLUJO de
 * eventos tipados. Es lo que permite enseñar el proceso en vez de un spinner de
 * 55 segundos, y lo que permite pararlo a medias sin dejar dinero gastado a
 * cambio de nada.
 *
 * Diseño:
 *   - Generador asíncrono. Quien consume (la ruta SSE, un test) decide qué hacer
 *     con cada evento; aquí no se sabe nada de HTTP.
 *   - El presupuesto de llamadas de PAGO se descuenta antes de llamar, nunca
 *     después: si el proceso muere a mitad, no puede haber gastado de más.
 *   - Cancelación cooperativa: la `AbortSignal` corta entre trabajos Y dentro de
 *     la petición en vuelo (el proveedor la recibe).
 *   - Un proveedor caído degrada, no rompe: se pierde ese candidato y la
 *     búsqueda sigue con los demás.
 *
 * El LLM es OPCIONAL y va fuera del camino crítico del dinero: si no contesta,
 * el orden determinista y la ausencia de resumen son un resultado perfectamente
 * válido.
 */
import {
  ALGO_VERSION,
  type FlightCandidate,
  type FlightSearchRequest,
  type FlightSearchResponse,
  type NormalizedOffer,
  type RejectionReason,
  type SearchDiagnostics,
  type SearchProgressEvent,
} from "@nidokey/shared";
import { duffelSearchOffers, type DuffelOffer } from "@/features/sources/providers/duffel";
import { planCandidates } from "./planner";
import { HeuristicScorer, scoreAll, selectPortfolio, type CandidateScorer, type DayPrices } from "./scorer";
import { buildRankings, combineSplit, normalizeOffer, normalizeOffers, withSavings } from "./normalize";

/** Peticiones simultáneas al proveedor. Ver `MAX_CONCURRENT` abajo. */
export const MAX_CONCURRENT_PROVIDER = 3;
/** Rechazos individuales que se emiten como evento. El resto va en el recuento. */
const MAX_REJECTION_EVENTS = 10;

export type SearchDeps = {
  searchOffers: typeof duffelSearchOffers;
  /** Fase barata: calendarios cacheados. Devuelve vacío si no hay credencial. */
  loadCalendars: (r: FlightSearchRequest) => Promise<{ depart: DayPrices; return: DayPrices }>;
  /** Reordena la preselección. Opcional: si falta o falla, manda el orden determinista. */
  prioritize?: (candidates: FlightCandidate[], r: FlightSearchRequest) => Promise<string[]>;
  /** Redacta el resumen. Opcional: sin él la respuesta va sin `summary`. */
  summarize?: (response: FlightSearchResponse, r: FlightSearchRequest) => Promise<string | null>;
  scorer: CandidateScorer;
  now: () => string;
};

export type SearchOptions = {
  /** Presupuesto DURO de llamadas de pago, ya recortado por la cuota diaria. */
  budget: number;
  dailyRemaining: number;
  signal?: AbortSignal;
  todayISO?: string;
  searchId?: string;
  deps: SearchDeps;
};

/** Trabajo contra el proveedor. Un `leg` lo comparten varios candidatos. */
type ProviderJob =
  | { kind: "itinerary"; candidate: FlightCandidate }
  | { kind: "leg"; legKey: string; origin: string; destination: string; date: string };

const legKeyOf = (o: string, d: string, date: string) => `${o}-${d}@${date}`;

/**
 * Trabajos necesarios para verificar la cartera, en orden de prioridad y
 * RECORTADOS al presupuesto.
 *
 * Un billete partido necesita sus dos tramos por separado; los tramos se
 * deduplican entre candidatos, así que tres idas y tres vueltas dan nueve
 * itinerarios partidos con seis peticiones. Recombinar sale gratis.
 */
export function planProviderJobs(
  candidates: FlightCandidate[],
  budget: number
): { jobs: ProviderJob[]; skipped: number } {
  const wanted: ProviderJob[] = [];
  const legs = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.structure !== "split") {
      // round_trip, open_jaw y one_way se piden en UNA llamada con sus trayectos
      // como slices — que es la única forma de expresar un open-jaw.
      wanted.push({ kind: "itinerary", candidate });
      continue;
    }
    for (const leg of candidate.legs) {
      const key = legKeyOf(leg.origin, leg.destination, leg.date);
      if (legs.has(key)) continue;
      legs.add(key);
      wanted.push({ kind: "leg", legKey: key, origin: leg.origin, destination: leg.destination, date: leg.date });
    }
  }
  const max = Math.max(1, budget);
  return { jobs: wanted.slice(0, max), skipped: Math.max(0, wanted.length - max) };
}

// ── Cola de eventos ─────────────────────────────────────────────────────────

/**
 * Puente entre el productor (que lanza peticiones en paralelo) y el generador
 * que consume. Sin esto habría que serializar el trabajo para poder emitir en
 * orden, y se perdería justo la concurrencia que hace útil el streaming.
 */
function createQueue<T>() {
  const buffer: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(item: T) {
      buffer.push(item);
      wake?.();
      wake = null;
    },
    close() {
      closed = true;
      wake?.();
      wake = null;
    },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        if (buffer.length) {
          yield buffer.shift()!;
          continue;
        }
        if (closed) return;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    },
  };
}

/** Ejecuta con un tope de trabajos simultáneos, mirando la cancelación. */
async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const index = next++;
      await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
}

// ── Orquestación ────────────────────────────────────────────────────────────

export function runFlightSearch(
  request: FlightSearchRequest,
  opts: SearchOptions
): AsyncGenerator<SearchProgressEvent> {
  const queue = createQueue<SearchProgressEvent>();
  const { deps, signal } = opts;
  const searchId = opts.searchId ?? `fs_${Date.now().toString(36)}`;
  const todayISO = opts.todayISO ?? deps.now().slice(0, 10);
  const startedAt = Date.parse(deps.now());

  let seq = 0;
  const emit = (e: Omit<SearchProgressEvent, "searchId" | "seq" | "at"> & Record<string, unknown>) => {
    queue.push({ ...e, searchId, seq: seq++, at: deps.now() } as SearchProgressEvent);
  };

  const run = async () => {
    const diagnostics: SearchDiagnostics = {
      candidatesGenerated: 0,
      candidatesAfterConstraints: 0,
      candidatesVerified: 0,
      candidatesTruncated: 0,
      providerCalls: {},
      timeToFirstOfferMs: null,
      timeToBestOfferMs: null,
      expiredOffers: 0,
      explorationSlots: 0,
      seed: "",
      algoVersion: ALGO_VERSION,
    };
    const offers: NormalizedOffer[] = [];
    let baseline: NormalizedOffer | null = null;
    let used = 0;
    /**
     * Motivo de quedarse a medias, por importancia para quien mira la pantalla.
     * Si el proveedor se cae Y encima se agota el presupuesto, lo que hay que
     * contar es la caída: "no me dio tiempo a mirarlo todo" y "la aerolínea no
     * respondía" llevan al usuario a hacer cosas distintas.
     */
    const REASON_RANK = { budget: 0, timeout: 1, provider_error: 2, cancelled: 3 } as const;
    let partialReason: keyof typeof REASON_RANK | null = null;
    const noteReason = (reason: keyof typeof REASON_RANK) => {
      if (partialReason == null || REASON_RANK[reason] > REASON_RANK[partialReason]) partialReason = reason;
    };
    const latencies: number[] = [];
    let providerErrors = 0;
    let rejectionEvents = 0;

    const rejectCandidate = (key: string, reason: RejectionReason) => {
      if (rejectionEvents++ >= MAX_REJECTION_EVENTS) return;
      emit({ type: "candidate.rejected", candidateKey: key, reason });
    };

    try {
      emit({
        type: "search.started",
        algoVersion: ALGO_VERSION,
        request: {
          origin: request.origin,
          destination: request.destination,
          departDate: request.departDate,
          returnDate: request.returnDate,
          travelers: request.adults + request.childAges.length,
          cabin: request.preferences.cabin,
          currency: request.currency,
          market: request.market,
        },
      });

      // ── Generación ────────────────────────────────────────────────────────
      const plan = planCandidates(request, { todayISO });
      diagnostics.candidatesGenerated = plan.stats.generated;
      diagnostics.candidatesAfterConstraints = plan.stats.afterConstraints;
      diagnostics.candidatesTruncated = plan.stats.truncated;
      emit({
        type: "candidates.generated",
        total: plan.candidates.length,
        byStructure: plan.stats.byStructure,
        truncated: plan.stats.truncated,
      });
      for (const r of plan.rejected.slice(0, MAX_REJECTION_EVENTS)) rejectCandidate(r.key, r.reason);
      if (!plan.candidates.length) {
        emit({ type: "search.failed", error: "no_dates", recoverable: false });
        return;
      }

      // ── Fase barata ───────────────────────────────────────────────────────
      const calendars = await deps.loadCalendars(request).catch(() => ({ depart: {}, return: {} }));
      const hits = Object.keys(calendars.depart).length + Object.keys(calendars.return).length;
      emit({ type: "cache.checked", hits, misses: Math.max(0, plan.candidates.length - hits), oldestAgeSeconds: null });
      if (signal?.aborted) throw new DOMException("cancelled", "AbortError");

      const baselineCandidate = plan.candidates.find((c) => c.isBaseline) ?? plan.candidates[0]!;
      const scoreCtx = {
        calendars,
        requestedOrigin: request.origin,
        requestedDestination: request.destination,
        baselineEstimateCents: null as number | null,
      };
      let scored = scoreAll(plan.candidates, deps.scorer, scoreCtx);

      // El LLM solo REORDENA, y solo si contesta a tiempo. Nunca añade
      // candidatos, nunca toca precios y nunca saca al baseline de su sitio.
      if (deps.prioritize) {
        try {
          const order = await deps.prioritize(plan.candidates.slice(0, 8), request);
          const bonus = new Map(order.map((key, i) => [key, (order.length - i) / (order.length * 100)]));
          scored = new Map([...scored].map(([k, v]) => [k, Math.min(1, v + (bonus.get(k) ?? 0))]));
        } catch {
          // Sin prioridad del modelo se sigue con la determinista.
        }
      }

      const portfolio = selectPortfolio(plan.candidates, scored, {
        budget: opts.budget,
        seed: `${request.origin}-${request.destination}-${request.departDate}-${request.returnDate ?? "ow"}`,
      });
      diagnostics.explorationSlots = portfolio.explorationSlots;
      diagnostics.seed = portfolio.seed;
      for (const c of portfolio.selected) emit({ type: "candidate.scored", candidate: c });
      for (const r of portfolio.rejected.slice(0, Math.max(0, MAX_REJECTION_EVENTS - rejectionEvents))) {
        rejectCandidate(r.key, r.reason);
      }

      // ── Fase cara ─────────────────────────────────────────────────────────
      const { jobs, skipped } = planProviderJobs(portfolio.selected, opts.budget);
      if (skipped > 0) noteReason("budget");
      const legOffers = new Map<string, NormalizedOffer>();
      const bySplitCandidate = portfolio.selected.filter((c) => c.structure === "split");

      const trackBest = (offer: NormalizedOffer) => {
        const previous = offers.length
          ? Math.min(...offers.map((o) => o.totalTripCost))
          : Number.POSITIVE_INFINITY;
        offers.push(offer);
        const elapsed = Date.parse(deps.now()) - startedAt;
        if (diagnostics.timeToFirstOfferMs == null) diagnostics.timeToFirstOfferMs = elapsed;
        if (offer.totalTripCost < previous) {
          diagnostics.timeToBestOfferMs = elapsed;
          if (Number.isFinite(previous)) {
            emit({ type: "offer.improved", offer, previousTotalCents: previous });
            return;
          }
        }
        emit({ type: "offer.found", offer });
      };

      await pool(
        jobs,
        MAX_CONCURRENT_PROVIDER,
        async (job, index) => {
          if (signal?.aborted) return;
          const key = job.kind === "itinerary" ? job.candidate.key : job.legKey;
          emit({ type: "provider.started", provider: "duffel", candidateKey: key, index, total: jobs.length });
          // Se cobra ANTES de llamar: una petición emitida se paga aunque la
          // respuesta no llegue nunca.
          used++;
          emit({
            type: "quota.updated",
            duffelCalls: { used, max: opts.budget },
            dailyRemaining: Math.max(0, opts.dailyRemaining - used),
          });

          const startedCall = Date.now();
          let result: DuffelOffer[];
          try {
            const slices =
              job.kind === "itinerary"
                ? job.candidate.legs.map((l) => ({
                    origin: l.origin,
                    destination: l.destination,
                    departure_date: l.date,
                  }))
                : [{ origin: job.origin, destination: job.destination, departure_date: job.date }];
            result = await deps.searchOffers({
              origin: slices[0]!.origin,
              destination: slices[0]!.destination,
              departDate: slices[0]!.departure_date,
              slices,
              adults: request.adults,
              childAges: request.childAges,
              cabin: request.preferences.cabin,
              maxConnections: request.preferences.maxStops,
              signal,
            });
          } catch (err) {
            providerErrors++;
            latencies.push(Date.now() - startedCall);
            // Un candidato caído se lleva su variante, no la búsqueda entera.
            if (signal?.aborted) return;
            noteReason("provider_error");
            rejectCandidate(key, "provider_error");
            console.error("[flights-stream] proveedor:", key, err instanceof Error ? err.message : err);
            return;
          }
          latencies.push(Date.now() - startedCall);
          if (signal?.aborted) return;

          if (job.kind === "leg") {
            // Un tramo suelto se guarda: los billetes partidos se recombinan
            // después, y recombinar no cuesta ni una llamada más.
            const anyCandidate = bySplitCandidate[0];
            if (!anyCandidate) return;
            const best = normalizeOffers(result, { candidate: anyCandidate, request, nowISO: deps.now() }, 1)[0];
            if (best) legOffers.set(job.legKey, best);
            return;
          }

          const ctx = { candidate: job.candidate, request, nowISO: deps.now() };
          const normalized = normalizeOffers(result, ctx, 2);
          if (!normalized.length) {
            rejectCandidate(key, "no_offers");
            return;
          }
          diagnostics.candidatesVerified++;
          if (job.candidate.isBaseline) baseline = normalized[0]!;
          for (const offer of normalized) trackBest(offer);
        },
        signal
      );

      if (signal?.aborted) throw new DOMException("cancelled", "AbortError");

      // ── Recombinación de tramos: gratis ───────────────────────────────────
      for (const candidate of bySplitCandidate) {
        const out = legOffers.get(legKeyOf(candidate.legs[0]!.origin, candidate.legs[0]!.destination, candidate.legs[0]!.date));
        const back = candidate.legs[1]
          ? legOffers.get(legKeyOf(candidate.legs[1].origin, candidate.legs[1].destination, candidate.legs[1].date))
          : null;
        if (!out) continue;
        const ctx = { candidate, request, nowISO: deps.now() };
        const combined = back ? combineSplit(out, back, ctx) : null;
        if (!combined) {
          if (back) rejectCandidate(candidate.key, "not_comparable");
          continue;
        }
        diagnostics.candidatesVerified++;
        trackBest(combined);
      }

      // ── Cierre determinista ───────────────────────────────────────────────
      const finished = finalize(offers, baseline, diagnostics, {
        searchId,
        budget: opts.budget,
        used,
        dailyRemaining: opts.dailyRemaining,
        partial: partialReason != null,
        latencies,
        providerErrors,
      });
      if (partialReason) emit({ type: "search.partial", reason: partialReason, offers: finished.offers });

      let summary: string | null = null;
      if (deps.summarize) {
        // El resumen va al final a propósito: si el modelo tarda o falla, el
        // usuario ya tiene todos los resultados en pantalla.
        summary = await deps.summarize(finished, request).catch(() => null);
      }
      emit({ type: "search.completed", response: { ...finished, summary } });
    } catch (err) {
      const cancelled = signal?.aborted || (err instanceof Error && err.name === "AbortError");
      if (cancelled) {
        // Cancelar no es fallar: se entrega lo que ya se había encontrado.
        const finished = finalize(offers, baseline, diagnostics, {
          searchId,
          budget: opts.budget,
          used,
          dailyRemaining: opts.dailyRemaining,
          partial: true,
          latencies,
          providerErrors,
        });
        emit({ type: "search.partial", reason: "cancelled", offers: finished.offers });
        emit({ type: "search.completed", response: finished });
      } else {
        console.error("[flights-stream] fallo:", err instanceof Error ? err.message : err);
        emit({ type: "search.failed", error: err instanceof Error ? err.message : "error", recoverable: true });
      }
    } finally {
      queue.close();
    }
  };

  void run();
  return queue.drain();
}

/** Cierre determinista: ahorro, rankings y diagnóstico. Sin LLM ni red. */
function finalize(
  offers: NormalizedOffer[],
  baseline: NormalizedOffer | null,
  diagnostics: SearchDiagnostics,
  meta: {
    searchId: string;
    budget: number;
    used: number;
    dailyRemaining: number;
    partial: boolean;
    latencies: number[];
    providerErrors: number;
  }
): FlightSearchResponse {
  const withPct = withSavings(offers, baseline);
  const sorted = [...new Set(withPct)].sort((a, b) => a.totalTripCost - b.totalTripCost);
  const latencies = [...meta.latencies].sort((a, b) => a - b);
  return {
    searchId: meta.searchId,
    algoVersion: ALGO_VERSION,
    baseline: baseline ? withPct.find((o) => o.candidateKey === baseline.candidateKey) ?? baseline : null,
    offers: sorted,
    rankings: buildRankings(sorted),
    partial: meta.partial,
    degraded: null,
    budget: {
      duffelCalls: { used: meta.used, max: meta.budget },
      dailyRemaining: Math.max(0, meta.dailyRemaining - meta.used),
    },
    summary: null,
    diagnostics: {
      ...diagnostics,
      expiredOffers: sorted.filter((o) => o.confidence === "expired").length,
      providerCalls: {
        duffel: {
          calls: meta.used,
          errors: meta.providerErrors,
          latencyMsP50: latencies.length ? latencies[Math.floor(latencies.length / 2)]! : 0,
          latencyMsMax: latencies.length ? latencies[latencies.length - 1]! : 0,
        },
      },
    },
  };
}
