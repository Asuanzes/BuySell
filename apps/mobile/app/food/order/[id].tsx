import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { chatSocket } from "@/lib/chat/socket";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button, Card, Screen } from "@/components/ui";
import { foodActorLabel, foodStatusLabel } from "@/components/food/status-labels";

type Order = {
  id: string;
  code: string;
  status: string;
  totalCents: number;
  currency: string;
  deliveryAddress: string;
  restaurant?: { name: string } | null;
  payment?: { status: string } | null;
  items: { id: string; nameSnapshot: string; quantity: number; totalCents: number }[];
  events: { id: string; toStatus: string; actorType: string; createdAt: string }[];
};

const STEPS = ["CREATED", "PENDING_PAYMENT", "PAID", "PREPARING", "READY", "IN_DELIVERY", "DELIVERED"];

function money(cents: number, currency = "EUR") {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency });
}

export default function FoodOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const [socketOpen, setSocketOpen] = useState(chatSocket.isConnected());
  const q = useQuery(() => api<{ order: Order }>(`/api/food/orders/${id}`), [id], {
    refreshInterval: socketOpen ? 60_000 : 5_000,
    resetOnDepsChange: true,
  });

  useEffect(() => chatSocket.onConnectionStateChange(setSocketOpen), []);
  useEffect(() => chatSocket.onOrderEvent((e) => { if (e.orderId === id) void q.refetch(); }), [id, q.refetch]);

  if (q.loading && !q.data) {
    return <Screen><View style={styles.center}><ActivityIndicator color={th.primary} /></View></Screen>;
  }
  const order = q.data?.order;
  if (!order) return <Screen title={t("food.order")}><Text style={{ color: th.text }}>{t("detail.not_found")}</Text></Screen>;
  const isCancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.indexOf(order.status);
  const statusLabel = (status: string) => foodStatusLabel(t, status);

  return (
    <Screen title={order.restaurant?.name ?? t("food.order")} subtitle={`${order.code} · ${statusLabel(order.status)}`}>
      <ScrollView contentContainerStyle={styles.content}>
        {order.status === "PENDING_PAYMENT" && (
          <Card>
            <Text style={[styles.title, { color: th.text }]}>{t("food.verifying_payment")}</Text>
            <Text style={[styles.meta, { color: th.textMuted }]}>{t("food.payment_webhook_note")}</Text>
            <Button label={t("food.refresh")} variant="ghost" onPress={() => void q.refetch()} />
          </Card>
        )}
        <Card style={styles.timeline}>
          {isCancelled ? (
            <Text style={[styles.cancelled, { color: th.dangerFg }]}>{t("food.order_cancelled")}</Text>
          ) : STEPS.map((step, idx) => (
            <View key={step} style={styles.step}>
              <View style={[styles.dot, { backgroundColor: idx <= currentIdx ? th.accent : th.border }]} />
              <Text style={[styles.stepText, { color: idx <= currentIdx ? th.text : th.textSubtle }]}>{statusLabel(step)}</Text>
            </View>
          ))}
        </Card>
        <Card>
          <Text style={[styles.title, { color: th.text }]}>{t("food.delivery")}</Text>
          <Text style={[styles.meta, { color: th.textMuted }]}>{order.deliveryAddress}</Text>
        </Card>
        <Card>
          <Text style={[styles.title, { color: th.text }]}>{t("food.items")}</Text>
          {order.items.map((item) => (
            <Text key={item.id} style={[styles.meta, { color: th.textMuted }]}>
              {item.quantity} x {item.nameSnapshot} · {money(item.totalCents, order.currency)}
            </Text>
          ))}
          <Text style={[styles.total, { color: th.text }]}>{money(order.totalCents, order.currency)}</Text>
        </Card>
        <Card>
          <Text style={[styles.title, { color: th.text }]}>{t("food.timeline")}</Text>
          {order.events.map((e) => (
            <Text key={e.id} style={[styles.meta, { color: th.textMuted }]}>
              {new Date(e.createdAt).toLocaleString("es-ES")} · {foodActorLabel(t, e.actorType)} · {statusLabel(e.toStatus)}
            </Text>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  timeline: { gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stepText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  title: { fontSize: 16, fontFamily: fonts.bodyBold },
  meta: { fontSize: 13, marginTop: 4 },
  total: { fontSize: 18, fontFamily: fonts.bodyBold, marginTop: 10 },
  cancelled: { fontSize: 16, fontFamily: fonts.bodyBold },
});
