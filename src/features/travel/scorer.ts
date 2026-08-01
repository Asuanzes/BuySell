/**
 * Puntuación de candidatos y selección de la CARTERA que llega a la fase cara.
 *
 * El presupuesto de Duffel es de 6 llamadas y hay ~60 candidatos: esto decide
 * cuáles. Todo determinista y puro — incluida la exploración aleatoria, que va
 * sembrada por la clave de la búsqueda para que la misma búsqueda dé siempre lo
 * mismo (y para que se pueda escribir un test sobre ella).
 *
 * El LLM NO entra aquí. Reordena después, y sin poder sacar al baseline de su
 * sitio ni inventar un candidato que este módulo no haya generado.
 */
import type { CandidateStructure, FlightCandidate, RejectionReason } from "@nidokey/shared";

/** Mínimo por día que devuelve el calendario de Travelpayouts, en céntimos. */
export type DayPrices = Record<string, number>;

/** Fracción del presupuesto reservada a explorar candidatos no evidentes. */
export const EXPLORE_FRACTION = 0.15;

// ── Semilla reproducible ────────────────────────────────────────────────────

/** FNV-1a de 32 bits. Estable entre procesos, a diferencia de un hash de objeto. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG sembrado. `Math.random` haría la búsqueda irreproducible e intesteable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Características ─────────────────────────────────────────────────────────

export type CandidateFeatures = {
  isBaseline: boolean;
  structure: CandidateStructure;
  /** Días totales de desplazamiento respecto a lo pedido (ida + vuelta). */
  driftAbsDays: number;
  stayDeltaAbsDays: number;
  /** 0 = domingo … 6 = sábado. */
  departWeekday: number;
  returnWeekday: number | null;
  /** Señal de ORDEN del calendario cacheado. NUNCA es un precio y no se enseña. */
  estimateCents: number | null;
  /** Estimación relativa a la del baseline. <1 = pinta más barato. */
  estimateRatio: number | null;
  /** Posición del día dentro del calendario del mes, 0 = el más barato de todos. */
  calendarPercentile: number | null;
  groundTransferCents: number;
  usesAlternateAirport: boolean;
};

/**
 * Señal de precio de un candidato a partir de los calendarios cacheados.
 *
 * Se promedian las pistas disponibles para no penalizar a un candidato por tener
 * solo una. Es una SEÑAL DE ORDEN, no un precio: el calendario de Travelpayouts
 * son mínimos cacheados de búsquedas de hace días y para pasajeros que no son
 * los nuestros. Por eso jamás sale a pantalla ni entra en `totalTripCost`.
 */
export function estimateFromCalendars(
  candidate: FlightCandidate,
  cal: { depart: DayPrices; return: DayPrices }
): number | null {
  const hints = [
    cal.depart[candidate.legs[0]!.date],
    candidate.legs[1] ? cal.return[candidate.legs[1].date] : undefined,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!hints.length) return null;
  return Math.round(hints.reduce((a, b) => a + b, 0) / hints.length);
}

/** Percentil (0..1) del precio de un día dentro de su calendario. */
function percentileIn(prices: DayPrices, date: string): number | null {
  const value = prices[date];
  if (typeof value !== "number") return null;
  const all = Object.values(prices).filter((v) => Number.isFinite(v) && v > 0);
  if (all.length < 2) return null;
  const below = all.filter((v) => v < value).length;
  return below / (all.length - 1);
}

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export function buildFeatures(
  candidate: FlightCandidate,
  ctx: {
    calendars: { depart: DayPrices; return: DayPrices };
    requestedOrigin: string;
    requestedDestination: string;
    baselineEstimateCents: number | null;
  }
): CandidateFeatures {
  const estimateCents = estimateFromCalendars(candidate, ctx.calendars);
  const out = candidate.legs[0]!;
  const back = candidate.legs[1] ?? null;
  return {
    isBaseline: candidate.isBaseline,
    structure: candidate.structure,
    driftAbsDays: Math.abs(candidate.driftDays.depart) + Math.abs(candidate.driftDays.return ?? 0),
    stayDeltaAbsDays: Math.abs(candidate.stayDeltaDays),
    departWeekday: weekdayOf(out.date),
    returnWeekday: back ? weekdayOf(back.date) : null,
    estimateCents,
    estimateRatio:
      estimateCents != null && ctx.baselineEstimateCents != null && ctx.baselineEstimateCents > 0
        ? estimateCents / ctx.baselineEstimateCents
        : null,
    calendarPercentile: percentileIn(ctx.calendars.depart, out.date),
    groundTransferCents: candidate.groundTransferEstimate,
    usesAlternateAirport:
      out.origin !== ctx.requestedOrigin ||
      out.destination !== ctx.requestedDestination ||
      (back != null && (back.origin !== ctx.requestedDestination || back.destination !== ctx.requestedOrigin)),
  };
}

