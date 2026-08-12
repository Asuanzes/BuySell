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
  scheduledAt: string | null;
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
  recordId: string,
  // C8: los viajes usan su propio kind; el default conserva el contrato de la visita.
  kind: "visit_checklist" | "trip_checklist" = "visit_checklist"
): Promise<Checklist | null> {
  const { items } = await api<{ items: RecordTaskDto[] }>(
    `/api/records/${recordId}/tasks?type=${encodeURIComponent(recordType)}`
  );
  const latest = items.find((task) => task.kind === kind);
  return latest ? toChecklist(latest) : null;
}

function toChecklist(task: RecordTaskDto): Checklist {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    scheduledAt: task.scheduledAt ?? null,
    completedAt: task.completedAt,
    items: task.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ id: item.id, label: item.label, reason: item.reason, done: item.done })),
  };
}

/**
 * Fecha de la cita en "YYYY-MM-DD" o null. El servidor guarda el día a las
 * 00:00Z y aquí se lee por las partes UTC del ISO: así el día elegido no se
 * corre al cambiar de zona horaria.
 */
export function setChecklistSchedule(taskId: string, scheduledOn: string | null): Promise<unknown> {
  return api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ scheduledOn }),
  });
}

export type Appointment = {
  id: string;
  recordType: string;
  recordId: string;
  kind: string;
  title: string;
  scheduledAt: string;
  completedAt: string | null;
  itemsTotal: number;
  itemsDone: number;
  recordTitle: string | null;
};

/** Vista de citas (C6i4): tareas con fecha, últimos 30 días en adelante. */
export async function fetchAppointments(): Promise<Appointment[]> {
  const { items } = await api<{ items: Appointment[] }>("/api/tasks");
  return items;
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
