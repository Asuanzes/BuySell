import type { Ionicons } from "@expo/vector-icons";
import type { RecordType } from "@nidokey/shared";
import type { AppStyle } from "@/lib/app-style-context";

/**
 * Registry de tipos de registro para la UI móvil.
 *
 * Añadir un tipo nuevo a la interfaz = añadir una entrada aquí (label, color,
 * icono) + su valor en `RecordType` (shared). La lista, los chips de filtro y
 * la cabecera del detalle leen de aquí, así que no hay que tocar pantallas.
 *
 * `enabled: false` = tipo reservado (se muestra como "Próximamente" y su chip
 * de filtro queda deshabilitado).
 */
/**
 * Cómo se añade un registro de este tipo:
 *  - "url":    pegar/compartir una URL → extracción en WebView (inmuebles…).
 *  - "symbol": teclear un símbolo → fetch server-side por API (cripto).
 *  - "search": teclear nombre/ticker → buscar y elegir de una lista (mercados).
 *  - "wizard": asistente multi-paso en pantalla propia (viajes).
 *  - "soon":   aún no disponible (se muestra "Próximamente").
 *  - "none":   feed de solo lectura, sin alta de registro.
 */
export type AddMode = "url" | "symbol" | "search" | "soon" | "wizard" | "none";

export type RecordTypeConfig = {
  /** Color de acento del tipo (sobre fondo claro). */
  color: string;
  /** Variante aclarada para legibilidad como glifo/texto sobre fondo oscuro
   *  (#262320). Si falta, se usa `color`. Resuélvelo con `categoryColor(type, dark)`.
   *  Para FONDOS rellenos con texto blanco usa `color` (no esta variante). */
  colorDark?: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Si el tipo está implementado de extremo a extremo (lectura/lista). */
  enabled: boolean;
  /** Cómo se añade un registro de este tipo. */
  addMode: AddMode;
  /**
   * En addMode "search": si true, busca solo al pulsar (no en vivo al teclear).
   * Para fuentes de PAGO (empleo/Apify) cada búsqueda cuesta → evita gastar
   * crédito en cada pausa de escritura. Mercados (Yahoo, gratis) lo deja en vivo.
   */
  searchOnSubmit?: boolean;
};

// Etiquetas y placeholders viven en i18n: `types.{type}.label/singular`
// (useTypeI18n) y `types.{type}.placeholder` — aquí solo lo NO traducible
// (color/icono/modo). Los campos legacy label/singular/addPlaceholder se
// eliminaron al extraer i18n.
export const RECORD_TYPE_CONFIG: Record<RecordType, RecordTypeConfig> = {
  property: { color: "#3A5F8A", colorDark: "#6E93C0", icon: "home-outline",        enabled: true,  addMode: "url" },
  // Fase 0 food OFF (2026-08-09, autorizado): vertical apagada por decisión de
  // producto (PRODUCT_LOOP.md CICLO 2). Además está fuera de MANAGED_RECORD_TYPES
  // (category-prefs.ts), que es lo que la saca de rail/ajustes/inicio.
  food:     { color: "#B85C38", colorDark: "#D98260", icon: "restaurant-outline",  enabled: false, addMode: "soon" },
  holiday:  { color: "#2C7A8A", colorDark: "#5FAEBE", icon: "airplane-outline",    enabled: true,  addMode: "wizard" },
  crypto:   { color: "#B5893B", colorDark: "#D4A95A", icon: "logo-bitcoin",        enabled: true,  addMode: "symbol" },
  market:   { color: "#2D6A4F", colorDark: "#5FA383", icon: "trending-up-outline", enabled: true,  addMode: "search" },
  job:      { color: "#A86A17", colorDark: "#D29A4A", icon: "briefcase-outline",   enabled: true,  addMode: "search", searchOnSubmit: true },
  workout:  { color: "#A23E3E", colorDark: "#CF7059", icon: "barbell-outline",     enabled: false, addMode: "soon" },
  chat:     { color: "#6C5A9C", colorDark: "#8B79C4", icon: "chatbubbles-outline", enabled: true,  addMode: "soon" },
  book:     { color: "#8C4A52", colorDark: "#B86575", icon: "book-outline",        enabled: true,  addMode: "search", searchOnSubmit: true },
  trends:   { color: "#E0732B", colorDark: "#EE9A5A", icon: "logo-rss",            enabled: true,  addMode: "none" },
};

export function recordTypeConfig(type: RecordType): RecordTypeConfig {
  return RECORD_TYPE_CONFIG[type];
}

/**
 * Acentos de categoría para el estilo "2100" (visual futurista). Reemplazan la
 * paleta vintage (acero/latón) por una familia melocotón/naranja/magenta. Solo
 * los usa `categoryColor` cuando se le pasa `style: "2100"`; con `"vintage"` o
 * sin estilo, devuelve los colores actuales sin cambios.
 */
const RECORD_TYPE_2100: Record<RecordType, { color: string; colorDark: string }> = {
  property: { color: "#D44D7C", colorDark: "#F26D9A" }, // magenta cálido
  food:     { color: "#F08A4B", colorDark: "#FFB994" }, // melocotón
  holiday:  { color: "#C25CA8", colorDark: "#E37FC4" }, // orquídea
  crypto:   { color: "#E8A33C", colorDark: "#FFC76B" }, // ámbar
  market:   { color: "#B14A8F", colorDark: "#D971B0" }, // magenta uva
  job:      { color: "#D86A4F", colorDark: "#F08F73" }, // teja melocotón
  workout:  { color: "#B24A65", colorDark: "#D66C84" }, // rosa carmesí
  chat:     { color: "#9A56C2", colorDark: "#BD86E0" }, // violeta luminoso
  book:     { color: "#C45670", colorDark: "#E8788B" }, // coral rosa
  trends:   { color: "#F08A4B", colorDark: "#FFB07A" }, // melocotón RSS
};

/**
 * Color de acento del tipo resuelto para el tema activo. En oscuro usa
 * `colorDark` (aclarado para legibilidad de glifo/texto sobre #262320); en claro
 * usa `color`. Para FONDOS rellenos con texto blanco usa `color` directamente
 * (la variante clara empeoraría el contraste del texto blanco).
 *
 * `style` opcional (default "vintage"): cuando es "2100" devuelve la paleta
 * melocotón/magenta del rediseño en lugar del acero/latón clásico. Mantiene la
 * firma anterior compatible: las llamadas existentes `categoryColor(t, dark)`
 * siguen devolviendo Vintage hasta que el callsite pase explícitamente "2100".
 */
export function categoryColor(type: RecordType, dark: boolean, style: AppStyle = "vintage"): string {
  if (style === "2100") {
    const c = RECORD_TYPE_2100[type];
    return dark ? c.colorDark : c.color;
  }
  if (style === "operativo") {
    const cfg = RECORD_TYPE_CONFIG[type];
    return dark && cfg.colorDark ? cfg.colorDark : cfg.color;
  }
  const cfg = RECORD_TYPE_CONFIG[type];
  return dark && cfg.colorDark ? cfg.colorDark : cfg.color;
}
