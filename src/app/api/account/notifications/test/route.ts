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

  // Tope suave: es un botón, no un canal de envío. Holgado a propósito — 10/h
  // se agotaba en una sesión normal de puesta en marcha (pasó el 2026-07-25) y
  // el 429 hacía pensar que el push se había roto.
  const limit = await rateLimit("push-test", userId, { limit: 30, windowMs: 3600_000 });
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 60_000));
    return NextResponse.json(
      {
        error: `Has hecho muchas pruebas seguidas. Vuelve a intentarlo en ${mins} min.`,
        // Que quede claro que esto NO afecta a las notificaciones de verdad.
        detail: "Este límite solo afecta al botón de prueba; los avisos reales siguen llegando.",
        retryInMinutes: mins,
      },
      { status: 429 }
    );
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
  let delivery: Awaited<ReturnType<typeof deliverPush>> | null = null;
  if (tokens.length > 0) {
    delivery = await deliverPush(
      tokens.map((to) => ({
        to,
        title: "Nidokey",
        body: "Notificación de prueba: si ves esto, el push funciona 🎉",
        sound: "default" as const,
        data: { type: "test" },
        channelId: "chat",
      })),
      "push-test",
      // El botón de prueba SÍ espera los recibos: es la única forma de saber si
      // el aviso llegó de verdad. Un ticket "ok" no significa entregado.
      { awaitReceipts: true }
    );
  }

  return NextResponse.json({
    devices: devices.length,
    platforms: [...new Set(devices.map((d) => d.platform))],
    timezones: [...new Set(devices.map((d) => d.timezone ?? "sin zona"))],
    chatPushEnabled: prefs?.chatPush ?? true,
    inQuietHours: quiet,
    // "sent" = tickets ACEPTADOS por Expo, no tokens a los que se intentó
    // enviar: sin credencial FCM V1 el envío se cursa y Expo lo rechaza.
    sent: delivery?.ok ?? 0,
    rejected: delivery?.errors ?? 0,
    expoError: delivery?.firstError ?? null,
    // Pista accionable cuando no llega nada.
    hint:
      devices.length === 0
        ? "Ningún dispositivo registró token. En Android hace falta un build nativo con google-services.json (Firebase) y aceptar el permiso; en iOS el push está desactivado (sin cuenta Apple)."
        : tokens.length === 0
          ? quiet
            ? "Estás en horario silencioso: por eso no suena. El aviso sí se guardaría en el chat."
            : "El push de chat está desactivado en tus preferencias."
          : delivery && delivery.dead > 0 && delivery.ok === 0
            ? "FCM dice que el dispositivo NO está registrado. Suele significar que la clave FCM V1 subida a Expo pertenece a OTRO proyecto de Firebase que el google-services.json de la app, o que se subió a otro identificador. Comprueba en expo.dev → Credentials → Android que la clave es del proyecto 'es-nidokey-app' y está en 'es.nidokey.app'. Los tokens muertos se han borrado: reabre la app para registrar uno nuevo."
            : delivery && delivery.errors > 0
              ? `Expo rechazó el envío: ${delivery.firstError ?? "sin detalle"}.`
              : delivery && delivery.dead > 0
                ? "Algún token estaba caducado y se ha borrado. Reabre la app para registrar uno nuevo."
                : null,
  });
}
