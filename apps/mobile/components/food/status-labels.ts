import type { I18nKey } from "@/lib/i18n/keys";

/**
 * Estado/actor de pedido (enums del backend) → clave i18n tipada ESTRECHA.
 * A propósito NO se pasa a `t` una clave casteada al union completo de claves
 * (`as I18nKey`): con el union entero i18next dispara su tipo de retorno
 * recursivo y rompe el typecheck (TS2589) — misma razón que el switch literal
 * de lib/trends/sources.ts. Aquí el union es de 8/4 literales y `t` lo digiere.
 * Fallback: si llega un valor desconocido se muestra el código crudo.
 */
export const FOOD_STATUS_KEYS = {
  CREATED: "food.status_created",
  PENDING_PAYMENT: "food.status_pending_payment",
  PAID: "food.status_paid",
  PREPARING: "food.status_preparing",
  READY: "food.status_ready",
  IN_DELIVERY: "food.status_in_delivery",
  DELIVERED: "food.status_delivered",
  CANCELLED: "food.status_cancelled",
} as const satisfies Record<string, I18nKey>;

export const FOOD_ACTOR_KEYS = {
  CUSTOMER: "food.actor_customer",
  RESTAURANT: "food.actor_restaurant",
  COURIER: "food.actor_courier",
  SYSTEM: "food.actor_system",
} as const satisfies Record<string, I18nKey>;

export type FoodStatusI18nKey = (typeof FOOD_STATUS_KEYS)[keyof typeof FOOD_STATUS_KEYS];
export type FoodActorI18nKey = (typeof FOOD_ACTOR_KEYS)[keyof typeof FOOD_ACTOR_KEYS];

export function foodStatusLabel(t: (key: FoodStatusI18nKey) => string, status: string): string {
  const key = (FOOD_STATUS_KEYS as Record<string, FoodStatusI18nKey | undefined>)[status];
  return key ? t(key) : status;
}

export function foodActorLabel(t: (key: FoodActorI18nKey) => string, actor: string): string {
  const key = (FOOD_ACTOR_KEYS as Record<string, FoodActorI18nKey | undefined>)[actor];
  return key ? t(key) : actor;
}
