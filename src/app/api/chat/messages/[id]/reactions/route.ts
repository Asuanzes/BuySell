import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { aggregateReactions } from "@/lib/chat/serialize";
import { notifyConversation } from "@/lib/chat/gateway";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  // Emoji (grafema, hasta 16 unidades UTF-16: cubre ZWJ/banderas/tonos de piel).
  emoji: z.string().min(1).max(16).refine((v) => v.trim().length > 0, "vacío"),
});

/**
 * POST /api/chat/messages/[id]/reactions — TOGGLE de reacción, modelo WhatsApp
 * (una por usuario y mensaje): mismo emoji = quitar; otro = sustituir; ninguna
 * = crear. Devuelve el agregado actualizado para pintar los chips sin esperar
 * al siguiente poll.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { emoji } = parsed.data;

  // Cada toggle son 2-3 queries contra Neon: mismo tope de ráfaga que mensajes.
  const limit = await rateLimit("chat-react", userId, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas reacciones, espera un momento" }, { status: 429 });
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id },
    select: { id: true, conversationId: true, deletedAt: true },
  });
  // 404 también si no soy participante (no filtrar existencia).
  if (!message || !(await getParticipantOrNull(message.conversationId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (message.deletedAt) {
    return NextResponse.json({ error: "Mensaje eliminado" }, { status: 400 });
  }

  const existing = await prisma.chatMessageReaction.findUnique({
    where: { messageId_userId: { messageId: id, userId } },
  });
  if (existing && existing.emoji === emoji) {
    await prisma.chatMessageReaction.delete({ where: { id: existing.id } }).catch(() => {});
  } else {
    await prisma.chatMessageReaction.upsert({
      where: { messageId_userId: { messageId: id, userId } },
      create: { messageId: id, userId, emoji },
      update: { emoji },
    });
  }

  const rows = await prisma.chatMessageReaction.findMany({
    where: { messageId: id },
    select: { emoji: true, userId: true },
  });

  // Tiempo real: que la reacción aparezca en el otro lado sin esperar al poll.
  after(() => notifyConversation(message.conversationId, userId));

  return NextResponse.json({ reactions: aggregateReactions(rows, userId) });
}
