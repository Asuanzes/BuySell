import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FlightSearchRequest, type SearchProgressEvent } from "@nidokey/shared";
import type { DuffelOffer } from "@/features/sources/providers/duffel";
import { HeuristicScorer } from "./scorer";
import { MAX_CONCURRENT_PROVIDER, planProviderJobs, runFlightSearch, type SearchDeps } from "./stream-search";
import { planCandidates } from "./planner";

/**
 * El orquestador con el proveedor INYECTADO: ningún test llama a Duffel (que se
 * paga por petición). Lo que se protege aquí es lo que cuesta dinero — el tope
 * de llamadas, que cancelar corte de verdad — y lo que deja al usuario tirado:
 * que un proveedor caído degrade en vez de romper.
 */

const D = JSON.parse(
  readFileSync(new URL("./__fixtures__/duffel.json", import.meta.url), "utf8")
) as Record<string, DuffelOffer> & { malformed: DuffelOffer[] };

const TODAY = "2026-09-01";
const NOW = "2026-09-01T10:00:00.000Z";

function req(over: Record<string, unknown> = {}) {
  return FlightSearchRequest.parse({
    origin: "MAD",
    destination: "BCN",
    departDate: "2026-09-10",
    returnDate: "2026-09-17",
    aiSearch: true,
    ...over,
  });
}

type Spy = { calls: number; concurrentMax: number };

/** Proveedor falso: devuelve el fixture y mide llamadas y concurrencia real. */
function fakeProvider(opts: { fail?: boolean; delayMs?: number; spy?: Spy } = {}): SearchDeps["searchOffers"] {
  let inFlight = 0;
  return (async () => {
    if (opts.spy) {
      opts.spy.calls++;
      inFlight++;
      opts.spy.concurrentMax = Math.max(opts.spy.concurrentMax, inFlight);
    }
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.spy) inFlight--;
    if (opts.fail) throw new Error("proveedor caído");
    return [D.roundTripDirect!];
  }) as SearchDeps["searchOffers"];
}

function deps(over: Partial<SearchDeps> = {}): SearchDeps {
  return {
    searchOffers: fakeProvider(),
    loadCalendars: async () => ({ depart: {}, return: {} }),
    scorer: new HeuristicScorer(),
    now: () => NOW,
    ...over,
  };
}

async function collect(gen: AsyncGenerator<SearchProgressEvent>): Promise<SearchProgressEvent[]> {
  const out: SearchProgressEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const typesOf = (events: SearchProgressEvent[]) => events.map((e) => e.type);
const last = <T extends SearchProgressEvent["type"]>(events: SearchProgressEvent[], type: T) =>
  events.filter((e) => e.type === type).pop() as Extract<SearchProgressEvent, { type: T }> | undefined;

// ── Plan de llamadas ────────────────────────────────────────────────────────

describe("plan de llamadas al proveedor", () => {
  const { candidates } = planCandidates(req(), { todayISO: TODAY });

  it("un open-jaw se pide en UNA llamada con sus dos trayectos", () => {
    const oj = candidates.find((c) => c.structure === "open_jaw")!;
    const { jobs } = planProviderJobs([oj], 6);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.kind, "itinerary");
  });

  it("un billete partido cuesta dos tramos, y los tramos se comparten", () => {
    const splits = candidates.filter((c) => c.structure === "split").slice(0, 2);
    const { jobs } = planProviderJobs(splits, 10);
    // Dos candidatos partidos que comparten fecha de ida pagan el tramo una vez.
    const legKeys = jobs.filter((j) => j.kind === "leg").map((j) => (j as { legKey: string }).legKey);
    assert.equal(new Set(legKeys).size, legKeys.length);
  });

  it("recorta al presupuesto y dice cuánto se dejó fuera", () => {
    const { jobs, skipped } = planProviderJobs(candidates.slice(0, 10), 3);
    assert.equal(jobs.length, 3);
    assert.ok(skipped > 0);
  });
});

