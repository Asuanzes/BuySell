import { test } from "node:test";
import assert from "node:assert/strict";

import { compactRecordForComparison } from "./bot-tools";

test("compactRecordForComparison includes the latest user note truncated for comparison", () => {
  const record = {
    id: "p1",
    type: "property",
    title: "Piso Centro",
    primaryValue: 15000000,
    status: "FOR_SALE",
    meta: { builtArea: 75, city: "Oviedo" },
  };

  const compact = compactRecordForComparison("property", record, "  ".concat("nota ".repeat(100)));

  assert.equal(typeof compact.nota_reciente, "string");
  assert.equal(compact.nota_reciente.length, 303);
  assert.match(compact.nota_reciente, /^nota nota/);
});
