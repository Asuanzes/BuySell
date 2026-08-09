export type RelatedRecordType = string;

export function relatedChatsPath(recordType: RelatedRecordType, recordId: string): string {
  return `/api/records/${encodeURIComponent(recordId)}/related-chats?type=${encodeURIComponent(recordType)}`;
}

