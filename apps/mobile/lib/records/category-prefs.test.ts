import { test } from "node:test";
import assert from "node:assert/strict";
import type { RecordType } from "@nidokey/shared";
import { applyCategoryOrder, isRecordType, MANAGED_RECORD_TYPES } from "./category-prefs";

const unmanagedTypes = ["food", "workout", "trends"] as const;

test("managed categories exclude non-selectable record types", () => {
  for (const type of unmanagedTypes) {
    assert.equal(MANAGED_RECORD_TYPES.includes(type), false);
  }
});

test("saved category order migration discards unmanaged record types", () => {
  const savedOrder = [
    "workout",
    "property",
    "food",
    "crypto",
    "trends",
    "property",
  ] satisfies RecordType[];

  const migrated = applyCategoryOrder(savedOrder);

  assert.deepEqual(migrated.slice(0, 2), ["property", "crypto"]);
  for (const type of unmanagedTypes) {
    assert.equal(migrated.includes(type), false);
  }
  assert.deepEqual([...new Set(migrated)], migrated);
  assert.deepEqual(migrated.sort(), [...MANAGED_RECORD_TYPES].sort());
});

test("start category validation rejects previously saved workout", () => {
  assert.equal(isRecordType("workout"), false);
  assert.equal(isRecordType("property"), true);
});

test("order fallback remains non-empty when saved order only has unmanaged types", () => {
  const migrated = applyCategoryOrder(["food", "workout", "trends"] satisfies RecordType[]);

  assert.ok(migrated.length > 0);
  assert.deepEqual(migrated, MANAGED_RECORD_TYPES);
});
