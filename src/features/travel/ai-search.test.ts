import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aiFlightSearch, type AiSearchDeps } from "./ai-search";
import type { DuffelOffer } from "@/features/sources/providers/duffel";

/**
 * Integración de la búsqueda IA con un Duffel FALSO. Duffel cobra por petición:
 * esta prueba nunca debe llegar a la red. Travelpayouts y el LLM tampoco, porque
 * sin claves en el entorno degradan solos (calendario vacío, resumen null) — que
 * es exactamente el camino que hay que verificar que no rompe nada.
 */

const TODAY = "2026-09-01";
const DEPART = "2026-09-10";
const RETURN = "2026-09-20";

function offer(id: string, amount: string, slices: DuffelOffer["slices"]): DuffelOffer {
  return { id, total_amount: amount, total_currency: "EUR", owner: { name: "Iberia" }, slices };
}

const oneWay = (date: string) => [{ segments: [{ departing_at: `${date}T08:00:00`, arriving_at: `${date}T10:00:00` }] }];
const roundTrip = (dep: string, ret: string) => [
  { segments: [{ departing_at: `${dep}T08:00:00`, arriving_at: `${dep}T10:00:00` }] },
  { segments: [{ departing_at: `${ret}T20:00:00`, arriving_at: `${ret}T22:00:00` }] },
];

/** Duffel falso que registra cada llamada y responde según un tarifario. */
function fakeDuffel(priceOf: (o: { origin: string; destination: string; departDate: string; returnDate?: string }) => number | null) {
  const calls: { origin: string; destination: string; departDate: string; returnDate?: string }[] = [];
  const searchOffers: AiSearchDeps["searchOffers"] = async (opts) => {
    calls.push({ origin: opts.origin, destination: opts.destination, departDate: opts.departDate, returnDate: opts.returnDate });
    const price = priceOf(opts);
    if (price == null) throw new Error("sin disponibilidad");
    return [
      offer(
        `${opts.origin}${opts.departDate}${opts.returnDate ?? ""}`,
        String(price),
        opts.returnDate ? roundTrip(opts.departDate, opts.returnDate) : oneWay(opts.departDate)
      ),
    ];
  };
  return { calls, deps: { searchOffers } satisfies AiSearchDeps };
}

const params = {
  origin: "MAD",
  destination: "BCN",
  departDate: DEPART,
  returnDate: RETURN,
  adults: 1,
  childAges: [],
  lang: "es" as const,
  maxDuffelCalls: 6,
  todayISO: TODAY,
};