// ── Recorrido completo ──────────────────────────────────────────────────────

describe("búsqueda completa", () => {
  it("emite el ciclo de vida en orden y con seq monótono", async () => {
    const events = await collect(runFlightSearch(req(), { budget: 4, dailyRemaining: 40, todayISO: TODAY, deps: deps() }));
    const types = typesOf(events);
    assert.equal(types[0], "search.started");
    assert.equal(types[types.length - 1], "search.completed");
    assert.ok(types.includes("candidates.generated"));
    assert.ok(types.includes("cache.checked"));
    assert.ok(types.includes("provider.started"));
    assert.ok(types.includes("offer.found"));
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i]!.seq > events[i - 1]!.seq, "los seq tienen que crecer siempre");
    }
    assert.equal(new Set(events.map((e) => e.searchId)).size, 1);
  });

  it("no lanza NUNCA más consultas que el presupuesto", async () => {
    for (const budget of [1, 2, 4, 6]) {
      const spy: Spy = { calls: 0, concurrentMax: 0 };
      const events = await collect(
        runFlightSearch(req(), {
          budget,
          dailyRemaining: 40,
          todayISO: TODAY,
          deps: deps({ searchOffers: fakeProvider({ spy }) }),
        })
      );
      assert.ok(spy.calls <= budget, `presupuesto ${budget}: ${spy.calls} llamadas`);
      const quota = last(events, "quota.updated");
      assert.equal(quota?.duffelCalls.used, spy.calls);
    }
  });

  it("respeta el tope de concurrencia", async () => {
    const spy: Spy = { calls: 0, concurrentMax: 0 };
    await collect(
      runFlightSearch(req(), {
        budget: 6,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({ searchOffers: fakeProvider({ spy, delayMs: 15 }) }),
      })
    );
    assert.ok(spy.concurrentMax > 1, "en serie la búsqueda se va de tiempo");
    assert.ok(spy.concurrentMax <= MAX_CONCURRENT_PROVIDER, `concurrencia ${spy.concurrentMax}`);
  });

  it("la cuota que se informa descuenta de la diaria", async () => {
    const events = await collect(
      runFlightSearch(req(), { budget: 3, dailyRemaining: 10, todayISO: TODAY, deps: deps() })
    );
    const done = last(events, "search.completed")!;
    assert.equal(done.response.budget.dailyRemaining, 10 - done.response.budget.duffelCalls.used);
  });

  it("el resumen del LLM es opcional y llega al final", async () => {
    const events = await collect(
      runFlightSearch(req(), {
        budget: 2,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({ summarize: async () => "El más barato mueve la ida un día." }),
      })
    );
    assert.equal(last(events, "search.completed")!.response.summary, "El más barato mueve la ida un día.");
  });

  it("si el LLM falla, la búsqueda termina igual y sin resumen", async () => {
    const events = await collect(
      runFlightSearch(req(), {
        budget: 2,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({
          summarize: async () => {
            throw new Error("timeout del modelo");
          },
          prioritize: async () => {
            throw new Error("timeout del modelo");
          },
        }),
      })
    );
    const done = last(events, "search.completed");
    assert.ok(done, "un modelo caído no puede tumbar la búsqueda");
    assert.equal(done!.response.summary, null);
    assert.ok(done!.response.offers.length > 0);
  });

  it("el LLM no puede colar un candidato que no exista", async () => {
    const events = await collect(
      runFlightSearch(req(), {
        budget: 3,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({ prioritize: async () => ["clave-inventada", "otra-mentira"] }),
      })
    );
    const done = last(events, "search.completed")!;
    assert.ok(done.response.offers.every((o) => o.candidateKey.includes(":")));
    assert.ok(done.response.offers.length > 0);
  });
});

// ── Degradación ─────────────────────────────────────────────────────────────

