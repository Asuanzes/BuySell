import { useEffect, useMemo, useRef, useState } from "react";
import { fonts } from "@/lib/fonts";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LineChart } from "react-native-wagmi-charts";
import { captureRef } from "react-native-view-shot";
import RNShare from "react-native-share";
import { useTranslation } from "react-i18next";

import { type BaseRecord, metaField, compactNumber } from "@nidokey/shared";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { marketLogoUrl } from "@/lib/records/market-logo";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";
import { AlertsSheet } from "@/components/AlertsSheet";

/**
 * Detalle de un activo (cripto o mercado), estilo Yahoo Finanzas:
 * cabecera (logo · símbolo · nombre · precio · cambio · bolsa/moneda) +
 * selector de rangos + gráfico interactivo (scrub con el dedo) + grid de stats.
 *
 * El gráfico pide histórico REAL por rango a `/api/records/[id]/chart?range=`
 * (Yahoo: una serie distinta por 1D/1S/1M/…). Mientras carga o si la red falla,
 * usa de fallback los snapshots locales (`meta.detail.snapshots`) o el sparkline.
 * El % mostrado es el cambio DEL RANGO (primer→último), estilo Yahoo.
 */

const UP = "#15803D";
const DOWN = "#B91C1C";

type Snapshot = { value: number; observedAt: string };
type Point = { timestamp: number; value: number };

// La `key` viaja a la API (/chart?range=) y NO se traduce; el label visible sale
// de i18n (`asset.range_*`, p. ej. ES "1S"/"Máx" → EN "1W"/"Max"). Union literal
// para que el template literal de la clave quede tipado.
type RangeKey = "1D" | "1S" | "1M" | "3M" | "6M" | "1A" | "MAX";
const RANGES: { key: RangeKey; days: number | null }[] = [
  { key: "1D", days: 1 },
  { key: "1S", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 180 },
  { key: "1A", days: 365 },
  { key: "MAX", days: null },
];

