import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { chatSocket } from "@/lib/chat/socket";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button, Card, EmptyState, Screen } from "@/components/ui";
import { foodStatusLabel } from "@/components/food/status-labels";

type Order = { id: string; code: string; status: string; totalCents: number; restaurant?: { name: string } | null; items: { id: string; quantity: number; nameSnapshot: string }[] };
type Me = { staffOf: { id: string; role: string; restaurant: { name: string; isOpen: boolean } }[] };

function money(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function RestaurantPanelScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const me = useQuery(() => api<Me>("/api/food/me"), []);
  const q = useQuery(() => api<{ orders: Order[] }>("/api/food/orders?role=restaurant&active=1"), [], { refreshInterval: 10_000 });
  useEffect(() => chatSocket.onOrderEvent(() => { void q.refetch(); }), [q.refetch]);
  const hasStaff = !!me.data?.staffOf.length;

  async function action(orderId: string, path: string, body?: unknown) {
    setBusy(orderId + path);
    try {
      await api(`/api/food/orders/${orderId}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await q.refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={t("food.restaurant_panel")}>
      {/* paddingBottom + insets.bottom: botones de acción al final del scroll. */}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
        {me.loading && !me.data ? <ActivityIndicator color={th.primary} /> : !hasStaff ? (
          <EmptyState icon="lock-closed-outline" title={t("food.no_restaurant_title")} description={t("food.no_restaurant_desc")} />
        ) : q.data?.orders.length ? q.data.orders.map((o) => (
          <Card key={o.id} style={styles.order}>
            <Text style={[styles.title, { color: th.text }]}>{o.restaurant?.name} · {o.code}</Text>
            <Text style={[styles.meta, { color: th.textMuted }]}>{foodStatusLabel(t, o.status)} · {money(o.totalCents)}</Text>
            {o.items.map((i) => <Text key={i.id} style={[styles.meta, { color: th.textSubtle }]}>{i.quantity} x {i.nameSnapshot}</Text>)}
            <View style={styles.actions}>
              {o.status === "PAID" && (
                <>
                  <Button label={t("food.accept")} size="sm" fullWidth={false} loading={busy === o.id + "accept"} onPress={() => void action(o.id, "accept")} />
                  <Button label={t("food.reject")} size="sm" variant="danger" fullWidth={false} onPress={() => void action(o.id, "reject", { reason: t("food.reject_reason_unavailable") })} />
                </>
              )}
              {o.status === "PREPARING" && <Button label={t("food.status_ready")} size="sm" fullWidth={false} onPress={() => void action(o.id, "ready")} />}
            </View>
          </Card>
        )) : <EmptyState icon="restaurant-outline" title={t("food.no_active_orders_title")} description={t("food.no_active_orders_desc")} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  order: { gap: 4 },
  title: { fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
