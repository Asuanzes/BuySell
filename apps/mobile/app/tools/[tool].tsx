import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Card } from "@/components/ui";

/**
 * Pantallas de herramienta del panel contextual de Inmuebles: Registro de la
 * Propiedad y Estadísticas de zona (INE). De momento **solo diseño/UI**; la
 * integración real con Registro / INE queda como TODO (banners "pendiente").
 */
export default function ToolScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tool, city } = useLocalSearchParams<{ tool?: string; city?: string }>();
  const key = tool ?? "";
  // El id llega como string libre de la ruta → Record con t() (sin template
  // literal tipado posible aquí).
  const TITLES: Record<string, string> = {
    registro: t("tools.registro.title"),
    ine: t("tools.ine.title"),
  };
  const title = TITLES[key] ?? t("tools.fallback_title");

  return (
    <ScrollView
      style={{ backgroundColor: th.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
    >
      <Stack.Screen options={{ title }} />
      {key === "registro" && <Registro />}
      {key === "ine" && <Ine city={city} />}
      {!TITLES[key] && (
        <Text style={{ color: th.textMuted, padding: 8 }}>{t("tools.not_available")}</Text>
      )}
    </ScrollView>
  );
}

// ── Registro de la Propiedad ─────────────────────────────────────────────────
function Registro() {
  const { th } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <PlaceholderCard title={t("tools.registro.ownership_title")} body={t("tools.registro.ownership_body")} />
      <PlaceholderCard title={t("tools.registro.charges_title")} body={t("tools.registro.charges_body")} />
      <PlaceholderCard title={t("tools.registro.deed_title")} body={t("tools.registro.deed_body")} />
      <Pending text={t("tools.registro.pending")} />
      <Text style={[styles.note, { color: th.textSubtle }]}>
        {t("tools.registro.note")}
      </Text>
    </>
  );
}

// ── Estadísticas de zona (INE) ───────────────────────────────────────────────
function Ine({ city }: { city?: string }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: th.textMuted }]}>
          {t("tools.ine.zone")}{city ? `: ${city}` : ""}
        </Text>
        <InfoRow label={t("tools.ine.row_avg_price")} value="— €/m²" />
        <InfoRow label={t("tools.ine.row_yoy")} value="—" />
        <InfoRow label={t("tools.ine.row_income")} value="— €/mes" />
        <InfoRow label={t("tools.ine.row_transactions")} value="—" />
        <InfoRow label={t("tools.ine.row_yield")} value="—" />
      </Card>
      <Pending text={t("tools.ine.pending")} />
    </>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  const { th } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: th.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: th.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  const { th } = useTheme();
  return (
    <Card style={styles.card}>
      <Text style={[styles.cardTitle, { color: th.textMuted }]}>{title}</Text>
      <Text style={[styles.cardBody, { color: th.textSubtle }]}>{body}</Text>
    </Card>
  );
}

function Pending({ text }: { text: string }) {
  const { th } = useTheme();
  return (
    <View style={[styles.pending, { backgroundColor: th.accentSoft, borderColor: th.border }]}>
      <Ionicons name="construct-outline" size={15} color={th.accent} />
      <Text style={[styles.pendingText, { color: th.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 32, gap: 12 },
  card: {},
  cardTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cardBody: { fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 14, fontFamily: fonts.bodyMedium, marginLeft: 12 },
  pending: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pendingText: { fontSize: 12, lineHeight: 17, flex: 1 },
  note: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
});
