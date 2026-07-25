import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { baseUrl, signPaymentWebhook, paymentSecret, requirePaymentSecret } from "@/lib/payments/provider";
import { PREMIUM_PLAN } from "@/lib/billing/plans";

/**
 * Proveedores de SUSCRIPCIÓN (Premium), espejo del patrón PaymentProvider del
 * vertical comida: webhook-first (el estado solo cambia con evento firmado),
 * idempotencia por eventId en PaymentWebhookEvent, y el precio SIEMPRE del
 * servidor (plans.ts) — nunca del cliente.
 *
 *  - "fake": checkout hospedado en /billing/pay/fake que reentra por el mismo
 *    webhook firmado (HMAC con el secreto de pagos). Para desarrollo y para
 *    probar el rail completo sin cuenta de Stripe.
 *  - "stripe": Checkout Session en modo subscription (TEST con sk_test_...).
 *    Activar = poner STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET y
 *    STRIPE_PRICE_ID_PREMIUM (ver docs/OPERACIONES.md).
 */

export type SubscriptionEvent = {
  eventId: string;
  type: "activated" | "renewed" | "payment_failed" | "cancelled";
  /** id de NUESTRA fila Subscription (client_reference_id / ref del fake). */
  subscriptionRef: string;
  providerSubscriptionId?: string | null;
  periodEndISO?: string | null;
  /** Solo fake: el webhook verifica el importe contra plans.ts. */
  amountCents?: number;
};

export interface SubscriptionProvider {
  createCheckout(p: {
    subscriptionId: string;
    userEmail: string;
    returnUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  /** null = firma inválida (401). "ignored" = evento válido sin mapeo (200). */
  verifyWebhook(req: Request): Promise<(SubscriptionEvent & { payload: unknown }) | "ignored" | null>;
  cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void>;
}

// ─── Fake ────────────────────────────────────────────────────────────────

// El secreto de pagos se resuelve en UN solo sitio (payments/provider.ts):
// tener dos copias de la regla de fallback es justo lo que se desincroniza.
const fakeSecret = paymentSecret;

export function signFakeSubToken(ref: string): string {
  return createHmac("sha256", requirePaymentSecret()).update(`fake-sub:${ref}`).digest("hex");
}

export function verifyFakeSubToken(ref: string, token: string): boolean {
  if (!fakeSecret() || !ref || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(signFakeSubToken(ref));
  return a.length === b.length && timingSafeEqual(a, b);
}

const fakeSubscriptionProvider: SubscriptionProvider = {
  async createCheckout({ subscriptionId }) {
    const params = new URLSearchParams({
      ref: subscriptionId,
      amount: String(PREMIUM_PLAN.priceCents),
      currency: PREMIUM_PLAN.currency,
      t: signFakeSubToken(subscriptionId),
    });
    return { checkoutUrl: `${baseUrl()}/billing/pay/fake?${params.toString()}` };
  },

  async verifyWebhook(req) {
    const raw = await req.text();
    const header = req.headers.get("x-nidokey-payment-signature");
    if (!fakeSecret() || !header) return null;
    const expected = signPaymentWebhook(raw);
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(raw) as Partial<SubscriptionEvent>;
    if (
      !payload.eventId ||
      !payload.subscriptionRef ||
      !["activated", "renewed", "payment_failed", "cancelled"].includes(String(payload.type))
    ) {
      return null;
    }
    return {
      eventId: payload.eventId,
      type: payload.type as SubscriptionEvent["type"],
      subscriptionRef: payload.subscriptionRef,
      periodEndISO: payload.periodEndISO ?? null,
      amountCents: payload.amountCents,
      payload,
    };
  },

  async cancelAtPeriodEnd() {
    // fake: sin renovación real; el acceso caduca solo al llegar periodEnd.
  },
};

// ─── Stripe (modo test hasta poner claves live) ──────────────────────────

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** current_period_end vive en el item en las versiones nuevas del API de
 *  Stripe y en la raíz en las antiguas; leemos ambas. */
function stripePeriodEndISO(sub: Stripe.Subscription): string | null {
  const raw =
    sub.items?.data?.[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

const stripeSubscriptionProvider: SubscriptionProvider = {
  async createCheckout({ subscriptionId, userEmail, returnUrl }) {
    const stripe = stripeClient();
    const priceId = process.env.STRIPE_PRICE_ID_PREMIUM;
    if (!stripe || !priceId) throw new Error("Stripe no configurado (STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PREMIUM)");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: subscriptionId,
      customer_email: userEmail,
      success_url: `${returnUrl}?status=success`,
      cancel_url: `${returnUrl}?status=cancelled`,
      subscription_data: { metadata: { subscriptionRef: subscriptionId } },
    });
    if (!session.url) throw new Error("Stripe no devolvió URL de checkout");
    return { checkoutUrl: session.url };
  },

  async verifyWebhook(req) {
    const stripe = stripeClient();
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers.get("stripe-signature");
    if (!stripe || !whSecret || !sig) return null;
    const raw = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, whSecret);
    } catch {
      return null;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.client_reference_id) return "ignored";
      return {
        eventId: event.id,
        type: "activated",
        subscriptionRef: session.client_reference_id,
        providerSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
        periodEndISO: null, // llega en el customer.subscription.updated posterior
        payload: event,
      };
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const ref = sub.metadata?.subscriptionRef;
      if (!ref) return "ignored";
      let type: SubscriptionEvent["type"];
      if (event.type === "customer.subscription.deleted" || sub.status === "canceled") type = "cancelled";
      else if (sub.status === "past_due" || sub.status === "unpaid") type = "payment_failed";
      else if (sub.status === "active" || sub.status === "trialing") type = "renewed";
      else return "ignored"; // incomplete/incomplete_expired: aún sin pagar
      return {
        eventId: event.id,
        type,
        subscriptionRef: ref,
        providerSubscriptionId: sub.id,
        periodEndISO: stripePeriodEndISO(sub),
        payload: event,
      };
    }

    return "ignored";
  },

  async cancelAtPeriodEnd(providerSubscriptionId) {
    const stripe = stripeClient();
    if (!stripe) throw new Error("Stripe no configurado");
    await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
  },
};

// ─── Registro ────────────────────────────────────────────────────────────

export function subscriptionProvider(name: string): SubscriptionProvider | null {
  if (name === "fake") return fakeSubscriptionProvider;
  if (name === "stripe") return stripeSubscriptionProvider;
  return null;
}

/** Proveedor activo: BILLING_PROVIDER manda; sin env, Stripe si hay clave, fake si no. */
export function activeSubscriptionProviderName(): string {
  const env = process.env.BILLING_PROVIDER;
  if (env) return env;
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "fake";
}
