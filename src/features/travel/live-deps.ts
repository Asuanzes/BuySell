/**
 * Implementaciones REALES de las dependencias del orquestador: calendarios de
 * Travelpayouts y las dos tareas del LLM. Viven aparte para que
 * `stream-search.ts` siga siendo probable sin red y sin claves.
 *
 * Las tres degradan solas: sin credencial o sin respuesta devuelven vacío o
 * null, y la búsqueda continúa con lo determinista.
 */
import type { FlightCandidate, FlightSearchRequest, FlightSearchResponse } from "@nidokey/shared";
import { flightPriceCalendar } from "@/features/sources/providers/travelpayouts";
import { duffelSearchOffers } from "@/features/sources/providers/duffel";
import { extractJsonArray, llmText } from "@/lib/llm";
import { HeuristicScorer } from "./scorer";
import { parseCalendar } from "./normalize";
import type { SearchDeps } from "./stream-search";
import type { DayPrices } from "./scorer";

const EMPTY = { depart: {} as DayPrices, return: {} as DayPrices };

/**
 * Fase barata: dos llamadas cacheadas y gratis. Sin token se sale ANTES de
 * pedir nada — el cliente duerme 700 ms de throttle antes de comprobar la
 * credencial, y esperar para fallar seguro es tiempo regalado.
 */
export async function loadCalendars(
  r: FlightSearchRequest
): Promise<{ depart: DayPrices; return: DayPrices }> {
  if (!process.env.TRAVELPAYOUTS_TOKEN?.trim()) return EMPTY;
  const base = { origin: r.origin, destination: r.destination, currency: r.currency.toLowerCase() };
  const month = (iso: string) => iso.slice(0, 7);
  const fail = (which: string) => (err: unknown) => {
    console.error(`[flights] calendario ${which}:`, err instanceof Error ? err.message : err);
    return {} as DayPrices;
  };
  const [depart, ret] = await Promise.all([
    flightPriceCalendar({ ...base, departDate: month(r.departDate), calendarType: "departure_date" })
      .then(parseCalendar)
      .catch(fail("ida")),
    r.returnDate
      ? flightPriceCalendar({
          ...base,
          departDate: month(r.departDate),
          returnDate: month(r.returnDate),
          calendarType: "return_date",
        })
          .then(parseCalendar)
          .catch(fail("vuelta"))
      : Promise.resolve({} as DayPrices),
  ]);
  return { depart, return: ret };
}

/**
 * El LLM reordena la preselección. Devuelve CLAVES de candidato, así que no
 * puede inventarse un itinerario: lo que no reconozca se ignora.
 *
 * Va en el camino crítico (decide qué se verifica con dinero), así que el
 * timeout es corto: si no contesta, manda el orden determinista y no pasa nada.
 */
export async function prioritize(
  candidates: FlightCandidate[],
  r: FlightSearchRequest
): Promise<string[]> {
  if (candidates.length <= 1) return candidates.map((c) => c.key);
  const rows = candidates.map((c, i) => {
    const est = c.estimate.totalCents;
    const legs = c.legs.map((l) => `${l.origin}→${l.destination} ${l.date}`).join(" · ");
    return `${i}: ${legs} · ${c.structure}${est ? ` · ~${Math.round(est / 100)} ${r.currency}` : ""}`;
  });
  const text = await llmText({
    system: "Eres un analista de precios de vuelos. Respondes SOLO con un array JSON de índices, sin texto alrededor.",
    prompt:
      `Candidatos de itinerario (precio orientativo cacheado, puede faltar):\n${rows.join("\n")}\n\n` +
      `Ordena los índices del más prometedor al menos prometedor para encontrar el viaje más barato. ` +
      `Ten en cuenta el día de la semana (salir viernes o volver domingo suele encarecer) y que un ` +
      `billete partido o un aeropuerto alternativo pueden salir a cuenta. ` +
      `Devuelve SOLO un array JSON con TODOS los índices, p. ej. [2,0,1].`,
    maxTokens: 120,
    timeoutMs: 4_000,
  });
  const parsed = extractJsonArray(text);
  if (!parsed) return candidates.map((c) => c.key);
  const seen = new Set<number>();
  const ordered: string[] = [];
  for (const raw of parsed) {
    const i = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue;
    seen.add(i);
    ordered.push(candidates[i]!.key);
  }
  for (let i = 0; i < candidates.length; i++) if (!seen.has(i)) ordered.push(candidates[i]!.key);
  return ordered;
}

/**
 * Resumen en lenguaje natural SOBRE DATOS YA CALCULADOS. El modelo recibe cifras
 * hechas y su único trabajo es explicar el porqué del ahorro; no suma, no
 * convierte y no compara nada por su cuenta.
 */
export async function summarize(
  response: FlightSearchResponse,
  r: FlightSearchRequest
): Promise<string | null> {
  const best = response.offers[0];
  if (!best) return null;
  const money = (c: number) => `${(c / 100).toFixed(2)} ${r.currency}`;
  const lines = response.offers.slice(0, 3).map((o) => {
    const tipo =
      o.ticketType === "split"
        ? "dos billetes de ida separados"
        : o.structure === "open_jaw"
          ? "vuelta desde otro aeropuerto"
          : "billete único";
    const extra = o.estimatedComponents.length ? ` · incluye estimación de ${o.estimatedComponents.join(" y ")}` : "";
    return `- ${money(o.totalTripCost)} · ${tipo} · ${o.legs[0]?.airline ?? "?"} · ${o.stopCount} escalas${extra}` +
      (o.savingsPct != null ? ` · ahorro ${o.savingsPct}%` : "");
  });
  return llmText({
    system:
      r.lang === "en"
        ? "You explain flight price findings to a traveller. Plain, concrete, no marketing. Never invent or recompute numbers."
        : "Explicas hallazgos de precios de vuelo a un viajero. Lenguaje llano y concreto, sin marketing. Nunca inventes ni recalcules cifras.",
    prompt:
      `Búsqueda normal (fechas y aeropuertos exactos): ${
        response.baseline ? money(response.baseline.totalTripCost) : "sin resultado"
      }.\nMejores opciones por COSTE TOTAL:\n${lines.join("\n")}\n\n` +
      (r.lang === "en"
        ? "In 2 short sentences: which is cheapest and WHY (dates, split ticket, airport, airline). If a split ticket or a different airport wins, warn about the separate bookings or the ground transfer."
        : "En 2 frases cortas: cuál es la más barata y POR QUÉ lo es (fechas, billete partido, aeropuerto, aerolínea). Si gana un billete partido o un aeropuerto distinto, avisa de las reservas separadas o del traslado."),
    maxTokens: 200,
    timeoutMs: 6_000,
  });
}

/** Dependencias de producción del orquestador. */
export function liveDeps(): SearchDeps {
  return {
    searchOffers: duffelSearchOffers,
    loadCalendars,
    prioritize,
    summarize,
    scorer: new HeuristicScorer(),
    now: () => new Date().toISOString(),
  };
}
