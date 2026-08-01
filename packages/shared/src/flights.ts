/**
 * CONTRATOS de la búsqueda inteligente de vuelos: entrada, dominio, oferta
 * normalizada, eventos de progreso y respuesta. Fuente única para el backend
 * (Next) y para la app (Expo) — hasta ahora la app redeclaraba estos tipos a
 * mano en viajes/nuevo.tsx y se desincronizaban en silencio.
 *
 * Reglas que sostienen todo el motor:
 *   - DINERO en céntimos enteros, siempre (convención del repo).
 *   - El ranking económico usa `totalTripCost`, NUNCA la tarifa pelada: un
 *     billete barato con maleta obligatoria y traslado a otro aeropuerto puede
 *     salir más caro que el "caro".
 *   - `confidence` distingue lo que SABEMOS de lo que SUPONEMOS. Nada se
 *     presenta como disponible sin `verified`.
 *   - El LLM no escribe ni un número de estos objetos: los rellena código
 *     determinista a partir de respuestas de proveedor.
 *
 * Sin APIs de Node ni Prisma: viaja a React Native vía @nidokey/shared. La app
 * importa SOLO tipos (`import type`), así que zod no entra en su bundle.
 */
import { z } from "zod";

/** Versión del algoritmo. Sube al cambiar generación, puntuación o coste total. */
export const ALGO_VERSION = "fs-1";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** IATA de aeropuerto ("BCN") o de ciudad/metro ("LON"): tres letras mayúsculas. */
const Iata = z.string().regex(/^[A-Z]{3}$/, "IATA de 3 letras mayúsculas");
const IsoDate = z.string().regex(ISO_DATE_RE, "fecha YYYY-MM-DD");
/** Importe en CÉNTIMOS. Entero y no negativo: aquí no entran euros con decimales. */
const Money = z.number().int().nonnegative();
const Currency = z.string().regex(/^[A-Z]{3}$/, "ISO-4217 en mayúsculas");

// ── Preferencias ────────────────────────────────────────────────────────────

/**
 * Política de aeropuertos cercanos. `enabled` viene ENCENDIDA (decisión de
 * producto 2026-08-01): explorar el aeropuerto de al lado es de las palancas
 * que más ahorro dan en rutas europeas.
 *
 * `useMetroCodes` es la variante barata: pedir "LON" cubre los seis aeropuertos
 * de Londres en UNA consulta. Solo los aeropuertos que no pertenecen a un código
 * de ciudad (Girona, Beauvais, Charleroi…) consumen una consulta propia.
 */
export const NearbyAirportPolicy = z.object({
  enabled: z.boolean().default(true),
  /** Radio máximo, en km, para considerar un aeropuerto "cercano". */
  maxRadiusKm: z.number().int().min(0).max(300).default(120),
  /** Alternativos por extremo (origen y destino cuentan por separado). */
  maxAlternatesPerEnd: z.number().int().min(0).max(2).default(1),
  useMetroCodes: z.boolean().default(true),
  /**
   * Coste de traslado terrestre por km y VIAJERO, en céntimos. Es una
   * ESTIMACIÓN grosera de transporte público (bus/tren de aeropuerto), no un
   * precio real: 18 c/km deja el bus Barcelona↔Girona en ~16 €/trayecto, que es
   * lo que cuesta de verdad. Es el mando de calibración de esta función: si las
   * estimaciones se ven altas o bajas en producción, se ajusta AQUÍ.
   */
  groundTransferCentsPerKm: z.number().int().min(0).max(200).default(18),
  /** Por debajo de este ahorro no se propone un desvío. 20 € por defecto. */
  minSavingsToOfferCents: Money.default(2000),
});
export type NearbyAirportPolicy = z.infer<typeof NearbyAirportPolicy>;

/**
 * Restricciones del viajero. Todas se aplican ANTES de consultar proveedores:
 * un candidato que las incumple no llega a costar dinero.
 */
