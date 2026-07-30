import {
  CadastreDataError,
  CadastreUnavailableError,
  fetchByRefDetailed,
  listNearbyParcels,
  lookupByCoordinates,
  parseAddress,
  queryByAddress,
  type DnplocParsed,
  type FetchByRefResult,
  type NearbyParcel,
} from "./lookup";
import { extractCadastralRefs } from "./extract";
import { rankCandidates, type HydratableCandidate, type ListingSignals } from "./rank";
import { geocodeAddress, GeocoderUnavailableError, type GeocodedAddress } from "@/features/geocoding/cartociudad";
import type {
  CadastreCandidate,
  CadastreInfo,
  CadastreResolution,
  CadastreResolutionMethod,
  RankedCadastreCandidate,
  ResolutionAttempt,
} from "./types";

/**
 * Resolver del embudo catastral: máquina de etapas EXPLÍCITA y observable.
 *
 *   1. description  — RC en el texto del anuncio → validar con DNPRC
 *   2. coordinates  — RCCOOR exacto → si vacío, RCCOOR_Distancia (parcelas cercanas)
 *   3. address      — DNPLOC (con numerero → needs_address_confirmation)
 *   4. cartociudad  — geocodificar la dirección → volver a la cadena de coords
 *   (pin del usuario = etapa coordinates con método map_pin y sin fallbacks)
 *
 * Regla innegociable: el resolver JAMÁS asocia una vivienda concreta. Devuelve
 * candidatos ordenados y `confirmed: false`; la confirmación es del usuario.
 * Los attempts no llevan RC completa ni direcciones (van a logs/telemetría).
 */

export type ResolveInput = {
  title?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  // Señales del anuncio para el ranking
  floor?: string | null;
  builtArea?: number | null;
  yearBuilt?: number | null;
  /** Pin confirmado por el usuario (capa 4): señal más fuerte, sin fallbacks. */
  pin?: { latitude: number; longitude: number } | null;
};

/** Dependencias inyectables: los tests pasan fakes y el resolver queda puro. */
export type ResolverDeps = {
  fetchByRefDetailed: (ref: string) => Promise<FetchByRefResult>;
  lookupByCoordinates: (lat: number, lng: number) => Promise<string | null>;
  listNearbyParcels: (lat: number, lng: number, limit?: number) => Promise<NearbyParcel[]>;
  queryByAddress: (p: { province: string; city: string; street: string; number?: string; sigla?: string }) => Promise<DnplocParsed>;
  geocodeAddress: (p: { address: string; municipality?: string | null; province?: string | null }) => Promise<GeocodedAddress[]>;
};

const defaultDeps: ResolverDeps = {
  fetchByRefDetailed,
  lookupByCoordinates,
  listNearbyParcels,
  queryByAddress,
  geocodeAddress,
};

// Hidratación DNPRC de candidatos (superficie/año no vienen en lrcdnp.rcdnp[]):
// limitada y con concurrencia corta para no martillear el OVC. Números de la
// auditoría Codex 2026-07-30: 8 cubre el grueso de portales reales; 2 en vuelo
// mantiene la latencia p95 < ~5 s con el timeout de 10 s por consulta.
const MAX_HYDRATE = 8;
const HYDRATE_CONCURRENCY = 2;
const MAX_DESCRIPTION_REFS = 3; // RCs del texto que llegamos a validar contra DNPRC
const MAX_CANDIDATES = 60;      // mismo tope defensivo que la ruta actual

function candidateFromInfo(info: CadastreInfo): HydratableCandidate {
  return {
    ref: info.ref,
    address: info.address,
    block: info.block,
    stair: info.stair,
    floor: info.floor,
    door: info.door,
    builtArea: info.builtArea,
    yearBuilt: info.yearBuilt,
    use: info.use,
    hydrated: true,
  };
}

