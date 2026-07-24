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
  const provider = subscriptionProvider(providerName);
  if (!provider) {
    return NextResponse.json({ error: `Proveedor no soportado: ${providerName}` }, { status: 500 });
  }

  const sub = await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "premium", provider: providerName, status: "PENDING" },
    update: { plan: "premium", provider: providerName, status: "PENDING" },
  });

  const { checkoutUrl } = await provider.createCheckout({
    subscriptionId: sub.id,
    userEmail: user.email,
    returnUrl: `${baseUrl()}/billing/pay/return`,
  });

  return NextResponse.json({ checkoutUrl });
}
