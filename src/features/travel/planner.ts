/**
 * `FlightSearchPlanner`: de una petición del usuario a la lista de itinerarios
 * que MERECE LA PENA mirar. Puro — sin red, sin BBDD, sin reloj (el "hoy" se
 * inyecta) y sin conocer a Duffel ni a Travelpayouts. Genera candidatos, aplica
 * las restricciones que se pueden decidir sin gastar dinero y deduplica.
 *
 * Aquí NO se puntúa ni se elige: eso es del `CandidateScorer` (fase 2). Este
 * módulo solo responde "¿qué itinerarios son legítimos y distintos entre sí?".
 *
 * EJES DE EXPLORACIÓN (deliberadamente NO es el producto cartesiano de todos):
 *   A. fechas   — aeropuertos pedidos × matriz ±flexDays × {billete único, partido}
 *   B. aeropuertos — aeropuertos alternativos × fechas exactas y ±1 día
 *   C. open-jaw — volver desde/hacia otro aeropuerto, solo en fechas exactas
 *
 * ponytail: el cartesiano completo (9 combinaciones de aeropuertos × 25 fechas ×
 * 3 estructuras ≈ 1.100 candidatos) es puro despilfarro cuando solo 6 llegan a
 * verificarse: llena de ruido los eventos y el prompt sin añadir una sola opción
 * que la selección por cartera fuese a elegir. El techo de este recorte es que un
 * aeropuerto alternativo con 2 días de desplazamiento no se explora; si los datos
 * de la fase 5 dicen que ahí había ahorro, se sube `nearbyFlexDays` y ya.
 */
import {
  AIRPORTS,
  candidateKey,
  distanceKm,
  isMetroCode,
  metroCodeFor,
  nearbyAirports,
  type CandidateLeg,
  type CandidateStructure,
  type FlightCandidate,
  type FlightSearchRequest,
  type RejectionReason,
} from "@nidokey/shared";

const DAY_MS = 86_400_000;

/** Tope de candidatos generados. No es presupuesto de dinero: es de ruido. */
export const MAX_CANDIDATES = 200;
/** Flexibilidad de fechas al explorar aeropuertos alternativos (eje B). */
export const NEARBY_FLEX_DAYS = 1;
/** Rechazos individuales que se conservan para explicar la búsqueda. */
const MAX_REPORTED_REJECTIONS = 50;

export function shiftISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export type PlannerOptions = {
  /** "YYYY-MM-DD". Inyectado siempre: un planificador con reloj no es testeable. */
  todayISO: string;
  maxCandidates?: number;
};

export type PlannerRejection = { key: string; reason: RejectionReason };

export type PlannerResult = {
  /** El baseline (fechas y aeropuertos pedidos) va SIEMPRE el primero. */
  candidates: FlightCandidate[];
  rejected: PlannerRejection[];
  stats: {
    generated: number;
    afterConstraints: number;
    truncated: number;
    byStructure: Record<string, number>;
  };
};

/** Un extremo posible del viaje: el pedido, su código de ciudad o uno cercano. */
type Endpoint = {
  code: string;
  /** Km desde el aeropuerto PEDIDO. 0 para el propio y para un código de ciudad. */
  detourKm: number;
  kind: "requested" | "metro" | "nearby";
};

/**
 * Opciones para un extremo del viaje, en orden de preferencia.
 *
 * El código de ciudad (LON, PAR…) va antes que los aeropuertos sueltos porque
 * cubre a todos sus miembros en UNA consulta. Su `detourKm` es 0 aquí a
 * propósito: al planificar no sabemos qué aeropuerto concreto devolverá el
 * proveedor, así que el traslado real lo calcula el normalizador (fase 2) con el
 * aeropuerto que venga en la oferta. Estimarlo antes sería inventarlo.
 */
