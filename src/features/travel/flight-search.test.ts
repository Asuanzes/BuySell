import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FlightSearchQuery,
  aviasalesUrl,
  buildDateMatrix,
  buildSplitCombos,
  daysBetween,
  duffelToOptions,
  finalizeAiItems,
  offerToOption,
  offersToLeg,
  planDuffelJobs,
  rankCandidates,
  savingsPct,
  scorePair,
  shiftISO,
  type DatePair,
  type FlightOption,
  type LegQuote,
} from "./flight-search";
import type { DuffelOffer } from "@/features/sources/providers/duffel";

/**
 * Harness DETERMINISTA de la búsqueda inteligente de vuelos: sin red, sin BBDD
 * y sin reloj (todas las "fechas de hoy" se inyectan). Cubre lo que cuesta
 * dinero si se rompe — el presupuesto de llamadas a Duffel — y lo que engaña al
 * usuario si se rompe: el % de ahorro y el enlace de reserva.
 */

const TODAY = "2026-09-01";

// ── Matriz de fechas ────────────────────────────────────────────────────────

describe("buildDateMatrix", () => {
  it("solo-ida: 5 fechas (±2) y las exactas primero", () => {
    const m = buildDateMatrix({ departDate: "2026-09-10", todayISO: TODAY });
    assert.equal(m.length, 5);
    assert.deepEqual(m[0], { depart: "2026-09-10", return: null });
    assert.deepEqual(
      m.map((p) => p.depart).sort(),
      ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]
    );
    assert.ok(m.every((p) => p.return === null));
  });

  it("ida y vuelta holgada: 25 pares (5×5) con el exacto el primero", () => {
    const m = buildDateMatrix({ departDate: "2026-09-10", returnDate: "2026-09-20", todayISO: TODAY });
    assert.equal(m.length, 25);
    assert.deepEqual(m[0], { depart: "2026-09-10", return: "2026-09-20" });
  });

  it("no genera fechas fuera de ±2", () => {
    const m = buildDateMatrix({ departDate: "2026-09-10", returnDate: "2026-09-20", todayISO: TODAY });
    for (const p of m) {
      assert.ok(Math.abs(daysBetween("2026-09-10", p.depart)) <= 2, `ida fuera de rango: ${p.depart}`);
      assert.ok(Math.abs(daysBetween("2026-09-20", p.return!)) <= 2, `vuelta fuera de rango: ${p.return}`);
    }
  });

  it("la vuelta nunca cruza por delante de la ida ni deja estancias < 1 día", () => {
    // Estancia pedida de 1 día: la mitad de la matriz es inválida.
    const m = buildDateMatrix({ departDate: "2026-09-10", returnDate: "2026-09-11", todayISO: TODAY });
    assert.equal(m.length, 15);
    for (const p of m) assert.ok(daysBetween(p.depart, p.return!) >= 1, `estancia inválida: ${JSON.stringify(p)}`);
  });

  it("descarta idas en el pasado pero conserva las fechas exactas del usuario", () => {
    const m = buildDateMatrix({ departDate: TODAY, returnDate: "2026-09-05", todayISO: TODAY });
    assert.deepEqual(m[0], { depart: TODAY, return: "2026-09-05" });
    assert.ok(m.every((p) => p.depart >= TODAY));
    assert.equal(new Set(m.map((p) => p.depart)).size, 3); // hoy, +1, +2
  });

  it("respeta las fechas exactas aunque incumplan la estancia mínima", () => {
    const m = buildDateMatrix({ departDate: "2026-09-10", returnDate: "2026-09-10", todayISO: TODAY });
    assert.deepEqual(m[0], { depart: "2026-09-10", return: "2026-09-10" });
  });

  it("matriz vacía si la ida ya pasó", () => {
    assert.deepEqual(buildDateMatrix({ departDate: "2026-08-01", todayISO: TODAY }), []);
  });
});

