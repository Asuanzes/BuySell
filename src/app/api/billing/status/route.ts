import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { premiumFromRow } from "@/lib/billing/entitlements";
import { PREMIUM_PLAN } from "@/lib/billing/plans";
import { CHAT_LIMITS } from "@/lib/chat/config";

/** GET /api/billing/status — plan actual del usuario (lo consume la app). */
export async function GET() {
  const userId = await requireUserId();
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, provider: true },
  });
  const premium = premiumFromRow(sub);
  return NextResponse.json({
    plan: premium ? "premium" : "free",
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    price: { cents: PREMIUM_PLAN.priceCents, currency: PREMIUM_PLAN.currency, interval: PREMIUM_PLAN.interval },
    limits: {
      botMsgsPerDay: premium ? PREMIUM_PLAN.botMsgsPerDay : CHAT_LIMITS.botMsgsPerDay,
      jobSearchesPerDay: premium ? PREMIUM_PLAN.jobSearchesPerDay : 10,
    },
  });
}
