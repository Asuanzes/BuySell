/**
 * Normalización de ofertas de proveedor a `NormalizedOffer`: el punto donde una
 * respuesta de Duffel se convierte en un COSTE TOTAL comparable.
 *
 * Toda la aritmética del dinero vive aquí y es determinista. Dos reglas que no
 * se negocian:
 *
 *  1. Manda `total_amount`. Si el desglose del proveedor no cuadra con el total,
 *     gana el total: es lo que el viajero paga. El desglose se deriva de él.
 *  2. Lo estimado se declara. Un traslado terrestre o una maleta sin tarifa
 *     publicada entran en el total, pero salen listados en `estimatedComponents`
 *     para que la UI no pueda presentarlos como precio del proveedor.
 *
 * Puro: sin red, sin BBDD y sin reloj (el "ahora" se inyecta).
 */
import {
  distanceKm,
  offerKeyOf,
  type FlightCandidate,
  type FlightSearchRequest,
  type NormalizedOffer,
  type OfferConfidence,
  type OfferLeg,
  type SearchRankings,
} from "@nidokey/shared";
import type { DuffelOffer, DuffelSlice } from "@/features/sources/providers/duffel";
import { aviasalesUrl } from "./flight-search";

/**
 * Coste estimado de una maleta facturada por trayecto, en céntimos, cuando la
 * tarifa no la incluye. Verificarla de verdad exige un GET extra por oferta
 * (`return_available_services=true`), que se paga: solo se hace con el ganador.
 *
 * ponytail: constante única en vez de tabla por aerolínea. 30 € es el entorno de
 * lo que cobran las de bajo coste en Europa; el techo es que sobreestima a una
 * de bandera que la incluye barata. Si los datos de la fase 5 dicen que importa,
 * aquí es donde entra la tabla por `owner.iata_code`.
 */
export const ESTIMATED_CHECKED_BAG_CENTS = 3000;

export type NormalizeContext = {
  candidate: FlightCandidate;
  request: FlightSearchRequest;
  /** ISO 8601. Inyectado: un normalizador con reloj propio no es testeable. */
  nowISO: string;
};

// ── Utilidades de parseo ────────────────────────────────────────────────────

/** "144.91" → 14491. null si no es un importe usable. */
export function amountToCents(amount: string | null | undefined): number | null {
  if (typeof amount !== "string" && typeof amount !== "number") return null;
  const v = typeof amount === "number" ? amount : parseFloat(amount);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** Duración ISO-8601 ("PT2H15M", "P1DT3H") → minutos. null si no se entiende. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso.trim());
  if (!m) return null;
  const [, d, h, min] = m;
  const total = (Number(d ?? 0) * 24 * 60) + (Number(h ?? 0) * 60) + Number(min ?? 0);
  return total > 0 ? total : null;
}

/** Minutos entre dos instantes ISO. null si alguno falta o no es fecha. */
function minutesBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60_000);
}

/**
 * Maletas facturadas INCLUIDAS en un trayecto. Se toma el MÍNIMO entre segmentos
 * y pasajeros: si la tarifa incluye maleta en el primer vuelo pero no en la
 * conexión, el viajero no puede facturar de punta a punta.
 */
export function includedCheckedBags(slice: DuffelSlice): number {
  const segs = slice.segments ?? [];
  if (!segs.length) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const seg of segs) {
    const pax = seg.passengers ?? [];
    // Sin información de equipaje no se asume que haya: asumir de más haría
    // parecer barato un billete al que luego hay que sumarle la maleta.
    if (!pax.length) return 0;
    for (const p of pax) {
      const checked = (p.baggages ?? [])
        .filter((b) => b.type === "checked")
        .reduce((sum, b) => sum + Math.max(0, b.quantity ?? 0), 0);
      min = Math.min(min, checked);
    }
  }
  return Number.isFinite(min) ? min : 0;
}

// ── Traslado terrestre ──────────────────────────────────────────────────────

/**
 * Traslado terrestre real de la oferta, en céntimos.
 *
 * Se calcula con los aeropuertos que trae la OFERTA, no con los que se pidieron:
 * al planificar con un código de ciudad ("LON") no se sabe si se aterriza en
 * Heathrow o en Stansted, y esa diferencia son 55 km de tren. Aquí ya se sabe.
 *
 * Cada aeropuerto pisado cuenta: en un ida y vuelta el desvío se paga al llegar
 * y al salir.
 */
