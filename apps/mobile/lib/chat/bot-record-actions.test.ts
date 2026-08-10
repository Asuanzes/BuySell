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
    "Compara estos 2 registros: [[property:a|Piso centro]], [[property:b|Atico norte]]",
  );
});

test("construye el mensaje de contrapunto con 3 registros mixtos enlazados", () => {
  assert.equal(
    buildCounterpointMessage([
      record({ id: "p1", type: "property", title: "Piso en Oviedo" }),
      record({ id: "p2", type: "property", title: "Atico en Gijon" }),
      record({ id: "p3", type: "property", title: "Casa en Aviles" }),
    ]),
    "Compara estos 3 registros: [[property:p1|Piso en Oviedo]], [[property:p2|Atico en Gijon]], [[property:p3|Casa en Aviles]]",
  );
});

test("construye el mensaje de preparar visita", () => {
  assert.equal(
    buildVisitMessage(record({ id: "a", type: "property", title: "Casa con jardin" })),
    "Prepara una visita para: [[property:a|Casa con jardin]]",
  );
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
