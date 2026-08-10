import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { addRecordTaskItem, RecordTaskApiError } from "@/lib/record-tasks";

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

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { label?: unknown; reason?: unknown };
    const item = await addRecordTaskItem(userId, id, body.label as string, typeof body.reason === "string" ? body.reason : null);
    return NextResponse.json({ item, created: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
