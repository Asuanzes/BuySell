import { test } from "node:test";
import assert from "node:assert/strict";
import type { RecordType } from "@nidokey/shared";

import { getRelatedChatsForRecord } from "./related-chats";

const user = (id: string, name = id) => ({ id, name, username: id, email: `${id}@test.local`, image: null });

function auth(opts: { owns?: boolean; shared?: boolean }) {
  return {
    ownsRecord: async (_type: RecordType, _id: string, _ownerId: string) => opts.owns ?? false,
    sharedAccess: async (_type: RecordType, _id: string, _userId: string) =>
      opts.shared ? { fromUserId: "owner-1" } : null,
  };
}

test("related chats: owner sees linked conversation with serialized preview", async () => {
  const now = new Date("2026-08-09T10:00:00.000Z");
  const store = {
    conversation: {
      findMany: async (args: { select?: object }) =>
        args.select && "participants" in args.select
          ? [
              {
                id: "c1",
                kind: "DIRECT",
                title: null,
                imageUrl: null,
                lastMessageAt: now,
                participants: [
                  { userId: "viewer", joinedAt: new Date("2026-08-09T09:00:00.000Z"), user: user("viewer") },
                  { userId: "other", joinedAt: now, user: user("other", "Ana") },
                ],
              },
            ]
          : [{ id: "c1" }],
    },
    chatMessage: {
      findMany: async () => [],
      findFirst: async () => ({
        id: "m1",
        conversationId: "c1",
        kind: "TEXT",
        body: "mensaje visible",
        createdAt: now,
        sender: user("other", "Ana"),
      }),
    },
  };

  const result = await getRelatedChatsForRecord("viewer", "property", "p1", {
    db: store as never,
    auth: auth({ owns: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.chats.length, 1);
  assert.equal(result.ok && result.chats[0].title, "Ana");
  assert.equal(result.ok && result.chats[0].lastMessage?.body, "mensaje visible");
});

test("related chats: shared record without active conversation membership exposes no preview", async () => {
  const store = {
    conversation: {
      findMany: async (args: { select?: object }) => (args.select && "participants" in args.select ? [] : [{ id: "c1" }]),
    },
    chatMessage: {
      findMany: async () => [{ conversationId: "c1" }],
      findFirst: async () => {
        throw new Error("should not read message previews without membership");
      },
    },
  };

  const result = await getRelatedChatsForRecord("viewer", "book", "b1", {
    db: store as never,
    auth: auth({ shared: true }),
  });

  assert.deepEqual(result, { ok: true, chats: [] });
});

test("related chats: preview query is scoped to viewer joinedAt and skips deleted messages", async () => {
  const joinedAt = new Date("2026-08-09T09:30:00.000Z");
  let previewWhere: unknown = null;
  const store = {
    conversation: {
      findMany: async (args: { select?: object }) =>
        args.select && "participants" in args.select
          ? [
              {
                id: "c1",
                kind: "GROUP",
                title: "Grupo",
                imageUrl: null,
                lastMessageAt: new Date("2026-08-09T10:00:00.000Z"),
                participants: [{ userId: "viewer", joinedAt, user: user("viewer") }],
              },
            ]
          : [],
    },
    chatMessage: {
      findMany: async () => [{ conversationId: "c1" }],
      findFirst: async (args: { where?: unknown }) => {
        previewWhere = args.where;
        return null;
      },
    },
  };

  const result = await getRelatedChatsForRecord("viewer", "market", "m1", {
    db: store as never,
    auth: auth({ owns: true }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(previewWhere, {
    conversationId: "c1",
    deletedAt: null,
    createdAt: { gte: joinedAt },
  });
  assert.equal(result.ok && result.chats[0].lastMessage, null);
});

test("related chats: invalid type is rejected before auth/database reads", async () => {
  const result = await getRelatedChatsForRecord("viewer", "food", "x", {
    db: {
      conversation: { findMany: async () => assert.fail("db should not be called") },
      chatMessage: {
        findMany: async () => assert.fail("db should not be called"),
        findFirst: async () => assert.fail("db should not be called"),
      },
    } as never,
    auth: auth({ owns: true }),
  });

  assert.deepEqual(result, { ok: false, status: 400, error: "Invalid type" });
});
