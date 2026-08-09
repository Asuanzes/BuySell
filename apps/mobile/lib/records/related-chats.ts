import { api } from "../api";
import { relatedChatsPath, type RelatedRecordType } from "./related-chats-path";

export { relatedChatsPath, type RelatedRecordType };

export type RelatedChatMessage = {
  kind: string;
  body: string | null;
  senderName: string | null;
  createdAt: string;
};

export type RelatedChat = {
  conversationId: string;
  kind: string;
  title: string;
  imageUrl: string | null;
  lastMessage: RelatedChatMessage | null;
  lastMessageAt: string | null;
};

export type RelatedChatsResponse = { chats: RelatedChat[] };

export function fetchRelatedChats(recordType: RelatedRecordType, recordId: string): Promise<RelatedChatsResponse> {
  return api<RelatedChatsResponse>(relatedChatsPath(recordType, recordId));
}
