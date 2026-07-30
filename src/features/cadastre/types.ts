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

/**
 * Forma persistida en Property.cadastralData (schema 1). Las filas antiguas
 * guardaban CadastreInfo a pelo; el lector debe aceptar ambas.
 */
export type StoredCadastreData = {
  schema: 1;
  source: string;    // "Sede Electrónica del Catastro (OVC)"
  fetchedAt: string; // ISO
  info: CadastreInfo;
};

export function wrapCadastreData(info: CadastreInfo): StoredCadastreData {
  // `raw` puede ser enorme (XML completo parseado): lo acotamos para no inflar
  // la fila. Se conserva solo si cabe en ~64 KB serializado.
  const { raw, ...rest } = info;
  const keepRaw = raw != null && JSON.stringify(raw).length <= 64_000 ? raw : undefined;
  return {
    schema: 1,
    source: "Sede Electrónica del Catastro (OVC)",
    fetchedAt: new Date().toISOString(),
    info: { ...rest, raw: keepRaw, hasFloorplan: info.hasFloorplan },
  };
}
