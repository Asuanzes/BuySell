import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";

import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useNews, type NewsItem } from "@/lib/hooks/useNews";
import { newsItemToArticle } from "@/lib/article";

export type NewsAsset = { symbol: string; name: string };

/**
 * Sheet de "Noticias de economía" estilo app Bolsa de Apple: pestaña asomando
 * abajo (peek) → tira hacia arriba para la primera noticia → más arriba para el
 * feed completo con scroll. 3 detents. Solo en Cripto/Mercado.
 *
 * Las noticias (vía /api/news) son las de los activos registrados del usuario;
 * para activos sin cobertura, Yahoo devuelve economía generalista (que también
 * aporta). Las noticias que SÍ mencionan un activo tuyo (por símbolo o nombre)
 * se DESTACAN: borde de acento + chip con el símbolo.
 */
export function NewsSheet({ type, assets }: { type: "crypto" | "market"; assets: NewsAsset[] }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { items, loading, error } = useNews(type);
  const snapPoints = useMemo(() => ["11%", "42%", "90%"], []);
  const keywords = useMemo(() => buildKeywords(assets), [assets]);
  // Las noticias que mencionan un activo tuyo van PRIMERO (resaltadas), y dentro
  // de cada grupo se conserva el orden por fecha que ya trae el backend.
  const ordered = useMemo(() => {
    const withMatch = items.map((it) => ({
      it,
      matched: matchAssets(`${it.title} ${it.summary ?? ""}`, keywords),
    }));
    return [
      ...withMatch.filter((x) => x.matched.length > 0),
      ...withMatch.filter((x) => x.matched.length === 0),
    ];
  }, [items, keywords]);

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      backgroundStyle={[styles.bg, { backgroundColor: th.surface }]}
      handleIndicatorStyle={{ backgroundColor: th.textSubtle, width: 36 }}
      style={styles.sheetShadow}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.header, { color: th.text }]}>{t("news.title")}</Text>
        <Text style={[styles.sub, { color: th.textMuted }]}>{t("news.source_yahoo")}</Text>
        <View style={[styles.divider, { backgroundColor: th.border }]} />

        {loading && items.length === 0 && <ActivityIndicator color={th.primary} style={styles.loader} />}
        {error && <Text style={[styles.empty, { color: th.dangerFg }]}>{error}</Text>}
        {!loading && !error && items.length === 0 && (
          <Text style={[styles.empty, { color: th.textSubtle }]}>
            {t("news.empty")}
        </Text>
      )}

        {ordered.map(({ it, matched }) => (
          <NewsRow key={it.url} item={it} matched={matched} />
        ))}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

export function NewsRow({ item, matched = [] }: { item: NewsItem; matched?: string[] }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const highlighted = matched.length > 0;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/article",
          params: { article: JSON.stringify(newsItemToArticle(item)) },
        } as never)
      }
      style={({ pressed }) => [
        styles.item,
        { borderBottomColor: th.border },
        highlighted && [styles.itemHighlighted, { borderLeftColor: th.accent, backgroundColor: th.accentSoft }],
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.itemTop}>
        {item.source ? (
          <Text style={[styles.itemSource, { color: th.textSubtle }]} numberOfLines={1}>
            {item.source}
          </Text>
        ) : (
          <View style={styles.flex} />
        )}
        {matched.map((m) => (
          <View key={m} style={[styles.chip, { backgroundColor: th.accent }]}>
            <Text style={styles.chipText}>{m}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.itemTitle, { color: th.text }]} numberOfLines={3}>
        {item.title}
      </Text>
      {item.summary && (
        <Text style={[styles.itemSummary, { color: th.textMuted }]} numberOfLines={2}>
          {item.summary}
        </Text>
      )}
      <Text style={[styles.itemTime, { color: th.textSubtle }]}>{newsTimeAgo(item.publishedAt, t)}</Text>
    </Pressable>
  );
}

// ── Matching de activos (cliente): resalta noticias que mencionan un activo ──
const STOP = new Set([
  "ETF", "UCITS", "ACC", "DIST", "INC", "CORP", "PLC", "USD", "EUR", "GBP",
  "FUND", "INDEX", "SHARES", "ISHARES", "CLASS", "HEDGED", "STOCK", "TRUST",
]);

type Kw = { label: string; res: RegExp[] };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywords(assets: NewsAsset[]): Kw[] {
  const out: Kw[] = [];
  for (const a of assets) {
    const terms = new Set<string>();
    if (a.symbol) terms.add(a.symbol.trim());
    if (a.name) {
      for (const w of a.name.split(/[^A-Za-zÀ-ÿ0-9]+/)) {
        if (w.length >= 4 && !STOP.has(w.toUpperCase())) terms.add(w);
      }
    }
    const res = [...terms].filter(Boolean).map((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i"));
    if (res.length) out.push({ label: (a.symbol || a.name).toUpperCase().slice(0, 8), res });
  }
  return out;
}

function matchAssets(text: string, keywords: Kw[]): string[] {
  const hits = new Set<string>();
  for (const k of keywords) {
    if (k.res.some((re) => re.test(text))) hits.add(k.label);
  }
  return [...hits];
}

// Firma estrecha: el TFunction genérico instancia contra ~750 claves y revienta
// TS2589. Ver lib/trends/sources.ts (mismo patrón).
type AgoKey = "news.ago_now" | "news.ago_min" | "news.ago_h" | "news.ago_d";
type TFn = (key: AgoKey, opts?: { n: number }) => string;

/** "hace X" relativo. Recibe `t` como parámetro (patrón TFn): así re-renderiza
 *  al cambiar el idioma (no usar i18n.t directo). */
export function newsTimeAgo(iso: string | null, t: TFn): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return t("news.ago_now");
  if (mins < 60) return t("news.ago_min", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("news.ago_h", { n: hrs });
  return t("news.ago_d", { n: Math.floor(hrs / 24) });
}

const styles = StyleSheet.create({
  bg: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  sheetShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  header: { fontSize: 22, fontWeight: "800" },
  sub: { fontSize: 13, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 2 },
  loader: { marginTop: 24 },
  empty: { fontSize: 13, paddingVertical: 22, textAlign: "center" },
  flex: { flex: 1 },
  item: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  itemHighlighted: { borderLeftWidth: 3, paddingLeft: 12, marginLeft: -4, borderRadius: 6 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  itemSource: { fontSize: 11, flex: 1 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  chipText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  itemTitle: { fontSize: 16, fontFamily: fonts.bodyBold, lineHeight: 21 },
  itemSummary: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  itemTime: { fontSize: 11, marginTop: 6 },
});