function endpointsFor(iata: string, req: FlightSearchRequest): Endpoint[] {
  const code = iata.toUpperCase();
  const out: Endpoint[] = [{ code, detourKm: 0, kind: "requested" }];
  const policy = req.preferences.nearby;
  if (!policy.enabled) return out;

  const metro = policy.useMetroCodes ? metroCodeFor(code) : null;
  if (metro) out.push({ code: metro, detourKm: 0, kind: "metro" });

  for (const n of nearbyAirports(code, {
    radiusKm: policy.maxRadiusKm,
    max: policy.maxAlternatesPerEnd,
    // Si ya entra el código de ciudad, sus aeropuertos están cubiertos: pedirlos
    // sueltos gastaría una consulta en lo mismo.
    excludeSameMetro: true,
  })) {
    out.push({ code: n.iata, detourKm: n.distanceKm, kind: "nearby" });
  }
  return out;
}

/**
 * Pares de fechas (ida, vuelta) dentro de la flexibilidad pedida, SIN filtrar:
 * quien decide qué es válido es `dateRejection`, en un único sitio, para que la
 * regla se pueda probar y explicar en un evento en vez de desaparecer aquí.
 */
function datePairs(
  req: FlightSearchRequest,
  opts: { flexDays: number }
): { depart: string; return: string | null }[] {
  const flex = Math.max(0, opts.flexDays);
  const offsets = Array.from({ length: flex * 2 + 1 }, (_, i) => i - flex);
  const departs = offsets.map((d) => shiftISO(req.departDate, d));
  if (!req.returnDate) return departs.map((depart) => ({ depart, return: null }));
  const returns = offsets.map((d) => shiftISO(req.returnDate!, d));
  const pairs: { depart: string; return: string | null }[] = [];
  for (const depart of departs) for (const ret of returns) pairs.push({ depart, return: ret });
  return pairs;
}

/**
 * ¿Cumple este par de fechas las restricciones? Devuelve el motivo del rechazo
 * o null si es válido.
 *
 * El par EXACTO del usuario nunca se rechaza por estancia mínima ni por longitud
 * de estancia: es lo que ha pedido, y además es el baseline con el que se compara
 * todo lo demás. Solo cae si ya pasó.
 */
function dateRejection(
  pair: { depart: string; return: string | null },
  req: FlightSearchRequest,
  todayISO: string
): RejectionReason | null {
  if (pair.depart < todayISO) return "constraint";
  const isExact = pair.depart === req.departDate && pair.return === req.returnDate;
  if (isExact) return null;
  if (!pair.return) return null;
  if (pair.return < pair.depart) return "constraint";
  const stay = daysBetween(pair.depart, pair.return);
  if (stay < req.preferences.minDaysStay) return "constraint";
  const requestedStay = req.returnDate ? daysBetween(req.departDate, req.returnDate) : 0;
  if (Math.abs(stay - requestedStay) > req.preferences.stayDeltaDays) return "constraint";
  return null;
}

/**
 * Traslado terrestre estimado del itinerario completo, en céntimos.
 *
 * Se cobra por CADA aeropuerto que se pisa: en un ida y vuelta el desvío del
 * origen se paga dos veces (al ir y al volver), y eso sale solo de recorrer los
 * trayectos. Se multiplica por viajeros porque la estimación es de transporte
 * público, que se paga por cabeza — el sentido conservador a propósito: preferimos
 * descartar una opción buena a presentar como barata una que no lo es.
 */
function transferCents(
  legs: CandidateLeg[],
  detourOf: (code: string) => number,
  req: FlightSearchRequest
): number {
  const travelers = req.adults + req.childAges.length;
  const km = legs.reduce((sum, l) => sum + detourOf(l.origin) + detourOf(l.destination), 0);
  return Math.round(km * req.preferences.nearby.groundTransferCentsPerKm * travelers);
}

/** Estructuras posibles para un par de fechas con los aeropuertos dados. */
function structuresFor(hasReturn: boolean, req: FlightSearchRequest): CandidateStructure[] {
  if (!hasReturn) return ["one_way"];
  const out: CandidateStructure[] = ["round_trip"];
  if (req.preferences.allowSplitTickets) out.push("split");
  return out;
}

