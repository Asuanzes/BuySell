import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRecordCreationDate, hasRecordCreationDate } from "./creation-date";

test("formatRecordCreationDate formats ISO timestamps", () => {
  assert.match(formatRecordCreationDate("2026-08-10T12:34:56.000Z", "es") ?? "", /2026/);
});

test("formatRecordCreationDate hides missing and invalid placeholders", () => {
  assert.equal(formatRecordCreationDate(null, "es"), null);
  assert.equal(formatRecordCreationDate("", "es"), null);
  assert.equal(formatRecordCreationDate("--/--/----", "es"), null);
  assert.equal(formatRecordCreationDate("not-a-date", "es"), null);
  assert.equal(hasRecordCreationDate("--/--/----"), false);
});
