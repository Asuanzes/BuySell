/**
 * Utilidades puras del chat (testeables sin BBDD).
 */
import { stripRecordLinks } from "@nidokey/shared";

/**
 * Clave de dedupe para conversaciones DIRECT: las mismas dos personas solo
 * tienen UNA conversación general y una por cada registro vinculado.
 * `sort` garantiza que (A,B) y (B,A) colisionen.
 */
export function directKey(userA: string, userB: string, contextId?: string | null): string {
  return [userA, userB].sort().join("|") + "|" + (contextId ?? "general");
}

/**
 * Trunca sin partir un surrogate pair: si el corte cae en mitad de un emoji
 * (p. ej. "😀" = 2 unidades UTF-16), retrocede una unidad para no emitir un
 * carácter inválido (JSON.stringify lo escaparía como \uD83D suelto).
 */
export function truncateSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = max - 1;
  const last = s.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1; // high surrogate huérfano
  return s.slice(0, cut) + "…";
}

/** Snippet para la lista de conversaciones (vaciable si E2E futuro). */
export function messagePreview(kind: string, body: string | null | undefined): string {
  if (kind === "IMAGE") return "📷 Foto";
  if (kind === "FILE") return "📎 Archivo";
  if (kind === "AUDIO") return "🎤 Audio";
  const t = stripRecordLinks(body ?? "").replace(/\s+/g, " ").trim();
  return truncateSafe(t, 140);
}

/**
 * Sanea el cuerpo de un mensaje: el texto del usuario es literal (no se
 * "limpia" como una descripción), solo se quitan caracteres de control C0/C1
 * (salvo salto de línea y tab) y se aplica el límite. Filtro por code point
 * para evitar regex de control-chars. Devuelve null si no queda nada.
 */
export function sanitizeMessageBody(raw: string | null | undefined, maxChars: number): string | null {
  if (!raw) return null;
  let out = "";
  for (const ch of String(raw)) {
    const c = ch.codePointAt(0) ?? 0;
    const isControl = (c < 32 && c !== 10 && c !== 9) || (c >= 127 && c <= 159);
    if (!isControl) out += ch;
  }
  const t = out.trim();
  if (!t) return null;
  if (t.length <= maxChars) return t;
  // Corte sin partir surrogate pairs (mismo criterio que truncateSafe).
  let cut = maxChars;
  const last = t.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return t.slice(0, cut);
}

/**
 * Detecta la familia de imagen REAL por magic bytes (primeros 16 bytes del
 * objeto subido). Devuelve el MIME canónico o null si no parece una imagen
 * admitida. PURA: testeable sin R2.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand.startsWith("hei") || brand.startsWith("hev")) return "image/heic";
    if (brand.startsWith("mif") || brand.startsWith("msf")) return "image/heif";
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
  }
  return null;
}
