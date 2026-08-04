import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";
import { getTrendRelatedNews } from "@/features/trends/api";
import { newsLocaleFromRequest } from "@/lib/news-locale";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    await requireUserId();
    const { id } = await params;
    const res = await getTrendRelatedNews(id, req.nextUrl.searchParams, {
      locale: newsLocaleFromRequest(req).googleNews,
    });
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    if (e instanceof Error && e.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[trends-api] news error:", e);
    return NextResponse.json({ items: [], nextCursor: null });
  }
}

