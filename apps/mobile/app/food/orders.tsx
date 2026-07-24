import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Card, EmptyState, Screen } from "@/components/ui";
import { foodStatusLabel } from "@/components/food/status-labels";

type Order = { id: string; code: string; status: string; totalCents: number; currency: string; createdAt: string; restaurant?: { name: string } | null };

function money(cents: number, currency = "EUR") {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency });
}

export default function FoodOrdersScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const q = useQuery(() => api<{ orders: Order[] }>("/api/food/orders?role=customer"), []);
  return (
    <Screen title={t("food.orders")}>
      <ScrollView contentContainerStyle={styles.content}>
        {q.loading && !q.data ? <ActivityIndicator color={th.primary} /> : q.data?.orders.length ? q.data.orders.map((o) => (
          <Pressable key={o.id} onPress={() => router.push(`/food/order/${o.id}`)}>
            <Card>
              <Text style={[styles.title, { color: th.text }]}>{o.restaurant?.name ?? t("food.order")}</Text>
              <Text style={[styles.meta, { color: th.textMuted }]}>{new Date(o.createdAt).toLocaleDateString("es-ES")} · {o.code}</Text>
              <Text style={[styles.total, { color: th.accent }]}>{foodStatusLabel(t, o.status)} · {money(o.totalCents, o.currency)}</Text>
            </Card>
          </Pressable>
        )) : <EmptyState icon="receipt-outline" title={t("food.no_orders_title")} description={t("food.no_orders_desc")} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  title: { fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 12, marginTop: 3 },
  total: { fontSize: 13, fontFamily: fonts.bodyBold, marginTop: 6 },
});
