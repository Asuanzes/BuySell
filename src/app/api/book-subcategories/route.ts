import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import {
  BookSubcategoryApiError,
  createBookSubcategory,
  listBookSubcategories,
} from "@/lib/book-subcategories";

function errorResponse(error: unknown) {
  if (error instanceof BookSubcategoryApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  throw error;
}

/** GET /api/book-subcategories — mis subcategorías con sus bookIds (para el filtro). */
export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ items: await listBookSubcategories(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/book-subcategories — crear ({ name }); 409 si ya existe, tope 30. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as { name?: unknown };
    const item = await createBookSubcategory(userId, body.name);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
