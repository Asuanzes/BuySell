import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { subscriptionProvider } from "@/lib/billing/provider";

/**
 * POST /api/billing/cancel — cancelación al final del periodo (nunca corte
 * inmediato: el usuario conserva lo pagado). En Stripe delega en
 * cancel_at_period_end; el webhook `deleted` posterior marca CANCELLED.
 */
export async function POST() {
  const userId = await requireUserId();
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status === "CANCELLED") {
    return NextResponse.json({ error: "No tienes suscripción activa" }, { status: 404 });
  }

  if (sub.providerSubscriptionId) {
    const provider = subscriptionProvider(sub.provider);
    await provider?.cancelAtPeriodEnd(sub.providerSubscriptionId).catch((e) => {
      console.error("[billing] cancel provider error:", e);
    });
  }

  const updated = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  return NextResponse.json({ ok: true, ...updated });
}
