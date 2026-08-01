import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FlightSearchRequest, distanceKm, type FlightCandidate, type NormalizedOffer } from "@nidokey/shared";
import type { DuffelOffer } from "@/features/sources/providers/duffel";
import { planCandidates } from "./planner";
import {
  ESTIMATED_CHECKED_BAG_CENTS,
  buildRankings,
  combineSplit,
  expireOffers,
  groundTransferFor,
  includedCheckedBags,
  normalizeOffer,
  normalizeOffers,
  parseCalendar,
  parseIsoDuration,
  withSavings,
} from "./normalize";

/**
 * Pruebas CONTRACTUALES: entran payloads con la forma exacta del proveedor
 * (src/features/travel/__fixtures__/) y se comprueba el número que sale. Ningún
 * test toca la red.
 *
 * Lo que se protege es el precio: si el desglose deja de cuadrar con el total,
 * o una estimación se cuela como si fuera tarifa del proveedor, el producto
 * miente aunque todo lo demás funcione.
 */

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")) as T;

const D = read<Record<string, DuffelOffer> & { malformed: DuffelOffer[] }>("duffel.json");
const TP = read<Record<string, { data?: unknown }>>("travelpayouts.json");

const NOW = "2026-09-01T10:00:00.000Z";
const TODAY = "2026-09-01";

function req(over: Record<string, unknown> = {}) {
  return FlightSearchRequest.parse({
    origin: "MAD",
    destination: "BCN",
    departDate: "2026-09-10",
    returnDate: "2026-09-17",
    ...over,
  });
}

function ctx(over: Record<string, unknown> = {}, structure = "round_trip") {
  const r = req(over);
  const { candidates } = planCandidates(r, { todayISO: TODAY });
  const candidate =
    candidates.find((c) => c.structure === structure && c.isBaseline) ??
    candidates.find((c) => c.structure === structure) ??
    candidates[0]!;
  return { candidate, request: r, nowISO: NOW };
}

// ── Parseo ──────────────────────────────────────────────────────────────────

describe("parseo", () => {
  it("duraciones ISO-8601", () => {
    assert.equal(parseIsoDuration("PT1H20M"), 80);
    assert.equal(parseIsoDuration("PT45M"), 45);
    assert.equal(parseIsoDuration("P1DT3H"), 1620);
    assert.equal(parseIsoDuration("mañana"), null);
    assert.equal(parseIsoDuration(null), null);
  });

  it("el calendario acepta las DOS formas históricas de la misma API", () => {
    const plano = parseCalendar(TP.calendarDeparture!);
    assert.equal(plano["2026-09-08"], 6240);
    const anidado = parseCalendar(TP.calendarReturnNested!);
    assert.equal(anidado["2026-09-17"], 9200);
  });

  it("ignora la basura del calendario sin lanzar", () => {
    const sucio = parseCalendar(TP.calendarDirty!);
    assert.deepEqual(Object.keys(sucio).sort(), ["2026-09-08", "2026-09-14"]);
    assert.equal(parseCalendar(TP.calendarEmpty!)["2026-09-10"], undefined);
    assert.deepEqual(parseCalendar({}), {});
  });

  it("cuenta el equipaje incluido y no lo supone cuando falta el dato", () => {
    assert.equal(includedCheckedBags(D.withCheckedBaggage!.slices![0]!), 1);
    assert.equal(includedCheckedBags(D.roundTripDirect!.slices![0]!), 0);
    assert.equal(includedCheckedBags({ segments: [{ departing_at: "x" }] }), 0);
  });
});

// ── Coste total ─────────────────────────────────────────────────────────────

