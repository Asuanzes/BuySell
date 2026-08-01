import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FlightSearchRequest, type FlightCandidate } from "@nidokey/shared";
import { planCandidates } from "./planner";
import {
  HeuristicScorer,
  buildFeatures,
  estimateFromCalendars,
  hashSeed,
  mulberry32,
  scoreAll,
  selectPortfolio,
  type DayPrices,
} from "./scorer";

/**
 * Lo que se protege aquí: que el presupuesto de 6 llamadas de pago no se lo
 * coman seis variantes de la misma idea, y que la parte "aleatoria" sea
 * reproducible — si el sorteo cambiara entre ejecuciones, ni este test ni el
 * registro de aprendizaje de la fase 5 valdrían nada.
 */

const TODAY = "2026-09-01";
const scorer = new HeuristicScorer();

function req(over: Record<string, unknown> = {}) {
  return FlightSearchRequest.parse({
    origin: "MAD",
    destination: "BCN",
    departDate: "2026-09-10",
    returnDate: "2026-09-17",
    ...over,
  });
}

const EMPTY = { depart: {} as DayPrices, return: {} as DayPrices };

function ctxFor(r = req(), calendars = EMPTY, baselineEstimateCents: number | null = null) {
  return {
    calendars,
    requestedOrigin: r.origin,
    requestedDestination: r.destination,
    baselineEstimateCents,
  };
}

// ── Semilla ─────────────────────────────────────────────────────────────────

describe("aleatoriedad reproducible", () => {
  it("la misma semilla da siempre la misma secuencia", () => {
    const a = mulberry32(hashSeed("MAD-BCN-2026-09-10"));
    const b = mulberry32(hashSeed("MAD-BCN-2026-09-10"));
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    assert.ok(seqA.every((v) => v >= 0 && v < 1));
  });

  it("semillas distintas divergen", () => {
    const a = mulberry32(hashSeed("MAD-BCN"));
    const b = mulberry32(hashSeed("MAD-VLC"));
    assert.notEqual(a(), b());
  });
});

// ── Scorer heurístico ───────────────────────────────────────────────────────

describe("scorer heurístico", () => {
  const base = {
    isBaseline: false,
    structure: "round_trip" as const,
    driftAbsDays: 0,
    stayDeltaAbsDays: 0,
    departWeekday: 2,
    returnWeekday: 2,
    estimateCents: null,
    estimateRatio: null,
    calendarPercentile: null,
    groundTransferCents: 0,
    usesAlternateAirport: false,
  };

  it("el baseline puntúa 1: no compite, es la referencia", () => {
    assert.equal(scorer.score({ ...base, isBaseline: true, driftAbsDays: 9 }), 1);
  });

  it("una estimación más barata sube la puntuación, una más cara la baja", () => {
    const cheap = scorer.score({ ...base, estimateRatio: 0.7 });
    const same = scorer.score({ ...base, estimateRatio: 1 });
    const pricey = scorer.score({ ...base, estimateRatio: 1.4 });
    assert.ok(cheap > same, "más barato debe puntuar más");
    assert.ok(same >= pricey);
  });

  it("mover las fechas penaliza: al viajero le cuesta algo", () => {
    assert.ok(scorer.score({ ...base, driftAbsDays: 0 }) > scorer.score({ ...base, driftAbsDays: 4 }));
  });

  it("un traslado terrestre caro se descuenta de lo prometedor que parece", () => {
    assert.ok(scorer.score({ ...base }) > scorer.score({ ...base, groundTransferCents: 5000 }));
  });

  it("salir viernes o volver domingo penaliza", () => {
    assert.ok(scorer.score({ ...base, departWeekday: 2 }) > scorer.score({ ...base, departWeekday: 5 }));
    assert.ok(scorer.score({ ...base, returnWeekday: 2 }) > scorer.score({ ...base, returnWeekday: 0 }));
  });

  it("siempre devuelve un valor entre 0 y 1", () => {
    const extreme = scorer.score({ ...base, driftAbsDays: 99, groundTransferCents: 999_999, departWeekday: 5 });
    assert.ok(extreme >= 0 && extreme <= 1);
    assert.ok(scorer.score({ ...base, estimateRatio: 0 }) <= 1);
  });

  it("la versión viaja con la puntuación (la fase 5 la registra)", () => {
    assert.equal(scorer.version, "heuristic-1");
  });
});

