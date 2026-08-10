import { test } from "node:test";
import assert from "node:assert/strict";
import type { BaseRecord } from "@nidokey/shared";

import {
  availableVisitProperties,
  buildCounterpointMessage,
  buildVisitMessage,
  eligibleCounterpointTypes,
} from "./bot-record-actions";

function record(partial: Partial<BaseRecord> & { id: string; type: BaseRecord["type"]; title?: string }): BaseRecord {
  return {
    id: partial.id,
    type: partial.type,
    title: partial.title ?? partial.id,
    subtitle: null,
    status: partial.status ?? null,
    primaryValue: null,
    imageUrl: null,
    createdAt: null,
    updatedAt: null,
    meta: {},
  };
}

test("construye el mensaje de contrapunto con 2 registros", () => {
  assert.equal(
    buildCounterpointMessage([record({ id: "a", type: "property", title: "Piso centro" }), record({ id: "b", type: "property", title: "Atico norte" })]),
    "Compara estos 2 registros: Piso centro, Atico norte",
  );
});

test("construye el mensaje de preparar visita", () => {
  assert.equal(buildVisitMessage(record({ id: "a", type: "property", title: "Casa con jardin" })), "Prepara una visita para: Casa con jardin");
});

test("filtra tipos elegibles para contrapunto con minimo de dos registros", () => {
  assert.deepEqual(
    eligibleCounterpointTypes([
      record({ id: "p1", type: "property" }),
      record({ id: "p2", type: "property" }),
      record({ id: "b1", type: "book" }),
      record({ id: "j1", type: "job" }),
      record({ id: "j2", type: "job" }),
      record({ id: "j3", type: "job" }),
    ]),
    ["property", "job"],
  );
});

test("la visita solo admite inmuebles no vendidos ni retirados", () => {
  assert.deepEqual(
    availableVisitProperties([
      record({ id: "ok", type: "property", status: "FOR_SALE" }),
      record({ id: "sold", type: "property", status: "SOLD" }),
      record({ id: "retired", type: "property", status: "RETIRED" }),
      record({ id: "book", type: "book" }),
    ]).map((r) => r.id),
    ["ok"],
  );
});
