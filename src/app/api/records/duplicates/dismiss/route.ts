import { NextRequest, NextResponse } from "next/server";
import { dismissPairKey, type RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * POST /api/records/duplicates/dismiss  { type, ids[] }
 *
 * Marca un grupo como "no son duplicados": persiste TODOS los pares (idA|idB
 * ordenado) para que no vuelvan a agruparse. Owner-scoped e idempotente (upsert
 * por la unique [ownerId, pairKey]).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ownerId = await requireUserId();

  let body: { type?: unknown; ids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const DEDUP_TYPES: RecordType[] = ["book", "crypto", "market", "job"];
  const type = (typeof body.type === "string" ? body.type : "") as RecordType;
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.filter((x): x is string => typeof x === "string" && !!x)))
    : [];

  if (type !== "property" && !DEDUP_TYPES.includes(type)) {
    return NextResponse.json({ error: "type no válido" }, { status: 400 });
  }
  if (ids.length < 2) {
    return NextResponse.json({ error: "faltan al menos 2 ids" }, { status: 400 });
  }

  // Inmuebles: el descarte vive en Property.matchDismissed (lo que respeta
  // findSimilar y /api/properties/[id]/dismiss-match). Cada ficha se añade a
  // la lista de descartadas de las demás.
  if (type === "property") {
    const props = await prisma.property.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, matchDismissed: true },
    });
    if (props.length !== ids.length) {
      return NextResponse.json({ error: "No se encontraron todas las fichas" }, { status: 404 });
    }
    await prisma.$transaction(
      props.map((p) => {
        const set = new Set(p.matchDismissed);
        for (const o of ids) if (o !== p.id) set.add(o);
        return prisma.property.update({ where: { id: p.id }, data: { matchDismissed: [...set] } });
      }),
    );
    return NextResponse.json({ ok: true, dismissed: (ids.length * (ids.length - 1)) / 2 });
  }

  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push(dismissPairKey(ids[i], ids[j]));
    }
  }

  await prisma.$transaction(
    pairs.map((pairKey) =>
      prisma.recordDuplicateDismissal.upsert({
        where: { ownerId_pairKey: { ownerId, pairKey } },
        create: { ownerId, recordType: type, pairKey },
        update: {},
      }),
    ),
  );

  return NextResponse.json({ ok: true, dismissed: pairs.length });
}
