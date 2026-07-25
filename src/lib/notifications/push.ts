import { prisma } from "@/lib/db";

/**
 * Envío de push (Expo) compartido por chat y alertas, con las preferencias del
 * usuario y el horario silencioso aplicados EN EL SERVIDOR.
 *
 * Reglas:
 *  - Ausencia de fila NotificationPrefs = valores por defecto (todo activado):
 *    los usuarios existentes no cambian de comportamiento.
 *  - El horario silencioso se evalúa en la hora LOCAL de cada dispositivo
 *    (`Device.timezone`), no en UTC — si no la manda, se usa Europe/Madrid.
 *  - Silenciar solo suprime el PUSH. El mensaje del bot / del chat se guarda
 *    igual, así que no se pierde nada.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEFAULT_TZ = "Europe/Madrid";

export type PushCategory = "chat" | "alerts";

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: Record<string, string>;
  channelId: string;
};

/**
 * ¿La hora local cae dentro de la franja silenciosa? PURA.
 * Admite franjas que cruzan medianoche (23 → 8). Franja incompleta o degenerada
 * (start === end) = sin silencio.
 */
export function inQuietHours(localHour: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null || start === end) return false;
  return start < end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
}

/** Hora (0-23) en una zona IANA. Si la zona es inválida, cae a Europe/Madrid. */
export function localHourIn(timezone: string | null | undefined, now: Date = new Date()): number {
  const tz = timezone?.trim() || DEFAULT_TZ;
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(now));
  } catch {
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_TZ, hour: "numeric", hour12: false }).format(now)
    );
  }
}

/**
 * Tokens a los que SÍ se debe enviar push de esta categoría: filtra por
 * preferencia del usuario y por horario silencioso de cada dispositivo.
 */
export async function pushableTokens(
  userIds: string[],
  category: PushCategory,
  now: Date = new Date()
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const [devices, prefs] = await Promise.all([
    prisma.device.findMany({
      where: { userId: { in: userIds } },
      select: { expoPushToken: true, userId: true, timezone: true },
    }),
    prisma.notificationPrefs.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, chatPush: true, alertsPush: true, quietStartHour: true, quietEndHour: true },
    }),
  ]);
  if (devices.length === 0) return [];

  const byUser = new Map(prefs.map((p) => [p.userId, p]));
  const out: string[] = [];
  for (const d of devices) {
    const p = byUser.get(d.userId);
    if (p) {
      const enabled = category === "chat" ? p.chatPush : p.alertsPush;
      if (!enabled) continue;
      if (inQuietHours(localHourIn(d.timezone, now), p.quietStartHour, p.quietEndHour)) continue;
    }
    out.push(d.expoPushToken);
  }
  return out;
}

export type PushDelivery = {
  /** Tickets aceptados por Expo (no garantiza entrega, pero sí que se cursó). */
  ok: number;
  /** Tokens caducados: se borran de Device. */
  dead: number;
  /** Errores reales (p. ej. credencial FCM ausente en el proyecto de Expo). */
  errors: number;
  /** Primer error, tal cual lo devuelve Expo. Clave para diagnosticar. */
  firstError: string | null;
};

/**
 * Envía en lotes de 100, limpia tokens muertos (DeviceNotRegistered) y DEVUELVE
 * el resultado. Devolverlo importa: sin credencial FCM V1 en el proyecto de
 * Expo, los tokens existen y el envío se cursa pero Expo lo rechaza — contar
 * solo tokens daría un falso "enviado".
 */
export async function deliverPush(messages: PushMessage[], tag = "push"): Promise<PushDelivery> {
  if (messages.length === 0) return { ok: 0, dead: 0, errors: 0, firstError: null };
  const dead: string[] = [];
  let errors = 0;
  let ok = 0;
  let firstError: string | null = null;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { status: string; message?: string; details?: { error?: string } }[]; errors?: { message?: string }[] }
        | null;
      // Error global del lote (p. ej. credencial FCM ausente): Expo responde
      // con `errors` en la raíz y sin tickets.
      if (json?.errors?.length) {
        errors += chunk.length;
        firstError ??= json.errors[0]?.message ?? "error sin mensaje";
        continue;
      }
      const tickets = json?.data ?? [];
      tickets.forEach((t, idx) => {
        if (t.status === "error") {
          if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[idx].to);
          else {
            errors++;
            firstError ??= t.message ?? t.details?.error ?? "error sin mensaje";
          }
        } else {
          ok++;
        }
      });
    } catch (e) {
      // Push best-effort: nunca rompe la operación que lo originó.
      errors += chunk.length;
      const msg = e instanceof Error ? e.message : String(e);
      firstError ??= msg;
      console.error(`[${tag}] lote falló: ${msg}`);
    }
  }
  if (errors || dead.length) {
    console.log(`[${tag}] ok=${ok} errores=${errors} muertos=${dead.length}${firstError ? ` primero="${firstError}"` : ""}`);
  }
  if (dead.length) {
    await prisma.device.deleteMany({ where: { expoPushToken: { in: dead } } }).catch(() => {});
  }
  return { ok, dead: dead.length, errors, firstError };
}
