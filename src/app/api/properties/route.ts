import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PropertyInput } from "@/lib/validators";
import { buildPropertyWhere, parseFilters } from "@/lib/filters";
import { requireUserId } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const ownerId = await requireUserId();
  const filters = parseFilters(req.nextUrl.searchParams);
  const where = { ...buildPropertyWhere(filters), ownerId };
  const properties = await prisma.property.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" } },
      // Portal de origen: el listing más antiguo = de dónde lo importamos.
      listings: { select: { portal: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    take: 100,
  });
  return NextResponse.json(properties);
}

export async function POST(req: NextRequest) {
  const ownerId = await requireUserId();
  const body = await req.json();
  const parsed = PropertyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const property = await prisma.property.create({ data: { ...parsed.data, ownerId } });
  return NextResponse.json(property, { status: 201 });
}