export const SearchPreferences = z.object({
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  /** Escalas máximas por trayecto. Duffel lo filtra en origen (`max_connections`). */
  maxStops: z.number().int().min(0).max(2).default(1),
  maxDurationMinutes: z.number().int().min(60).max(3000).optional(),
  /** Noches mínimas. La vuelta jamás cruza por delante de la ida. */
  minDaysStay: z.number().int().min(0).max(30).default(1),
  /** Flexibilidad de fechas a cada lado, en días. */
  flexDays: z.number().int().min(0).max(2).default(2),
  /**
   * Variación máxima de la DURACIÓN de la estancia, en días. Por defecto 4
   * (= 2·flexDays), que es justo lo que permite una matriz ±2 completa: así el
   * comportamiento por defecto es idéntico al de la búsqueda actual. Bajarlo a
   * 1 es como decir "muéveme el viaje, pero no me lo alargues".
   */
  stayDeltaDays: z.number().int().min(0).max(6).default(4),
  allowSplitTickets: z.boolean().default(true),
  allowOpenJaw: z.boolean().default(true),
  /** Maletas facturadas que el viajero NECESITA (entran en el coste total). */
  checkedBags: z.number().int().min(0).max(3).default(0),
  nearby: NearbyAirportPolicy.default({}),
});
export type SearchPreferences = z.infer<typeof SearchPreferences>;

// ── Petición ────────────────────────────────────────────────────────────────

export const FlightSearchRequest = z
  .object({
    origin: Iata,
    destination: Iata,
    departDate: IsoDate,
    /** null = solo ida. */
    returnDate: IsoDate.nullable().default(null),
    adults: z.number().int().min(1).max(9).default(1),
    childAges: z.array(z.number().int().min(0).max(17)).max(4).default([]),
    currency: Currency.default("EUR"),
    /** Mercado de tarifa (país de venta). NO es la ubicación del usuario. */
    market: z.string().regex(/^[A-Z]{2}$/).default("ES"),
    lang: z.enum(["es", "en"]).default("es"),
    aiSearch: z.boolean().default(false),
    preferences: SearchPreferences.default({}),
  })
  .refine((r) => !r.returnDate || r.returnDate >= r.departDate, {
    message: "returnDate no puede ser anterior a departDate",
    path: ["returnDate"],
  })
  .refine((r) => r.origin !== r.destination, {
    message: "origen y destino no pueden coincidir",
    path: ["destination"],
  });
export type FlightSearchRequest = z.infer<typeof FlightSearchRequest>;

/** Resumen ANONIMIZADO de la petición: lo que puede viajar en eventos y registros. */
export const FlightSearchRequestSummary = z.object({
  origin: Iata,
  destination: Iata,
  departDate: IsoDate,
  returnDate: IsoDate.nullable(),
  travelers: z.number().int().min(1),
  cabin: SearchPreferences.shape.cabin,
  currency: Currency,
  market: z.string().length(2),
});
export type FlightSearchRequestSummary = z.infer<typeof FlightSearchRequestSummary>;

// ── Candidatos ──────────────────────────────────────────────────────────────

/**
 * Forma de comprar el itinerario:
 *  - `round_trip`: un billete con ida y vuelta.
 *  - `split`: dos solo-idas independientes (pueden ser de aerolíneas distintas;
 *    sin protección de conexión — se marca `selfTransfer`).
 *  - `open_jaw`: se vuelve desde/hacia un aeropuerto distinto al de llegada.
 *  - `one_way`: solo ida.
 */
export const CandidateStructure = z.enum(["round_trip", "split", "open_jaw", "one_way"]);
export type CandidateStructure = z.infer<typeof CandidateStructure>;

export const CandidateLeg = z.object({
  origin: Iata,
  destination: Iata,
  date: IsoDate,
});
export type CandidateLeg = z.infer<typeof CandidateLeg>;

export const EstimateSource = z.enum(["calendar", "history", "none"]);

