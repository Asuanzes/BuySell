import { XMLParser } from "fast-xml-parser";
import type { CadastreCandidate, CadastreInfo, CadastreUnit } from "./types";

/**
 * Cliente para los servicios públicos del Catastro Español (OVC).
 * Docs: https://www.catastro.hacienda.gob.es/ws/Webservices_Libres.pdf
 *
 * Endpoints públicos y sin clave. OJO (verificado 2026-07-30 con GETs reales):
 *  - El Callejero ASMX antiguo (ovcservweb/OVCCallejero/COVCCallejero.asmx)
 *    YA NO EXISTE (HTTP 404): la integración estuvo muerta hasta migrar al
 *    servicio WCF JSON (COVCCallejero.svc/json/...), que es el vigente.
 *    El parámetro de RC ahí se llama `RefCat` (en ASMX era `RC`).
 *  - El servicio de coordenadas ASMX (OVCSWLocalizacionRC/OVCCoordenadas.asmx)
 *    sigue vivo y devuelve XML; se mantiene con fast-xml-parser (sin DTD ni
 *    entidades externas → sin XXE).
 */

// Catastro tiene DOS servicios web distintos:
//   - OVCSWLocalizacionRC (ASMX, XML) → consulta por coordenadas (RCCOOR)
//   - OVCWcfCallejero (WCF, JSON)     → dirección y RC (DNPLOC, DNPRC)
const BASE_COORDS = "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC";
const BASE_CALLEJERO_JSON = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true,
});

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

/** Error de infraestructura (timeout/red/5xx): el servicio no está disponible,
 *  distinto de "el Catastro respondió que no hay datos". */
export class CadastreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadastreUnavailableError";
  }
}

async function fetchXmlOnce(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Nidokey/1.0 (cadastre lookup)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new CadastreUnavailableError(
      (e as Error).name === "TimeoutError" ? "Catastro: timeout" : `Catastro: ${(e as Error).message}`
    );
  }
  if (res.status >= 500) throw new CadastreUnavailableError(`Catastro ${res.status}`);
  if (!res.ok) throw new Error(`Catastro ${res.status}: ${res.statusText}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RESPONSE_BYTES) throw new Error("Catastro: respuesta demasiado grande");
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Catastro: respuesta demasiado grande");
  // Catastro a veces devuelve HTML de error en lugar de XML (RC inválida,
  // datos en elaboración, parcela rústica sin detalle, etc.). Lo detectamos
  // antes de parsear para dar un mensaje útil al usuario.
  const head = text.trimStart().slice(0, 100).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
    throw new Error(
      "Catastro devolvió HTML (datos no disponibles, en elaboración, o RC sin información detallada)"
    );
  }
  return xmlParser.parse(text);
}

/** GET idempotente: un único reintento con backoff corto solo ante fallo de
 *  infraestructura (timeout/red/5xx), nunca ante errores de datos. */
async function fetchXml(url: string): Promise<unknown> {
  try {
    return await fetchXmlOnce(url);
  } catch (e) {
    if (!(e instanceof CadastreUnavailableError)) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return fetchXmlOnce(url);
  }
}

/** Error de DATOS del Catastro (lerr cod/des): la consulta llegó pero el
 *  servicio dice que no hay resultado o los parámetros no valen. */
export class CadastreDataError extends Error {
  readonly cod: string;
  constructor(cod: string, des: string) {
    super(des);
    this.name = "CadastreDataError";
    this.cod = cod;
  }
}

async function fetchJsonOnce(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Nidokey/1.0 (cadastre lookup)", Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new CadastreUnavailableError(
      (e as Error).name === "TimeoutError" ? "Catastro: timeout" : `Catastro: ${(e as Error).message}`
    );
  }
  if (res.status >= 500) throw new CadastreUnavailableError(`Catastro ${res.status}`);
  if (!res.ok) throw new Error(`Catastro ${res.status}: ${res.statusText}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Catastro: respuesta demasiado grande");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Catastro devolvió una respuesta no-JSON");
  }
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    return await fetchJsonOnce(url);
  } catch (e) {
    if (!(e instanceof CadastreUnavailableError)) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return fetchJsonOnce(url);
  }
}

