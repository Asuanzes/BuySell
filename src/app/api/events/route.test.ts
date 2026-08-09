import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clampEventsLimit,
  encodeEventsCursor,
  parseEventsCursor,
  serializeRecordEvent,
} from "./route";

test("events limit clamps to 1..100 and defaults to 30", () => {
  assert.equal(clampEventsLimit(null), 30);
  assert.equal(clampEventsLimit("0"), 1);
  assert.equal(clampEventsLimit("-10"), 1);
  assert.equal(clampEventsLimit("101"), 100);
  assert.equal(clampEventsLimit("abc"), 30);
});

test("events cursor shape is observedAt_id", () => {
  const observedAt = new Date("2026-08-09T10:11:12.000Z");
  const cursor = encodeEventsCursor({ observedAt, id: "cm123" });

  assert.equal(cursor, "2026-08-09T10:11:12.000Z_cm123");
  assert.deepEqual(parseEventsCursor(cursor), { observedAt, id: "cm123" });
  assert.equal(parseEventsCursor("bad"), null);
  assert.equal(parseEventsCursor("not-a-date_id"), null);
});

test("event serialization keeps public fields and ISO observedAt", () => {
  assert.deepEqual(
    serializeRecordEvent({
      id: "evt1",
      recordType: "crypto",
      recordId: "btc",
      eventType: "value_changed",
      source: "sources.crypto",
      payload: { recordTitle: "Bitcoin" },
      observedAt: new Date("2026-08-09T10:11:12.000Z"),
    }),
    {
      id: "evt1",
      recordType: "crypto",
      recordId: "btc",
      eventType: "value_changed",
      source: "sources.crypto",
      payload: { recordTitle: "Bitcoin" },
      observedAt: "2026-08-09T10:11:12.000Z",
    }
  );
});
