import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { isProviderUnavailable } from "@/features/sources/providers/availability";
import { dbRestaurantsNearby, discoverGoogleRestaurants, googlePlacesConfigured } from "@/lib/food/google-restaurants";
import { enqueueMenusForList, isDeliveryCuisine } from "@/lib/food/menu-scrape";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

/** Solo mostramos cocinas de delivery (pizza, burger, kebab, sushi, mexicano…). Fuera
 *  bares/sidrerías/cafés que ni se piden a domicilio ni tendrán carta. */
function onlyDelivery<T extends { types?: string[]; cuisineTypes?: string[] }>(rows: T[]): T[] {
  return rows.filter((r) => isDeliveryCuisine(r.types) || isDeliveryCuisine(r.cuisineTypes));
}

export const maxDuration = 300;

const Query = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  q: z.string().optional(),
  radiusM: z.coerce.number().int().positive().max(50000).default(6000),
});

export async function GET(req: NextRequest) {
  if (!foodEnabled()) return foodDisabledResponse(); // fase 0: Places + enqueue gastan
  await requireUserId();
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lng, q, radiusM } = parsed.data;
  if (!googlePlacesConfigured()) {
    console.log("[food-google] GOOGLE_PLACES_API_KEY missing; using DB fallback");
    const restaurants = onlyDelivery(await dbRestaurantsNearby({ lat, lng, radiusM, query: q }));
    return NextResponse.json({ restaurants, source: "db-fallback", googlePlaces: { configured: false } });
  }
  try {
    const discovered = await discoverGoogleRestaurants({ lat, lng, radiusM, query: q });
    const restaurants = onlyDelivery(discovered); // fuera bares/cafés sin menú
    // Encola los menús de los más cercanos (1 UPDATE); el worker los scrapea en background.
    after(() => enqueueMenusForList(restaurants, 3));
    return NextResponse.json({ restaurants, source: "google" });
  } catch (e) {
    if (isProviderUnavailable(e)) {
      return NextResponse.json({ error: "Google Places no disponible", detail: e.message }, { status: 503 });
    }
    throw e;
  }
}