/**
 * Errores del WCF JSON: `{ control: { cuerr }, lerr: [{ cod, des }] }` en la
 * raíz del *Result. Lanza CadastreDataError con el primero significativo.
 */
function checkJsonError(root: unknown, where: string): void {
  if (!root || typeof root !== "object") return;
  const r = root as { control?: { cuerr?: number }; lerr?: Array<{ cod?: string | number; des?: string }> };
  const errs = Array.isArray(r.lerr) ? r.lerr : [];
  if ((r.control?.cuerr ?? 0) > 0 || errs.length > 0) {
    const first = errs[0];
    throw new CadastreDataError(String(first?.cod ?? "?"), `Catastro [${where}]: ${first?.des ?? "error desconocido"}`);
  }
}

/**
 * Quita ruido de respuestas Catastro (nodos "err" con código 0 = sin error).
 * Si hay error real, lanza excepción con mensaje legible.
 */
function checkError(node: unknown, where: string): void {
  // Catastro mete los errores en consulta.lerr.err[*] con cod/des
  const root = (node as { consulta_dnp?: unknown; consulta_coordenadas?: unknown; consulta_dnploc?: unknown; consulta_dnprc?: unknown; consulta_dnplrc?: unknown; consulta_rccoor?: unknown; coord?: unknown }) || {};
  const candidates = Object.values(root);
  for (const c of candidates) {
    if (c && typeof c === "object" && c !== null && "lerr" in c) {
      const lerr = (c as { lerr?: { err?: unknown } }).lerr;
      if (lerr && lerr.err) {
        const errs = Array.isArray(lerr.err) ? lerr.err : [lerr.err];
        const meaningful = errs.find((e) => e && typeof e === "object" && (e as { cod?: number }).cod !== 0);
        if (meaningful) {
          const m = meaningful as { cod?: number; des?: string };
          throw new Error(`Catastro [${where}] cod ${m.cod}: ${m.des ?? "error desconocido"}`);
        }
      }
    }
  }
}

// ---------- 1. Por coordenadas ----------

/**
 * Dada lat/lng, devuelve la referencia catastral del inmueble.
 * Endpoint: Consulta_RCCOOR (devuelve solo PC1+PC2, los 14 primeros chars).
 */
export async function lookupByCoordinates(
  lat: number,
  lng: number
): Promise<string | null> {
  const url =
    `${BASE_COORDS}/OVCCoordenadas.asmx/Consulta_RCCOOR` +
    `?SRS=EPSG:4326&Coordenada_X=${lng}&Coordenada_Y=${lat}`;
  const data = (await fetchXml(url)) as { consulta_coordenadas?: { coordenadas?: { coord?: { pc?: { pc1?: string; pc2?: string } } } } };
  checkError(data, "Consulta_RCCOOR");
  const pc = data.consulta_coordenadas?.coordenadas?.coord?.pc;
  if (!pc?.pc1 || !pc?.pc2) return null;
  return `${pc.pc1}${pc.pc2}`;
}

// ---------- 2. Por dirección ----------

/**
 * Busca por dirección literal. La sigla suele ser "CL" (calle), "AV" (avenida),
 * "CR" (carretera), "TR" (travesía), etc. Si no la tienes, prueba "CL".
 */
type RcParts = { pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string };
type RcdnpItem = {
  rc?: RcParts;
  dt?: {
    locs?: {
      lous?: {
        lourb?: {
          dir?: { tv?: string; nv?: string; pnp?: string };
          loint?: { bq?: string; es?: string; pt?: string; pu?: string };
        };
      };
    };
  };
};

function candidateFrom(item: RcdnpItem): CadastreCandidate | null {
  if (!item.rc?.pc1 || !item.rc?.pc2) return null;
  const lourb = item.dt?.locs?.lous?.lourb;
  const dir = lourb?.dir;
  const loint = lourb?.loint;
  const addressParts = [dir?.tv, dir?.nv, dir?.pnp?.toString()].filter(Boolean).map((s) => String(s).trim());
  return {
    ref: joinRC(item.rc),
    address: addressParts.length ? addressParts.join(" ") : undefined,
    block: loint?.bq?.toString().trim() || undefined,
    stair: loint?.es?.toString().trim() || undefined,
    floor: loint?.pt?.toString().trim() || undefined,
    door: loint?.pu?.toString().trim() || undefined,
  };
}

