import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { holidayToBaseRecord } from "@/lib/records/mapper";

/**
 * POST /api/travel/organize — C8: crea un viaje EN ORGANIZACIÓN (previo a la
 * reserva). Sin fechas reales ni reserva: el destino tentativo, la ventana
 * aproximada y el presupuesto viven en `meta.planning`; las columnas
 * startDate/endDate quedan a null a propósito (una ventana aproximada NO son
 * fechas de viaje). status = "PLANNING" (vocabulario ya existente del modelo).
 * Al reservar, /api/travel/book con holidayId completa la MISMA fila.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const Body = z
  .object({
    destination: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120).optional(),
    windowStartISO: z.string().regex(YMD).nullish(),
    windowEndISO: z.string().regex(YMD).nullish(),
    budgetEur: z.number().positive().max(1_000_000).nullish(),
    companions: z.string().trim().max(200).nullish(),
  })
  .refine((b) => !b.windowStartISO || !b.windowEndISO || b.windowStartISO <= b.windowEndISO, {
    message: "la ventana termina antes de empezar",
  });

export async function POST(req: NextRequest) {
  const ownerId = await getUserId();
  if (!ownerId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  const b = parsed.data;

  const planning = {
    destinationTentative: b.destination,
    windowStartISO: b.windowStartISO ?? null,
    windowEndISO: b.windowEndISO ?? null,
    budgetCents: b.budgetEur != null ? Math.round(b.budgetEur * 100) : null,
    companions: b.companions ?? null,
  };

  const created = await prisma.holiday.create({
    data: {
      ownerId,
      title: b.title ?? `Viaje a ${b.destination}`,
      // Subtítulo persistido al crear (mismo criterio que el resto del vertical:
      // no se retraduce después).
      subtitle:
        b.windowStartISO && b.windowEndISO ? `${b.windowStartISO} → ${b.windowEndISO} (aprox.)` : null,
      status: "PLANNING",
      destination: b.destination,
      currency: "EUR",
      source: "organize",
      externalId: null,
      meta: { planning } as object,
    },
  });

  return NextResponse.json({ record: holidayToBaseRecord(created) }, { status: 201 });
}