describe("shiftISO", () => {
  it("cruza meses y años sin desviarse por horario de verano", () => {
    assert.equal(shiftISO("2026-10-24", 2), "2026-10-26"); // cambio de hora en la UE
    assert.equal(shiftISO("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftISO("2026-03-01", -1), "2026-02-28");
  });
});

// ── Priorización ────────────────────────────────────────────────────────────

describe("rankCandidates", () => {
  const exact: DatePair = { depart: "2026-09-10", return: "2026-09-20" };
  const matrix = buildDateMatrix({ departDate: exact.depart, returnDate: exact.return, todayISO: TODAY });

  it("las fechas exactas van primero aunque sean las más caras", () => {
    const ranked = rankCandidates(matrix, (p) => (p.depart === exact.depart ? 99_999_00 : 100_00), { exact, k: 4 });
    assert.deepEqual(ranked[0], exact);
    assert.equal(ranked.length, 4);
  });

  it("ordena por precio cacheado y desempata por cercanía a lo pedido", () => {
    const cal = { depart: { "2026-09-12": 50_00, "2026-09-08": 50_00 }, return: {} };
    const ranked = rankCandidates(matrix, (p) => scorePair(p, cal), { exact, k: 3 });
    assert.deepEqual(ranked[0], exact);
    // 08 y 12 empatan a precio; ambos a 2 días de la ida → gana el menor drift
    // total (misma vuelta que la pedida) y el orden es estable por fecha.
    assert.equal(ranked[1]?.depart, "2026-09-08");
    assert.equal(ranked[1]?.return, "2026-09-20");
  });

  it("sin ningún dato cacheado prioriza los desplazamientos pequeños", () => {
    const ranked = rankCandidates(matrix, () => scorePair({ depart: "x", return: null }, { depart: {}, return: {} }), {
      exact,
      k: 3,
    });
    assert.deepEqual(ranked[0], exact);
    for (const p of ranked.slice(1)) {
      assert.ok(Math.abs(daysBetween(exact.depart, p.depart)) + Math.abs(daysBetween(exact.return!, p.return!)) <= 2);
    }
  });
});

// ── Presupuesto de llamadas ─────────────────────────────────────────────────

describe("planDuffelJobs", () => {
  const candidates: DatePair[] = [
    { depart: "2026-09-10", return: "2026-09-20" },
    { depart: "2026-09-11", return: "2026-09-20" },
    { depart: "2026-09-12", return: "2026-09-21" },
    { depart: "2026-09-08", return: "2026-09-19" },
  ];

  it("nunca supera el presupuesto, sea cual sea el número de candidatos", () => {
    for (const max of [1, 2, 3, 6, 10]) {
      const { jobs } = planDuffelJobs(candidates, max);
      assert.ok(jobs.length <= max, `${jobs.length} > ${max}`);
    }
  });

  it("el primer trabajo es SIEMPRE el billete único de las fechas exactas (baseline)", () => {
    const { jobs } = planDuffelJobs(candidates, 6);
    assert.deepEqual(jobs[0], { kind: "single", pair: candidates[0] });
  });

  it("con 6 llamadas cubre los dos primeros candidatos enteros", () => {
    const { jobs, skipped } = planDuffelJobs(candidates, 6);
    assert.equal(jobs.length, 6);
    assert.ok(skipped > 0);
    assert.deepEqual(
      jobs.map((j) => (j.kind === "single" ? `single:${j.pair.depart}` : `${j.direction}:${j.date}`)),
      [
        "single:2026-09-10",
        "out:2026-09-10",
        "back:2026-09-20",
        "single:2026-09-11",
        "out:2026-09-11",
        // "back:2026-09-20" ya pedido → el candidato 2 solo paga el tramo nuevo
        "single:2026-09-12",
      ]
    );
  });

  it("no repite un tramo ya pedido", () => {
    const { jobs } = planDuffelJobs(candidates, 99);
    const legs = jobs.filter((j) => j.kind === "leg").map((j) => (j.kind === "leg" ? `${j.direction}:${j.date}` : ""));
    assert.equal(legs.length, new Set(legs).size);
  });

  it("solo-ida no encarga tramos sueltos: el billete único ya es el tramo", () => {
    const { jobs } = planDuffelJobs([{ depart: "2026-09-10", return: null }], 6);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.kind, "single");
  });

  it("marca lo que se queda fuera para poder devolver resultado parcial", () => {
    const { jobs, skipped } = planDuffelJobs(candidates, 2);
    assert.equal(jobs.length, 2);
    assert.equal(skipped, 9); // 4 billetes únicos + 7 tramos distintos = 11 trabajos
  });
});

// ── Combinación de tramos ───────────────────────────────────────────────────

describe("buildSplitCombos", () => {
  const leg = (date: string, priceCents: number): LegQuote => ({
    date,
    priceCents,
    currency: "EUR",
    offerId: `o-${date}`,
    airline: "Iberia",
    flightNumber: null,
    departISO: `${date}T08:00:00`,
    arriveISO: `${date}T10:00:00`,
    stops: 0,
  });

  it("recombina gratis los tramos ya traídos", () => {
    const combos = buildSplitCombos(
      [leg("2026-09-10", 50_00), leg("2026-09-11", 40_00)],
      [leg("2026-09-20", 60_00), leg("2026-09-21", 55_00)]
    );
    assert.equal(combos.length, 4);
  });

  it("descarta las combinaciones con la vuelta antes que la ida", () => {
    const combos = buildSplitCombos([leg("2026-09-20", 50_00)], [leg("2026-09-19", 60_00), leg("2026-09-20", 60_00)]);
    assert.equal(combos.length, 0); // misma fecha = 0 días de estancia
  });
});

// ── Ahorro ──────────────────────────────────────────────────────────────────

describe("savingsPct", () => {
  it("calcula y redondea el porcentaje", () => {
    assert.equal(savingsPct(200_00, 154_00), 23);
    assert.equal(savingsPct(200_00, 200_00), 0);
  });

  it("sin baseline utilizable devuelve null", () => {
    assert.equal(savingsPct(null, 100_00), null);
    assert.equal(savingsPct(0, 100_00), null);
  });

  it("un resultado más caro da porcentaje negativo", () => {
    assert.equal(savingsPct(100_00, 120_00), -20);
  });
});

describe("finalizeAiItems", () => {
  const opt = (priceCents: number, over: Partial<FlightOption> = {}): FlightOption => ({
    offerId: `o${priceCents}`,
    origin: "MAD",
    destination: "BCN",
    priceCents,
    currency: "EUR",
    airline: "Iberia",
    flightNumber: null,
    departISO: "2026-09-10T08:00:00",
    returnISO: "2026-09-20T20:00:00",
    returnArriveISO: "2026-09-20T22:00:00",
    stops: 0,
    bookUrl: "https://x",
    ticketType: "single",
    ...over,
  });

  it("descarta lo que no ahorra pero conserva el baseline", () => {
    const items = finalizeAiItems([opt(200_00), opt(154_00, { airline: "Vueling" }), opt(260_00, { airline: "Ryanair" })], 200_00);
    assert.deepEqual(
      items.map((i) => [i.priceCents, i.savingsPct]),
      [
        [154_00, 23],
        [200_00, 0],
      ]
    );
  });

  it("sin baseline devuelve todo sin porcentaje", () => {
    const items = finalizeAiItems([opt(200_00), opt(154_00, { airline: "Vueling" })], null);
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.savingsPct === null));
  });

  it("deduplica y tope MAX_OPTIONS", () => {
    const items = finalizeAiItems([opt(100_00), opt(100_00), opt(90_00, { airline: "Vueling" })], 200_00, 2);
    assert.equal(items.length, 2);
  });

  it("un split y un billete único del mismo precio conviven (son compras distintas)", () => {
    const items = finalizeAiItems([opt(100_00), opt(100_00, { ticketType: "split" })], 200_00);
    assert.equal(items.length, 2);
  });
});

