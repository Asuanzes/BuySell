import { RECORD_TYPES, type RecordType } from "@nidokey/shared";

/**
 * Preferencias LOCALES del menú de categorías (orden + ocultas + categoría de
 * inicio), guardadas en SecureStore — igual que el orden de registros
 * (`lib/local-order.ts`) y el tema. No se sincronizan con servidor: son una
 * preferencia de vista personal del móvil.
 *
 * Los "ids" aquí son `RecordType` (enum cerrado de `@nidokey/shared`), así que
 * SIEMPRE se validan contra `RECORD_TYPES` al leer: un valor renombrado o
 * eliminado en shared no debe romper el menú.
 */
const ORDER_KEY = "nidokey.categories.order";
const HIDDEN_KEY = "nidokey.categories.hidden";
const START_KEY = "nidokey.categories.start";

// "food" (fase 0) y "workout" (fase 1) fuera desde 2026-08-09
// (PRODUCT_LOOP.md CICLO 2): al no estar en el set gestionado desaparecen de
// rail/ajustes/inicio y las prefs guardadas que las referencien se descartan
// solas al validar contra este set (migración defensiva).
export const MANAGED_RECORD_TYPES: RecordType[] = RECORD_TYPES.filter(
  (t) => t !== "trends" && t !== "food" && t !== "workout"
);

const RECORD_TYPE_SET = new Set<string>(MANAGED_RECORD_TYPES);
export function isRecordType(x: unknown): x is RecordType {
  return typeof x === "string" && RECORD_TYPE_SET.has(x);
}

async function readTypeArray(key: string): Promise<RecordType[]> {
  try {
    const { getItem } = await import("../secure-store");
    const raw = await getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecordType) : [];
  } catch {
    return [];
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    const { setItem } = await import("../secure-store");
    await setItem(key, JSON.stringify(value));
  } catch {
    // SecureStore tiene límite por valor; con 9 categorías no se alcanza.
  }
}

export function getSavedCategoryOrder(): Promise<RecordType[]> {
  return readTypeArray(ORDER_KEY);
}
export function saveCategoryOrder(order: RecordType[]): Promise<void> {
  return writeJson(ORDER_KEY, order);
}

export function getHiddenCategories(): Promise<RecordType[]> {
  return readTypeArray(HIDDEN_KEY);
}
export function saveHiddenCategories(hidden: RecordType[]): Promise<void> {
  return writeJson(HIDDEN_KEY, hidden);
}

export async function getStartCategory(): Promise<RecordType | null> {
  try {
    const { getItem } = await import("../secure-store");
    const raw = await getItem(START_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw); // se guarda con JSON.stringify (writeJson)
    return isRecordType(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
export function saveStartCategory(type: RecordType): Promise<void> {
  return writeJson(START_KEY, type);
}

/**
 * Combina el orden canónico (`RECORD_TYPES`) con el orden guardado: manda el
 * guardado; cualquier categoría NUEVA (añadida a `RECORD_TYPES` después) va al
 * final, visible. Garantiza que el menú nunca pierde una categoría real.
 */
export function applyCategoryOrder(savedOrder: RecordType[]): RecordType[] {
  if (savedOrder.length === 0) return [...MANAGED_RECORD_TYPES];
  const seen = new Set<RecordType>();
  const out: RecordType[] = [];
  for (const t of savedOrder) {
    if (RECORD_TYPE_SET.has(t) && !seen.has(t)) {
      out.push(t);
      seen.add(t);
    }
  }
  for (const t of MANAGED_RECORD_TYPES) {
    if (!seen.has(t)) out.push(t);
  }
  return out;
}

/** Borra TODAS las preferencias locales (tema + orden de registros + categorías). */
export async function resetAllPreferences(): Promise<void> {
  const { deleteItem } = await import("../secure-store");
  const keys = [
    "nidokey.theme",
    ORDER_KEY,
    HIDDEN_KEY,
    START_KEY,
    ...MANAGED_RECORD_TYPES.map((t) => `nidokey.order.${t}`),
  ];
  await Promise.all(
    keys.map((k) =>
      deleteItem(k).catch(() => {
        /* idempotente: si no existe, nada */
      })
    )
  );
}
