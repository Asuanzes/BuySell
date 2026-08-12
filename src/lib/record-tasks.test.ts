import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addRecordTaskItem,
  createVisitChecklistForRecord,
  RecordTaskApiError,
  updateRecordTaskItem,
  type RecordTaskKind,
  type RecordTaskView,
} from "./record-tasks";

type StoredTask = RecordTaskView;

function makeDb() {
  const tasks: StoredTask[] = [];
  let taskSeq = 0;
  let itemSeq = 0;
  const cloneTask = (task: StoredTask) => ({ ...task, items: task.items.map((item) => ({ ...item })).sort((a, b) => a.sortOrder - b.sortOrder) });
  const findTask = (where: any) =>
    tasks.find((task) => {
      if (where.id !== undefined && task.id !== where.id) return false;
      if (where.userId !== undefined && task.userId !== where.userId) return false;
      if (where.recordType !== undefined && task.recordType !== where.recordType) return false;
      if (where.recordId !== undefined && task.recordId !== where.recordId) return false;
      if (where.kind !== undefined && task.kind !== where.kind) return false;
      if (where.createdAt?.gte && new Date(task.createdAt) < where.createdAt.gte) return false;
      if (where.createdAt?.lt && new Date(task.createdAt) >= where.createdAt.lt) return false;
      return true;
    });

  return {
    tasks,
    recordTask: {
      findFirst: async ({ where, select }: any) => {
        const task = findTask(where);
        if (!task) return null;
        if (select) return { id: task.id };
        return cloneTask(task);
      },
      findMany: async ({ where }: any) => tasks.filter((task) => task.userId === where.userId && task.recordType === where.recordType && task.recordId === where.recordId).map(cloneTask),
      create: async ({ data }: any) => {
        const task: StoredTask = {
          id: `t${++taskSeq}`,
          userId: data.userId,
          recordType: data.recordType,
          recordId: data.recordId,
          kind: data.kind as RecordTaskKind,
          title: data.title,
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          updatedAt: new Date("2026-08-10T12:00:00.000Z"),
          completedAt: null,
          items: data.items.create.map((item: any) => ({
            id: `i${++itemSeq}`,
            taskId: `t${taskSeq}`,
            label: item.label,
            reason: item.reason ?? null,
            done: false,
            sortOrder: item.sortOrder,
            createdAt: new Date("2026-08-10T12:00:00.000Z"),
            doneAt: null,
          })),
        };
        tasks.push(task);
        return cloneTask(task);
      },
      update: async ({ where, data }: any) => {
        const task = tasks.find((candidate) => candidate.id === where.id);
        if (!task) throw new Error("missing task");
        if ("completedAt" in data) task.completedAt = data.completedAt;
        return cloneTask(task);
      },
    },
    recordTaskItem: {
      create: async ({ data }: any) => {
        const task = tasks.find((candidate) => candidate.id === data.taskId);
        if (!task) throw new Error("missing task");
        const item = {
          id: `i${++itemSeq}`,
          taskId: data.taskId,
          label: data.label,
          reason: data.reason ?? null,
          done: false,
          sortOrder: data.sortOrder,
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          doneAt: null,
        };
        task.items.push(item);
        return { ...item };
      },
      update: async ({ where, data }: any) => {
        for (const task of tasks) {
          const item = task.items.find((candidate) => candidate.id === where.id);
          if (!item) continue;
          if ("done" in data) item.done = data.done;
          if ("doneAt" in data) item.doneAt = data.doneAt;
          if ("label" in data) item.label = data.label;
          return { ...item };
        }
        throw new Error("missing item");
      },
      deleteMany: async ({ where }: any) => {
        const task = tasks.find((candidate) => candidate.id === where.taskId);
        if (!task) return { count: 0 };
        const before = task.items.length;
        task.items = task.items.filter((item) => item.id !== where.id);
        return { count: before - task.items.length };
      },
    },
  };
}

test("visit checklist creation is idempotent per UTC day", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true, now: () => new Date("2026-08-10T08:00:00.000Z") };
  const first = await createVisitChecklistForRecord("u1", { recordType: "property", recordId: "p1", items: [{ label: "Pedir gastos", reason: "faltan" }] }, deps);
  const second = await createVisitChecklistForRecord("u1", { recordType: "property", recordId: "p1", items: [{ label: "Otro item" }] }, deps);

  assert.equal(first.id, second.id);
  assert.equal(db.tasks.length, 1);
  assert.equal(second.items[0].label, "Pedir gastos");
});

test("C8: el checklist de VIAJE es independiente del de visita el mismo día (idempotencia por kind)", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true, now: () => new Date("2026-08-10T08:00:00.000Z") };
  const visit = await createVisitChecklistForRecord("u1", { recordType: "holiday", recordId: "h1", items: [{ label: "A" }] }, deps);
  const trip = await createVisitChecklistForRecord("u1", { recordType: "holiday", recordId: "h1", items: [{ label: "B" }], kind: "trip_checklist" }, deps);
  const tripAgain = await createVisitChecklistForRecord("u1", { recordType: "holiday", recordId: "h1", items: [{ label: "C" }], kind: "trip_checklist" }, deps);

  assert.notEqual(visit.id, trip.id);
  assert.equal(trip.id, tripAgain.id);
  assert.equal(db.tasks.length, 2);
  assert.equal(trip.title, "Checklist de viaje");
});

test("items can be toggled and custom items are appended", async () => {
  const db = makeDb();
  const deps = { prisma: db as any, ownsRecord: async () => true, now: () => new Date("2026-08-10T08:00:00.000Z") };
  const task = await createVisitChecklistForRecord("u1", { recordType: "property", recordId: "p1", items: [{ label: "Pedir ano" }] }, deps);

  const added = await addRecordTaskItem("u1", task.id, "Medir ruido en portal", "nota propia", deps);
  assert.equal(added.sortOrder, 1);

  const done = await updateRecordTaskItem("u1", task.id, task.items[0].id, { done: true }, deps);
  assert.equal(done.done, true);
  assert.ok(done.doneAt);

  const undone = await updateRecordTaskItem("u1", task.id, task.items[0].id, { done: false }, deps);
  assert.equal(undone.done, false);
  assert.equal(undone.doneAt, null);
});

test("foreign records are hidden as 404", async () => {
  const db = makeDb();
  await assert.rejects(
    createVisitChecklistForRecord("u1", { recordType: "property", recordId: "p-ajeno", items: [{ label: "Pedir gastos" }] }, { prisma: db as any, ownsRecord: async () => false }),
    (error) => error instanceof RecordTaskApiError && error.status === 404
  );
});

test("completing every visit checklist item emits one completion event", async () => {
  const db = makeDb();
  const events: any[] = [];
  const deps = {
    prisma: db as any,
    ownsRecord: async () => true,
    createEvent: async (event: any) => {
      events.push(event);
    },
    now: () => new Date("2026-08-10T08:00:00.000Z"),
  };
  const task = await createVisitChecklistForRecord(
    "u1",
    { recordType: "property", recordId: "p1", items: [{ label: "Uno" }, { label: "Dos" }] },
    deps
  );

  await updateRecordTaskItem("u1", task.id, task.items[0].id, { done: true }, deps);
  assert.equal(events.length, 0);
  await updateRecordTaskItem("u1", task.id, task.items[1].id, { done: true }, deps);

  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "visit_checklist_done");
  assert.equal(events[0].idempotencyKey, `visit-checklist-done:${task.id}`);
});