/**
 * Consulta_DNPLOC. Devuelve TODOS los candidatos: una dirección sin
 * planta/puerta suele corresponder a varios inmuebles del mismo portal y la
 * elección es del usuario, nunca nuestra.
 */
export async function listCandidatesByAddress(params: {
  province: string;
  city: string;
  street: string;
  number?: string;
  sigla?: string;
}): Promise<CadastreCandidate[]> {
  const q = new URLSearchParams({
    Provincia: params.province.toUpperCase(),
    Municipio: params.city.toUpperCase(),
    Sigla: (params.sigla ?? "CL").toUpperCase(),
    Calle: params.street.toUpperCase(),
    Numero: params.number ?? "",
    Bloque: "",
    Escalera: "",
    Planta: "",
    Puerta: "",
  });
  const url = `${BASE_CALLEJERO_JSON}/Consulta_DNPLOC?${q.toString()}`;
  const data = (await fetchJson(url)) as {
    consulta_dnplocResult?: {
      bico?: { bi?: { idbi?: { rc?: RcParts } }; idbi?: { rc?: RcParts } };
      lrcdnp?: { rcdnp?: RcdnpItem[] | RcdnpItem };
    };
  };
  const root = data?.consulta_dnplocResult;
  checkJsonError(root, "Consulta_DNPLOC");

  // Caso 1: respuesta directa (un solo inmueble)
  const directRc = root?.bico?.bi?.idbi?.rc ?? root?.bico?.idbi?.rc;
  if (directRc?.pc1 && directRc?.pc2) {
    return [{ ref: joinRC(directRc) }];
  }
  // Caso 2: lista de inmuebles (lrcdnp.rcdnp[])
  const list = root?.lrcdnp?.rcdnp;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  return items.map(candidateFrom).filter((c): c is CadastreCandidate => c != null);
}

/** Compat: primera RC por dirección (para el enriquecimiento en background). */
export async function lookupByAddress(params: {
  province: string;
  city: string;
  street: string;
  number?: string;
  sigla?: string;
}): Promise<string | null> {
  const candidates = await listCandidatesByAddress(params);
  return candidates[0]?.ref ?? null;
}

function joinRC(rc: { pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string }): string {
  // RC larga: PC1(7) + PC2(7) + CAR(4) + CC1(1) + CC2(1) = 20 chars
  // RC corta: PC1 + PC2 = 14 chars (parcela)
  if (rc.car && rc.cc1 && rc.cc2) return `${rc.pc1}${rc.pc2}${rc.car}${rc.cc1}${rc.cc2}`;
  return `${rc.pc1}${rc.pc2}`;
}

// ---------- 3. Datos completos por referencia catastral ----------

type DnpCons = {
  lcd?: string;
  dt?: { lourb?: { loint?: { bq?: string; es?: string; pt?: string; pu?: string } } };
  dfcons?: { stl?: string | number; stt?: string | number };
};

type DnpBi = {
  idbi?: { rc?: RcParts; cn?: string };
  dt?: {
    loine?: { cp?: string; cm?: string };
    cmc?: string;
    np?: string; // provincia
    nm?: string; // municipio
    locs?: {
      lous?: {
        lourb?: {
          dir?: {
            cv?: string; // código vía
            tv?: string; // tipo vía (CL, AV...)
            nv?: string; // nombre vía
            pnp?: string; // número
            plp?: string;
            snp?: string;
          };
          loint?: { bq?: string; es?: string; pt?: string; pu?: string }; // bloque, escalera, planta, puerta
          dp?: string; // postal code
        };
      };
    };
  };
  debi?: {
    luso?: string; // uso
    sfc?: string | number; // superficie construida m²
    ant?: string | number; // antigüedad (año)
    cpt?: string | number; // coeficiente de participación
  };
  /** Dirección literal completa ("CL GLORIA 51 13730 SANTA CRUZ..."). */
  ldt?: string;
};

export type DnpFinca = {
  ldt?: string;
  ltp?: string;
  dff?: { ss?: string | number }; // superficie de suelo (parcela)
  infgraf?: { igraf?: string };   // URL oficial del plano/mapa de la Sede
};

