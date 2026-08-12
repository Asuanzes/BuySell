import { test } from "node:test";
import assert from "node:assert/strict";

import {
  listScheduledTasks,
  normalizeScheduledOn,
  RecordTaskApiError,
  setRecordTaskSchedule,
  type RecordTaskView,
} from "./record-tasks";

/*
 * C6i4 vista de citas. La cita es SOLO día (00:00Z del YYYY-MM-DD elegido,
 * decisión D6-01: vista de citas, no agenda): estos tests fijan la
 * normalización, el owner-scoping del PATCH y que las completadas SÍ salen
 * (completedAt = checklist lleno, no visita pasada — revisión Codex c33bcb0e,
 * matiz rechazado con razón).
 */

function makeDb(tasks: RecordTaskView[]) {
  return {
    recordTask: {
      findFirst: async ({ where }: any) => {
        const task = tasks.find((t) => t.id === where.id && t.userId === where.userId);
        return task ? { id: task.id } : null;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        void orderBy;
        return tasks
          .filter((t) => t.userId === where.userId && t.scheduledAt != null && new Date(t.scheduledAt) >= where.scheduledAt.gte)
          .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
          .slice(0, take);
      },
      update: async ({ where, data }: any) => {
        const task = tasks.find((t) => t.id === where.id)!;
        if ("scheduledAt" in data) task.scheduledAt = data.scheduledAt;
        return { ...task };
      },
    },
    recordTaskItem: {},
  };
}

function makeTask(over: Partial<RecordTaskView>): RecordTaskView {
  return {
    id: "t1",
    userId: "u1",
    recordType: "property",
    recordId: "p1",
    kind: "visit_checklist",
    title: "Checklist de visita",
    scheduledAt: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    completedAt: null,
    items: [],
    ...over,
  };
}

test("normalizeScheduledOn: día válido → 00:00Z; null/'' → null; formatos y fechas imposibles → 400", () => {
  assert.equal(normalizeScheduledOn("2026-08-15")!.toISOString(), "2026-08-15T00:00:00.000Z");
  assert.equal(normalizeScheduledOn(null), null);
  assert.equal(normalizeScheduledOn(""), null);
  for (const bad of ["15/08/2026", "2026-8-15", "2026-02-31", "hoy", 20260815]) {
    assert.throws(() => normalizeScheduledOn(bad), RecordTaskApiError, String(bad));
  }
});

test("setRecordTaskSchedule: pone y quita fecha; tarea ajena → 404", async () => {
  const tasks = [makeTask({})];
  const deps = { prisma: makeDb(tasks) as any };

  const updated = await setRecordTaskSchedule("u1", "t1", "2026-08-20", deps);
  assert.equal(new Date(updated.scheduledAt!).toISOString(), "2026-08-20T00:00:00.000Z");

  const cleared = await setRecordTaskSchedule("u1", "t1", null, deps);
  assert.equal(cleared.scheduledAt, null);

  await assert.rejects(() => setRecordTaskSchedule("u2", "t1", "2026-08-20", deps), (e: unknown) => {
    assert.ok(e instanceof RecordTaskApiError);
    assert.equal(e.status, 404);
    return true;
  });
});

test("listScheduledTasks: solo con fecha dentro del horizonte, orden ascendente, completadas incluidas", async () => {
  const now = () => new Date("2026-08-12T12:00:00.000Z");
  const tasks = [
    makeTask({ id: "old", scheduledAt: new Date("2026-06-01T00:00:00.000Z") }), // fuera del horizonte de 30 días
    makeTask({ id: "none", scheduledAt: null }),
    makeTask({ id: "done", scheduledAt: new Date("2026-08-14T00:00:00.000Z"), completedAt: new Date() }),
    makeTask({ id: "soon", scheduledAt: new Date("2026-08-13T00:00:00.000Z") }),
    makeTask({ id: "other-user", userId: "u2", scheduledAt: new Date("2026-08-13T00:00:00.000Z") }),
  ];
  const items = await listScheduledTasks("u1", { prisma: makeDb(tasks) as any, now });
  assert.deepEqual(
    items.map((t) => t.id),
    ["soon", "done"]
  );
});
