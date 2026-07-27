import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { CHAT_FLAGS, CHAT_LIMITS } from "@/lib/chat/config";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { conversationDto } from "@/lib/chat/serialize";
import { actorName, systemEvent } from "@/lib/chat/system";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Miembros de un GRUPO: añadir y expulsar. Sin esto la membresía quedaba
 * congelada en el momento de crearlo y quien salía no podía volver nunca.
 *
 * Solo OWNER/ADMIN (mismo criterio que la moderación de mensajes, que ya
 * distingue esos roles). Todo cambio deja un mensaje SYSTEM en el hilo: es el
 * único registro de qué pasó en el grupo, y además sube la conversación en la
 * lista de todos.
 */

type Ctx = { params: Promise<{ id: string }> };

const PARTICIPANT_INCLUDE = {
  participants: { include: { user: { select: { id: true, name: true, username: true, email: true, image: true } } } },
} as const;

/** Carga la conversación y comprueba que soy admin de un GRUPO. */
async function requireGroupAdmin(conversationId: string, userId: string) {
  // El kill-switch va aquí para que lo compartan POST y DELETE: con el chat
  // apagado en caliente no debe seguir moviéndose gente ni publicándose
  // eventos SYSTEM.
  if (!CHAT_FLAGS.enabled || !CHAT_FLAGS.groups) {
    return { error: NextResponse.json({ error: "Grupos desactivados" }, { status: 403 }) } as const;
  }
  const me = await getParticipantOrNull(conversationId, userId);
  // 404 uniforme: no revelamos la existencia de conversaciones ajenas.
  if (!me) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, kind: true, title: true },
  });
  if (!conversation || conversation.kind !== "GROUP") {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  if (me.role === "MEMBER") {
    return { error: NextResponse.json({ error: "Solo administradores" }, { status: 403 }) } as const;
  }
  return { me, conversation } as const;
}

const AddInput = z.object({ userIds: z.array(z.string().min(1)).min(1).max(64) });

/** POST — añadir miembros (o readmitir a quien se fue). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const guard = await requireGroupAdmin(id, userId);
  if ("error" in guard) return guard.error;

  const parsed = AddInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Petición inválida" }, { status: 400 });

  // Misma cuota que crear conversaciones: añadir en masa también genera chats
  // no solicitados en la lista de las víctimas.
  const limit = await rateLimit("chat-conv-create", userId, { limit: 30, windowMs: 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas conversaciones nuevas, espera un rato" }, { status: 429 });
  }

  const wanted = Array.from(new Set(parsed.data.userIds.filter((u) => u !== userId)));
  if (wanted.length === 0) return NextResponse.json({ error: "Faltan participantes" }, { status: 400 });

  const existing = await prisma.conversationParticipant.findMany({
    where: { conversationId: id, userId: { in: wanted } },
    select: { userId: true, leftAt: true },
  });
  const activeIds = new Set(existing.filter((p) => !p.leftAt).map((p) => p.userId));
  const toAdd = wanted.filter((u) => !activeIds.has(u));
  if (toAdd.length === 0) {
    return NextResponse.json({ error: "Ya están en el grupo" }, { status: 400 });
  }

  const users = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { id: true, name: true, username: true, email: true } });
  if (users.length !== toAdd.length) {
    return NextResponse.json({ error: "Participante desconocido" }, { status: 400 });
  }

  // Bloqueos: sin esto, un admin puede meter en el grupo a alguien que le
  // bloqueó (o a quien él bloqueó) y saltarse el veto.
  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: toAdd } },
        { blockerId: { in: toAdd }, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  // 403 genérico: no revelamos quién bloqueó a quién.
  if (blocked) return NextResponse.json({ error: "No disponible" }, { status: 403 });

  // Contar y dar de alta en la MISMA transacción, con la fila de la
  // conversación bloqueada: con el count fuera, dos admins simultáneos leían
  // ambos "caben" y el grupo acababa por encima del tope (y nada lo revisa
  // después). El lock serializa las altas de ESTA conversación, nada más.
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${id} FOR UPDATE`;
      const activeCount = await tx.conversationParticipant.count({
        where: { conversationId: id, leftAt: null },
      });
      if (activeCount + toAdd.length > CHAT_LIMITS.maxGroupParticipants) {
        throw new Error("FULL");
      }
      for (const uid of toAdd) {
        // Readmitir = limpiar leftAt (hay unique (conversationId,userId):
        // crear otra fila reventaría). `joinedAt` se REINICIA: el historial se
        // sirve desde ahí, así que expulsar sigue protegiendo lo hablado
        // durante la ausencia. `lastReadAt` evita un badge con todo el hilo.
        await tx.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId: id, userId: uid } },
          create: { conversationId: id, userId: uid, role: "MEMBER", lastReadAt: now },
          update: { leftAt: null, role: "MEMBER", joinedAt: now, lastReadAt: now },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FULL") {
      return NextResponse.json({ error: "Demasiados participantes" }, { status: 400 });
    }
    throw e;
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, email: true },
  });
  const who = actor ? actorName(actor) : "Alguien";
  const names = users.map((u) => actorName(u)).join(", ");
  after(async () => {
    try {
      await systemEvent(id, userId, `👥 ${who} añadió a ${names}.`, true);
    } catch (e) {
      console.error("[chat] evento de añadir miembros:", e);
    }
  });

  const c = await prisma.conversation.findUnique({ where: { id }, include: PARTICIPANT_INCLUDE });
  return NextResponse.json(conversationDto(c!, userId), { status: 200 });
}

const RemoveInput = z.object({ userId: z.string().min(1) });

/** DELETE — expulsar a un miembro (para salirme yo está PATCH { leave: true }). */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();

  const guard = await requireGroupAdmin(id, userId);
  if ("error" in guard) return guard.error;

  const parsed = RemoveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  const targetId = parsed.data.userId;

  // Sin cuota, expulsar y readmitir en bucle genera eventos SYSTEM y avisos al
  // gateway sin freno (el POST sí la tenía: la asimetría era el agujero).
  const limit = await rateLimit("chat-kick", userId, { limit: 30, windowMs: 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiados cambios seguidos, espera un rato" }, { status: 429 });
  }

  if (targetId === userId) {
    return NextResponse.json({ error: "Para salirte usa Salir del grupo" }, { status: 400 });
  }

  const target = await prisma.conversationParticipant.findFirst({
    where: { conversationId: id, userId: targetId, leftAt: null },
    include: { user: { select: { name: true, username: true, email: true } } },
  });
  if (!target) return NextResponse.json({ error: "No está en el grupo" }, { status: 404 });
  // El dueño no se expulsa: si no, un ADMIN podría descabezar el grupo.
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "No se puede expulsar al creador" }, { status: 403 });
  }

  await prisma.conversationParticipant.update({
    where: { id: target.id },
    data: { leftAt: new Date() },
  });

  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true, email: true } });
  const who = actor ? actorName(actor) : "Alguien";
  after(async () => {
    try {
      await systemEvent(id, userId, `👥 ${who} sacó del grupo a ${actorName(target.user)}.`);
    } catch (e) {
      console.error("[chat] evento de expulsar miembro:", e);
    }
  });

  const c = await prisma.conversation.findUnique({ where: { id }, include: PARTICIPANT_INCLUDE });
  return NextResponse.json(conversationDto(c!, userId), { status: 200 });
}
