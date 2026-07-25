/**
 * ÚNICA fuente de verdad de planes y precios. El cliente NUNCA envía precios:
 * checkout, webhooks y entitlements leen de aquí (server-side).
 *
 * Cambiar el precio: editar aquí y (si Stripe está activo) crear un Price nuevo
 * en el dashboard y actualizar STRIPE_PRICE_ID_PREMIUM. Los suscriptores
 * existentes conservan su precio en Stripe hasta que se migre explícitamente.
 */

export const PREMIUM_PLAN = {
  id: "premium",
  /** Precio mensual en céntimos de EUR. */
  priceCents: 499,
  currency: "EUR",
  interval: "month" as const,
  /** Cuota diaria del bot @Nidokey para Premium (gratis: CHAT_LIMITS.botMsgsPerDay). */
  botMsgsPerDay: 400,
  /** Búsquedas de empleo (Apify) al día para Premium (gratis: 10). */
  jobSearchesPerDay: 40,
  /** Alertas de precio ACTIVAS simultáneas para Premium. */
  activeAlerts: 25,
} as const;

/** Alertas de precio activas en el plan gratuito. */
export const FREE_ACTIVE_ALERTS = 3;

/** Días de gracia tras `currentPeriodEnd` antes de perder el acceso Premium
 *  (cubre reintentos de cobro y desfases de webhook). */
export const PREMIUM_GRACE_DAYS = 3;
