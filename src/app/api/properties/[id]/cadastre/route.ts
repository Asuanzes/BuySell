import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CadastreUnavailableError,
  fetchByRefDetailed,
  listCandidatesByAddress,
  lookupByCoordinates,
  parseAddress,
} from "@/features/cadastre/lookup";
import { isValidCadastralRef, normalizeCadastralRef } from "@/features/cadastre/ref";
import { wrapCadastreData, type CadastreCandidate, type CadastreInfo, type StoredCadastreData } from "@/features/cadastre/types";
import { rateLimit } from "@/lib/rate-limit";
import { logImportEvent } from "@/lib/import-log";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Caducidad de la caché: los datos catastrales cambian muy despacio. */
const CACHE_TTL_MS = 30 * 24 * 3600_000;

const BodySchema = z
  .object({
    // RC explícita: el usuario eligió un candidato o la tecleó a mano.
    ref: z.string().min(10).max(30).optional(),
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
  };
}

function ambiguousPayload(candidates: CadastreCandidate[], warnings: string[] = []) {
  // Tope defensivo: una calle entera puede devolver cientos de unidades.
  return { ok: false as const, ambiguous: true as const, candidates: candidates.slice(0, 60), warnings };
}

/** Persiste RC + datos normalizados y rellena SOLO campos vacíos de la ficha. */
async function persistInfo(propertyId: string, property: { yearBuilt: number | null; builtArea: number | null; address: string | null; floor: string | null }, info: CadastreInfo): Promise<StoredCadastreData> {
  const stored = wrapCadastreData(info);
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

  try {
    // ── 1. RC explícita (candidato elegido o tecleada) ──────────────────────
    if (body.ref) {
      const ref = normalizeCadastralRef(body.ref);
      if (!isValidCadastralRef(ref)) {
        return NextResponse.json({ error: "REF_INVALID" }, { status: 400 });
      }
      const r = await fetchByRefDetailed(ref);
      if (r.kind === "many") return NextResponse.json(ambiguousPayload(r.candidates));
      if (r.kind === "none") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      const stored = await persistInfo(id, property, r.info);
      await logImportEvent("CATASTRO", { propertyId: id, ok: true, message: `RC ${r.info.ref} (manual)`, meta: { ref: r.info.ref, method: "ref" } });
      return NextResponse.json(okPayload(r.info, stored));
    }

    // ── 2. Caché fresca ─────────────────────────────────────────────────────
    const cachedData = property.cadastralData as unknown as StoredCadastreData | CadastreInfo | null;
    if (!body.force && property.cadastralRef && cachedData && typeof cachedData === "object") {
      const isStored = "schema" in cachedData && "fetchedAt" in cachedData;
      const fetchedAt = isStored ? Date.parse((cachedData as StoredCadastreData).fetchedAt) : NaN;
      if (isStored && Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS) {
        const stored = cachedData as StoredCadastreData;
        return NextResponse.json(okPayload(stored.info, stored, { cached: true }));
      }
    }

    // ── 3. Búsqueda: coordenadas primero, dirección después ─────────────────
    const warnings: string[] = [];
    const lat = body.latitude ?? property.latitude;
    const lng = body.longitude ?? property.longitude;

    if (lat != null && lng != null) {
      try {
        const parcelRef = await lookupByCoordinates(lat, lng);
        if (parcelRef) {
          const r = await fetchByRefDetailed(parcelRef);
          if (r.kind === "one") {
            const stored = await persistInfo(id, property, r.info);
            await logImportEvent("CATASTRO", { propertyId: id, ok: true, message: `RC ${r.info.ref} vía coords`, meta: { ref: r.info.ref, method: "coords" } });
            return NextResponse.json(okPayload(r.info, stored));
          }
          if (r.kind === "many") return NextResponse.json(ambiguousPayload(r.candidates, warnings));
          warnings.push(`La parcela ${parcelRef} no tiene datos descriptivos`);
        } else {
          warnings.push("Sin resultado por coordenadas");
        }
      } catch (e) {
        if (e instanceof CadastreUnavailableError) throw e;
        warnings.push(`Coordenadas: ${(e as Error).message}`);
      }
    } else {
      warnings.push("Sin coordenadas en la ficha");
    }

    const provinceIn = body.province ?? property.province;
    const cityIn = body.city ?? property.city;
    const addressIn = body.address ?? property.address;
    if (provinceIn && cityIn && addressIn) {
      const parsed = parseAddress(addressIn);
      if (parsed) {
        try {
          const candidates = await listCandidatesByAddress({
            province: provinceIn,
            city: cityIn,
            street: parsed.street,
            number: parsed.number,
            sigla: parsed.sigla,
          });
          if (candidates.length > 1) return NextResponse.json(ambiguousPayload(candidates, warnings));
          if (candidates.length === 1) {
            const r = await fetchByRefDetailed(candidates[0].ref);
            if (r.kind === "one") {
              const stored = await persistInfo(id, property, r.info);
              await logImportEvent("CATASTRO", { propertyId: id, ok: true, message: `RC ${r.info.ref} vía dirección`, meta: { ref: r.info.ref, method: "address" } });
              return NextResponse.json(okPayload(r.info, stored));
            }
            if (r.kind === "many") return NextResponse.json(ambiguousPayload(r.candidates, warnings));
            warnings.push("El inmueble localizado no tiene datos descriptivos");
          } else {
            warnings.push("Sin resultado por dirección");
          }
        } catch (e) {
          if (e instanceof CadastreUnavailableError) throw e;
          warnings.push(`Dirección: ${(e as Error).message}`);
        }
      } else {
        warnings.push("No se pudo interpretar la dirección");
      }
    }

    await logImportEvent("CATASTRO", { propertyId: id, ok: false, message: warnings.join(" · ") || "Sin resultado", meta: { warnings } });
    return NextResponse.json({ error: "NOT_FOUND", warnings }, { status: 404 });
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
