/**
 * Núcleo PURO de la búsqueda de vuelos (normal e "inteligente"). Sin red, sin
 * BBDD y sin Next: todo lo que decide QUÉ se pide, CUÁNTO cuesta pedirlo y cómo
 * se puntúa vive aquí, para poder probarlo sin un solo mock. La parte con I/O
 * (Duffel + Travelpayouts + LLM) está en ./ai-search.ts.
 *
 * Búsqueda inteligente = explorar variantes LEGÍTIMAS del itinerario con las
 * APIs que ya pagamos:
 *   - fechas flexibles ±2 días (matriz 5×5 en ida y vuelta, 5 en solo-ida),
 *   - billete único (una offer de Duffel con dos slices) COMPITIENDO contra dos
 *     solo-idas independientes ("split"), que pueden ser de aerolíneas distintas.
 * El ranking de precios es DETERMINISTA (aquí); el LLM solo prioriza candidatos
 * y redacta el resumen (./ai-search.ts).
 */
import { z } from "zod";
import type { DuffelOffer } from "@/features/sources/providers/duffel";

/** Opciones devueltas al cliente por búsqueda. */
export const MAX_OPTIONS = 6;
/** Flexibilidad máxima de fechas, en días, a cada lado. Tope duro del producto. */
export const FLEX_DAYS = 2;
/** Candidatos de la matriz que llegan a Duffel (los demás se quedan en la fase barata). */
export const AI_CANDIDATES = 4;
/**
 * Presupuesto DURO de llamadas a Duffel por búsqueda IA. Duffel cobra por
 * petición y el usuario tiene 50/día: sin este tope una matriz 5×5 dispararía 25+.
 */
export const MAX_DUFFEL_CALLS_AI = 6;
/** Estancia mínima al mover fechas: la vuelta nunca cruza por delante de la ida. */
export const MIN_DAYS_STAY = 1;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// ── Fechas (ISO puro, sin zona horaria: "YYYY-MM-DD" se compara como string) ──

/** Desplaza "YYYY-MM-DD" n días. UTC a propósito: nada de horario de verano. */
export function shiftISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (negativo si b es anterior). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** "2026-08-15" → "1508" (formato DDMM de las URL de búsqueda de Aviasales). */
function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
}

// ── Enlace de afiliado ──────────────────────────────────────────────────────

/**
 * URL de búsqueda de Aviasales (capa de monetización; la reserva NO es nuestra).
 * Formato: /search/{ORI}{DDMM ida}{DEST}{DDMM vuelta?}{nº pasajeros}
 * p. ej. MAD1508BCN2208 + "2" → ida 15-ago, vuelta 22-ago, 2 pasajeros.
 */
export function aviasalesUrl(
  origin: string,
  destination: string,
  departDate?: string | null,
  returnDate?: string | null,
  passengers = 1
): string {
  const dep = departDate && ISO_DATE.test(departDate) ? ddmm(departDate) : "";
  const ret = dep && returnDate && ISO_DATE.test(returnDate) ? ddmm(returnDate) : "";
  const pax = Math.max(1, Math.min(9, Math.round(passengers)));
  return `https://www.aviasales.com/search/${origin}${dep}${destination}${ret}${pax}`;
}

// ── Modelo de salida ────────────────────────────────────────────────────────

/** Cómo se compra el itinerario: un billete i/v, o dos solo-idas separadas. */
export type TicketType = "single" | "split";

export type FlightOption = {
  offerId: string | null; // id de oferta Duffel (para reserva futura)
  origin: string;
  destination: string;
  /** TOTAL del itinerario en céntimos (ida + vuelta si la hay). */
  priceCents: number;
  currency: string;
  airline: string | null; // aerolínea de la IDA
  flightNumber: string | null;
  departISO: string | null;
  returnISO: string | null; // salida de la vuelta
  /** Llegada REAL de la vuelta: un nocturno aterriza al día siguiente. */
  returnArriveISO: string | null;
  stops: number; // escalas de la ida (0 = directo)
  bookUrl: string; // = bookUrls[0]; se mantiene por compatibilidad
  // ── solo en búsqueda IA ──
  ticketType?: TicketType;
  /** 1 enlace (single) o 2 (split: ida y vuelta se reservan por separado). */
  bookUrls?: string[];
  /** Días de desplazamiento frente a lo que pidió el usuario. */
  dateShift?: { depart: number; return: number | null };
  /** % frente a la búsqueda normal. null si no hubo baseline. */
  savingsPct?: number | null;
  /** Aerolínea de la vuelta; distinta de `airline` en un split mixto. */
  returnAirline?: string | null;
};

