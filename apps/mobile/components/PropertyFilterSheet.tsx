import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import type { I18nKey } from "@/lib/i18n/keys";
import { Button } from "@/components/ui";
import type { PropertySearchFilters } from "@/lib/data/records-repository";

/**
 * Hoja de filtros del buscador de inmuebles (Fase 2 de
 * `docs/BUSCADOR-ALQUILER.md`). Modal de React Native, como AlertsSheet: sin
 * dependencias nativas nuevas, así que sale por OTA sin recompilar.
 *
 * Trabaja sobre un BORRADOR local y sólo lo entrega al pulsar "Aplicar": editar
 * un mínimo de precio con la búsqueda en vivo lanzaría una petición por cada
 * tecla ("6", "60", "600"…), y las dos primeras no significan nada.
 */

const TYPES = [
  "PISO", "HOUSE", "ATICO", "CHALET", "DUPLEX",
  "ESTUDIO", "LOFT", "LOCAL", "TERRENO", "OTRO",
] as const;

const SORTS: { value: NonNullable<PropertySearchFilters["sort"]>; labelKey: I18nKey }[] = [
  { value: "recent", labelKey: "search.sort_recent" },
  { value: "price_asc", labelKey: "search.sort_price_asc" },
  { value: "price_desc", labelKey: "search.sort_price_desc" },
  { value: "area_desc", labelKey: "search.sort_area_desc" },
];

const OPERATIONS: { value: PropertySearchFilters["operation"]; labelKey: I18nKey }[] = [
  { value: "RENT", labelKey: "records.op_rent" },
  { value: "SALE", labelKey: "records.op_sale" },
  { value: "ANY", labelKey: "records.op_all" },
];

/** Filtros vacíos: alquiler, sin restricciones, por reciente. */
export const EMPTY_FILTERS: PropertySearchFilters = { operation: "RENT", sort: "recent" };

/** Cuántos filtros hay puestos (para el contador del botón). */
export function countActiveFilters(f: PropertySearchFilters): number {
  return [
    f.province, f.city, f.neighborhood,
    f.minPrice, f.maxPrice, f.minRooms, f.minBaths, f.minArea, f.maxArea,
    f.types?.length ? f.types : undefined,
  ].filter((v) => v !== undefined && v !== null && `${v}`.trim() !== "").length;
}