describe("coste total", () => {
  it("desglosa un ida y vuelta directo tal cual lo cobra la aerolínea", () => {
    const o = normalizeOffer(D.roundTripDirect!, ctx())!;
    assert.ok(o);
    assert.equal(o.fareTotal, 12000);
    assert.equal(o.mandatoryFees, 2491);
    assert.equal(o.baggageCost, 0);
    assert.equal(o.groundTransferEstimate, 0);
    assert.equal(o.totalTripCost, 14491);
    assert.equal(o.currency, "EUR");
    assert.equal(o.comparable, true);
    assert.equal(o.confidence, "verified");
    assert.deepEqual(o.estimatedComponents, [], "nada estimado: el total es el del proveedor");
    assert.equal(o.stopCount, 0);
    assert.equal(o.durationMinutes, 165);
    assert.equal(o.selfTransfer, false);
    assert.equal(o.legs.length, 2);
  });

  it("la suma de las partes SIEMPRE es el total", () => {
    for (const key of ["roundTripDirect", "roundTripOneStop", "withCheckedBaggage", "alternateAirport"]) {
      const o = normalizeOffer(D[key]!, ctx({ preferences: { checkedBags: 1 } }))!;
      assert.equal(
        o.fareTotal + o.mandatoryFees + o.baggageCost + o.seatCost + o.groundTransferEstimate,
        o.totalTripCost,
        key
      );
    }
  });

  it("si el desglose del proveedor no cuadra, manda el TOTAL (es lo que se paga)", () => {
    const roto = D.malformed.find((o) => o.id === "off_tax_over_total")!;
    const o = normalizeOffer(roto, ctx())!;
    assert.ok(o);
    assert.equal(o.totalTripCost, 5000);
    assert.equal(o.mandatoryFees, 0, "unas tasas mayores que el total no son tasas");
    assert.equal(o.fareTotal, 5000);
  });

  it("descarta las ofertas que no se pueden valorar en vez de enseñar un precio raro", () => {
    for (const roto of D.malformed.filter((o) => o.id !== "off_tax_over_total")) {
      assert.equal(normalizeOffer(roto, ctx()), null, roto.id);
    }
  });

  it("una escala cuenta como escala y suma su duración", () => {
    const o = normalizeOffer(D.roundTripOneStop!, ctx())!;
    assert.equal(o.stopCount, 1);
    assert.equal(o.durationMinutes, 295);
    assert.equal(o.legs[0]!.stops, 1);
    assert.equal(o.legs[1]!.stops, 0);
  });

  it("un nocturno conserva la fecha REAL de llegada", () => {
    const o = normalizeOffer(D.overnightReturn!, ctx())!;
    assert.equal(o.legs[1]!.departISO.slice(0, 10), "2026-09-17");
    assert.equal(o.legs[1]!.arriveISO!.slice(0, 10), "2026-09-18");
  });
});

// ── Equipaje ────────────────────────────────────────────────────────────────

describe("equipaje", () => {
  it("si la tarifa ya incluye la maleta, no se cobra dos veces", () => {
    const o = normalizeOffer(D.withCheckedBaggage!, ctx({ preferences: { checkedBags: 1 } }))!;
    assert.equal(o.baggageCost, 0);
    assert.deepEqual(o.estimatedComponents, []);
  });

  it("si no la incluye, se estima por trayecto y se DECLARA como estimación", () => {
    const o = normalizeOffer(D.roundTripDirect!, ctx({ preferences: { checkedBags: 1 } }))!;
    assert.equal(o.baggageCost, 2 * ESTIMATED_CHECKED_BAG_CENTS);
    assert.ok(o.estimatedComponents.includes("baggage"));
    assert.equal(o.totalTripCost, 14491 + 2 * ESTIMATED_CHECKED_BAG_CENTS);
    assert.equal(o.confidence, "verified", "la TARIFA sigue verificada aunque la maleta se estime");
  });

  it("la estimación escala con los viajeros", () => {
    const o = normalizeOffer(
      D.roundTripDirect!,
      ctx({ adults: 2, childAges: [5], preferences: { checkedBags: 1 } })
    )!;
    assert.equal(o.baggageCost, 2 * 3 * ESTIMATED_CHECKED_BAG_CENTS);
  });
});

// ── Traslado terrestre ──────────────────────────────────────────────────────

