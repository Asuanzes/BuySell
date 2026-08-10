import { api } from "@/lib/api";
import type { RecordType } from "@nidokey/shared";

import type { Checklist, ChecklistItem } from "@/components/records/RecordChecklistBlock";

export type { Checklist, ChecklistItem };

type RecordTaskDto = {
  id: string;
  recordType: string;
  recordId: string;
  kind: string;
  title: string;
  createdAt: string;
  completedAt: string | null;
  items: Array<{ id: string; label: string; reason: string | null; done: boolean; sortOrder: number }>;
};

/**
 * El checklist de visita del día: el servidor guarda uno por visita (idempotente
 * por día UTC) y devuelve el histórico completo, así que aquí se coge el más
 * reciente. Devuelve null cuando el usuario todavía no ha preparado ninguna
 * visita, que es lo que hace desaparecer el bloque de la ficha.
 */
export async function fetchLatestVisitChecklist(
  recordType: RecordType,
  recordId: string
): Promise<Checklist | null> {
  const { items } = await api<{ items: RecordTaskDto[] }>(
    `/api/records/${recordId}/tasks?type=${encodeURIComponent(recordType)}`
  );
  const latest = items.find((task) => task.kind === "visit_checklist");
  return latest ? toChecklist(latest) : null;
}

function toChecklist(task: RecordTaskDto): Checklist {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    items: task.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ id: item.id, label: item.label, reason: item.reason, done: item.done })),
  };
}

export function setChecklistItemDone(taskId: string, itemId: string, done: boolean): Promise<unknown> {
  return api(`/api/tasks/${taskId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
  });
}

export function addChecklistItem(taskId: string, label: string): Promise<unknown> {
  return api(`/api/tasks/${taskId}/items`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}
