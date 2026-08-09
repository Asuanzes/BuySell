import type { AlertKind } from "@prisma/client";
import type { RecordType } from "@nidokey/shared";
import { stripRecordLinks } from "@nidokey/shared";
import { prisma } from "@/lib/db";
import { ensureBotDm, replyAsBot } from "@/lib/chat/bot";
import { recordTitle } from "@/lib/records/access";
import { deliverPush, pushableTokens } from "@/lib/notifications/push";
import { alertEventKey, createRecordEvent } from "@/lib/record-events";

/**
 * Motor de alertas de precio.
 *
 * La DECISIÓN es pura (`shouldFire`) para poder probarla sin BBDD ni red; el
 * envoltorio `evaluateAlerts` es el que persiste y notifica. Se llama desde los
 * dos sitios que YA detectan el cambio de precio:
 *   - features/sources/refresh.ts  → cripto y mercados (cron cada 1-2 min)
 *   - features/scraping/runner.ts  → inmuebles (recheck de anuncios)
 *
 * Canal: SIEMPRE un mensaje en el DM de @Nidokey (registro duradero y visible
 * también en iOS, donde no hay push). El push se añade en una fase posterior.
 */

export type AlertRow = {
  id: string;
  kind: AlertKind;
  threshold: number | null;
  baselineCents: number | null;
  oneShot: boolean;
  lastFiredAt: Date | null;
};

export type PriceChange = {
  /** Valor anterior en céntimos (null si es la primera comprobación). */
  oldCents: number | null;
  /** Valor nuevo en céntimos. */
  newCents: number | null;
  /** Nuevo estado del anuncio (solo inmuebles): SOLD, REMOVED, PRICE_DROP… */
  status?: string | null;
};

/** Espera mínima entre disparos de una alerta repetible (las de un solo
 *  disparo se desactivan al saltar, así que no la necesitan). */
export const ALERT_COOLDOWN_MS = 6 * 3600_000;

/** Estados de anuncio que merecen aviso (los de precio ya los cubren los
 *  umbrales; ACTIVE/UNKNOWN no son noticia). */
const STATUS_WORTH_ALERTING = new Set(["SOLD", "REMOVED"]);

/**
 * ¿Debe saltar esta alerta con este cambio? PURA.
 *
 * Los umbrales absolutos exigen CRUCE (que el valor anterior estuviera al otro
 * lado): así un precio que ya estaba por debajo no vuelve a notificar en cada
 * tick del cron. Si no hay valor anterior, basta con que la condición se cumpla.
 */
export function shouldFire(alert: AlertRow, change: PriceChange, now: Date = new Date()): boolean {
  if (
    !alert.oneShot &&
    alert.lastFiredAt &&
    now.getTime() - alert.lastFiredAt.getTime() < ALERT_COOLDOWN_MS
  ) {
    return false;
  }

  if (alert.kind === "STATUS_CHANGE") {
    return !!change.status && STATUS_WORTH_ALERTING.has(change.status);
  }

  const next = change.newCents;
  if (next == null) return false;

  if (alert.kind === "PRICE_BELOW") {
    if (alert.threshold == null) return false;
    return next <= alert.threshold && (change.oldCents == null || change.oldCents > alert.threshold);
  }

  if (alert.kind === "PRICE_ABOVE") {
    if (alert.threshold == null) return false;
    return next >= alert.threshold && (change.oldCents == null || change.oldCents < alert.threshold);
  }

  if (alert.kind === "PRICE_DROP_PCT") {
    if (alert.threshold == null || alert.baselineCents == null || alert.baselineCents <= 0) return false;
    const dropPct = ((alert.baselineCents - next) / alert.baselineCents) * 100;
    return dropPct >= alert.threshold;
  }

  return false;
}

/** Formatea céntimos como importe legible (es-ES). PURA. */
export function fmtCents(cents: number | null | undefined, currency = "EUR"): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency, maximumFractionDigits: 2 });
}

/**
 * Texto del aviso. PURA. Incluye el enlace `[[tipo:id|Título]]` que el móvil
 * convierte en pulsable (ver packages/shared/src/links.ts).
 */
