import { isValidCadastralRef } from "./ref";

/**
 * Extracción PURA de posibles referencias catastrales desde el texto de un
 * anuncio (título, descripción, metadatos). Sin red: la validación real contra
 * DNPRC la hace el resolver. Nunca se persiste una coincidencia sin validar y
 * sin confirmación del usuario.
 *
 * Método: tokens alfanuméricos COMPLETOS unidos por un único separador blando
 * (espacio, guion, punto, ·). Así "9872023 VH5797S 0001 WX" se recompone, pero
 * jamás se muerde el prefijo/sufijo de un identificador más largo (el token es
 * maximal) ni se cuela texto pegado ("…céntrico9872023…").
 *
 * Anti-falsos-positivos:
 *  - Estructura oficial exacta (14 = parcela, 20 = inmueble) tras normalizar.
 *  - Primer carácter dígito (PC1/municipio empiezan por cifra en la práctica):
 *    descarta palabras y códigos tipo certificado.
 *  - Mezcla obligatoria ≥4 dígitos y ≥2 letras: descarta teléfonos e IDs de
 *    anuncio (solo dígitos) y siglas largas (solo letras).
 *  - Prioridad a coincidencias tras "referencia catastral" / "ref. catastral" /
 *    "RC:".
 */

export type ExtractedRef = {
  ref: string;
  kind: "unit" | "parcel"; // 20 chars | 14 chars
  /** true si aparece junto a una etiqueta tipo "referencia catastral". */
  labeled: boolean;
};

const LABEL_RE = /\b(referencia\s+catastral|ref\.?\s*catastral|r\.c\.|rc)\s*[:\-]?\s*$/i;
const LABEL_WINDOW = 48;
const SOFT_SEP = /^[\s\-.·]$/;

type Token = { text: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[0-9A-Za-z]+/g)) {
    out.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

function digitLetterMix(ref: string): boolean {
  const digits = (ref.match(/[0-9]/g) ?? []).length;
  const letters = (ref.match(/[A-Z]/g) ?? []).length;
  return digits >= 4 && letters >= 2;
}

/**
 * Busca RCs plausibles en una lista de textos (título, descripción, campos del
 * portal…). Devuelve únicas, etiquetadas primero, y dentro de cada grupo las
 * de 20 chars (inmueble exacto) antes que las de 14 (parcela).
 */
export function extractCadastralRefs(texts: Array<string | null | undefined>): ExtractedRef[] {
  const found = new Map<string, ExtractedRef>();
  for (const text of texts) {
    if (!text) continue;
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length; i++) {
      if (!/[0-9]/.test(tokens[i].text[0])) continue; // la RC empieza por dígito
      let joined = "";
      for (let j = i; j < tokens.length; j++) {
        if (j > i) {
          // Solo un único separador blando entre tokens consecutivos.
          const gap = text.slice(tokens[j - 1].end, tokens[j].start);
          if (gap.length !== 1 || !SOFT_SEP.test(gap)) break;
        }
        joined += tokens[j].text;
        if (joined.length > 20) break;
        if (joined.length !== 14 && joined.length !== 20) continue;
        const norm = joined.toUpperCase();
        if (!isValidCadastralRef(norm) || !digitLetterMix(norm)) continue;
        const before = text.slice(Math.max(0, tokens[i].start - LABEL_WINDOW), tokens[i].start);
        const labeled = LABEL_RE.test(before);
        const prev = found.get(norm);
        if (!prev || (labeled && !prev.labeled)) {
          found.set(norm, { ref: norm, kind: norm.length === 20 ? "unit" : "parcel", labeled });
        }
      }
    }
  }
  // Una RC de 20 escrita con espacios genera también su parcela (primeros 14):
  // la parcela-prefijo es redundante y se suprime.
  const units = new Set([...found.keys()].filter((r) => r.length === 20).map((r) => r.slice(0, 14)));
  return [...found.values()]
    .filter((x) => !(x.kind === "parcel" && units.has(x.ref)))
    .sort((a, b) => {
      if (a.labeled !== b.labeled) return a.labeled ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === "unit" ? -1 : 1;
      return 0;
    });
}
