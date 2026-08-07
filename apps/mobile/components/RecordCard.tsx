import { useState, type ComponentProps, type ReactNode } from "react";
import { fonts } from "@/lib/fonts";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { type BaseRecord, metaField, compactNumber, jobPlatformLabel } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { useAppStyle } from "@/lib/app-style-context";

/**
 * Firma ESTRECHA de t() para fmtAgo: el TFunction genérico de i18next
 * instancia recursivamente contra todo el recurso (~750 claves) y revienta el
 * límite de profundidad de TS (TS2589). Unión literal = typecheck estable.
 * Mismo patrón que lib/trends/sources.ts y components/food/status-labels.ts.
 */
type AgoKey = "card.updated_now" | "card.updated_min" | "card.updated_h" | "card.updated_d";
type TFn = (key: AgoKey, opts?: { n: number }) => string;
import { recordTypeConfig } from "@/lib/records/config";
import { CategoryIcon } from "@/components/CategoryIcon";
import { provinceImage } from "@/lib/records/province-images";
import { marketLogoUrl } from "@/lib/records/market-logo";

/**
 * Tarjeta de registro. Genérica para la mayoría de tipos; con un layout
 * específico para CRIPTO (símbolo · precio · %24h · mini-gráfico · volumen).
 */

const UP = "#15803D";
const DOWN = "#B91C1C";
const STALE = "#A86A17"; // ámbar: datos rancios (el refresco no está corriendo)

type CardProps = {
  record: BaseRecord;
  /** Modo edición: muestra el botón ✕ para borrar. */
  editing?: boolean;
  selecting?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  selectionTestID?: string;
  onToggleSelected?: (record: BaseRecord) => void;
  /** Pulsación larga sobre la tarjeta (entra en modo edición). */
  onLongPress?: () => void;
  /** Borrado: lo gestiona la pantalla (confirma + llama al backend). */
  onDelete?: (record: BaseRecord) => void;
};

export function RecordCard(props: CardProps) {
  if (props.record.type === "crypto" || props.record.type === "market") return <CryptoCard {...props} />;
  if (props.record.type === "job") return <JobCard {...props} />;
  return <DefaultCard {...props} />;
}

function fireLongPress(onLongPress?: () => void) {
  if (!onLongPress) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  onLongPress();
}

/** Botón ✕ rojo en la esquina de la tarjeta (modo edición). */
function DeleteBadge({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("common.delete")}
      style={styles.deleteBadge}
    >
      <Ionicons name="close" size={15} color="#fff" />
    </Pressable>
  );
}