/** Por qué un candidato entró en la fase cara (o no). */
export const SelectionReason = z.enum(["baseline", "top_score", "diversity", "exploration"]);

export const FlightCandidate = z.object({
  /** Clave canónica (ver `candidateKey`): dos candidatos iguales la comparten. */
  key: z.string().min(1),
  structure: CandidateStructure,
  legs: z.array(CandidateLeg).min(1).max(2),
  /** Días de desplazamiento frente a lo que pidió el usuario. */
  driftDays: z.object({ depart: z.number().int(), return: z.number().int().nullable() }),
  /** Diferencia de DURACIÓN de la estancia frente a lo pedido, en días. */
  stayDeltaDays: z.number().int(),
  /** Fechas y aeropuertos exactos del usuario: el punto de comparación. */
  isBaseline: z.boolean(),
  /** Traslado terrestre estimado (ida y vuelta, todos los viajeros). 0 si no hay desvío. */
  groundTransferEstimate: Money.default(0),
  /** Km de desvío por extremo, para poder explicar el traslado en la UI. */
  detourKm: z.object({ origin: z.number().int().nonnegative(), destination: z.number().int().nonnegative() }).default({ origin: 0, destination: 0 }),
  estimate: z.object({ totalCents: Money.nullable(), source: EstimateSource }),
  /** Probabilidad de mejorar el baseline, 0..1. La pone un `CandidateScorer`. */
  score: z.number().min(0).max(1).default(0),
  scorerVersion: z.string().default("none"),
  selectedForVerification: z.boolean().default(false),
  selectionReason: SelectionReason.nullable().default(null),
});
export type FlightCandidate = z.infer<typeof FlightCandidate>;

/**
 * Clave canónica de un candidato. Determinista y estable entre procesos: es la
 * base del dedup, del registro de observaciones y de la semilla de exploración.
 *
 * La ESTRUCTURA entra en la clave a propósito: los mismos dos trayectos comprados
 * como billete único o como dos solo-idas son productos distintos (uno protege la
 * conexión y el otro no), así que no deben fundirse.
 */
export function candidateKey(structure: CandidateStructure, legs: CandidateLeg[]): string {
  return `${structure}:${legs
    .map((l) => `${l.origin.toUpperCase()}-${l.destination.toUpperCase()}@${l.date}`)
    .join("+")}`;
}

// ── Oferta normalizada ──────────────────────────────────────────────────────

/**
 * Qué tan firme es un precio:
 *  - `observed`: visto en datos cacheados de terceros (Travelpayouts: 2-7 días).
 *  - `estimated`: derivado por nosotros (traslado, maleta sin tarifa publicada).
 *  - `verified`: devuelto por una consulta EN VIVO al proveedor, aún vigente.
 *  - `expired`: fue verificado, pero pasó su `expiresAt`.
 * Solo `verified` puede presentarse como disponible.
 */
export const OfferConfidence = z.enum(["observed", "estimated", "verified", "expired"]);
export type OfferConfidence = z.infer<typeof OfferConfidence>;

export const OfferLeg = z.object({
  origin: Iata,
  destination: Iata,
  departISO: z.string(),
  arriveISO: z.string().nullable(),
  airline: z.string().nullable(),
  flightNumber: z.string().nullable(),
  stops: z.number().int().min(0),
  durationMinutes: z.number().int().positive().nullable(),
});
export type OfferLeg = z.infer<typeof OfferLeg>;

