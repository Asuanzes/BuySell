import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { avatarUrl, displayName, groupImageUrl } from "@/lib/chat/serialize";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/related-chats
 *
 * Conversaciones vinculadas a la ficha (el "¿qué se ha hablado?" de la
 * pantalla de decisión):
 *  - `Conversation.contextType/contextId` = "property" (vínculo de contexto), y
 *  - `ChatMessage.contextType/contextId` = "property" (tarjetas "📌" compartidas).
 * Por hilo devuelve el ÚLTIMO mensaje relevante (el SYSTEM de cambio de precio
 * o el mensaje que acompañó a la tarjeta). Solo lectura; dueño del registro.
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

  const [conversations, msgs] = await Promise.all([
    prisma.conversation.findMany({
      where: { id: { in: convIds } },
      select: {
        id: true,
        kind: true,
        title: true,
        imageUrl: true,
        lastMessageAt: true,
        // En un DIRECT el título/avatar se derivan del OTRO participante.
        participants: {
          where: { leftAt: null, userId: { not: ownerId } },
          select: {
            user: { select: { id: true, name: true, username: true, email: true, image: true } },
          },
        },
      },
    }),
    prisma.chatMessage.findMany({
      where: { conversationId: { in: convIds }, contextType: "property", contextId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        conversationId: true,
        kind: true,
        body: true,
        createdAt: true,
        sender: { select: { id: true, name: true, username: true, email: true, image: true } },
      },
    }),
  ]);

  // Último mensaje relevante por conversación (los que referencian la ficha).
  const lastByConv = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) if (!lastByConv.has(m.conversationId)) lastByConv.set(m.conversationId, m);

  const chats = conversations
    .map((c) => {
      const other = c.participants[0]?.user ?? null;
      const last = lastByConv.get(c.id) ?? null;
      return {
        conversationId: c.id,
        kind: c.kind,
        title: c.title ?? (other ? displayName(other) : "—"),
        imageUrl: c.kind === "DIRECT" ? (other ? avatarUrl(other) : null) : groupImageUrl(c),
        lastMessage: last
          ? {
              kind: last.kind,
              body: last.body,
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
