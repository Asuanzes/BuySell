import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { haversineMeters } from "@nidokey/shared";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { isProviderUnavailable } from "@/features/sources/providers/availability";
import { dbRestaurantsNearby, discoverGoogleRestaurants, googlePlacesConfigured } from "@/lib/food/google-restaurants";
import { foodEnabled, foodDisabledResponse } from "@/lib/food/disabled";

const Query = z.object({
  q: z.string().min(2),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusM: z.coerce.number().int().positive().max(50000).default(6000),
});

export async function GET(req: NextRequest) {
  if (!foodEnabled()) return foodDisabledResponse(); // fase 0: Places gasta por petición
  await requireUserId();
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { q, lat, lng, radiusM } = parsed.data;
  if (googlePlacesConfigured()) {
    try {
      const restaurants = await discoverGoogleRestaurants({ lat, lng, radiusM, query: q });
      return NextResponse.json({
        restaurants,
        results: restaurants.map((restaurant) => ({ item: null, restaurant, distanceM: restaurant.distanceM })),
        source: "google",
      });
    } catch (e) {
      if (isProviderUnavailable(e)) {
        return NextResponse.json({ error: "Google Places no disponible", detail: e.message }, { status: 503 });
      }
      throw e;
    }
  }

  console.log("[food-google] GOOGLE_PLACES_API_KEY missing; using DB search fallback");
  const hits = await prisma.menuItem.findMany({
    where: {
      available: true,
      name: { contains: q.trim(), mode: "insensitive" },
      restaurant: { active: true, isOpen: true },
    },
    include: { restaurant: true },
    take: 80,
  });
  const menuResults = hits
    .map((item) => ({
      item,
      restaurant: item.restaurant,
      distanceM: Math.round(haversineMeters(lat, lng, item.restaurant.latitude, item.restaurant.longitude)),
    }))
    .filter((r) => r.distanceM <= Math.min(radiusM, r.restaurant.deliveryRadiusM))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 30);
  const restaurants = await dbRestaurantsNearby({ lat, lng, radiusM, query: q });
  return NextResponse.json({ results: menuResults, restaurants, source: "db-fallback", googlePlaces: { configured: false } });
}
