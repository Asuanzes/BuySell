import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPrepareTripItems, extractTripFacts } from "./bot-tools";
import { BOT_TOOLS, WRITE_TOOLS } from "./tool-defs";
import { BOT_SYSTEM_PROMPT } from "./agent";

/*
 * C8 preparar_viaje. La regla de anclaje del propietario aplica también al
 * viaje: cada ítem nace de un dato, un hueco o un evento del registro; 8 es
 * techo, no cuota. Y la tool es ADITIVA (fuera de WRITE_TOOLS) por el mismo
 * criterio que preparar_visita: crear un checklist no destruye ni expone nada.
 */

test("preparar_viaje declarada y ADITIVA: fuera de WRITE_TOOLS como preparar_visita", () => {
  assert.ok(BOT_TOOLS.some((t) => t.function.name === "preparar_viaje"));
  assert.ok(!(WRITE_TOOLS as readonly string[]).includes("preparar_viaje"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("preparar_viaje"));
});

test("extractTripFacts: planning de respaldo cuando no hay datos reales; booking marca reservado", () => {
  const organizing = extractTripFacts({
    meta: { planning: { destinationTentative: "Japón", windowStartISO: "2026-10-01", windowEndISO: "2026-10-10", budgetCents: 250000 } },
  });
  assert.equal(organizing.destino, "Japón");
  assert.equal(organizing.dias, 10);
  assert.equal(organizing.presupuesto_cents, 250000);
  assert.equal(organizing.reservado, false);

  const booked = extractTripFacts({
    meta: { destination: "Roma", startISO: "2026-09-05", endISO: "2026-09-07", booking: { hotelRef: "H-1" }, planning: { destinationTentative: "Italia" } },
  });
  assert.equal(booked.destino, "Roma"); // el dato real gana al tentativo
  assert.equal(booked.dias, 3);
  assert.equal(booked.reservado, true);
});

test("sin destino ni fechas ni reserva: los huecos van primero y sobreviven al corte", () => {
  const items = buildPrepareTripItems(extractTripFacts({ meta: {} }));
  const keys = items.map((i) => i.key);
  assert.deepEqual(keys.slice(0, 3), ["missing:destination", "missing:dates", "missing:booking"]);
  assert.ok(items.length <= 8);
  for (const item of items) assert.ok(item.reason.length > 0, `ítem ${item.key} sin ancla`);
});

test("con destino: los dest:* llevan el destino en la etiqueta; sin ítems de hueco de destino", () => {
  const items = buildPrepareTripItems(
    extractTripFacts({ meta: { planning: { destinationTentative: "Japón" } } })
  );
  const keys = items.map((i) => i.key);
  assert.ok(!keys.includes("missing:destination"));
  assert.ok(keys.includes("dest:visa"));
  const visa = items.find((i) => i.key === "dest:visa")!;
  assert.match(visa.label, /Japón/);
});

test("duración ancla el equipaje: >5 días lavandería, ≤3 días solo de mano; techo de 8", () => {
  const long = buildPrepareTripItems(
    extractTripFacts({ meta: { destination: "Tokio", startISO: "2026-10-01", endISO: "2026-10-10", booking: {} } })
  );
  assert.ok(long.some((i) => i.key === "fact:laundry"));
  assert.ok(!long.some((i) => i.key === "fact:carryon"));
  assert.ok(long.length <= 8);

  const short = buildPrepareTripItems(
    extractTripFacts({ meta: { destination: "Roma", startISO: "2026-09-05", endISO: "2026-09-06", booking: {} } })
  );
  assert.ok(short.some((i) => i.key === "fact:carryon"));
  assert.ok(!short.some((i) => i.key === "fact:laundry"));
});
