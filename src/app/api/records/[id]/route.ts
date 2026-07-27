import { NextRequest, NextResponse } from "next/server";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { propertyToBaseRecord, cryptoToBaseRecord, marketToBaseRecord, jobToBaseRecord, bookToBaseRecord, holidayToBaseRecord } from "@/lib/records/mapper";
import { deleteRecordShares, sharedAccess } from "@/lib/records/access";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/records/:id?type=<tipo>
 *
 * Devuelve un registro por id como BaseRecord, con su detalle de tipo en
 * `meta.detail`. Owner-scoped: `where: { id, ownerId }` ⇒ 404 si no es del
 * usuario (no se filtra existencia de registros ajenos). `type` por defecto
 * "property".
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  const type = (req.nextUrl.searchParams.get("type") ?? "property") as RecordType;

  // ¿Me lo han compartido (y sigue vigente)? Si sí, abro en SOLO LECTURA sin
  // filtrar por ownerId, pero acotado a ESTE id que el RecordShare autoriza.
  const share = await sharedAccess(type, id, ownerId);
  const where = share ? { id } : { id, ownerId };
  const extra = share ? { shared: true, readOnly: true } : {};

  if (type === "crypto") {
    const holding = await prisma.cryptoHolding.findFirst({
      where,
      include: { snapshots: { orderBy: { observedAt: "asc" } } },
    });
    if (!holding) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = cryptoToBaseRecord(holding);
    return NextResponse.json({ ...record, meta: { ...record.meta, detail: holding, ...extra } });
  }

  if (type === "market") {
    const instrument = await prisma.marketInstrument.findFirst({
      where,
      include: { snapshots: { orderBy: { observedAt: "asc" } } },
    });
    if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = marketToBaseRecord(instrument);
    return NextResponse.json({ ...record, meta: { ...record.meta, detail: instrument, ...extra } });
  }

  if (type === "job") {
    const job = await prisma.jobListing.findFirst({
      where,
      include: { snapshots: { orderBy: { observedAt: "asc" } } },
    });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = jobToBaseRecord(job);
    return NextResponse.json({ ...record, meta: { ...record.meta, detail: job, ...extra } });
  }

  if (type === "book") {
    const book = await prisma.bookRecord.findFirst({ where });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = bookToBaseRecord(book);
    return NextResponse.json({ ...record, meta: { ...record.meta, detail: book, ...extra } });
  }

  if (type === "holiday") {
    const holiday = await prisma.holiday.findFirst({
      where,
      include: { snapshots: { orderBy: { observedAt: "asc" } } },
    });
    if (!holiday) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = holidayToBaseRecord(holiday);
    return NextResponse.json({ ...record, meta: { ...record.meta, detail: holiday, ...extra } });
  }

  const property = await prisma.property.findFirst({
    where,
    include: {
      media: { orderBy: { order: "asc" } },
      listings: true,
      priceHistory: { orderBy: { observedAt: "asc" } },
    },
  });

  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const record = propertyToBaseRecord(property);
  return NextResponse.json({ ...record, meta: { ...record.meta, detail: property, ...extra } });
}

/**
 * DELETE /api/records/:id?type=<tipo>
 *
 * Borra un registro del usuario. Owner-scoped vía `deleteMany({ id, ownerId })`
 * ⇒ 404 si no es del usuario (no se filtra existencia ajena). La cascada
 * (listings, snapshots, media) la aplican las relaciones del schema.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  const type = (req.nextUrl.searchParams.get("type") ?? "property") as RecordType;

  const deleted =
    type === "crypto"
      ? await prisma.cryptoHolding.deleteMany({ where: { id, ownerId } })
      : type === "market"
        ? await prisma.marketInstrument.deleteMany({ where: { id, ownerId } })
        : type === "job"
          ? await prisma.jobListing.deleteMany({ where: { id, ownerId } })
          : type === "book"
            ? await prisma.bookRecord.deleteMany({ where: { id, ownerId } })
            : type === "holiday"
              ? await prisma.holiday.deleteMany({ where: { id, ownerId } })
              : await prisma.property.deleteMany({ where: { id, ownerId } });

  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Los accesos compartidos NO caen en cascada (recordId es soft-ref).
  await deleteRecordShares(type, id);
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/records/:id?type=book  { notes }
 *
 * Guarda el COMENTARIO/nota del usuario para un libro en `meta.userNotes` — texto
 * propio, separado de la sinopsis del proveedor y a salvo de los re-imports (el
 * merge de upsertBook no toca userNotes). `notes` vacío borra la nota. Owner-scoped.
 * Por ahora solo libros.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();
  const type = (req.nextUrl.searchParams.get("type") ?? "property") as RecordType;
  if (type !== "book") {
    return NextResponse.json({ error: "Solo los libros admiten notas por ahora" }, { status: 400 });
  }

  let body: { notes?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const raw = typeof body.notes === "string" ? body.notes.trim() : "";
  const notes = raw ? raw.slice(0, 4000) : null;

  const book = await prisma.bookRecord.findFirst({ where: { id, ownerId } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = { ...((book.meta as Record<string, unknown>) ?? {}) };
  if (notes) meta.userNotes = notes;
  else delete meta.userNotes;

  const updated = await prisma.bookRecord.update({
    where: { id: book.id },
    data: { meta: meta as object },
  });
  const record = bookToBaseRecord(updated);
  return NextResponse.json({ ...record, meta: { ...record.meta, detail: updated } });
}
