import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { ownsRecord, recordCurrentCents } from "@/lib/records/access";
import { activeAlertsLimit } from "@/lib/billing/entitlements";
import { shouldFire } from "@/lib/alerts/evaluate";

/** Tipos con precio vigilable. Libros/viajes/tendencias no tienen precio propio. */
const ALERT_TYPES = ["crypto", "market", "property"] as const;

const Body = z
  .object({
    recordType: z.enum(ALERT_TYPES),
    recordId: z.string().min(1),
    kind: z.enum(["PRICE_BELOW", "PRICE_ABOVE", "PRICE_DROP_PCT", "STATUS_CHANGE"]),
    /** "rent" solo tiene sentido en inmuebles (ficha mixta venta+alquiler). */
    field: z.enum(["price", "rent"]).default("price"),
    /** Céntimos en umbrales absolutos; porcentaje entero (1-99) en DROP_PCT. */
    threshold: z.number().int().positive().optional(),
  })
  .refine((b) => b.kind === "STATUS_CHANGE" || b.threshold != null, {
    message: "threshold requerido",
  })
  .refine((b) => b.kind !== "PRICE_DROP_PCT" || (b.threshold! >= 1 && b.threshold! <= 99), {
    message: "el porcentaje debe estar entre 1 y 99",
  })
  .refine((b) => b.field === "price" || b.recordType === "property", {
    message: "solo los inmuebles tienen renta",
  })
  .refine((b) => b.kind !== "STATUS_CHANGE" || b.recordType === "property", {
    message: "el cambio de estado solo aplica a inmuebles",
  });

/** GET /api/alerts?recordType=&recordId= — mis alertas (todas, o de un registro). */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const recordType = req.nextUrl.searchParams.get("recordType");
  const recordId = req.nextUrl.searchParams.get("recordId");

  const alerts = await prisma.priceAlert.findMany({
    where: {
      userId,
      ...(recordType ? { recordType } : {}),
      ...(recordId ? { recordId } : {}),
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const [limit, activeCount] = await Promise.all([
    activeAlertsLimit(userId),
    prisma.priceAlert.count({ where: { userId, active: true } }),
  ]);

  return NextResponse.json({ alerts, limit, activeCount });
}

/**
 * POST /api/alerts — crear una alerta.
 *
 * Autorización: el registro debe ser del usuario (`ownsRecord`, el mismo
 * chequeo que usa compartir). Cuota de alertas ACTIVAS por plan.
 *
 * Rechaza una alerta que YA se cumple ahora mismo: así la evaluación puede
 * asumir que nace sin cumplirse y disparar al cruzar el umbral, y el usuario
 * recibe un error claro en vez de un aviso inmediato y desconcertante.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { recordType, recordId, kind, field, threshold } = parsed.data;

  if (!(await ownsRecord(recordType as RecordType, recordId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const currentCents = await recordCurrentCents(recordType as RecordType, recordId, field);
  if (kind !== "STATUS_CHANGE" && currentCents == null) {
    return NextResponse.json(
      { error: "Este registro todavía no tiene precio para vigilar." },
      { status: 400 }
    );
  }

  // ¿Se cumpliría ya? Se evalúa como si el valor actual fuese "el nuevo" sin
  // valor anterior: shouldFire devuelve true si la condición se cumple hoy.
  if (
    shouldFire(
      { id: "new", kind, threshold: threshold ?? null, baselineCents: currentCents, oneShot: true, lastFiredAt: null },
      { oldCents: null, newCents: currentCents }
    )
  ) {
    return NextResponse.json(
      { error: "Esa condición ya se cumple ahora mismo. Ajusta el valor." },
      { status: 400 }
    );
  }

  const alert = await prisma.priceAlert.create({
    data: {
      userId,
      recordType,
      // El cambio de estado no es un campo de precio: se guarda siempre como
      // "price" para que el enganche del scraper lo encuentre (ver runner.ts).
      field: kind === "STATUS_CHANGE" ? "price" : field,
      recordId,
      kind,
      threshold: threshold ?? null,
      baselineCents: currentCents,
      // Los umbrales absolutos son de un solo disparo; el porcentaje y el estado
      // se repiten con enfriamiento.
      oneShot: kind === "PRICE_BELOW" || kind === "PRICE_ABOVE",
    },
  });

  await prisma.analyticsEvent
    .create({ data: { userId, name: "alert_created", props: { recordType, kind } } })
    .catch(() => {});

  return NextResponse.json({ alert }, { status: 201 });
}
