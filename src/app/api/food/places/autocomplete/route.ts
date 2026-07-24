import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { isProviderUnavailable } from "@/features/sources/providers/availability";
import { placeAutocomplete } from "@/features/sources/providers/google-places";

const Query = z.object({
  input: z.string().min(2).max(180),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  sessionToken: z.string().min(8).max(120).optional(),
});

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  // Google Places factura por petición: tope diario por usuario (holgado para
  // uso legítimo, corta el abuso con script).
  const limit = await rateLimit("places-auto", userId, { limit: 300, windowMs: 86_400_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Límite diario de búsquedas alcanzado" }, { status: 429 });
  }
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const suggestions = await placeAutocomplete(parsed.data);
    return NextResponse.json({ suggestions });
  } catch (e) {
    if (isProviderUnavailable(e)) {
      return NextResponse.json({ error: "Google Places no disponible", detail: e.message }, { status: 503 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Places no configurado" }, { status: 503 });
  }
}