/**
 * Hidrata (DNPRC por RC) los candidatos más prometedores del pre-ranking y
 * re-rankea con superficie/año. Fallos parciales conservan el candidato sin
 * hidratar; nunca rompen el conjunto. Si el anuncio no tiene superficie ni año
 * no hay nada que ganar: se salta (0 peticiones extra).
 */
async function hydrateAndRank(
  raw: CadastreCandidate[],
  signals: ListingSignals,
  deps: ResolverDeps,
  cache: Map<string, FetchByRefResult | null>
): Promise<RankedCadastreCandidate[]> {
  const bounded = raw.slice(0, MAX_CANDIDATES);
  const pre = rankCandidates(bounded, signals);
  const worthIt = signals.builtArea != null || signals.yearBuilt != null;
  if (!worthIt) return pre;

  const targets = pre.slice(0, MAX_HYDRATE).filter((c) => c.ref.length === 20);
  let idx = 0;
  const hydrated = new Map<string, HydratableCandidate>();
  async function worker() {
    while (idx < targets.length) {
      const c = targets[idx++];
      try {
        let r = cache.get(c.ref);
        if (r === undefined) {
          r = await deps.fetchByRefDetailed(c.ref);
          cache.set(c.ref, r);
        }
        if (r && r.kind === "one") {
          hydrated.set(c.ref, {
            ...c,
            builtArea: r.info.builtArea ?? c.builtArea,
            yearBuilt: r.info.yearBuilt ?? c.yearBuilt,
            use: r.info.use ?? c.use,
            hydrated: true,
          });
        }
      } catch {
        cache.set(c.ref, null); // fallo parcial: candidato se queda sin hidratar
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(HYDRATE_CONCURRENCY, targets.length) }, worker));

  const merged: HydratableCandidate[] = pre.map((c) => hydrated.get(c.ref) ?? c);
  return rankCandidates(merged, signals);
}

function statusFor(ranked: RankedCadastreCandidate[]): "resolved_candidate" | "ambiguous" {
  // "resolved_candidate" = hay una preselección defendible que mostrar arriba.
  // Sigue exigiendo confirmación; el resto de candidatos jamás se oculta.
  const top = ranked[0];
  if (!top) return "ambiguous";
  if (ranked.length === 1) return "resolved_candidate";
  return top.confidence === "high" || top.confidence === "medium" ? "resolved_candidate" : "ambiguous";
}