export type FlightSearchResponse = {
  items: FlightOption[];
  ai?: {
    /** Precio de la búsqueda NORMAL (fechas exactas, billete único). */
    baselineCents: number | null;
    duffelCalls: { max: number; used: number };
    /** Quedaron candidatos sin explorar (presupuesto o cuota agotados). */
    partial: boolean;
    /** Se sirvió búsqueda normal pese a pedir IA, y por qué. */
    degraded: "quota" | "no_dates" | null;
    /** Resumen en lenguaje natural. null si el LLM falló (nunca rompe). */
    summary: string | null;
  };
};

// ── Contrato de entrada ─────────────────────────────────────────────────────

/**
 * Query de GET /api/travel/flights. `aiSearch` NO usa z.coerce.boolean(): esa
 * coerción convierte la cadena "false" en `true` (Boolean("false") === true).
 */
export const FlightSearchQuery = z
  .object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departDate: z.string().regex(ISO_DATE).optional(),
    returnDate: z.string().regex(ISO_DATE).optional(),
    adults: z.coerce.number().int().min(1).max(9).optional(),
    children: z.string().optional(), // edades CSV "5,8"
    aiSearch: z
      .enum(["0", "1", "true", "false"])
      .optional()
      .transform((v) => v === "1" || v === "true"),
    /** Idioma del resumen del LLM. */
    lang: z.enum(["es", "en"]).optional(),
  })
  .refine((q) => !q.returnDate || !q.departDate || q.returnDate >= q.departDate, {
    message: "returnDate no puede ser anterior a departDate",
    path: ["returnDate"],
  });

export type FlightSearchInput = z.infer<typeof FlightSearchQuery>;

// ── Matriz de fechas ────────────────────────────────────────────────────────

export type DatePair = { depart: string; return: string | null };

const samePair = (a: DatePair, b: DatePair) => a.depart === b.depart && a.return === b.return;

/**
 * Matriz de fechas candidatas: 5 idas × 5 vueltas (±`flexDays`) en ida y vuelta,
 * 5 en solo-ida. Descarta idas pasadas y estancias por debajo de `minDaysStay`
 * (la vuelta jamás cruza por delante de la ida).
 *
 * Las fechas EXACTAS del usuario van siempre las primeras aunque incumplan
 * `minDaysStay`: son lo que pidió y son el baseline con el que se compara todo.
 */
export function buildDateMatrix(opts: {
  departDate: string;
  returnDate?: string | null;
  flexDays?: number;
  minDaysStay?: number;
  todayISO: string;
}): DatePair[] {
  const flex = Math.max(0, Math.min(FLEX_DAYS, opts.flexDays ?? FLEX_DAYS));
  const minStay = opts.minDaysStay ?? MIN_DAYS_STAY;
  const exact: DatePair = { depart: opts.departDate, return: opts.returnDate ?? null };
  const offsets = Array.from({ length: flex * 2 + 1 }, (_, i) => i - flex);
  const departs = offsets.map((d) => shiftISO(opts.departDate, d)).filter((d) => d >= opts.todayISO);

  const pairs: DatePair[] = [];
  if (exact.return == null) {
    for (const depart of departs) pairs.push({ depart, return: null });
  } else {
    const returns = offsets.map((d) => shiftISO(exact.return!, d));
    for (const depart of departs) {
      for (const ret of returns) {
        if (daysBetween(depart, ret) >= minStay) pairs.push({ depart, return: ret });
      }
    }
  }

  // El par exacto manda: fuera de la lista si es pasado, el primero si no.
  const rest = pairs.filter((p) => !samePair(p, exact));
  return exact.depart >= opts.todayISO ? [exact, ...rest] : rest;
}

/** Desplazamiento de un par frente a lo pedido, en días. */
export function shiftOf(pair: DatePair, exact: DatePair): { depart: number; return: number | null } {
  return {
    depart: daysBetween(exact.depart, pair.depart),
    return: exact.return && pair.return ? daysBetween(exact.return, pair.return) : null,
  };
}

// ── Priorización (fase barata: Travelpayouts) ───────────────────────────────

/** Mínimo cacheado por fecha, en céntimos. Las fechas sin dato no aparecen. */
export type DayPrices = Record<string, number>;

/**
 * Puntúa un par con los calendarios cacheados de Travelpayouts (gratis). Es una
 * SEÑAL de orden, no un precio: se promedian las pistas disponibles para no
 * penalizar a un par por tener solo una. Sin ninguna pista → Infinity, y el
 * desempate por cercanía a las fechas pedidas decide.
 *
 * ponytail: media simple. Si el ranking resulta flojo, el sitio donde cambiarlo
 * es esta función y solo esta función — todo lo demás la consume por callback.
 */
