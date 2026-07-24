import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { flightPricesCheap } from "@/features/sources/providers/travelpayouts";
import { duffelSearchOffers, type DuffelOffer } from "@/features/sources/providers/duffel";

/**
 * GET /api/travel/flights?origin=MAD&destination=BCN&departDate=...&returnDate=...
 *   &adults=2&children=5,8
 *
 * Devuelve una LISTA de opciones de vuelo para que el usuario elija (no solo la
 * más barata). PRIMARIO: Duffel (en vivo, cualquier ruta, EUR). RESPALDO:
 * Travelpayouts cacheado. La reserva real va por afiliado Aviasales (bookUrl).
 */
const Query = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  departDate: z.string().optional(),
  returnDate: z.string().optional(),
  adults: z.coerce.number().int().min(1).max(9).optional(),
  children: z.string().optional(), // edades CSV "5,8"
});

export type FlightOption = {
  offerId: string | null; // id de oferta Duffel (para reserva futura)
  origin: string;
  destination: string;
  priceCents: number;
  currency: string;
  airline: string | null;
  flightNumber: string | null;
  departISO: string | null;
  returnISO: string | null;
  stops: number; // escalas de la ida (0 = directo)
  bookUrl: string;
};

type CheapEntry = {
  price?: number;
  airline?: string;
  flight_number?: number | string;
  departure_at?: string;
  return_at?: string;
};

const MAX_OPTIONS = 6;

function aviasalesUrl(origin: string, destination: string, departDate?: string): string {
  const dep = departDate ? departDate.replace(/-/g, "").slice(2, 6) : "";
  return `https://www.aviasales.com/search/${origin}${dep}${destination}1`;
}

/** Duffel offers → opciones variadas (ordenadas por precio, dedup aerolínea+hora). */
function duffelToOptions(offers: DuffelOffer[], origin: string, destination: string, bookUrl: string): FlightOption[] {
  const sorted = offers
    .filter((o) => Number.isFinite(parseFloat(o.total_amount)))
    .sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
  const seen = new Set<string>();
  const out: FlightOption[] = [];
  for (const o of sorted) {
    const segs = o.slices?.[0]?.segments ?? [];
    const seg = segs[0];
    const airline = o.owner?.name ?? seg?.marketing_carrier?.name ?? "—";
    const key = `${airline}|${seg?.departing_at?.slice(0, 13) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      offerId: o.id,
      origin,
      destination,
      priceCents: Math.round(parseFloat(o.total_amount) * 100),
      currency: o.total_currency || "EUR",
      airline,
      flightNumber:
        seg?.marketing_carrier?.iata_code && seg?.marketing_carrier_flight_number
          ? `${seg.marketing_carrier.iata_code} ${seg.marketing_carrier_flight_number}`
          : null,
      departISO: seg?.departing_at ?? null,
      returnISO: o.slices?.[1]?.segments?.[0]?.departing_at ?? null,
      stops: Math.max(0, segs.length - 1),
      bookUrl,
    });
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Duffel busca en vivo (cuota/coste por petición): tope diario por usuario.
  const limit = await rateLimit("flights-search", userId, { limit: 50, windowMs: 86_400_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Límite diario de búsquedas de vuelos alcanzado" }, { status: 429 });
  }
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const origin = parsed.data.origin.toUpperCase();
  const destination = parsed.data.destination.toUpperCase();
  const { departDate, returnDate } = parsed.data;
  const adults = parsed.data.adults ?? 1;
  const childAges = (parsed.data.children ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17);
  const bookUrl = aviasalesUrl(origin, destination, departDate);

  // 1) PRIMARIO — Duffel (en vivo, varias opciones).
  if (departDate) {
    try {
      const offers = await duffelSearchOffers({ origin, destination, departDate, returnDate, adults, childAges });
      const items = duffelToOptions(offers, origin, destination, bookUrl);
      if (items.length) return NextResponse.json({ items });
    } catch (err) {
      console.error("[travel-flights] duffel:", err instanceof Error ? err.message : err);
    }
  }

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
    const items: FlightOption[] = entries
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
        stops: 0,
        bookUrl,
      }));
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[travel-flights] travelpayouts:", err instanceof Error ? err.message : err);
    return NextResponse.json({ items: [] });
  }
}
