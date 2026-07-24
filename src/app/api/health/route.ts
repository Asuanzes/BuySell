import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/health — health check público (monitorización externa).
 * Sin datos sensibles: solo estado y latencia de BBDD.
 */
export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, dbMs: Date.now() - t0 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
