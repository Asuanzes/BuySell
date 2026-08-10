/**
 * Anotaciones PRIVADAS de un registro: lo que su dueño escribió para sí mismo,
 * no la ficha en sí.
 *
 * Compartir un registro comparte la ficha. Adoptarlo crea una COPIA propia y
 * editable, así que es el punto donde una anotación ajena se convierte en dato
 * permanente de otra cuenta y sobrevive a que le retiren el compartido. Hasta
 * ahora la copia arrastraba `meta.userNotes` (la nota de libro) porque el
 * saneado solo quitaba id/ownerId/createdAt/updatedAt — y se llega ahí también
 * con `guardar_compartido` del bot, que a propósito no pide confirmación.
 */

/** Claves de anotación privada dentro del blob `meta` de los registros con meta. */
const PRIVATE_META_KEYS = ["userNotes", "userNotesAt"] as const;

/** Columnas de anotación privada (hoy solo inmuebles). */
const PRIVATE_COLUMNS = ["notes", "notesUpdatedAt"] as const;

/**
 * Quita las anotaciones privadas de una fila que se va a copiar a otra cuenta.
 * No muta la fila original: `meta` se clona antes de borrar sus claves.
 */
export function withoutPrivateAnnotations<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const column of PRIVATE_COLUMNS) delete copy[column];

  const meta = copy.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const cleanMeta: Record<string, unknown> = { ...(meta as Record<string, unknown>) };
    for (const key of PRIVATE_META_KEYS) delete cleanMeta[key];
    copy.meta = cleanMeta;
  }
  return copy;
}
