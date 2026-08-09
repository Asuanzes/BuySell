import { test } from "node:test";
import assert from "node:assert/strict";

import { withBotWriteToolAudit } from "./bot-audit";

test("bot write audit records successful write tools without free-text args", async () => {
  const events: unknown[] = [];
  const runner = withBotWriteToolAudit(
    async () => JSON.stringify({ ok: true }),
    { userId: "u1", conversationId: "c1" },
    async (_name, opts) => {
      events.push(opts);
    },
  );

  const result = await runner(
    "editar_registro",
    JSON.stringify({ type: "property", id: "p1", campos: { descripcion: "texto libre sensible" } }),
  );

  assert.equal(result, JSON.stringify({ ok: true }));
  assert.deepEqual(events, [
    {
      userId: "u1",
      props: {
        conversationId: "c1",
        tool: "editar_registro",
        type: "property",
        id: "p1",
        resultOk: true,
      },
    },
  ]);
});

test("bot write audit records write tool errors", async () => {
  const events: unknown[] = [];
  const runner = withBotWriteToolAudit(
    async () => JSON.stringify({ error: "fallo" }),
    { userId: "u1", conversationId: "c1" },
    async (_name, opts) => {
      events.push(opts);
    },
  );

  await runner("borrar_registro", JSON.stringify({ type: "book", id: "b1" }));

  assert.deepEqual(events, [
    {
      userId: "u1",
      props: {
        conversationId: "c1",
        tool: "borrar_registro",
        type: "book",
        id: "b1",
        resultOk: false,
      },
    },
  ]);
});

test("bot write audit ignores read tools", async () => {
  const runner = withBotWriteToolAudit(
    async () => JSON.stringify([{ id: "p1" }]),
    { userId: "u1", conversationId: "c1" },
    async () => assert.fail("read tools should not be audited"),
  );

  await runner("listar_registros", JSON.stringify({ type: "property" }));
});