export function groundTransferFor(
  legs: Array<{ origin: string; destination: string }>,
  request: FlightSearchRequest
): { cents: number; detourKm: { origin: number; destination: number } } {
  const policy = request.preferences.nearby;
  const travelers = request.adults + request.childAges.length;

  /**
   * A qué extremo del viaje pertenece un aeropuerto y cuánto se desvía.
   *
   * Se decide por CERCANÍA, no por la posición del trayecto. Deducirlo de la
   * posición se rompe con el tramo de vuelta de un billete partido, que se
   * normaliza suelto: ahí el primer (y único) trayecto es BCN→MAD, y tratar BCN
   * como "casa" le sumaba el desvío MAD↔BCN entero. Un traslado fantasma de
   * 174 € que además hacía perder SIEMPRE al billete partido.
   */
  const endFor = (actual: string): { end: "origin" | "destination"; km: number } | null => {
    if (actual === request.origin) return null;
    if (actual === request.destination) return null;
    const candidates: Array<{ end: "origin" | "destination"; km: number }> = [];
    for (const [end, requested] of [
      ["origin", request.origin],
      ["destination", request.destination],
    ] as const) {
      // null = el extremo pedido no está en la tabla (p. ej. un código de
      // ciudad). Sin dato no se inventa una distancia.
      const km = distanceKm(requested, actual);
      if (km != null) candidates.push({ end, km: Math.round(km) });
    }
    const best = candidates.sort((a, b) => a.km - b.km)[0];
    // Más lejos que el radio de "cercano" no es un traslado: es otra ciudad, o
    // un código que no sabemos interpretar. En ninguno de los dos casos se cobra.
    return best && best.km <= policy.maxRadiusKm ? best : null;
  };

  let cents = 0;
  const detour = { origin: 0, destination: 0 };
  for (const leg of legs) {
    for (const airport of [leg.origin, leg.destination]) {
      const hit = endFor(airport);
      if (!hit) continue;
      cents += Math.round(hit.km * policy.groundTransferCentsPerKm * travelers);
      detour[hit.end] = Math.max(detour[hit.end], hit.km);
    }
  }
  return { cents, detourKm: detour };
}

// ── Oferta → oferta normalizada ─────────────────────────────────────────────

function sliceToLeg(slice: DuffelSlice, offer: DuffelOffer): OfferLeg | null {
  const segs = slice.segments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first?.departing_at) return null;
  const origin = slice.origin?.iata_code ?? first.origin?.iata_code;
  const destination = slice.destination?.iata_code ?? last?.destination?.iata_code;
  if (!origin || !destination) return null;
  return {
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departISO: first.departing_at,
    // La llegada REAL es la del último segmento: un nocturno con escala
    // aterriza al día siguiente y la ficha debe enseñar esa fecha.
    arriveISO: last?.arriving_at ?? null,
    airline: offer.owner?.name ?? first.marketing_carrier?.name ?? null,
    flightNumber:
      first.marketing_carrier?.iata_code && first.marketing_carrier_flight_number
        ? `${first.marketing_carrier.iata_code} ${first.marketing_carrier_flight_number}`
        : null,
    stops: Math.max(0, segs.length - 1),
    durationMinutes: parseIsoDuration(slice.duration) ?? minutesBetween(first.departing_at, last?.arriving_at),
  };
}

/**
 * Una oferta de Duffel → oferta normalizada. null si el importe o los trayectos
 * no son usables: una oferta que no se puede valorar no se enseña.
 */
