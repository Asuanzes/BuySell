import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { baseUrl } from "@/lib/payments/provider";
import { subscriptionProvider, activeSubscriptionProviderName } from "@/lib/billing/provider";
import { premiumFromRow } from "@/lib/billing/entitlements";

/**
 * POST /api/billing/checkout — inicia el alta Premium.
 *
 * Sin body: el plan y el precio son server-side (plans.ts). Devuelve la URL de
 * checkout hospedado (fake o Stripe); el móvil la abre con
 * WebBrowser.openAuthSessionAsync y el estado final llega por WEBHOOK, nunca
 * por la URL de retorno.
 */
export async function POST() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing && premiumFromRow(existing)) {
    return NextResponse.json({ error: "Ya tienes Nidokey Premium" }, { status: 409 });
  }

  const providerName = activeSubscriptionProviderName();
  // Cinturón de producción: el proveedor fake regala Premium (pago simulado).
  // Solo se permite en prod si se activa EXPLÍCITAMENTE con BILLING_PROVIDER=fake
  // (pruebas controladas); sin Stripe configurado, el checkout queda apagado.
  if (
    providerName === "fake" &&
    process.env.NODE_ENV === "production" &&
    process.env.BILLING_PROVIDER !== "fake"
  ) {
    return NextResponse.json({ error: "Checkout no disponible todavía" }, { status: 503 });
  }
  const provider = subscriptionProvider(providerName);
  if (!provider) {
    return NextResponse.json({ error: `Proveedor no soportado: ${providerName}` }, { status: 500 });
  }

  const sub = await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "premium", provider: providerName, status: "PENDING" },
    // Resubscripción: resetear el periodo viejo — si no, tras el "activated" de
    // Stripe (que aún no trae periodEnd) premiumFromRow vería el periodo
    // CADUCADO de la suscripción anterior y negaría el acceso recién pagado.
    update: {
      plan: "premium",
      provider: providerName,
      status: "PENDING",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: null,
    },
  });

  const { checkoutUrl } = await provider.createCheckout({
    subscriptionId: sub.id,
    userEmail: user.email,
    returnUrl: `${baseUrl()}/billing/pay/return`,
  });

  // Embudo: inicio de checkout registrado server-side (fiable aunque el
  // cliente muera antes de flushear su cola).
  await prisma.analyticsEvent
    .create({ data: { userId, name: "checkout_start", props: { provider: providerName } } })
    .catch(() => {});

  return NextResponse.json({ checkoutUrl });
}