export const NormalizedOffer = z.object({
  candidateKey: z.string().min(1),
  /** Ids del proveedor (2 en un billete partido). Vacío si el precio es `observed`. */
  offerIds: z.array(z.string()).max(2),
  structure: CandidateStructure,
  ticketType: z.enum(["single", "split"]),

  // ── Desglose del coste. La suma de estos cinco ES `totalTripCost`. ──
  fareTotal: Money,
  mandatoryFees: Money,
  baggageCost: Money,
  seatCost: Money.default(0),
  groundTransferEstimate: Money.default(0),
  totalTripCost: Money,
  currency: Currency,
  /**
   * false cuando el precio NO es comparable con el baseline (moneda distinta sin
   * tipo de cambio fiable, o contenido incluido diferente). Se excluye del
   * ranking de ahorro, no del listado.
   */
  comparable: z.boolean().default(true),

  legs: z.array(OfferLeg).min(1).max(2),
  durationMinutes: z.number().int().positive().nullable(),
  stopCount: z.number().int().min(0),
  /** Conexión por cuenta del viajero: dos billetes sin protección entre ellos. */
  selfTransfer: z.boolean(),
  bookUrls: z.array(z.string().url()).min(1).max(2),

  verifiedAt: z.string().datetime().nullable(),
  /** Caducidad REAL del proveedor (Duffel `expires_at`), no una inventada. */
  expiresAt: z.string().datetime().nullable(),
  /** Confianza de la TARIFA (lo que dice el proveedor), no del total. */
  confidence: OfferConfidence,
  /**
   * Partes del total que NO vienen del proveedor sino de una estimación nuestra.
   * Vacío = el total es exactamente lo que cobra la aerolínea.
   *
   * Existe porque `confidence` sola miente en los dos sentidos: una tarifa
   * verificada con traslado estimado no es un total verificado, y marcar la
   * oferta entera como "estimada" escondería que el vuelo SÍ está disponible a
   * ese precio. La UI necesita poder decir "tarifa verificada · traslado
   * estimado" en la misma tarjeta.
   */
  estimatedComponents: z.array(z.enum(["baggage", "seat", "groundTransfer"])).default([]),

  /** Frente al baseline. null si no hay baseline comparable: no se enseña un 0 falso. */
  savingsPct: z.number().int().nullable().default(null),
  savingsCents: z.number().int().nullable().default(null),
});
export type NormalizedOffer = z.infer<typeof NormalizedOffer>;

// ── Diagnóstico y respuesta ─────────────────────────────────────────────────

export const ProviderStats = z.object({
  calls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  latencyMsP50: z.number().int().nonnegative(),
  latencyMsMax: z.number().int().nonnegative(),
});

export const SearchDiagnostics = z.object({
  candidatesGenerated: z.number().int().nonnegative(),
  candidatesAfterConstraints: z.number().int().nonnegative(),
  candidatesVerified: z.number().int().nonnegative(),
  /** Candidatos descartados por el tope de generación: nunca se recorta en silencio. */
  candidatesTruncated: z.number().int().nonnegative().default(0),
  providerCalls: z.record(ProviderStats).default({}),
  timeToFirstOfferMs: z.number().int().nonnegative().nullable().default(null),
  timeToBestOfferMs: z.number().int().nonnegative().nullable().default(null),
  expiredOffers: z.number().int().nonnegative().default(0),
  revalidation: z
    .object({
      attempted: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      priceChanged: z.number().int().nonnegative(),
      changedCents: z.number().int(),
    })
    .optional(),
  explorationSlots: z.number().int().nonnegative().default(0),
  /** Semilla del sorteo de exploración: hace reproducible una búsqueda entera. */
  seed: z.string().default(""),
  algoVersion: z.string().default(ALGO_VERSION),
});
export type SearchDiagnostics = z.infer<typeof SearchDiagnostics>;

/** Rankings paralelos. Son listas de `candidateKey`, no copias de la oferta. */
export const SearchRankings = z.object({
  cheapest: z.array(z.string()).default([]),
  balanced: z.array(z.string()).default([]),
  fastest: z.array(z.string()).default([]),
  /** Solo ahorro > 0 y `comparable`. Un "ahorro" negativo no es un ahorro. */
  savings: z.array(z.string()).default([]),
});
export type SearchRankings = z.infer<typeof SearchRankings>;

