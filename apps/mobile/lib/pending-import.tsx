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
 * Si el import muere en ERROR tampoco se borra: reabrir en <10 min reintenta
 * (semántica de retry); pasado el TTL caduca solo.
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
  // Con `null` (recogida) NO se toca el almacén: eso es completePendingImport().
  const persist = useCallback((kind: "url" | "book", value: string | null) => {
    if (value) void setItem(PENDING_IMPORT_KEY, serializePendingImport(kind, value, Date.now())).catch(() => {});
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

  const completePendingImport = useCallback(() => {
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