export function normalizeOffer(offer: DuffelOffer, ctx: NormalizeContext): NormalizedOffer | null {
  const total = amountToCents(offer.total_amount);
  if (total == null || total < 0) return null;
  const slices = (offer.slices ?? []).filter((s) => (s.segments ?? []).length > 0);
  if (!slices.length) return null;

  const legs = slices.map((s) => sliceToLeg(s, offer)).filter((l): l is OfferLeg => l != null);
  if (!legs.length || legs.length > 2) return null;

  // Desglose: el total manda. Si las tasas no vienen o no cuadran, la tarifa se
  // deriva del total para que la suma de las partes SIEMPRE dé el total.
  const tax = amountToCents(offer.tax_amount);
  const mandatoryFees = tax != null && tax >= 0 && tax <= total ? tax : 0;
  const fareTotal = total - mandatoryFees;

  // Equipaje: lo incluido sale gratis de la propia oferta; lo que falte se estima.
  const travelers = ctx.request.adults + ctx.request.childAges.length;
  const needed = ctx.request.preferences.checkedBags;
  let missingBagLegs = 0;
  for (const s of slices) missingBagLegs += Math.max(0, needed - includedCheckedBags(s));
  const baggageCost = missingBagLegs * travelers * ESTIMATED_CHECKED_BAG_CENTS;

  const transfer = groundTransferFor(legs, ctx.request);

  const estimatedComponents: NormalizedOffer["estimatedComponents"] = [];
  if (baggageCost > 0) estimatedComponents.push("baggage");
  if (transfer.cents > 0) estimatedComponents.push("groundTransfer");

  const expiresAt = offer.expires_at && Number.isFinite(Date.parse(offer.expires_at)) ? offer.expires_at : null;
  const confidence: OfferConfidence =
    expiresAt && Date.parse(expiresAt) <= Date.parse(ctx.nowISO) ? "expired" : "verified";

  const pax = travelers;
  const ticketType = ctx.candidate.structure === "split" ? "split" : "single";
  const bookUrls =
    legs.length === 2
      ? [aviasalesUrl(legs[0]!.origin, legs[0]!.destination, legs[0]!.departISO.slice(0, 10), legs[1]!.departISO.slice(0, 10), pax)]
      : [aviasalesUrl(legs[0]!.origin, legs[0]!.destination, legs[0]!.departISO.slice(0, 10), null, pax)];

  const durations = legs.map((l) => l.durationMinutes).filter((d): d is number => d != null);

  return {
    offerKey: offerKeyOf(ctx.candidate.key, [offer.id], {
      departISO: legs[0]!.departISO,
      totalCents: total,
    }),
    candidateKey: ctx.candidate.key,
    offerIds: [offer.id],
    structure: ctx.candidate.structure,
    ticketType,
    fareTotal,
    mandatoryFees,
    baggageCost,
    seatCost: 0,
    groundTransferEstimate: transfer.cents,
    totalTripCost: fareTotal + mandatoryFees + baggageCost + transfer.cents,
    currency: (offer.total_currency || "EUR").toUpperCase(),
    comparable: (offer.total_currency || "EUR").toUpperCase() === ctx.request.currency,
    legs,
    durationMinutes: durations.length === legs.length ? durations.reduce((a, b) => a + b, 0) : null,
    stopCount: legs.reduce((sum, l) => sum + l.stops, 0),
    selfTransfer: ticketType === "split",
    bookUrls,
    verifiedAt: ctx.nowISO,
    expiresAt,
    confidence,
    estimatedComponents,
    savingsPct: null,
    savingsCents: null,
  };
}

/**
 * Varias ofertas del mismo candidato → las mejores y VARIADAS. Deduplica por
 * aerolínea y hora de salida: diez tarifas del mismo vuelo son una sola opción
 * para quien mira la pantalla.
 */