type DnpRoot = {
  bico?: {
    bi?: DnpBi;
    finca?: DnpFinca;
    // XML antiguo: lcons.cons[]; WCF JSON: lcons es el array directamente.
    lcons?: { cons?: DnpCons[] | DnpCons } | DnpCons[];
  };
  // RC de finca (14): el servicio devuelve la LISTA de inmuebles de la parcela.
  lrcdnp?: { rcdnp?: RcdnpItem[] | RcdnpItem };
  lcons?: { cons?: DnpCons[] | DnpCons } | DnpCons[];
};

export type DnpRcResponse = {
  consulta_dnprc?: DnpRoot;        // forma XML legada (fixtures/compat)
  consulta_dnprcResult?: DnpRoot;  // forma real del WCF JSON vigente
};

function parseUnits(lcons: { cons?: DnpCons[] | DnpCons } | DnpCons[] | undefined): CadastreUnit[] | undefined {
  const raw = Array.isArray(lcons) ? lcons : lcons?.cons;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const units = items
    .map((c): CadastreUnit => {
      const loint = c.dt?.lourb?.loint;
      return {
        use: typeof c.lcd === "string" ? c.lcd : undefined,
        area: numOrNull(c.dfcons?.stl ?? c.dfcons?.stt) ?? undefined,
        stair: loint?.es?.toString().trim() || undefined,
        floor: loint?.pt?.toString().trim() || undefined,
        door: loint?.pu?.toString().trim() || undefined,
      };
    })
    .filter((u) => u.use || u.area != null);
  return units.length ? units : undefined;
}

function infoFromBi(
  bi: DnpBi,
  fallbackRef: string,
  raw: unknown,
  lcons?: { cons?: DnpCons[] | DnpCons } | DnpCons[],
  finca?: DnpFinca
): CadastreInfo {
  const rc = bi.idbi?.rc;
  const dt = bi.dt;
  const debi = bi.debi;
  const lourb = dt?.locs?.lous?.lourb;
  const dir = lourb?.dir;
  const loint = lourb?.loint;

  const fullRef = rc ? joinRC(rc) : fallbackRef;
  const sigla = dir?.tv?.trim();
  const street = dir?.nv?.trim();
  const number = dir?.pnp?.toString().trim();
  const addressParts: string[] = [];
  if (sigla) addressParts.push(sigla);
  if (street) addressParts.push(street);
  if (number) addressParts.push(number);

  const cn = bi.idbi?.cn?.toString().trim().toUpperCase();
  // Plano/mapa: preferimos la URL oficial que devuelve el propio servicio
  // (finca.infgraf.igraf); el fallback construido se mantiene por compat.
  const floorplanUrl =
    finca?.infgraf?.igraf ||
    `https://www1.sedecatastro.gob.es/Cartografia/GeneraGraficoParcela.aspx?refcat=${encodeURIComponent(fullRef)}&del=${rc?.pc1?.slice(0, 2)}&mun=${rc?.pc1?.slice(2, 5)}`;

  return {
    ref: fullRef,
    landType: cn === "UR" || cn === "RU" ? cn : undefined,
    address: (addressParts.length ? addressParts.join(" ") : undefined) ?? bi.ldt?.trim() ?? undefined,
    province: dt?.np?.toString().trim() || undefined,
    municipality: dt?.nm?.toString().trim() || undefined,
    postalCode: lourb?.dp?.toString().trim() || undefined,
    block: loint?.bq?.toString().trim() || undefined,
    stair: loint?.es?.toString().trim() || undefined,
    floor: loint?.pt?.toString().trim() || undefined,
    door: loint?.pu?.toString().trim() || undefined,
    use: typeof debi?.luso === "string" ? debi.luso : undefined,
    builtArea: numOrNull(debi?.sfc) ?? undefined,
    yearBuilt: numOrNull(debi?.ant) ?? undefined,
    participation: debi?.cpt != null ? String(debi.cpt) : undefined,
    plotArea: numOrNull(finca?.dff?.ss) ?? undefined,
    units: parseUnits(lcons),
    hasFloorplan: true,
    floorplanUrl,
    raw,
  };
}

export type FetchByRefResult =
  | { kind: "one"; info: CadastreInfo }
  | { kind: "many"; candidates: CadastreCandidate[] }
  | { kind: "none"; ref: string };

