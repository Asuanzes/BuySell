import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
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

type Order = {
  id: string;
  code: string;
  status: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  restaurant?: { name: string; address: string; latitude: number; longitude: number } | null;
};
type Me = { isCourier: boolean };

export default function CourierScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const me = useQuery(() => api<Me>("/api/food/me"), []);
  const mine = useQuery(() => api<{ orders: Order[] }>("/api/food/orders?role=courier&active=1"), [], { refreshInterval: 10_000 });
  const pool = useQuery(() => api<{ orders: Order[] }>("/api/food/courier/available"), [], { refreshInterval: 10_000, enabled: !!me.data?.isCourier });
  useEffect(() => chatSocket.onOrderEvent(() => { void mine.refetch(); void pool.refetch(); }), [mine.refetch, pool.refetch]);

  async function action(orderId: string, path: string) {
    setBusy(orderId + path);
    try {
      await api(`/api/food/orders/${orderId}/${path}`, { method: "POST" });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([mine.refetch(), pool.refetch()]);
    } finally {
      setBusy(null);
    }
  }

  function maps(lat: number, lng: number) {
    void Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}`);
  }

  return (
    <Screen title={t("food.courier")}>
      {/* paddingBottom + insets.bottom: botones de acción al final del scroll. */}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}>
        {!me.data?.isCourier ? (
          <EmptyState icon="lock-closed-outline" title={t("food.courier_locked_title")} description={t("food.courier_locked_desc")} />
        ) : (
          <>
            <Text style={[styles.section, { color: th.textMuted }]}>{t("food.active_delivery")}</Text>
            {mine.data?.orders.length ? mine.data.orders.map((o) => (
              <Card key={o.id} style={styles.order}>
                <Text style={[styles.title, { color: th.text }]}>{o.restaurant?.name} · {o.code}</Text>
                <Text style={[styles.meta, { color: th.textMuted }]}>{foodStatusLabel(t, o.status)}</Text>
                <Button label={t("food.open_in_maps")} variant="secondary" onPress={() => maps(o.deliveryLat, o.deliveryLng)} />
                <View style={styles.actions}>
                  {o.status === "READY" && <Button label={t("food.picked_up")} size="sm" fullWidth={false} onPress={() => void action(o.id, "pickup")} />}
                  {o.status === "IN_DELIVERY" && <Button label={t("food.status_delivered")} size="sm" fullWidth={false} onPress={() => void action(o.id, "deliver")} />}
                </View>
              </Card>
            )) : <Text style={[styles.meta, { color: th.textSubtle }]}>{t("food.no_active_delivery")}</Text>}

            <Text style={[styles.section, { color: th.textMuted }]}>{t("food.available_orders")}</Text>
            {pool.data?.orders.length ? pool.data.orders.map((o) => (
              <Card key={o.id} style={styles.order}>
                <Text style={[styles.title, { color: th.text }]}>{o.restaurant?.name} · {o.code}</Text>
                <Text style={[styles.meta, { color: th.textMuted }]}>{o.restaurant?.address}</Text>
                <Button label={t("food.claim_delivery")} loading={busy === o.id + "claim"} onPress={() => void action(o.id, "claim")} />
              </Card>
            )) : <EmptyState icon="bicycle-outline" title={t("food.no_ready_orders_title")} description={t("food.no_ready_orders_desc")} />}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  section: { fontSize: 12, fontFamily: fonts.bodyBold, textTransform: "uppercase" },
  order: { gap: 8 },
  title: { fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 13 },
  actions: { flexDirection: "row", gap: 8 },
});
