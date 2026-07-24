import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { useFoodCart } from "@/lib/food-cart-context";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button, Card, Screen } from "@/components/ui";
import { categoryColor } from "@/lib/records/config";
import { useAppStyle } from "@/lib/app-style-context";

type MenuItem = { id: string; name: string; description: string | null; imageUrl: string | null; priceCents: number; available: boolean };
type MenuCategory = { id: string; name: string; items: MenuItem[] };
type Restaurant = { id: string; name: string; description: string | null; imageUrl: string | null; isOpen: boolean; categories: MenuCategory[] };
type MenuStatus = "ready" | "fetching" | "unavailable" | "empty";
type Resp = { restaurant: Restaurant; menuStatus: MenuStatus };

function money(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  const { appStyle } = useAppStyle();
  const insets = useSafeAreaInsets();
  const foodAccent = categoryColor("food", dark, appStyle);
  const cart = useFoodCart();
  const q = useQuery(() => api<Resp>(`/api/food/restaurants/${id}`), [id], { resetOnDepsChange: true });
  const [refreshing, setRefreshing] = useState(false);

  // Refresco manual: invalida la caché del servidor y reconsulta; si la carta estaba
  // vacía, el GET pasa a "fetching" y el polling de arriba la trae en cuanto exista.
  async function refreshMenu() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await api(`/api/food/restaurants/${id}/refresh-menu`, { method: "POST" });
      await q.refetch();
    } catch {
      // best-effort; el usuario puede reintentar
    } finally {
      setRefreshing(false);
    }
  }

  // Mientras el menú se scrapea en el servidor (background), reconsultamos cada 1.5s
  // hasta que el estado deje de ser "fetching". `q.data` cambia de identidad en cada
  // refetch, así que el efecto se re-arma solo y se detiene al llegar a "ready".
  useEffect(() => {
    if (q.data?.menuStatus !== "fetching") return;
    const t = setTimeout(() => {
      void q.refetch();
    }, 1500);
    return () => clearTimeout(t);
  }, [q.data, q.refetch]);

  if (q.loading && !q.data) {
    return (
      <Screen background backgroundCategory="food">
        <View style={styles.center}><ActivityIndicator color={th.primary} /></View>
      </Screen>
    );
  }
  const restaurant = q.data?.restaurant;
  const menuStatus = q.data?.menuStatus;
  if (!restaurant) return <Screen title={t("food.restaurant")} background backgroundCategory="food"><Text style={{ color: th.text }}>{t("detail.not_found")}</Text></Screen>;

  const itemCount = restaurant.categories.reduce((n, c) => n + c.items.length, 0);

  function add(item: MenuItem) {
    if (cart.restaurantId && cart.restaurantId !== restaurant!.id) cart.clear();
    cart.addItem(restaurant!.id, restaurant!.name, { menuItemId: item.id, name: item.name, priceCents: item.priceCents });
  }

  return (
    <Screen title={restaurant.name} subtitle={restaurant.isOpen ? restaurant.description ?? t("food.menu") : t("food.closed")} background backgroundCategory="food">
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: th.space.lg, gap: th.space.lg, paddingBottom: 96 + insets.bottom }]}>
        <Image
          source={restaurant.imageUrl ? { uri: restaurant.imageUrl } : undefined}
          style={[
            styles.hero,
            {
              backgroundColor: th.imagePlaceholder,
              borderColor: th.border,
              borderRadius: th.radii.xl,
            },
          ]}
          contentFit="cover"
        />
        {restaurant.categories.map((cat) => (
          <View key={cat.id} style={[styles.category, { gap: th.space.sm }]}>
            <Text style={[styles.categoryTitle, { color: th.text }]}>{cat.name}</Text>
            {cat.items.map((item) => (
              <Card key={item.id} style={styles.item}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: th.text }]}>{item.name}</Text>
                  {item.description && <Text style={[styles.desc, { color: th.textMuted }]}>{item.description}</Text>}
                  <Text style={[styles.price, { color: foodAccent }]}>{money(item.priceCents)}</Text>
                </View>
                <Pressable disabled={!restaurant.isOpen} onPress={() => add(item)} style={[styles.add, th.elevation.sm, { backgroundColor: foodAccent, opacity: restaurant.isOpen ? 1 : 0.4 }]}>
                  <Text style={[styles.addText, { color: th.primaryFg }]}>+</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        ))}
        {itemCount === 0 && menuStatus === "fetching" && (
          <View style={styles.skeleton}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} style={styles.item}>
                <View style={styles.itemInfo}>
                  <View style={[styles.skelBar, { backgroundColor: th.imagePlaceholder, width: "55%" }]} />
                  <View style={[styles.skelBar, { backgroundColor: th.imagePlaceholder, width: "85%", height: 10 }]} />
                  <View style={[styles.skelBar, { backgroundColor: th.imagePlaceholder, width: "28%" }]} />
                </View>
                <View style={[styles.add, { backgroundColor: th.imagePlaceholder }]} />
              </Card>
            ))}
            <Text style={[styles.menuStateText, { color: th.textSubtle, textAlign: "center", marginTop: 4 }]}>{t("food.menu_preparing")}</Text>
          </View>
        )}
        {itemCount === 0 && menuStatus !== "fetching" && (
          <View style={styles.menuState}>
            <Text style={[styles.menuStateText, { color: th.textMuted }]}>{t("food.menu_unavailable")}</Text>
            <Button label={refreshing ? t("food.menu_fetching") : t("common.retry")} onPress={refreshMenu} />
          </View>
        )}
        {itemCount > 0 && (
          <Pressable onPress={refreshMenu} style={styles.refreshLink} disabled={refreshing}>
            <Text style={[styles.menuStateText, { color: th.textSubtle, textAlign: "center" }]}>
              {refreshing ? t("food.menu_refreshing") : t("food.menu_refresh")}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      {/* Barra "Ver carrito": fija al borde; paddingBottom dinámico para no quedar
          bajo la barra de navegación de Android. insets.bottom=0 cuando no aplica. */}
      {cart.restaurantId === restaurant.id && cart.count > 0 && (
        <View style={[styles.bar, th.elevation.lg, { backgroundColor: th.surfaceRaised, borderTopColor: th.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button label={`${t("food.view_cart")} · ${cart.count} · ${money(cart.totalCents)}`} onPress={() => router.push("/food/cart")} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingTop: 10, paddingBottom: 96 },
  hero: { height: 170, borderWidth: StyleSheet.hairlineWidth },
  category: {},
  categoryTitle: { fontSize: 18, fontFamily: fonts.heading },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 15, fontFamily: fonts.bodyBold },
  desc: { fontSize: 13, lineHeight: 18 },
  price: { fontSize: 14, fontFamily: fonts.bodyBold },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  addText: { fontSize: 24, lineHeight: 26 },
  menuState: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  menuStateText: { fontSize: 14 },
  skeleton: { gap: 8 },
  skelBar: { height: 13, borderRadius: 6 },
  refreshLink: { paddingVertical: 8 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
