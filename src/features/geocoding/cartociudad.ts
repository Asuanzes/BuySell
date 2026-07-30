import { z } from "zod";

/**
 * Adaptador server-side del REST Geocoder oficial de CartoCiudad (IGN/IDEE).
 * Docs: https://www.cartociudad.es/web/portal/directorio-de-servicios/geoprocesamiento
 *       https://github.com/IDEESpain/Cartociudad
 *
 * Uso en Nidokey: transformar una dirección incompleta/problemática en
 * candidatos de dirección+coordenadas (y, cuando el servicio la trae, la RC de
 * PARCELA de 14 chars). La autoridad catastral sigue siendo el OVC: CartoCiudad
 * y Catastro NO comparten exactamente la misma base, así que su `refCatastral`
 * se trata como pista a validar contra DNPRC, nunca como resultado final.
 *
 * Solo server-side. Host fijo (sin URLs construidas desde el cliente → sin
 * SSRF). Al servicio se envían SOLO campos de dirección, jamás la descripción
 * del anuncio.
 */

const CARTOCIUDAD_HOST = "https://www.cartociudad.es";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 500_000;
const MAX_RESULTS = 10;

export class GeocoderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocoderUnavailableError";
  }
}

/** Item real del endpoint /candidates (verificado 2026-07-30 con GET real). */
const CandidateSchema = z.object({
  id: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  muni: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  poblacion: z.string().optional().nullable(),
  tip_via: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  portalNumber: z.union([z.number(), z.string()]).optional().nullable(),
  noNumber: z.boolean().optional().nullable(),
  state: z.number().optional().nullable(),
  refCatastral: z.string().optional().nullable(),
});

const CandidatesResponseSchema = z.array(z.unknown());

export type GeocodedAddress = {
  address: string;
  municipality?: string;
  province?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  /** RC de PARCELA (14) que CartoCiudad asocia al portal; pista, no verdad. */
  parcelRefHint?: string;
  /** "portal", "callejero", "municipio"... — solo "portal" localiza un edificio. */
  type?: string;
};

/**
 * Parseo/filtrado PURO (testeable con fixtures): valida cada item con Zod,
 * descarta los que no traen coordenadas y filtra por provincia/municipio
 * cuando el llamante los conoce. Los items malformados se ignoran, no rompen.
 */
export function parseCandidates(
  raw: unknown,
  filter?: { province?: string | null; municipality?: string | null }
): GeocodedAddress[] {
  const arr = CandidatesResponseSchema.safeParse(raw);
  if (!arr.success) return [];
  const out: GeocodedAddress[] = [];
  const wantProv = filter?.province?.trim().toLowerCase();
  const wantMuni = filter?.municipality?.trim().toLowerCase();
  for (const item of arr.data) {
    const p = CandidateSchema.safeParse(item);
    if (!p.success) continue;
    const c = p.data;
    if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
    if (c.lat < -90 || c.lat > 90 || c.lng < -180 || c.lng > 180) continue;
    if (!c.address) continue;
    if (wantProv && c.province && c.province.trim().toLowerCase() !== wantProv) continue;
    if (wantMuni && c.muni && c.muni.trim().toLowerCase() !== wantMuni) continue;
    out.push({
      address: c.address,
      municipality: c.muni ?? undefined,
      province: c.province ?? undefined,
      postalCode: c.postalCode ?? undefined,
      latitude: c.lat,
      longitude: c.lng,
      parcelRefHint:
        typeof c.refCatastral === "string" && /^[A-Z0-9]{14}$/.test(c.refCatastral.toUpperCase())
          ? c.refCatastral.toUpperCase()
          : undefined,
      type: c.type ?? undefined,
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

// Caché en memoria por instancia (serverless: vive lo que el lambda caliente).
// ponytail: suficiente aquí; si hiciera falta caché cross-instancia, tabla RateLimit-style.
const cache = new Map<string, { at: number; value: GeocodedAddress[] }>();
const CACHE_TTL_MS = 6 * 3600_000;
const CACHE_MAX = 200;

/**
 * Geocodifica una dirección (SOLO campos de dirección: calle+número, municipio,
 * provincia). Distingue "sin resultado" ([]) de "servicio caído" (lanza
 * GeocoderUnavailableError).
 */
export async function geocodeAddress(params: {
  address: string;
  municipality?: string | null;
  province?: string | null;
}): Promise<GeocodedAddress[]> {
  const q = [params.address, params.municipality, params.province]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
  if (!q) return [];

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url = `${CARTOCIUDAD_HOST}/geocoder/api/geocoder/candidates?q=${encodeURIComponent(q)}&limit=${MAX_RESULTS}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Nidokey/1.0 (address resolver)", Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new GeocoderUnavailableError(
      (e as Error).name === "TimeoutError" ? "CartoCiudad: timeout" : `CartoCiudad: ${(e as Error).message}`
    );
  }
  if (res.status >= 500) throw new GeocoderUnavailableError(`CartoCiudad ${res.status}`);
  if (!res.ok) throw new Error(`CartoCiudad ${res.status}: ${res.statusText}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("CartoCiudad: respuesta demasiado grande");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("CartoCiudad devolvió una respuesta no-JSON");
  }
  const value = parseCandidates(json, { province: params.province, municipality: params.municipality });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
