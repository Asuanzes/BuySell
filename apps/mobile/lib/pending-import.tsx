import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { deleteItem, getItem, setItem } from "@/lib/secure-store";
import {
  PENDING_IMPORT_KEY,
  parsePendingImport,
  serializePendingImport,
} from "@/lib/pending-import-storage";

/**
 * URL de inmueble pendiente de importar, compartida entre el layout raíz (que
 * captura el share/deep-link estés en la pantalla que estés) y la pantalla
 * Importar (que la consume: auto-arranca la importación y la limpia).
 *
 * Patrón "consumir": tras importar, la pantalla hace setUrl(null); así un
 * segundo share de la MISMA URL vuelve a dispararse (null → url = cambio).
 *
 * PERSISTE en almacenamiento (BUG-15). Antes vivía solo en memoria y el share
 * con la app CERRADA se perdía entero: `expo-share-intent` entrega y borra el
 * intent nativo nada más arrancar el JS, así que cuando la sesión resolvía ya no
 * quedaba nada que copiar y el usuario aterrizaba en Importar con las
 * instrucciones vacías. Guardar en cuanto llega desacopla "capturar" de "poder
 * navegar", que era justo el acoplamiento que rompía el arranque en frío.
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
};

const PendingImportContext = createContext<Ctx | null>(null);

export function PendingImportProvider({ children }: { children: ReactNode }) {
  const [url, setUrlState] = useState<string | null>(null);
  const [bookShare, setBookShareState] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let alive = true;
    getItem(PENDING_IMPORT_KEY)
      .then((raw) => {
        if (!alive) return;
        const pending = parsePendingImport(raw, Date.now());
        if (pending?.kind === "url") setUrlState(pending.value);
        else if (pending?.kind === "book") setBookShareState(pending.value);
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
  const persist = useCallback((kind: "url" | "book", value: string | null) => {
    if (value) void setItem(PENDING_IMPORT_KEY, serializePendingImport(kind, value, Date.now())).catch(() => {});
    else void deleteItem(PENDING_IMPORT_KEY).catch(() => {});
  }, []);

  const setUrl = useCallback(
    (u: string | null) => {
      setUrlState(u);
      persist("url", u);
    },
    [persist]
  );

  const setBookShare = useCallback(
    (t: string | null) => {
      setBookShareState(t);
      persist("book", t);
    },
    [persist]
  );

  return (
    <PendingImportContext.Provider value={{ url, setUrl, bookShare, setBookShare, hydrating }}>
      {children}
    </PendingImportContext.Provider>
  );
}

export function usePendingImport(): Ctx {
  const ctx = useContext(PendingImportContext);
  if (!ctx) throw new Error("usePendingImport fuera de PendingImportProvider");
  return ctx;
}