export function scorePair(pair: DatePair, cal: { depart: DayPrices; return: DayPrices }): number {
  const hints = [cal.depart[pair.depart], pair.return ? cal.return[pair.return] : undefined].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (!hints.length) return Number.POSITIVE_INFINITY;
  return hints.reduce((a, b) => a + b, 0) / hints.length;
}

/**
 * Ordena la matriz y se queda con los `k` mejores. Las fechas exactas van
 * SIEMPRE las primeras (son el baseline y no cuestan llamadas extra).
 * Desempate: menos desplazamiento primero.
 */
export function rankCandidates(
  pairs: DatePair[],
  score: (p: DatePair) => number,
  opts: { exact: DatePair; k?: number }
): DatePair[] {
  const k = Math.max(1, opts.k ?? AI_CANDIDATES);
  const exact = pairs.find((p) => samePair(p, opts.exact));
  const rest = pairs
    .filter((p) => !samePair(p, opts.exact))
    .map((pair) => {
      const s = shiftOf(pair, opts.exact);
      return { pair, score: score(pair), drift: Math.abs(s.depart) + Math.abs(s.return ?? 0) };
    })
    .sort((a, b) => a.score - b.score || a.drift - b.drift || a.pair.depart.localeCompare(b.pair.depart))
    .map((c) => c.pair);
  return [...(exact ? [exact] : []), ...rest].slice(0, k);
}

// ── Presupuesto de llamadas (fase cara: Duffel) ─────────────────────────────

export type DuffelJob =
  | { kind: "single"; pair: DatePair }
  | { kind: "leg"; direction: "out" | "back"; date: string };

/**
 * Plan de llamadas a Duffel, en orden de prioridad y RECORTADO a `maxCalls`.
 *
 * Por candidato: el billete único + los dos tramos sueltos que forman el split.
 * Los tramos se deduplican por (dirección, fecha), así que un candidato que
 * repite fecha de ida solo paga el tramo que falta — y los tramos ya traídos se
 * recombinan entre sí gratis (ver buildSplitCombos).
 *
 * En solo-ida no hay split posible: el billete único YA es el tramo.
 */
export function planDuffelJobs(
  candidates: DatePair[],
  maxCalls = MAX_DUFFEL_CALLS_AI
): { jobs: DuffelJob[]; skipped: number } {
  const wanted: DuffelJob[] = [];
  const legs = new Set<string>();
  for (const pair of candidates) {
    wanted.push({ kind: "single", pair });
    if (!pair.return) continue;
    for (const [direction, date] of [
      ["out", pair.depart],
      ["back", pair.return],
    ] as const) {
      const key = `${direction}:${date}`;
      if (legs.has(key)) continue;
      legs.add(key);
      wanted.push({ kind: "leg", direction, date });
    }
  }
  const max = Math.max(1, maxCalls);
  return { jobs: wanted.slice(0, max), skipped: Math.max(0, wanted.length - max) };
}

// ── Combinación de tramos sueltos ───────────────────────────────────────────

/** Un solo-ida ya resuelto (el más barato de esa fecha). */
export type LegQuote = {
  date: string;
  priceCents: number;
  currency: string;
  offerId: string | null;
  airline: string | null;
  flightNumber: string | null;
  departISO: string | null;
  arriveISO: string | null;
  stops: number;
};

/**
 * Todas las combinaciones válidas ida×vuelta de los tramos YA traídos. Coste en
 * llamadas: cero — 3 idas + 3 vueltas dan 9 itinerarios con 6 peticiones.
 */
export function buildSplitCombos(
  out: LegQuote[],
  back: LegQuote[],
  minDaysStay = MIN_DAYS_STAY
): { out: LegQuote; back: LegQuote }[] {
  const combos: { out: LegQuote; back: LegQuote }[] = [];
  for (const o of out) {
    for (const b of back) {
      if (daysBetween(o.date, b.date) >= minDaysStay) combos.push({ out: o, back: b });
    }
  }
  return combos;
}

// ── Ahorro ──────────────────────────────────────────────────────────────────

/** % frente al baseline, redondeado. null sin baseline utilizable. */
export function savingsPct(baselineCents: number | null, totalCents: number): number | null {
  if (baselineCents == null || !Number.isFinite(baselineCents) || baselineCents <= 0) return null;
  return Math.round(((baselineCents - totalCents) / baselineCents) * 100);
}

