import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Card } from "@/components/ui";

/**
 * Simulador de hipoteca (cálculo local, sistema francés / cuota constante).
 * Diseñado para enchufar más adelante el "proceso completo" con un partner
 * bancario (ver TODOs). Se abre desde el panel contextual de un inmueble; el
 * precio llega prefijado vía `?amount=` (euros).
 */
function eur(n: number): string {
  if (!isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("es-ES")} €`;
}

export default function MortgageSimulator() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { amount } = useLocalSearchParams<{ amount?: string }>();

  const [price, setPrice] = useState(amount ? String(parseInt(amount, 10) || "") : "");
  const [downPct, setDownPct] = useState("20");
  const [years, setYears] = useState("30");
  const [rate, setRate] = useState("3");

  const calc = useMemo(() => {
    const P = Number(price.replace(",", ".")) || 0;
    const dp = Math.min(100, Math.max(0, Number(downPct.replace(",", ".")) || 0));
    const n = Math.max(1, Math.round((Number(years.replace(",", ".")) || 0) * 12));
    const annual = Math.max(0, Number(rate.replace(",", ".")) || 0);
    const down = (P * dp) / 100;
    const principal = Math.max(0, P - down);
    const i = annual / 100 / 12;
    const monthly = i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -n)) : principal / n;
    const totalPaid = monthly * n;
    return { down, principal, monthly, totalPaid, totalInterest: totalPaid - principal, n };
  }, [price, downPct, years, rate]);

  return (
    <ScrollView
      style={{ backgroundColor: th.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
    >
      <Stack.Screen options={{ title: t("tools.mortgage.title") }} />

      <Card style={styles.card}>
        <Field label={t("tools.mortgage.price")} suffix="€" value={price} onChangeText={setPrice} />
        <Field label={t("tools.mortgage.down")} suffix="%" value={downPct} onChangeText={setDownPct} />
        <Field label={t("tools.mortgage.term")} suffix={t("tools.mortgage.term_suffix")} value={years} onChangeText={setYears} />
        <Field label={t("tools.mortgage.rate")} suffix="%" value={rate} onChangeText={setRate} last />
      </Card>

      <Card style={[styles.card, { borderColor: th.primary, backgroundColor: th.primarySoft }]}>
        <Text style={[styles.resultLabel, { color: th.textMuted }]}>{t("tools.mortgage.monthly_label")}</Text>
        <Text style={[styles.resultValue, { color: th.primary }]}>{eur(calc.monthly)}</Text>
        <Text style={[styles.resultSub, { color: th.textSubtle }]}>
          {t("tools.mortgage.installments", { count: calc.n })}
        </Text>
      </Card>

      <Card style={styles.card}>
        <Row label={t("tools.mortgage.principal")} value={eur(calc.principal)} />
        <Row label={t("tools.mortgage.down_row")} value={eur(calc.down)} />
        <Row label={t("tools.mortgage.interest_total")} value={eur(calc.totalInterest)} />
        <Row label={t("tools.mortgage.total")} value={eur(calc.totalPaid)} strong />
      </Card>

      <Text style={[styles.note, { color: th.textSubtle }]}>
        {t("tools.mortgage.note")}
      </Text>
    </ScrollView>
  );
}

function Field({
  label,
  suffix,
  value,
  onChangeText,
  last,
}: {
  label: string;
  suffix: string;
  value: string;
  onChangeText: (t: string) => void;
  last?: boolean;
}) {
  const { th } = useTheme();
  return (
    <View style={[styles.field, last && { marginBottom: 0 }]}>
      <Text style={[styles.fieldLabel, { color: th.textMuted }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: th.bg, borderColor: th.border }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          inputMode="decimal"
          selectTextOnFocus
          style={[styles.input, { color: th.text }]}
        />
        <Text style={[styles.suffix, { color: th.textSubtle }]}>{suffix}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { th } = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: th.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: th.text, fontWeight: strong ? "700" : "500" }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 32 },
  card: { marginBottom: 12 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suffix: { fontSize: 13, fontFamily: fonts.bodyMedium, marginLeft: 8 },
  resultLabel: { fontSize: 12, fontFamily: fonts.bodySemibold, textTransform: "uppercase", letterSpacing: 0.5 },
  resultValue: { fontSize: 32, fontFamily: fonts.bodyBold, marginTop: 6 },
  resultSub: { fontSize: 12, marginTop: 2 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14 },
  note: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4, marginTop: 4 },
});