describe("traslado terrestre", () => {
  it("se calcula con el aeropuerto REAL de la oferta, no con el que se pidió", () => {
    const c = ctx();
    const o = normalizeOffer(D.alternateAirport!, c)!;
    const km = Math.round(distanceKm("BCN", "REU")!);
    assert.equal(o.groundTransferEstimate, 2 * km * 18);
    assert.ok(o.estimatedComponents.includes("groundTransfer"));
    assert.equal(o.totalTripCost, 7000 + 2 * km * 18);
  });

  it("aterrizar donde se pidió no genera traslado", () => {
    const o = normalizeOffer(D.roundTripDirect!, ctx())!;
    assert.equal(o.groundTransferEstimate, 0);
  });

  it("un tramo de VUELTA suelto no confunde el destino con casa", () => {
    // Regresión: deducir el extremo por la posición del trayecto hacía que
    // BCN→MAD (la vuelta de un billete partido, que se normaliza sola) contase
    // el desvío MAD↔BCN entero — 174 € de traslado inexistente que condenaban
    // al billete partido a perder siempre.
    const t = groundTransferFor([{ origin: "BCN", destination: "MAD" }], req());
    assert.equal(t.cents, 0);
    assert.equal(normalizeOffer(D.oneWayBack!, ctx({}, "split"))!.groundTransferEstimate, 0);
  });

  it("sin coordenadas del aeropuerto pedido no se inventa un traslado", () => {
    // El usuario pidió un código de CIUDAD: llegar a cualquiera de sus
    // aeropuertos no es un desvío.
    const r = req({ destination: "LON" });
    const t = groundTransferFor([{ origin: "MAD", destination: "STN" }], r);
    assert.equal(t.cents, 0);
  });
});

// ── Caducidad ───────────────────────────────────────────────────────────────

describe("caducidad", () => {
  it("una oferta pasada de fecha es `expired`, no `verified`", () => {
    const o = normalizeOffer(D.expiredOffer!, ctx())!;
    assert.equal(o.confidence, "expired");
    assert.equal(o.expiresAt, "2020-01-01T00:00:00.000Z");
  });

  it("expireOffers degrada las que caducan mientras se mira la pantalla", () => {
    const o = normalizeOffer(D.roundTripDirect!, ctx())!;
    assert.equal(o.confidence, "verified");
    const [after] = expireOffers([o], "2026-09-01T10:21:00.000Z");
    assert.equal(after!.confidence, "expired");
    const [before] = expireOffers([o], "2026-09-01T10:19:00.000Z");
    assert.equal(before!.confidence, "verified");
  });
});

// ── Billete partido ─────────────────────────────────────────────────────────

describe("billete partido", () => {
  const c = ctx({}, "split");

  it("suma los dos tramos y se marca como conexión por cuenta del viajero", () => {
    const out = normalizeOffer(D.oneWayOut!, c)!;
    const back = normalizeOffer(D.oneWayBack!, c)!;
    const split = combineSplit(out, back, c)!;
    assert.ok(split);
    assert.equal(split.totalTripCost, 4500 + 5230);
    assert.equal(split.fareTotal, 3600 + 4200);
    assert.equal(split.mandatoryFees, 900 + 1030);
    assert.equal(split.ticketType, "split");
    assert.equal(split.selfTransfer, true);
    assert.equal(split.bookUrls.length, 2, "dos reservas separadas, dos enlaces");
    assert.equal(split.offerIds.length, 2);
  });

  it("caduca cuando caduca el PRIMERO de los dos", () => {
    const out = normalizeOffer(D.oneWayOut!, c)!;
    const back = normalizeOffer(D.oneWayBack!, c)!;
    assert.equal(combineSplit(out, back, c)!.expiresAt, "2026-09-01T10:15:00.000Z");
  });

  it("NO suma monedas distintas: eso sería inventarse un precio", () => {
    const out = normalizeOffer(D.oneWayOut!, c)!;
    const gbp = normalizeOffer(D.foreignCurrency!, c)!;
    assert.equal(combineSplit(out, gbp, c), null);
  });
});

