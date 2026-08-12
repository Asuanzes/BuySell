import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { loadBaseRecordsForItems } from "@/lib/decisions";
import { listScheduledTasks, RecordTaskApiError } from "@/lib/record-tasks";

/**
 * GET /api/tasks — la vista de citas (C6i4): tareas del usuario CON fecha,
 * últimos 30 días en adelante, con el título del registro materializado con el
 * mismo helper owner-scoped que usan los espacios de decisión (un registro
 * ajeno o borrado sale como record null y el cliente enseña solo la tarea).
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const tasks = await listScheduledTasks(userId);
    const records = await loadBaseRecordsForItems(
      prisma,
      userId,
      tasks.map((task) => ({ recordType: task.recordType, recordId: task.recordId }))
    );
    const items = tasks.map((task) => {
      const record = records.get(`${task.recordType}\0${task.recordId}`) ?? null;
      return {
        id: task.id,
        recordType: task.recordType,
        recordId: task.recordId,
        kind: task.kind,
        title: task.title,
        scheduledAt: task.scheduledAt,
        completedAt: task.completedAt,
        itemsTotal: task.items.length,
        itemsDone: task.items.filter((item) => item.done).length,
        recordTitle: record?.title ?? null,
      };
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof RecordTaskApiError) {
      return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
    }
    throw error;
  }
}