/**
 * Cierra la lista IA: calcula el ahorro, DESCARTA lo que no ahorra (un resultado
 * "optimizado" más caro que la búsqueda normal es ruido), deduplica y ordena por
 * precio. Sin baseline se devuelve todo sin %.
 */
export function finalizeAiItems(
  items: FlightOption[],
  baselineCents: number | null,
  max = MAX_OPTIONS
): FlightOption[] {
  const scored = items.map((it) => ({ ...it, savingsPct: savingsPct(baselineCents, it.priceCents) }));
  const kept = scored.filter(
    // `<= baseline` mantiene el propio baseline (ahorro 0) y sus empates.
    (it) => baselineCents == null || (it.savingsPct ?? 0) > 0 || it.priceCents <= baselineCents
  );
  const seen = new Set<string>();
  const out: FlightOption[] = [];
  for (const it of kept.sort((a, b) => a.priceCents - b.priceCents)) {
    const key = [it.ticketType, it.departISO?.slice(0, 10), it.returnISO?.slice(0, 10), it.airline, it.priceCents].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

// ── Adaptación de ofertas Duffel ────────────────────────────────────────────

function amountToCents(amount: string): number | null {
  const v = parseFloat(amount);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** Una offer de Duffel → opción del producto. null si el importe no es usable. */
export function offerToOption(
  o: DuffelOffer,
  ctx: { origin: string; destination: string; bookUrl: string }
): FlightOption | null {
  const priceCents = amountToCents(o.total_amount);
  if (priceCents == null) return null;
  const outSegs = o.slices?.[0]?.segments ?? [];
  const backSegs = o.slices?.[1]?.segments ?? [];
  const seg = outSegs[0];
  const backSeg = backSegs[0];
  return {
    offerId: o.id,
    origin: ctx.origin,
    destination: ctx.destination,
    priceCents,
    currency: o.total_currency || "EUR",
    airline: o.owner?.name ?? seg?.marketing_carrier?.name ?? "—",
    flightNumber:
      seg?.marketing_carrier?.iata_code && seg?.marketing_carrier_flight_number
        ? `${seg.marketing_carrier.iata_code} ${seg.marketing_carrier_flight_number}`
        : null,
    departISO: seg?.departing_at ?? null,
    returnISO: backSeg?.departing_at ?? null,
    // La llegada real es la del ÚLTIMO segmento: un nocturno con escala aterriza
    // al día siguiente y la ficha debe enseñar esa fecha, no la de salida.
    returnArriveISO: backSegs[backSegs.length - 1]?.arriving_at ?? null,
    stops: Math.max(0, outSegs.length - 1),
    bookUrl: ctx.bookUrl,
    returnAirline: backSeg?.marketing_carrier?.name ?? null,
  };
}

/** Ofertas Duffel → opciones variadas (por precio, deduplicando aerolínea+hora). */
export function duffelToOptions(
  offers: DuffelOffer[],
  ctx: { origin: string; destination: string; bookUrl: string },
  max = MAX_OPTIONS
): FlightOption[] {
  const opts = offers
    .map((o) => offerToOption(o, ctx))
    .filter((o): o is FlightOption => o != null)
    .sort((a, b) => a.priceCents - b.priceCents);
  const seen = new Set<string>();
  const out: FlightOption[] = [];
  for (const o of opts) {
    const key = `${o.airline}|${o.departISO?.slice(0, 13) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= max) break;
  }
  return out;
}

/** Oferta más barata de un tramo suelto → LegQuote. */
export function offersToLeg(offers: DuffelOffer[], date: string): LegQuote | null {
  let best: { o: DuffelOffer; cents: number } | null = null;
  for (const o of offers) {
    const cents = amountToCents(o.total_amount);
    if (cents != null && (!best || cents < best.cents)) best = { o, cents };
  }
  if (!best) return null;
  const segs = best.o.slices?.[0]?.segments ?? [];
  const seg = segs[0];
  return {
    date,
    priceCents: best.cents,
    currency: best.o.total_currency || "EUR",
    offerId: best.o.id,
    airline: best.o.owner?.name ?? seg?.marketing_carrier?.name ?? null,
    flightNumber:
      seg?.marketing_carrier?.iata_code && seg?.marketing_carrier_flight_number
        ? `${seg.marketing_carrier.iata_code} ${seg.marketing_carrier_flight_number}`
        : null,
    departISO: seg?.departing_at ?? null,
    arriveISO: segs[segs.length - 1]?.arriving_at ?? null,
    stops: Math.max(0, segs.length - 1),
  };
}
