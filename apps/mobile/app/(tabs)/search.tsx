import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { searchProperties, searchRecords, type PropertySearchFilters } from "@/lib/data/records-repository";
import { RecordCard } from "@/components/RecordCard";
import {
  EMPTY_FILTERS,
  PropertyFilterSheet,
  countActiveFilters,
} from "@/components/PropertyFilterSheet";
import { EmptyState, Screen } from "@/components/ui";

/**
 * Buscador. Dos ámbitos:
 *  - "Todo": búsqueda de texto sobre todos los registros (lo de siempre).
 *  - "Inmuebles": buscador con filtros (zona, tipo, precio, habitaciones,
 *    baños, superficie y orden) contra `/api/rentals/search`.
 *
 * En Inmuebles se puede buscar SIN texto: los filtros por sí solos son una
 * búsqueda válida ("alquiler en Vizcaya hasta 900 €"). Los filtros sólo se
 * aplican al pulsar "Aplicar" en la hoja — ver PropertyFilterSheet.
 */
export default function SearchScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [scope, setScope] = useState<"all" | "property">("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<PropertySearchFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounce de 250ms sobre el texto.
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(handle);
  }, [q]);

  const activeFilters = countActiveFilters(filters);
  const isProperty = scope === "property";
  const textReady = debounced.trim().length >= 2;
  // Inmuebles: los filtros solos ya son una búsqueda; en "Todo" hace falta texto.
  const ready = isProperty ? textReady || activeFilters > 0 : textReady;

  const { data: general, loading: loadingGeneral } = useQuery(
    () => searchRecords(debounced),
    [debounced],
    { enabled: ready && !isProperty, revalidateOnFocus: false }
  );

  const { data: properties, loading: loadingProperties } = useQuery(
    () => searchProperties({ ...filters, q: debounced }),
    [debounced, JSON.stringify(filters)],
    { enabled: ready && isProperty, revalidateOnFocus: false }
  );

  const results = isProperty ? properties?.results : general;
  const loading = isProperty ? loadingProperties : loadingGeneral;
  // Provincia escrita pero no reconocida: el backend la descartó, así que el
  // usuario debe saberlo (si no, "0 resultados" parece un corpus vacío).
  const unknownProvince =
    isProperty && !!filters.province?.trim() && properties?.resolvedProvince == null
      ? filters.province.trim()
      : null;

  return (
    <Screen>
      <View style={styles.scopeRow}>
        {(["all", "property"] as const).map((s) => {
          const active = scope === s;
          return (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.scopeChip,
                {
                  borderColor: active ? th.primary : th.border,
                  backgroundColor: active ? th.primarySoft : "transparent",
                },
              ]}
            >
              <Text style={[styles.scopeText, { color: active ? th.primary : th.textMuted }]}>
                {s === "all" ? t("search.scope_all") : t("search.scope_property")}
              </Text>
            </Pressable>
          );
        })}

        {isProperty && (
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            style={[
              styles.scopeChip,
              styles.filterBtn,
              {
                borderColor: activeFilters ? th.primary : th.border,
                backgroundColor: activeFilters ? th.primarySoft : "transparent",
              },
            ]}
          >
            <Ionicons
              name="funnel-outline"
              size={14}
              color={activeFilters ? th.primary : th.textMuted}
            />
            <Text style={[styles.scopeText, { color: activeFilters ? th.primary : th.textMuted }]}>
              {activeFilters
                ? t("search.filters_count", { count: activeFilters })
                : t("search.filters")}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.searchBar, { backgroundColor: th.surface, borderColor: th.border }]}>
        <Ionicons name="search" size={16} color={th.textSubtle} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("search.placeholder")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, { color: th.text }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading && ready && <ActivityIndicator size="small" color={th.primary} />}
      </View>

      {unknownProvince && (
        <Text style={[styles.notice, { color: th.textMuted }]}>
          {t("search.province_unknown", { name: unknownProvince })}
        </Text>
      )}

      {isProperty && properties?.total != null && results && results.length > 0 && (
        <Text style={[styles.notice, { color: th.textSubtle }]}>
          {t("search.results_count", { count: properties.total })}
        </Text>
      )}

      {ready && results && results.length === 0 && !loading && (
        isProperty ? (
          <EmptyState
            icon="funnel-outline"
            title={t("search.empty_filters_title")}
            description={t("search.empty_filters_desc")}
          />
        ) : (
          <EmptyState icon="search-outline" title={t("search.no_results", { q: debounced })} />
        )
      )}

      <FlatList
        data={results ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <RecordCard record={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />

      <PropertyFilterSheet
        visible={sheetOpen}
        filters={filters}
        onApply={setFilters}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scopeRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  scopeText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14 },
  notice: { fontSize: 12, fontFamily: fonts.bodyMedium, marginHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16 },
});
