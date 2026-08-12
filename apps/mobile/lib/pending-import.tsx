import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { deleteItem, getItem, setItem } from "@/lib/secure-store";
import {
  COMPLETED_IMPORT_KEY,
  COMPLETED_IMPORT_TTL_MS,
  forgetPendingImport,
  getRememberedPendingImport,
  PENDING_IMPORT_KEY,
  parseCompletedImport,
  parsePendingImport,
  rememberPendingImport,
  serializeCompletedImport,
  serializePendingImport,
  type CompletedImport,
} from "@/lib/pending-import-storage";

/**
 * URL de inmueble pendiente de importar, compartida entre el layout raíz (que
 * captura el share/deep-link estés en la pantalla que estés) y la pantalla
 * Importar (que la consume: auto-arranca la importación y la limpia).
 *
 * Patrón "consumir": tras RECOGERLO, la pantalla hace setUrl(null); así un
 * segundo share de la MISMA URL vuelve a dispararse (null → url = cambio).
 *
 * PERSISTE en almacenamiento (BUG-15). Antes vivía solo en memoria y el share
 * con la app CERRADA se perdía entero: `expo-share-intent` entrega y borra el
 * intent nativo nada más arrancar el JS, así que cuando la sesión resolvía ya no
 * quedaba nada que copiar y el usuario aterrizaba en Importar con las
 * instrucciones vacías. Guardar en cuanto llega desacopla "capturar" de "poder
 * navegar", que era justo el acoplamiento que rompía el arranque en frío.
 *
 * RECOGER ≠ COMPLETAR (BUG-15, fase 3): setUrl(null)/setBookShare(null) limpian
 * SOLO el estado; el almacén se borra con completePendingImport(), que Importar
 * llama cuando el import TERMINA de verdad (registro creado / candidato elegido /
 * alta manual / inmueble ok). El porqué: en el arranque en frío del share viven
 * unos ~2s DOS instancias de la app y la condenada (invisible, bajo la task de
 * quien comparte) llegaba a recoger el pendiente, BORRARLO y morir a mitad de la
 * importación — la instancia promocionada hidrataba un almacén vacío y el libro
 * se esfumaba sin error. Con el borrado movido al final, morir a mitad deja el
 * pendiente intacto y la instancia superviviente rehace el import a la vista.
 *
 * "Terminar" = alcanzar un terminal RENDERIZADO (éxito, lista de candidatos o
 * error a la vista), no solo éxito: dejar vivo el pendiente tras enseñar un
 * error/lista reabría Importar con el mismo libro en cada arranque en frío
 * durante todo el TTL (el "bucle" de agosto-2026). Morir EN VUELO sigue sin
 * borrar nada — esa es la protección de la instancia condenada.
 *
 * RE-ENTREGA del intent: Android re-adjunta el ACTION_SEND original al recrear
 * la Activity desde recientes y expo-share-intent lo re-captura en cada
 * onCreate. setBookShare ignora un share idéntico al último COMPLETADO
 * (COMPLETED_IMPORT_TTL_MS); sin eso el bucle no tenía ni el límite del TTL.
 */
type Ctx = {
  url: string | null;
  setUrl: (u: string | null) => void;
  /** Texto compartido de un LIBRO (p. ej. "Título … enlace") pendiente de procesar
   *  en Importar (se resuelve por ISBN o por título). Canal aparte de `url`
   *  porque un libro no siempre llega como URL importable. */
  bookShare: string | null;
  setBookShare: (t: string | null) => void;
  /** true hasta que se ha leído el almacenamiento: sin esto, Importar decidiría
   *  "no hay nada pendiente" antes de que el pendiente guardado llegue. */
  hydrating: boolean;
  /** Borra el pendiente PERSISTIDO. Llamar SOLO cuando el import ha llegado a un
   *  terminal de ÉXITO; recoger no basta (ver cabecera). Inocuo sin pendiente. */
  completePendingImport: () => void;
};

const PendingImportContext = createContext<Ctx | null>(null);

