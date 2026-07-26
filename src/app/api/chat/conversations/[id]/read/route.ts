import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { notifyConversation } from "@/lib/chat/gateway";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/chat/conversations/[id]/read — marca la conversación como leída
 * (lastReadAt = ahora). Read receipts baratos: sin fila por mensaje.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const me = await getParticipantOrNull(id, userId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  await prisma.conversationParticipant.update({
    where: { id: me.id },
    data: { lastReadAt: now, lastDeliveredAt: now },
  });

  // Tiempo real: el emisor ve el ✓✓ azul sin esperar su poll de 10-60 s. No
  // hay bucle: el refetch del otro lado son GETs, que no re-notifican.
  after(() => notifyConversation(id, userId));

  return NextResponse.json({ ok: true, lastReadAt: now.toISOString() });
}
