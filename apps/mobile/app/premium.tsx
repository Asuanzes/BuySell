import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";

import { api, API_URL } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";
import { Button, Screen } from "@/components/ui";

type BillingStatus = {
  plan: "free" | "premium";
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  price: { cents: number; currency: string; interval: string };
};

const fetchStatus = () => api<BillingStatus>("/api/billing/status");

/**
 * Paywall/gestión de Nidokey Premium. El checkout es webhook-first: al volver
 * del navegador el estado REAL puede tardar unos segundos → polling corto de
 * /api/billing/status hasta ver el cambio (o rendirse con "pendiente").
 */
export default function PremiumScreen() {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ from?: string; status?: string }>();
  const { data, loading, refetch } = useQuery(fetchStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    track("paywall_view", { from: params.from ?? "account" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tras el retorno del checkout (deep link nidokey://premium?from=checkout),
  // el webhook puede no haber llegado aún: reintenta el estado unos segundos.
  const pollUntilChange = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      const fresh = await fetchStatus().catch(() => null);
      if ((fresh && fresh.plan === "premium") || tries >= 6) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        void refetch();
      }
    }, 2000);
  }, [refetch]);

  useEffect(() => {
    if (params.from === "checkout") pollUntilChange();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [params.from, pollUntilChange]);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>("/api/billing/checkout", { method: "POST" });
      await WebBrowser.openAuthSessionAsync(checkoutUrl, `${API_URL}/billing/pay/return`);
      pollUntilChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("premium.checkout_error"));
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert(t("premium.cancel_confirm_title"), t("premium.cancel_confirm_body"), [
      { text: t("common.back"), style: "cancel" },
      {
        text: t("premium.cancel"),
        style: "destructive",
        onPress: async () => {
          try {
            await api("/api/billing/cancel", { method: "POST" });
            void refetch();
          } catch (e) {
            setError(e instanceof Error ? e.message : t("premium.checkout_error"));
          }
        },
      },
    ]);
  }

  const premium = data?.plan === "premium";
  const price = data
    ? (data.price.cents / 100).toLocaleString(i18n.language === "en" ? "en-GB" : "es-ES", {
        style: "currency",
        currency: data.price.currency,
      })
    : "4,99 €";
  const periodEnd = data?.currentPeriodEnd
    ? new Date(data.currentPeriodEnd).toLocaleDateString(i18n.language === "en" ? "en-GB" : "es-ES")
    : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Ionicons name="diamond-outline" size={34} color={th.primary} />
          <Text style={[styles.title, { color: th.text }]}>{t("premium.title")}</Text>
          <Text style={[styles.pitch, { color: th.textMuted }]}>{t("premium.pitch")}</Text>
        </View>

        {/* Plan Gratis */}
        <View style={[styles.plan, { backgroundColor: th.surface, borderColor: premium ? th.border : th.primary }]}>
          <View style={styles.planHead}>
            <Text style={[styles.planName, { color: th.text }]}>{t("premium.plan_free")}</Text>
            {!premium && (
              <Text style={[styles.badge, { color: th.primary, borderColor: th.primary }]}>
                {t("premium.current_plan")}
              </Text>
            )}
          </View>
          <Text style={[styles.features, { color: th.textMuted }]}>{t("premium.free_features")}</Text>
        </View>

        {/* Plan Premium */}
        <View style={[styles.plan, { backgroundColor: th.surface, borderColor: premium ? th.primary : th.border }]}>
          <View style={styles.planHead}>
            <Text style={[styles.planName, { color: th.text }]}>{t("premium.plan_premium")}</Text>
            {premium ? (
              <Text style={[styles.badge, { color: th.primary, borderColor: th.primary }]}>
                {t("premium.current_plan")}
              </Text>
            ) : (
              <Text style={[styles.price, { color: th.text }]}>{t("premium.price_month", { price })}</Text>
            )}
          </View>
          <Text style={[styles.features, { color: th.textMuted }]}>{t("premium.premium_features")}</Text>

          {premium && periodEnd && (
            <Text style={[styles.meta, { color: th.textMuted }]}>
              {data?.cancelAtPeriodEnd ? t("premium.cancel_at_end") : t("premium.renews_at", { date: periodEnd })}
            </Text>
          )}
          {data?.status === "PAST_DUE" && (
            <Text style={[styles.meta, { color: th.dangerFg }]}>{t("premium.past_due")}</Text>
          )}
          {data?.status === "PENDING" && !premium && (
            <Text style={[styles.meta, { color: th.textMuted }]}>{t("premium.status_pending")}</Text>
          )}
        </View>

        {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}

        {!loading && !premium && (
          <Button label={t("premium.subscribe")} icon="diamond-outline" onPress={subscribe} disabled={busy} />
        )}
        {premium && !data?.cancelAtPeriodEnd && (
          <Pressable onPress={confirmCancel} style={styles.cancelLink}>
            <Text style={[styles.cancelText, { color: th.textMuted }]}>{t("premium.cancel")}</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  hero: { alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: "700" },
  pitch: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  plan: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 8 },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planName: { fontSize: 17, fontWeight: "700" },
  price: { fontSize: 15, fontWeight: "600" },
  badge: { fontSize: 11, fontWeight: "700", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  features: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 12 },
  error: { fontSize: 13, textAlign: "center" },
  cancelLink: { alignItems: "center", paddingVertical: 8 },
  cancelText: { fontSize: 13, textDecorationLine: "underline" },
});
