import type { Ionicons } from "@expo/vector-icons";

/**
 * Metadatos de presentación por fuente de tendencia: icono de marca (Ionicons
 * `logo-*`) + color representativo de la red. Fuente única para los chips y las
 * pastillas de las pantallas de tendencias.
 *
 * Las fuentes muertas (reddit/linkedin/xiaohongshu/xueqiu/tiktok/youtube) ya no
 * tienen entrada ni chip; si llegara a colarse una fuente desconocida, se usa
 * FALLBACK para no romper el render.
 */
export type TrendSource =
  | "twitter"
  | "googletrends"
  | "instagram"
  | "hackernews"
  | "twitch"
  // valores legacy que aún existen en el enum del backend (sin chip):
  | "reddit"
  | "linkedin"
  | "xiaohongshu"
  | "xueqiu"
  | "tiktok"
  | "youtube";

export type TrendFilter = "all" | "twitter" | "googletrends" | "instagram" | "hackernews" | "twitch";

type IconName = keyof typeof Ionicons.glyphMap;
/**
 * Firma ESTRECHA de t() para este módulo: el TFunction genérico de i18next
 * instancia recursivamente contra las ~750 claves del recurso y revienta el
 * límite de profundidad de TS (TS2589) en cuanto el JSON crece. Con la unión
 * literal de las claves que este fichero usa, el typecheck es O(6) y estable.
 * Mismo patrón que components/food/status-labels.ts.
 */
type TrendLabelKey =
  | "trends.filter_all"
  | "trends.source_twitter"
  | "trends.source_googletrends"
  | "trends.source_instagram"
  | "trends.source_hackernews"
  | "trends.source_twitch";
type TFn = (key: TrendLabelKey) => string;

type SourceMeta = { color: string; icon: IconName };

/** Color de marca (fondo de pastilla, texto/icono SIEMPRE blanco encima). */
export const TREND_SOURCE_META: Partial<Record<TrendSource, SourceMeta>> = {
  twitter: { color: "#000000", icon: "logo-x" },
  googletrends: { color: "#4285F4", icon: "logo-google" },
  instagram: { color: "#E1306C", icon: "logo-instagram" },
  hackernews: { color: "#FF6600", icon: "flame" },
  twitch: { color: "#9146FF", icon: "logo-twitch" },
};

const FALLBACK: SourceMeta = { color: "#6B6862", icon: "logo-rss" };

/** Chips de filtro visibles (solo fuentes vivas).
 * Instagram fuera: /explore/ tiene muro de login y devuelve `blocked` (chip
 * quedaría siempre vacío). El meta + provider quedan listos por si algún día es
 * alcanzable keyless. */
export const TREND_FILTERS: TrendFilter[] = [
  "all",
  "twitter",
  "googletrends",
  "hackernews",
  "twitch",
];

export function trendSourceMeta(source: string): SourceMeta {
  return TREND_SOURCE_META[source as TrendSource] ?? FALLBACK;
}

/**
 * Etiqueta traducida de la fuente. Switch con claves i18n LITERALES a propósito:
 * pasar una clave dinámica (string) a `t` dispara el tipo de retorno complejo de
 * i18next y rompe el typecheck; con literales devuelve `string` limpio.
 */
export function trendSourceLabel(source: TrendFilter | string, t: TFn): string {
  switch (source) {
    case "all":
      return t("trends.filter_all");
    case "twitter":
      return t("trends.source_twitter");
    case "googletrends":
      return t("trends.source_googletrends");
    case "instagram":
      return t("trends.source_instagram");
    case "hackernews":
      return t("trends.source_hackernews");
    case "twitch":
      return t("trends.source_twitch");
    default:
      return source;
  }
}
