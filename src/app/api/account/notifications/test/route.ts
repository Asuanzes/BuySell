import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { deliverPush, inQuietHours, localHourIn, pushableTokens } from "@/lib/notifications/push";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/account/notifications/test — envía una push de prueba a MIS
 * dispositivos y devuelve DIAGNÓSTICO.
 *
 * El valor está en el diagnóstico: "no me llega la notificación" tiene cuatro
 * causas posibles (sin token registrado, preferencia apagada, horario
 * silencioso, o el binario sin el módulo nativo) y esta respuesta distingue las
 * tres primeras. Si `devices: 0`, el móvil nunca registró token → es la cuarta.
 */
export async function POST() {
  const userId = await requireUserId();

  // Tope suave: es un botón, no un canal de envío.
  const limit = await rateLimit("push-test", userId, { limit: 10, windowMs: 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas pruebas. Espera un rato." }, { status: 429 });
  }

  const [devices, prefs] = await Promise.all([
    prisma.device.findMany({
      where: { userId },
      select: { platform: true, timezone: true, lastSeenAt: true },
    }),
    prisma.notificationPrefs.findUnique({
      where: { userId },
      select: { chatPush: true, quietStartHour: true, quietEndHour: true },
    }),
  ]);

  const now = new Date();
  const quiet = devices.some((d) =>
    inQuietHours(localHourIn(d.timezone, now), prefs?.quietStartHour ?? null, prefs?.quietEndHour ?? null)
  );

  // Se usa la categoría "chat" a propósito: valida el mismo camino que un
  // mensaje real (preferencia + horario silencioso), no un atajo.
  const tokens = await pushableTokens([userId], "chat", now);
  if (tokens.length > 0) {
    await deliverPush(
      tokens.map((to) => ({
        to,
        title: "Nidokey",
        body: "Notificación de prueba: si ves esto, el push funciona 🎉",
        sound: "default" as const,
        data: { type: "test" },
        channelId: "chat",
      })),
      "push-test"
    );
  }

  return NextResponse.json({
    devices: devices.length,
    platforms: [...new Set(devices.map((d) => d.platform))],
    timezones: [...new Set(devices.map((d) => d.timezone ?? "sin zona"))],
    chatPushEnabled: prefs?.chatPush ?? true,
    inQuietHours: quiet,
    sent: tokens.length,
    // Pista accionable cuando no se envía nada.
    hint:
      devices.length === 0
        ? "Ningún dispositivo registró token. En Android hace falta un build nativo con expo-notifications y aceptar el permiso; en iOS el push está desactivado (sin cuenta Apple)."
        : tokens.length === 0
          ? quiet
            ? "Estás en horario silencioso: por eso no suena. El aviso sí se guardaría en el chat."
            : "El push de chat está desactivado en tus preferencias."
          : null,
  });
}
