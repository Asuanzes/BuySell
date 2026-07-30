import { NextRequest, NextResponse } from "next/server";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { propertyToBaseRecord, cryptoToBaseRecord, marketToBaseRecord, jobToBaseRecord, bookToBaseRecord, holidayToBaseRecord } from "@/lib/records/mapper";

/**
 * GET /api/records?type=property
 *
 * Endpoint UNIFICADO de registros. Hoy envuelve la consulta de inmuebles y la
 * devuelve como BaseRecord[]; mañana, al añadir tipos, se amplía aquí sin tocar
 * los clientes. Siempre owner-scoped (requireUserId + ownerId).
 *
 * NOTA: implementado pero NO desplegado ni consumido por la app móvil todavía
 * (la app sigue usando /api/properties vía el repositorio). Ver
 * docs/arquitectura-records.md.
 */
export async function GET(req: NextRequest) {
  const ownerId = await requireUserId();
  const type = (req.nextUrl.searchParams.get("type") ?? "property") as RecordType;

  if (type === "property") {
    const properties = await prisma.property.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      // Solo fotos: el plano FLOORPLAN del Catastro comparte tabla y order 0,
      // sin el filtro se colaba como imagen del banner.
      include: { media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" } } },
      take: 100,
    });
    return NextResponse.json(properties.map(propertyToBaseRecord));
  }

  if (type === "crypto") {
    const holdings = await prisma.cryptoHolding.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(holdings.map(cryptoToBaseRecord));
  }

  if (type === "market") {
    const instruments = await prisma.marketInstrument.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(instruments.map(marketToBaseRecord));
  }

  if (type === "job") {
    const jobs = await prisma.jobListing.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(jobs.map(jobToBaseRecord));
  }

  if (type === "book") {
    const books = await prisma.bookRecord.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(books.map(bookToBaseRecord));
  }

  if (type === "holiday") {
    const holidays = await prisma.holiday.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(holidays.map(holidayToBaseRecord));
  }

  // Tipos reservados (workout…): sin datos todavía.
  return NextResponse.json([]);
}
