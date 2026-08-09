import { test } from "node:test";
import assert from "node:assert/strict";

import { relatedChatsCopyKey } from "./related-chats-ui";

test("usa claves i18n específicas para property con fallback genérico", () => {
  assert.deepEqual(relatedChatsCopyKey("property", "share_cta"), {
    key: "detail.property.chat_share_cta",
    fallbackKey: "detail.related_chats.share_cta",
  });
});

test("resuelve claves i18n por vertical nueva sin duplicar el componente", () => {
  assert.deepEqual(relatedChatsCopyKey("holiday", "title"), {
    key: "detail.holiday.chat_title",
    fallbackKey: "detail.related_chats.title",
  });
});

