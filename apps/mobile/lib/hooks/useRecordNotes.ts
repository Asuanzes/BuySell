import { useCallback } from "react";

import { useRecord } from "@/lib/hooks/useRecord";
import {
  createRecordNote,
  deleteRecordNote,
  fetchRecordNotes,
  updateRecordNote,
  type RecordNote,
} from "@/lib/record-notes";
import type { RecordType } from "@nidokey/shared";

/**
 * Cableado de las notas de un registro, en un sitio: las fichas solo montan el
 * bloque y le pasan esto. Existe porque el mismo cableado va en inmueble,
 * cripto, mercado y las verticales que vengan; tenerlo duplicado garantizaba
 * que una corrección se aplicara en unas y en otras no.
 *
 * `add`/`edit`/`remove` avisan por `onError` y RELANZAN. Relanzar no es un
 * descuido: el bloque conserva el texto que el usuario acababa de escribir solo
 * si la promesa rechaza. Tragarse el error aquí le dejaría la caja vacía y la
 * nota sin guardar, que es justo lo que esta pieza existe para evitar.
 */
export function useRecordNotes(
  recordType: RecordType,
  recordId: string | undefined,
  opts: { enabled?: boolean; onError?: (error: unknown) => void } = {}
) {
  const { enabled = true, onError } = opts;
  const canLoad = enabled && !!recordId;

  const query = useRecord<RecordNote[]>(
    () => fetchRecordNotes(recordType, recordId!),
    [recordType, recordId, canLoad],
    { enabled: canLoad }
  );

  const { refetch } = query;
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refetch();
      } catch (error) {
        onError?.(error);
        throw error;
      }
    },
    [refetch, onError]
  );

  return {
    notes: query.data ?? null,
    loading: query.loading,
    error: query.error,
    retry: refetch,
    add: useCallback(
      (body: string) => run(() => createRecordNote(recordType, recordId!, body)),
      [run, recordType, recordId]
    ),
    edit: useCallback((noteId: string, body: string) => run(() => updateRecordNote(noteId, body)), [run]),
    remove: useCallback((noteId: string) => run(() => deleteRecordNote(noteId)), [run]),
  };
}
