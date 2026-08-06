import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Dirección y % de un cambio de precio (para el evento `listing_price_change`).
 * null si no se puede comparar (sin previo, sin nuevo o previo <= 0).
 */
export function priceChangeDir(oldCents: number | null, newCents: number | null) {
  if (oldCents == null || newCents == null || oldCents <= 0) return null;
  return {
    direction: newCents < oldCents ? "drop" : newCents > oldCents ? "up" : "flat",
    pct: Math.round(((newCents - oldCents) / oldCents) * 100),
  };
}

/**
 * Evento de analítica propio (tabla AnalyticsEvent). NUNCA lanza: la
 * observabilidad no debe romper el flujo de import ni el recheck de anuncios.
 * `userId` es opcional a propósito: el recheck del cron no tiene un usuario
 * único (los eventos de pipeline van sin atribución individual).
 */
export async function trackEvent(
  name: string,
  opts: { userId?: string | null; props?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        userId: opts.userId ?? null,
        name,
        props: opts.props ? (opts.props as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    console.error("[analytics] track failed:", e, { name });
  }
}
