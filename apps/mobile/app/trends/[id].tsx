import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NewsRow, newsTimeAgo } from "@/components/NewsSheet";
import { EmptyState, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAppStyle } from "@/lib/app-style-context";
import { fonts } from "@/lib/fonts";
import { useNews, type NewsItem } from "@/lib/hooks/useNews";
import { categoryColor } from "@/lib/records/config";
import { useTheme } from "@/lib/theme";
import { trendSourceLabel, trendSourceMeta, type TrendSource } from "@/lib/trends/sources";

type TrendDTO = {
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

// Noticias visibles: las que entran en la pantalla de entrada. El backend ya
// limita a 7; este tope frontal lo refuerza por si una build OTA va por delante
// del deploy del API.
const MAX_NEWS = 7;

export default function TrendDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trendId = typeof id === "string" ? id : null;
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const accent = categoryColor("trends", dark, appStyle);
  const [trend, setTrend] = useState<TrendDTO | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const newsQuery = useMemo(() => ({ kind: "trend" as const, trendId }), [trendId]);
  const { items: news, loading: newsLoading, error: newsError, reload: reloadNews } = useNews(newsQuery);
  const visibleNews = useMemo(() => news.slice(0, MAX_NEWS), [news]);
  const volumeFmt = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const loadTrend = useCallback(async () => {
    if (!trendId) {
      setTrend(null);
      setTrendError(t("trends.load_error"));
      setTrendLoading(false);
      return;
    }
    setTrendLoading(true);
    setTrendError(null);
    try {
      setTrend(await api<TrendDTO>(`/api/trends/${encodeURIComponent(trendId)}`));
    } catch (e) {
      setTrendError(e instanceof Error ? e.message : t("trends.load_error"));
    } finally {
      setTrendLoading(false);
    }
  }, [trendId, t]);

  useEffect(() => {
    void loadTrend();
  }, [loadTrend]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadTrend(), reloadNews()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadTrend, reloadNews]);

  const header = (
    <View style={styles.header}>
      {trendLoading && !trend ? (
        <ActivityIndicator color={accent} style={styles.headerLoader} />
      ) : trendError && !trend ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t("trends.load_error")}
          description={trendError}
          actionLabel={t("common.retry")}
          onAction={() => void loadTrend()}
        />
      ) : trend ? (
        <View style={[styles.hero, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
          <View style={styles.heroTop}>
            <View
              style={[styles.sourceChip, { backgroundColor: trendSourceMeta(trend.source).color }]}
              accessibilityLabel={trendSourceLabel(trend.source, t)}
            >
              <Ionicons name={trendSourceMeta(trend.source).icon} size={13} color="#fff" />
            </View>
            <Text style={[styles.updated, { color: th.textSubtle }]}>{newsTimeAgo(trend.updatedAt, t)}</Text>
          </View>
          <Text style={[styles.name, { color: th.text }]}>{trend.name}</Text>
          <View style={styles.stats}>
            {trend.volume != null && (
              <Text style={[styles.stat, { color: th.textMuted }]}>
                {t("trends.volume_label")}: {volumeFmt.format(trend.volume)}
              </Text>
            )}
            <Text style={[styles.stat, { color: th.textMuted }]}>#{trend.rank}</Text>
          </View>
        </View>
      ) : null}
      <Text style={[styles.sectionTitle, { color: th.text }]}>{t("trends.related_news")}</Text>
    </View>
  );

  return (
    <Screen background backgroundCategory="trends">
      <FlatList<NewsItem>
        data={visibleNews}
        keyExtractor={(item) => item.url}
        contentContainerStyle={[
          styles.list,
          visibleNews.length === 0 && styles.emptyList,
          { paddingBottom: 32 + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={accent}
            colors={[accent]}
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          newsLoading ? (
            <ActivityIndicator color={accent} style={styles.newsLoader} />
          ) : newsError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={t("trends.load_error")}
              description={newsError}
              actionLabel={t("common.retry")}
              onAction={reloadNews}
            />
          ) : (
            <EmptyState icon="newspaper-outline" title={t("trends.empty")} />
          )
        }
        renderItem={({ item }) => <NewsRow item={item} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1 },
  header: { gap: 14, paddingTop: 8 },
  headerLoader: { marginVertical: 18 },
  hero: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sourceChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sourceChipText: { color: "#fff", fontSize: 10, fontFamily: fonts.bodyBold },
  updated: { fontSize: 11, fontFamily: fonts.bodyMedium },
  name: { fontSize: 24, lineHeight: 30, fontFamily: fonts.headingBold },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { fontSize: 12, fontFamily: fonts.bodySemibold },
  sectionTitle: { fontSize: 17, fontFamily: fonts.headingBold, marginTop: 2 },
  newsLoader: { marginTop: 20 },
});
