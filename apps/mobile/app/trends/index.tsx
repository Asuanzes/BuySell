import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Screen } from "@/components/ui";
import { newsTimeAgo } from "@/components/NewsSheet";
import { api } from "@/lib/api";
import { useAppStyle } from "@/lib/app-style-context";
import { fonts } from "@/lib/fonts";
import { categoryColor } from "@/lib/records/config";
import { useTheme } from "@/lib/theme";
import {
  TREND_FILTERS,
  trendSourceLabel,
  trendSourceMeta,
  type TrendFilter,
  type TrendSource,
} from "@/lib/trends/sources";

export type TrendDTO = {
  id: string;
  name: string;
  source: TrendSource;
  query: string;
  locale: string;
  rank: number;
  volume: number | null;
  url: string | null;
  updatedAt: string;
};

type TrendsResponse = { items: TrendDTO[]; nextCursor: string | null };

export default function TrendsScreen() {
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const accent = categoryColor("trends", dark, appStyle);
  const [source, setSource] = useState<TrendFilter>("all");
  const [items, setItems] = useState<TrendDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volumeFmt = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const load = useCallback(async (mode: "initial" | "refresh" | "force" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      // "force": empuja un re-scrape en el servidor (respeta su cooldown) y
      // luego recarga. Sin esto, tirar para refrescar solo re-lee la BD.
      if (mode === "force") {
        try {
          await api("/api/trends/refresh", { method: "POST" });
        } catch {
          /* cooldown / sin sesión: seguimos y recargamos lo que haya */
        }
      }
      const qs = new URLSearchParams({ source });
      const r = await api<TrendsResponse>(`/api/trends?${qs.toString()}`);
      setItems(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trends.load_error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [source, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen background backgroundCategory="trends">
      <View style={styles.wrap}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            items.length === 0 && styles.emptyList,
            { paddingBottom: 26 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("force")}
              tintColor={accent}
              colors={[accent]}
            />
          }
          ListHeaderComponent={
            <View style={styles.filters}>
              {TREND_FILTERS.map((f) => {
                const active = source === f;
                const meta = f === "all" ? null : trendSourceMeta(f);
                // El icono va en el color de marca; X (#000) sería invisible
                // sobre el chip neutro en oscuro → para "twitter" usa th.text.
                const iconColor = f === "twitter" ? th.text : meta?.color;
                return (
                  <Pressable
                    key={f}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={trendSourceLabel(f, t)}
                    onPress={() => setSource(f)}
                    style={[
                      styles.filterChip,
                      { borderColor: active ? accent : th.border, backgroundColor: active ? th.accentSoft : th.surfaceRaised },
                    ]}
                  >
                    {meta ? (
                      <Ionicons name={meta.icon} size={16} color={iconColor} />
                    ) : (
                      <Text style={[styles.filterText, { color: active ? accent : th.textMuted }]}>
                        {trendSourceLabel(f, t)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={accent} style={styles.loader} />
            ) : error ? (
              <EmptyState
                icon="cloud-offline-outline"
                title={t("trends.load_error")}
                description={error}
                actionLabel={t("common.retry")}
                onAction={() => void load()}
              />
            ) : (
              <EmptyState icon="logo-rss" title={t("trends.empty")} />
            )
          }
          renderItem={({ item }) => {
            const meta = trendSourceMeta(item.source);
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/trends/[id]",
                    params: { id: item.id },
                  } as never)
                }
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: th.surfaceRaised, borderColor: th.border },
                  pressed && { opacity: 0.65 },
                ]}
              >
                <View style={styles.rowMain}>
                  <Text style={[styles.name, { color: th.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.meta}>
                    <View
                      style={[styles.sourceChip, { backgroundColor: meta.color }]}
                      accessibilityLabel={trendSourceLabel(item.source, t)}
                    >
                      <Ionicons name={meta.icon} size={13} color="#fff" />
                    </View>
                    {item.volume != null && (
                      <Text style={[styles.metaText, { color: th.textMuted }]} numberOfLines={1}>
                        {t("trends.volume_label")}: {volumeFmt.format(item.volume)}
                      </Text>
                    )}
                    <Text style={[styles.metaText, { color: th.textSubtle }]} numberOfLines={1}>
                      {newsTimeAgo(item.updatedAt, t)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
              </Pressable>
            );
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: 14, paddingBottom: 26, gap: 10 },
  emptyList: { flexGrow: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  loader: { marginTop: 28 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowMain: { flex: 1, gap: 8 },
  name: { fontSize: 16, lineHeight: 21, fontFamily: fonts.bodyBold },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  sourceChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sourceChipText: { color: "#fff", fontSize: 10, fontFamily: fonts.bodyBold },
  metaText: { fontSize: 11, fontFamily: fonts.bodyMedium },
});
