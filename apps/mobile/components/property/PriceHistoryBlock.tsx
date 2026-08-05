import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { pricingColors } from "@/lib/pricing-colors";
import type { PriceHistoryPoint } from "@/lib/records/property";
import { computePriceVariation, priceSeriesForField } from "@/lib/property-stats";

const MAX_BARS = 8;
const BAR_HEIGHT = 44;

/**
 * Histórico de precio + badge de variación, dentro del hero de la ficha
 * (la respuesta a "¿ha cambiado?"). Solo se muestra si la serie del campo
 * (venta o renta) tiene >= 2 snapshots.
 */
export function PriceHistoryBlock({
  history,
  field,
}: {
  history: PriceHistoryPoint[];
  field: "price" | "rent";
}) {
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  const colors = pricingColors(dark);

  const series = useMemo(() => priceSeriesForField(history, field), [history, field]);
  const variation = useMemo(() => computePriceVariation(series), [series]);
  if (series.length < 2 || !variation) return null;

  const isDown = variation.direction === "drop";
  const isUp = variation.direction === "up";
  const tone = isDown ? colors.down : isUp ? colors.up : th.textMuted;
  const toneSoft = isDown ? colors.downSoft : isUp ? colors.upSoft : th.surfaceSoft;
  const arrow = isDown ? "▼" : isUp ? "▲" : "·";
  const pctLabel = variation.direction === "flat" ? "0 %" : `${Math.abs(variation.pct)} %`;

  const extra = [
    variation.thisMonthCents != null && variation.thisMonthCents !== 0
      ? t("detail.property.variation_this_month", {
          arrow,
          value: formatPrice(Math.abs(variation.thisMonthCents)),
        })
      : null,
    variation.changeCount > 0
      ? t("detail.property.variation_changes", { count: variation.changeCount })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const bars = series.slice(-MAX_BARS);
  const max = Math.max(...bars.map((b) => b.price), 1);

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: th.textMuted }]}>
          {t("detail.property.price_history_title")}
        </Text>
        <View style={[styles.badge, { backgroundColor: toneSoft }]}>
          <Text style={[styles.badgeText, { color: tone }]}>
            {arrow} {pctLabel}
          </Text>
        </View>
      </View>

      <View style={styles.bars}>
        {bars.map((b, i) => {
          const hPx = Math.max(6, Math.round((b.price / max) * BAR_HEIGHT));
          const last = i === bars.length - 1;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                { height: hPx },
                last ? { backgroundColor: th.accent } : { backgroundColor: th.primary + "3D" },
              ]}
            />
          );
        })}
      </View>

      {!!extra && <Text style={[styles.extra, { color: tone }]}>{extra}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: BAR_HEIGHT,
    marginTop: 8,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
  extra: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
});
