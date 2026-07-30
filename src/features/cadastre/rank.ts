import type { CadastreCandidate, CandidateReason, RankedCadastreCandidate } from "./types";

/**
 * Ranking PURO y determinista de candidatos catastrales frente a las señales
 * del anuncio. Sin red, sin aleatoriedad: mismos inputs → mismo orden.
 *
 * Pesos (auditoría Codex 2026-07-30, ajustados): la localización interna
 * (puerta > planta > escalera > bloque) discrimina más que superficie; el año
 * pesa poco porque suele ser idéntico en todo el edificio. Las contradicciones
 * restan: un candidato con la planta EQUIVOCADA es peor que uno sin planta.
 *
 * La confianza NO es una probabilidad: deriva del score del 1º y de su
 * distancia al 2º. Nunca se oculta el resto de candidatos.
 */

export type ListingSignals = {
  floor?: string | null;
  door?: string | null;
  stair?: string | null;
  block?: string | null;
  builtArea?: number | null; // m² del anuncio
  yearBuilt?: number | null;
  streetNumber?: string | null; // número de portal del anuncio
};

/** Candidato con los campos opcionales que aporta la hidratación DNPRC. */
export type HydratableCandidate = CadastreCandidate & {
  builtArea?: number;
  yearBuilt?: number;
  use?: string;
  distanceMeters?: number;
  hydrated?: boolean;
};

/**
 * Normaliza plantas a una forma comparable: "4", "04", "4º", "4ª" → "4";
 * bajo→BJ, entresuelo→EN, ático→AT, semisótano→SM, sótano→SS, principal→PR.
 * "OD" (todo el edificio, parcelas sin división) no es comparable → null.
 */
export function normalizeFloor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/[ºª°.]/g, "");
  if (!s || s === "OD" || s === "T") return null;
  const words: Record<string, string> = {
    "BAJO": "BJ", "BJ": "BJ", "PB": "BJ", "PLANTA BAJA": "BJ", "BAJA": "BJ",
    "ENTRESUELO": "EN", "EN": "EN", "ENT": "EN", "ENTLO": "EN",
    "ATICO": "AT", "ÁTICO": "AT", "AT": "AT",
    "SEMISOTANO": "SM", "SEMISÓTANO": "SM", "SM": "SM",
    "SOTANO": "SS", "SÓTANO": "SS", "SS": "SS", "ST": "SS",
    "PRINCIPAL": "PR", "PR": "PR",
  };
  if (words[s]) return words[s];
  const num = s.match(/^[+-]?0*(\d+)$/);
  if (num) return num[1];
  return s;
}

/** Puertas: "01"→"1", izquierda→IZ, derecha→DR, centro→CE. */
export function normalizeDoor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/[ºª°.]/g, "");
  if (!s) return null;
  if (/^IZQ?U?I?E?R?D?A?$|^IZDA$/.test(s)) return "IZ";
  if (/^DE?RE?C?H?A?$|^DCHA?$|^DR$/.test(s)) return "DR";
  if (/^CENTRO$|^CTRO$|^CE$/.test(s)) return "CE";
  const num = s.match(/^0*(\d+)$/);
  if (num) return num[1];
  return s;
}

function normLoose(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase().replace(/^0+(?=\d)/, "");
  return s || null;
}

function extractNumber(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{1,4})[a-zA-Z]?\b(?!.*\b\d)/);
  return m ? m[1] : null;
}

const W = {
  doorMatch: 28, doorMismatch: -8,
  floorMatch: 24, floorMismatch: -12,
  stairMatch: 14, stairMismatch: -4,
  blockMatch: 10, blockMismatch: -4,
  numberMatch: 8, numberMismatch: -4,
  surface5: 10, surface10: 6, surface20: 2, surfaceFar: -8,
  year1: 3, year5: 1,
  useResidential: 3,
  near10m: 8, near25m: 4, near50m: 1,
} as const;