export function AssetDetail({ type }: { type: "crypto" | "market" }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const [shareOpen, setShareOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState<BaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("1S");
  const shotRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const r = await api<BaseRecord>(`/api/records/${id}?type=${type}`);
        if (alive) setRecord(r);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("asset.load_error"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, type]);

  // ── Histórico real por rango (Yahoo): esto hace que cada pill muestre datos
  // distintos. Antes solo se filtraban los snapshots locales (ventana corta de
  // seguimiento), por eso todos los tramos largos se veían casi iguales. ──
  const [chart, setChart] = useState<{
    points: Point[];
    previousClose: number | null;
    currency: string | null;
  } | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setChartLoading(true);
    (async () => {
      try {
        const r = await api<{
          points: { t: number; v: number }[];
          previousClose: number | null;
          currency: string | null;
        }>(`/api/records/${id}/chart?type=${type}&range=${rangeKey}`);
        if (!alive) return;
        const pts: Point[] = (r.points ?? [])
          .map((p) => ({ timestamp: p.t, value: p.v }))
          .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value));
        setChart({ points: pts, previousClose: r.previousClose, currency: r.currency });
      } catch {
        if (alive) setChart(null); // fallback a snapshots locales
      } finally {
        if (alive) setChartLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, type, rangeKey]);

  // ── Serie de precios (histórico de snapshots, en unidades de precio) ──
  const fullSeries = useMemo<Point[]>(() => {
    if (!record) return [];
    const detail = metaField<{ snapshots?: Snapshot[] } | null>(record, "detail", null);
    const snaps = detail?.snapshots ?? [];
    const pts: Point[] = snaps
      .map((s) => ({ timestamp: Date.parse(s.observedAt), value: s.value / 100 }))
      .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value));
    if (pts.length >= 2) return pts;
    // Fallback: sparkline (sin timestamps reales → equiespaciado hacia atrás).
    const spark = metaField<number[]>(record, "sparkline", []);
    if (spark.length >= 2) {
      const now = Date.now();
      const step = (7 * 24 * 3600 * 1000) / (spark.length - 1);
      return spark.map((v, i) => ({ timestamp: now - (spark.length - 1 - i) * step, value: v }));
    }
    return [];
  }, [record]);

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const rangeLabel = t(`asset.range_${range.key}`);
  // Fallback local (snapshots) mientras carga el histórico real o si Yahoo falla.
  const localSeries = useMemo<Point[]>(() => {
    if (range.days == null) return fullSeries;
    const cutoff = Date.now() - range.days * 24 * 3600 * 1000;
    const filtered = fullSeries.filter((p) => p.timestamp >= cutoff);
    return filtered.length >= 2 ? filtered : fullSeries;
  }, [fullSeries, range]);
  // Serie a dibujar: histórico real de Yahoo por rango si lo hay; si no, local.
  const series = chart && chart.points.length >= 2 ? chart.points : localSeries;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }
  if (error || !record) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Text style={{ color: th.dangerFg }}>{error ?? t("detail.not_found")}</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={{ color: th.primary }}>{t("common.go_back")}</Text>
        </Pressable>
      </View>
    );
  }

  const isMarket = type === "market";
  const symbol = metaField<string>(record, "symbol", record.title);
  const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const recordTitle = record.title;
  const quote = metaField<string>(record, "quoteCurrency", "EUR");
  const quoteCur = (chart?.currency ?? quote).toUpperCase();
  const change24h = metaField<number | null>(record, "change24h", null);
  const volume = metaField<number | null>(record, "volume", null);
  const marketCap = metaField<number | null>(record, "marketCap", null);
  const exchange = metaField<string | null>(record, "exchange", null);
  const logoUri = isMarket ? marketLogoUrl({ title: record.title, symbol }) : record.imageUrl ?? null;

  // Cambio del RANGO seleccionado (primer→último de la serie), estilo Yahoo: el %
  // es coherente con el tramo elegido, no un 24h fijo. Si aún no hay serie del
  // rango, cae al change24h del registro.
  const lastPrice = series.length ? series[series.length - 1].value : null;
  const firstPrice = series.length ? series[0].value : null;
  const rangeAbs = firstPrice != null && lastPrice != null ? lastPrice - firstPrice : null;
  const rangePct =
    firstPrice && lastPrice != null ? ((lastPrice - firstPrice) / firstPrice) * 100 : change24h;
  const up = (rangePct ?? 0) >= 0;
  const trendColor = up ? UP : DOWN;

  const stats: [string, string][] = [
    [t("asset.stat_change", { range: rangeLabel }), rangePct != null ? `${up ? "+" : ""}${rangePct.toFixed(2).replace(".", ",")} %` : "—"],
    [isMarket ? t("card.volume") : t("card.volume_24h"), compactNumber(volume, isMarket ? "" : quoteCur)],
    [isMarket ? t("card.exchange") : t("card.market_cap"), isMarket ? exchange ?? "—" : compactNumber(marketCap, quoteCur)],
    [t("asset.currency"), quoteCur],
  ];

  // Compartir = captura del bloque (nombre + precio + gráfico, con el pie
  // "NIDOKEY") + enlace TOCABLE a Yahoo Finanzas.
  async function onShare() {
    try {
      setCapturing(true);
      await new Promise((r) => setTimeout(r, 60)); // deja renderizar el pie de marca
      let uri: string;
      try {
        uri = await captureRef(shotRef, { format: "png", quality: 1 });
      } finally {
        setCapturing(false);
      }
      const fileUrl = uri.startsWith("file://") ? uri : `file://${uri}`;
      await RNShare.open({
        url: fileUrl,
        type: "image/png",
        message: `${symbol} · ${recordTitle}\n${yahooUrl}\n\nNIDOKEY`,
        failOnCancel: false,
      });
    } catch (e) {
      setCapturing(false);
      console.warn("[share]", e instanceof Error ? e.message : e);
    }
  }

  // Abre el activo en Yahoo Finanzas (navegador externo) con el mismo símbolo.
  function openYahoo() {
    void Linking.openURL(yahooUrl);
  }

  return (
    <View style={[styles.flex, { backgroundColor: th.bg }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Bloque capturable al compartir: nombre + precio + gráfico (sin stats). */}
        <View ref={shotRef} collapsable={false} style={{ backgroundColor: th.bg }}>
        {/* ── Cabecera ── */}
        <View style={styles.headerRow}>
          {logoUri ? (
            <View style={[styles.logoChip, isMarket && styles.logoSquare, { borderColor: th.border }]}>
              <Image source={{ uri: logoUri }} style={styles.logoImg} contentFit="contain" transition={150} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Text style={[styles.symbol, { color: th.text }]}>{symbol}</Text>
            <Text style={[styles.name, { color: th.textMuted }]} numberOfLines={2}>
              {record.title}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: th.border }]} />

        {/* ── Precio + cambio ── */}
        <View style={styles.priceBlock}>
          <Text style={[styles.price, { color: th.text }]}>
            {record.primaryValue ?? (lastPrice != null ? formatPrice(lastPrice, quoteCur) : "—")}
          </Text>
          <Text style={[styles.changeBig, { color: up ? UP : DOWN }]}>
            {rangePct != null
              ? `${up ? "+" : ""}${rangeAbs != null ? formatNum(rangeAbs) + "  " : ""}(${up ? "+" : ""}${rangePct
                  .toFixed(2)
                  .replace(".", ",")} %)`
              : "—"}
          </Text>
          <Text style={[styles.subMuted, { color: th.textSubtle }]}>
            {[rangeLabel, isMarket ? exchange : null, quoteCur].filter(Boolean).join(" · ")}
          </Text>
        </View>

        {/* ── Pills de rango ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {RANGES.map((r) => {
            const active = r.key === rangeKey;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRangeKey(r.key)}
                style={[styles.pill, active && { backgroundColor: th.accentSoft }]}
              >
                <Text style={[styles.pillText, { color: active ? th.accent : th.textMuted }]}>
                  {t(`asset.range_${r.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Gráfico interactivo ── */}
        <View>
          {series.length >= 2 ? (
            <LineChart.Provider data={series}>
              <LineChart height={CHART_H}>
                <LineChart.Path color={trendColor} width={2}>
                  <LineChart.Gradient color={trendColor} />
                </LineChart.Path>
                <LineChart.CursorCrosshair color={trendColor}>
                  <LineChart.Tooltip
                    textStyle={{ backgroundColor: th.surface, color: th.text, borderRadius: 6, fontSize: 12, padding: 4 }}
                  />
                </LineChart.CursorCrosshair>
              </LineChart>
              <View style={styles.scrubRow}>
                <LineChart.DatetimeText
                  style={[styles.scrubDate, { color: th.textSubtle }]}
                  locale="es-ES"
                  options={{ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }}
                />
                <LineChart.PriceText
                  style={[styles.scrubPrice, { color: th.textMuted }]}
                  format={({ value }) => {
                    "worklet";
                    const n = Number(value);
                    const sym = quoteCur === "EUR" ? "€" : quoteCur === "USD" ? "$" : quoteCur;
                    return `${n.toFixed(2).replace(".", ",")} ${sym}`;
                  }}
                />
              </View>
            </LineChart.Provider>
          ) : (
            <View style={[styles.noChart, { height: CHART_H }]}>
              {chartLoading ? (
                <ActivityIndicator size="small" color={th.primary} />
              ) : (
                <Text style={{ color: th.textSubtle, fontSize: 12 }}>{t("asset.no_history")}</Text>
              )}
            </View>
          )}
          {chartLoading && series.length >= 2 && (
            <View style={styles.chartSpinner} pointerEvents="none">
              <ActivityIndicator size="small" color={th.primary} />
            </View>
          )}
        </View>

        {capturing ? (
          <Text style={[styles.brandFooter, { color: th.textSubtle }]}>
            NIDOKEY
          </Text>
        ) : null}
        </View>

        {/* ── Stats ── */}
        <View style={[styles.statsCard, { backgroundColor: th.surface, borderColor: th.border }]}>
          {stats.map(([k, v]) => (
            <View key={k} style={styles.statRow}>
              <Text style={[styles.statKey, { color: th.textSubtle }]}>{k}</Text>
              <Text style={[styles.statVal, { color: th.text }]}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Barra inferior: cerrar (izq) · compartir + abrir en Yahoo (der) ──
          Iconos bronce sobre fondo superficie (blanco en claro / negro en oscuro). */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.fab, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Ionicons name="close" size={22} color={th.text} />
        </Pressable>
        <View style={styles.fabGroup}>
          <Pressable
            onPress={() => setAlertsOpen(true)}
            hitSlop={10}
            style={({ pressed }) => [styles.fab, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t("alerts.title")}
          >
            <Ionicons name="notifications-outline" size={22} color={th.primary} />
          </Pressable>
          <Pressable
            onPress={() => setShareOpen(true)}
            hitSlop={10}
            style={({ pressed }) => [styles.fab, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t("share.action")}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={th.primary} />
          </Pressable>
          <Pressable
            onPress={onShare}
            hitSlop={10}
            style={({ pressed }) => [styles.fab, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t("common.share")}
          >
            <Ionicons name="share-social-outline" size={22} color={th.primary} />
          </Pressable>
          <Pressable
            onPress={openYahoo}
            hitSlop={10}
            style={({ pressed }) => [styles.fab, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={t("asset.open_yahoo")}
          >
            <Ionicons name="open-outline" size={22} color={th.primary} />
          </Pressable>
        </View>
      </View>

      <ShareRecordSheet visible={shareOpen} onClose={() => setShareOpen(false)} type={type} id={id} />
      <AlertsSheet
        visible={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        recordType={type}
        recordId={id}
        currency={quoteCur}
      />
    </View>
  );
}

const CHART_H = 220;

// ── helpers ──
function formatPrice(n: number, quote = "EUR"): string {
  const sym = quote.toUpperCase() === "EUR" ? "€" : quote.toUpperCase() === "USD" ? "$" : quote.toUpperCase();
  return `${formatNum(n)} ${sym}`;
}
function formatNum(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backLink: { padding: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  fabGroup: { flexDirection: "row", gap: 12 },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  logoChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoSquare: { borderRadius: 10 },
  logoImg: { width: 34, height: 34 },
  symbol: { fontSize: 30, fontWeight: "800", letterSpacing: 0.3 },
  name: { fontSize: 14, marginTop: 1 },
  divider: { height: 1, marginVertical: 14 },
  priceBlock: { gap: 3 },
  price: { fontSize: 30, fontFamily: fonts.bodyBold },
  changeBig: { fontSize: 16, fontFamily: fonts.bodySemibold },
  subMuted: { fontSize: 13, marginTop: 2 },
  pills: { gap: 6, paddingVertical: 16 },
  pill: { paddingHorizontal: 14, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 14, fontFamily: fonts.bodyBold },
  scrubRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  scrubDate: { fontSize: 11 },
  scrubPrice: { fontSize: 13, fontFamily: fonts.bodySemibold },
  noChart: { alignItems: "center", justifyContent: "center" },
  chartSpinner: { position: "absolute", top: 6, right: 6 },
  statsCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, marginTop: 20 },
  statRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11 },
  statKey: { fontSize: 13 },
  statVal: { fontSize: 13, fontFamily: fonts.bodySemibold },
  brandFooter: { textAlign: "center", fontSize: 11, letterSpacing: 1, marginTop: 14, marginBottom: 2, paddingHorizontal: 2 },
});
