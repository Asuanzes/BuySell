/**
 * Analítica de producto DESACOPLADA del proveedor: cola local + lotes a
 * POST /api/analytics (tabla propia, sin SDK de terceros). Si algún día se
 * quiere PostHog/Amplitude, se cambia flush() y nada más.
 *
 * Reglas:
 *  - track() nunca lanza ni bloquea la UI (fire-and-forget).
 *  - Sin PII en props (el catálogo de eventos vive en docs/ANALITICA.md).
 *  - Pre-login los eventos van anónimos con deviceId; con sesión, el servidor
 *    los atribuye por el Bearer (el cliente NUNCA manda userId).
 */
import { AppState } from "react-native";
import { api } from "./api";
import { getItem, setItem } from "./secure-store";

type Props = Record<string, string | number | boolean>;
type Ev = { name: string; ts: string; props?: Props };

const DEVICE_KEY = "nidokey.analytics.device";
const FLUSH_MS = 10_000;
const BATCH = 20;
const MAX_QUEUE = 200; // si el backend no responde, no crecer sin límite

let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let deviceId: string | null = null;
let flushing = false;

async function ensureDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const stored = await getItem(DEVICE_KEY);
  if (stored) return (deviceId = stored);
  const fresh = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await setItem(DEVICE_KEY, fresh);
  return (deviceId = fresh);
}

/** Registra un evento de producto. Nombre en snake_case (^[a-z0-9_.]{2,60}$). */
export function track(name: string, props?: Props): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ name, ts: new Date().toISOString(), props });
  if (queue.length >= BATCH) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_MS);
  }
}

/** Envía la cola pendiente. Silencioso: un fallo re-encola y reintenta luego. */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const events = queue.splice(0, 50);
  try {
    const id = await ensureDeviceId();
    await api("/api/analytics", {
      method: "POST",
      body: JSON.stringify({ deviceId: id, events }),
    });
  } catch {
    queue = [...events, ...queue].slice(0, MAX_QUEUE);
  } finally {
    flushing = false;
  }
}

// Al pasar la app a segundo plano, vaciar la cola (última oportunidad de la sesión).
AppState.addEventListener("change", (state) => {
  if (state === "background" || state === "inactive") void flush();
});
