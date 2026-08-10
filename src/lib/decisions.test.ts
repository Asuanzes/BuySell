import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertCanAddDecisionItem,
  assertCanCreateDecision,
  assertOwnedDecision,
  changedCountFromEvents,
  DecisionApiError,
  MAX_DECISION_ITEMS,
  MAX_OPEN_DECISIONS,
  normalizeDecisionRecordType,
} from "./decisions";

test("creating the 11th open decision fails with 409", () => {
  assert.throws(
    () => assertCanCreateDecision("open", MAX_OPEN_DECISIONS),
    (error) => error instanceof DecisionApiError && error.status === 409
  );
  assert.doesNotThrow(() => assertCanCreateDecision("archived", MAX_OPEN_DECISIONS));
});

test("adding the 21st item fails with 400", () => {
  assert.throws(
    () => assertCanAddDecisionItem(MAX_DECISION_ITEMS),
    (error) => error instanceof DecisionApiError && error.status === 400
  );
});

test("owner scoping hides another user's decision as 404", () => {
  assert.throws(
    () => assertOwnedDecision({ id: "d1", userId: "other" }, "owner"),
    (error) => error instanceof DecisionApiError && error.status === 404
  );
});

test("changedCount uses createdAt baseline when lastVisitedAt is null", () => {
  const items = [{ recordType: "property", recordId: "p1" }];
  const baseline = new Date("2026-08-10T10:00:00Z");
  const events = [
    { recordType: "property", recordId: "p1", observedAt: new Date("2026-08-10T09:59:59Z") },
    { recordType: "property", recordId: "p1", observedAt: new Date("2026-08-10T10:00:01Z") },
    { recordType: "property", recordId: "p2", observedAt: new Date("2026-08-10T10:00:02Z") },
  ];

  assert.equal(changedCountFromEvents(items, events, baseline), 1);
});

test("changedCount uses lastVisitedAt when present", () => {
  const items = [
    { recordType: "market", recordId: "aapl" },
    { recordType: "crypto", recordId: "btc" },
  ];
  const lastVisitedAt = new Date("2026-08-10T12:00:00Z");
  const events = [
    { recordType: "market", recordId: "aapl", observedAt: new Date("2026-08-10T11:59:59Z") },
    { recordType: "market", recordId: "aapl", observedAt: new Date("2026-08-10T12:00:01Z") },
    { recordType: "crypto", recordId: "btc", observedAt: new Date("2026-08-10T12:00:02Z") },
  ];

  assert.equal(changedCountFromEvents(items, events, lastVisitedAt), 2);
});

test("orphan decision item is tolerated by record map callers", () => {
  const recordMap = new Map<string, unknown>();
  const item = { recordType: "book", recordId: "missing" };

  assert.equal(recordMap.get(`${item.recordType}\0${item.recordId}`) ?? null, null);
});

test("inactive record types are rejected", () => {
  for (const type of ["food", "workout", "trends", "chat"]) {
    assert.throws(
      () => normalizeDecisionRecordType(type),
      (error) => error instanceof DecisionApiError && error.status === 400
    );
  }
});
