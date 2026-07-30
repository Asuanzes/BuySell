import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CadastreUnavailableError, fetchByRefDetailed } from "@/features/cadastre/lookup";
import { isValidCadastralRef, normalizeCadastralRef } from "@/features/cadastre/ref";
import { resolveCadastre } from "@/features/cadastre/resolver";
import { rankCandidates } from "@/features/cadastre/rank";
import {
  wrapCadastreData,
  type CadastreInfo,
  type CadastreResolution,
  type CadastreResolutionMethod,
  type StoredCadastreData,
  type StoredResolution,
} from "@/features/cadastre/types";
import { rateLimit } from "@/lib/rate-limit";
import { logImportEvent } from "@/lib/import-log";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Caducidad de la caché: los datos catastrales cambian muy despacio. */
const CACHE_TTL_MS = 30 * 24 * 3600_000;

const MethodSchema = z.enum([
  "description",
  "coordinates",
  "nearby_coordinates",
  "address",
  "address_suggestion",
  "cartociudad",
  "map_pin",
  "manual",
]);

const BodySchema = z
  .object({
    // RC explícita: el usuario CONFIRMÓ un candidato o la tecleó a mano.
    // Es el ÚNICO camino que persiste; el resolver nunca asocia solo.
    ref: z.string().min(10).max(30).optional(),
    // Procedencia declarada por el cliente al confirmar (telemetría honesta).
    method: MethodSchema.optional(),
    // Pin ajustado por el usuario en el mapa (capa 4): señal fuerte.
    pin: z
      .object({
        latitude: z.coerce.number().gte(-90).lte(90),
        longitude: z.coerce.number().gte(-180).lte(180),
      })
      .optional(),
    // Overrides manuales para reintentar con datos corregidos.
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    province: z.string().max(100).optional(),
    // Ignorar caché y reconsultar.
    force: z.boolean().optional(),
  })
  .partial();

type Body = z.infer<typeof BodySchema>;

function okPayload(info: CadastreInfo, stored: StoredCadastreData, opts?: { cached?: boolean }) {
  const { raw: _raw, ...infoSinRaw } = info;
  return {
    ok: true as const,
    cached: opts?.cached ?? false,
    ref: info.ref,
    info: infoSinRaw,
    source: stored.source,
    fetchedAt: stored.fetchedAt,
    resolution: stored.resolution,
  };
}

/**
 * Payload del resolver: forma compatible con el "ambiguous" histórico (los
 * builds sin OTA siguen viendo la lista y eligiendo) + `resolution` con el
 * ranking, método, sugerencias del numerero y attempts (sin RC ni dirección).
 */
function resolutionPayload(r: CadastreResolution, warnings: string[] = []) {
  return {
    ok: false as const,
    ambiguous: true as const,
    candidates: r.candidates.slice(0, 60),
    warnings,
    resolution: {
      status: r.status,
      method: r.method,
      confidence: r.candidates[0]?.confidence,
      numberSuggestions: r.numberSuggestions,
      attempts: r.attempts,
    },
  };
}

/** Telemetría agregada: jamás RC completa, dirección, coords ni descripción. */
async function trackEvent(userId: string, name: string, props: Record<string, string | number | boolean>) {
  await prisma.analyticsEvent.create({ data: { userId, name, props } }).catch(() => {});
}

