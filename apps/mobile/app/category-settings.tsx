import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { DEFAULT_CATEGORY, useCategoryPrefs } from "@/lib/records/category-prefs-context";
import { RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useTypeI18n } from "@/lib/records/type-i18n";
import { ReorderableCategoryList } from "@/components/ReorderableCategoryList";
import { Button, Chip, ResultModal, Section } from "@/components/ui";

/**
 * Ajustes de CATEGORÍAS (Cuenta → Categorías). Reordenar el menú arrastrando,
 * ocultar/recuperar categorías (toggle ojo), elegir la categoría de inicio y
 * restablecer todas las preferencias. Stack screen hermana de (tabs); lee el
 * estado vivo del CategoryPrefsProvider (root). Todo local (SecureStore).
 */
export default function CategorySettingsScreen() {
  const { th, setThemeMode } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { label: typeLabel } = useTypeI18n();
  const {
    managed,
    orderedVisible,
    reorder,
    commitOrder,
    toggleHidden,
    startCategory,
    setStartCategory,
    reset,
  } = useCategoryPrefs();
  const [scrollOn, setScrollOn] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);

  // Solo se puede arrancar en una categoría DESARROLLADA (enabled) y visible — así
  // no se puede dejar la app en una pantalla "Próximamente" al abrir.
  const startOptions = orderedVisible.filter((tp) => RECORD_TYPE_CONFIG[tp].enabled);
  const effectiveStart =
    (startCategory && startOptions.includes(startCategory) && startCategory) ||
    (startOptions.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : startOptions[0]);

  function doReset() {
    setResetOpen(false);
    reset();
    setThemeMode("auto");
  }

  return (
    <>
    <ScrollView
      style={{ backgroundColor: th.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      scrollEnabled={scrollOn}
    >
      <Section label={t("catsettings.order_title")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("catsettings.order_help")}</Text>
        <ReorderableCategoryList
          data={managed}
          onReorder={(next) => reorder(next.map((m) => m.type))}
          onCommit={(next) => commitOrder(next.map((m) => m.type))}
          onToggleHidden={toggleHidden}
          onDragStart={() => setScrollOn(false)}
          onDragEnd={() => setScrollOn(true)}
        />
      </Section>

      <Section label={t("catsettings.start_title")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("catsettings.start_help")}</Text>
        <View style={styles.chips}>
          {startOptions.map((tp) => (
            <Chip
              key={tp}
              label={typeLabel(tp)}
              leading={<CategoryIcon type={tp} size={14} color={tp === effectiveStart ? th.primaryFg : undefined} />}
              color={RECORD_TYPE_CONFIG[tp].color}
              selected={tp === effectiveStart}
              onPress={() => setStartCategory(tp)}
            />
          ))}
        </View>
      </Section>

      <Button
        label={t("catsettings.reset")}
        variant="ghost"
        icon="refresh-outline"
        onPress={() => setResetOpen(true)}
        style={styles.reset}
      />
    </ScrollView>

    <ResultModal
      visible={resetOpen}
      tone="error"
      icon="refresh-outline"
      title={t("catsettings.reset")}
      message={t("catsettings.reset_message")}
      actions={[
        { label: t("catsettings.reset_confirm"), variant: "danger", onPress: doReset },
        { label: t("common.cancel"), variant: "ghost", onPress: () => setResetOpen(false) },
      ]}
      onRequestClose={() => setResetOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reset: { marginTop: 4 },
});
