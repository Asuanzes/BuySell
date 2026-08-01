/**
 * Orquestación de la BÚSQUEDA INTELIGENTE de vuelos (el I/O; la lógica pura y
 * testeable está en ./flight-search.ts).
 *
 * Dos fases, por coste:
 *   1. BARATA — Travelpayouts (cacheado, gratis): 2 llamadas de calendario dan
 *      el mínimo por día y puntúan las 25 combinaciones de fechas.
 *   2. CARA — Duffel (en vivo, se paga por petición): solo los K mejores
 *      candidatos, con un presupuesto DURO de llamadas que se descuenta del
 *      tope diario del usuario.
 *
 * El LLM (Haiku → Groq) hace dos cosas y ninguna es aritmética: priorizar
 * candidatos de la matriz y redactar el resumen. Si falla cualquiera de las dos,
 * la búsqueda sigue con el orden determinista y sin resumen.
 */
import { duffelSearchOffers } from "@/features/sources/providers/duffel";
import { flightPriceCalendar } from "@/features/sources/providers/travelpayouts";
import { extractJsonArray, llmText } from "@/lib/llm";
// Una sola implementación del parseo de calendarios, la del motor nuevo. Antes
// había una copia privada aquí y otra en normalize.ts: dos sitios donde
// arreglar el mismo formato raro de Travelpayouts.
import { parseCalendar } from "./normalize";
import {
  AI_CANDIDATES,
  MIN_DAYS_STAY,
  aviasalesUrl,
  buildDateMatrix,
  buildSplitCombos,
  daysBetween,
  duffelToOptions,
  finalizeAiItems,
  offersToLeg,
  planDuffelJobs,
  rankCandidates,
  scorePair,
  shiftOf,
  type DatePair,
  type DayPrices,
  type FlightOption,
  type FlightSearchResponse,
  type LegQuote,
} from "./flight-search";

/** Candidatos que ve el LLM. Acotado: el prompt no puede crecer con la matriz. */
const LLM_SHORTLIST = 8;

export type AiSearchParams = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  childAges: number[];
  lang: "es" | "en";
  /** Presupuesto DURO de llamadas a Duffel (ya recortado por la cuota diaria). */
  maxDuffelCalls: number;
  /** Inyectable para pruebas; por defecto hoy en UTC. */
  todayISO?: string;
};

export type AiSearchResult = {
  items: FlightOption[];
  ai: NonNullable<FlightSearchResponse["ai"]>;
};

/** "YYYY-MM-DD" de hoy (UTC). */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_CALENDARS = { depart: {} as DayPrices, return: {} as DayPrices };

/** Fase barata: 2 llamadas cacheadas. Si falla, se sigue sin señal de precio. */
async function loadCalendars(p: AiSearchParams): Promise<{ depart: DayPrices; return: DayPrices }> {
  // Sin token no hay nada que pedir: salir aquí evita 1,4 s de throttle antes de
  // un error garantizado (el cliente duerme ANTES de comprobar la credencial).
  if (!process.env.TRAVELPAYOUTS_TOKEN?.trim()) return EMPTY_CALENDARS;
  const base = { origin: p.origin, destination: p.destination, currency: "eur" };
  const month = (iso: string) => iso.slice(0, 7);
  const [dep, ret] = await Promise.all([
    flightPriceCalendar({ ...base, departDate: month(p.departDate), calendarType: "departure_date" })
      .then(parseCalendar)
      .catch((err) => {
        console.error("[ai-flights] calendario ida:", err instanceof Error ? err.message : err);
        return {} as DayPrices;
      }),
    p.returnDate
      ? flightPriceCalendar({
          ...base,
          departDate: month(p.departDate),
          returnDate: month(p.returnDate),
          calendarType: "return_date",
        })
          .then(parseCalendar)
          .catch((err) => {
            console.error("[ai-flights] calendario vuelta:", err instanceof Error ? err.message : err);
            return {} as DayPrices;
          })
      : Promise.resolve({} as DayPrices),
  ]);
  return { depart: dep, return: ret };
}

/**
 * El LLM reordena la preselección determinista (fechas baratas cerca de lo
 * pedido). Puede aportar contexto que el precio cacheado no ve — evitar un
 * puente, preferir salir un martes. Cualquier respuesta rara → orden original.
 */
