/**
 * Cliente de la búsqueda de vuelos en streaming (SSE).
 *
 * Usa `expo/fetch` en lugar del `fetch` global de React Native: el global viene
 * de whatwg-fetch y su `response.body` es `undefined`, así que con él NO hay
 * streaming posible. `expo/fetch` sí lo trae, apoyado en un módulo nativo que
 * viaja dentro del paquete core `expo` — o sea, ya está en el binario y esto
 * sale por OTA sin recompilar (verificado sobre el bundle real del proyecto).
 *
 * Trampas de `expo/fetch` que están tratadas aquí a propósito:
 *  1. Se lee con `getReader()`, NUNCA con `for await`: el `Symbol.asyncIterator`
 *     del stream se parchea después, y no está garantizado en el arranque.
 *  2. Cancelar rechaza con un `Error` genérico, no con un `AbortError`. Por eso
 *     el corte se detecta mirando la señal, no el nombre del error.
 *  3. `credentials` va a `"include"` por defecto (distinto del fetch web). Aquí
 *     da igual porque autenticamos con Bearer, pero conviene no olvidarlo.
 *  4. `clone()` lanza "Not implemented": el cuerpo se lee una sola vez.
 *  5. No hay backpressure: el nativo encola todo lo que llega. Los eventos de
 *     esta búsqueda son pequeños y acotados, así que no es un problema, pero no
 *     vale para un stream infinito.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import {
  applyProgressEvent,
  initialProgressState,
  parseSseBuffer,
  type SearchProgressEvent,
  type SearchProgressState,
} from "@nidokey/shared";
import { API_URL, TOKEN_KEY, getAuthHeaders } from "./api";
import { getItem } from "./secure-store";

/**
 * Tope absoluto de una búsqueda. El servidor ya se corta solo, pero si la red
 * se queda a medias sin cerrar, esto evita un "buscando…" eterno.
 */
const MAX_SEARCH_MS = 120_000;

export type FlightStreamHandle = { stop: () => void };

export type FlightStreamCallbacks = {
  onEvent: (event: SearchProgressEvent) => void;
  /** Solo se llama en fallos REALES; cancelar no es un fallo. */
  onError: (error: Error) => void;
  onClose?: () => void;
};

/**
 * Abre el stream y va entregando eventos. Devuelve un mando para detenerlo:
 * cortar la conexión es lo que hace que el servidor deje de gastar consultas
 * de pago, así que el botón "detener" de la UI acaba justo aquí.
 */
export function openFlightStream(
  query: Record<string, string>,
  cb: FlightStreamCallbacks
): FlightStreamHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_SEARCH_MS);

  void (async () => {
    try {
      const token = await getItem(TOKEN_KEY);
      const qs = new URLSearchParams(query).toString();
      const res = await expoFetch(`${API_URL}/api/travel/flights/stream?${qs}`, {
        headers: { Accept: "text/event-stream", ...getAuthHeaders(token) },
        signal: controller.signal,
      });
      if (!res.ok) {
        // El cuerpo de error sí es JSON corriente (401, 429, 400).
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("stream_unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // `stream: true` conserva el estado entre chunks: un carácter UTF-8
        // partido por la mitad entre dos paquetes se decodifica mal sin esto.
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) cb.onEvent(event);
      }
    } catch (err) {
      // Cancelar llega como Error genérico, no como AbortError: la señal es la
      // única fuente fiable para distinguir "lo paró el usuario" de "se rompió".
      if (!controller.signal.aborted) {
        cb.onError(err instanceof Error ? err : new Error("stream_failed"));
      }
    } finally {
      clearTimeout(timer);
      cb.onClose?.();
    }
  })();

  return { stop: () => controller.abort() };
}

export type FlightSearchStream = {
  state: SearchProgressState;
  running: boolean;
  /** Fallo real del transporte. Cancelar NO llena esto. */
  error: string | null;
  start: (query: Record<string, string>) => void;
  stop: () => void;
  reset: () => void;
};

/**
 * Estado de una búsqueda en streaming, listo para pintar.
 *
 * La lógica de "qué significa este evento" NO está aquí: vive en el reductor
 * puro de @nidokey/shared, que es donde se puede probar el desorden de la red y
 * la reconexión. Este hook solo une el transporte con React.
 */
export function useFlightSearchStream(): FlightSearchStream {
  const [state, setState] = useState<SearchProgressState>(initialProgressState);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<FlightStreamHandle | null>(null);
  /** Deja de aplicar eventos cuando el componente ya no está: setState sobre un
   *  componente desmontado es un aviso en desarrollo y trabajo tirado en producción. */
  const mounted = useRef(true);

  /**
   * Cortar al desmontar NO es higiene, es dinero: salir de la pantalla a mitad
   * de búsqueda dejaría el servidor lanzando consultas de pago a Duffel que ya
   * no va a ver nadie.
   */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      handle.current?.stop();
      handle.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setRunning(false);
    setError(null);
    setState(initialProgressState);
  }, []);

  const start = useCallback((query: Record<string, string>) => {
    handle.current?.stop();
    setState(initialProgressState);
    setError(null);
    setRunning(true);
    const own = openFlightStream(query, {
      // Reducer puro: aplicar el mismo evento dos veces es inofensivo, así que
      // un reenvío tras reconectar no duplica ofertas.
      onEvent: (event) => {
        // `handle.current !== own` = ya hay una búsqueda MÁS NUEVA en marcha.
        // Sin este filtro, los últimos eventos de la anterior pisarían a la
        // nueva y el usuario vería precios de una búsqueda que ya descartó.
        if (mounted.current && handle.current === own) {
          setState((prev) => applyProgressEvent(prev, event));
        }
      },
      onError: (err) => {
        if (mounted.current && handle.current === own) setError(err.message);
      },
      onClose: () => {
        if (handle.current === own) handle.current = null;
        if (mounted.current) setRunning(false);
      },
    });
    handle.current = own;
  }, []);

  return { state, running, error, start, stop, reset };
}
