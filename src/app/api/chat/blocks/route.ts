import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { userDto } from "@/lib/chat/serialize";

/** GET /api/chat/blocks — usuarios que YO he bloqueado. */
export async function GET() {
  const userId = await requireUserId();
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    include: { blocked: { select: { id: true, name: true, username: true, email: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    blocks: blocks.map((b) => ({ userId: b.blockedId, user: userDto(b.blocked), createdAt: b.createdAt.toISOString() })),
  });
}

const Input = z.object({ userId: z.string().min(1) });

/** POST — bloquear. Idempotente. */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const blockedId = parsed.data.userId;
  if (blockedId === userId) return NextResponse.json({ error: "No puedes bloquearte" }, { status: 400 });

  try {
    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId } },
      create: { blockerId: userId, blockedId },
      update: {},
    });
  } catch {
    // FK (P2003): el userId no existe → 404 limpio, no 500 (mismo trato que contacts).
    return NextResponse.json({ error: "Usuario desconocido" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE — desbloquear. Idempotente. */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.userBlock.deleteMany({
    where: { blockerId: userId, blockedId: parsed.data.userId },
  });
  return NextResponse.json({ ok: true });
}