export const FlightSearchResponse = z.object({
  searchId: z.string().min(1),
  algoVersion: z.string(),
  baseline: NormalizedOffer.nullable(),
  offers: z.array(NormalizedOffer),
  rankings: SearchRankings,
  /** Quedaron candidatos sin explorar (presupuesto, error o cancelación). */
  partial: z.boolean(),
  /** Se sirvió algo peor de lo pedido, y por qué. */
  degraded: z.enum(["quota", "no_dates", "provider_down"]).nullable().default(null),
  budget: z.object({
    duffelCalls: z.object({ used: z.number().int().nonnegative(), max: z.number().int().nonnegative() }),
    dailyRemaining: z.number().int(),
  }),
  /** Redacción del LLM sobre datos ya calculados. null si falló: nunca rompe. */
  summary: z.string().nullable().default(null),
  diagnostics: SearchDiagnostics.optional(),
});
export type FlightSearchResponse = z.infer<typeof FlightSearchResponse>;

// ── Eventos de progreso ─────────────────────────────────────────────────────

/**
 * `seq` es monótono por búsqueda: el cliente descarta lo que llega tarde sin
 * tener que entender el evento. `at` es informativo, JAMÁS criterio de orden
 * (relojes de lambdas distintas no son comparables).
 */
const EVENT_BASE = {
  searchId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  at: z.string().datetime(),
};

export const RejectionReason = z.enum([
  "constraint",
  "no_offers",
  "provider_error",
  "budget",
  "duplicate",
  "not_comparable",
]);
export type RejectionReason = z.infer<typeof RejectionReason>;

export const SearchProgressEvent = z.discriminatedUnion("type", [
  z.object({ ...EVENT_BASE, type: z.literal("search.started"), request: FlightSearchRequestSummary, algoVersion: z.string() }),
  z.object({
    ...EVENT_BASE,
    type: z.literal("candidates.generated"),
    total: z.number().int().nonnegative(),
    byStructure: z.record(z.number().int().nonnegative()),
    truncated: z.number().int().nonnegative().default(0),
  }),
  z.object({
    ...EVENT_BASE,
    type: z.literal("cache.checked"),
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    oldestAgeSeconds: z.number().int().nonnegative().nullable(),
  }),
  z.object({ ...EVENT_BASE, type: z.literal("candidate.scored"), candidate: FlightCandidate }),
  z.object({
    ...EVENT_BASE,
    type: z.literal("provider.started"),
    provider: z.enum(["duffel", "travelpayouts"]),
    candidateKey: z.string(),
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  z.object({ ...EVENT_BASE, type: z.literal("offer.found"), offer: NormalizedOffer }),
  z.object({ ...EVENT_BASE, type: z.literal("offer.improved"), offer: NormalizedOffer, previousTotalCents: Money }),
  z.object({ ...EVENT_BASE, type: z.literal("candidate.rejected"), candidateKey: z.string(), reason: RejectionReason }),
  z.object({
    ...EVENT_BASE,
    type: z.literal("quota.updated"),
    duffelCalls: z.object({ used: z.number().int().nonnegative(), max: z.number().int().nonnegative() }),
    dailyRemaining: z.number().int(),
  }),
  z.object({
    ...EVENT_BASE,
    type: z.literal("search.partial"),
    reason: z.enum(["budget", "provider_error", "cancelled", "timeout"]),
    offers: z.array(NormalizedOffer),
  }),
  z.object({ ...EVENT_BASE, type: z.literal("search.completed"), response: FlightSearchResponse }),
  z.object({ ...EVENT_BASE, type: z.literal("search.failed"), error: z.string(), recoverable: z.boolean() }),
]);
export type SearchProgressEvent = z.infer<typeof SearchProgressEvent>;
export type SearchProgressEventType = SearchProgressEvent["type"];

/** Eventos que la UI puede anunciar por `aria-live`. El resto son ruido. */
export const ANNOUNCED_EVENTS: SearchProgressEventType[] = [
  "search.started",
  "offer.improved",
  "search.partial",
  "search.completed",
  "search.failed",
];
