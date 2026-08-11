import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { createRecordNote, listRecordNotes, normalizeRecordNoteType, RecordNoteApiError } from "@/lib/record-notes";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RecordNoteApiError) {
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
    const recordType = normalizeRecordNoteType(req.nextUrl.searchParams.get("type") ?? "property");
    const notes = await listRecordNotes(userId, recordType, id);
    return NextResponse.json({ items: notes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const recordType = normalizeRecordNoteType(req.nextUrl.searchParams.get("type") ?? "property");
    const body = (await req.json()) as { body?: unknown };
    const note = await createRecordNote(userId, { recordType, recordId: id, body: body.body });
    return NextResponse.json({ note, created: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
