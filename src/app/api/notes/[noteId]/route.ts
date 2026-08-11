import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { deleteRecordNote, RecordNoteApiError, updateRecordNote } from "@/lib/record-notes";

type Ctx = { params: Promise<{ noteId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RecordNoteApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  throw error;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { noteId } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { body?: unknown };
    const note = await updateRecordNote(userId, noteId, body.body);
    return NextResponse.json({ note });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { noteId } = await params;
    const userId = await requireUserId();
    const result = await deleteRecordNote(userId, noteId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
