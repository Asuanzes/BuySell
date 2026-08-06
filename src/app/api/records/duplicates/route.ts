import { NextRequest, NextResponse } from "next/server";
import type { RecordType } from "@nidokey/shared";

import { requireUserId } from "@/lib/auth-helpers";
import { scanDuplicates } from "@/features/dedup/scan";

/**
 * GET /api/records/duplicates?type=book
 *
 * Detección ON-DEMAND de duplicados de registros del usuario (owner-scoped).
 * Devuelve `{ groups }` con cada grupo (≥2 fichas) ya mapeado a BaseRecord.
 * Sin `type` escanea todas las verticales con dedup (book/crypto/market/job/
 * property — inmuebles con su motor propio `findSimilar`).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const ownerId = await requireUserId();
  const t = req.nextUrl.searchParams.get("type");
  const groups = await scanDuplicates(ownerId, t ? (t as RecordType) : undefined);
  return NextResponse.json({ groups });
}