describe("señal del calendario", () => {
  const cal = {
    depart: { "2026-09-10": 8000, "2026-09-08": 6000, "2026-09-12": 12000 } as DayPrices,
    return: { "2026-09-17": 9000 } as DayPrices,
  };

  it("promedia las pistas disponibles y no penaliza tener solo una", () => {
    const c = { legs: [{ date: "2026-09-10" }, { date: "2026-09-17" }] } as FlightCandidate;
    assert.equal(estimateFromCalendars(c, cal), 8500);
    const soloIda = { legs: [{ date: "2026-09-08" }] } as FlightCandidate;
    assert.equal(estimateFromCalendars(soloIda, cal), 6000);
  });

  it("sin dato no se inventa una estimación", () => {
    const c = { legs: [{ date: "2026-12-25" }] } as FlightCandidate;
    assert.equal(estimateFromCalendars(c, cal), null);
  });

  it("el percentil del día sale del calendario y no cuesta una llamada", () => {
    const r = req();
    const { candidates } = planCandidates(r, { todayISO: TODAY });
    const cheapDay = candidates.find((c) => c.legs[0]!.date === "2026-09-08")!;
    const dearDay = candidates.find((c) => c.legs[0]!.date === "2026-09-12")!;
    const f1 = buildFeatures(cheapDay, ctxFor(r, cal));
    const f2 = buildFeatures(dearDay, ctxFor(r, cal));
    assert.equal(f1.calendarPercentile, 0, "el día más barato del calendario");
    assert.equal(f2.calendarPercentile, 1);
  });

  it("detecta el uso de un aeropuerto alternativo", () => {
    const r = req();
    const { candidates } = planCandidates(r, { todayISO: TODAY });
    const reus = candidates.find((c) => c.legs[0]!.destination === "REU")!;
    assert.equal(buildFeatures(reus, ctxFor(r)).usesAlternateAirport, true);
    const normal = candidates.find((c) => c.isBaseline)!;
    assert.equal(buildFeatures(normal, ctxFor(r)).usesAlternateAirport, false);
  });
});

// ── Cartera ─────────────────────────────────────────────────────────────────

describe("selección de cartera", () => {
  const r = req();
  const plan = () => planCandidates(r, { todayISO: TODAY });

  it("nunca gasta más llamadas que el presupuesto", () => {
    for (const budget of [1, 2, 4, 6, 10]) {
      const { candidates } = plan();
      const scored = scoreAll(candidates, scorer, ctxFor(r));
      const p = selectPortfolio(candidates, scored, { budget, seed: "s" });
      assert.ok(p.selected.length <= budget, `presupuesto ${budget}`);
    }
  });

  it("el baseline entra siempre, incluso con presupuesto de 1", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const p = selectPortfolio(candidates, scored, { budget: 1, seed: "s" });
    assert.equal(p.selected.length, 1);
    assert.equal(p.selected[0]!.isBaseline, true);
    assert.equal(p.selected[0]!.selectionReason, "baseline");
  });

  it("con presupuesto normal la cartera es DIVERSA, no seis clones", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const p = selectPortfolio(candidates, scored, { budget: 6, seed: "s" });
    const structures = new Set(p.selected.map((c) => c.structure));
    assert.ok(structures.size >= 2, "debe haber más de una forma de comprar el viaje");
    assert.ok(
      p.selected.some((c) => c.groundTransferEstimate > 0),
      "debe reservarse un hueco al aeropuerto alternativo"
    );
  });

  it("reserva huecos de exploración solo si el presupuesto da para ello", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    assert.equal(selectPortfolio(candidates, scored, { budget: 3, seed: "s" }).explorationSlots, 0);
    assert.ok(selectPortfolio(candidates, scored, { budget: 6, seed: "s" }).explorationSlots >= 1);
  });

  it("la exploración es reproducible con la misma semilla", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const a = selectPortfolio(candidates, scored, { budget: 6, seed: "MAD-BCN-2026-09-10" });
    const b = selectPortfolio(candidates, scored, { budget: 6, seed: "MAD-BCN-2026-09-10" });
    assert.deepEqual(a.selected.map((c) => c.key), b.selected.map((c) => c.key));
  });

  it("otra semilla explora otra cosa (si no, no sería exploración)", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const keys = (seed: string) =>
      selectPortfolio(candidates, scored, { budget: 6, seed, exploreFraction: 0.5 })
        .selected.map((c) => c.key)
        .join("|");
    const variants = new Set([keys("a"), keys("b"), keys("c"), keys("d")]);
    assert.ok(variants.size > 1, "cuatro semillas no pueden dar todas la misma cartera");
  });

  it("marca por qué entró cada candidato y no repite ninguno", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const p = selectPortfolio(candidates, scored, { budget: 6, seed: "s" });
    assert.ok(p.selected.every((c) => c.selectedForVerification));
    assert.ok(p.selected.every((c) => c.selectionReason != null));
    const keys = p.selected.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("lo que se queda fuera se marca como descartado por presupuesto", () => {
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r));
    const p = selectPortfolio(candidates, scored, { budget: 6, seed: "s" });
    assert.equal(p.selected.length + p.rejected.length, candidates.length);
    assert.ok(p.rejected.every((x) => x.reason === "budget"));
  });

  it("con calendario, el día barato adelanta al caro", () => {
    const cal = {
      depart: { "2026-09-08": 4000, "2026-09-10": 20000, "2026-09-12": 21000 } as DayPrices,
      return: {} as DayPrices,
    };
    const { candidates } = plan();
    const scored = scoreAll(candidates, scorer, ctxFor(r, cal, 20000));
    const cheap = candidates.find((c) => c.legs[0]!.date === "2026-09-08" && c.structure === "round_trip")!;
    const dear = candidates.find((c) => c.legs[0]!.date === "2026-09-12" && c.structure === "round_trip")!;
    assert.ok(scored.get(cheap.key)! > scored.get(dear.key)!);
  });
});
