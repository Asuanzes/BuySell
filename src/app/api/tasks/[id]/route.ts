import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { RecordTaskApiError, setRecordTaskSchedule } from "@/lib/record-tasks";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RecordTaskApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  throw error;
}

/** PATCH /api/tasks/[id] — pone o quita la fecha de cita ({ scheduledOn: "YYYY-MM-DD" | null }). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { scheduledOn?: unknown };
    if (!("scheduledOn" in body)) {
      return NextResponse.json({ error: "scheduledOn es obligatorio (YYYY-MM-DD o null)" }, { status: 400 });
    }
    const task = await setRecordTaskSchedule(userId, id, body.scheduledOn);
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
