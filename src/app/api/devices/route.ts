import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";

const Input = z.object({
  expoPushToken: z.string().min(10).max(200),
  platform: z.enum(["ios", "android"]),
  /** Zona IANA del dispositivo: el horario silencioso se evalúa en hora local. */
  timezone: z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional(),
});

/**
 * POST /api/devices — registra (o refresca) el push token del dispositivo.
 * Upsert por token: si el token cambió de usuario (reinstalación con otra
 * cuenta), se reasigna.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { expoPushToken, platform, timezone } = parsed.data;

  await prisma.device.upsert({
    where: { expoPushToken },
    create: { userId, expoPushToken, platform, timezone: timezone ?? null },
    update: { userId, platform, lastSeenAt: new Date(), ...(timezone ? { timezone } : {}) },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const DeleteInput = z.object({ expoPushToken: z.string().min(10).max(200) });

/** DELETE — baja del token (logout). Solo si es mío. */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = DeleteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.device.deleteMany({
    where: { expoPushToken: parsed.data.expoPushToken, userId },
  });
  return NextResponse.json({ ok: true });
}