function SelectionBadge({ selected }: { selected: boolean }) {
  const { th } = useTheme();
  return (
    <View
      style={[
        styles.selectionBadge,
        { borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surfaceRaised },
      ]}
    >
      {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
    </View>
  );
}

/**
 * Logo del activo a la izquierda del nombre (cripto/acción/ETF). Chip circular
 * blanco para que se lean tanto los logos transparentes claros como oscuros. Si
 * no hay logo o la carga falla (p. ej. 404 de FMP), cae al icono del tipo.
 */
function AssetLogo({
  uri,
  icon,
  iconColor,
  placeholderBg,
  borderColor,
  square = false,
}: {
  uri: string | null;
  icon: ComponentProps<typeof Ionicons>["name"] | "rss-outline";
  iconColor: string;
  placeholderBg: string;
  borderColor: string;
  /** Cuadrado redondeado en vez de círculo: para logos de marca cuadrados
   *  (mercado), que recortados en círculo quedan feos. Cripto = círculo. */
  square?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const shape = square ? styles.logoSquare : null;
  if (!uri || failed) {
    const iconName = icon === "rss-outline" ? "logo-rss" : icon;
    return (
      <View style={[styles.logo, shape, { backgroundColor: placeholderBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
    );
  }
  return (
    <View style={[styles.logo, shape, styles.logoChip, { borderColor }]}>
      <Image
        source={{ uri }}
        style={styles.logoImg}
        contentFit="contain"
        transition={150}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

// ── Cripto (estilo finanzas, con logo del activo) ─────────────────────────
function CryptoCard({ record, editing, onLongPress, onDelete }: CardProps) {
  const { th } = useTheme();
  const { appStyle } = useAppStyle();
  const compact = appStyle === "operativo";
  const { t } = useTranslation();
  const cfg = recordTypeConfig(record.type);
  const symbol = metaField<string>(record, "symbol", record.title);
  const change = fmtChange(metaField<number | null>(record, "change24h", null));
  const volume = metaField<number | null>(record, "volume", null);
  const marketCap = metaField<number | null>(record, "marketCap", null);
  const quote = metaField<string>(record, "quoteCurrency", "EUR");
  const spark = metaField<number[]>(record, "sparkline", []);
  const ago = fmtAgo(metaField<string | null>(record, "lastCheckedAt", null), t);
  const isMarket = record.type === "market";
  const exchange = metaField<string | null>(record, "exchange", null);
  // Cripto: logo de CoinGecko (ya en imageUrl). Mercado: emisor (ETF) vía CDN de
  // Twelve Data o ticker vía FMP; derivado en cliente → registros ya guardados
  // muestran logo sin reimportar.
  const logoUri = isMarket ? marketLogoUrl({ title: record.title, symbol }) : record.imageUrl ?? null;
  // El % grande va por el cambio de 24h; el gráfico por la tendencia de 7 días
  // (precio actual vs. hace 7 días). Verde sube / rojo baja en ambos casos.
  const changeColor = change.up ? UP : DOWN;
  const trendUp = spark.length >= 2 ? spark[spark.length - 1] >= spark[0] : change.up;
  const trendColor = trendUp ? UP : DOWN;

  return (
    <Pressable
      onPress={() => { if (!editing) router.push(`/${record.type}/${record.id}` as never); }}
      onLongPress={onLongPress ? () => fireLongPress(onLongPress) : undefined}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.card,
        styles.cryptoCard,
        th.elevation.sm,
        { backgroundColor: th.surfaceRaised, borderColor: th.border },
        compact && { borderRadius: th.radii.lg, padding: 10, marginBottom: 7 },
        pressed && !editing && { opacity: 0.82, transform: [{ translateY: 1 }] },
      ]}
    >
      <View style={styles.row}>
        <AssetLogo
          uri={logoUri}
          icon={cfg.icon}
          iconColor={th.textSubtle}
          placeholderBg={th.imagePlaceholder}
          borderColor={th.border}
          square={isMarket}
        />
        <View style={styles.flex}>
          <Text style={[styles.symbol, { color: th.text }]}>{symbol}</Text>
          <Text style={[styles.coinName, { color: th.textMuted }]} numberOfLines={1}>{record.title}</Text>
        </View>
        <View style={styles.alignEnd}>
          <Text style={[styles.price, { color: th.accent }]}>{record.primaryValue ?? "—"}</Text>
          <View style={styles.changeRow}>
            <Text style={[styles.change, { color: changeColor }]}>{change.text}</Text>
            <Text style={[styles.periodLabel, { color: th.textSubtle }]}>{isMarket ? t("card.period_day") : t("card.period_24h")}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sparkHeader}>
        {ago ? (
          <Text style={[styles.periodLabel, { color: ago.stale ? STALE : th.textSubtle }]}>
            {ago.text}
          </Text>
        ) : (
          <View />
        )}
        <Text style={[styles.periodLabel, { color: th.textSubtle }]}>{t("card.period_7d")}</Text>
      </View>
      <PriceChart price={spark} color={trendColor} height={36} />

      <View style={[styles.cryptoFooter, { borderTopColor: th.border }]}>
        <View>
          <Text style={[styles.statLabel, { color: th.textSubtle }]}>{isMarket ? t("card.exchange") : t("card.market_cap")}</Text>
          <Text style={[styles.statValue, { color: th.textMuted }]}>
            {isMarket ? (exchange ?? "—") : compactNumber(marketCap, quote)}
          </Text>
        </View>
        <View style={styles.alignEnd}>
          <Text style={[styles.statLabel, { color: th.textSubtle }]}>{isMarket ? t("card.volume") : t("card.volume_24h")}</Text>
          <Text style={[styles.statValue, { color: th.textMuted }]}>
            {isMarket ? compactNumber(volume) : compactNumber(volume, quote)}
          </Text>
        </View>
      </View>

      {editing && onDelete && <DeleteBadge onPress={() => onDelete(record)} />}
    </Pressable>
  );
}

/**
 * Mini-gráfico de precio 7d (sin dependencias nativas), estilo CoinGecko:
 *  - relleno TENUE = precio (contexto), mismo color de tendencia,
 *  - línea de tendencia SUAVIZADA y sólida (SMA de ventana amplia, poco sinuosa),
 *    dibujada con segmentos `View` rotados (técnica sin react-native-svg).
 * El color (verde/rojo) lo decide la tendencia de 7 días; buena lectura en claro
 * y oscuro al ser un color sólido sobre relleno muy tenue.
 */
function PriceChart({ price, color, height = 44 }: { price: number[]; color: string; height?: number }) {
  const [width, setWidth] = useState(0);
  if (!price || price.length < 2) return <View style={{ height }} />;

  const min = Math.min(...price);
  const max = Math.max(...price);
  const range = max - min || 1;
  const norm = (v: number) => (v - min) / range; // 0 (mín) … 1 (máx)
  // Ventana amplia ⇒ línea de tendencia suave (no “sinuosa”).
  const smooth = movingAverage(price, Math.max(3, Math.round(price.length / 4)));

  return (
    <View style={[styles.chart, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.barsRow}>
        {price.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: Math.max(1, norm(v) * height),
              backgroundColor: color,
              marginHorizontal: 0.4,
              opacity: 0.16,
            }}
          />
        ))}
      </View>
      {width > 0 && <TrendLine series={smooth} norm={norm} width={width} height={height} color={color} />}
    </View>
  );
}

/** Línea de tendencia (segmentos rotados, sin SVG). */
function TrendLine({
  series,
  norm,
  width,
  height,
  color,
}: {
  series: (number | null)[];
  norm: (v: number) => number;
  width: number;
  height: number;
  color: string;
}) {
  const n = series.length;
  const thickness = 2.5;
  const xAt = (i: number) => ((i + 0.5) / n) * width;
  const yAt = (v: number) => (1 - norm(v)) * height; // 0 arriba … height abajo
  const segments: ReactNode[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = series[i];
    const b = series[i + 1];
    if (a == null || b == null) continue;
    const x1 = xAt(i);
    const y1 = yAt(a);
    const x2 = xAt(i + 1);
    const y2 = yAt(b);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    segments.push(
      <View
        key={i}
        style={{
          position: "absolute",
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - thickness / 2,
          width: len,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: `${angle}rad` }],
        }}
      />,
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {segments}
    </View>
  );
}