// ── El scorer ───────────────────────────────────────────────────────────────

/**
 * Interfaz de puntuación. Existe para que la fase 5 pueda enchufar un modelo
 * tabular entrenado offline SIN tocar nada del resto del motor: mismo contrato,
 * otra implementación y otra `version` en el registro de observaciones.
 */
export interface CandidateScorer {
  readonly version: string;
  /** Probabilidad estimada de mejorar el baseline, 0..1. */
  score(features: CandidateFeatures): number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Scorer heurístico v1. Sin datos históricos todavía: pondera lo que se sabe
 * gratis (calendario cacheado, día de la semana, cuánto molesta el cambio).
 *
 * ⚙️ ESTE es el punto de calibración del motor. Los pesos de `score()` deciden
 * qué se explora con un presupuesto de 6 llamadas, y son una decisión de
 * producto tanto como técnica: subir `DRIFT_PENALTY` es decir "no le muevas
 * mucho las fechas al usuario aunque salga más barato"; subir `SPLIT_PRIOR` es
 * apostar por el billete partido. Están agrupados a propósito para poder
 * cambiarlos en un sitio.
 */
export const WEIGHTS = {
  /** Punto de partida de un candidato del que no se sabe nada. */
  BASE: 0.4,
  /** Cuánto pesa que el calendario lo pinte más barato que el baseline. */
  ESTIMATE: 0.35,
  /** Cuánto pesa ser de los días baratos del mes. */
  PERCENTILE: 0.15,
  /** Penalización por día de desplazamiento (molestia real para el viajero). */
  DRIFT_PENALTY: 0.02,
  /** Penalización por día de cambio en la duración del viaje. */
  STAY_PENALTY: 0.01,
  /** Los billetes partidos ganan a menudo, pero traen riesgo de conexión. */
  SPLIT_PRIOR: 0.05,
  OPEN_JAW_PRIOR: 0.02,
  /** Salir viernes o volver domingo encarece: son los días de todo el mundo. */
  WEEKEND_PENALTY: 0.04,
  /** Penalización por traslado terrestre, por cada 10 € estimados. */
  TRANSFER_PENALTY_PER_10EUR: 0.03,
} as const;

export class HeuristicScorer implements CandidateScorer {
  readonly version = "heuristic-1";

