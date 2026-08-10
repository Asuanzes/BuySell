import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { deleteRecordTaskItem, RecordTaskApiError, updateRecordTaskItem } from "@/lib/record-tasks";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RecordTaskApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  throw error;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { done?: unknown; label?: unknown };
    const patch: { done?: boolean; label?: string } = {};
    if (typeof body.done === "boolean") patch.done = body.done;
    if (typeof body.label === "string") patch.label = body.label;
    const item = await updateRecordTaskItem(userId, id, itemId, patch);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id, itemId } = await params;
    const userId = await requireUserId();
    const result = await deleteRecordTaskItem(userId, id, itemId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