/** Media móvil simple (SMA). Devuelve null hasta completar la ventana. */
function movingAverage(data: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += data[j];
    out.push(sum / window);
  }
  return out;
}

// ── Genérica (inmuebles y resto) ──────────────────────────────────────────
type StatusKey =
  | "status.for_sale"
  | "status.reserved"
  | "status.sold"
  | "status.withdrawn"
  | "status.for_rent"
  | "status.rented";
const STATUS_STYLE: Record<string, { key: StatusKey; color: string; bg: string }> = {
  FOR_SALE: { key: "status.for_sale", color: "#15803D", bg: "#E8F1EC" },
  RESERVED: { key: "status.reserved", color: "#A86A17", bg: "#F7EFDE" },
  SOLD: { key: "status.sold", color: "#666", bg: "#f3f3f3" },
  WITHDRAWN: { key: "status.withdrawn", color: "#666", bg: "#f3f3f3" },
  FOR_RENT: { key: "status.for_rent", color: "#2C7A8A", bg: "#E2EFF1" },
  RENTED: { key: "status.rented", color: "#666", bg: "#f3f3f3" },
};

// Etiqueta del portal de origen (bajo la miniatura, en azul). Solo portales
// reales; MANUAL/OTHER no tienen fuente → no se muestra etiqueta.
const PORTAL_LABEL: Record<string, string> = {
  IDEALISTA: "Idealista",
  FOTOCASA: "Fotocasa",
  PISOS_COM: "Pisos.com",
  MILANUNCIOS: "Milanuncios",
  HABITACLIA: "Habitaclia",
  YAENCONTRE: "Yaencontre",
  THINKSPAIN: "ThinkSpain",
  INDOMIO: "Indomio",
};

