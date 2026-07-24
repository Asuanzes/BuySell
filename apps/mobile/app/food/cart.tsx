import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFoodCart } from "@/lib/food-cart-context";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button, Card, EmptyState, Screen } from "@/components/ui";
import { categoryColor } from "@/lib/records/config";
import { useAppStyle } from "@/lib/app-style-context";

function money(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function FoodCartScreen() {
  const cart = useFoodCart();
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const foodAccent = categoryColor("food", dark, appStyle);
  if (!cart.items.length) {
    return (
      <Screen title={t("food.cart")} background backgroundCategory="food">
        <EmptyState icon="cart-outline" title={t("food.cart_empty_title")} description={t("food.cart_empty_desc")} />
      </Screen>
    );
  }
  return (
    <Screen title={t("food.cart")} subtitle={cart.restaurantName ?? undefined} background backgroundCategory="food">
      {/* paddingBottom + insets.bottom: el CTA "Continuar" es el último del scroll →
          en Android quedaría bajo la barra de navegación. insets=0 cuando no aplica. */}
      <ScrollView contentContainerStyle={[styles.content, { padding: th.space.lg, gap: th.space.md, paddingBottom: 28 + insets.bottom }]}>
        {cart.items.map((item) => (
          <Card key={item.menuItemId} style={styles.line}>
            <View style={styles.lineTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: th.text }]}>{item.name}</Text>
                <Text style={[styles.meta, { color: foodAccent }]}>{money(item.priceCents)}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => cart.updateQuantity(item.menuItemId, item.quantity - 1)} style={[styles.step, { backgroundColor: th.surface, borderColor: th.border }]}>
                  <Text style={{ color: th.text }}>−</Text>
                </Pressable>
                <Text style={[styles.qty, { color: th.text }]}>{item.quantity}</Text>
                <Pressable onPress={() => cart.updateQuantity(item.menuItemId, item.quantity + 1)} style={[styles.step, { backgroundColor: foodAccent, borderColor: foodAccent }]}>
                  <Text style={{ color: th.primaryFg }}>+</Text>
                </Pressable>
              </View>
            </View>
            <TextInput
              value={item.notes ?? ""}
              onChangeText={(v) => cart.updateNotes(item.menuItemId, v)}
              placeholder={t("food.item_notes_placeholder")}
              placeholderTextColor={th.textSubtle}
              style={[styles.notes, { color: th.text, backgroundColor: th.surface, borderColor: th.border }]}
            />
          </Card>
        ))}
        <Card>
          <Text style={[styles.total, { color: th.text }]}>{t("food.subtotal")} {money(cart.totalCents)}</Text>
          <Text style={[styles.meta, { color: th.textMuted }]}>{t("food.total_note")}</Text>
        </Card>
        <Button label={t("food.continue")} onPress={() => router.push("/food/checkout")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  line: { gap: 10 },
  lineTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  step: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qty: { minWidth: 18, textAlign: "center", fontFamily: fonts.bodyBold },
  notes: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  total: { fontSize: 16, fontFamily: fonts.bodyBold },
});