async function prioritize(shortlist: DatePair[], scoreOf: (p: DatePair) => number, lang: "es" | "en"): Promise<DatePair[]> {
  if (shortlist.length <= 1) return shortlist;
  const rows = shortlist.map((p, i) => {
    const hint = scoreOf(p);
    const price = Number.isFinite(hint) ? `~${Math.round(hint / 100)} EUR` : "sin dato";
    return `${i}: ida ${p.depart}${p.return ? ` · vuelta ${p.return}` : ""} · ${price}`;
  });
  const text = await llmText({
    system:
      "Eres un analista de precios de vuelos. Respondes SOLO con un array JSON de índices, sin texto alrededor.",
    prompt:
      `Candidatos de fechas para un vuelo (precio orientativo cacheado):\n${rows.join("\n")}\n\n` +
      `Ordena los índices del más prometedor al menos prometedor para encontrar el billete más barato. ` +
      `Ten en cuenta el precio orientativo y el día de la semana (salir/volver en fin de semana suele encarecer). ` +
      `Devuelve SOLO un array JSON con TODOS los índices, p. ej. [2,0,1]. Idioma irrelevante: solo números. (${lang})`,
    maxTokens: 120,
    // Corto: esto va ANTES de Duffel en el camino crítico y solo reordena una
    // lista que ya viene ordenada por precio. Si no contesta a tiempo, no pasa nada.
    timeoutMs: 4_000,
  });
  const parsed = extractJsonArray(text);
  if (!parsed) return shortlist;
  const seen = new Set<number>();
  const ordered: DatePair[] = [];
  for (const raw of parsed) {
    const i = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= shortlist.length || seen.has(i)) continue;
    seen.add(i);
    ordered.push(shortlist[i]!);
  }
  // Lo que el modelo se dejó fuera se conserva al final: nunca perdemos candidatos.
  for (let i = 0; i < shortlist.length; i++) if (!seen.has(i)) ordered.push(shortlist[i]!);
  return ordered;
}

/** Resumen en lenguaje natural. null si el LLM no está disponible. */
async function summarize(
  items: FlightOption[],
  baselineCents: number | null,
  lang: "es" | "en"
): Promise<string | null> {
  const best = items[0];
  if (!best) return null;
  const euros = (c: number) => `${(c / 100).toFixed(2)} EUR`;
  const lines = items.slice(0, 3).map((it) => {
    const shift = it.dateShift
      ? `ida ${it.dateShift.depart >= 0 ? "+" : ""}${it.dateShift.depart}d${
          it.dateShift.return != null ? `, vuelta ${it.dateShift.return >= 0 ? "+" : ""}${it.dateShift.return}d` : ""
        }`
      : "fechas exactas";
    const type = it.ticketType === "split" ? "dos billetes de ida separados" : "billete único";
    return `- ${euros(it.priceCents)} · ${shift} · ${type} · ${it.airline ?? "?"}${
      it.returnAirline && it.returnAirline !== it.airline ? ` + ${it.returnAirline}` : ""
    } · ahorro ${it.savingsPct ?? 0}%`;
  });
  return llmText({
    system:
      lang === "en"
        ? "You explain flight price findings to a traveller. Plain, concrete, no marketing. Never invent numbers."
        : "Explicas hallazgos de precios de vuelo a un viajero. Lenguaje llano y concreto, sin marketing. Nunca inventes cifras.",
    prompt:
      `Búsqueda normal (fechas exactas, billete único): ${baselineCents != null ? euros(baselineCents) : "sin resultado"}.\n` +
      `Mejores opciones encontradas:\n${lines.join("\n")}\n\n` +
      (lang === "en"
        ? "In 2 short sentences, say what the cheapest option is and WHY it is cheaper (date shift, split ticket, airline). If a split ticket wins, warn that they are two separate bookings."
        : "En 2 frases cortas, di cuál es la opción más barata y POR QUÉ lo es (cambio de fechas, billete partido, aerolínea). Si gana un billete partido, avisa de que son dos reservas separadas."),
    maxTokens: 200,
    timeoutMs: 6_000,
  });
}

/**
 * Único proveedor inyectable. Duffel cobra por petición, así que la prueba de
 * integración de esta función NO puede llamarlo de verdad; el resto (calendario
 * de Travelpayouts y LLM) ya degrada solo cuando faltan las claves.
 */
export type AiSearchDeps = { searchOffers: typeof duffelSearchOffers };

