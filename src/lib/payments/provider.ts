import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentEvent = {
  eventId: string;
  type: "succeeded" | "failed" | "refunded";
  intentId: string;
  amountCents: number;
};

export interface PaymentProvider {
  createIntent(p: {
    amountCents: number;
    currency: string;
    orderId: string;
    returnUrl: string;
  }): Promise<{ intentId: string; checkoutUrl: string }>;
  verifyWebhook(req: Request): Promise<(PaymentEvent & { payload: unknown }) | null>;
  getIntentStatus(intentId: string): Promise<"pending" | "succeeded" | "failed" | "expired">;
  refund(intentId: string): Promise<{ refundId: string }>;
  expire(intentId: string): Promise<void>;
}

/**
 * Secreto HMAC de pagos. ÚNICA fuente de verdad: lo usan tanto los pagos de
 * pedidos como las SUSCRIPCIONES (de ahí el nombre genérico).
 *
 * DEDICADO: en producción es obligatorio `PAYMENT_WEBHOOK_SECRET` (P0 de la
 * auditoría — compartir AUTH_SECRET con pagos significa que comprometer uno
 * compromete el otro). El fallback a AUTH_SECRET solo existe en desarrollo.
 * Sin secreto: firmar lanza (fail-fast) y verificar devuelve false (fail-closed).
 */
export const paymentSecret = () => {
  const dedicated = process.env.PAYMENT_WEBHOOK_SECRET;
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV !== "production") return process.env.AUTH_SECRET || "";
  return "";
};

export function requirePaymentSecret(): string {
  const s = paymentSecret();
  if (!s) throw new Error("PAYMENT_WEBHOOK_SECRET no configurado (obligatorio en producción)");
  return s;
}

/**
 * ¿Se pueden crear cobros? Sin secreto NO: firmar lanzaría. Las rutas que
 * inician un pago deben comprobarlo antes y responder 503 en vez de un 500.
 * Permite desplegar sin secreto (pagos apagados) sin que nada crashee.
 */
export function paymentsConfigured(): boolean {
  return !!paymentSecret();
}

export function signPaymentWebhook(raw: string): string {
  return "sha256=" + createHmac("sha256", requirePaymentSecret()).update(raw).digest("hex");
}

export function signFakePaymentToken(intentId: string): string {
  return createHmac("sha256", requirePaymentSecret()).update(`fake-payment:${intentId}`).digest("hex");
}

export function verifyFakePaymentToken(intentId: string, token: string): boolean {
  if (!paymentSecret() || !intentId || !token) return false;
  const expected = signFakePaymentToken(intentId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySignature(header: string | null, raw: string): boolean {
  if (!paymentSecret() || !header) return false;
  const expected = signPaymentWebhook(raw);
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://nidokey.es")
    .replace(/^([^h])/, "https://$1")
    .replace(/\/+$/, "");
}

export const fakePaymentProvider: PaymentProvider = {
  async createIntent({ amountCents, currency, orderId, returnUrl }) {
    const intentId = `fake_${orderId}_${Date.now().toString(36)}`;
    const params = new URLSearchParams({
      intentId,
      orderId,
      amount: String(amountCents),
      currency,
      returnUrl,
      t: signFakePaymentToken(intentId),
    });
    return {
      intentId,
      checkoutUrl: `${baseUrl()}/food/pay/fake?${params.toString()}`,
    };
  },

  async verifyWebhook(req) {
    const raw = await req.text();
    if (!verifySignature(req.headers.get("x-nidokey-payment-signature"), raw)) return null;
    const payload = JSON.parse(raw) as {
      eventId?: string;
      type?: string;
      intentId?: string;
      amountCents?: number;
    };
    const amountCents = payload.amountCents;
    if (
      !payload.eventId ||
      !payload.intentId ||
      typeof amountCents !== "number" ||
      !Number.isInteger(amountCents) ||
      !["succeeded", "failed", "refunded"].includes(String(payload.type))
    ) {
      return null;
    }
    return {
      eventId: payload.eventId,
      type: payload.type as PaymentEvent["type"],
      intentId: payload.intentId,
      amountCents,
      payload,
    };
  },

  async getIntentStatus() {
    return "pending";
  },

  async refund(intentId) {
    return { refundId: `fake_refund_${intentId}_${Date.now().toString(36)}` };
  },

  async expire() {
    return;
  },
};

export function paymentProvider(provider: string): PaymentProvider | null {
  if (provider === "fake") return fakePaymentProvider;
  return null;
}
