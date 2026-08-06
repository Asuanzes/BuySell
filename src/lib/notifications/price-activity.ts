import { prisma } from "@/lib/db";
import { deliverPush, pushableTokens } from "@/lib/notifications/push";
import { recordTitle } from "@/lib/records/access";
import { fmtCents } from "@/lib/alerts/evaluate";
import { stripRecordLinks } from "@nidokey/shared";

/**
 * Aviso automático por cambio de precio o retirada del anuncio.
 *
 * Cubre lo que `evaluateAlerts` NO cubre: notifica al dueño y a los usuarios
 * con acceso compartido (`RecordShare`) aunque NO tengan una alerta manual
 * configurada — un cambio de precio o que el anuncio desaparezca (vendido o
 * retirado) es justo lo que el producto promete vigilar.
 *
 * Relación con `evaluateAlerts` (alertas manuales tipo "avísame si baja un
 * 10 %"): son complementarias. El runner llama primero a `evaluateAlerts`; si
 * alguna alerta manual saltó en el mismo tick, se salta este aviso genérico
 * para no mandar dos push del mismo cambio.
 *
 * Nunca lanza: un fallo aquí no debe romper el recheck.
 */

export type PriceActivity =
  | {
      kind: "price";
      /** "rent" si es la renta mensual (ficha mixta); si no, precio de venta. */
      field: "price" | "rent";
      oldCents: number | null;
      newCents: number;
      status: string;
    }
  | { kind: "removed"; oldCents: number | null };

/** Texto del aviso. PURA (testeable). `title` vacío → sin nombre del anuncio. */
export function priceActivityText(a: PriceActivity, title?: string | null): string {
  const prefix = title ? `«${title}» ` : "";
  if (a.kind === "removed") {
    return `${prefix}el anuncio ha desaparecido del portal (vendido o retirado).`;
  }
  const what = a.field === "rent" ? "la renta" : "el precio";
  if (a.oldCents == null) {
    return `${prefix}${what} ahora es ${fmtCents(a.newCents)}.`;
  }
  const verb = a.newCents < a.oldCents ? "ha bajado" : a.newCents > a.oldCents ? "ha subido" : "se mantiene en";
  return `${prefix}${what} ${verb}: ${fmtCents(a.oldCents)} → ${fmtCents(a.newCents)}.`;
}

/**
 * Envía el push al dueño + compartidos. Devuelve cuántos envíos aceptó Expo
 * (0 si no hay destinatarios con push habilitado). Registra `price_change_push`.
 */
export async function notifyPriceActivity(recordId: string, activity: PriceActivity): Promise<number> {
  try {
    const [title, shares, prop] = await Promise.all([
      recordTitle("property", recordId),
      prisma.recordShare.findMany({
        where: { recordType: "property", recordId },
        select: { toUserId: true },
      }),
      prisma.property.findUnique({ where: { id: recordId }, select: { ownerId: true } }),
    ]);
    const userIds = [
      ...new Set([prop?.ownerId ?? null, ...shares.map((s) => s.toUserId)].filter((x): x is string => !!x)),
    ];
    if (userIds.length === 0) return 0;

    const text = stripRecordLinks(priceActivityText(activity, title));
    const tokens = await pushableTokens(userIds, "alerts");
    if (tokens.length === 0) return 0;

    const res = await deliverPush(
      tokens.map((to) => ({
        to,
        title: activity.kind === "removed" ? "Cambio en el anuncio" : "Cambio de precio",
        body: text,
        sound: "default" as const,
        data: { type: "price_activity", recordType: "property", recordId, kind: activity.kind },
        channelId: "chat",
      })),
      "price-activity-push"
    );

    await prisma.analyticsEvent
      .create({
        data: {
          userId: prop?.ownerId ?? null,
          name: "price_change_push",
          props: { kind: activity.kind, delivered: res.ok, errors: res.errors },
        },
      })
      .catch(() => {});

    return res.ok;
  } catch (err) {
    console.error("[price-activity] notificación fallida:", err);
    return 0;
  }
}
