import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { CHAT_FLAGS, CHAT_LIMITS } from "@/lib/chat/config";
import { anyBlockBetween } from "@/lib/chat/guard";
import { directKey } from "@/lib/chat/util";
import { conversationDto } from "@/lib/chat/serialize";
import { unreadByConversation } from "@/lib/chat/unread";
import { ensureBotDm } from "@/lib/chat/bot";
import { recordOwnerId } from "@/lib/chat/context";
import { rateLimit } from "@/lib/rate-limit";
import { isProtectedName } from "@nidokey/shared";

const PARTICIPANT_INCLUDE = {
  participants: { include: { user: { select: { id: true, name: true, username: true, email: true, image: true } } } },
} as const;

/**
 * GET /api/chat/conversations — mis conversaciones activas, orden
 * pinned primero y luego lastMessageAt desc, con unreadCount por conversación.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!CHAT_FLAGS.enabled) return NextResponse.json({ conversations: [] });

  // El chat con Nidokey siempre presente, lo asegura cualquier cliente al listar
  // (no solo bootstrap) → así aparece en iOS aunque su bundle no llame a bootstrap.
  // Idempotente y barato (findUnique salvo la 1ª vez). No bloqueante.
  try {
    await ensureBotDm(userId);
  } catch (e) {
    console.error("[chat-bot] ensureBotDm (list):", e);
  }

  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId, leftAt: null } } },
    include: PARTICIPANT_INCLUDE,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
  });

  // No-leídos en UNA query agregada (antes: un count por conversación = N+1
  // contra Neon en cada poll de la lista).
  const unread = await unreadByConversation(
    userId,
    conversations.map((c) => c.id)
  );
  const dtos = conversations.map((c) => conversationDto(c, userId, { unreadCount: unread.get(c.id) ?? 0 }));

  // Ancladas primero (orden estable dentro de cada grupo).
  dtos.sort((a, b) => {
    const pa = a.pinnedAt ? 1 : 0;
    const pb = b.pinnedAt ? 1 : 0;
    return pb - pa;
  });

  // Recibo de ENTREGA global: el dispositivo ha descargado previews y contadores
  // de todas estas conversaciones. Throttle de 60 s para no escribir cada poll.
  after(async () => {
    const cutoff = new Date(Date.now() - 60_000);
    await prisma.conversationParticipant
      .updateMany({
        where: {
          userId,
          leftAt: null,
          OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: cutoff } }],
        },
        data: { lastDeliveredAt: new Date() },
      })
      .catch(() => {});
  });

  return NextResponse.json({ conversations: dtos });
}

const CreateInput = z.object({
  kind: z.enum(["DIRECT", "GROUP"]).default("DIRECT"),
  /** Los DEMÁS participantes (sin incluirme). DIRECT: exactamente 1. */
  participantIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(1).max(80).optional().nullable(),
  contextType: z.string().min(1).max(30).optional().nullable(),
  contextId: z.string().min(1).max(64).optional().nullable(),
});

