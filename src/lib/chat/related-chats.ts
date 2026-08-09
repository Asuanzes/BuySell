import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { avatarUrl, displayName, groupImageUrl } from "@/lib/chat/serialize";
import { RECORD_TYPES, type BotRecordType } from "@/lib/chat/tool-defs";
import { messagePreview } from "@/lib/chat/util";
import { ownsRecord, sharedAccess } from "@/lib/records/access";

type UserLite = { id: string; name: string | null; username: string | null; email: string; image: string | null };
type ParticipantLite = { userId: string; joinedAt: Date | null; user: UserLite };
type ConversationLite = {
  id: string;
  kind: string;
  title: string | null;
  imageUrl: string | null;
  lastMessageAt: Date | null;
  participants: ParticipantLite[];
};
type MessageLite = {
  id: string;
  conversationId: string;
  kind: string;
  body: string | null;
  createdAt: Date;
  sender: UserLite | null;
};

type RelatedChatsStore = {
  conversation: {
    findMany(args: Parameters<typeof prisma.conversation.findMany>[0]): Promise<unknown[]>;
  };
  chatMessage: {
    findMany(args: Parameters<typeof prisma.chatMessage.findMany>[0]): Promise<unknown[]>;
    findFirst(args: Parameters<typeof prisma.chatMessage.findFirst>[0]): Promise<unknown>;
  };
};

type RelatedChatsAuth = {
  ownsRecord(type: RecordType, id: string, ownerId: string): Promise<boolean>;
  sharedAccess(type: RecordType, id: string, userId: string): Promise<{ fromUserId: string } | null>;
};

export type RelatedChatDto = {
  conversationId: string;
  kind: string;
  title: string;
  imageUrl: string | null;
  lastMessage: {
    kind: string;
    body: string | null;
    senderName: string | null;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
};

export type RelatedChatsResult =
  | { ok: true; chats: RelatedChatDto[] }
  | { ok: false; status: 400; error: "Invalid type" }
  | { ok: false; status: 404; error: "Not found" };

export function isRecordType(value: string | null): value is BotRecordType {
  return !!value && (RECORD_TYPES as readonly string[]).includes(value);
}

function asRecordType(value: BotRecordType): RecordType {
  return value as RecordType;
}

function recordIdFrom(row: unknown): string | null {
  return typeof row === "object" && row !== null && "id" in row && typeof row.id === "string" ? row.id : null;
}

function conversationIdFrom(row: unknown): string | null {
  return typeof row === "object" && row !== null && "conversationId" in row && typeof row.conversationId === "string"
    ? row.conversationId
    : null;
}

export async function getRelatedChatsForRecord(
  viewerId: string,
  recordType: string | null,
  recordId: string,
  deps: {
    db?: RelatedChatsStore;
    auth?: RelatedChatsAuth;
  } = {},
): Promise<RelatedChatsResult> {
  if (!isRecordType(recordType)) return { ok: false, status: 400, error: "Invalid type" };

  const type = asRecordType(recordType);
  const auth = deps.auth ?? { ownsRecord, sharedAccess };
  const db = deps.db ?? (prisma as unknown as RelatedChatsStore);

  const [owned, shared] = await Promise.all([
    auth.ownsRecord(type, recordId, viewerId),
    auth.sharedAccess(type, recordId, viewerId),
  ]);
  if (!owned && !shared) return { ok: false, status: 404, error: "Not found" };

  const [linkedRows, sharedRows] = await Promise.all([
    db.conversation.findMany({
      where: { contextType: recordType, contextId: recordId },
      select: { id: true },
    }),
    db.chatMessage.findMany({
      where: { contextType: recordType, contextId: recordId, deletedAt: null },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
  ]);

  const convIds = [
    ...new Set([...linkedRows.map(recordIdFrom), ...sharedRows.map(conversationIdFrom)].filter((id): id is string => !!id)),
  ];
  if (convIds.length === 0) return { ok: true, chats: [] };

  const conversations = (await db.conversation.findMany({
    where: {
      id: { in: convIds },
      participants: { some: { userId: viewerId, leftAt: null } },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      imageUrl: true,
      lastMessageAt: true,
      participants: {
        where: { leftAt: null },
        select: {
          userId: true,
          joinedAt: true,
          user: { select: { id: true, name: true, username: true, email: true, image: true } },
        },
      },
    },
  })) as ConversationLite[];

  const msgs = await Promise.all(
    conversations.map((c) => {
      const me = c.participants.find((p) => p.userId === viewerId);
      return db.chatMessage.findFirst({
        where: {
          conversationId: c.id,
          deletedAt: null,
          ...(me?.joinedAt ? { createdAt: { gte: me.joinedAt } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          conversationId: true,
          kind: true,
          body: true,
          createdAt: true,
          sender: { select: { id: true, name: true, username: true, email: true, image: true } },
        },
      });
    }),
  );

  const lastByConv = new Map<string, MessageLite>();
  for (const m of msgs as Array<MessageLite | null>) if (m) lastByConv.set(m.conversationId, m);

  const chats = conversations
    .map((c) => {
      const other = c.participants.find((p) => p.userId !== viewerId)?.user ?? null;
      const last = lastByConv.get(c.id) ?? null;
      return {
        conversationId: c.id,
        kind: c.kind,
        title: c.title ?? (other ? displayName(other) : "-"),
        imageUrl: c.kind === "DIRECT" ? (other ? avatarUrl(other) : null) : groupImageUrl(c),
        lastMessage: last
          ? {
              kind: last.kind,
              body: messagePreview(last.kind, last.body),
              senderName: last.sender ? displayName(last.sender) : null,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return { ok: true, chats };
}
