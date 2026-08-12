import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import {
  BookSubcategoryApiError,
  deleteBookSubcategory,
  renameBookSubcategory,
} from "@/lib/book-subcategories";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof BookSubcategoryApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  throw error;
}

/** PATCH /api/book-subcategories/[id] — renombrar ({ name }). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { name?: unknown };
    await renameBookSubcategory(userId, id, body.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/book-subcategories/[id] — borrar (las asignaciones caen en cascada). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    await deleteBookSubcategory(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
