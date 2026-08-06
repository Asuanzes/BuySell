import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";

import { api } from "@/lib/api";
import { track, flush as flushAnalytics } from "@/lib/analytics";

/**
 * Notificaciones push del chat (lado cliente).
 *
 * BLINDAJE OTA: expo-notifications/expo-device son módulos NATIVOS. Si el
 * binario instalado NO los trae (p. ej. tras una OTA de este JS sobre un build
 * antiguo), importarlos/usarlos crashearía la app al arrancar. Por eso se cargan
 * con require() dentro de try/catch y TODA llamada nativa va protegida: en un
 * binario sin el módulo, el chat funciona y el push queda inerte; con un build
 * nuevo (EAS), el push opera. Recibir push exige BUILD NATIVO, no basta OTA; en
 * iOS además necesita APNs (cuenta Apple de pago) — un dev build con Apple ID
 * gratis envía mensajes pero no recibe push (se auto-desactiva sin crashear).
 */

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let Notifications: NotificationsModule | null = null;
let Device: DeviceModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require("expo-notifications") as NotificationsModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Device = require("expo-device") as DeviceModule;
} catch {
  Notifications = null;
  Device = null;
}

// En primer plano: mostrar banner salvo que estés en esa conversación.
let activeConversationId: string | null = null;
export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

// El handler es JS, pero lo envolvemos por si el módulo nativo falta.
try {
  Notifications?.setNotificationHandler({
    handleNotification: async (notification) => {
      const convId = (notification.request.content.data as { conversationId?: string } | undefined)?.conversationId;
      const muted = convId != null && convId === activeConversationId;
      return {
        shouldShowBanner: !muted,
        shouldShowList: true,
        shouldPlaySound: !muted,
        shouldSetBadge: true,
      };
    },
  });
} catch {
  // binario sin expo-notifications: sin handler, sin crash
}

/** Zona IANA del dispositivo ("Europe/Madrid"). undefined si Hermes no la da. */
function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/** Pide permiso, obtiene el token de Expo y lo registra en el backend. */
export async function registerForPush(): Promise<void> {
  // Por qué NO se registró, para poder diagnosticarlo desde el servidor. El
  // try/catch que protege de crashes se comía el error real: con la tabla Device
  // vacía era imposible saber si faltaba el módulo, el permiso o FCM.
  let step = "inicio";
  try {
    // iOS ACTIVO desde 2026-07-25 (cuenta Apple de pago + config plugin de
    // expo-notifications de vuelta en app.json, que añade el entitlement
    // aps-environment). El entitlement se genera siempre como "development" y
    // Xcode lo cambia a "production" en el archive de release, así que un build
    // de TestFlight/App Store usa el APNs de producción sin configurar nada.
    if (!Notifications || !Device) return void reportPushIssue("sin_modulo_nativo");
    if (!Device.isDevice) return; // emulador: no es un fallo que merezca reporte

    if (Platform.OS === "android") {
      step = "canal";
      await Notifications.setNotificationChannelAsync("chat", {
        name: "Mensajes",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6C5A9C",
      });
    }

    step = "permiso";
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return void reportPushIssue("permiso_denegado");

    // En Android este paso pide un token a FCM: sin google-services.json en el
    // build (y sin la clave FCM V1 subida a Expo) FALLA aquí.
    step = "token";
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;

    step = "registro";
    await api("/api/devices", {
      method: "POST",
      // La zona del dispositivo la usa el servidor para el horario silencioso
      // (se evalúa en hora LOCAL, no en UTC).
      body: JSON.stringify({
        expoPushToken: token,
        platform: Platform.OS,
        timezone: deviceTimezone(),
      }),
    });
  } catch (e) {
    // Push es best-effort: nunca rompe el arranque/login, pero SÍ deja rastro.
    reportPushIssue(`fallo_en_${step}`, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Deja constancia de por qué no hay push, en la analítica propia (el móvil no
 * tiene logs consultables en producción). Silencioso y no bloqueante.
 */
function reportPushIssue(reason: string, detail?: string): void {
  try {
    track("push_register_failed", {
      reason,
      platform: Platform.OS,
      ...(detail ? { detail: detail.slice(0, 120) } : {}),
    });
    void flushAnalytics();
  } catch {
    // ni el diagnóstico puede romper el arranque
  }
}

/** Baja del token (logout). Mejor esfuerzo. */
export async function unregisterPush(): Promise<void> {
  try {
    if (!Notifications || !Device || !Device.isDevice) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await api("/api/devices", { method: "DELETE", body: JSON.stringify({ expoPushToken: token }) });
  } catch {
    // ignore
  }
}

/**
 * Suscribe el deep-link de las notificaciones al tocarlas:
 *  - type "chat" → abre la conversación.
 *  - type "price_activity" (cambio de precio / retirada) → abre la ficha.
 *  - type "alert" de un inmueble (alerta manual) → abre la ficha. Otras
 *    alertas (cripto/empleo/…) no se enrutan aquí todavía.
 */
export function useNotificationTap(): () => void {
  try {
    if (!Notifications) return () => {};
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; conversationId?: string; recordId?: string; recordType?: string }
        | undefined;
      if (data?.type === "chat" && data.conversationId) {
        router.push(`/chat/${data.conversationId}` as never);
      } else if (data?.type === "price_activity" && data.recordId) {
        router.push(`/property/${data.recordId}` as never);
      } else if (data?.type === "alert" && data.recordType === "property" && data.recordId) {
        router.push(`/property/${data.recordId}` as never);
      }
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
