import { NextRequest, NextResponse } from "next/server";
import type { PropertyStatus, PropertyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { isRentOperation } from "@nidokey/shared";
import { buildZoneContext, type ZoneComparable } from "@/lib/property-zone";

type Ctx = { params: Promise<{ id: string }> };

type ComparableSource = {
  id: string;
  title: string;
  type: PropertyType;
  city: string;
  neighborhood: string | null;
  status: PropertyStatus;
  currentPrice: number | null;
  monthlyRent: number | null;
  builtArea: number | null;
};

/**
 * GET /api/properties/[id]/zone-context
 *
 * Comparativa de zona (Tier 1, datos propios del usuario): la ficha actual
 * contra las demás del mismo dueño con la MISMA operación, estratificada por
 * [ciudad, barrio, tipo] → [ciudad, tipo] → [ciudad]. Ver `src/lib/property-zone.ts`.
 * Solo lectura; dueño del registro (o acceso compartido read-only).
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await requireUserId();

  const current = await prisma.property.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      type: true,
      city: true,
      neighborhood: true,
      status: true,
      currentPrice: true,
      monthlyRent: true,
      builtArea: true,
      operationType: true,
    },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // La comparación usa la renta si la ficha es de alquiler; el resto de la
  // operación (SALE) usa el precio de venta. RENT_TO_OWN cuenta como alquiler.
  const isRent = isRentOperation(current.operationType);

  const toComparable = (p: ComparableSource): ZoneComparable => ({
    id: p.id,
    title: p.title,
    type: p.type,
    city: p.city,
    neighborhood: p.neighborhood,
    status: p.status,
    price: isRent ? p.monthlyRent : p.currentPrice,
    builtArea: p.builtArea,
  });

  const others = await prisma.property.findMany({
    where: {
      ownerId,
      id: { not: id },
      // Alternativas activas: fuera vendidas, retiradas y ya alquiladas.
      status: { notIn: ["SOLD", "WITHDRAWN", "RENTED"] },
    },
    select: {
      id: true,
      title: true,
      type: true,
      city: true,
      neighborhood: true,
      status: true,
      currentPrice: true,
      monthlyRent: true,
      builtArea: true,
      operationType: true,
    },
  });

  const sameOp = others.filter((o) => isRentOperation(o.operationType) === isRent);

  const result = buildZoneContext({
    current: toComparable(current),
    others: sameOp.map(toComparable),
  });

  return NextResponse.json(result);
}