/**
 * Genera los candidatos de una búsqueda. El baseline (fechas y aeropuertos
 * exactos) va siempre el primero y nunca se descarta.
 */
export function planCandidates(req: FlightSearchRequest, opts: PlannerOptions): PlannerResult {
  const todayISO = opts.todayISO;
  const maxCandidates = Math.max(1, opts.maxCandidates ?? MAX_CANDIDATES);
  const origin = req.origin.toUpperCase();
  const destination = req.destination.toUpperCase();

  const originEnds = endpointsFor(origin, req);
  const destEnds = endpointsFor(destination, req);
  const detour = new Map<string, number>();
  for (const e of [...originEnds, ...destEnds]) detour.set(e.code, e.detourKm);
  const detourOf = (code: string) => detour.get(code.toUpperCase()) ?? 0;

  const seen = new Set<string>();
  const candidates: FlightCandidate[] = [];
  const rejected: PlannerRejection[] = [];
  const byStructure: Record<string, number> = {};
  let generated = 0;
  let truncated = 0;

  const reject = (key: string, reason: RejectionReason) => {
    if (rejected.length < MAX_REPORTED_REJECTIONS) rejected.push({ key, reason });
  };

  const add = (structure: CandidateStructure, legs: CandidateLeg[], pair: { depart: string; return: string | null }) => {
    generated++;
    const key = candidateKey(structure, legs);
    if (seen.has(key)) {
      reject(key, "duplicate");
      return;
    }
    // Un trayecto que empieza y acaba en el mismo sitio no es un vuelo.
    if (legs.some((l) => l.origin === l.destination)) {
      reject(key, "constraint");
      return;
    }
    if (candidates.length >= maxCandidates) {
      truncated++;
      return;
    }
    seen.add(key);

    const isBaseline =
      structure !== "split" &&
      legs[0]!.origin === origin &&
      legs[0]!.destination === destination &&
      pair.depart === req.departDate &&
      pair.return === req.returnDate &&
      legs.every((l) => l.origin === origin || l.origin === destination) &&
      legs.every((l) => l.destination === origin || l.destination === destination);

    const requestedStay = req.returnDate ? daysBetween(req.departDate, req.returnDate) : 0;
    const stay = pair.return ? daysBetween(pair.depart, pair.return) : 0;

    candidates.push({
      key,
      structure,
      legs,
      driftDays: {
        depart: daysBetween(req.departDate, pair.depart),
        return: req.returnDate && pair.return ? daysBetween(req.returnDate, pair.return) : null,
      },
      stayDeltaDays: pair.return ? stay - requestedStay : 0,
      isBaseline,
      groundTransferEstimate: transferCents(legs, detourOf, req),
      detourKm: {
        origin: Math.round(detourOf(legs[0]!.origin)),
        destination: Math.round(detourOf(legs[0]!.destination)),
      },
      estimate: { totalCents: null, source: "none" },
      score: 0,
      scorerVersion: "none",
      selectedForVerification: false,
      selectionReason: null,
    });
    byStructure[structure] = (byStructure[structure] ?? 0) + 1;
  };

  const legsFor = (
    out: { from: string; to: string },
    back: { from: string; to: string } | null,
    pair: { depart: string; return: string | null }
  ): CandidateLeg[] => {
    const legs: CandidateLeg[] = [{ origin: out.from, destination: out.to, date: pair.depart }];
    if (back && pair.return) legs.push({ origin: back.from, destination: back.to, date: pair.return });
    return legs;
  };

  // ── Eje A: fechas, con los aeropuertos que pidió el usuario ───────────────
  const allPairs = datePairs(req, { flexDays: req.preferences.flexDays });
  const validPairs: { depart: string; return: string | null }[] = [];
  for (const pair of allPairs) {
    const reason = dateRejection(pair, req, todayISO);
    if (reason) {
      generated++;
      const structure = pair.return ? "round_trip" : "one_way";
      reject(candidateKey(structure, legsFor({ from: origin, to: destination }, { from: destination, to: origin }, pair)), reason);
      continue;
    }
    validPairs.push(pair);
  }
  // El par exacto manda: primero de la lista para que el baseline sea el candidato 0.
  validPairs.sort((a, b) => {
    const ax = a.depart === req.departDate && a.return === req.returnDate ? 0 : 1;
    const bx = b.depart === req.departDate && b.return === req.returnDate ? 0 : 1;
    return ax - bx || a.depart.localeCompare(b.depart) || (a.return ?? "").localeCompare(b.return ?? "");
  });

  for (const pair of validPairs) {
    for (const structure of structuresFor(pair.return != null, req)) {
      add(structure, legsFor({ from: origin, to: destination }, { from: destination, to: origin }, pair), pair);
    }
  }

  // ── Eje B: aeropuertos alternativos, con poca flexibilidad de fechas ──────
  const altOrigins = originEnds.filter((e) => e.kind !== "requested");
  const altDests = destEnds.filter((e) => e.kind !== "requested");
  if (altOrigins.length || altDests.length) {
    const nearFlex = Math.min(NEARBY_FLEX_DAYS, req.preferences.flexDays);
    const nearPairs = datePairs(req, { flexDays: nearFlex }).filter((p) => !dateRejection(p, req, todayISO));
    // Se varía UN extremo a la vez: cambiar los dos multiplica las consultas y
    // apila dos traslados terrestres, que casi siempre se come el ahorro.
    const combos = [
      ...altOrigins.map((o) => ({ from: o.code, to: destination })),
      ...altDests.map((d) => ({ from: origin, to: d.code })),
    ];
    for (const combo of combos) {
      for (const pair of nearPairs) {
        add(
          pair.return ? "round_trip" : "one_way",
          legsFor(combo, { from: combo.to, to: combo.from }, pair),
          pair
        );
      }
    }
  }

  // ── Eje C: open-jaw, solo en fechas exactas ──────────────────────────────
  const exactPair = validPairs.find((p) => p.depart === req.departDate && p.return === req.returnDate);
  if (req.preferences.allowOpenJaw && exactPair?.return) {
    // Volver desde otro aeropuerto del destino, o aterrizar en otro de casa.
    // Los códigos de ciudad no generan open-jaw: ya cubren a todos sus miembros
    // dentro de la misma consulta, así que no hay nada nuevo que preguntar.
    const backFroms = destEnds.filter((e) => e.kind === "nearby").map((e) => e.code);
    const backTos = originEnds.filter((e) => e.kind === "nearby").map((e) => e.code);
    for (const from of backFroms) {
      add("open_jaw", legsFor({ from: origin, to: destination }, { from, to: origin }, exactPair), exactPair);
    }
    for (const to of backTos) {
      add("open_jaw", legsFor({ from: origin, to: destination }, { from: destination, to }, exactPair), exactPair);
    }
  }

  // El baseline es innegociable: si por lo que sea no se generó (fecha pasada),
  // quien llame debe saberlo — de ahí que se ordene primero y no se falsee.
  candidates.sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline));

  return {
    candidates,
    rejected,
    stats: { generated, afterConstraints: candidates.length, truncated, byStructure },
  };
}

/**
 * Aeropuertos concretos que cubre un código de candidato. Sirve para explicar en
 * la UI qué se está mirando ("LON = Heathrow, Gatwick, Stansted…") sin que el
 * cliente tenga que conocer la tabla.
 */
export function expandCode(code: string): string[] {
  const c = code.toUpperCase();
  if (!isMetroCode(c)) return AIRPORTS[c] ? [c] : [];
  return Object.entries(AIRPORTS)
    .filter(([iata]) => metroCodeFor(iata) === c)
    .map(([iata]) => iata)
    .sort();
}

/** Km entre dos códigos, o 0 si alguno es desconocido o es un código de ciudad. */
export function detourBetween(a: string, b: string): number {
  return Math.round(distanceKm(a, b) ?? 0);
}
