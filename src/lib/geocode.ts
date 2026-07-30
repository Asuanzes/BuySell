/**
 * Wrapper de Nominatim (OpenStreetMap) para geocoding.
 * - Gratis, sin API key.
 * - Política de uso: máx 1 req/s, User-Agent identificable obligatorio.
 *
 * Docs: https://operations.osmfoundation.org/policies/nominatim/
 */

const BASE = "https://nominatim.openstreetmap.org/search";
const UA = "Nidokey/1.0 (personal real estate app)";

let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  raw?: unknown;
};

export type GeocodeInput = {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

/**
 * Geocodifica una dirección. Construye varias variantes de query y devuelve
 * el primer resultado válido. Retorna null si no encuentra.
 */
export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult | null> {
  const queries = buildQueries(input);
  for (const q of queries) {
    const result = await geocodeOne(q);
    if (result) return result;
  }
  return null;
}

function buildQueries(input: GeocodeInput): string[] {
  const parts = [input.address, input.postalCode, input.city, input.province, input.country ?? "España"]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];
  const queries: string[] = [];
  if (parts.length) queries.push(parts.join(", "));
  // Variantes más laxas
  if (input.address && input.city) {
    queries.push(`${input.address}, ${input.city}, ${input.country ?? "España"}`);
  }
  if (input.city && input.province) {
    queries.push(`${input.city}, ${input.province}, ${input.country ?? "España"}`);
  }
  // Dedup
  return Array.from(new Set(queries));
}

async function geocodeOne(query: string): Promise<GeocodeResult | null> {
  await throttle();
  const url = `${BASE}?${new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "es",
    addressdetails: "0",
  }).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "es" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      class?: string;
      place_rank?: number;
    }>;
    if (!arr.length) return null;
    const r = arr[0];
    // Solo nivel de CALLE o más fino (place_rank ≥ 26). Un centroide
    // administrativo (municipio/región/país) como "coordenadas" del inmueble
    // es basura activa: el 2026-07-30 14 fichas acabaron con el centroide de
    // Castilla-La Mancha y el embudo catastral devolvía la misma lista de
    // Mejorada (Toledo) para todas. Mejor sin coords que con coords falsas.
    if (r.class === "boundary") return null;
    if (r.place_rank != null && r.place_rank < 26) return null;
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon, displayName: r.display_name, raw: r };
  } catch {
    return null;
  }
}
