import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { conversationDto } from "@/lib/chat/serialize";
import { contextCard } from "@/lib/chat/context";
import { isProtectedName } from "@nidokey/shared";

type Ctx = { params: Promise<{ id: string }> };

const PARTICIPANT_INCLUDE = {
  participants: { include: { user: { select: { id: true, name: true, username: true, email: true, image: true } } } },
} as const;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!(await getParticipantOrNull(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const c = await prisma.conversation.findUnique({ where: { id }, include: PARTICIPANT_INCLUDE });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const context = await contextCard(
    c.contextType,
    c.contextId,
    c.participants.map((p) => p.userId)
  );
  return NextResponse.json(conversationDto(c, userId, { context }));
}

const PatchInput = z.object({
  title: z.string().min(1).max(80).optional(),
  muteUntil: z.coerce.date().optional().nullable(),
  pinned: z.boolean().optional(),
  /** true = salir de la conversación (desaparece de mi lista). */
  leave: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const me = await getParticipantOrNull(id, userId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = PatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.leave) {
    await prisma.conversationParticipant.update({
      where: { id: me.id },
      data: { leftAt: new Date() },
    });
    return NextResponse.json({ ok: true, left: true });
  }

  // Renombrar grupo: solo OWNER/ADMIN. El título pasa el filtro anti-suplantación
  // (un grupo llamado "Nidokey" haría que el push pareciera del asistente oficial).
  if (input.title !== undefined) {
    if (me.role === "MEMBER") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }
    if (isProtectedName(input.title)) {
      return NextResponse.json({ error: "Ese nombre no está disponible" }, { status: 400 });
    }
    await prisma.conversation.update({ where: { id }, data: { title: input.title } });
  }

  // Preferencias propias (mute/pin) — siempre permitidas.
  const myPatch: Record<string, unknown> = {};
  if (input.muteUntil !== undefined) myPatch.muteUntil = input.muteUntil;
  if (input.pinned !== undefined) myPatch.pinnedAt = input.pinned ? new Date() : null;
  if (Object.keys(myPatch).length) {
    await prisma.conversationParticipant.update({ where: { id: me.id }, data: myPatch });
  }

  const c = await prisma.conversation.findUnique({ where: { id }, include: PARTICIPANT_INCLUDE });
  return NextResponse.json(conversationDto(c!, userId));
}
