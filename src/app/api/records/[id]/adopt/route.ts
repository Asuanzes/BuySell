import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { sharedAccess } from "@/lib/records/access";
import { withoutPrivateAnnotations } from "@/lib/records/private-annotations";

type Ctx = { params: Promise<{ id: string }> };

const RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;
const Body = z.object({ type: z.enum(RECORD_TYPES) });

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Copia un registro (de cualquier owner) a la cuenta de `ownerId`. Id nuevo o null. */
async function copyRecord(type: RecordType, id: string, ownerId: string): Promise<string | null> {
  const strip = (row: any) => {
    const { id: _i, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = row;
    // Sin las anotaciones privadas del dueño: ver private-annotations.ts.
    return { ...withoutPrivateAnnotations(rest), ownerId };
  };
  if (type === "crypto") {
    const s = await prisma.cryptoHolding.findFirst({ where: { id } });
    return s ? (await prisma.cryptoHolding.create({ data: strip(s) as any })).id : null;
  }
  if (type === "market") {
    const s = await prisma.marketInstrument.findFirst({ where: { id } });
    return s ? (await prisma.marketInstrument.create({ data: strip(s) as any })).id : null;
  }
  if (type === "job") {
    const s = await prisma.jobListing.findFirst({ where: { id } });
    return s ? (await prisma.jobListing.create({ data: strip(s) as any })).id : null;
  }
  if (type === "book") {
    const s = await prisma.bookRecord.findFirst({ where: { id } });
    return s ? (await prisma.bookRecord.create({ data: strip(s) as any })).id : null;
  }
  if (type === "holiday") {
    const s = await prisma.holiday.findFirst({ where: { id } });
    return s ? (await prisma.holiday.create({ data: strip(s) as any })).id : null;
  }
  // property: copia la ficha + sus fotos. Sin anuncios/snapshots → copia estática editable.
  const s = await prisma.property.findFirst({ where: { id } });
  if (!s) return null;
  const np = await prisma.property.create({ data: strip(s) as any });
  const media = await prisma.media.findMany({ where: { propertyId: id } });
  if (media.length) {
    await prisma.media.createMany({
      data: media.map((m: any) => {
        const { id: _i, propertyId: _p, createdAt: _c, updatedAt: _u, ...rest } = m;
        return { ...rest, propertyId: np.id };
      }),
    });
  }
  return np.id;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * POST /api/records/:id/adopt  { type }
 *
 * Guarda en MIS registros una COPIA de un registro que me han compartido. Requiere
 * un RecordShare (recordType, recordId) hacia mí. La copia es propia y editable
 * (no afecta al original). Para fusionar: adoptar y luego usar el merge normal.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const me = await requireUserId();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  const { type } = parsed.data;

  // Mismo criterio que abrir la ficha: la fila debe existir Y no haber bloqueo
  // (si no, bloquear ocultaba el registro pero seguías pudiendo copiarlo).
  const share = await sharedAccess(type, id, me);
  if (!share) return NextResponse.json({ error: "No tienes ese registro compartido" }, { status: 404 });

  try {
    const newId = await copyRecord(type, id, me);
    if (!newId) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, id: newId, type });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Ya tienes ese registro en los tuyos" }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
}