// ── Contrato Zod ────────────────────────────────────────────────────────────

describe("FlightSearchQuery", () => {
  const base = { origin: "MAD", destination: "BCN", departDate: "2026-09-10" };

  it('"false" NO activa la IA (la trampa de z.coerce.boolean)', () => {
    assert.equal(FlightSearchQuery.parse({ ...base, aiSearch: "false" }).aiSearch, false);
    assert.equal(FlightSearchQuery.parse({ ...base, aiSearch: "0" }).aiSearch, false);
    assert.equal(FlightSearchQuery.parse(base).aiSearch, false);
  });

  it('"1" y "true" la activan', () => {
    assert.equal(FlightSearchQuery.parse({ ...base, aiSearch: "1" }).aiSearch, true);
    assert.equal(FlightSearchQuery.parse({ ...base, aiSearch: "true" }).aiSearch, true);
  });

  it("rechaza una vuelta anterior a la ida", () => {
    const r = FlightSearchQuery.safeParse({ ...base, returnDate: "2026-09-09" });
    assert.equal(r.success, false);
  });

  it("rechaza fechas mal formadas e IATA inválidos", () => {
    assert.equal(FlightSearchQuery.safeParse({ ...base, departDate: "10/09/2026" }).success, false);
    assert.equal(FlightSearchQuery.safeParse({ ...base, origin: "MADRID" }).success, false);
  });

  it("coacciona adultos y acepta idioma del resumen", () => {
    const q = FlightSearchQuery.parse({ ...base, adults: "3", lang: "en" });
    assert.equal(q.adults, 3);
    assert.equal(q.lang, "en");
  });
});

