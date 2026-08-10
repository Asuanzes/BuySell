import { NextRequest, NextResponse } from "next/server";

import { runWeeklyDigest } from "@/lib/alerts/weekly-digest";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runWeeklyDigest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[weekly-digest] cron error:", err);
    return NextResponse.json({ error: "No se pudo enviar el resumen semanal" }, { status: 500 });
  }
}