// ── Ahorro y rankings ───────────────────────────────────────────────────────

describe("ahorro", () => {
  const baseline = normalizeOffer(D.roundTripDirect!, ctx())!;

  it("se calcula sobre el coste TOTAL, no sobre la tarifa", () => {
    const barato = { ...baseline, candidateKey: "k2", totalTripCost: 10000 };
    const [o] = withSavings([barato], baseline);
    assert.equal(o!.savingsCents, 4491);
    assert.equal(o!.savingsPct, 31);
  });

  it("sin baseline NO se enseña porcentaje (ni un 0 falso)", () => {
    const [o] = withSavings([baseline], null);
    assert.equal(o!.savingsPct, null);
    assert.equal(o!.savingsCents, null);
  });

  it("otra moneda no se compara", () => {
    const gbp = normalizeOffer(D.foreignCurrency!, ctx())!;
    const [o] = withSavings([gbp], baseline);
    assert.equal(o!.savingsPct, null);
  });

  it("un ahorro negativo se calcula pero queda fuera del carrusel de ahorro", () => {
    const caro = { ...baseline, candidateKey: "k3", totalTripCost: 20000 };
    const offers = withSavings([caro, baseline], baseline);
    assert.ok(offers.find((o) => o.candidateKey === "k3")!.savingsPct! < 0);
    const rank = buildRankings(offers);
    assert.ok(!rank.savings.includes("k3"));
  });
});

describe("rankings", () => {
  const baseline = normalizeOffer(D.roundTripDirect!, ctx())!;
  const rapido: NormalizedOffer = { ...baseline, candidateKey: "rapido", totalTripCost: 18000, durationMinutes: 100 };
  const barato: NormalizedOffer = {
    ...baseline,
    candidateKey: "barato",
    totalTripCost: 9000,
    durationMinutes: 400,
    selfTransfer: true,
    ticketType: "split",
  };
  const offers = withSavings([baseline, rapido, barato], baseline);
  const rank = buildRankings(offers);

  it("«más barato» ordena por coste total", () => {
    assert.deepEqual(rank.cheapest, ["barato", baseline.candidateKey, "rapido"]);
  });

  it("«más rápido» ordena por duración", () => {
    assert.equal(rank.fastest[0], "rapido");
  });

  it("«equilibrado» penaliza el billete partido: no todo es el precio", () => {
    assert.notEqual(rank.balanced[0], "barato");
  });

  it("el carrusel de ahorro solo lleva ahorros reales", () => {
    assert.deepEqual(rank.savings, ["barato"]);
  });

  it("una lista vacía no rompe nada", () => {
    assert.deepEqual(buildRankings([]), { cheapest: [], balanced: [], fastest: [], savings: [] });
  });
});

describe("varias ofertas del mismo candidato", () => {
  it("se quedan las más baratas y variadas, no diez tarifas del mismo vuelo", () => {
    const c = ctx();
    const dup: DuffelOffer = { ...D.roundTripDirect!, id: "off_dup", total_amount: "160.00", base_amount: "140.00", tax_amount: "20.00" };
    const out = normalizeOffers([D.roundTripDirect!, dup, D.roundTripOneStop!], c);
    assert.equal(out.length, 2, "el duplicado de Iberia a la misma hora se funde");
    assert.ok(out[0]!.totalTripCost <= out[1]!.totalTripCost);
  });
});

// El planificador y el normalizador tienen que coincidir en el traslado, o el
// candidato prometería un ahorro que la oferta luego no cumple.
describe("planificador y normalizador coinciden", () => {
  it("la estimación de traslado del candidato casa con la de la oferta", () => {
    const r = req();
    const { candidates } = planCandidates(r, { todayISO: TODAY });
    const reus = candidates.find((c) => c.structure === "round_trip" && c.legs[0]!.destination === "REU")!;
    const o = normalizeOffer(D.alternateAirport!, { candidate: reus, request: r, nowISO: NOW })!;
    assert.equal(o.groundTransferEstimate, reus.groundTransferEstimate);
  });
});