describe("degradación", () => {
  it("un proveedor caído da búsqueda PARCIAL, no un error", async () => {
    const events = await collect(
      runFlightSearch(req(), {
        budget: 3,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({ searchOffers: fakeProvider({ fail: true }) }),
      })
    );
    assert.ok(!typesOf(events).includes("search.failed"));
    const partial = last(events, "search.partial");
    assert.ok(partial, "debe avisar de que quedó a medias");
    assert.equal(partial!.reason, "provider_error");
    assert.equal(last(events, "search.completed")!.response.partial, true);
    assert.ok(typesOf(events).filter((t) => t === "candidate.rejected").length > 0);
  });

  it("quedarse sin presupuesto también es parcial", async () => {
    const events = await collect(
      runFlightSearch(req(), { budget: 2, dailyRemaining: 40, todayISO: TODAY, deps: deps() })
    );
    const partial = last(events, "search.partial");
    assert.equal(partial?.reason, "budget");
  });

  it("un calendario caído no impide buscar", async () => {
    const events = await collect(
      runFlightSearch(req(), {
        budget: 2,
        dailyRemaining: 40,
        todayISO: TODAY,
        deps: deps({
          loadCalendars: async () => {
            throw new Error("Travelpayouts 500");
          },
        }),
      })
    );
    assert.ok(last(events, "search.completed")!.response.offers.length > 0);
  });

  it("sin fechas válidas falla explícitamente en vez de devolver vacío mudo", async () => {
    const events = await collect(
      runFlightSearch(req({ departDate: "2026-08-01", returnDate: "2026-08-05" }), {
        budget: 4,
        dailyRemaining: 40,
        todayISO: "2026-09-01",
        deps: deps(),
      })
    );
    const failed = last(events, "search.failed");
    assert.equal(failed?.error, "no_dates");
  });
});

// ── Cancelación ─────────────────────────────────────────────────────────────

describe("cancelación", () => {
  it("cancelar deja de gastar llamadas", async () => {
    const spy: Spy = { calls: 0, concurrentMax: 0 };
    const controller = new AbortController();
    const events: SearchProgressEvent[] = [];
    for await (const e of runFlightSearch(req(), {
      budget: 6,
      dailyRemaining: 40,
      todayISO: TODAY,
      signal: controller.signal,
      deps: deps({ searchOffers: fakeProvider({ spy, delayMs: 10 }) }),
    })) {
      events.push(e);
      // En cuanto se paga la primera consulta, el usuario pulsa "detener".
      if (e.type === "quota.updated") controller.abort();
    }
    assert.ok(spy.calls < 6, `debería cortar antes de agotar el presupuesto (${spy.calls})`);
    const partial = last(events, "search.partial");
    assert.equal(partial?.reason, "cancelled");
  });

  it("cancelar DEVUELVE lo encontrado hasta ese momento, no lo tira", async () => {
    const controller = new AbortController();
    const events: SearchProgressEvent[] = [];
    for await (const e of runFlightSearch(req(), {
      budget: 6,
      dailyRemaining: 40,
      todayISO: TODAY,
      signal: controller.signal,
      deps: deps({ searchOffers: fakeProvider({ delayMs: 5 }) }),
    })) {
      events.push(e);
      if (e.type === "offer.found") controller.abort();
    }
    const done = last(events, "search.completed");
    assert.ok(done, "una búsqueda cancelada termina, no se queda colgada");
    assert.ok(done!.response.offers.length > 0, "lo ya pagado se entrega");
    assert.equal(done!.response.partial, true);
  });

  it("cancelar antes de empezar no gasta nada", async () => {
    const spy: Spy = { calls: 0, concurrentMax: 0 };
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      runFlightSearch(req(), {
        budget: 6,
        dailyRemaining: 40,
        todayISO: TODAY,
        signal: controller.signal,
        deps: deps({ searchOffers: fakeProvider({ spy }) }),
      })
    );
    assert.equal(spy.calls, 0);
    assert.equal(last(events, "search.partial")?.reason, "cancelled");
  });
});
