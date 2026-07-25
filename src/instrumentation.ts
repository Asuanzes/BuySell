/**
 * Validación de entorno al ARRANCAR el servidor (hook `register` de Next 15).
 *
 * - CRÍTICAS: sin ellas la app no funciona o es insegura → error fatal en
 *   producción (mejor caer en el deploy que degradar en silencio).
 * - RECOMENDADAS: features concretas degradan sin ellas → warning en logs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const critical = ["DATABASE_URL", "AUTH_SECRET"] as const;
  const recommended = [
    "CRON_SECRET", // sin él, los crons de refresco/limpieza no autorizan
    "RESEND_API_KEY", // sin él, el login por email NO funciona en producción
    // Sin él los PAGOS quedan apagados (503 al intentar cobrar), pero el resto
    // de la app funciona con normalidad. Obligatorio antes de cobrar.
    "PAYMENT_WEBHOOK_SECRET",
    "CHAT_GATEWAY_SECRET", // sin él, el chat degrada a polling
    "CHAT_WS_SECRET",
  ] as const;

  const missingCritical = critical.filter((k) => !process.env[k]);
  const missingRecommended = recommended.filter((k) => !process.env[k]);

  if (missingRecommended.length) {
    console.warn(`[env] Variables recomendadas ausentes: ${missingRecommended.join(", ")}`);
  }
  if (missingCritical.length) {
    const msg = `[env] Variables CRÍTICAS ausentes: ${missingCritical.join(", ")}`;
    if (process.env.NODE_ENV === "production") throw new Error(msg);
    console.warn(msg);
  }
}
