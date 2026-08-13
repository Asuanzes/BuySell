/**
 * Tests de helpers puros de tarjetas de contexto.
 * Ejecutar:  node --import tsx --test src/lib/chat/context.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildConversationContextHeader, propertyStatusLabel, type ContextCard } from "./context";

const at = (iso: string) => new Date(iso);
const card = (ownerId: string | null, title = "Piso Centro") => ({
  ownerId,
  title,
  imageUrl: null,
  subtitle: "Oviedo",
  meta: "200.000 €",
});

test("propertyStatusLabel: solo muestra estados de inmueble no activos", () => {
  const cases: Array<[string | null, string | null, boolean | undefined]> = [
    ["FOR_SALE", null, undefined],
    ["FOR_RENT", null, undefined],
    ["RESERVED", "Reservado", true],
    ["SOLD", "Vendido", true],
    ["WITHDRAWN", "Retirado", true],
    ["RENTED", "Alquilado", true],
    [null, null, undefined],
  ];

  for (const [status, expectedLabel, expectedShown] of cases) {
    const label = propertyStatusLabel(status);
    assert.equal(label, expectedLabel);
    assert.equal(label ? true : undefined, expectedShown);
  }

  assert.equal(propertyStatusLabel("ACTIVE"), null);
});

test("ContextCard: statusShown es opcional y true solo cuando se muestra estado", () => {
  const sold: ContextCard = {
    title: "Piso Centro",
    imageUrl: null,
    subtitle: "Oviedo",
    meta: [propertyStatusLabel("SOLD"), "3 hab", "2 baños"].filter(Boolean).join(" · "),
    statusShown: propertyStatusLabel("SOLD") ? true : undefined,
  };
  assert.equal(sold.meta, "Vendido · 3 hab · 2 baños");
  assert.equal(sold.statusShown, true);

  const active: ContextCard = {
    title: "Piso Centro",
    imageUrl: null,
    subtitle: "Oviedo",
    meta: ["3 hab", "2 baños", propertyStatusLabel("FOR_RENT")].filter(Boolean).join(" · "),
    ...(propertyStatusLabel("FOR_RENT") ? { statusShown: true } : {}),
  };
  assert.equal(active.meta, "3 hab · 2 baños");
  assert.equal(active.statusShown, undefined);
  assert.equal("statusShown" in active, false);
});

test("buildConversationContextHeader: owner receives total changes and at most 3 events", async () => {
  const header = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: "property",
      contextId: "p1",
      participants: [
        { userId: "owner", joinedAt: at("2026-08-10T09:00:00.000Z") },
        { userId: "other", joinedAt: at("2026-08-10T09:00:00.000Z") },
      ],
      messages: [{ senderId: "owner", contextType: null, contextId: null, deletedAt: null, createdAt: at("2026-08-10T10:00:00.000Z") }],
    },
    "owner",
    {
      fetchCard: async () => card("owner"),
      countRecordEvents: async () => 5,
      findRecordEvents: async () => [
        { recordType: "property", recordId: "p1", eventType: "price_changed", payload: {}, observedAt: at("2026-08-10T12:00:00.000Z") },
        { recordType: "property", recordId: "p1", eventType: "status_changed", payload: {}, observedAt: at("2026-08-10T11:00:00.000Z") },
        { recordType: "property", recordId: "p1", eventType: "alert_fired", payload: {}, observedAt: at("2026-08-10T10:30:00.000Z") },
        { recordType: "property", recordId: "p1", eventType: "ignored", payload: {}, observedAt: at("2026-08-10T10:15:00.000Z") },
      ],
    }
  );

  assert.equal(header?.viewerOwnsRecord, true);
  assert.equal(header?.changedSinceMyLastMessage?.total, 5);
  assert.equal(header?.changedSinceMyLastMessage?.since, "2026-08-10T10:00:00.000Z");
  assert.equal(header?.changedSinceMyLastMessage?.events.length, 3);
});

test("el header lleva SIEMPRE el registro elegido (recordType/recordId), también cuando se deriva del último mensaje compartido", async () => {
  // Conversación SIN contexto propio (el caso del DM del bot): la tarjeta sale
  // del último mensaje con contexto. Sin recordType/recordId el cliente no
  // sabía a qué ficha navegar y el toque era un no-op (fallo 2026-08-13).
  const fromMessage = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: null,
      contextId: null,
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T09:00:00.000Z") }],
      messages: [
        { senderId: "owner", contextType: "holiday", contextId: "h1", deletedAt: null, createdAt: at("2026-08-12T22:37:00.000Z") },
      ],
    },
    "owner",
    { fetchCard: async () => card("owner", "Viaje a Roma"), countRecordEvents: async () => 0, findRecordEvents: async () => [] }
  );
  assert.equal(fromMessage?.recordType, "holiday");
  assert.equal(fromMessage?.recordId, "h1");

  const fromConversation = await buildConversationContextHeader(
    {
      id: "c2",
      kind: "DIRECT",
      contextType: "property",
      contextId: "p1",
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T09:00:00.000Z") }],
      messages: [],
    },
    "owner",
    { fetchCard: async () => card("owner"), countRecordEvents: async () => 0, findRecordEvents: async () => [] }
  );
  assert.equal(fromConversation?.recordType, "property");
  assert.equal(fromConversation?.recordId, "p1");

  // Tarjeta degradada (registro borrado): sin destino — navegar sería un 404.
  const degraded = await buildConversationContextHeader(
    {
      id: "c3",
      kind: "DIRECT",
      contextType: "property",
      contextId: "gone",
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T09:00:00.000Z") }],
      messages: [],
    },
    "owner",
    { fetchCard: async () => null, countRecordEvents: async () => 0, findRecordEvents: async () => [] }
  );
  assert.equal(degraded?.recordType, undefined);
  assert.equal(degraded?.recordId, undefined);
});

test("buildConversationContextHeader: non-owner receives only the public card fields", async () => {
  const header = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: "property",
      contextId: "p1",
      participants: [{ userId: "owner" }, { userId: "other" }],
      messages: [],
    },
    "other",
    { fetchCard: async () => card("owner") }
  );

  // recordType/recordId SÍ son públicos: son el destino del toque (la ficha
  // sigue protegida por sus propias APIs); la actividad del dueño no viaja.
  assert.deepEqual(header, {
    title: "Piso Centro",
    imageUrl: null,
    subtitle: "Oviedo",
    meta: "200.000 €",
    recordType: "property",
    recordId: "p1",
  });
  assert.equal(Object.hasOwn(header!, "changedSinceMyLastMessage"), false);
  assert.equal(Object.hasOwn(header!, "viewerOwnsRecord"), false);
  assert.equal(Object.hasOwn(header!, "relatedRecordCount"), false);
});

test("buildConversationContextHeader: owner baseline falls back to joinedAt when they never wrote", async () => {
  let baselineIso: string | null = null;
  const header = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: "property",
      contextId: "p1",
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T08:30:00.000Z") }],
      messages: [{ senderId: "other", contextType: null, contextId: null, deletedAt: null, createdAt: at("2026-08-10T10:00:00.000Z") }],
    },
    "owner",
    {
      fetchCard: async () => card("owner"),
      countRecordEvents: async (_viewerId, _pairs, since) => {
        baselineIso = since.toISOString();
        return 1;
      },
      findRecordEvents: async () => [
        { recordType: "property", recordId: "p1", eventType: "price_changed", payload: {}, observedAt: at("2026-08-10T11:00:00.000Z") },
      ],
    }
  );

  assert.equal(baselineIso, "2026-08-10T08:30:00.000Z");
  assert.equal(header?.changedSinceMyLastMessage?.since, "2026-08-10T08:30:00.000Z");
});

test("buildConversationContextHeader: zero owner events serializes as null", async () => {
  const header = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: "property",
      contextId: "p1",
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T08:30:00.000Z") }],
      messages: [],
    },
    "owner",
    { fetchCard: async () => card("owner"), countRecordEvents: async () => 0, findRecordEvents: async () => [] }
  );

  assert.equal(header?.changedSinceMyLastMessage, null);
});

test("buildConversationContextHeader: deleted record degrades the card without throwing", async () => {
  const header = await buildConversationContextHeader(
    {
      id: "c1",
      kind: "DIRECT",
      contextType: "book",
      contextId: "missing",
      participants: [{ userId: "owner", joinedAt: at("2026-08-10T08:30:00.000Z") }],
      messages: [],
    },
    "owner",
    { fetchCard: async () => null }
  );

  assert.deepEqual(header, { title: "Registro eliminado", imageUrl: null, subtitle: null, meta: null });
});