export function alertMessage(p: {
  kind: AlertKind;
  recordType: string;
  recordId: string;
  title: string;
  field: string;
  newCents: number | null;
  threshold: number | null;
  baselineCents: number | null;
  status?: string | null;
  currency?: string;
}): string {
  const link = `[[${p.recordType}:${p.recordId}|${(p.title || "tu registro").slice(0, 60)}]]`;
  const what = p.field === "rent" ? "La renta de" : "";
  const value = fmtCents(p.newCents, p.currency);

  if (p.kind === "STATUS_CHANGE") {
    const label = p.status === "SOLD" ? "se ha marcado como VENDIDO" : "ha desaparecido del portal";
    return `🔔 ${link} ${label}.`;
  }
  if (p.kind === "PRICE_BELOW") {
    return `🔔 ${what} ${link} ha bajado de ${fmtCents(p.threshold, p.currency)} — ahora ${value}.`.trim();
  }
  if (p.kind === "PRICE_ABOVE") {
    return `🔔 ${what} ${link} ha superado ${fmtCents(p.threshold, p.currency)} — ahora ${value}.`.trim();
  }
  // PRICE_DROP_PCT
  const from = fmtCents(p.baselineCents, p.currency);
  return `🔔 ${what} ${link} ha caído un ${p.threshold} % (de ${from} a ${value}).`.trim();
}

/**
 * Evalúa y dispara las alertas de un registro tras un cambio de valor.
 * No lanza nunca: un fallo aquí no debe romper el cron de refresco.
 * Devuelve cuántas alertas saltaron.
 */
export async function evaluateAlerts(
  recordType: RecordType,
  recordId: string,
  field: "price" | "rent",
  change: PriceChange
): Promise<number> {
  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { recordType, recordId, field, active: true },
      select: {
        id: true,
        userId: true,
        kind: true,
        field: true,
        threshold: true,
        baselineCents: true,
        oneShot: true,
        lastFiredAt: true,
      },
    });
    if (alerts.length === 0) return 0;

    const now = new Date();
    const firing = alerts.filter((a) => shouldFire(a, change, now));
    if (firing.length === 0) return 0;

    const title = await recordTitle(recordType, recordId);

    for (const a of firing) {
      // Marcar ANTES de notificar: si el envío falla, no reintentamos en el
      // siguiente tick (mejor perder un aviso que spamear al usuario).
      await prisma.priceAlert.update({
        where: { id: a.id },
        data: { lastFiredAt: now, ...(a.oneShot ? { active: false } : {}) },
      });

      const text = alertMessage({
        kind: a.kind,
        recordType,
        recordId,
        title,
        field: a.field,
        newCents: change.newCents,
        threshold: a.threshold,
        baselineCents: a.baselineCents,
        status: change.status,
      });

      // Canal 1 (siempre): DM del bot. Registro duradero y visible en iOS.
      const cid = await ensureBotDm(a.userId);
      if (cid) await replyAsBot(cid, text);

      // Canal 2 (si el usuario lo permite y no está en horario silencioso):
      // push. El texto va sin el marcado de enlace, que solo entiende el chat.
      const tokens = await pushableTokens([a.userId], "alerts");
      if (tokens.length > 0) {
        await deliverPush(
          tokens.map((to) => ({
            to,
            title: "Alerta de precio",
            body: stripRecordLinks(text).replace(/^🔔\s*/, ""),
            sound: "default" as const,
            data: { type: "alert", recordType, recordId },
            channelId: "chat",
          })),
          "alert-push"
        );
      }

      await prisma.analyticsEvent
        .create({ data: { userId: a.userId, name: "alert_fired", props: { recordType, kind: a.kind } } })
        .catch(() => {});

      await createRecordEvent({
        userId: a.userId,
        recordType,
        recordId,
        eventType: "alert_fired",
        source: "alert",
        idempotencyKey: alertEventKey(a.id, now),
        observedAt: now,
        payload: {
          alertId: a.id,
          kind: a.kind,
          field: a.field,
          threshold: a.threshold,
          baselineCents: a.baselineCents,
          newCents: change.newCents,
          status: change.status ?? null,
          message: stripRecordLinks(text),
        },
      });
    }

    return firing.length;
  } catch (err) {
    console.error("[alerts] evaluación fallida:", err);
    return 0;
  }
}