/** Persiste RC + datos normalizados y rellena SOLO campos vacíos de la ficha. */
async function persistInfo(
  propertyId: string,
  property: { yearBuilt: number | null; builtArea: number | null; address: string | null; floor: string | null },
  info: CadastreInfo,
  resolution: StoredResolution
): Promise<StoredCadastreData> {
  const stored = wrapCadastreData(info, resolution);
  const patch: Record<string, unknown> = {
    cadastralRef: info.ref,
    cadastralData: stored as unknown as Record<string, unknown>,
  };
  if (info.yearBuilt && !property.yearBuilt) patch.yearBuilt = info.yearBuilt;
  if (info.builtArea && !property.builtArea) patch.builtArea = info.builtArea;
  if (info.address && !property.address) patch.address = info.address;
  if (info.floor && !property.floor) patch.floor = info.floor;
  await prisma.property.update({ where: { id: propertyId }, data: patch });

  if (info.hasFloorplan && info.floorplanUrl) {
    const exists = await prisma.media.findFirst({
      where: { propertyId, source: "CADASTRE", kind: "FLOORPLAN" },
    });
    if (!exists) {
      await prisma.media.create({
        data: { propertyId, kind: "FLOORPLAN", source: "CADASTRE", url: info.floorplanUrl, caption: "Plano catastral" },
      });
    } else if (exists.url !== info.floorplanUrl) {
      await prisma.media.update({ where: { id: exists.id }, data: { url: info.floorplanUrl } });
    }
  }
  return stored;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { requireUserId } = await import("@/lib/auth-helpers");
  const ownerId = await requireUserId();
  const property = await prisma.property.findFirst({ where: { id, ownerId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cuota: el OVC es un servicio público; no lo castigamos ni dejamos que un
  // cliente roto lo martillee. Por usuario, no por inmueble.
  const rl = await rateLimit("cadastre", ownerId, { limit: 30, windowMs: 3600_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", resetAt: rl.resetAt.toISOString() }, { status: 429 });
  }

  let body: Body = {};
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    /* body vacío = usar datos de la ficha */
  }

  // Si el usuario pasó coords/address manuales, guardarlos si la ficha no los tenía.
  const userPatch: Record<string, unknown> = {};
  if (body.latitude != null && property.latitude == null) userPatch.latitude = body.latitude;
  if (body.longitude != null && property.longitude == null) userPatch.longitude = body.longitude;
  if (body.address && !property.address) userPatch.address = body.address;
  if (Object.keys(userPatch).length) {
    await prisma.property.update({ where: { id }, data: userPatch });
  }

  const signalsBase = {
    floor: property.floor,
    builtArea: property.builtArea,
    yearBuilt: property.yearBuilt,
  };

  try {
    // ── 1. RC explícita: ÚNICO camino que persiste (confirmación del usuario) ─
    if (body.ref) {
      const ref = normalizeCadastralRef(body.ref);
      if (!isValidCadastralRef(ref)) {
        return NextResponse.json({ error: "REF_INVALID" }, { status: 400 });
      }
      const method: CadastreResolutionMethod = body.method ?? "manual";
      const r = await fetchByRefDetailed(ref);
      if (r.kind === "many") {
        // RC de finca: viviendas ordenadas; la elección sigue siendo del usuario.
        const ranked = rankCandidates(r.candidates, { ...signalsBase });
        await trackEvent(ownerId, "cadastre_resolve", {
          status: "ambiguous", method, candidates: ranked.length, confirmed: false,
        });
        return NextResponse.json(
          resolutionPayload({
            status: "ambiguous", method, candidates: ranked, attempts: [{ stage: method, outcome: "hit" }], confirmed: false,
          })
        );
      }
      if (r.kind === "none") {
        await trackEvent(ownerId, "cadastre_resolve", { status: "not_found", method, candidates: 0, confirmed: false });
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      const stored = await persistInfo(id, property, r.info, {
        method,
        resolvedAt: new Date().toISOString(),
        confirmedByUser: true,
      });
      await logImportEvent("CATASTRO", { propertyId: id, ok: true, message: `RC ${r.info.ref} (confirmada)`, meta: { ref: r.info.ref, method } });
      await trackEvent(ownerId, "cadastre_confirm", { method });
      return NextResponse.json(okPayload(r.info, stored));
    }

    // ── 2. Caché fresca (solo consultas sin pin y sin force) ────────────────
    const cachedData = property.cadastralData as unknown as StoredCadastreData | CadastreInfo | null;
    if (!body.force && !body.pin && property.cadastralRef && cachedData && typeof cachedData === "object") {
      const isStored = "schema" in cachedData && "fetchedAt" in cachedData;
      const fetchedAt = isStored ? Date.parse((cachedData as StoredCadastreData).fetchedAt) : NaN;
      if (isStored && Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS) {
        const stored = cachedData as StoredCadastreData;
        return NextResponse.json(okPayload(stored.info, stored, { cached: true }));
      }
    }

    // ── 3. Resolver (embudo completo). NUNCA persiste: propone y el usuario
    //      confirma con body.ref en una llamada posterior. ──────────────────
    const resolution = await resolveCadastre({
      title: property.title,
      description: property.description,
      latitude: body.latitude ?? property.latitude,
      longitude: body.longitude ?? property.longitude,
      address: body.address ?? property.address,
      city: body.city ?? property.city,
      province: body.province ?? property.province,
      ...signalsBase,
      pin: body.pin ?? null,
    });

    await trackEvent(ownerId, "cadastre_resolve", {
      status: resolution.status,
      method: resolution.method ?? "none",
      candidates: resolution.candidates.length,
      suggestions: resolution.numberSuggestions?.length ?? 0,
      stages: resolution.attempts.length,
      confirmed: false,
    });

    if (resolution.status === "upstream_unavailable") {
      await logImportEvent("CATASTRO", { propertyId: id, ok: false, message: "Catastro/geocoder no disponibles" }).catch(() => {});
      return NextResponse.json({ error: "CADASTRE_UNAVAILABLE" }, { status: 503 });
    }
    if (resolution.status === "not_found" || resolution.status === "needs_map_pin") {
      await logImportEvent("CATASTRO", {
        propertyId: id, ok: false,
        message: resolution.attempts.map((a) => `${a.stage}:${a.outcome}`).join(" · ") || "Sin resultado",
      });
      return NextResponse.json(
        { error: "NOT_FOUND", warnings: [], resolution: { status: resolution.status, method: resolution.method, attempts: resolution.attempts } },
        { status: 404 }
      );
    }
    await logImportEvent("CATASTRO", {
      propertyId: id, ok: true,
      message: `${resolution.status} vía ${resolution.method} (${resolution.candidates.length} candidatos)`,
      meta: { method: resolution.method, status: resolution.status },
    });
    return NextResponse.json(resolutionPayload(resolution));
  } catch (e) {
    // Degradación controlada: el fallo del Catastro nunca rompe la ficha.
    if (e instanceof CadastreUnavailableError) {
      await logImportEvent("CATASTRO", { propertyId: id, ok: false, message: e.message }).catch(() => {});
      return NextResponse.json({ error: "CADASTRE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[cadastre] fallo inesperado:", e);
    await logImportEvent("CATASTRO", { propertyId: id, ok: false, message: (e as Error).message }).catch(() => {});
    return NextResponse.json({ error: "CADASTRE_ERROR" }, { status: 502 });
  }
}
