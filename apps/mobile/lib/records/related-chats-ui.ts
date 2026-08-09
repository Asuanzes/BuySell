import type { TFunction } from "i18next";

import type { RelatedRecordType } from "./related-chats-path";

export type RelatedChatsCopySlot = "title" | "empty_title" | "empty_body" | "share_cta" | "no_messages";

export function relatedChatsCopyKey(
  recordType: RelatedRecordType,
  slot: RelatedChatsCopySlot
): { key: string; fallbackKey: string } {
  const suffix = slot === "share_cta" ? "chat_share_cta" : `chat_${slot}`;
  return {
    key: `detail.${recordType}.${suffix}`,
    fallbackKey: `detail.related_chats.${slot}`,
  };
}

export function relatedChatsText(t: TFunction, recordType: RelatedRecordType, slot: RelatedChatsCopySlot): string {
  const keys = relatedChatsCopyKey(recordType, slot);
  const translate = t as unknown as (key: string, options?: { defaultValue?: string }) => string;
  return translate(keys.key, { defaultValue: translate(keys.fallbackKey) });
}
