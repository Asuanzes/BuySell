import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { BookSubcategoryApiError, setBookSubcategoriesForBook } from "@/lib/book-subcategories";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/records/[id]/subcategories?type=book — reemplaza el conjunto de
 * subcategorías del libro ({ subcategoryIds }). Solo libros de momento
 * (decisión C7): otros type responden 400 explícito, no silencio.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const type = req.nextUrl.searchParams.get("type") ?? "book";
    if (type !== "book") {
      return NextResponse.json({ error: "Las subcategorías personalizadas solo existen en libros (de momento)." }, { status: 400 });
    }
    const body = (await req.json()) as { subcategoryIds?: unknown };
    const result = await setBookSubcategoriesForBook(userId, id, body.subcategoryIds);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BookSubcategoryApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    throw error;
  }
}
