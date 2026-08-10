import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import {
  createRecordTask,
  listRecordTasks,
  normalizeRecordTaskKind,
  normalizeRecordTaskType,
  RecordTaskApiError,
  type StructuredTaskItemInput,
} from "@/lib/record-tasks";

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

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const recordType = normalizeRecordTaskType(req.nextUrl.searchParams.get("type") ?? "property");
    const tasks = await listRecordTasks(userId, recordType, id);
    return NextResponse.json({ items: tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const recordType = normalizeRecordTaskType(req.nextUrl.searchParams.get("type") ?? "property");
    const body = (await req.json()) as {
      kind?: unknown;
      title?: unknown;
      items?: unknown;
    };
    const kind = normalizeRecordTaskKind(body.kind ?? "followup");
    const title = typeof body.title === "string" ? body.title : kind === "visit_checklist" ? "Checklist de visita" : "Seguimiento";
    const items = Array.isArray(body.items) ? (body.items as StructuredTaskItemInput[]) : [];
    const task = await createRecordTask(userId, { recordType, recordId: id, kind, title, items });
    return NextResponse.json({ task, created: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
