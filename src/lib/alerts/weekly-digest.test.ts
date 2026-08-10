// Ejecutar: node --import tsx --test src/lib/alerts/weekly-digest.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWeeklyDigestText,
  previousCompletedUtcWeek,
  weeklyDigestClientId,
  type WeeklyDigestWindow,
} from "./weekly-digest";

const WINDOW: WeeklyDigestWindow = {
  weekStart: new Date("2026-08-03T00:00:00.000Z"),
  weekEnd: new Date("2026-08-10T00:00:00.000Z"),
};

function event(over: Partial<Parameters<typeof buildWeeklyDigestText>[0][number]> = {}) {
  return {
    recordType: "property",
    recordId: "p1",
    eventType: "price_changed",
    payload: { recordTitle: "Piso centro", previousCents: 220_000_00, newCents: 210_000_00 },
    observedAt: new Date("2026-08-09T12:00:00.000Z"),
    ...over,
  };
}

test("plantilla: solo precios agrupa bajadas y enlaza ejemplos", () => {
  const text = buildWeeklyDigestText(
    [
      event(),
      event({ recordId: "p2", payload: { recordTitle: "Atico", previousCents: 120_000_00, newCents: 125_000_00 } }),
    ],
    WINDOW,
  );
  assert.ok(text);
  assert.match(text, /Resumen semanal de Nidokey/);
  assert.match(text, /Inmuebles: 1 bajada de precio, 1 subida de precio\./);
  assert.match(text, /\[\[property:p1\|Piso centro\]\]/);
  assert.match(text, /\[\[ir:\/events\|Novedades\]\]/);
});

test("plantilla: solo alertas genera linea de alertas", () => {
  const text = buildWeeklyDigestText(
    [event({ eventType: "alert_fired", payload: { recordTitle: "Bitcoin" }, recordType: "crypto", recordId: "c1" })],
    WINDOW,
  );
  assert.ok(text);
  assert.match(text, /Cripto: 1 alerta\./);
  assert.match(text, /\[\[crypto:c1\|Bitcoin\]\]/);
});

test("plantilla: mixto separa categorias", () => {
  const text = buildWeeklyDigestText(
    [
      event(),
      event({ eventType: "alert_fired", recordType: "market", recordId: "m1", payload: { recordTitle: "Apple" } }),
    ],
    WINDOW,
  );
  assert.ok(text);
  assert.match(text, /Inmuebles: 1 bajada de precio\./);
  assert.match(text, /Mercados: 1 alerta\./);
});

test("plantilla: vacio no genera texto", () => {
  assert.equal(buildWeeklyDigestText([], WINDOW), null);
});

test("ventana UTC usa la semana anterior completa desde lunes 00:00 UTC", () => {
  const window = previousCompletedUtcWeek(new Date("2026-08-10T15:45:00.000Z"));
  assert.equal(window.weekStart.toISOString(), "2026-08-03T00:00:00.000Z");
  assert.equal(window.weekEnd.toISOString(), "2026-08-10T00:00:00.000Z");
});

test("cap/overflow muestra novedades restantes y limita ejemplos por categoria", () => {
  const events = Array.from({ length: 500 }, (_, i) =>
    event({ recordId: `p${i}`, payload: { recordTitle: `Piso ${i}`, previousCents: 1000, newCents: 900 } }),
  );
  const text = buildWeeklyDigestText(events, WINDOW, 507);
  assert.ok(text);
  assert.match(text, /\+7 novedades más\./);
  assert.equal((text.match(/\[\[property:/g) ?? []).length, 3);
});

test("clientId es determinista por semana y usuario", () => {
  assert.equal(
    weeklyDigestClientId(WINDOW.weekStart, "u1"),
    "weekly-digest:2026-08-03T00:00:00.000Z:u1",
  );
});