/** Texto → número, o undefined si está vacío o no es un número. */
function num(value: string): number | undefined {
  const n = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function PropertyFilterSheet({
  visible,
  filters,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: PropertySearchFilters;
  onApply: (next: PropertySearchFilters) => void;
  onClose: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<PropertySearchFilters>(filters);
  // Los campos numéricos viven como TEXTO mientras se escriben: convertirlos en
  // cada tecla haría imposible borrar el contenido ("" → undefined → "").
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");

  // Al abrir, el borrador parte SIEMPRE de lo que está aplicado: si no, cerrar
  // sin aplicar y volver a abrir mostraría los cambios descartados.
  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setMinPrice(filters.minPrice != null ? String(filters.minPrice) : "");
    setMaxPrice(filters.maxPrice != null ? String(filters.maxPrice) : "");
    setMinArea(filters.minArea != null ? String(filters.minArea) : "");
    setMaxArea(filters.maxArea != null ? String(filters.maxArea) : "");
  }, [visible, filters]);

  const patch = (p: Partial<PropertySearchFilters>) => setDraft((d) => ({ ...d, ...p }));

  function toggleType(value: string) {
    const current = draft.types ?? [];
    patch({
      types: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  }

  function apply() {
    onApply({
      ...draft,
      minPrice: num(minPrice),
      maxPrice: num(maxPrice),
      minArea: num(minArea),
      maxArea: num(maxArea),
    });
    onClose();
  }

  function clear() {
    setDraft(EMPTY_FILTERS);
    setMinPrice(""); setMaxPrice(""); setMinArea(""); setMaxArea("");
  }

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          borderColor: active ? th.primary : th.border,
          backgroundColor: active ? th.primarySoft : "transparent",
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? th.primary : th.textMuted }]}>{label}</Text>
    </Pressable>
  );

  const input = (
    value: string,
    onChangeText: (v: string) => void,
    placeholder: string,
    numeric = false
  ) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={th.textSubtle}
      keyboardType={numeric ? "number-pad" : "default"}
      autoCorrect={false}
      style={[styles.input, { color: th.text, borderColor: th.border, backgroundColor: th.bg }]}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* Sin esto el teclado numérico tapa los campos de precio y superficie
          (están al final de la hoja). En Android basta con el adjustResize por
          defecto de Expo; forzar "height" ahí pelea con statusBarTranslucent. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.docked}
      >
      <View
        style={[
          styles.sheet,
          { backgroundColor: th.surface, borderColor: th.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: th.border }]} />
        <Text style={[styles.title, { color: th.text }]}>{t("search.filters_title")}</Text>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.section, { color: th.textMuted }]}>{t("form.operation")}</Text>
          <View style={styles.row}>
            {OPERATIONS.map((o) =>
              chip(t(o.labelKey), draft.operation === o.value, () => patch({ operation: o.value }), o.value)
            )}
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.zone")}</Text>
          {input(draft.province ?? "", (v) => patch({ province: v }), t("search.province_placeholder"))}
          {input(draft.city ?? "", (v) => patch({ city: v }), t("search.city_placeholder"))}
          {input(
            draft.neighborhood ?? "",
            (v) => patch({ neighborhood: v }),
            t("search.neighborhood_placeholder")
          )}

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.type")}</Text>
          <View style={styles.row}>
            {TYPES.map((value) =>
              chip(
                t(`form.type_${value}` as I18nKey),
                (draft.types ?? []).includes(value),
                () => toggleType(value),
                value
              )
            )}
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>
            {draft.operation === "SALE" ? t("search.price") : t("search.price_monthly")}
          </Text>
          <View style={styles.pair}>
            <View style={styles.half}>{input(minPrice, setMinPrice, t("search.min"), true)}</View>
            <View style={styles.half}>{input(maxPrice, setMaxPrice, t("search.max"), true)}</View>
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.rooms")}</Text>
          <View style={styles.row}>
            {chip(t("search.any"), draft.minRooms == null, () => patch({ minRooms: undefined }), "rooms-any")}
            {[1, 2, 3, 4].map((n) =>
              chip(`${n}+`, draft.minRooms === n, () => patch({ minRooms: n }), `rooms-${n}`)
            )}
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.baths")}</Text>
          <View style={styles.row}>
            {chip(t("search.any"), draft.minBaths == null, () => patch({ minBaths: undefined }), "baths-any")}
            {[1, 2, 3].map((n) =>
              chip(`${n}+`, draft.minBaths === n, () => patch({ minBaths: n }), `baths-${n}`)
            )}
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.area")}</Text>
          <View style={styles.pair}>
            <View style={styles.half}>{input(minArea, setMinArea, t("search.min"), true)}</View>
            <View style={styles.half}>{input(maxArea, setMaxArea, t("search.max"), true)}</View>
          </View>

          <Text style={[styles.section, { color: th.textMuted }]}>{t("search.sort")}</Text>
          <View style={styles.row}>
            {SORTS.map((s) =>
              chip(t(s.labelKey), (draft.sort ?? "recent") === s.value, () => patch({ sort: s.value }), s.value)
            )}
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Button label={t("search.clear")} variant="ghost" onPress={clear} fullWidth={false} style={styles.action} />
          <Button label={t("search.apply")} icon="funnel-outline" onPress={apply} fullWidth={false} style={styles.action} />
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  docked: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  title: { fontSize: 17, fontFamily: fonts.bodyBold, marginBottom: 6 },
  scroll: { flexGrow: 0 },
  section: { fontSize: 12, fontFamily: fonts.bodySemibold, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 8,
  },
  actions: { flexDirection: "row", gap: 10, paddingTop: 12 },
  action: { flex: 1 },
});
