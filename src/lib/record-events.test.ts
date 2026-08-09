import { test } from "node:test";
import assert from "node:assert/strict";

import {
  denormalizeRecordEventPayload,
  manualImportEventKey,
  utcDay,
  valueTransitionKey,
} from "./record-events";

test("value transition keys dedupe the same transition within the UTC day", () => {
  const morning = new Date("2026-08-09T08:00:00Z");
  const evening = new Date("2026-08-09T21:30:00Z");

  assert.equal(utcDay(morning), "2026-08-09");
  assert.equal(
    valueTransitionKey("sources.crypto", "btc", morning, 10_000, 11_000),
    valueTransitionKey("sources.crypto", "btc", evening, 10_000, 11_000)
  );
});

test("value transition keys change when the transition changes", () => {
  const observedAt = new Date("2026-08-09T08:00:00Z");

  assert.notEqual(
    valueTransitionKey("sources.market", "aapl", observedAt, 10_000, 11_000),
    valueTransitionKey("sources.market", "aapl", observedAt, 11_000, 10_000)
  );
  assert.notEqual(
    manualImportEventKey("property", "p1", 10_000, 11_000),
    manualImportEventKey("property", "p1", 10_000, 12_000)
  );
});

test("denormalized payload serializes title, status and href at write time", () => {
  assert.deepEqual(
    denormalizeRecordEventPayload(
      "property",
      "p 1",
      { title: "Piso centro", status: "FOR_SALE" },
      { previousCents: 220_000_00, newCents: 210_000_00 }
    ),
    {
      previousCents: 220_000_00,
      newCents: 210_000_00,
      recordTitle: "Piso centro",
      recordStatus: "FOR_SALE",
      href: "/records/p%201?type=property",
    }
  );
});