function DefaultCard({
  record,
  editing,
  selecting,
  selected,
  selectionDisabled,
  selectionTestID,
  onToggleSelected,
  onLongPress,
  onDelete,
}: CardProps) {
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const compact = appStyle === "operativo";
  const { t } = useTranslation();
  const status = record.status ? STATUS_STYLE[record.status] : undefined;
  const footnote = metaField<string | null>(record, "footnote", null);
  // Portal de origen del inmueble (de qué web lo importamos), bajo la miniatura.
  const portal = metaField<string | null>(record, "portal", null);
  const portalLabel = portal ? PORTAL_LABEL[portal] ?? null : null;

  return (
    <Pressable
      testID={selectionTestID}
      onPress={() => {
        if (selecting) {
          if (!selectionDisabled || selected) onToggleSelected?.(record);
          return;
        }
        if (!editing) router.push(`/${record.type}/${record.id}` as never);
      }}
      onLongPress={onLongPress ? () => fireLongPress(onLongPress) : undefined}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={
        selecting
          ? t(selected ? "records.compare_selected_label" : "records.compare_unselected_label", { title: record.title })
          : undefined
      }
      accessibilityState={selecting ? { selected: !!selected, disabled: !!selectionDisabled && !selected } : undefined}
      style={({ pressed }) => [
        styles.card,
        styles.narrowCard,
        styles.propCard,
        th.elevation.sm,
        { backgroundColor: th.surfaceRaised, borderColor: th.border },
        selecting && { borderColor: selected ? th.accent : th.border },
        selectionDisabled && !selected && { opacity: 0.55 },
        compact && { borderRadius: th.radii.lg, padding: 8, gap: 10, marginBottom: 7 },
        pressed && !editing && { opacity: 0.82, transform: [{ translateY: 1 }] },
      ]}
    >
      <View style={styles.thumbCol}>
        {record.imageUrl ? (
          <Image
            source={{ uri: record.imageUrl }}
            style={[styles.thumb, compact && { width: 56, height: 56, borderRadius: th.radii.md }, { backgroundColor: th.imagePlaceholder }]}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, compact && { width: 56, height: 56, borderRadius: th.radii.md }, { backgroundColor: th.imagePlaceholder }]}>
            <CategoryIcon type={record.type} size={26} />
          </View>
        )}
        {portalLabel && (
          <Text style={[styles.portalLabel, { color: th.sourceBlue }]} numberOfLines={1}>
            {portalLabel}
          </Text>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: th.text }]} numberOfLines={2}>{record.title}</Text>
        {record.subtitle && (
          <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>{record.subtitle}</Text>
        )}
        {footnote && (
          <Text style={[styles.foot, { color: th.textSubtle }]} numberOfLines={1}>{footnote}</Text>
        )}
        <View style={styles.priceRow}>
          <Text style={[styles.cardPrice, { color: th.accent }]} numberOfLines={1}>{record.primaryValue ?? "—"}</Text>
          {status && (
            <View style={[styles.statusChip, { backgroundColor: dark ? status.color + "24" : status.bg }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{t(status.key)}</Text>
            </View>
          )}
        </View>
      </View>

      {editing && onDelete && <DeleteBadge onPress={() => onDelete(record)} />}
      {selecting && <SelectionBadge selected={!!selected} />}
    </Pressable>
  );
}

// ── Empleo (miniatura = capital de la provincia; estilo inmuebles, compacto) ─
function JobCard({ record, editing, onLongPress, onDelete }: CardProps) {
  const { th } = useTheme();
  const { appStyle } = useAppStyle();
  const compact = appStyle === "operativo";
  const { t } = useTranslation();
  const company = metaField<string | null>(record, "company", null);
  const location = metaField<string | null>(record, "location", null);
  const salary = metaField<string | null>(record, "salaryLabel", null) ?? record.primaryValue ?? null;
  const contract = metaField<string | null>(record, "contractType", null);
  const remote = metaField<boolean | null>(record, "remote", null);
  const platform = metaField<string | null>(record, "platform", null);
  const thumb = provinceImage(metaField<string | null>(record, "province", null));
  const sub = [company, location].filter(Boolean).join(" · ") || record.subtitle || null;
  // Pie compacto: contrato (· remoto) en gris, sueldo en BRONCE; fuente a la derecha.
  const contractRemote = [contract, remote ? t("card.remote") : null].filter(Boolean).join(" · ");
  const platformLabel = jobPlatformLabel(platform);

  return (
    <Pressable
      onPress={() => { if (!editing) router.push(`/job/${record.id}` as never); }}
      onLongPress={onLongPress ? () => fireLongPress(onLongPress) : undefined}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.card,
        styles.narrowCard,
        th.elevation.sm,
        { backgroundColor: th.surfaceRaised, borderColor: th.border },
        compact && { borderRadius: th.radii.lg, padding: 8, gap: 10, marginBottom: 7 },
        pressed && !editing && { opacity: 0.82, transform: [{ translateY: 1 }] },
      ]}
    >
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={[styles.thumb, { backgroundColor: th.imagePlaceholder }]}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: th.imagePlaceholder }]}>
          <Ionicons name="briefcase-outline" size={24} color={th.textSubtle} />
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.title, { color: th.text }]} numberOfLines={2}>{record.title}</Text>
        {sub && <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>{sub}</Text>}
        {(contractRemote || salary || platformLabel) && (
          <View style={styles.jobFooter}>
            <Text style={[styles.jobFooterLeft, { color: th.textMuted }]} numberOfLines={1}>
              {contractRemote}
              {salary ? (
                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>
                  {contractRemote ? "  ·  " : ""}
                  {salary}
                </Text>
              ) : !contractRemote ? (
                "—"
              ) : null}
            </Text>
            {platformLabel && (
              <Text style={[styles.jobFooterRight, { color: th.sourceBlue }]}>{platformLabel}</Text>
            )}
          </View>
        )}
      </View>

      {editing && onDelete && <DeleteBadge onPress={() => onDelete(record)} />}
    </Pressable>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────