export function PendingImportProvider({ children }: { children: ReactNode }) {
  const [url, setUrlState] = useState<string | null>(null);
  const [bookShare, setBookShareState] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  // Último share de LIBRO entregado a los consumidores: es lo que
  // completePendingImport registra como "completado" para el dedupe de abajo.
  const lastDeliveredBookRef = useRef<string | null>(null);
  // Último share COMPLETADO (persistido): un share idéntico que llegue dentro
  // de la ventana se ignora — es la re-entrega nativa del intent, no el usuario.
  const lastCompletedRef = useRef<CompletedImport | null>(null);

  useEffect(() => {
    let alive = true;
    // El dedupe de re-entrega necesita el último completado SIEMPRE, también
    // cuando el pendiente viene del canal en memoria. ponytail: si un share
    // re-entregado llega antes de que este read (~ms) resuelva, se cuela una
    // vez; la ventana real de la re-entrega (evento nativo tras montar el
    // árbol) es órdenes de magnitud más lenta.
    getItem(COMPLETED_IMPORT_KEY)
      .then((raw) => {
        if (alive && !lastCompletedRef.current) {
          lastCompletedRef.current = parseCompletedImport(raw, Date.now());
        }
      })
      .catch(() => {});
    const remembered = getRememberedPendingImport(Date.now());
    if (remembered?.kind === "url") {
      setUrlState(remembered.value);
      setHydrating(false);
      return () => {
        alive = false;
      };
    }
    if (remembered?.kind === "book") {
      lastDeliveredBookRef.current = remembered.value;
      setBookShareState(remembered.value);
      setHydrating(false);
      return () => {
        alive = false;
      };
    }
    getItem(PENDING_IMPORT_KEY)
      .then((raw) => {
        if (!alive) return;
        // Guard de frescura: si un share fresco llegó MIENTRAS leíamos el
        // disco, el canal en memoria ya lo tiene y manda él. Aplicar aquí el
        // guardado (más viejo) pisaba el share recién capturado y la pantalla
        // Importar aparecía con el libro ANTERIOR y resultados incoherentes.
        if (getRememberedPendingImport(Date.now())) return;
        const pending = parsePendingImport(raw, Date.now());
        if (pending?.kind === "url") setUrlState(pending.value);
        else if (pending?.kind === "book") {
          lastDeliveredBookRef.current = pending.value;
          setBookShareState(pending.value);
        }
        // Caducado o corrupto: se limpia para no reintentarlo en cada arranque.
        if (raw && !pending) void deleteItem(PENDING_IMPORT_KEY).catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setHydrating(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // El almacenamiento guarda UN pendiente: el último que llegó. Escribir es
  // best-effort — si falla, la app sigue funcionando en memoria como antes.
  // Con `null` (recogida) NO se toca el almacén: eso es completePendingImport().
  const persist = useCallback((kind: "url" | "book", value: string | null) => {
    if (value) {
      const now = Date.now();
      rememberPendingImport(kind, value, now);
      void setItem(PENDING_IMPORT_KEY, serializePendingImport(kind, value, now)).catch(() => {});
    }
  }, []);

  const setUrl = useCallback(
    (u: string | null) => {
      // Canal cambiado: una completion posterior se refiere al flujo de URL,
      // no a un libro rancio entregado antes.
      if (u) lastDeliveredBookRef.current = null;
      setUrlState(u);
      persist("url", u);
    },
    [persist]
  );

  const setBookShare = useCallback(
    (t: string | null) => {
      // Re-entrega nativa del intent: un share IDÉNTICO al último ya
      // COMPLETADO no se re-procesa. Solo libros — re-compartir la misma URL
      // de inmueble es un gesto legítimo de "revisa el precio".
      if (t) {
        const c = lastCompletedRef.current;
        if (c && c.value === t && Date.now() - c.at <= COMPLETED_IMPORT_TTL_MS) return;
        lastDeliveredBookRef.current = t;
      }
      setBookShareState(t);
      persist("book", t);
    },
    [persist]
  );

  const completePendingImport = useCallback(() => {
    // Registrar QUÉ se completó para poder ignorar su re-entrega nativa.
    const v = lastDeliveredBookRef.current;
    if (v) {
      const now = Date.now();
      lastCompletedRef.current = { value: v, at: now };
      void setItem(COMPLETED_IMPORT_KEY, serializeCompletedImport(v, now)).catch(() => {});
    }
    forgetPendingImport();
    void deleteItem(PENDING_IMPORT_KEY).catch(() => {});
  }, []);

  return (
    <PendingImportContext.Provider
      value={{ url, setUrl, bookShare, setBookShare, hydrating, completePendingImport }}
    >
      {children}
    </PendingImportContext.Provider>
  );
}

export function usePendingImport(): Ctx {
  const ctx = useContext(PendingImportContext);
  if (!ctx) throw new Error("usePendingImport fuera de PendingImportProvider");
  return ctx;
}
