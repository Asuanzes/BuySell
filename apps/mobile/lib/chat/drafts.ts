import { deleteItem, getItem, setItem } from "@/lib/secure-store";

/**
 * Borradores del composer, persistentes entre navegaciones Y reinicios de la
 * app. SecureStore como almacén (único KV nativo ya presente en el binario;
 * AsyncStorage exigiría rebuild). Restricciones respetadas:
 *  - Android avisa con valores >2048 bytes → el borrador persistido se corta a
 *    1500 chars (el composer conserva el texto completo mientras la app viva).
 *  - Escrituras con debounce de 800 ms: teclear no debe machacar el keystore.
 *  - Índice de claves para poder limpiar borradores viejos (tope 20).
 */

const PREFIX = "nidokey.chat.draft.";
const INDEX_KEY = "nidokey.chat.draft.index";
const MAX_PERSISTED_CHARS = 1500;
const MAX_DRAFTS = 20;
const DEBOUNCE_MS = 800;

/** Caché en memoria: lectura instantánea dentro de la sesión. */
const memory = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function getDraft(conversationId: string): Promise<string> {
  const cached = memory.get(conversationId);
  if (cached !== undefined) return cached;
  try {
    const stored = (await getItem(PREFIX + conversationId)) ?? "";
    memory.set(conversationId, stored);
    return stored;
  } catch {
    return "";
  }
}

export function setDraft(conversationId: string, text: string): void {
  memory.set(conversationId, text);
  const prev = timers.get(conversationId);
  if (prev) clearTimeout(prev);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      void persist(conversationId, text);
    }, DEBOUNCE_MS)
  );
}

async function persist(conversationId: string, text: string): Promise<void> {
  try {
    const key = PREFIX + conversationId;
    if (!text.trim()) {
      await deleteItem(key);
      await updateIndex(conversationId, false);
      return;
    }
    await setItem(key, text.slice(0, MAX_PERSISTED_CHARS));
    await updateIndex(conversationId, true);
  } catch {
    // best-effort: el borrador en memoria sigue vivo
  }
}

/** Mantiene la lista de conversaciones con borrador y poda las más viejas. */
async function updateIndex(conversationId: string, present: boolean): Promise<void> {
  try {
    const raw = (await getItem(INDEX_KEY)) ?? "[]";
    let ids: string[] = [];
    try {
      ids = JSON.parse(raw) as string[];
    } catch {
      ids = [];
    }
    ids = ids.filter((x) => x !== conversationId);
    if (present) ids.push(conversationId);
    while (ids.length > MAX_DRAFTS) {
      const evicted = ids.shift()!;
      await deleteItem(PREFIX + evicted);
      memory.delete(evicted);
    }
    await setItem(INDEX_KEY, JSON.stringify(ids));
  } catch {
    // sin drama
  }
}