function scoreOne(c: HydratableCandidate, s: ListingSignals): { score: number; reasons: CandidateReason[] } {
  let score = 0;
  const reasons: CandidateReason[] = [];
  const add = (code: string, pts: number, listing?: string | number, cadastre?: string | number) => {
    score += pts;
    reasons.push({ code, listing, cadastre });
  };

  const dl = normalizeDoor(s.door);
  const dc = normalizeDoor(c.door);
  if (dl && dc) (dl === dc ? add("door_match", W.doorMatch, dl, dc) : add("door_mismatch", W.doorMismatch, dl, dc));

  const fl = normalizeFloor(s.floor);
  const fc = normalizeFloor(c.floor);
  if (fl && fc) (fl === fc ? add("floor_match", W.floorMatch, fl, fc) : add("floor_mismatch", W.floorMismatch, fl, fc));

  const el = normLoose(s.stair);
  const ec = normLoose(c.stair);
  if (el && ec) (el === ec ? add("stair_match", W.stairMatch, el, ec) : add("stair_mismatch", W.stairMismatch, el, ec));

  const bl = normLoose(s.block);
  const bc = normLoose(c.block);
  if (bl && bc) (bl === bc ? add("block_match", W.blockMatch, bl, bc) : add("block_mismatch", W.blockMismatch, bl, bc));

  const nl = normLoose(s.streetNumber);
  const nc = extractNumber(c.address);
  if (nl && nc) (nl === nc ? add("number_match", W.numberMatch, nl, nc) : add("number_mismatch", W.numberMismatch, nl, nc));

  if (s.builtArea != null && s.builtArea > 0 && c.builtArea != null && c.builtArea > 0) {
    const diff = Math.abs(c.builtArea - s.builtArea) / s.builtArea;
    if (diff <= 0.05) add("surface_close", W.surface5, s.builtArea, c.builtArea);
    else if (diff <= 0.1) add("surface_similar", W.surface10, s.builtArea, c.builtArea);
    else if (diff <= 0.2) add("surface_loose", W.surface20, s.builtArea, c.builtArea);
    else add("surface_far", W.surfaceFar, s.builtArea, c.builtArea);
  }

  if (s.yearBuilt != null && c.yearBuilt != null) {
    const d = Math.abs(c.yearBuilt - s.yearBuilt);
    if (d <= 1) add("year_close", W.year1, s.yearBuilt, c.yearBuilt);
    else if (d <= 5) add("year_near", W.year5, s.yearBuilt, c.yearBuilt);
  }

  if (c.use && /^resid|^viv/i.test(c.use)) add("use_residential", W.useResidential, undefined, c.use);

  if (c.distanceMeters != null) {
    const d = c.distanceMeters;
    if (d <= 10) add("near_distance", W.near10m, undefined, Math.round(d));
    else if (d <= 25) add("near_distance", W.near25m, undefined, Math.round(d));
    else if (d <= 50) add("near_distance", W.near50m, undefined, Math.round(d));
  }

  return { score, reasons };
}

export type Confidence = "high" | "medium" | "low";

/**
 * Confianza del PRIMER candidato, derivada de su score y de la distancia al
 * segundo. Con un único candidato NO hay gap que respalde la alta: se exige
 * más score (una sola señal fuerte, p. ej. solo la puerta = 28, no basta —
 * revisión adversarial Codex 2026-07-30).
 */
export function deriveConfidence(topScore: number, secondScore: number | null): Confidence {
  if (secondScore == null) {
    if (topScore >= 34) return "high";
    if (topScore >= 12) return "medium";
    return "low";
  }
  const gap = topScore - secondScore;
  if (topScore >= 28 && gap >= 14) return "high";
  if (topScore >= 12 && gap >= 6) return "medium";
  return "low";
}

/**
 * Ordena candidatos por score (desc) con desempate estable por RC (asc) para
 * determinismo total. El 1º lleva la confianza derivada; el resto "low".
 */
export function rankCandidates(
  candidates: HydratableCandidate[],
  signals: ListingSignals
): RankedCadastreCandidate[] {
  const scored = candidates.map((c) => {
    const { score, reasons } = scoreOne(c, signals);
    return {
      ...c,
      hydrated: c.hydrated ?? false,
      score,
      confidence: "low" as Confidence,
      reasons,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
  if (scored.length > 0) {
    scored[0] = {
      ...scored[0],
      confidence: deriveConfidence(scored[0].score, scored[1]?.score ?? null),
    };
  }
  return scored;
}
