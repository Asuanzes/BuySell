import { api } from "@/lib/api";
import type { RecordType } from "@nidokey/shared";

/** Una entrada fechada. El servidor las devuelve de la más reciente a la más antigua. */
export type RecordNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

/** Tope del servidor: por encima RECHAZA con 400 en vez de recortar, así que el
 *  editor tiene que impedir llegar ahí (maxLength + contador). */
export const MAX_NOTE_LENGTH = 4000;

export async function fetchRecordNotes(recordType: RecordType, recordId: string): Promise<RecordNote[]> {
  const { items } = await api<{ items: RecordNote[] }>(
    `/api/records/${recordId}/notes?type=${encodeURIComponent(recordType)}`
  );
  return items;
}

export function createRecordNote(recordType: RecordType, recordId: string, body: string): Promise<unknown> {
  return api(`/api/records/${recordId}/notes?type=${encodeURIComponent(recordType)}`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateRecordNote(noteId: string, body: string): Promise<unknown> {
  return api(`/api/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ body }) });
}

export function deleteRecordNote(noteId: string): Promise<unknown> {
  return api(`/api/notes/${noteId}`, { method: "DELETE" });
}
