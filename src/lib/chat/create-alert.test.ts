import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCreateAlertBody, type CreateAlertBody } from "./bot-tools";
import { WRITE_TOOLS, BOT_TOOLS } from "./tool-defs";
import { BOT_SYSTEM_PROMPT } from "./agent";

/*
 * C6i3 alerta-desde-chat. La parte peligrosa es el mapeo LLM→API: unidades
 * (euros vs céntimos vs porcentaje), verticales sin precio y el gate de
 * confirmación. La API re-valida ownership/cuota/condición; aquí se fija el
 * contrato del ejecutor puro (revisión Codex c33bcb0e).
 */

function bodyOf(res: ReturnType<typeof buildCreateAlertBody>): CreateAlertBody {
  if ("error" in res) throw new assert.AssertionError({ message: `se esperaba body y llegó error: ${res.error}` });
  return res.body;
}

function errorOf(res: ReturnType<typeof buildCreateAlertBody>): string {
  if (!("error" in res)) throw new assert.AssertionError({ message: "se esperaba error y llegó body" });
  return res.error;
}

test("crear_alerta está en WRITE_TOOLS: el gate de confirmación la bloquea sin un sí posterior", () => {
  assert.ok((WRITE_TOOLS as readonly string[]).includes("crear_alerta"));
  const def = BOT_TOOLS.find((t) => t.function.name === "crear_alerta");
  assert.ok(def, "la tool debe estar declarada en BOT_TOOLS");
  assert.match(def!.function.description, /REQUIERE confirmación/);
});

test("prompt: regla de confirmación ampliada y guía de alertas presentes", () => {
  assert.ok(BOT_SYSTEM_PROMPT.includes("editar o crear una alerta"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("avísame si baja"));
  assert.ok(BOT_SYSTEM_PROMPT.includes("3 gratis, 25 con Premium"));
});

test("umbrales absolutos convierten euros a céntimos (PRICE_BELOW/PRICE_ABOVE)", () => {
  const below = bodyOf(buildCreateAlertBody({ type: "property", id: "p1", kind: "PRICE_BELOW", umbral_eur: 150000 }));
  assert.equal(below.threshold, 15000000);
  assert.equal(below.field, "price");

  const above = bodyOf(buildCreateAlertBody({ type: "crypto", id: "c1", kind: "PRICE_ABOVE", umbral_eur: 0.5 }));
  assert.equal(above.threshold, 50);
});

test("PRICE_DROP_PCT viaja como entero 1-99 SIN multiplicar por 100", () => {
  const ok = bodyOf(buildCreateAlertBody({ type: "market", id: "m1", kind: "PRICE_DROP_PCT", porcentaje: 10 }));
  assert.equal(ok.threshold, 10);

  for (const bad of [0, 100, 10.5, -3, NaN]) {
    errorOf(buildCreateAlertBody({ type: "market", id: "m1", kind: "PRICE_DROP_PCT", porcentaje: bad }));
  }
});

test("renta solo en inmuebles; STATUS_CHANGE solo en inmuebles y sin umbral", () => {
  errorOf(buildCreateAlertBody({ type: "crypto", id: "c1", kind: "PRICE_BELOW", umbral_eur: 100, campo: "renta" }));

  const rentProp = bodyOf(buildCreateAlertBody({ type: "property", id: "p1", kind: "PRICE_BELOW", umbral_eur: 600, campo: "renta" }));
  assert.equal(rentProp.field, "rent");

  errorOf(buildCreateAlertBody({ type: "crypto", id: "c1", kind: "STATUS_CHANGE" }));

  const statusProp = bodyOf(buildCreateAlertBody({ type: "property", id: "p1", kind: "STATUS_CHANGE" }));
  assert.equal(statusProp.threshold, undefined);
});

test("verticales sin precio vigilable y umbrales inválidos se rechazan con mensaje claro", () => {
  assert.match(errorOf(buildCreateAlertBody({ type: "book", id: "b1", kind: "PRICE_BELOW", umbral_eur: 10 })), /precio vigilable/);

  for (const bad of [0, -5, NaN, 0.001]) {
    errorOf(buildCreateAlertBody({ type: "property", id: "p1", kind: "PRICE_BELOW", umbral_eur: bad }));
  }
});
