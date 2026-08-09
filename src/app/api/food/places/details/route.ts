import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { isProviderUnavailable } from "@/features/sources/providers/availability";
import { placeDetails } from "@/features/sources/providers/google-places";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

const Query = z.object({
  placeId: z.string().min(3).max(300),
});

export async function GET(req: NextRequest) {
  if (!foodEnabled()) return foodDisabledResponse(); // fase 0: Places factura por petición
  const userId = await requireUserId();
  // Google Places factura por petición: tope diario por usuario.
  const limit = await rateLimit("places-details", userId, { limit: 150, windowMs: 86_400_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Límite diario alcanzado" }, { status: 429 });
  }
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const details = await placeDetails(parsed.data.placeId);
    if (!details) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({
      lat: details.lat,
      lng: details.lng,
      formattedAddress: details.formattedAddress,
      name: details.name,
    });
  } catch (e) {
    if (isProviderUnavailable(e)) {
      return NextResponse.json({ error: "Google Places no disponible", detail: e.message }, { status: 503 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Places no configurado" }, { status: 503 });
  }
}
