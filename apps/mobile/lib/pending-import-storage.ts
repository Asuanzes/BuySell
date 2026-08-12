/**
 * Serialización del "import pendiente" (BUG-15).
 *
 * Antes esto vivía SOLO en memoria, y por eso el share con la app cerrada se
 * perdía: `expo-share-intent` entrega y BORRA el intent nativo en cuanto arranca
 * el JS, mucho antes de que la sesión resuelva. Cuando el efecto por fin podía
 * copiar el texto, ya no había texto que copiar, y el usuario aterrizaba en
 * Importar con las instrucciones vacías.
 *
 * Ahora se persiste en cuanto llega. Persistir trae su propio riesgo —resucitar
 * un share viejo—, y de ahí el TTL: lo compartido es una intención del momento,
 * no un dato que guardar.
 */

/** Un share caduca pronto: si abres la app al día siguiente NO quieres que se
 *  reabra Importar con el libro de ayer, que probablemente ya guardaste. */
export const PENDING_IMPORT_TTL_MS = 10 * 60 * 1000;

export const PENDING_IMPORT_KEY = "nidokey.pendingImport";

/** Ventana en la que un share de libro IDÉNTICO al último COMPLETADO se ignora.
 *  Android re-adjunta el ACTION_SEND original al recrear la Activity desde
 *  recientes y expo-share-intent lo re-captura en cada onCreate: sin este
 *  dedupe, cada reapertura en frío volvía a abrir Importar con el mismo libro,
 *  sin límite de tiempo. 48 h cubre el ciclo de vida real de una task en
 *  recientes sin bloquear para siempre re-compartir el mismo libro. */
export const COMPLETED_IMPORT_TTL_MS = 48 * 60 * 60 * 1000;

export const COMPLETED_IMPORT_KEY = "nidokey.lastCompletedImport";

export type CompletedImport = { value: string; at: number };

export type PendingImport = { kind: "url" | "book"; value: string; at: number };

let latestPendingImport: PendingImport | null = null;

export function serializePendingImport(kind: PendingImport["kind"], value: string, now: number): string {
  return JSON.stringify({ kind, value, at: now } satisfies PendingImport);
}

export function rememberPendingImport(kind: PendingImport["kind"], value: string, now: number): PendingImport {
  latestPendingImport = { kind, value, at: now };
  return latestPendingImport;
}

export function getRememberedPendingImport(now: number): PendingImport | null {
  if (!latestPendingImport) return null;
  const pending = parsePendingImport(JSON.stringify(latestPendingImport), now);
  if (!pending) {
    latestPendingImport = null;
    return null;
  }
  return pending;
}

export function forgetPendingImport(): void {
  latestPendingImport = null;
}

/**
 * Devuelve el pendiente solo si sigue siendo válido. Cualquier cosa rara
 * (JSON roto, campos ausentes, tipo desconocido, futuro imposible) se descarta
 * en silencio: un pendiente corrupto no debe impedir abrir la app.
 */
export function parsePendingImport(raw: string | null, now: number): PendingImport | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { kind, value, at } = parsed as Partial<PendingImport>;
  if (kind !== "url" && kind !== "book") return null;
  if (typeof value !== "string" || !value.trim()) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  // `at > now` = reloj cambiado entre escritura y lectura; se trata como caducado
  // en vez de fiarse, porque un `at` en el futuro nunca expiraría.
  if (at > now || now - at > PENDING_IMPORT_TTL_MS) return null;
  return { kind, value, at };
}

export function serializeCompletedImport(value: string, now: number): string {
  return JSON.stringify({ value, at: now } satisfies CompletedImport);
}

/** Mismo contrato defensivo que parsePendingImport: cualquier cosa rara se
 *  descarta en silencio — un "completado" corrupto no debe bloquear shares. */
export function parseCompletedImport(raw: string | null, now: number): CompletedImport | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { value, at } = parsed as Partial<CompletedImport>;
  if (typeof value !== "string" || !value.trim()) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (at > now || now - at > COMPLETED_IMPORT_TTL_MS) return null;
  return { value, at };
}
