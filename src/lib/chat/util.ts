/**
 * Utilidades puras del chat (testeables sin BBDD).
 */
import { NAV_ALLOW, stripRecordLinks } from "@nidokey/shared";

const BOT_NAV_SCREEN_LINKS: ReadonlyArray<readonly [label: string, route: string]> = [
  ["Duplicados", "/matches"],
  ["Importar", "/importar"],
  ["Buscar", "/search"],
  ["Tema", "/theme-settings"],
  ["Categorías", "/category-settings"],
  ["Novedades", "/events"],
  ["Decisiones", "/decisions"],
  ["Contactos", "/chat/contacts"],
  ["Calculadora de hipoteca", "/tools/mortgage"],
  ["Viajes", "/viajes/nuevo"],
  ["Nuevo viaje", "/viajes/nuevo"],
  ["nuevo viaje", "/viajes/nuevo"],
];

const BOT_NAV_LINK_RE = /\[\[ir:([^\]|]+)\|([^\]]+)\]\]/g;
const ANY_LINK_RE = /\[\[[\s\S]*?\]\]/g;
const BOT_NAV_ROUTE_BY_LABEL = new Map(BOT_NAV_SCREEN_LINKS.map(([label, route]) => [label, route]));

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
 * Defensa determinista del prompt: si el bot menciona una pantalla inequívoca,
 * convierte la primera aparición fuera de links en navegación segura.
 */
export function linkBotNavigationScreens(text: string): string {
  if (!text) return text;
  let out = sanitizeBotNavigationLinks(text);

  const linkedRoutes = new Set<string>();
  for (const match of out.matchAll(BOT_NAV_LINK_RE)) linkedRoutes.add(match[1] ?? "");

  for (const [label, route] of BOT_NAV_SCREEN_LINKS) {
    if (!NAV_ALLOW.has(route) || linkedRoutes.has(route)) continue;
    const linked = linkFirstLabelOutsideLinks(out, label, route);
    if (linked !== out) {
      out = linked;
      linkedRoutes.add(route);
    }
  }
  return out;
}

function sanitizeBotNavigationLinks(text: string): string {
  return text.replace(BOT_NAV_LINK_RE, (_full, route: string, label: string) => {
    if (NAV_ALLOW.has(route)) return `[[ir:${route}|${label}]]`;
    const allowedRoute = BOT_NAV_ROUTE_BY_LABEL.get(label);
    if (allowedRoute && NAV_ALLOW.has(allowedRoute)) return `[[ir:${allowedRoute}|${label}]]`;
    return label;
  });
}

function linkFirstLabelOutsideLinks(text: string, label: string, route: string): string {
  let cursor = 0;
  let rebuilt = "";
  for (const match of text.matchAll(ANY_LINK_RE)) {
    const linkStart = match.index ?? 0;
    const before = text.slice(cursor, linkStart);
    const linkedBefore = linkFirstLabelInPlainText(before, label, route);
    if (linkedBefore !== before) return rebuilt + linkedBefore + text.slice(linkStart);
    rebuilt += before + match[0];
    cursor = linkStart + match[0].length;
  }
  const tail = text.slice(cursor);
  const linkedTail = linkFirstLabelInPlainText(tail, label, route);
  return linkedTail === tail ? text : rebuilt + linkedTail;
}

function linkFirstLabelInPlainText(text: string, label: string, route: string): string {
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(label, from);
    if (start === -1) return text;
    const end = start + label.length;
    if (hasScreenLabelBoundary(text, start, end)) {
      return text.slice(0, start) + `[[ir:${route}|${label}]]` + text.slice(end);
    }
    from = end;
  }
  return text;
}

function hasScreenLabelBoundary(text: string, start: number, end: number): boolean {
  return !isWordish(text[start - 1]) && !isWordish(text[end]);
}

function isWordish(ch: string | undefined): boolean {
  return !!ch && /^[\p{L}\p{N}_]$/u.test(ch);
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
