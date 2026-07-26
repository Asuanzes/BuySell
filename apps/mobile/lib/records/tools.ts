import type { Ionicons } from "@expo/vector-icons";
import type { RecordType } from "@nidokey/shared";
import type { I18nKey } from "@/lib/i18n/keys";

/**
 * Herramientas contextuales por categoría (el "menú lateral / panel contextual"
 * que aparece DENTRO de un registro). Config-driven: añadir una categoría o una
 * herramienta = añadir una entrada aquí; el `CategoryContextSheet` y el dispatch
 * de la pantalla de detalle leen de esto, sin reescribir UI.
 *
 * `kind` decide el comportamiento (lo resuelve el dispatcher por `id`, ver
 * `app/property/[id].tsx`):
 *  - "action": ejecuta algo (re-check, etc.) y muestra feedback.
 *  - "route":  navega a una sub-pantalla (simulador, placeholders).
 *  - "info":   muestra información (puede ser una ruta o un aviso).
 *  - "share":  abre el diálogo de compartir nativo.
 *
 * `enabled: false` ⇒ se muestra atenuada como "Próximamente".
 */
export type ToolKind = "action" | "route" | "info" | "share";

export type ToolDef = {
  id: string;
  /** CLAVE i18n de la etiqueta (la resuelve el punto de render con t()). El
   *  `id` es string libre → no cabe template literal tipado; la clave
   *  explícita queda verificada por tsc igual que t("clave.mala"). */
  labelKey: I18nKey;
  icon: keyof typeof Ionicons.glyphMap;
  kind: ToolKind;
  enabled: boolean;
  /** Clave i18n del texto auxiliar (p. ej. common.soon en deshabilitadas). */
  hintKey?: I18nKey;
};

const PROPERTY_TOOLS: ToolDef[] = [
  { id: "recheck", labelKey: "tools.panel.recheck_label", icon: "refresh-outline", kind: "action", enabled: true, hintKey: "tools.panel.recheck_hint" },
  { id: "alert", labelKey: "tools.panel.alert_label", icon: "notifications-outline", kind: "route", enabled: true, hintKey: "tools.panel.alert_hint" },
  { id: "mortgage", labelKey: "tools.mortgage.title", icon: "calculator-outline", kind: "route", enabled: true, hintKey: "tools.panel.mortgage_hint" },
  { id: "catastro", labelKey: "tools.catastro.title", icon: "document-text-outline", kind: "route", enabled: true, hintKey: "tools.panel.catastro_hint" },
  { id: "registro", labelKey: "tools.registro.title", icon: "ribbon-outline", kind: "route", enabled: true, hintKey: "tools.panel.registro_hint" },
  { id: "ine", labelKey: "tools.ine.title", icon: "bar-chart-outline", kind: "route", enabled: true, hintKey: "tools.panel.ine_hint" },
  // "Enviar a un chat" NO va aquí: es el botón visible person-add de la ficha
  // (ShareRecordSheet) — enterrado en herramientas nadie lo encontraba.
  { id: "share", labelKey: "common.share", icon: "share-outline", kind: "share", enabled: true },
];

const CRYPTO_TOOLS: ToolDef[] = [
  // En cripto/mercados la entrada a las alertas es el FAB de campana de
  // AssetDetail (que sirve a los dos tipos); esta fila queda para cuando el
  // panel contextual se cablee también ahí.
  { id: "alert", labelKey: "tools.panel.alert_label", icon: "notifications-outline", kind: "route", enabled: true, hintKey: "tools.panel.alert_hint" },
  { id: "news", labelKey: "tools.panel.news_label", icon: "newspaper-outline", kind: "info", enabled: false, hintKey: "common.soon" },
  { id: "share", labelKey: "common.share", icon: "share-outline", kind: "share", enabled: true },
];

const RECORD_TOOLS: Partial<Record<RecordType, ToolDef[]>> = {
  property: PROPERTY_TOOLS,
  crypto: CRYPTO_TOOLS,
};

export function toolsForType(type: RecordType): ToolDef[] {
  return RECORD_TOOLS[type] ?? [];
}
