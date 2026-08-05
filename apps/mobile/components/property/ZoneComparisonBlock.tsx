import { StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import type { ZoneContext } from "@/lib/records/property";

const MAX_ROWS = 4;

/**
 * Comparativa de zona (Tier 1, datos propios): la ficha actual contra las
 * alternativas del usuario del mismo tipo y misma zona — la respuesta a
 * "¿es buen precio?". En alquiler compara la RENTA contra el precio de zona,
 * los registros internos del mismo tipo+misma zona y el precio medio de zona
 * (mediana). Con muestra pequeña muestra la nota cold-start + CTA.
 */
export function ZoneComparisonBlock({
  zone,
  loading,
  currentPrice,
  isRent,
  typeLabel,
  onOpenAlternative,
  onAddAlternative,
}: {
  zone: ZoneContext | null;
  loading: boolean;
  currentPrice: number | null;
  isRent: boolean;
  /** Etiqueta traducida del tipo (p. ej. "Piso") para el ámbito de zona. */
  typeLabel?: string;
  onOpenAlternative: (id: string) => void;
  onAddAlternative: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();

  if (loading && !zone) {
    return (
      <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
        <ActivityIndicator size="small" color={th.primary} />
      </View>
    );
  }
  if (!zone) return null;

  const fmt = (cents: number | null) =>
    cents == null ? "—" : isRent ? t("card.per_month", { value: formatPrice(cents) }) : formatPrice(cents);

  const scopeParts = [
    zone.level !== "city" && typeLabel ? typeLabel : null,
    zone.scope.neighborhood && zone.level === "city_neighborhood_type" ? zone.scope.neighborhood : null,
    zone.scope.city,
  ].filter(Boolean);
  const scopeLabel = scopeParts.join(" · ");

  const stats = zone.stats;
  const shown = zone.alternatives.slice(0, MAX_ROWS);
  const more = zone.alternatives.length - shown.length;

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.head}>
        <View style={styles.headTitle}>
          <Ionicons name="map-outline" size={15} color={th.primary} />
          <Text style={[styles.title, { color: th.text }]}>{t("detail.property.zone_title")}</Text>
        </View>
        {!!scopeLabel && <Text style={[styles.scope, { color: th.textMuted }]}>{scopeLabel}</Text>}
      </View>

      {zone.coldStart || !stats ? (
        <View style={styles.coldStart}>
          <Text style={[styles.coldStartText, { color: th.textMuted }]}>
            {t("detail.property.zone_cold_start")}
          </Text>
          <Pressable
            onPress={onAddAlternative}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: th.primary, borderColor: th.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.addBtnText, { color: th.primaryFg }]}>
              {t("detail.property.zone_add_alternative")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.rows, { borderTopColor: th.border }]}>
            <Row
              label={t("detail.property.zone_you")}
              value={fmt(currentPrice)}
              strong
              accent={th.accent}
              muted={th.textMuted}
              text={th.text}
            />
            <Row
              label={t("detail.property.zone_median")}
              value={fmt(stats.median)}
              accent={th.primary}
              muted={th.textMuted}
              text={th.text}
            />
            <Row
              label={t("detail.property.zone_range")}
              value={`${fmt(stats.min)} – ${fmt(stats.max)}`}
              accent={th.primary}
              muted={th.textMuted}
              text={th.text}
            />
            {stats.perSqm && (
              <Row
                label={t("detail.property.zone_per_sqm")}
                value={`${stats.perSqm.median} €/m²`}
                accent={th.primary}
                muted={th.textMuted}
                text={th.text}
              />
            )}
          </View>

          {zone.alternatives.length > 0 && (
            <>
              <Text style={[styles.alternativesTitle, { color: th.textMuted }]}>
                {t("detail.property.zone_alternatives")}
              </Text>
              <View style={[styles.alternatives, { borderTopColor: th.border }]}>
                {shown.map((alt, i) => (
                  <Pressable
                    key={alt.id}
                    onPress={() => onOpenAlternative(alt.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.altRow,
                      { borderBottomColor: th.border },
                      i === shown.length - 1 && { borderBottomWidth: 0 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.altTitle, { color: th.text }]} numberOfLines={1}>
                        {alt.title}
                      </Text>
                      <Text style={[styles.altMeta, { color: th.textMuted }]} numberOfLines={1}>
                        {[alt.neighborhood, alt.city].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text style={[styles.altPrice, { color: th.accent }]}>{fmt(alt.price)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={th.textSubtle} />
                  </Pressable>
                ))}
                {more > 0 && (
                  <Text style={[styles.more, { color: th.textSubtle }]}>
                    {t("detail.property.zone_more", { count: more })}
                  </Text>
                )}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
  muted,
  text,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent: string;
  muted: string;
  text: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: strong ? accent : text }, strong && styles.rowValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  scope: {
    fontSize: 12,
  },
  rows: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  rowValueStrong: {
    fontSize: 15,
    fontWeight: "700",
  },
  alternativesTitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  alternatives: {
    borderTopWidth: 1,
  },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 6,
  },
  altTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  altMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  altPrice: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  more: {
    paddingTop: 6,
    fontSize: 12,
  },
  coldStart: {
    gap: 10,
  },
  coldStartText: {
    fontSize: 13,
    lineHeight: 18,
  },
  addBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
