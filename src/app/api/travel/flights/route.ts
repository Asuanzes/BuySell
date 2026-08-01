import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { flightPricesCheap } from "@/features/sources/providers/travelpayouts";
import { duffelSearchOffers } from "@/features/sources/providers/duffel";
import { aiFlightSearch } from "@/features/travel/ai-search";
import {
  FlightSearchQuery,
  MAX_DUFFEL_CALLS_AI,
  MAX_OPTIONS,
  aviasalesUrl,
  duffelToOptions,
  type FlightOption,
  type FlightSearchResponse,
} from "@/features/travel/flight-search";

/**
 * GET /api/travel/flights?origin=MAD&destination=BCN&departDate=...&returnDate=...
 *   &adults=2&children=5,8&aiSearch=1&lang=es
 *
 * Devuelve una LISTA de opciones de vuelo para que el usuario elija (no solo la
 * más barata). PRIMARIO: Duffel (en vivo, cualquier ruta, EUR). RESPALDO:
 * Travelpayouts cacheado. La reserva real va por afiliado Aviasales (bookUrl).
 *
 * Con `aiSearch=1` se explora además la matriz de fechas ±2 días y el billete
 * partido (dos solo-idas), con presupuesto duro de llamadas a Duffel — ver
 * src/features/travel/ai-search.ts. Sin él, el comportamiento es el de siempre.
 */

/** Tope diario de búsquedas EN VIVO por usuario (Duffel cobra por petición). */
const DAILY_SEARCH_LIMIT = 50;
const DAY_MS = 86_400_000;

type CheapEntry = {
  price?: number;
  airline?: string;
  flight_number?: number | string;
  departure_at?: string;
  return_at?: string;
};

export type { FlightOption };

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Duffel busca en vivo (cuota/coste por petición): tope diario por usuario.
  // Se cobra 1 por adelantado; la búsqueda IA liquida después lo que gastó de más.
  const limit = await rateLimit("flights-search", userId, { limit: DAILY_SEARCH_LIMIT, windowMs: DAY_MS });
  if (!limit.ok) {
    return NextResponse.json({ error: "Límite diario de búsquedas de vuelos alcanzado" }, { status: 429 });
  }
  const parsed = FlightSearchQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const origin = parsed.data.origin.toUpperCase();
  const destination = parsed.data.destination.toUpperCase();
  const { departDate, returnDate, aiSearch } = parsed.data;
  const adults = parsed.data.adults ?? 1;
  const childAges = (parsed.data.children ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17);
  const bookUrl = aviasalesUrl(origin, destination, departDate, returnDate, adults + childAges.length);

  // 0) BÚSQUEDA IA — matriz de fechas ±2 + billete partido, con presupuesto.
  if (aiSearch && departDate) {
    // `limit.remaining` es lo que queda TRAS cobrar esta petición; +1 porque la
    // primera llamada a Duffel (el baseline) ya está pagada con ese cobro.
    const budget = Math.min(MAX_DUFFEL_CALLS_AI, 1 + limit.remaining);
    if (budget < 2) {
      // Sin margen para explorar: se sirve búsqueda normal y se dice por qué.
      const items = await normalSearch({ origin, destination, departDate, returnDate, adults, childAges, bookUrl });
      const body: FlightSearchResponse = {
        items,
        ai: { baselineCents: items[0]?.priceCents ?? null, duffelCalls: { max: budget, used: 1 }, partial: false, degraded: "quota", summary: null },
      };
      return NextResponse.json(body);
    }
    try {
      const { items, ai } = await aiFlightSearch({
        origin,
        destination,
        departDate,
        returnDate,
        adults,
        childAges,
        lang: parsed.data.lang ?? "es",
        maxDuffelCalls: budget,
      });
      // Liquidación: ya se cobró 1 al entrar; se descuenta el resto realmente usado.
      if (ai.duffelCalls.used > 1) {
        await rateLimit("flights-search", userId, {
          limit: DAILY_SEARCH_LIMIT,
          windowMs: DAY_MS,
          cost: ai.duffelCalls.used - 1,
        });
      }
      if (items.length) return NextResponse.json({ items, ai } satisfies FlightSearchResponse);
    } catch (err) {
      console.error("[travel-flights] ai:", err instanceof Error ? err.message : err);
    }
    // Sin resultados IA (o error): cae al camino normal de abajo.
  }

  // 1) PRIMARIO — Duffel (en vivo, varias opciones).
  const items = await normalSearch({ origin, destination, departDate, returnDate, adults, childAges, bookUrl });
  if (items.length) return NextResponse.json({ items } satisfies FlightSearchResponse);

  // 2) RESPALDO — Travelpayouts cacheado (pocas opciones, rutas populares).
  try {
    const pick = (r: { data?: unknown }): CheapEntry[] =>
      Object.values((r.data as Record<string, Record<string, CheapEntry>> | undefined)?.[destination] ?? {}).filter(
        (e): e is CheapEntry => typeof (e as CheapEntry)?.price === "number"
      );
    const departMonth = departDate ? departDate.slice(0, 7) : undefined;
    const returnMonth = returnDate ? returnDate.slice(0, 7) : undefined;
    let entries = pick(
      await flightPricesCheap({ origin, destination, departDate: departMonth, returnDate: returnMonth, currency: "eur" })
    );
    if (entries.length === 0) entries = pick(await flightPricesCheap({ origin, destination, currency: "eur" }));
    const fallback: FlightOption[] = entries
      .sort((a, b) => a.price! - b.price!)
      .slice(0, MAX_OPTIONS)
      .map((e) => ({
        offerId: null,
        origin,
        destination,
        priceCents: Math.round(e.price! * 100),
        currency: "EUR",
        airline: e.airline ?? null,
        flightNumber: e.flight_number != null ? String(e.flight_number) : null,
        departISO: e.departure_at ?? null,
        returnISO: e.return_at ?? null,
        returnArriveISO: null,
        stops: 0,
        bookUrl,
      }));
    return NextResponse.json({ items: fallback } satisfies FlightSearchResponse);
  } catch (err) {
    console.error("[travel-flights] travelpayouts:", err instanceof Error ? err.message : err);
    return NextResponse.json({ items: [] } satisfies FlightSearchResponse);
  }
}

/** Búsqueda de siempre: UNA llamada a Duffel con las fechas exactas. */
async function normalSearch(p: {
  origin: string;
  destination: string;
  departDate?: string;
  returnDate?: string;
  adults: number;
  childAges: number[];
  bookUrl: string;
}): Promise<FlightOption[]> {
  if (!p.departDate) return [];
  try {
    const offers = await duffelSearchOffers({
      origin: p.origin,
      destination: p.destination,
      departDate: p.departDate,
      returnDate: p.returnDate,
      adults: p.adults,
      childAges: p.childAges,
    });
    return duffelToOptions(offers, { origin: p.origin, destination: p.destination, bookUrl: p.bookUrl });
  } catch (err) {
    console.error("[travel-flights] duffel:", err instanceof Error ? err.message : err);
    return [];
  }
}
