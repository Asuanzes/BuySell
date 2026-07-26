/**
 * Tests de la serialización pura del chat (DTOs): agregado de reacciones,
 * snippet de responder-cita y comportamiento del borrado suave.
 * Ejecutar:  node --import tsx --test src/lib/chat/serialize.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregateReactions, messageDto, replySnippet } from "./serialize";

test("aggregateReactions: agrupa, cuenta, marca 'mine' y ordena por count", () => {
  const rows = [
    { emoji: "👍", userId: "u1" },
    { emoji: "👍", userId: "u2" },
    { emoji: "❤️", userId: "u3" },
    { emoji: "👍", userId: "u3" },
  ];
  const chips = aggregateReactions(rows, "u3");
  assert.equal(chips.length, 2);
  assert.deepEqual(chips[0], { emoji: "👍", count: 3, mine: true });
  assert.deepEqual(chips[1], { emoji: "❤️", count: 1, mine: true });
  // Sin meId, nada es "mine".
  assert.ok(aggregateReactions(rows).every((c) => !c.mine));
  // Empate de count → orden estable por emoji (determinista entre renders).
  const tie = aggregateReactions([
    { emoji: "b", userId: "u1" },
    { emoji: "a", userId: "u2" },
  ]);
  assert.deepEqual(
    tie.map((c) => c.emoji),
    ["a", "b"]
  );
});

test("replySnippet: trunca a 140 y vacía el cuerpo si el citado está borrado", () => {
  const base = { id: "m1", senderId: "u1", kind: "TEXT" as const, body: "hola", deletedAt: null };
  assert.deepEqual(replySnippet(base), { id: "m1", senderId: "u1", kind: "TEXT", body: "hola", deleted: false });

  const long = replySnippet({ ...base, body: "x".repeat(300) });
  assert.equal(long.body!.length, 140);
  assert.ok(long.body!.endsWith("…"));

  const deleted = replySnippet({ ...base, deletedAt: new Date() });
  assert.equal(deleted.body, null);
  assert.equal(deleted.deleted, true);
});

test("messageDto: el borrado suave vacía cuerpo, reacciones y adjuntos", () => {
  const now = new Date();
  const m = {
    id: "m1",
    conversationId: "c1",
    senderId: "u1",
    kind: "TEXT",
    body: "secreto",
    replyToId: null,
    clientId: "cl1",
    editedAt: null,
    deletedAt: now,
    createdAt: now,
    attachments: [
      {
        id: "a1",
        messageId: "m1",
        kind: "IMAGE",
        url: "chat/u/u1/x.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        fileName: null,
        width: null,
        height: null,
        durationMs: null,
        blurhash: null,
        createdAt: now,
      },
    ],
    reactions: [{ emoji: "👍", userId: "u2" }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dto = messageDto(m as any, "u2");
  assert.equal(dto.deleted, true);
  assert.equal(dto.body, null);
  assert.deepEqual(dto.reactions, []);
  assert.deepEqual(dto.attachments, []);
});

test("messageDto: replyTo se adjunta cuando se pasa y es null por defecto", () => {
  const now = new Date();
  const m = {
    id: "m2",
    conversationId: "c1",
    senderId: "u1",
    kind: "TEXT",
    body: "respuesta",
    replyToId: "m1",
    clientId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(messageDto(m as any).replyTo, null);
  const withQuote = messageDto(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    m as any,
    "u1",
    { id: "m1", senderId: "u2", kind: "TEXT", body: "original", deleted: false }
  );
  assert.equal(withQuote.replyTo?.body, "original");
  assert.equal(withQuote.replyToId, "m1");
});
