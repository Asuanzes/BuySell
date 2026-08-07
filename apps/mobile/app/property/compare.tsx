import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { formatPrice } from "@nidokey/shared";
import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import { fetchPropertyDetail, type PropertyDetail } from "@/lib/records/property";
import {
  buildCompareRows,
  fetchExistingProperties,
  hasMixedOperations,
  parseCompareIds,
  type CompareCell,
  type CompareMetric,
} from "@/lib/records/compare";

const DASH = "—";
const COL_WIDTH = 170;

const PORTAL_BRAND: Record<string, string> = {
  IDEALISTA: "Idealista",
  FOTOCASA: "Fotocasa",
  PISOS_COM: "Pisos.com",
  MILANUNCIOS: "Milanuncios",
  HABITACLIA: "Habitaclia",
  YAENCONTRE: "Yaencontre",
  THINKSPAIN: "ThinkSPAIN",
  INDOMIO: "Indomio",
};

export default function PropertyCompareScreen() {
  const { ids } = useLocalSearchParams<{ ids?: string | string[] }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const parsedIds = useMemo(() => parseCompareIds(ids), [ids]);
  const [data, setData] = useState<PropertyDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (parsedIds.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchExistingProperties(parsedIds, fetchPropertyDetail));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("compare.error_message"));
    } finally {
      setLoading(false);
    }
  }, [parsedIds, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (parsedIds.length < 2 || (data != null && data.length < 2)) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("compare.title") }} />
        <Ionicons name="git-compare-outline" size={28} color={th.textMuted} />
        <Text style={[styles.emptyTitle, { color: th.text }]}>{t("compare.insufficient_title")}</Text>
        <Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: th.accent }]}>
          <Text style={styles.primaryButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("compare.title") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("compare.title") }} />
        <Ionicons name="cloud-offline-outline" size={28} color={th.dangerFg} />
        <Text style={[styles.emptyTitle, { color: th.text }]}>{t("compare.error_title")}</Text>
        <Text style={[styles.emptyBody, { color: th.textMuted }]}>{error}</Text>
        <Pressable onPress={() => void load()} style={[styles.primaryButton, { backgroundColor: th.accent }]}>
          <Text style={styles.primaryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const properties = data ?? [];
  const rows = buildCompareRows(properties);
  const mixed = hasMixedOperations(properties);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.bg }]} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("compare.title") }} />
      <ScrollView testID="compare-screen" contentContainerStyle={styles.content}>
        {mixed && (
          <View style={[styles.notice, { backgroundColor: th.accentSoft, borderColor: th.accent }]}>
            <Ionicons name="information-circle-outline" size={18} color={th.accent} />
            <Text style={[styles.noticeText, { color: th.text }]}>{t("compare.mixed_notice")}</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.headerRow}>
              <View style={styles.labelSpacer} />
              {properties.map((p) => (
                <Pressable
                  key={p.id}
                  testID={`compare-col-${p.id}`}
                  onPress={() => router.push(`/property/${p.id}` as never)}
                  style={[styles.headerCell, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}
                >
                  {p.media.find((m) => m.kind === "PHOTO")?.url ? (
                    <Image source={{ uri: p.media.find((m) => m.kind === "PHOTO")?.url }} style={styles.photo} contentFit="cover" />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: th.imagePlaceholder }]}>
                      <Ionicons name="home-outline" size={24} color={th.textSubtle} />
                    </View>
                  )}
                  <Text style={[styles.headerTitle, { color: th.text }]} numberOfLines={2}>{p.title}</Text>
                  <Ionicons name="chevron-forward" size={14} color={th.accent} />
                </Pressable>
              ))}
            </View>

            {rows.map((row) => (
              <View key={row.metric} style={[styles.dataRow, { borderBottomColor: th.border }]}>
                <Text style={[styles.rowLabel, { color: th.textMuted }]}>{labelFor(row.metric, t)}</Text>
                {row.cells.map((cell) => (
                  <View
                    key={`${row.metric}-${cell.propertyId}`}
                    style={[
                      styles.valueCell,
                      cell.best && { backgroundColor: th.accentSoft, borderColor: th.accent },
                      !cell.best && { borderColor: "transparent" },
                    ]}
                  >
                    <Text style={[styles.valueText, { color: cell.best ? th.accent : th.text }]} numberOfLines={2}>
                      {formatCell(row.metric, cell, t)}
                    </Text>
                    {cell.best && (
                      <Ionicons
                        name="trending-up-outline"
                        size={14}
                        color={th.accent}
                        accessibilityLabel={t("compare.best_value")}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function labelFor(metric: CompareMetric, t: TFunction<"translation", undefined>): string {
  switch (metric) {
    case "salePrice":
      return t("compare.rows.salePrice");
    case "rentPrice":
      return t("compare.rows.rentPrice");
    case "pricePerSqm":
      return t("compare.rows.pricePerSqm");
    case "builtArea":
      return t("compare.rows.builtArea");
    case "rooms":
      return t("compare.rows.rooms");
    case "bathrooms":
      return t("compare.rows.bathrooms");
    case "floor":
      return t("compare.rows.floor");
    case "location":
      return t("compare.rows.location");
    case "status":
      return t("compare.rows.status");
    case "portal":
      return t("compare.rows.portal");
  }
}

function formatCell(metric: CompareMetric, cell: CompareCell, t: TFunction<"translation", undefined>): string {
  const value = cell.value;
  if (value == null || value === "") return DASH;
  if (metric === "salePrice") return formatPrice(value as number);
  if (metric === "rentPrice") return t("card.per_month", { value: formatPrice(value as number) });
  if (metric === "pricePerSqm") {
    return t(cell.operationKind === "rent" ? "compare.per_sqm_month" : "compare.per_sqm", {
      value: formatPrice(value as number),
    });
  }
  if (metric === "builtArea") return t("compare.area_sqm", { value });
  if (metric === "status") return statusLabel(String(value), t);
  if (metric === "portal") return portalLabel(String(value), t);
  return String(value);
}

function statusLabel(status: string, t: TFunction<"translation", undefined>): string {
  switch (status) {
    case "FOR_SALE":
      return t("status.for_sale");
    case "RESERVED":
      return t("status.reserved");
    case "SOLD":
      return t("status.sold");
    case "WITHDRAWN":
      return t("status.withdrawn");
    case "FOR_RENT":
      return t("status.for_rent");
    case "RENTED":
      return t("status.rented");
    default:
      return status;
  }
}

function portalLabel(portal: string, t: TFunction<"translation", undefined>): string {
  if (portal === "OTHER") return t("detail.property.portal_other");
  if (portal === "MANUAL") return t("detail.property.portal_manual");
  return PORTAL_BRAND[portal] ?? portal;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  content: { padding: 12, paddingBottom: 28 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bodyBold, textAlign: "center" },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, textAlign: "center" },
  primaryButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: fonts.bodyBold },
  notice: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.bodyMedium },
  headerRow: { flexDirection: "row", alignItems: "stretch", marginBottom: 8 },
  labelSpacer: { width: 112 },
  headerCell: { width: COL_WIDTH, borderWidth: 1, borderRadius: 12, padding: 8, marginRight: 8, minHeight: 144 },
  photo: { width: "100%", height: 78, borderRadius: 8, marginBottom: 7 },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  headerTitle: { minHeight: 38, fontSize: 13, lineHeight: 18, fontFamily: fonts.bodySemibold },
  dataRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  rowLabel: { width: 112, fontSize: 12, lineHeight: 16, fontFamily: fonts.bodySemibold, paddingRight: 8 },
  valueCell: {
    width: COL_WIDTH,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  valueText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.bodyMedium },
});
