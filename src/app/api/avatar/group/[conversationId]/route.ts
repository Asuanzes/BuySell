import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signAttachmentUrl } from "@/lib/chat/r2";

type Ctx = { params: Promise<{ conversationId: string }> };

/**
 * GET /api/avatar/group/[conversationId] — foto del grupo: 302 a la URL firmada
 * de R2 (bucket privado). PÚBLICO por la misma razón que el avatar de persona
 * (allowlist del middleware): expo-image no envía Authorization, los ids son
 * cuids no enumerables y una foto de grupo es exposición mínima. Cacheable 1 h;
 * el cliente versiona con ?v=<basename de la key>.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { kind: true, imageUrl: true },
  });
  if (!c || c.kind !== "GROUP" || !c.imageUrl) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  }
  const url = await signAttachmentUrl(c.imageUrl);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=3600" } });
}
