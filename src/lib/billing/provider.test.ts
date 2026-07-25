// Ejecutar: node --import tsx --test src/lib/billing/provider.test.ts
// Round-trip del proveedor FAKE de suscripción: firma del token del checkout y
// verificación del webhook (el mismo camino que recorre el pago de prueba).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
// Los módulos leen el secreto en cada llamada (lazy), no al importar: basta
// con fijar la env en beforeEach.
import {
  signFakeSubToken,
  verifyFakeSubToken,
  subscriptionProvider,
  activeSubscriptionProviderName,
} from "./provider";
import { signPaymentWebhook } from "@/lib/payments/provider";

beforeEach(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
  delete process.env.BILLING_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
});

test("token fake: firma y verificación round-trip", () => {
  const t = signFakeSubToken("sub_123");
  assert.equal(verifyFakeSubToken("sub_123", t), true);
  assert.equal(verifyFakeSubToken("sub_OTRA", t), false);
  assert.equal(verifyFakeSubToken("sub_123", t + "x"), false);
});

test("webhook fake: acepta payload firmado y devuelve el evento normalizado", async () => {
  const provider = subscriptionProvider("fake")!;
  const payload = JSON.stringify({
    eventId: "evt_1",
    type: "activated",
    subscriptionRef: "sub_123",
    amountCents: 499,
    periodEndISO: "2026-08-24T00:00:00.000Z",
  });
  const req = new Request("http://test/webhook", {
    method: "POST",
    headers: { "x-nidokey-payment-signature": signPaymentWebhook(payload) },
    body: payload,
  });
  const event = await provider.verifyWebhook(req);
  assert.notEqual(event, null);
  assert.notEqual(event, "ignored");
  if (event && event !== "ignored") {
    assert.equal(event.type, "activated");
    assert.equal(event.subscriptionRef, "sub_123");
    assert.equal(event.amountCents, 499);
  }
});

test("webhook fake: rechaza firma inválida", async () => {
  const provider = subscriptionProvider("fake")!;
  const payload = JSON.stringify({ eventId: "evt_2", type: "activated", subscriptionRef: "sub_123" });
  const req = new Request("http://test/webhook", {
    method: "POST",
    headers: { "x-nidokey-payment-signature": "sha256=deadbeef" },
    body: payload,
  });
  assert.equal(await provider.verifyWebhook(req), null);
});

test("webhook fake: rechaza tipos de evento desconocidos", async () => {
  const provider = subscriptionProvider("fake")!;
  const payload = JSON.stringify({ eventId: "evt_3", type: "hackeado", subscriptionRef: "sub_123" });
  const req = new Request("http://test/webhook", {
    method: "POST",
    headers: { "x-nidokey-payment-signature": signPaymentWebhook(payload) },
    body: payload,
  });
  assert.equal(await provider.verifyWebhook(req), null);
});

test("selección de proveedor: BILLING_PROVIDER manda; sin env, stripe solo con clave", () => {
  assert.equal(activeSubscriptionProviderName(), "fake");
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  assert.equal(activeSubscriptionProviderName(), "stripe");
  process.env.BILLING_PROVIDER = "fake";
  assert.equal(activeSubscriptionProviderName(), "fake");
});
