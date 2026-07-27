import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { CHAT_LIMITS } from "@/lib/chat/config";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { messagePreview, sanitizeMessageBody } from "@/lib/chat/util";
import { messageDto } from "@/lib/chat/serialize";
import { notifyConversation } from "@/lib/chat/gateway";
import { deleteObject } from "@/lib/chat/r2";

type Ctx = { params: Promise<{ id: string }> };

/** Carga el mensaje SOLO si el solicitante participa en su conversación. */
async function getMessageForUser(messageId: string, userId: string) {
  const m = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  if (!m) return null;
  const me = await getParticipantOrNull(m.conversationId, userId);
  return me ? { m, me } : null;
}

const EditInput = z.object({ body: z.string().min(1) });

/** PATCH — editar mensaje propio dentro de la ventana de edición. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const found = await getMessageForUser(id, userId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { m } = found;

  if (m.senderId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Los eventos del sistema tienen autor (el que los provocó) para que cuenten
  // como no-leídos y disparen push, pero NO son suyos para editarlos.
  if (m.kind === "SYSTEM") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (m.deletedAt) return NextResponse.json({ error: "Mensaje eliminado" }, { status: 409 });
  const ageMin = (Date.now() - m.createdAt.getTime()) / 60000;
  if (ageMin > CHAT_LIMITS.editWindowMin) {
    return NextResponse.json({ error: "Fuera de la ventana de edición" }, { status: 403 });
  }

  const parsed = EditInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = sanitizeMessageBody(parsed.data.body, CHAT_LIMITS.maxMessageChars);
  if (!body) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: { body, editedAt: new Date() },
    include: { attachments: true },
  });

  // Si era el último mensaje, refrescar el preview de la lista.
  const conv = await prisma.conversation.findUnique({
    where: { id: m.conversationId },
    select: { lastMessageAt: true },
  });
  if (conv?.lastMessageAt && conv.lastMessageAt.getTime() === m.createdAt.getTime()) {
    await prisma.conversation.update({
      where: { id: m.conversationId },
      data: { lastMessagePreview: messagePreview(m.kind, body) },
    });
  }

  // Tiempo real: sin este aviso, los demás solo verían la edición en el
  // siguiente poll lento (30-60 s con el socket abierto).
  after(() => notifyConversation(m.conversationId, userId));

  return NextResponse.json(messageDto(updated));
}

/**
 * DELETE — borrado SUAVE. El autor siempre puede; en grupos, también
 * OWNER/ADMIN (moderación). La purga física la hace el cron de retención.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const found = await getMessageForUser(id, userId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { m, me } = found;

  const isAuthor = m.senderId === userId;
  const isModerator = me.role === "OWNER" || me.role === "ADMIN";
  if (!isAuthor && !isModerator) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Borrado REAL, no solo la marca: el cuerpo sale de la BBDD y los adjuntos
  // de R2 (la expectativa del usuario al "eliminar" es que desaparezca, no que
  // quede oculto para siempre — la retención por defecto es infinita).
  const deleted = await prisma.chatMessage.update({
    where: { id },
    data: { deletedAt: new Date(), body: null },
    include: { attachments: true },
  });
  if (deleted.attachments.length > 0) {
    await prisma.chatAttachment.deleteMany({ where: { messageId: id } });
    after(() =>
      Promise.allSettled(
        deleted.attachments
          .filter((a) => !/^https?:\/\//i.test(a.url)) // solo keys de R2, no URLs legacy
          .map((a) => deleteObject(a.url))
      )
    );
  }

  // Si era el último mensaje, que la lista no siga enseñando su contenido.
  const conv = await prisma.conversation.findUnique({
    where: { id: m.conversationId },
    select: { lastMessageAt: true },
  });
  if (conv?.lastMessageAt && conv.lastMessageAt.getTime() === m.createdAt.getTime()) {
    await prisma.conversation.update({
      where: { id: m.conversationId },
      data: { lastMessagePreview: "🚫 Mensaje eliminado" },
    });
  }

  after(() => notifyConversation(m.conversationId, userId));

  return NextResponse.json(messageDto(deleted));
}
