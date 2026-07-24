import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { getUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { upsertRecord, getHolidayById } from "@/features/sources/upsert";
import { holidayToBaseRecord } from "@/lib/records/mapper";
import type { NormalizedRecord } from "@/features/sources/types";

/**
 * POST /api/travel/book — crea la RESERVA COMPLETA del viaje (hotel + vuelo).
 *
 * MODO PRUEBA por ahora: ni LiteAPI ni Duffel tienen saldo en sandbox para
 * reservar de verdad, así que esto confirma una reserva SIMULADA (referencias de
 * prueba) y persiste el viaje con estado BOOKED. Cuando haya saldo, AQUÍ irán las
 * llamadas reales: Duffel `POST /air/orders` (pago balance) + LiteAPI prebook/book
 * (pago wallet/credit-line); el resto del flujo (persistencia, estado) ya queda.
 *
 * Body: { record } (el HolidayImportRecord de buildHolidayImport). Owner-scoped.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RecordPayload = z.object({
  recordType: z.literal("holiday"),
  title: z.string().min(1),
  subtitle: z.string().nullish(),
  status: z.string().nullish(),
  currentValue: z.number().nullish(),
  currency: z.string().nullish(),
  imageUrl: z.string().nullish(),
  source: z.string().min(1),
  externalId: z.string().nullish(),
  meta: z.record(z.unknown()).optional(),
});
const Body = z.object({ record: RecordPayload });

/** Referencia de reserva de prueba ("H-ABC123"). */
function testRef(prefix: string): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)];
  return `${prefix}-${code}`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const ownerId = await getUserId();
  if (!ownerId) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: CORS });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.flatten() },
      { status: 400, headers: CORS }
    );
  }

  const r = parsed.data.record;
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  const hasFlight = Boolean(meta.transport);
  const hasHotel = Boolean(meta.accommodation);

  // Confirmación SIMULADA (modo prueba). Aquí irán Duffel + LiteAPI cuando haya saldo.
  const booking = {
    mode: "test" as const,
    status: "confirmed" as const,
    hotelRef: hasHotel ? testRef("H") : null,
    flightRef: hasFlight ? testRef("F") : null,
    bookedAtISO: new Date().toISOString(),
  };

  const normalized: NormalizedRecord = {
    recordType: "holiday",
    title: r.title,
    subtitle: r.subtitle ?? null,
    status: "BOOKED",
    currentValue: r.currentValue ?? null,
    currency: r.currency ?? null,
    imageUrl: r.imageUrl ?? null,
    source: r.source,
    externalId: r.externalId ?? null,
    observedAt: new Date(),
    meta: { ...meta, booking },
  };

  try {
    const { id } = await upsertRecord(ownerId, normalized);
    // Garantiza estado BOOKED aunque el viaje ya existiera (upsertHoliday no pisa status).
    await prisma.holiday.update({ where: { id }, data: { status: "BOOKED" } });
    const saved = await getHolidayById(id);
    return NextResponse.json(
      { booking, record: saved ? holidayToBaseRecord(saved) : null },
      { status: 201, headers: CORS }
    );
  } catch (err) {
    console.error("[travel-book] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500, headers: CORS }
    );
  }
}