describe("aiFlightSearch", () => {
  it("NUNCA supera el presupuesto de llamadas a Duffel", async () => {
    for (const maxDuffelCalls of [2, 3, 6, 12]) {
      const { calls, deps } = fakeDuffel(() => 200);
      const r = await aiFlightSearch({ ...params, maxDuffelCalls }, deps);
      assert.ok(calls.length <= maxDuffelCalls, `${calls.length} llamadas con tope ${maxDuffelCalls}`);
      assert.equal(r.ai.duffelCalls.used, calls.length);
    }
  });

  it("la primera llamada son las fechas EXACTAS: de ahí sale el baseline", async () => {
    const { calls, deps } = fakeDuffel(() => 200);
    const r = await aiFlightSearch(params, deps);
    assert.deepEqual(calls[0], { origin: "MAD", destination: "BCN", departDate: DEPART, returnDate: RETURN });
    assert.equal(r.ai.baselineCents, 200_00);
  });

  it("encuentra el ahorro por cambio de fechas y calcula bien el porcentaje", async () => {
    // Salir un día antes vale 154 €; todo lo demás, 200 €.
    const { deps } = fakeDuffel((o) => (o.returnDate ? (o.departDate === "2026-09-09" ? 154 : 200) : 999));
    const r = await aiFlightSearch(params, deps);
    const best = r.items[0]!;
    assert.equal(best.priceCents, 154_00);
    assert.equal(best.savingsPct, 23);
    assert.deepEqual(best.dateShift, { depart: -1, return: 0 });
    assert.equal(best.ticketType, "single");
  });

  it("dos solo-idas ganan al billete único y se marcan como split, con 2 enlaces", async () => {
    // i/v único 400 €; cada tramo suelto 90 € → 180 € comprando por separado.
    const { deps } = fakeDuffel((o) => (o.returnDate ? 400 : 90));
    const r = await aiFlightSearch(params, deps);
    const best = r.items[0]!;
    assert.equal(best.ticketType, "split");
    assert.equal(best.priceCents, 180_00);
    assert.equal(best.savingsPct, 55);
    assert.equal(best.bookUrls?.length, 2);
    // El segundo enlace es el de la VUELTA: origen y destino invertidos.
    assert.match(best.bookUrls![0]!, /search\/MAD\d{4}BCN/);
    assert.match(best.bookUrls![1]!, /search\/BCN\d{4}MAD/);
  });

  it("descarta las opciones que no ahorran (nunca se propone algo más caro)", async () => {
    const { deps } = fakeDuffel((o) => (o.departDate === DEPART && o.returnDate === RETURN ? 100 : 500));
    const r = await aiFlightSearch(params, deps);
    assert.ok(r.items.length >= 1);
    for (const it of r.items) assert.ok((it.savingsPct ?? 0) >= 0, `opción más cara colada: ${it.priceCents}`);
  });

  it("marca resultado parcial cuando el presupuesto no llega a toda la matriz", async () => {
    const { deps } = fakeDuffel(() => 200);
    assert.equal((await aiFlightSearch({ ...params, maxDuffelCalls: 2 }, deps)).ai.partial, true);
  });

  it("un proveedor caído no tumba la búsqueda: cuenta la llamada y sigue", async () => {
    const { calls, deps } = fakeDuffel((o) => (o.departDate === DEPART ? 200 : null));
    const r = await aiFlightSearch(params, deps);
    assert.equal(r.ai.duffelCalls.used, calls.length); // los fallos también se cobran
    assert.equal(r.ai.baselineCents, 200_00);
  });

  it("si TODO Duffel falla devuelve lista vacía en vez de reventar", async () => {
    const { deps } = fakeDuffel(() => null);
    const r = await aiFlightSearch(params, deps);
    assert.deepEqual(r.items, []);
    assert.equal(r.ai.baselineCents, null);
    assert.equal(r.ai.summary, null);
  });

  it("solo-ida: sin tramos sueltos que combinar, ningún resultado split", async () => {
    const { calls, deps } = fakeDuffel(() => 100);
    const r = await aiFlightSearch({ ...params, returnDate: null }, deps);
    assert.ok(calls.every((c) => c.returnDate === undefined));
    assert.ok(r.items.every((i) => i.ticketType === "single"));
  });

  it("fechas ya pasadas: degrada a 'no_dates' sin gastar una sola llamada", async () => {
    const { calls, deps } = fakeDuffel(() => 100);
    const r = await aiFlightSearch({ ...params, departDate: "2026-08-01", returnDate: "2026-08-05" }, deps);
    assert.equal(calls.length, 0);
    assert.equal(r.ai.degraded, "no_dates");
    assert.deepEqual(r.items, []);
  });

  it("no propone una vuelta anterior a la ida", async () => {
    const { deps } = fakeDuffel((o) => (o.returnDate ? 400 : 50));
    // Estancia de 1 día: la mitad de la matriz sería inválida.
    const r = await aiFlightSearch({ ...params, returnDate: "2026-09-11" }, deps);
    for (const it of r.items) {
      if (!it.returnISO || !it.departISO) continue;
      assert.ok(it.returnISO.slice(0, 10) > it.departISO.slice(0, 10), `vuelta ≤ ida: ${JSON.stringify(it)}`);
    }
  });
});
