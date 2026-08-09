import { test } from "node:test";
import assert from "node:assert/strict";

import { relatedChatsPath } from "./related-chats-path";

test("construye la URL genérica de related chats para property", () => {
  assert.equal(relatedChatsPath("property", "prop_123"), "/api/records/prop_123/related-chats?type=property");
});

test("codifica recordId y recordType al construir la URL de related chats", () => {
  assert.equal(
    relatedChatsPath("holiday", "holiday:with/slash"),
    "/api/records/holiday%3Awith%2Fslash/related-chats?type=holiday"
  );
});
