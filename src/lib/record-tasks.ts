import type { Prisma } from "@prisma/client";

import type { RecordType } from "@nidokey/shared";

import { prisma as defaultPrisma } from "@/lib/db";
import { createRecordEvent } from "@/lib/record-events";
import { ownsRecord } from "@/lib/records/access";

export type RecordTaskKind = "visit_checklist" | "followup";

export type StructuredTaskItemInput = {
  key?: string;
  label: string;
  reason?: string | null;
};

export type RecordTaskItemView = {
  id: string;
  label: string;
  reason: string | null;
  done: boolean;
  sortOrder: number;
  createdAt: string | Date;
  doneAt: string | Date | null;
};

export type RecordTaskView = {
  id: string;
  userId: string;
  /** Soft-ref: en la columna es texto libre, así que aquí también. Quien
   *  necesite estrecharlo pasa por `normalizeRecordTaskType`. */
  recordType: string;
  recordId: string;
  kind: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  completedAt: string | Date | null;
  items: RecordTaskItemView[];
};

/**
 * Solo los dos delegados que se usan, TIPADOS contra el cliente real: aquí se
 * escriben campos owner-scoped, así que un nombre mal escrito tiene que ser
 * error de compilación y no un fallo en producción (el `db push` ya pasó, o
 * sea que el esquema no avisaría). Los dobles de los tests hacen el cast ellos.
 */
type TaskDb = Pick<typeof defaultPrisma, "recordTask" | "recordTaskItem">;

type Deps = {
  prisma?: TaskDb;
  ownsRecord?: (type: RecordType, id: string, userId: string) => Promise<boolean>;
  createEvent?: typeof createRecordEvent;
  now?: () => Date;
};

export class RecordTaskApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
  }
}

const ACTIVE_TASK_RECORD_TYPES = new Set<RecordType>(["property", "holiday", "crypto", "market", "job", "book"]);

function db(deps?: Deps): TaskDb {
  return deps?.prisma ?? defaultPrisma;
}

function todayRange(now: Date): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

export function visitChecklistDoneEventKey(taskId: string): string {
  return `visit-checklist-done:${taskId}`;
}

export function normalizeRecordTaskKind(value: unknown): RecordTaskKind {
  if (value === "visit_checklist" || value === "followup") return value;
  throw new RecordTaskApiError(400, "kind debe ser visit_checklist o followup");
}

export function normalizeRecordTaskType(value: unknown): RecordType {
  if (typeof value !== "string" || !ACTIVE_TASK_RECORD_TYPES.has(value as RecordType)) {
    throw new RecordTaskApiError(400, "type no soportado");
  }
  return value as RecordType;
}

function cleanLabel(value: unknown): string {
  if (typeof value !== "string") throw new RecordTaskApiError(400, "label es obligatorio");
  const label = value.trim().replace(/\s+/g, " ").slice(0, 220);
  if (!label) throw new RecordTaskApiError(400, "label es obligatorio");
  return label;
}

function cleanReason(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ").slice(0, 280);
  return reason || null;
}

function normalizeItems(items: StructuredTaskItemInput[]): StructuredTaskItemInput[] {
  return items
    .map((item) => ({ key: item.key, label: cleanLabel(item.label), reason: cleanReason(item.reason) }))
    .filter((item, index, arr) => arr.findIndex((other) => other.label === item.label) === index)
    .slice(0, 24);
}

async function assertOwnsRecord(userId: string, recordType: RecordType, recordId: string, deps?: Deps): Promise<void> {
  if (!(await (deps?.ownsRecord ?? ownsRecord)(recordType, recordId, userId))) {
    throw new RecordTaskApiError(404, "Not found");
  }
}

