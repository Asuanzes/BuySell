import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";

/** Contrato del servidor (RecordTask + RecordTaskItem). */
export type ChecklistItem = { id: string; label: string; reason?: string | null; done: boolean };
export type Checklist = {
  id: string;
  title: string;
  createdAt: string;
  completedAt?: string | null;
  items: ChecklistItem[];
};

export function RecordChecklistBlock({
  checklist,
  loading = false,
  error = null,
  onToggleItem,
  onAddItem,
  onRetry,
}: {
  checklist: Checklist | null;
  loading?: boolean;
  error?: string | null;
  onToggleItem: (itemId: string, done: boolean) => void;
  onAddItem: (label: string) => void;
  onRetry?: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<ChecklistItem[]>(checklist?.items ?? []);
  const [draft, setDraft] = useState("");

  // Firma de lo que dice el SERVIDOR. Sincronizar contra `checklist` a secas
  // resetearía la marca optimista en cada render si el padre recrea el objeto,
  // y el usuario vería su toque deshacerse.
  const serverState = checklist
    ? `${checklist.id}:${checklist.items.map((item) => `${item.id}${item.done ? 1 : 0}`).join(",")}`
    : "";
  useEffect(() => {
    setItems(checklist?.items ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverState]);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
        <Text style={[styles.errorText, { color: th.text }]}>{error}</Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: th.surfaceRaised, borderColor: th.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.retryLabel, { color: th.text }]}>{t("common.retry")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // El estado de carga solo manda si aún no hay nada que mostrar: al refrescar
  // tras marcar un ítem, la lista se queda en pantalla en vez de parpadear.
  if (loading && !checklist) {
    return (
      <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
        <Text style={[styles.loadingText, { color: th.textMuted }]}>{t("checklist.loading")}</Text>
      </View>
    );
  }

  if (!checklist) return null;

  const toggleItem = (item: ChecklistItem) => {
    const nextDone = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i)));
    onToggleItem(item.id, nextDone);
  };

  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    onAddItem(label);
    setDraft("");
  };

  const total = items.length;
  const doneCount = items.filter((item) => item.done).length;
  const allDone = total > 0 && doneCount === total;

  return (
    <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="checkmark-done-outline" size={20} color={th.textSubtle} />
          <Text style={[styles.headerTitle, { color: th.text }]} numberOfLines={1}>
            {checklist.title || t("checklist.title")}
          </Text>
        </View>
        <Text style={[styles.progress, { color: allDone ? th.text : th.textMuted }]}>
          {allDone ? t("checklist.all_done") : t("checklist.progress", { done: doneCount, count: total })}
        </Text>
      </View>

      <View style={styles.items}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.label}
            onPress={() => toggleItem(item)}
            style={({ pressed }) => [
              styles.itemRow,
              pressed && { backgroundColor: th.surfaceRaised },
            ]}
          >
            <Ionicons
              name={item.done ? "checkbox-outline" : "square-outline"}
              size={22}
              color={item.done ? th.textSubtle : th.text}
            />
            <View style={styles.itemBody}>
              <Text
                style={[
                  styles.itemLabel,
                  { color: item.done ? th.textMuted : th.text },
                  item.done && styles.itemDone,
                ]}
              >
                {item.label}
              </Text>
              {item.reason ? (
                <Text style={[styles.itemReason, { color: th.textSubtle }]} numberOfLines={2}>
                  {item.reason}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { backgroundColor: th.surfaceRaised, borderColor: th.border, color: th.text }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("checklist.add_placeholder")}
          placeholderTextColor={th.textSubtle}
          onSubmitEditing={addItem}
          returnKeyType="done"
          submitBehavior="submit"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("checklist.add_placeholder")}
          onPress={addItem}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: th.surfaceRaised, borderColor: th.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add-outline" size={20} color={th.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  headerTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  progress: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  items: { gap: 2 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  itemBody: { flex: 1, minWidth: 0 },
  itemLabel: { fontSize: 15, lineHeight: 20, fontFamily: fonts.body },
  itemDone: { textDecorationLine: "line-through" },
  itemReason: { marginTop: 2, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  errorText: { marginBottom: 10, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  retryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryLabel: { fontSize: 14, fontFamily: fonts.bodySemibold },
});