export type ParsedDnprc =
  | FetchByRefResult
  // Un único inmueble en la finca, pero solo tenemos su RC: hace falta una
  // consulta de seguimiento para traer el detalle.
  | { kind: "follow-up"; ref: string };

/**
 * Interpreta una respuesta ya parseada de Consulta_DNPRC. PURA (testeable con
 * fixtures): un inmueble, varios candidatos, seguimiento o sin datos.
 */
export function parseDnprc(data: DnpRcResponse, ref: string): ParsedDnprc {
  const root = data.consulta_dnprc ?? data.consulta_dnprcResult;
  const bi = root?.bico?.bi;
  if (bi) {
    return { kind: "one", info: infoFromBi(bi, ref, data, root?.bico?.lcons ?? root?.lcons, root?.bico?.finca) };
  }

  // RC de finca: lista de inmuebles de la parcela → candidatos para el usuario.
  const list = root?.lrcdnp?.rcdnp;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  const candidates = items.map(candidateFrom).filter((c): c is CadastreCandidate => c != null);
  if (candidates.length > 1) return { kind: "many", candidates };
  if (candidates.length === 1 && candidates[0].ref !== ref) {
    return { kind: "follow-up", ref: candidates[0].ref };
  }
  if (candidates.length === 1) {
    return { kind: "one", info: { ref: candidates[0].ref, hasFloorplan: false, raw: data } };
  }
  return { kind: "none", ref };
}

/**
 * Consulta_DNPRC con distinción de resultado: un inmueble, VARIOS (RC de finca
 * de 14 chars con varias unidades — el usuario debe elegir), o sin datos.
 */
export async function fetchByRefDetailed(ref: string): Promise<FetchByRefResult> {
  const q = new URLSearchParams({ Provincia: "", Municipio: "", RefCat: ref });
  const url = `${BASE_CALLEJERO_JSON}/Consulta_DNPRC?${q.toString()}`;
  const data = (await fetchJson(url)) as DnpRcResponse;
  try {
    checkJsonError(data.consulta_dnprcResult ?? data.consulta_dnprc, "Consulta_DNPRC");
  } catch (e) {
    // Error de DATOS (RC mal formada, sin resultado…) → "none", no excepción:
    // el caller decide cómo presentarlo; el transporte roto sí sigue lanzando.
    if (e instanceof CadastreDataError) return { kind: "none", ref };
    throw e;
  }

  const parsed = parseDnprc(data, ref);
  if (parsed.kind !== "follow-up") return parsed;

  // Un único inmueble en la finca: resolvemos su RC completa directamente.
  const detail = await fetchByRefDetailed(parsed.ref);
  return detail.kind === "none" ? { kind: "one", info: { ref: parsed.ref, hasFloorplan: false, raw: data } } : detail;
}

/**
 * Compat: datos descriptivos por RC. Si la finca tiene varios inmuebles,
 * devuelve solo la cáscara (ref + raw) — los flujos interactivos deben usar
 * fetchByRefDetailed para ofrecer los candidatos.
 */