function fmtChange(p: number | null): { text: string; up: boolean } {
  if (p == null) return { text: "—", up: true };
  const up = p >= 0;
  return { text: `${up ? "+" : ""}${p.toFixed(2).replace(".", ",")}%`, up };
}

/**
 * "Actualizado hace X" a partir de la hora del último refresco real
 * (`lastCheckedAt`). `stale` (≥30 min) lo pinta en ámbar para avisar de que el
 * reloj de refresco no está corriendo. Devuelve null si no hay dato.
 */
function fmtAgo(iso: string | null, tr: TFn): { text: string; stale: boolean } | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return { text: tr("card.updated_now"), stale: false };
  if (mins < 60) return { text: tr("card.updated_min", { n: mins }), stale: mins >= 30 };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: tr("card.updated_h", { n: hrs }), stale: true };
  return { text: tr("card.updated_d", { n: Math.floor(hrs / 24) }), stale: true };
}

// compactNumber se importa de @nidokey/shared (antes había copias locales en
// AssetDetail y RecordCard; unificadas en shared).

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  deleteBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#B91C1C",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  selectionBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  // crypto
  cryptoCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  logoSquare: { borderRadius: 10 }, // cuadrado redondeado (logos de marca de mercado)
  logoChip: { backgroundColor: "#fff", borderWidth: 1 },
  logoImg: { width: 30, height: 30 },
  flex: { flex: 1 },
  alignEnd: { alignItems: "flex-end" },
  symbol: { fontSize: 16, lineHeight: 21, fontFamily: fonts.bodyBold },
  coinName: { fontSize: 12, marginTop: 1 },
  price: { fontSize: 18, lineHeight: 23, fontFamily: fonts.bodyBold },
  changeRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 1 },
  change: { fontSize: 13, fontFamily: fonts.bodySemibold },
  periodLabel: { fontSize: 10, fontFamily: fonts.bodyMedium },
  sparkHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  chart: { position: "relative", marginTop: 4 },
  barsRow: { flexDirection: "row", alignItems: "flex-end", height: "100%" },
  cryptoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 12, fontFamily: fonts.bodyMedium, marginTop: 1 },
  // empleo: pie compacto (contrato·sueldo | fuente)
  jobFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 },
  jobFooterLeft: { flex: 1, fontSize: 12, fontFamily: fonts.bodyMedium },
  jobFooterRight: { fontSize: 11 },
  // tarjeta estrecha (miniatura izquierda + info derecha) — compacta
  narrowCard: { flexDirection: "row", padding: 10, gap: 12, alignItems: "center" },
  // inmueble: columna [miniatura + portal] alineada por ABAJO, así el portal
  // queda a la altura del precio y la imagen no sube tanto.
  propCard: { alignItems: "flex-end" },
  thumbCol: { alignItems: "center" },
  portalLabel: { fontSize: 11, fontFamily: fonts.bodySemibold, marginTop: 4, maxWidth: 72, textAlign: "center" },
  thumb: { width: 68, height: 68, borderRadius: 12 },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  sub: { fontSize: 12, lineHeight: 16 },
  foot: { fontSize: 11, lineHeight: 15 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    gap: 8,
  },
  cardPrice: { fontSize: 16, lineHeight: 21, fontFamily: fonts.bodyBold, flexShrink: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontFamily: fonts.bodySemibold, textTransform: "uppercase", letterSpacing: 0.4 },
});