// `satisfies` y no `as const`: hace falta que "asc" no se ensanche a string
// (Prisma rechazaría el orderBy) pero SIN volverlo readonly, que Prisma también
// rechaza. Esta era una de las dos razones por las que el módulo nació con `any`.
const INCLUDE_ITEMS = {
  items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.RecordTaskInclude;

function includeItems() {
  return INCLUDE_ITEMS;
}

export async function listRecordTasks(userId: string, recordType: RecordType, recordId: string, deps?: Deps): Promise<RecordTaskView[]> {
  await assertOwnsRecord(userId, recordType, recordId, deps);
  return db(deps).recordTask.findMany({
    where: { userId, recordType, recordId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: includeItems(),
  });
}

export async function createRecordTask(
  userId: string,
  input: { recordType: RecordType; recordId: string; kind: RecordTaskKind; title: string; items?: StructuredTaskItemInput[] },
  deps?: Deps
): Promise<RecordTaskView> {
  await assertOwnsRecord(userId, input.recordType, input.recordId, deps);
  const items = normalizeItems(input.items ?? []);
  const title = cleanLabel(input.title);
  const data = {
    userId,
    recordType: input.recordType,
    recordId: input.recordId,
    kind: input.kind,
    title,
    items: { create: items.map((item, sortOrder) => ({ label: item.label, reason: item.reason ?? null, sortOrder })) },
  };
  return db(deps).recordTask.create({ data, include: includeItems() });
}

export async function createVisitChecklistForRecord(
  userId: string,
  input: { recordType: RecordType; recordId: string; title?: string; items: StructuredTaskItemInput[] },
  deps?: Deps
): Promise<RecordTaskView> {
  await assertOwnsRecord(userId, input.recordType, input.recordId, deps);
  const client = db(deps);
  const now = deps?.now?.() ?? new Date();
  const range = todayRange(now);
  const existing = await client.recordTask.findFirst({
    where: {
      userId,
      recordType: input.recordType,
      recordId: input.recordId,
      kind: "visit_checklist",
      createdAt: { gte: range.gte, lt: range.lt },
    },
    include: includeItems(),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing) return existing;
  return createRecordTask(
    userId,
    {
      recordType: input.recordType,
      recordId: input.recordId,
      kind: "visit_checklist",
      title: input.title ?? "Checklist de visita",
      items: input.items,
    },
    deps
  );
}

export async function addRecordTaskItem(userId: string, taskId: string, label: string, reason?: string | null, deps?: Deps): Promise<RecordTaskItemView> {
  const client = db(deps);
  const task = await client.recordTask.findFirst({ where: { id: taskId, userId }, include: includeItems() });
  if (!task) throw new RecordTaskApiError(404, "Not found");
  const maxOrder = task.items.reduce((max: number, item: RecordTaskItemView) => Math.max(max, item.sortOrder), -1);
  await client.recordTask.update({ where: { id: task.id }, data: { completedAt: null } });
  return client.recordTaskItem.create({
    data: { taskId: task.id, label: cleanLabel(label), reason: cleanReason(reason), sortOrder: maxOrder + 1 },
  });
}

export async function updateRecordTaskItem(
  userId: string,
  taskId: string,
  itemId: string,
  patch: { done?: boolean; label?: string },
  deps?: Deps
): Promise<RecordTaskItemView> {
  const client = db(deps);
  const task = await client.recordTask.findFirst({ where: { id: taskId, userId }, include: includeItems() });
  if (!task) throw new RecordTaskApiError(404, "Not found");
  const item = task.items.find((candidate: RecordTaskItemView) => candidate.id === itemId);
  if (!item) throw new RecordTaskApiError(404, "Not found");
  const data: Record<string, unknown> = {};
  if (typeof patch.done === "boolean") {
    data.done = patch.done;
    data.doneAt = patch.done ? (deps?.now?.() ?? new Date()) : null;
  }
  if (patch.label !== undefined) data.label = cleanLabel(patch.label);
  const updated = await client.recordTaskItem.update({ where: { id: itemId }, data });
  await maybeMarkTaskCompleted(taskId, userId, deps);
  return updated;
}

export async function deleteRecordTaskItem(userId: string, taskId: string, itemId: string, deps?: Deps): Promise<{ ok: true; deleted: number }> {
  const client = db(deps);
  const task = await client.recordTask.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!task) throw new RecordTaskApiError(404, "Not found");
  const deleted = await client.recordTaskItem.deleteMany({ where: { id: itemId, taskId } });
  await maybeMarkTaskCompleted(taskId, userId, deps);
  return { ok: true, deleted: deleted.count };
}

async function maybeMarkTaskCompleted(taskId: string, userId: string, deps?: Deps): Promise<void> {
  const client = db(deps);
  const task = await client.recordTask.findFirst({ where: { id: taskId, userId }, include: includeItems() });
  if (!task) throw new RecordTaskApiError(404, "Not found");
  const allDone = task.items.length > 0 && task.items.every((item: RecordTaskItemView) => item.done);
  const completedAt = allDone ? (task.completedAt ?? (deps?.now?.() ?? new Date())) : null;
  await client.recordTask.update({ where: { id: task.id }, data: { completedAt } });
  if (allDone && task.kind === "visit_checklist") {
    await (deps?.createEvent ?? createRecordEvent)({
      userId,
      recordType: normalizeRecordTaskType(task.recordType),
      recordId: task.recordId,
      eventType: "visit_checklist_done",
      source: "bot",
      idempotencyKey: visitChecklistDoneEventKey(task.id),
      payload: { taskId: task.id, checklistTitle: task.title },
      observedAt: completedAt ?? undefined,
    });
  }
}
