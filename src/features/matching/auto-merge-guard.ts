import { operationPrice } from "@nidokey/shared";

/**
 * Guard de seguridad del auto-merge (score ≥ 95). Función pura para poder
 * testearla sin BBDD. Decide si una fusión automática debe BLOQUEARSE.
 *
 * Reglas:
 *  - Tipo distinto (PISO vs LOCAL…) → bloquear.
 *  - Misma operación y precios que difieren > 30 % → bloquear (probablemente no
 *    son el mismo inmueble pese al score).
 *  - Operación distinta (venta vs alquiler del mismo inmueble) = caso MIXTO
 *    legítimo → NO bloquear por precio (la fusión conserva ambos importes en
 *    columnas separadas: currentPrice y monthlyRent).
 */
export type MergeGuardProperty = {
  type: string;
  operationType: string; // "SALE" | "RENT" | "RENT_TO_OWN"
  currentPrice: number | null;
  monthlyRent: number | null;
};

/** Precio comparable según la operación: venta→currentPrice, alquiler→monthlyRent. */
export function comparablePrice(p: MergeGuardProperty): number | null {
  return operationPrice(p);
}

export function autoMergeSafety(
  me: MergeGuardProperty,
  them: MergeGuardProperty
): { blocked: boolean; priceTooDifferent: boolean; typeMismatch: boolean } {
  const typeMismatch = me.type !== them.type;
  const sameOperation = me.operationType === them.operationType;
  const a = comparablePrice(me);
  const b = comparablePrice(them);
  const priceTooDifferent =
    sameOperation && a != null && b != null && a > 0 && b > 0
      ? Math.abs(a - b) / Math.max(a, b) > 0.3
      : false;
  return { blocked: typeMismatch || priceTooDifferent, priceTooDifferent, typeMismatch };
}
