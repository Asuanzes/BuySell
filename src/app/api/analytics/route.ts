import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth-helpers";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/analytics — ingesta de eventos de producto (lotes desde el móvil).
 *
 * PÚBLICO a propósito: el embudo de registro empieza ANTES de tener sesión
 * (login_request, login_verify). Defensas: rate limit por IP, allowlist de
 * formato de nombre, tope de lote y de tamaño de props. userId solo del token
 * (nunca del body): un cliente no puede atribuir eventos a otro usuario.
 * PII: no aceptamos props con email/nombre — el catálogo vive en docs/ANALITICA.md.
 */
const Ev = z.object({
  name: z.string().regex(/^[a-z0-9_.]{2,60}$/),
  ts: z.coerce.date().optional(),
  props: z.record(z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
});
const Body = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  events: z.array(Ev).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const ipLimit = await rateLimit("analytics-ip", clientIp(req), { limit: 600, windowMs: 3600_000 });
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: CORS_HEADERS });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400, headers: CORS_HEADERS });
  }

  const userId = await getUserId(); // null = evento anónimo pre-login
  const now = Date.now();
  await prisma.analyticsEvent.createMany({
    data: parsed.data.events.map((e) => ({
      userId,
      deviceId: parsed.data.deviceId ?? null,
      name: e.name,
      props: e.props ?? undefined,
      // ts del cliente acotado a ±24h (relojes rotos no ensucian las series)
      createdAt:
        e.ts && Math.abs(e.ts.getTime() - now) < 86_400_000 ? e.ts : new Date(),
    })),
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