export async function aiFlightSearch(
  p: AiSearchParams,
  deps: AiSearchDeps = { searchOffers: duffelSearchOffers }
): Promise<AiSearchResult> {
  const todayISO = p.todayISO ?? todayUTC();
  const exact: DatePair = { depart: p.departDate, return: p.returnDate ?? null };
  const pax = p.adults + p.childAges.length;
  // Estancia mínima: 1 día, salvo que el usuario haya pedido menos (ida y vuelta
  // el mismo día) — su propio itinerario nunca se descarta por esta regla.
  const requestedStay = exact.return ? daysBetween(exact.depart, exact.return) : MIN_DAYS_STAY;
  const minDaysStay = Math.min(MIN_DAYS_STAY, Math.max(0, requestedStay));

  const matrix = buildDateMatrix({
    departDate: p.departDate,
    returnDate: p.returnDate,
    minDaysStay,
    todayISO,
  });
  if (!matrix.length) {
    return {
      items: [],
      ai: { baselineCents: null, duffelCalls: { max: p.maxDuffelCalls, used: 0 }, partial: false, degraded: "no_dates", summary: null },
    };
  }

  // ── Fase barata ──
  const cal = await loadCalendars(p);
  const scoreOf = (pair: DatePair) => scorePair(pair, cal);
  const shortlist = rankCandidates(matrix, scoreOf, { exact, k: LLM_SHORTLIST });
  const prioritized = await prioritize(shortlist, scoreOf, p.lang);
  // El LLM propone, pero las fechas exactas siguen siendo obligatorias y las
  // primeras: son el baseline y no cuestan una llamada extra.
  const llmRank = new Map(prioritized.map((pair, i) => [`${pair.depart}|${pair.return}`, i]));
  const candidates = rankCandidates(prioritized, (pair) => llmRank.get(`${pair.depart}|${pair.return}`) ?? Infinity, {
    exact,
    k: AI_CANDIDATES,
  });

  // ── Fase cara ──
  // EN PARALELO, no en cadena. El presupuesto de DINERO ya lo fijó planDuffelJobs
  // (los trabajos vienen recortados), así que lanzarlos a la vez no gasta ni una
  // llamada de más — pero el de TIEMPO también manda: en serie, 6 búsquedas en
  // vivo suman >20 s y el cliente móvil aborta antes de ver un solo vuelo.
  const { jobs, skipped } = planDuffelJobs(candidates, p.maxDuffelCalls);
  const singles: FlightOption[] = [];
  const outLegs: LegQuote[] = [];
  const backLegs: LegQuote[] = [];
  let baselineCents: number | null = null;
  const used = jobs.length; // la petición se cobra aunque falle: se cuentan todas

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const offers =
          job.kind === "single"
            ? await deps.searchOffers({
                origin: p.origin,
                destination: p.destination,
                departDate: job.pair.depart,
                returnDate: job.pair.return ?? undefined,
                adults: p.adults,
                childAges: p.childAges,
              })
            : await deps.searchOffers({
                origin: job.direction === "out" ? p.origin : p.destination,
                destination: job.direction === "out" ? p.destination : p.origin,
                departDate: job.date,
                adults: p.adults,
                childAges: p.childAges,
              });
        return { job, offers };
      } catch (err) {
        // Un candidato caído no tumba la búsqueda: se pierde esa variante y ya.
        console.error("[ai-flights] duffel job:", JSON.stringify(job), err instanceof Error ? err.message : err);
        return null;
      }
    })
  );

  // El reparto va aparte y EN ORDEN: así el resultado no depende de cuál de las
  // peticiones concurrentes conteste antes.
  for (const r of results) {
    if (!r) continue;
    const { job, offers } = r;
    if (job.kind === "single") {
      const bookUrl = aviasalesUrl(p.origin, p.destination, job.pair.depart, job.pair.return, pax);
      const opts = duffelToOptions(offers, { origin: p.origin, destination: p.destination, bookUrl }).map((o) => ({
        ...o,
        ticketType: "single" as const,
        bookUrls: [bookUrl],
        dateShift: shiftOf(job.pair, exact),
      }));
      singles.push(...opts);
      if (job.pair.depart === exact.depart && job.pair.return === exact.return && opts.length) {
        baselineCents = Math.min(...opts.map((o) => o.priceCents));
      }
    } else {
      const leg = offersToLeg(offers, job.date);
      if (leg) (job.direction === "out" ? outLegs : backLegs).push(leg);
    }
  }

  // ── Recombinación de tramos: sale gratis, no gasta presupuesto ──
  const splits: FlightOption[] = buildSplitCombos(outLegs, backLegs, minDaysStay).map(({ out, back }) => {
    const outUrl = aviasalesUrl(p.origin, p.destination, out.date, null, pax);
    const backUrl = aviasalesUrl(p.destination, p.origin, back.date, null, pax);
    return {
      offerId: out.offerId,
      origin: p.origin,
      destination: p.destination,
      priceCents: out.priceCents + back.priceCents,
      currency: out.currency,
      airline: out.airline,
      flightNumber: out.flightNumber,
      departISO: out.departISO,
      returnISO: back.departISO,
      returnArriveISO: back.arriveISO,
      stops: out.stops,
      bookUrl: outUrl,
      ticketType: "split" as const,
      bookUrls: [outUrl, backUrl],
      dateShift: shiftOf({ depart: out.date, return: back.date }, exact),
      returnAirline: back.airline,
    };
  });

  const items = finalizeAiItems([...singles, ...splits], baselineCents);
  return {
    items,
    ai: {
      baselineCents,
      duffelCalls: { max: p.maxDuffelCalls, used },
      partial: skipped > 0,
      degraded: null,
      summary: await summarize(items, baselineCents, p.lang),
    },
  };
}
