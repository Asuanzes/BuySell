import { NextRequest, NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { conversationDto } from "@/lib/chat/serialize";
import { actorName, systemEvent } from "@/lib/chat/system";
import { buildConversationContextHeader } from "@/lib/chat/context";
import { deleteObject, groupImageKey } from "@/lib/chat/r2";
import { isProtectedName } from "@nidokey/shared";

type Ctx = { params: Promise<{ id: string }> };

const PARTICIPANT_INCLUDE = {
  participants: { include: { user: { select: { id: true, name: true, username: true, email: true, image: true } } } },
  messages: {
    where: { contextType: { not: null }, contextId: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { senderId: true, contextType: true, contextId: true, deletedAt: true, createdAt: true },
  },
} satisfies Prisma.ConversationInclude;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!(await getParticipantOrNull(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const c = await prisma.conversation.findUnique({ where: { id }, include: PARTICIPANT_INCLUDE });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const context = await buildConversationContextHeader(c, userId);
  return NextResponse.json(conversationDto(c, userId, { context }));
}

const PatchInput = z.object({
  title: z.string().min(1).max(80).optional(),
  /** Key de R2 devuelta por POST .../avatar; null = quitar la foto del grupo. */
  image: z.string().max(300).optional().nullable(),
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
    // En un GRUPO, irse es información para los que se quedan (en un 1:1 sería
    // delatar que has borrado el chat de tu lista, así que ahí no).
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { kind: true } });
    if (conversation?.kind === "GROUP") {
      // Si se va el dueño, el grupo se quedaba SIN administrador para siempre
      // (no hay forma de nombrar uno): nadie podría volver a añadir, expulsar
      // ni renombrar. Hereda el miembro más antiguo.
      if (me.role === "OWNER") {
        const heir = await prisma.conversationParticipant.findFirst({
          where: { conversationId: id, leftAt: null, userId: { not: userId } },
          orderBy: { joinedAt: "asc" },
          select: { id: true },
        });
        if (heir) {
          await prisma.conversationParticipant.update({ where: { id: heir.id }, data: { role: "OWNER" } });
        }
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true },
      });
      after(async () => {
        try {
          await systemEvent(id, userId, `👥 ${user ? actorName(user) : "Alguien"} salió del grupo.`);
        } catch (e) {
          console.error("[chat] evento de salida de grupo:", e);
        }
      });
    }
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
    const title = input.title;
    const before = await prisma.conversation.findUnique({ where: { id }, select: { title: true } });
    await prisma.conversation.update({ where: { id }, data: { title } });
    // Solo si cambia de verdad: guardar el mismo nombre no merece una burbuja.
    if (before?.title !== title) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true },
      });
      after(async () => {
        try {
          const who = user ? actorName(user) : "Alguien";
          await systemEvent(id, userId, `👥 ${who} cambió el nombre del grupo a «${title}».`);
        } catch (e) {
          console.error("[chat] evento de renombrado de grupo:", e);
        }
      });
    }
  }

  // Foto del grupo: solo OWNER/ADMIN y solo keys de ESTE grupo (las presigna
  // POST .../avatar). Sin la comprobación del prefijo, un admin podría apuntar
  // la foto a la key de otro (avatares ajenos incluidos).
  if (input.image !== undefined) {
    if (me.role === "MEMBER") {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }
    const before = await prisma.conversation.findUnique({
      where: { id },
      select: { kind: true, imageUrl: true },
    });
    // Solo grupos (el presign ya lo exige; aquí es defensa en profundidad: hoy
    // en un DIRECT nadie es OWNER/ADMIN, pero eso es un invariante ajeno).
    if (!before || before.kind !== "GROUP") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Key COMPLETA, no `startsWith`: con un prefijo suelto,
    // `avatars/group/<id>/../../chat/u/<otro>/x.jpg` pasaba el filtro y acababa
    // en la firma pública y en deleteObject.
    if (input.image !== null && !groupImageKey(id).test(input.image)) {
      return NextResponse.json({ error: "Imagen inválida" }, { status: 400 });
    }
    const stale = before.imageUrl ?? null;
    // Si no cambia, ni se escribe ni se anuncia: el evento SYSTEM sube el grupo
    // en la lista de todos y cuenta como no leído (igual que en renombrar).
    if (stale !== input.image) {
      await prisma.conversation.update({ where: { id }, data: { imageUrl: input.image } });
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true },
      });
      after(async () => {
        // La foto anterior se borra de R2 fuera del camino crítico (mismo trato
        // que el avatar de persona en PATCH /api/account).
        if (stale && groupImageKey(id).test(stale)) {
          try {
            await deleteObject(stale);
          } catch (e) {
            console.error("[chat] no se pudo borrar la foto anterior del grupo:", e);
          }
        }
        try {
          const who = user ? actorName(user) : "Alguien";
          await systemEvent(
            id,
            userId,
            input.image ? `👥 ${who} cambió la foto del grupo.` : `👥 ${who} quitó la foto del grupo.`
          );
        } catch (e) {
          console.error("[chat] evento de foto de grupo:", e);
        }
      });
    }
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