export function normalizeOffers(
  offers: DuffelOffer[],
  ctx: NormalizeContext,
  max = 3
): NormalizedOffer[] {
  const norm = offers
    .map((o) => normalizeOffer(o, ctx))
    .filter((o): o is NormalizedOffer => o != null)
    .sort((a, b) => a.totalTripCost - b.totalTripCost);
  const seen = new Set<string>();
  const out: NormalizedOffer[] = [];
  for (const o of norm) {
    const key = `${o.legs[0]!.airline}|${o.legs[0]!.departISO.slice(0, 13)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Dos solo-idas → un billete partido. null si no se pueden sumar.
 *
 * Monedas distintas devuelven null a propósito: sin una fuente de tipo de cambio
 * fiable, sumar 80 EUR y 60 GBP es inventarse un precio. Es exactamente el tipo
 * de número que este motor no puede permitirse.
 */
export function combineSplit(
  out: NormalizedOffer,
  back: NormalizedOffer,
  ctx: NormalizeContext
): NormalizedOffer | null {
  if (out.currency !== back.currency) return null;
  const expiries = [out.expiresAt, back.expiresAt].filter((e): e is string => e != null);
  // Caduca cuando caduca la PRIMERA: a partir de ahí el par ya no existe.
  const expiresAt = expiries.length ? expiries.sort()[0]! : null;
  const durations = [out.durationMinutes, back.durationMinutes];
  const confidence: OfferConfidence =
    out.confidence === "expired" || back.confidence === "expired" ? "expired" : "verified";

  const offerIds = [...out.offerIds, ...back.offerIds].slice(0, 2);
  return {
    offerKey: offerKeyOf(ctx.candidate.key, offerIds, {
      departISO: out.legs[0]!.departISO,
      totalCents: out.totalTripCost + back.totalTripCost,
    }),
    candidateKey: ctx.candidate.key,
    offerIds,
    structure: ctx.candidate.structure,
    ticketType: "split",
    fareTotal: out.fareTotal + back.fareTotal,
    mandatoryFees: out.mandatoryFees + back.mandatoryFees,
    baggageCost: out.baggageCost + back.baggageCost,
    seatCost: out.seatCost + back.seatCost,
    groundTransferEstimate: out.groundTransferEstimate + back.groundTransferEstimate,
    totalTripCost: out.totalTripCost + back.totalTripCost,
    currency: out.currency,
    comparable: out.comparable && back.comparable,
    legs: [out.legs[0]!, back.legs[0]!],
    durationMinutes: durations.every((d): d is number => d != null) ? durations[0]! + durations[1]! : null,
    stopCount: out.stopCount + back.stopCount,
    selfTransfer: true,
    bookUrls: [out.bookUrls[0]!, back.bookUrls[0]!],
    verifiedAt: ctx.nowISO,
    expiresAt,
    confidence,
    estimatedComponents: [...new Set([...out.estimatedComponents, ...back.estimatedComponents])],
    savingsPct: null,
    savingsCents: null,
  };
}

// ── Ahorro y rankings ───────────────────────────────────────────────────────

/**
 * Ahorro frente al baseline. Sin baseline comparable NO se calcula: enseñar un
 * "0 %" o un porcentaje contra otra moneda sería inventarse la comparación.
 */
export function withSavings(offers: NormalizedOffer[], baseline: NormalizedOffer | null): NormalizedOffer[] {
  const usable =
    baseline && baseline.comparable && baseline.totalTripCost > 0 ? baseline : null;
  return offers.map((o) => {
    if (!usable || !o.comparable || o.currency !== usable.currency) {
      return { ...o, savingsCents: null, savingsPct: null };
    }
    const savingsCents = usable.totalTripCost - o.totalTripCost;
    return {
      ...o,
      savingsCents,
      savingsPct: Math.round((savingsCents / usable.totalTripCost) * 100),
    };
  });
}

/**
 * Los tres rankings del producto más el carrusel de ahorro. Son listas de
 * `candidateKey`+índice, no copias: una oferta vive en varios rankings a la vez.
 *
 * `balanced` pondera precio, duración y escalas, y penaliza el billete partido:
 * ahorrar 15 € a cambio de perder la protección de la conexión no es equilibrio.
 */
export function buildRankings(offers: NormalizedOffer[]): SearchRankings {
  if (!offers.length) return { cheapest: [], balanced: [], fastest: [], savings: [] };
  const id = (o: NormalizedOffer) => o.offerKey;
  const costs = offers.map((o) => o.totalTripCost);
  const times = offers.map((o) => o.durationMinutes ?? Number.POSITIVE_INFINITY);
  const finiteTimes = times.filter((t) => Number.isFinite(t));
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minTime = finiteTimes.length ? Math.min(...finiteTimes) : 0;
  const maxTime = finiteTimes.length ? Math.max(...finiteTimes) : 0;
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0);

  const balanced = [...offers].sort((a, b) => {
    const s = (o: NormalizedOffer) =>
      0.6 * norm(o.totalTripCost, minCost, maxCost) +
      0.3 * norm(o.durationMinutes ?? maxTime, minTime, maxTime) +
      0.1 * Math.min(1, o.stopCount / 2) +
      (o.selfTransfer ? 0.15 : 0);
    return s(a) - s(b) || a.totalTripCost - b.totalTripCost;
  });

  return {
    cheapest: [...offers].sort((a, b) => a.totalTripCost - b.totalTripCost).map(id),
    balanced: balanced.map(id),
    fastest: [...offers]
      .sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity) || a.totalTripCost - b.totalTripCost)
      .map(id),
    // Un "ahorro" negativo no es un ahorro: fuera del carrusel, aunque siga
    // apareciendo en los demás rankings.
    savings: offers
      .filter((o) => o.comparable && (o.savingsCents ?? 0) > 0)
      .sort((a, b) => (b.savingsCents ?? 0) - (a.savingsCents ?? 0))
      .map(id),
  };
}

/**
 * Calendario de Travelpayouts → mínimo por día en CÉNTIMOS.
 *
 * La API ha devuelto históricamente las dos formas: `{fecha: 123.4}` y
 * `{fecha: {price: 123.4}}`. Se aceptan ambas y se ignora todo lo que no sea un
 * número positivo — un 0, un negativo o un texto en el sitio del precio son
 * basura del proveedor, no una ganga.
 *
 * ponytail: duplica temporalmente la `parseCalendar` privada de ai-search.ts.
 * Esa copia muere en la fase 3, cuando el orquestador nuevo sustituya al viejo;
 * moverla ahora tocaría el camino de producción sin necesidad.
 */
export function parseCalendar(resp: { data?: unknown }): Record<string, number> {
  const out: Record<string, number> = {};
  const data = resp.data as Record<string, unknown> | undefined;
  for (const [date, raw] of Object.entries(data ?? {})) {
    const price = typeof raw === "number" ? raw : (raw as { price?: unknown } | null)?.price;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      out[date] = Math.round(price * 100);
    }
  }
  return out;
}

/** Marca como caducadas las ofertas cuyo `expiresAt` ya pasó. */
export function expireOffers(offers: NormalizedOffer[], nowISO: string): NormalizedOffer[] {
  const now = Date.parse(nowISO);
  return offers.map((o) =>
    o.expiresAt && Date.parse(o.expiresAt) <= now && o.confidence !== "expired"
      ? { ...o, confidence: "expired" as const }
      : o
  );
}
