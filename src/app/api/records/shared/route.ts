import { NextResponse } from "next/server";
import type { BaseRecord } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import {
  propertyToBaseRecord,
  cryptoToBaseRecord,
  marketToBaseRecord,
  jobToBaseRecord,
  bookToBaseRecord,
  holidayToBaseRecord,
} from "@/lib/records/mapper";

/**
 * GET /api/records/shared — registros que OTROS usuarios me han compartido
 * (acceso de SOLO LECTURA). Devuelve BaseRecord[] con meta.shared=true,
 * meta.readOnly=true y meta.sharedBy (@username de quien comparte).
 */
export async function GET() {
  const me = await requireUserId();
  // Bloqueos: bloquear a alguien cortaba sus mensajes pero NO su ficha, que
  // seguía actualizándose aquí. El bloqueo vale en ambos sentidos.
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: me }, { blockedId: me }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((u) => u !== me));

  const shares = (
    await prisma.recordShare.findMany({
      where: { toUserId: me, ...(blocked.size ? { fromUserId: { notIn: [...blocked] } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  ).filter((s) => !blocked.has(s.fromUserId));
  if (shares.length === 0) return NextResponse.json([]);

  // Etiqueta de quien comparte (para "compartido por @x").
  const fromUsers = await prisma.user.findMany({
    where: { id: { in: [...new Set(shares.map((s) => s.fromUserId))] } },
    select: { id: true, username: true, name: true },
  });
  const fromLabel = new Map(fromUsers.map((u) => [u.id, u.username ?? u.name ?? "alguien"]));
  const sharerByRecord = new Map(shares.map((s) => [`${s.recordType}:${s.recordId}`, fromLabel.get(s.fromUserId) ?? null]));

  const byType = new Map<string, string[]>();
  for (const s of shares) {
    byType.set(s.recordType, [...(byType.get(s.recordType) ?? []), s.recordId]);
  }

  const decorate = (rec: BaseRecord, type: string): BaseRecord => ({
    ...rec,
    meta: { ...rec.meta, shared: true, readOnly: true, sharedBy: sharerByRecord.get(`${type}:${rec.id}`) ?? null },
  });

  const out: BaseRecord[] = [];
  for (const [type, ids] of byType) {
    if (type === "crypto") {
      (await prisma.cryptoHolding.findMany({ where: { id: { in: ids } } })).forEach((r) => out.push(decorate(cryptoToBaseRecord(r), type)));
    } else if (type === "market") {
      (await prisma.marketInstrument.findMany({ where: { id: { in: ids } } })).forEach((r) => out.push(decorate(marketToBaseRecord(r), type)));
    } else if (type === "job") {
      (await prisma.jobListing.findMany({ where: { id: { in: ids } } })).forEach((r) => out.push(decorate(jobToBaseRecord(r), type)));
    } else if (type === "book") {
      (await prisma.bookRecord.findMany({ where: { id: { in: ids } } })).forEach((r) => out.push(decorate(bookToBaseRecord(r), type)));
    } else if (type === "holiday") {
      (await prisma.holiday.findMany({ where: { id: { in: ids } } })).forEach((r) => out.push(decorate(holidayToBaseRecord(r), type)));
    } else {
      (
        await prisma.property.findMany({
          where: { id: { in: ids } },
          include: { media: { take: 1, orderBy: { order: "asc" } } },
        })
      ).forEach((r) => out.push(decorate(propertyToBaseRecord(r), type)));
    }
  }
  return NextResponse.json(out);
}
