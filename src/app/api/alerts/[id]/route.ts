import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { recordCurrentCents } from "@/lib/records/access";
import { activeAlertsLimit } from "@/lib/billing/entitlements";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  /** true = rearmar una alerta ya disparada; false = desactivarla. */
  active: z.boolean(),
});

/**
 * PATCH /api/alerts/[id] — rearmar o desactivar.
 *
 * Al rearmar se refresca `baselineCents` con el precio ACTUAL: si no, una
 * alerta porcentual rearmada seguiría midiendo la caída desde un precio viejo y
 * saltaría de inmediato.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const existing = await prisma.priceAlert.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.active && !existing.active) {
    const [limit, activeCount] = await Promise.all([
      activeAlertsLimit(userId),
      prisma.priceAlert.count({ where: { userId, active: true } }),
    ]);
    if (activeCount >= limit) {
      return NextResponse.json(
        { error: "Has alcanzado el límite de alertas activas de tu plan.", limit, upgrade: true },
        { status: 402 }
      );
    }
  }

  const baselineCents = parsed.data.active
    ? await recordCurrentCents(existing.recordType as RecordType, existing.recordId, existing.field === "rent" ? "rent" : "price")
    : existing.baselineCents;

  const alert = await prisma.priceAlert.update({
    where: { id },
    data: {
      active: parsed.data.active,
      ...(parsed.data.active ? { baselineCents, lastFiredAt: null } : {}),
    },
  });
  return NextResponse.json({ alert });
}

/** DELETE /api/alerts/[id] — borrar una alerta propia. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  const { id } = await params;
  const deleted = await prisma.priceAlert.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