  score(f: CandidateFeatures): number {
    // El baseline no compite: es la referencia y se verifica siempre.
    if (f.isBaseline) return 1;

    let s = WEIGHTS.BASE;
    // Si el calendario lo pinta un 20 % más barato, sube; si más caro, baja.
    if (f.estimateRatio != null) s += WEIGHTS.ESTIMATE * clamp01((1 - f.estimateRatio) * 2.5);
    if (f.calendarPercentile != null) s += WEIGHTS.PERCENTILE * (1 - f.calendarPercentile);

    s -= WEIGHTS.DRIFT_PENALTY * f.driftAbsDays;
    s -= WEIGHTS.STAY_PENALTY * f.stayDeltaAbsDays;
    if (f.structure === "split") s += WEIGHTS.SPLIT_PRIOR;
    if (f.structure === "open_jaw") s += WEIGHTS.OPEN_JAW_PRIOR;
    // Viernes (5) para salir, domingo (0) para volver.
    if (f.departWeekday === 5) s -= WEIGHTS.WEEKEND_PENALTY;
    if (f.returnWeekday === 0) s -= WEIGHTS.WEEKEND_PENALTY;
    s -= WEIGHTS.TRANSFER_PENALTY_PER_10EUR * (f.groundTransferCents / 1000);

    return clamp01(s);
  }
}

// ── Selección de cartera ────────────────────────────────────────────────────

export type PortfolioSlot = "baseline" | "top_score" | "diversity" | "exploration";

export type PortfolioResult = {
  selected: FlightCandidate[];
  rejected: { key: string; reason: RejectionReason }[];
  explorationSlots: number;
  seed: string;
};

/**
 * Elige qué candidatos se verifican con dinero.
 *
 * NO es "los N mejores por puntuación": eso llena el presupuesto con seis
 * variantes de la misma fecha barata y nunca descubre que ganaba el billete
 * partido o el aeropuerto de al lado. Se reserva un hueco por FAMILIA
 * (estructura y aeropuerto) y otro al azar reproducible, que es lo que evita
 * que el motor solo confirme lo que ya creía.
 */
export function selectPortfolio(
  candidates: FlightCandidate[],
  scored: Map<string, number>,
  opts: { budget: number; seed: string; exploreFraction?: number }
): PortfolioResult {
  const budget = Math.max(1, opts.budget);
  const fraction = opts.exploreFraction ?? EXPLORE_FRACTION;
  // Con presupuesto corto no se explora: primero hay que tener un baseline y
  // una alternativa que enseñar. Pasado ese umbral, SIEMPRE al menos un hueco:
  // con el presupuesto real (6) un `floor(6 × 0.15)` da 0, así que la fracción
  // sola dejaba la exploración muerta justo donde tiene que funcionar — y con
  // ella el único mecanismo que evita que el motor solo confirme lo que ya creía.
  const explorationSlots = budget >= 4 ? Math.max(1, Math.round(budget * fraction)) : 0;

  const byScore = [...candidates].sort(
    (a, b) => (scored.get(b.key) ?? 0) - (scored.get(a.key) ?? 0) || a.key.localeCompare(b.key)
  );

  const selected: FlightCandidate[] = [];
  const taken = new Set<string>();
  const take = (c: FlightCandidate | undefined) => {
    if (!c || taken.has(c.key) || selected.length >= budget - explorationSlots) return false;
    taken.add(c.key);
    selected.push(c);
    return true;
  };

  // 1. El baseline, siempre y el primero.
  take(byScore.find((c) => c.isBaseline));

  // 2. El mejor por puntuación.
  const best = byScore.find((c) => !taken.has(c.key));
  take(best);

  // 3. Diversidad estructural: la mejor de una estructura distinta a la del (2).
  if (best) {
    take(byScore.find((c) => !taken.has(c.key) && c.structure !== best.structure));
  }

  // 4. Diversidad de aeropuerto: la mejor que use uno alternativo.
  take(byScore.find((c) => !taken.has(c.key) && c.groundTransferEstimate > 0));

  // 5. La mejor de baja fricción (mueve las fechas un día como mucho).
  take(
    byScore.find(
      (c) => !taken.has(c.key) && Math.abs(c.driftDays.depart) + Math.abs(c.driftDays.return ?? 0) <= 1
    )
  );

  // 6. Lo que quede, por puntuación.
  for (const c of byScore) take(c);

  // 7. Exploración: sorteo REPRODUCIBLE entre los descartados.
  const rng = mulberry32(hashSeed(opts.seed));
  const pool = byScore.filter((c) => !taken.has(c.key));
  for (let i = 0; i < explorationSlots && pool.length; i++) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    taken.add(pick.key);
    selected.push(pick);
  }

  const reasons: PortfolioSlot[] = [];
  selected.forEach((c, i) => {
    reasons.push(c.isBaseline ? "baseline" : i >= selected.length - explorationSlots ? "exploration" : i <= 2 ? "top_score" : "diversity");
  });

  const rejected = candidates
    .filter((c) => !taken.has(c.key))
    .map((c) => ({ key: c.key, reason: "budget" as RejectionReason }));

  return {
    selected: selected.map((c, i) => ({
      ...c,
      score: scored.get(c.key) ?? 0,
      selectedForVerification: true,
      selectionReason: reasons[i]!,
    })),
    rejected,
    explorationSlots,
    seed: opts.seed,
  };
}

/** Puntúa todos los candidatos con el scorer dado. */
export function scoreAll(
  candidates: FlightCandidate[],
  scorer: CandidateScorer,
  ctx: Parameters<typeof buildFeatures>[1]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of candidates) out.set(c.key, scorer.score(buildFeatures(c, ctx)));
  return out;
}
