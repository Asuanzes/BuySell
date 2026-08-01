import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyProgressEvent, initialProgressState, parseSseBuffer } from "./flight-progress";
import type { NormalizedOffer, SearchProgressEvent } from "./flights";

/**
 * Este reductor es el que aguanta una red de verdad: eventos que llegan tarde,
 * repetidos, o un stream que se corta y vuelve. Si falla, el usuario ve precios
 * duplicados o un "mejor precio" que retrocede — que es peor que no enseñar
 * nada, porque parece que el precio ha subido.
 */

const SID = "fs_test";
let seq = 0;
const ev = <T extends SearchProgressEvent["type"]>(
  type: T,
  rest: Record<string, unknown> = {},
  over: { seq?: number; searchId?: string } = {}
): SearchProgressEvent =>
  ({
    type,
    searchId: over.searchId ?? SID,
    seq: over.seq ?? seq++,
    at: "2026-09-01T10:00:00.000Z",
    ...rest,
  }) as SearchProgressEvent;

const offer = (key: string, total: number): NormalizedOffer => ({
  candidateKey: key,
  offerIds: [`off_${key}`],
  structure: "round_trip",
  ticketType: "single",
  fareTotal: total - 1000,
  mandatoryFees: 1000,
  baggageCost: 0,
  seatCost: 0,
  groundTransferEstimate: 0,
  totalTripCost: total,
  currency: "EUR",
  comparable: true,
  legs: [
    {
      origin: "MAD",
      destination: "BCN",
      departISO: "2026-09-10T08:00:00",
      arriveISO: "2026-09-10T09:20:00",
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
  confidence: "verified",
  estimatedComponents: [],
  savingsPct: null,
  savingsCents: null,
});

const reduce = (events: SearchProgressEvent[]) => events.reduce(applyProgressEvent, initialProgressState);

// ── Camino normal ───────────────────────────────────────────────────────────

describe("progreso normal", () => {
  it("recorre las fases y va contando", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }),
      ev("candidates.generated", { total: 12, byStructure: {}, truncated: 0 }),
      ev("cache.checked", { hits: 7, misses: 5, oldestAgeSeconds: null }),
      ev("candidate.scored", { candidate: {} }),
      ev("candidate.scored", { candidate: {} }),
      ev("provider.started", { provider: "duffel", candidateKey: "k1", index: 0, total: 4 }),
      ev("offer.found", { offer: offer("k1", 14000) }),
    ]);
    assert.equal(s.phase, "verifying");
    assert.equal(s.candidatesTotal, 12);
    assert.equal(s.candidatesAnalyzed, 2);
    assert.equal(s.verifiedCount, 1);
    assert.equal(s.best?.totalTripCost, 14000);
  });

  it("el «mejor precio» solo baja, nunca sube por llegar otra oferta", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }),
      ev("offer.found", { offer: offer("k1", 12000) }),
      ev("offer.found", { offer: offer("k2", 18000) }),
      ev("offer.found", { offer: offer("k3", 9000) }),
    ]);
    assert.equal(s.best?.candidateKey, "k3");
    assert.deepEqual(s.offers.map((o) => o.totalTripCost), [9000, 12000, 18000]);
  });
});

// ── Fuera de orden y duplicados ─────────────────────────────────────────────

describe("eventos fuera de orden", () => {
  it("un evento viejo NO pisa al nuevo", () => {
    seq = 0;
    const started = ev("search.started", { algoVersion: "fs-1", request: {} });
    const nuevo = ev("offer.found", { offer: offer("k1", 9000) }, { seq: 5 });
    const viejo = ev("offer.found", { offer: offer("k2", 30000) }, { seq: 2 });
    const s = reduce([started, nuevo, viejo]);
    assert.equal(s.lastSeq, 5);
    assert.equal(s.offers.length, 1, "el evento atrasado se descarta entero");
    assert.equal(s.best?.candidateKey, "k1");
  });

  it("el mismo evento dos veces no duplica la oferta", () => {
    seq = 0;
    const started = ev("search.started", { algoVersion: "fs-1", request: {} });
    const found = ev("offer.found", { offer: offer("k1", 9000) }, { seq: 3 });
    const s = reduce([started, found, found, found]);
    assert.equal(s.offers.length, 1);
  });

  it("una oferta reenviada con otro precio ACTUALIZA, no añade", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("offer.found", { offer: offer("k1", 14000) }, { seq: 1 }),
      ev("offer.improved", { offer: { ...offer("k1", 11000) }, previousTotalCents: 14000 }, { seq: 2 }),
    ]);
    assert.equal(s.offers.length, 1);
    assert.equal(s.best?.totalTripCost, 11000);
  });

  it("eventos de OTRA búsqueda se ignoran", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("offer.found", { offer: offer("k1", 9000) }, { seq: 1 }),
      ev("offer.found", { offer: offer("zz", 100) }, { seq: 99, searchId: "otra_busqueda" }),
    ]);
    assert.equal(s.offers.length, 1);
    assert.equal(s.best?.candidateKey, "k1");
  });

  it("una búsqueda NUEVA reinicia el estado en vez de mezclar", () => {
    seq = 0;
    const previa = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("offer.found", { offer: offer("k1", 9000) }, { seq: 1 }),
    ]);
    const s = applyProgressEvent(
      previa,
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0, searchId: "fs_otra" })
    );
    assert.equal(s.searchId, "fs_otra");
    assert.equal(s.offers.length, 0);
    assert.equal(s.best, null);
    assert.equal(s.lastSeq, 0, "el contador se reinicia con la búsqueda");
  });
});

