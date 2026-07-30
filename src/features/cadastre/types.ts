export type CadastreInfo = {
  ref: string;
  /** "UR" (urbano) | "RU" (rústico) según el Catastro; undefined si no consta. */
  landType?: "UR" | "RU";
  address?: string;
  province?: string;
  municipality?: string;
  postalCode?: string;
  block?: string;   // bloque
  stair?: string;   // escalera
  floor?: string;   // planta
  door?: string;    // puerta
  use?: string;          // "Residencial", "Comercial"...
  builtArea?: number;    // m²
  yearBuilt?: number;
  /** Superficie de suelo de la finca/parcela (m²), si el servicio la da. */
  plotArea?: number;
  /** Coeficiente de participación (%), tal cual lo da el Catastro. */
  participation?: string;
  /** Unidades constructivas (lcons): uso + superficie + localización interna. */
  units?: CadastreUnit[];
  hasFloorplan: boolean;
  floorplanUrl?: string; // PDF/PNG si disponible
  raw?: unknown;
};

export type CadastreUnit = {
  use?: string;
  area?: number; // m²
  stair?: string;
  floor?: string;
  door?: string;
};

/**
 * Candidato cuando una dirección/parcela corresponde a VARIOS inmuebles.
 * El usuario elige por bloque/escalera/planta/puerta; nunca elegimos nosotros.
 */
export type CadastreCandidate = {
  ref: string;
  address?: string;
  block?: string;
  stair?: string;
  floor?: string;
  door?: string;
};

/** Razón de puntuación de un candidato, con los valores comparados. El código
 *  es estable (el móvil lo traduce); listing/cadastre son los valores crudos. */
export type CandidateReason = {
  code: string;
  listing?: string | number;
  cadastre?: string | number;
};

/**
 * Candidato ORDENADO por el ranking determinista (rank.ts). El score y las
 * razones son explicables; la confianza deriva del score y del gap con el 2º
 * candidato, nunca es una probabilidad inventada.
 */
export type RankedCadastreCandidate = CadastreCandidate & {
  builtArea?: number;
  yearBuilt?: number;
  use?: string;
  /** Distancia en metros cuando el candidato viene de RCCOOR_Distancia. */
  distanceMeters?: number;
  /** true si se consultó su DNPRC para traer superficie/año. */
  hydrated: boolean;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: CandidateReason[];
};

/** Etapa del embudo que produjo (o intentó producir) el resultado. */
export type CadastreResolutionMethod =
  | "description"
  | "coordinates"
  | "nearby_coordinates"
  | "address"
  | "address_suggestion"
  | "cartociudad"
  | "map_pin"
  | "manual";

export type CadastreResolutionStatus =
  | "resolved_candidate"
  | "ambiguous"
  | "needs_address_confirmation"
  | "needs_map_pin"
  | "not_found"
  | "upstream_unavailable";

/** Intento de una etapa. SIN RC completa ni dirección (va a logs/telemetría). */
export type ResolutionAttempt = {
  stage: CadastreResolutionMethod;
  outcome: "hit" | "empty" | "error" | "skipped";
  note?: string;
};

/** Sugerencia del numerero: "¿quisiste decir el 49?" con su parcela. */
export type NumberSuggestion = { number: string; parcelRef: string };

export type CadastreResolution = {
  status: CadastreResolutionStatus;
  method: CadastreResolutionMethod | null;
  /** Ordenados por el ranking; NUNCA se ocultan los demás. */
  candidates: RankedCadastreCandidate[];
  /** Detalle completo cuando hay un candidato principal ya consultado. */
  info?: CadastreInfo;
  numberSuggestions?: NumberSuggestion[];
  attempts: ResolutionAttempt[];
  /** Siempre false al salir del resolver: confirma el usuario, no el código. */
  confirmed: false;
};

/** Metadatos de la resolución que se persisten junto a los datos. */
export type StoredResolution = {
  method: CadastreResolutionMethod;
  resolvedAt: string; // ISO
  confirmedByUser: boolean;
  confidence?: "high" | "medium" | "low";
  candidateCount?: number;
};

/**
 * Forma persistida en Property.cadastralData. Historial de esquemas:
 *  - legado: CadastreInfo a pelo (sin envoltorio)
 *  - schema 1: { schema:1, source, fetchedAt, info }
 *  - schema 2: añade `resolution` (método, confirmación, confianza)
 * El lector debe aceptar las tres.
 */
export type StoredCadastreData = {
  schema: 1 | 2;
  source: string;    // "Sede Electrónica del Catastro (OVC)"
  fetchedAt: string; // ISO
  info: CadastreInfo;
  resolution?: StoredResolution;
};

export function wrapCadastreData(info: CadastreInfo, resolution?: StoredResolution): StoredCadastreData {
  // `raw` puede ser enorme (XML completo parseado): lo acotamos para no inflar
  // la fila. Se conserva solo si cabe en ~64 KB serializado.
  const { raw, ...rest } = info;
  const keepRaw = raw != null && JSON.stringify(raw).length <= 64_000 ? raw : undefined;
  return {
    schema: resolution ? 2 : 1,
    source: "Sede Electrónica del Catastro (OVC)",
    fetchedAt: new Date().toISOString(),
    info: { ...rest, raw: keepRaw, hasFloorplan: info.hasFloorplan },
    ...(resolution ? { resolution } : {}),
  };
}
