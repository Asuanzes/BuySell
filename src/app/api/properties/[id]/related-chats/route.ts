import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { avatarUrl, displayName, groupImageUrl } from "@/lib/chat/serialize";
import { messagePreview } from "@/lib/chat/util";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/related-chats
 *
 * Conversaciones vinculadas a la ficha (el "Que se ha hablado" de la pantalla
 * de decision):
 *  - `Conversation.contextType/contextId` = "property" (vinculo de contexto), o
 *  - `ChatMessage.contextType/contextId` = "property" (tarjetas compartidas).
 * Por hilo devuelve el ultimo mensaje real de la conversacion (excluye borrados
 * y respeta tu salida/joinedAt); las conversaciones que abandonaste no aparecen.
 * Solo lectura; dueno del registro.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();

  const property = await prisma.property.findFirst({
    where: { id, ownerId },
    select: { id: true },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [linked, shared] = await Promise.all([
    prisma.conversation.findMany({
      where: { contextType: "property", contextId: id },
      select: { id: true },
    }),
    prisma.chatMessage.findMany({
      where: { contextType: "property", contextId: id, deletedAt: null },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
  ]);

  const convIds = [
    ...new Set([...linked.map((c) => c.id), ...shared.map((m) => m.conversationId)]),
  ];
  if (convIds.length === 0) return NextResponse.json({ chats: [] });

  const conversations = await prisma.conversation.findMany({
    where: {
      id: { in: convIds },
      participants: { some: { userId: ownerId, leftAt: null } },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      imageUrl: true,
      lastMessageAt: true,
      // En un DIRECT el titulo/avatar se derivan del OTRO participante.
      participants: {
        where: { leftAt: null },
        select: {
          userId: true,
          joinedAt: true,
          user: { select: { id: true, name: true, username: true, email: true, image: true } },
        },
      },
    },
  });

  const msgs = await Promise.all(
    conversations.map((c) => {
      const me = c.participants.find((p) => p.userId === ownerId);
      return prisma.chatMessage.findFirst({
        where: {
          conversationId: c.id,
          deletedAt: null,
          ...(me?.joinedAt ? { createdAt: { gte: me.joinedAt } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          conversationId: true,
          kind: true,
          body: true,
          createdAt: true,
          sender: { select: { id: true, name: true, username: true, email: true, image: true } },
        },
      });
    }),
  );

  // Ultimo mensaje real por conversacion, exacto por hilo.
  const lastByConv = new Map<string, NonNullable<(typeof msgs)[number]>>();
  for (const m of msgs) if (m) lastByConv.set(m.conversationId, m);

  const chats = conversations
    .map((c) => {
      const other = c.participants.find((p) => p.userId !== ownerId)?.user ?? null;
      const last = lastByConv.get(c.id) ?? null;
      return {
        conversationId: c.id,
        kind: c.kind,
        title: c.title ?? (other ? displayName(other) : "—"),
        imageUrl: c.kind === "DIRECT" ? (other ? avatarUrl(other) : null) : groupImageUrl(c),
        lastMessage: last
          ? {
              kind: last.kind,
              body: messagePreview(last.kind, last.body),
              senderName: last.sender ? displayName(last.sender) : null,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return NextResponse.json({ chats });
}
