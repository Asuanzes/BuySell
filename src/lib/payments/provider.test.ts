// Ejecutar: node --import tsx --test src/lib/payments/provider.test.ts
//
// Blinda el escenario "desplegar SIN PAYMENT_WEBHOOK_SECRET": la app debe
// funcionar con los pagos apagados, sin que nada lance por sorpresa. Verificar
// debe FALLAR CERRADO (false), y firmar solo lanza si alguien se salta el guard.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentSecret,
  paymentsConfigured,
  requirePaymentSecret,
  signPaymentWebhook,
  signFakePaymentToken,
  verifyFakePaymentToken,
  fakePaymentProvider,
} from "./provider";

const ORIGINAL = {
  secret: process.env.PAYMENT_WEBHOOK_SECRET,
  auth: process.env.AUTH_SECRET,
  env: process.env.NODE_ENV,
};

function setEnv(k: "PAYMENT_WEBHOOK_SECRET" | "AUTH_SECRET" | "NODE_ENV", v: string | undefined) {
  if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
  else (process.env as Record<string, string | undefined>)[k] = v;
}

afterEach(() => {
  setEnv("PAYMENT_WEBHOOK_SECRET", ORIGINAL.secret);
  setEnv("AUTH_SECRET", ORIGINAL.auth);
  setEnv("NODE_ENV", ORIGINAL.env);
});

// ── Producción SIN secreto: pagos apagados, nada revienta ─────────────────
test("en producción sin secreto: paymentsConfigured es false y NO hay fallback a AUTH_SECRET", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", undefined);
  setEnv("AUTH_SECRET", "secreto-de-auth-que-NO-debe-usarse");

  assert.equal(paymentsConfigured(), false);
  assert.equal(paymentSecret(), "");
});

test("en producción sin secreto: verificar falla CERRADO sin lanzar", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", undefined);
  setEnv("AUTH_SECRET", "x");

  // Nada de excepciones: simplemente no valida.
  assert.equal(verifyFakePaymentToken("intent_1", "token-cualquiera"), false);
});

test("en producción sin secreto: el webhook de pago rechaza en vez de crashear", async () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", undefined);
  setEnv("AUTH_SECRET", "x");

  const req = new Request("http://test/webhook", {
    method: "POST",
    headers: { "x-nidokey-payment-signature": "sha256=lo-que-sea" },
    body: JSON.stringify({ eventId: "e1", type: "succeeded", intentId: "i1", amountCents: 100 }),
  });
  assert.equal(await fakePaymentProvider.verifyWebhook(req), null);
});

test("firmar sin secreto lanza (fail-fast): por eso las rutas comprueban paymentsConfigured antes", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", undefined);
  setEnv("AUTH_SECRET", "x");

  assert.throws(() => requirePaymentSecret(), /PAYMENT_WEBHOOK_SECRET/);
  assert.throws(() => signPaymentWebhook("{}"), /PAYMENT_WEBHOOK_SECRET/);
});

// ── Desarrollo: el fallback a AUTH_SECRET sigue existiendo ────────────────
test("en desarrollo sí cae a AUTH_SECRET (para no bloquear el trabajo local)", () => {
  setEnv("NODE_ENV", "development");
  setEnv("PAYMENT_WEBHOOK_SECRET", undefined);
  setEnv("AUTH_SECRET", "auth-dev");

  assert.equal(paymentSecret(), "auth-dev");
  assert.equal(paymentsConfigured(), true);
});

// ── Con secreto: el rail funciona ─────────────────────────────────────────
test("con secreto dedicado: firma y verificación del token fake hacen round-trip", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", "secreto-dedicado");

  assert.equal(paymentsConfigured(), true);
  const token = signFakePaymentToken("intent_42");
  assert.equal(verifyFakePaymentToken("intent_42", token), true);
  assert.equal(verifyFakePaymentToken("intent_OTRO", token), false);
});

test("el secreto dedicado gana al de auth (no se mezclan)", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_WEBHOOK_SECRET", "dedicado");
  setEnv("AUTH_SECRET", "auth");
  assert.equal(paymentSecret(), "dedicado");
});