export async function resolveCadastre(
  input: ResolveInput,
  deps: ResolverDeps = defaultDeps
): Promise<CadastreResolution> {
  const attempts: ResolutionAttempt[] = [];
  const cache = new Map<string, FetchByRefResult | null>();
  let sawUnavailable = false;

  const parsedAddr = input.address ? parseAddress(input.address) : null;
  const signals: ListingSignals = {
    floor: input.floor,
    builtArea: input.builtArea,
    yearBuilt: input.yearBuilt,
    streetNumber: parsedAddr?.number ?? null,
  };

  function note(stage: CadastreResolutionMethod, outcome: ResolutionAttempt["outcome"], noteText?: string) {
    attempts.push({ stage, outcome, ...(noteText ? { note: noteText } : {}) });
  }

  /** RC (14 o 20) → resolución si el Catastro la reconoce; null para seguir. */
  async function fromRef(
    ref: string,
    method: CadastreResolutionMethod,
    opts?: { minConfidence?: "high" | "medium" }
  ): Promise<CadastreResolution | null> {
    let r = cache.get(ref);
    if (r === undefined) {
      r = await deps.fetchByRefDetailed(ref);
      cache.set(ref, r);
    }
    if (!r || r.kind === "none") return null;
    if (r.kind === "one") {
      const ranked = rankCandidates([candidateFromInfo(r.info)], signals);
      const top = { ...ranked[0] };
      const contradicted = top.reasons.some((x) => x.code.endsWith("_mismatch") || x.code === "surface_far");
      if (opts?.minConfidence === "high" && !contradicted) top.confidence = "high";
      // Única y validada por el OVC → medium, pero NUNCA si el anuncio la
      // contradice (planta/puerta/superficie): revisión Codex 2026-07-30.
      else if (top.confidence === "low" && !contradicted) top.confidence = "medium";
      note(method, "hit");
      return { status: "resolved_candidate", method, candidates: [top], info: r.info, attempts, confirmed: false };
    }
    // Finca con varias viviendas: ordenar, hidratar acotado y presentar.
    const ranked = await hydrateAndRank(r.candidates, signals, deps, cache);
    note(method, "hit", `${ranked.length} candidatos`);
    return { status: statusFor(ranked), method, candidates: ranked, attempts, confirmed: false };
  }

  const wrap = (e: unknown, stage: CadastreResolutionMethod): void => {
    if (e instanceof CadastreUnavailableError || e instanceof GeocoderUnavailableError) {
      sawUnavailable = true;
      note(stage, "error", "unavailable");
    } else if (e instanceof CadastreDataError) {
      note(stage, "empty", `cod ${e.cod}`);
    } else {
      note(stage, "error");
    }
  };

  // ── Pin del usuario: solo la cadena de coordenadas, sin fallbacks ──────────
  if (input.pin) {
    try {
      const parcel = await deps.lookupByCoordinates(input.pin.latitude, input.pin.longitude);
      if (parcel) {
        const r = await fromRef(parcel, "map_pin");
        if (r) return r;
      }
      const nearby = await deps.listNearbyParcels(input.pin.latitude, input.pin.longitude);
      if (nearby.length > 0) {
        const ranked = rankCandidates(
          nearby.map((p) => ({ ref: p.ref, address: p.address, distanceMeters: p.distanceMeters })),
          signals
        );
        note("map_pin", "hit", `${ranked.length} parcelas`);
        return { status: "ambiguous", method: "map_pin", candidates: ranked, attempts, confirmed: false };
      }
      note("map_pin", "empty");
      return { status: "not_found", method: "map_pin", candidates: [], attempts, confirmed: false };
    } catch (e) {
      wrap(e, "map_pin");
      return {
        status: sawUnavailable ? "upstream_unavailable" : "not_found",
        method: "map_pin",
        candidates: [],
        attempts,
        confirmed: false,
      };
    }
  }

  // ── 1. RC en el texto del anuncio ─────────────────────────────────────────
  const extracted = extractCadastralRefs([input.title, input.description]).slice(0, MAX_DESCRIPTION_REFS);
  if (extracted.length === 0) {
    note("description", "empty");
  } else {
    for (const ex of extracted) {
      try {
        const r = await fromRef(ex.ref, "description", {
          // Alta SOLO si la RC completa venía ETIQUETADA ("referencia
          // catastral: …") además de reconocida por DNPRC. Una cadena suelta
          // que valide podría ser un identificador ajeno (revisión Codex).
          minConfidence: ex.kind === "unit" && ex.labeled ? "high" : undefined,
        });
        if (r) return r;
      } catch (e) {
        wrap(e, "description");
      }
    }
    note("description", "empty", "no validada por DNPRC");
  }

  // ── 2. Coordenadas de la ficha (aproximadas: vienen del portal) ───────────
  if (input.latitude != null && input.longitude != null) {
    try {
      const parcel = await deps.lookupByCoordinates(input.latitude, input.longitude);
      if (parcel) {
        const r = await fromRef(parcel, "coordinates");
        if (r) return r;
      } else {
        note("coordinates", "empty");
      }
    } catch (e) {
      wrap(e, "coordinates");
    }
    try {
      const nearby = await deps.listNearbyParcels(input.latitude, input.longitude);
      if (nearby.length > 0) {
        const ranked = rankCandidates(
          nearby.map((p) => ({ ref: p.ref, address: p.address, distanceMeters: p.distanceMeters })),
          signals
        );
        note("nearby_coordinates", "hit", `${ranked.length} parcelas`);
        return { status: "ambiguous", method: "nearby_coordinates", candidates: ranked, attempts, confirmed: false };
      }
      note("nearby_coordinates", "empty");
    } catch (e) {
      wrap(e, "nearby_coordinates");
    }
  } else {
    note("coordinates", "skipped", "sin coordenadas");
  }

  // ── 3. Dirección (DNPLOC + numerero) ──────────────────────────────────────
  if (input.province && input.city && parsedAddr) {
    try {
      const r = await deps.queryByAddress({
        province: input.province,
        city: input.city,
        street: parsedAddr.street,
        number: parsedAddr.number,
        sigla: parsedAddr.sigla,
      });
      if (r.kind === "one") {
        const res = await fromRef(r.ref, "address");
        if (res) return res;
      } else if (r.kind === "candidates") {
        const ranked = await hydrateAndRank(r.candidates, signals, deps, cache);
        note("address", "hit", `${ranked.length} candidatos`);
        return { status: statusFor(ranked), method: "address", candidates: ranked, attempts, confirmed: false };
      } else if (r.kind === "number_suggestions") {
        note("address_suggestion", "hit", `${r.suggestions.length} números`);
        return {
          status: "needs_address_confirmation",
          method: "address_suggestion",
          candidates: [],
          numberSuggestions: r.suggestions,
          attempts,
          confirmed: false,
        };
      } else {
        note("address", "empty");
      }
    } catch (e) {
      wrap(e, "address");
    }
  } else {
    note("address", "skipped", parsedAddr ? "sin provincia/municipio" : "sin dirección interpretable");
  }

  // ── 4. CartoCiudad: dirección → coordenadas/parcela → cadena de coords ────
  if (input.address && (input.city || input.province)) {
    try {
      const geo = await deps.geocodeAddress({
        address: input.address,
        municipality: input.city,
        province: input.province,
      });
      const portals = geo.filter((g) => g.type === "portal");
      const pick = portals.length > 0 ? portals : geo;
      if (pick.length === 0) {
        note("cartociudad", "empty");
      } else if (pick.length === 1 || portals.length === 1) {
        const g = portals[0] ?? pick[0];
        // La RC de parcela de CartoCiudad es una PISTA: siempre se valida vía DNPRC.
        if (g.parcelRefHint) {
          const r = await fromRef(g.parcelRefHint, "cartociudad");
          if (r) return r;
        }
        const parcel = await deps.lookupByCoordinates(g.latitude, g.longitude);
        if (parcel) {
          const r = await fromRef(parcel, "cartociudad");
          if (r) return r;
        }
        const nearby = await deps.listNearbyParcels(g.latitude, g.longitude);
        if (nearby.length > 0) {
          const ranked = rankCandidates(
            nearby.map((p) => ({ ref: p.ref, address: p.address, distanceMeters: p.distanceMeters })),
            signals
          );
          note("cartociudad", "hit", `${ranked.length} parcelas`);
          return { status: "ambiguous", method: "cartociudad", candidates: ranked, attempts, confirmed: false };
        }
        note("cartociudad", "empty");
      } else {
        // Varias direcciones plausibles: el mapa con pin es la desambiguación
        // diseñada (el usuario ve dónde cae cada opción y ajusta).
        note("cartociudad", "hit", `${pick.length} direcciones ambiguas`);
      }
    } catch (e) {
      wrap(e, "cartociudad");
    }
  } else {
    note("cartociudad", "skipped");
  }

  // ── Terminal: sin coincidencia clara → pin en mapa (capa 4) ───────────────
  if (sawUnavailable) {
    return { status: "upstream_unavailable", method: null, candidates: [], attempts, confirmed: false };
  }
  return { status: "needs_map_pin", method: null, candidates: [], attempts, confirmed: false };
}
