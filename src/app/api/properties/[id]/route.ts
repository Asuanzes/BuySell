import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PropertyInput } from "@/lib/validators";
import { requireUserId } from "@/lib/auth-helpers";
import { ensurePropertyOwner } from "@/lib/ownership";
import { deleteRecordShares, sharedAccess } from "@/lib/records/access";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  // Si me lo han compartido y sigue vigente, lo abro en SOLO LECTURA.
  const share = await sharedAccess("property", id, ownerId);
  const property = await prisma.property.findFirst({
    where: share ? { id } : { id, ownerId },
    include: {
      media: { orderBy: { order: "asc" } },
      listings: true,
      // Cada snapshot lleva la operación de su anuncio: una ficha mixta
      // (venta + alquiler) necesita series separables — 220.000 € y 900 €/mes
      // jamás deben mezclarse en la misma curva.
      priceHistory: {
        orderBy: { observedAt: "asc" },
        include: { listing: { select: { operationType: true } } },
      },
    },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(share ? { ...property, shared: true, readOnly: true } : property);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  if (!(await ensurePropertyOwner(id, ownerId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const parsed = PropertyInput.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const property = await prisma.property.update({ where: { id }, data: parsed.data });
  return NextResponse.json(property);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  if (!(await ensurePropertyOwner(id, ownerId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.property.delete({ where: { id } });
  // Los accesos compartidos NO caen en cascada (recordId es soft-ref).
  await deleteRecordShares("property", id);
  return NextResponse.json({ ok: true });
}