// ── Enlace de afiliado ──────────────────────────────────────────────────────

describe("aviasalesUrl", () => {
  it("usa DDMM (no AAMM) — el enlace apuntaba a una fecha equivocada", () => {
    assert.equal(aviasalesUrl("MAD", "BCN", "2026-08-15"), "https://www.aviasales.com/search/MAD1508BCN1");
  });

  it("incluye la vuelta y el número de pasajeros", () => {
    assert.equal(
      aviasalesUrl("MAD", "BCN", "2026-08-15", "2026-08-22", 3),
      "https://www.aviasales.com/search/MAD1508BCN22083"
    );
  });

  it("sin ida no cuela la vuelta suelta (la URL quedaría ambigua)", () => {
    assert.equal(aviasalesUrl("MAD", "BCN", null, "2026-08-22"), "https://www.aviasales.com/search/MADBCN1");
  });
});

// ── Adaptación de ofertas Duffel ────────────────────────────────────────────

const ctx = { origin: "MAD", destination: "BCN", bookUrl: "https://x" };

function offer(over: Partial<DuffelOffer> = {}): DuffelOffer {
  return {
    id: "off_1",
    total_amount: "144.91",
    total_currency: "EUR",
    owner: { name: "Iberia" },
    slices: [{ segments: [{ departing_at: "2026-09-10T08:00:00", arriving_at: "2026-09-10T09:30:00" }] }],
    ...over,
  };
}

describe("offerToOption", () => {
  it("convierte el importe a céntimos", () => {
    assert.equal(offerToOption(offer(), ctx)?.priceCents, 144_91);
  });

  it("un nocturno con escala enseña la llegada REAL del último segmento (+1 día)", () => {
    const o = offer({
      slices: [
        { segments: [{ departing_at: "2026-09-10T08:00:00", arriving_at: "2026-09-10T09:30:00" }] },
        {
          segments: [
            { departing_at: "2026-09-20T23:40:00", arriving_at: "2026-09-21T01:10:00", marketing_carrier: { name: "Vueling" } },
            { departing_at: "2026-09-21T06:00:00", arriving_at: "2026-09-21T07:45:00" },
          ],
        },
      ],
    });
    const opt = offerToOption(o, ctx)!;
    assert.equal(opt.returnISO, "2026-09-20T23:40:00");
    assert.equal(opt.returnArriveISO, "2026-09-21T07:45:00");
    assert.equal(opt.returnAirline, "Vueling");
  });

  it("descarta importes no numéricos en vez de propagar NaN a un precio", () => {
    assert.equal(offerToOption(offer({ total_amount: "n/a" }), ctx), null);
  });
});

describe("duffelToOptions", () => {
  it("ordena por precio y deduplica aerolínea+hora", () => {
    const items = duffelToOptions(
      [offer({ id: "a", total_amount: "200" }), offer({ id: "b", total_amount: "100" }), offer({ id: "c", total_amount: "150" })],
      ctx
    );
    assert.equal(items.length, 1); // misma aerolínea y misma hora → una sola
    assert.equal(items[0]?.priceCents, 100_00);
  });
});

describe("offersToLeg", () => {
  it("se queda con el tramo más barato de esa fecha", () => {
    const leg = offersToLeg([offer({ total_amount: "80" }), offer({ id: "b", total_amount: "60" })], "2026-09-10");
    assert.equal(leg?.priceCents, 60_00);
    assert.equal(leg?.date, "2026-09-10");
  });

  it("sin ofertas usables devuelve null", () => {
    assert.equal(offersToLeg([], "2026-09-10"), null);
    assert.equal(offersToLeg([offer({ total_amount: "" })], "2026-09-10"), null);
  });
});
