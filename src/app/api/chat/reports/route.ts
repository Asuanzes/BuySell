import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/chat/reports — denunciar un mensaje, una conversación o un usuario
 * (requisito de Play/App Store para apps con contenido generado por usuarios).
 *
 * Evidencia mínima: si se denuncia un mensaje, se congela su cuerpo en
 * `snapshot` — el denunciado puede editarlo o borrarlo después y la denuncia
 * debe seguir siendo revisable. Retención limitada: el cron chat-cleanup purga
 * denuncias de más de 180 días.
 */

const Input = z.object({
  category: z.enum(["spam", "scam", "harassment", "inappropriate", "other"]),
  messageId: z.string().min(1).max(64).optional().nullable(),
  conversationId: z.string().min(1).max(64).optional().nullable(),
  targetUserId: z.string().min(1).max(64).optional().nullable(),
  comment: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const userId = await requireUserId();

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (!input.messageId && !input.conversationId && !input.targetUserId) {
    return NextResponse.json({ error: "Falta el objetivo de la denuncia" }, { status: 400 });
  }

  const limit = await rateLimit("chat-report", userId, { limit: 20, windowMs: 24 * 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas denuncias hoy" }, { status: 429 });
  }

  let snapshot: string | null = null;
  let conversationId = input.conversationId ?? null;
  let targetUserId = input.targetUserId ?? null;

  // Denuncia de MENSAJE: debe existir y el denunciante debe ser participante
  // de su conversación (no se pueden denunciar mensajes que no puedes ver).
  if (input.messageId) {
    const m = await prisma.chatMessage.findUnique({
      where: { id: input.messageId },
      select: { id: true, conversationId: true, senderId: true, body: true, kind: true },
    });
    if (!m || !(await getParticipantOrNull(m.conversationId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (m.senderId === userId) {
      return NextResponse.json({ error: "No puedes denunciar tu propio mensaje" }, { status: 400 });
    }
    snapshot = m.body ?? `(${m.kind.toLowerCase()})`;
    conversationId = m.conversationId;
    targetUserId = targetUserId ?? m.senderId;
  } else if (conversationId) {
    // Denuncia de CONVERSACIÓN: también exige ser participante.
    if (!(await getParticipantOrNull(conversationId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  if (targetUserId === userId) {
    return NextResponse.json({ error: "No puedes denunciarte a ti" }, { status: 400 });
  }

  await prisma.chatReport.create({
    data: {
      reporterId: userId,
      targetUserId,
      messageId: input.messageId ?? null,
      conversationId,
      category: input.category,
      comment: input.comment ?? null,
      snapshot,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
