import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import {
  createRecordTask,
  createVisitChecklistForRecord,
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
    const items = Array.isArray(body.items) ? (body.items as StructuredTaskItemInput[]) : [];
    const title = typeof body.title === "string" ? body.title : undefined;
    // Los checklists de visita/viaje son DIARIOS e idempotentes (mismo contrato
    // que el bot): un doble toque en el CTA de la ficha devuelve el existente
    // en vez de duplicarlo. El título por defecto lo pone el helper según kind.
    const task =
      kind === "visit_checklist" || kind === "trip_checklist"
        ? await createVisitChecklistForRecord(userId, { recordType, recordId: id, title, items, kind })
        : await createRecordTask(userId, { recordType, recordId: id, kind, title: title ?? "Seguimiento", items });
    return NextResponse.json({ task, created: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