/**
 * POST /api/chat/conversations — crea (o devuelve la existente, en DIRECT por
 * directKey). Bloqueos respetados: un usuario bloqueado no puede abrir 1:1.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!CHAT_FLAGS.enabled) return NextResponse.json({ error: "Chat desactivado" }, { status: 503 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const otherIds = Array.from(new Set(input.participantIds.filter((id) => id !== userId)));
  if (otherIds.length === 0) {
    return NextResponse.json({ error: "Faltan participantes" }, { status: 400 });
  }

  // Cuota de creación: sin tope, un hostil llena la lista de sus víctimas.
  const limit = await rateLimit("chat-conv-create", userId, { limit: 30, windowMs: 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas conversaciones nuevas, espera un rato" }, { status: 429 });
  }

  const contextType = CHAT_FLAGS.contextLinks ? input.contextType ?? null : null;
  const contextId = CHAT_FLAGS.contextLinks ? input.contextId ?? null : null;

  // Contexto: solo puedes vincular un registro TUYO (regla 1 de context.ts).
  // Sin este check, cualquier contextId ajeno filtraría título/precio/foto del
  // registro de otro usuario vía el banner (IDOR).
  if (contextType && contextId) {
    const owner = await recordOwnerId(contextType, contextId);
    if (owner !== userId) {
      return NextResponse.json({ error: "No disponible" }, { status: 403 });
    }
  }

  // Los participantes deben existir.
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true } });
  if (users.length !== otherIds.length) {
    return NextResponse.json({ error: "Participante desconocido" }, { status: 400 });
  }

  if (input.kind === "DIRECT") {
    if (otherIds.length !== 1) {
      return NextResponse.json({ error: "Un chat directo tiene exactamente 2 personas" }, { status: 400 });
    }
    const otherId = otherIds[0];
    if (await anyBlockBetween(userId, otherId)) {
      // 403 genérico: no revelamos quién bloqueó a quién.
      return NextResponse.json({ error: "No disponible" }, { status: 403 });
    }
    const key = directKey(userId, otherId, contextId);
    const existing = await prisma.conversation.findUnique({
      where: { directKey: key },
      include: PARTICIPANT_INCLUDE,
    });
    if (existing) {
      // Reactivar mi participación si había "salido" (borrado de la lista).
      await prisma.conversationParticipant.updateMany({
        where: { conversationId: existing.id, userId, leftAt: { not: null } },
        data: { leftAt: null },
      });
      return NextResponse.json(conversationDto(existing, userId), { status: 200 });
    }
    try {
      const created = await prisma.conversation.create({
        data: {
          kind: "DIRECT",
          createdById: userId,
          directKey: key,
          contextType,
          contextId,
          participants: {
            create: [
              { userId, role: "MEMBER" },
              { userId: otherId, role: "MEMBER" },
            ],
          },
        },
        include: PARTICIPANT_INCLUDE,
      });
      return NextResponse.json(conversationDto(created, userId), { status: 201 });
    } catch (e) {
      // Carrera: dos clientes crean el mismo DIRECT a la vez → el segundo choca
      // con el unique de directKey (P2002). Devolver el existente, no un 500.
      const raced = await prisma.conversation.findUnique({ where: { directKey: key }, include: PARTICIPANT_INCLUDE });
      if (raced) return NextResponse.json(conversationDto(raced, userId), { status: 200 });
      throw e;
    }
  }

  // GROUP
  if (!CHAT_FLAGS.groups) {
    return NextResponse.json({ error: "Grupos desactivados" }, { status: 403 });
  }
  if (otherIds.length + 1 > CHAT_LIMITS.maxGroupParticipants) {
    return NextResponse.json({ error: "Demasiados participantes" }, { status: 400 });
  }
  // Bloqueos también en grupos: sin este check, un bloqueado puede meter al
  // bloqueador en un grupo y seguir escribiéndole (con push incluido).
  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: otherIds } },
        { blockerId: { in: otherIds }, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) {
    // 403 genérico: no revelamos quién bloqueó a quién.
    return NextResponse.json({ error: "No disponible" }, { status: 403 });
  }
  // Título con filtro anti-suplantación (el push de grupo usa este título).
  if (input.title && isProtectedName(input.title)) {
    return NextResponse.json({ error: "Ese nombre no está disponible" }, { status: 400 });
  }
  const created = await prisma.conversation.create({
    data: {
      kind: "GROUP",
      title: input.title ?? "Grupo",
      createdById: userId,
      contextType,
      contextId,
      participants: {
        create: [
          { userId, role: "OWNER" },
          ...otherIds.map((id) => ({ userId: id, role: "MEMBER" as const })),
        ],
      },
    },
    include: PARTICIPANT_INCLUDE,
  });
  return NextResponse.json(conversationDto(created, userId), { status: 201 });
}
