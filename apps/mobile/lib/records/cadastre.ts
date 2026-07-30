import { api, ApiError } from "@/lib/api";

/**
 * Dominio "cadastre" en el móvil: tipos espejo de src/features/cadastre/types.ts
 * (el móvil no puede importar código del server) + cliente del endpoint.
 */

export type CadastreUnit = {
  use?: string;
  area?: number;
  stair?: string;
  floor?: string;
  door?: string;
};

export type CadastreInfo = {
  ref: string;
  landType?: "UR" | "RU";
  address?: string;
  province?: string;
  municipality?: string;
  postalCode?: string;
  block?: string;
  stair?: string;
  floor?: string;
  door?: string;
  use?: string;
  builtArea?: number;
  yearBuilt?: number;
  plotArea?: number;
  participation?: string;
  units?: CadastreUnit[];
  hasFloorplan?: boolean;
  floorplanUrl?: string;
};

export type CadastreCandidate = {
  ref: string;
  address?: string;
  block?: string;
  stair?: string;
  floor?: string;
  door?: string;
};

export type CadastreView = {
  info: CadastreInfo;
  /** ISO de la última consulta; null en filas legadas sin fecha. */
  fetchedAt: string | null;
  source: string;
};

/**
 * Property.cadastralData admite dos formas: legado (CadastreInfo a pelo) y
 * schema 1 ({ schema, source, fetchedAt, info }). Normalizamos aquí.
 */
export function parseCadastralData(raw: unknown): CadastreView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema === 1 && o.info && typeof o.info === "object") {
    return {
      info: o.info as CadastreInfo,
      fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : null,
      source: typeof o.source === "string" ? o.source : "Sede Electrónica del Catastro (OVC)",
    };
  }
  if (typeof o.ref === "string") {
    return { info: o as unknown as CadastreInfo, fetchedAt: null, source: "Sede Electrónica del Catastro (OVC)" };
  }
  return null;
}

export type CadastreLookupResult =
  | { kind: "ok"; info: CadastreInfo; fetchedAt: string; source: string; cached: boolean }
  | { kind: "ambiguous"; candidates: CadastreCandidate[]; warnings: string[] }
  | { kind: "not_found"; warnings: string[] }
  | { kind: "unavailable" }
  | { kind: "rate_limited" }
  | { kind: "ref_invalid" }
  | { kind: "error"; message: string };

type OkBody = { ok: true; cached: boolean; ref: string; info: CadastreInfo; source: string; fetchedAt: string };
type AmbiguousBody = { ok: false; ambiguous: true; candidates: CadastreCandidate[]; warnings?: string[] };

/**
 * POST /api/properties/[id]/cadastre. Nunca lanza: todos los fallos del
 * servicio público bajan como estados presentables.
 */
export async function lookupCadastre(
  propertyId: string,
  body: { ref?: string; address?: string; city?: string; province?: string; force?: boolean } = {}
): Promise<CadastreLookupResult> {
  try {
    const r = await api<OkBody | AmbiguousBody>(`/api/properties/${propertyId}/cadastre`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 45_000,
    });
    if ("ambiguous" in r && r.ambiguous) {
      return { kind: "ambiguous", candidates: r.candidates, warnings: r.warnings ?? [] };
    }
    const ok = r as OkBody;
    return { kind: "ok", info: ok.info, fetchedAt: ok.fetchedAt, source: ok.source, cached: ok.cached };
  } catch (e) {
    if (e instanceof ApiError) {
      const code = (e.body as { error?: string } | null)?.error ?? e.message;
      if (e.status === 503 || code === "CADASTRE_UNAVAILABLE" || e.status === 0) return { kind: "unavailable" };
      if (e.status === 429) return { kind: "rate_limited" };
      if (code === "REF_INVALID") return { kind: "ref_invalid" };
      if (e.status === 404) {
        const warnings = (e.body as { warnings?: string[] } | null)?.warnings ?? [];
        return { kind: "not_found", warnings };
      }
      return { kind: "error", message: e.message };
    }
    return { kind: "error", message: e instanceof Error ? e.message : "?" };
  }
}

/** URL pública de la Sede Electrónica del Catastro para una RC. */
export function sedeCatastroUrl(ref: string): string {
  return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=${encodeURIComponent(ref)}&pest=rc&final=&del=&mun=`;
}
