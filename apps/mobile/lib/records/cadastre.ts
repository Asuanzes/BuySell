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

/** Razón de puntuación (código estable + valores comparados); se traduce aquí. */
export type CandidateReason = { code: string; listing?: string | number; cadastre?: string | number };

/** Candidato ordenado por el resolver del backend (espejo de RankedCadastreCandidate). */
export type RankedCandidate = CadastreCandidate & {
  builtArea?: number;
  yearBuilt?: number;
  use?: string;
  distanceMeters?: number;
  hydrated?: boolean;
  score?: number;
  confidence?: "high" | "medium" | "low";
  reasons?: CandidateReason[];
};

export type ResolutionMethod =
  | "description"
  | "coordinates"
  | "nearby_coordinates"
  | "address"
  | "address_suggestion"
  | "cartociudad"
  | "map_pin"
  | "manual";

export type ResolutionStatus =
  | "resolved_candidate"
  | "ambiguous"
  | "needs_address_confirmation"
  | "needs_map_pin"
  | "not_found"
  | "upstream_unavailable";

export type NumberSuggestion = { number: string; parcelRef: string };

export type ResolutionMeta = {
  status: ResolutionStatus;
  method: ResolutionMethod | null;
  confidence?: "high" | "medium" | "low";
  numberSuggestions?: NumberSuggestion[];
  attempts?: Array<{ stage: string; outcome: string; note?: string }>;
};

/** Metadatos persistidos junto a los datos (schema 2). */
export type StoredResolution = {
  method: ResolutionMethod;
  resolvedAt: string;
  confirmedByUser: boolean;
  confidence?: "high" | "medium" | "low";
};

export type CadastreView = {
  info: CadastreInfo;
  /** ISO de la última consulta; null en filas legadas sin fecha. */
  fetchedAt: string | null;
  source: string;
  /** Metadatos de resolución (schema 2): método, confirmación, confianza. */
  resolution: StoredResolution | null;
};

/**
 * Property.cadastralData admite tres formas: legado (CadastreInfo a pelo),
 * schema 1 ({ schema, source, fetchedAt, info }) y schema 2 (añade
 * resolution). Normalizamos aquí; un schema futuro con `info` también se lee.
 */
export function parseCadastralData(raw: unknown): CadastreView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.schema === "number" && o.info && typeof o.info === "object") {
    return {
      info: o.info as CadastreInfo,
      fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : null,
      source: typeof o.source === "string" ? o.source : "Sede Electrónica del Catastro (OVC)",
      resolution:
        o.resolution && typeof o.resolution === "object" ? (o.resolution as StoredResolution) : null,
    };
  }
  if (typeof o.ref === "string") {
    return {
      info: o as unknown as CadastreInfo,
      fetchedAt: null,
      source: "Sede Electrónica del Catastro (OVC)",
      resolution: null,
    };
  }
  return null;
}

export type CadastreLookupResult =
  | { kind: "ok"; info: CadastreInfo; fetchedAt: string; source: string; cached: boolean; resolution?: StoredResolution }
  | { kind: "ambiguous"; candidates: RankedCandidate[]; warnings: string[]; resolution?: ResolutionMeta }
  | { kind: "not_found"; warnings: string[]; resolution?: ResolutionMeta }
  | { kind: "unavailable" }
  | { kind: "rate_limited" }
  | { kind: "ref_invalid" }
  | { kind: "error"; message: string };

type OkBody = {
  ok: true; cached: boolean; ref: string; info: CadastreInfo; source: string; fetchedAt: string;
  resolution?: StoredResolution;
};
type AmbiguousBody = {
  ok: false; ambiguous: true; candidates: RankedCandidate[]; warnings?: string[]; resolution?: ResolutionMeta;
};

export type LookupBody = {
  /** RC confirmada por el usuario (candidato elegido o tecleada a mano). */
  ref?: string;
  /** Procedencia del flujo que produjo la RC/las coords (telemetría honesta). */
  method?: ResolutionMethod;
  /** Pin ajustado en el mapa por el usuario. */
  pin?: { latitude: number; longitude: number };
  address?: string;
  city?: string;
  province?: string;
  force?: boolean;
};

/**
 * POST /api/properties/[id]/cadastre. Nunca lanza: todos los fallos del
 * servicio público bajan como estados presentables. El backend JAMÁS asocia
 * una vivienda solo: sin `ref` devuelve candidatos y aquí se confirma.
 */
export async function lookupCadastre(
  propertyId: string,
  body: LookupBody = {}
): Promise<CadastreLookupResult> {
  try {
    const r = await api<OkBody | AmbiguousBody>(`/api/properties/${propertyId}/cadastre`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 45_000,
    });
    if ("ambiguous" in r && r.ambiguous) {
      return { kind: "ambiguous", candidates: r.candidates, warnings: r.warnings ?? [], resolution: r.resolution };
    }
    const ok = r as OkBody;
    return { kind: "ok", info: ok.info, fetchedAt: ok.fetchedAt, source: ok.source, cached: ok.cached, resolution: ok.resolution };
  } catch (e) {
    if (e instanceof ApiError) {
      const code = (e.body as { error?: string } | null)?.error ?? e.message;
      if (e.status === 503 || code === "CADASTRE_UNAVAILABLE" || e.status === 0) return { kind: "unavailable" };
      if (e.status === 429) return { kind: "rate_limited" };
      if (code === "REF_INVALID") return { kind: "ref_invalid" };
      if (e.status === 404) {
        const b = e.body as { warnings?: string[]; resolution?: ResolutionMeta } | null;
        return { kind: "not_found", warnings: b?.warnings ?? [], resolution: b?.resolution };
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
