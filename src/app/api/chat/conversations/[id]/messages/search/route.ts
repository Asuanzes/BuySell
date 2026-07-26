import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { rateLimit } from "@/lib/rate-limit";
import { truncateSafe } from "@/lib/chat/util";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/chat/conversations/[id]/messages/search?q= — búsqueda de texto
 * dentro de UNA conversación (solo participantes). Devuelve los 20 más
 * recientes que contienen la query (case-insensitive), con snippet.
 *
 * Deliberadamente simple: ILIKE con contains sobre la conversación (acotado
 * por el índice de conversationId). Búsqueda GLOBAL multi-chat queda para
 * cuando haya volumen que la justifique (necesitaría tsvector).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!(await getParticipantOrNull(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (q.length > 120) return NextResponse.json({ error: "Búsqueda demasiado larga" }, { status: 400 });

  const limit = await rateLimit("chat-search", userId, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas búsquedas, espera un momento" }, { status: 429 });
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId: id,
      deletedAt: null,
      body: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: { id: true, senderId: true, body: true, createdAt: true },
  });

  return NextResponse.json({
    results: rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      snippet: truncateSafe(m.body ?? "", 120),
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
