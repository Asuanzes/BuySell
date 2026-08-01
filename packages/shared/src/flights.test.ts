import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANNOUNCED_EVENTS,
  FlightSearchRequest,
  NormalizedOffer,
  SearchPreferences,
  SearchProgressEvent,
  candidateKey,
} from "./flights";

/**
 * Los contratos son la frontera de confianza entre la app, el backend y los
 * proveedores. Lo que se prueba aquí no es zod: son las DECISIONES metidas en
 * el esquema (qué viene encendido, qué combinaciones se rechazan y qué campos no
 * admiten un valor inventado).
 */

const base = { origin: "MAD", destination: "BCN", departDate: "2026-09-10" };

describe("FlightSearchRequest", () => {
  it("por defecto no busca con IA, pero sí explora aeropuertos cercanos", () => {
    const r = FlightSearchRequest.parse(base);
    assert.equal(r.aiSearch, false);
    assert.equal(r.preferences.nearby.enabled, true);
    assert.equal(r.preferences.nearby.useMetroCodes, true);
    assert.equal(r.returnDate, null);
  });

  it("la flexibilidad por defecto deja pasar la matriz ±2 completa", () => {
    const p = SearchPreferences.parse({});
    assert.equal(p.flexDays, 2);
    // 2·flexDays: si fuese menor, el comportamiento por defecto ya no sería el
    // de la búsqueda actual y estaríamos recortando fechas sin decirlo.
    assert.equal(p.stayDeltaDays, 2 * p.flexDays);
  });

  it("rechaza una vuelta anterior a la ida", () => {
    const r = FlightSearchRequest.safeParse({ ...base, returnDate: "2026-09-09" });
    assert.equal(r.success, false);
  });

  it("rechaza origen y destino iguales", () => {
    const r = FlightSearchRequest.safeParse({ ...base, destination: "MAD" });
    assert.equal(r.success, false);
  });

  it("exige IATA en mayúsculas de tres letras", () => {
    assert.equal(FlightSearchRequest.safeParse({ ...base, origin: "mad" }).success, false);
    assert.equal(FlightSearchRequest.safeParse({ ...base, origin: "MADR" }).success, false);
  });

  it("acepta código de ciudad como destino (LON cubre todo Londres)", () => {
    assert.equal(FlightSearchRequest.safeParse({ ...base, destination: "LON" }).success, true);
  });

  it("no acepta más de 4 niños ni edades fuera de rango", () => {
    assert.equal(FlightSearchRequest.safeParse({ ...base, childAges: [1, 2, 3, 4, 5] }).success, false);
    assert.equal(FlightSearchRequest.safeParse({ ...base, childAges: [18] }).success, false);
  });
});

describe("NormalizedOffer", () => {
  const offer = {
    offerKey: "round_trip:MAD-BCN@2026-09-10#off_1",
    candidateKey: candidateKey("round_trip", [{ origin: "MAD", destination: "BCN", date: "2026-09-10" }]),
    offerIds: ["off_1"],
    structure: "round_trip" as const,
    ticketType: "single" as const,
    fareTotal: 9000,
    mandatoryFees: 1200,
    baggageCost: 0,
    groundTransferEstimate: 0,
    totalTripCost: 10200,
    currency: "EUR",
    legs: [
      {
        origin: "MAD",
        destination: "BCN",
        departISO: "2026-09-10T08:00:00Z",
        arriveISO: "2026-09-10T09:20:00Z",
        airline: "Iberia",
        flightNumber: "IB 1234",
        stops: 0,
        durationMinutes: 80,
      },
    ],
    durationMinutes: 80,
    stopCount: 0,
    selfTransfer: false,
    bookUrls: ["https://www.aviasales.com/search/MAD1009BCN1"],
    verifiedAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-01T10:20:00.000Z",
    confidence: "verified" as const,
  };

  it("acepta una oferta verificada completa y asume comparabilidad", () => {
    const p = NormalizedOffer.parse(offer);
    assert.equal(p.comparable, true);
    assert.equal(p.seatCost, 0);
    assert.equal(p.savingsPct, null, "sin baseline no se inventa un 0 %");
  });

  it("el dinero es en céntimos enteros: nada de euros con decimales", () => {
    assert.equal(NormalizedOffer.safeParse({ ...offer, fareTotal: 90.5 }).success, false);
    assert.equal(NormalizedOffer.safeParse({ ...offer, fareTotal: -1 }).success, false);
  });

  it("una caducidad tiene que ser una fecha real", () => {
    assert.equal(NormalizedOffer.safeParse({ ...offer, expiresAt: "pronto" }).success, false);
    assert.equal(NormalizedOffer.safeParse({ ...offer, expiresAt: null }).success, true);
  });

  it("un billete partido no puede traer más de dos enlaces de reserva", () => {
    assert.equal(
      NormalizedOffer.safeParse({ ...offer, bookUrls: ["https://a.es/1", "https://a.es/2", "https://a.es/3"] }).success,
      false
    );
    assert.equal(NormalizedOffer.safeParse({ ...offer, bookUrls: [] }).success, false);
  });
});

describe("SearchProgressEvent", () => {
  const meta = { searchId: "s_1", seq: 0, at: "2026-09-01T10:00:00.000Z" };

  it("discrimina por tipo y exige el payload de ese tipo", () => {
    const ok = SearchProgressEvent.safeParse({
      ...meta,
      type: "candidate.rejected",
      candidateKey: "round_trip:MAD-BCN@2026-09-10",
      reason: "budget",
    });
    assert.equal(ok.success, true);
    assert.equal(
      SearchProgressEvent.safeParse({ ...meta, type: "candidate.rejected", candidateKey: "x", reason: "porque sí" })
        .success,
      false
    );
    assert.equal(SearchProgressEvent.safeParse({ ...meta, type: "inventado" }).success, false);
  });

  it("`seq` es obligatorio: es lo que ordena el stream, no el reloj", () => {
    const { seq, ...withoutSeq } = meta;
    assert.equal(seq, 0);
    assert.equal(
      SearchProgressEvent.safeParse({ ...withoutSeq, type: "search.failed", error: "boom", recoverable: true }).success,
      false
    );
  });

  it("solo se anuncian por voz los eventos que aportan algo", () => {
    assert.ok(ANNOUNCED_EVENTS.includes("offer.improved"));
    assert.ok(ANNOUNCED_EVENTS.includes("search.completed"));
    assert.ok(!ANNOUNCED_EVENTS.includes("candidate.scored"), "anunciar cada candidato es ruido para un lector de pantalla");
    assert.ok(!ANNOUNCED_EVENTS.includes("provider.started"));
  });
});