// ── Reconexión ──────────────────────────────────────────────────────────────

describe("reconexión del stream", () => {
  it("reanudar y recibir de nuevo lo ya visto no duplica ni pierde", () => {
    seq = 0;
    const antes = [
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("candidates.generated", { total: 10, byStructure: {}, truncated: 0 }, { seq: 1 }),
      ev("offer.found", { offer: offer("k1", 14000) }, { seq: 2 }),
      ev("offer.found", { offer: offer("k2", 11000) }, { seq: 3 }),
    ];
    const cortado = reduce(antes);
    assert.equal(cortado.offers.length, 2);

    // Se reanuda: el servidor reenvía parte de lo anterior y sigue.
    const despues = [
      ev("offer.found", { offer: offer("k1", 14000) }, { seq: 2 }),
      ev("offer.found", { offer: offer("k2", 11000) }, { seq: 3 }),
      ev("offer.found", { offer: offer("k3", 8000) }, { seq: 4 }),
    ];
    const s = despues.reduce(applyProgressEvent, cortado);
    assert.equal(s.offers.length, 3, "ni una oferta duplicada");
    assert.equal(s.best?.candidateKey, "k3");
  });

  it("un corte deja el estado utilizable: lo encontrado sigue ahí", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("offer.found", { offer: offer("k1", 14000) }, { seq: 1 }),
    ]);
    assert.equal(s.phase, "verifying");
    assert.equal(s.offers.length, 1, "el usuario puede abrir ese resultado aunque el stream muriera");
  });
});

// ── Final ───────────────────────────────────────────────────────────────────

describe("cierre", () => {
  it("un parcial marca el estado y conserva lo encontrado", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("offer.found", { offer: offer("k1", 14000) }, { seq: 1 }),
      ev("search.partial", { reason: "cancelled", offers: [offer("k1", 14000)] }, { seq: 2 }),
    ]);
    assert.equal(s.phase, "partial");
    assert.equal(s.partial, true);
    assert.equal(s.partialReason, "cancelled");
    assert.equal(s.offers.length, 1);
  });

  it("completado tras un parcial SIGUE siendo parcial", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("search.partial", { reason: "budget", offers: [offer("k1", 14000)] }, { seq: 1 }),
      ev(
        "search.completed",
        {
          response: {
            searchId: SID,
            algoVersion: "fs-1",
            baseline: offer("k1", 14000),
            offers: [offer("k1", 14000)],
            rankings: { cheapest: ["k1"], balanced: ["k1"], fastest: ["k1"], savings: [] },
            partial: true,
            degraded: null,
            budget: { duffelCalls: { used: 3, max: 6 }, dailyRemaining: 37 },
            summary: "Lo más barato son las fechas exactas.",
          },
        },
        { seq: 2 }
      ),
    ]);
    assert.equal(s.phase, "partial");
    assert.equal(s.summary, "Lo más barato son las fechas exactas.");
    assert.equal(s.quota.used, 3);
    assert.equal(s.baseline?.candidateKey, "k1");
  });

  it("un fallo se recuerda como fallo", () => {
    seq = 0;
    const s = reduce([
      ev("search.started", { algoVersion: "fs-1", request: {} }, { seq: 0 }),
      ev("search.failed", { error: "no_dates", recoverable: false }, { seq: 1 }),
    ]);
    assert.equal(s.phase, "failed");
    assert.equal(s.error, "no_dates");
  });
});

// ── Cable SSE ───────────────────────────────────────────────────────────────

describe("lectura del cable SSE", () => {
  const wire = (e: SearchProgressEvent) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;

  it("saca los eventos completos y guarda la cola a medias", () => {
    seq = 0;
    const a = ev("search.started", { algoVersion: "fs-1", request: {} });
    const b = ev("offer.found", { offer: offer("k1", 9000) });
    const buffer = wire(a) + wire(b);
    const cortado = buffer.slice(0, buffer.length - 20);
    const first = parseSseBuffer(cortado);
    assert.equal(first.events.length, 1);
    assert.equal(first.events[0]!.type, "search.started");
    assert.ok(first.rest.length > 0, "el evento partido a la mitad NO se pierde");
    // Llega el resto del chunk: ahora sí se completa.
    const second = parseSseBuffer(first.rest + buffer.slice(buffer.length - 20));
    assert.equal(second.events.length, 1);
    assert.equal(second.events[0]!.type, "offer.found");
  });

  it("aguanta \\r\\n y bloques sin datos", () => {
    seq = 0;
    const a = ev("search.started", { algoVersion: "fs-1", request: {} });
    const buffer = `: ping\r\n\r\n` + wire(a).replace(/\n/g, "\r\n");
    const { events } = parseSseBuffer(buffer);
    assert.equal(events.length, 1);
  });

  it("un bloque con JSON roto se salta sin tirar el resto", () => {
    seq = 0;
    const bueno = wire(ev("search.started", { algoVersion: "fs-1", request: {} }));
    const roto = `event: offer.found\ndata: {esto no es json\n\n`;
    const { events } = parseSseBuffer(roto + bueno);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, "search.started");
  });
});
