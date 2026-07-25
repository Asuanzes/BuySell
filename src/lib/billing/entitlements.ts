import { prisma } from "@/lib/db";
import { CHAT_LIMITS } from "@/lib/chat/config";
import { PREMIUM_PLAN, PREMIUM_GRACE_DAYS, FREE_ACTIVE_ALERTS } from "@/lib/billing/plans";

type SubRow = {
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null;

/**
 * Decide si una fila de Subscription otorga Premium AHORA. Pura (testeable).
 *
 * - ACTIVE/PAST_DUE con periodo vigente (+ gracia) → sí. PAST_DUE mantiene el
 *   acceso durante la gracia para no cortar el servicio por un cobro reintentable.
 * - CANCELLED con cancelAtPeriodEnd: el webhook de Stripe manda `deleted` al
 *   FINAL del periodo, así que CANCELLED = acceso terminado. La cancelación
 *   voluntaria a mitad de periodo se modela como ACTIVE + cancelAtPeriodEnd
 *   hasta que llega ese webhook.
 */
export function premiumFromRow(sub: SubRow, now: Date = new Date()): boolean {
  if (!sub) return false;
  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") return false;
  if (!sub.currentPeriodEnd) return true; // activada sin periodo aún (webhook inicial)
  const graceMs = PREMIUM_GRACE_DAYS * 86_400_000;
  return sub.currentPeriodEnd.getTime() + graceMs > now.getTime();
}

export async function isPremium(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  return premiumFromRow(sub);
}

/** Cuota diaria del bot según plan (la consume respondAsBot). */
export async function botDailyLimit(userId: string): Promise<number> {
  return (await isPremium(userId)) ? PREMIUM_PLAN.botMsgsPerDay : CHAT_LIMITS.botMsgsPerDay;
}

/** Cuota diaria de búsquedas de empleo (Apify) según plan. */
export async function jobSearchDailyLimit(userId: string): Promise<number> {
  return (await isPremium(userId)) ? PREMIUM_PLAN.jobSearchesPerDay : 10;
}

/** Máximo de alertas de precio ACTIVAS simultáneas según plan. */
export async function activeAlertsLimit(userId: string): Promise<number> {
  return (await isPremium(userId)) ? PREMIUM_PLAN.activeAlerts : FREE_ACTIVE_ALERTS;
}