export async function fetchByRef(ref: string): Promise<CadastreInfo> {
  const r = await fetchByRefDetailed(ref);
  if (r.kind === "one") return r.info;
  return { ref, hasFloorplan: false };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- 4. Orquestador: enriquecer un Property ----------

export type EnrichInput = {
  latitude?: number | null;
  longitude?: number | null;
  province?: string | null;
  city?: string | null;
  address?: string | null;
};

export type EnrichResult = {
  ref: string | null;
  info: CadastreInfo | null;
  method: "coords" | "address" | null;
  warnings: string[];
};

/**
 * Intenta enriquecer un inmueble buscando primero por coordenadas
 * (si disponibles, es el método más fiable) y cayendo a búsqueda
 * por dirección. No lanza nunca: devuelve warnings.
 */
type Attempt = { ref: string; info: CadastreInfo | null; method: "coords" | "address" };

export async function enrichProperty(input: EnrichInput): Promise<EnrichResult> {
  const warnings: string[] = [];
  const attempts: Attempt[] = [];

  // 1. Intento por coords
  if (input.latitude != null && input.longitude != null) {
    try {
      const ref = await lookupByCoordinates(input.latitude, input.longitude);
      if (ref) {
        const info = await fetchByRef(ref).catch((e) => {
          warnings.push(`Detalle de ${ref} no disponible: ${(e as Error).message}`);
          return null;
        });
        attempts.push({ ref, info, method: "coords" });
      } else {
        warnings.push("Sin resultado por coordenadas");
      }
    } catch (e) {
      warnings.push(`Coords falló: ${(e as Error).message}`);
    }
  } else {
    warnings.push("Sin coordenadas en la ficha");
  }

  // 2. Intento por dirección (SIEMPRE intentamos también, no solo si fallaron coords:
  //    coords a veces dan una parcela rústica vacía y la dirección la urbana real).
  if (input.province && input.city && input.address) {
    const parsed = parseAddress(input.address);
    if (parsed) {
      try {
        const ref = await lookupByAddress({
          province: input.province,
          city: input.city,
          street: parsed.street,
          number: parsed.number,
          sigla: parsed.sigla,
        });
        if (ref) {
          // Si ya teníamos ref por coords y son la misma, no repetimos fetchByRef
          const sameAsCoords = attempts.find((a) => a.ref === ref);
          if (sameAsCoords) {
            attempts.push({ ref, info: sameAsCoords.info, method: "address" });
          } else {
            const info = await fetchByRef(ref).catch((e) => {
              warnings.push(`Detalle de ${ref} no disponible: ${(e as Error).message}`);
              return null;
            });
            attempts.push({ ref, info, method: "address" });
          }
        } else {
          warnings.push("Sin resultado por dirección");
        }
      } catch (e) {
        warnings.push(`Dirección falló: ${(e as Error).message}`);
      }
    } else {
      warnings.push("No se pudo parsear la dirección");
    }
  }

  if (attempts.length === 0) {
    return { ref: null, info: null, method: null, warnings };
  }

  // Score: el que tenga MÁS datos descriptivos gana. Una parcela rústica sin
  // edificación da info=null o sin builtArea/yearBuilt → score 0. Una urbana
  // con address+yearBuilt+builtArea da score alto.
  function infoScore(info: CadastreInfo | null): number {
    if (!info) return 0;
    let s = 0;
    if (info.address) s += 2;
    if (info.builtArea != null) s += 2;
    if (info.yearBuilt != null) s += 2;
    if (info.use) s += 1;
    if (info.floor) s += 1;
    return s;
  }
  attempts.sort((a, b) => infoScore(b.info) - infoScore(a.info));
  const best = attempts[0];
  if (infoScore(best.info) === 0) {
    warnings.push(
      "Catastro encontró la parcela pero no tiene datos descriptivos. Suele ocurrir en parcelas rústicas o construcciones en elaboración."
    );
  }
  return { ref: best.ref, info: best.info, method: best.method, warnings };
}

const SIGLA_MAP: Record<string, string> = {
  "calle": "CL", "c/": "CL", "c.": "CL",
  "avenida": "AV", "avda": "AV", "av.": "AV",
  "plaza": "PZ", "pl.": "PZ", "pza": "PZ",
  "paseo": "PS", "pº": "PS",
  "carretera": "CR", "ctra": "CR",
  "camino": "CM",
  "travesía": "TR", "travesia": "TR",
  "ronda": "RD",
  "glorieta": "GL",
  "barrio": "BO",
  "lugar": "LG",
};

export function parseAddress(s: string): { sigla?: string; street: string; number?: string } | null {
  const norm = s.trim().replace(/,$/, "");
  if (!norm) return null;
  // Detecta sigla al inicio
  let sigla: string | undefined;
  let rest = norm;
  for (const [key, val] of Object.entries(SIGLA_MAP)) {
    const re = new RegExp(`^${key.replace(/[.]/g, "\\.")}\\s+`, "i");
    if (re.test(norm)) {
      sigla = val;
      rest = norm.replace(re, "");
      break;
    }
  }
  // Extrae número final
  const m = rest.match(/^(.+?)[,\s]+(?:n[º°]?\.?\s*)?(\d+[a-z]?)\b/i);
  if (m) {
    return { sigla: sigla ?? "CL", street: m[1].trim(), number: m[2] };
  }
  return { sigla: sigla ?? "CL", street: rest.trim() };
}
