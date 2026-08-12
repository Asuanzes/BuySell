import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/lib/api";
import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import {
  createBookSubcategory,
  deleteBookSubcategory,
  fetchBookSubcategories,
  setBookSubcategories,
  type BookSubcategory,
} from "@/lib/book-subcategories";

/**
 * C7 — editor del set de subcategorías de UN libro: checkboxes sobre las mías,
 * crear inline (auto-marca la nueva) y borrar con confirmación en dos toques.
 * Guarda el SET completo al pulsar Guardar (PUT idempotente).
 */
export function BookSubcategoriesSheet({
  visible,
  onClose,
  bookId,
}: {
  visible: boolean;
  /** Recibe true si hubo cambios guardados (el padre refresca sus chips). */
  onClose: (changed: boolean) => void;
  bookId: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BookSubcategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSelected, setInitialSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSomething, setSavedSomething] = useState(false);

  const canCreate = draft.trim().length >= 1 && draft.trim().length <= 40;
  const dirty = useMemo(() => [...selected].sort().join(",") !== initialSelected, [selected, initialSelected]);

  useEffect(() => {
    if (!visible) return;
    setDraft("");
    setError(null);
    setPendingDeleteId(null);
    setSavedSomething(false);
    setBusy(false);
    setLoading(true);
    fetchBookSubcategories()
      .then((list) => {
        setItems(list);
        const mine = new Set(list.filter((s) => s.bookIds.includes(bookId)).map((s) => s.id));
        setSelected(mine);
        setInitialSelected([...mine].sort().join(","));
      })
      .catch((e) => setError(messageForError(e, t("bookSubcats.error_generic"))))
      .finally(() => setLoading(false));
  }, [visible, bookId, t]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createOne() {
    if (!canCreate || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createBookSubcategory(draft.trim());
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected((prev) => new Set(prev).add(created.id));
      setDraft("");
    } catch (e) {
      setError(messageForError(e, t("bookSubcats.error_generic")));
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBookSubcategory(id);
      setItems((prev) => prev.filter((s) => s.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSavedSomething(true);
    } catch (e) {
      setError(messageForError(e, t("bookSubcats.error_generic")));
    } finally {
      setPendingDeleteId(null);
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setBookSubcategories(bookId, [...selected]);
      onClose(true);
    } catch (e) {
      setError(messageForError(e, t("bookSubcats.error_generic")));
      setBusy(false);
    }
  }

  function close() {
    onClose(savedSomething);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.kav} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t("common.cancel")} />
        <View style={[styles.sheet, { backgroundColor: th.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: th.border }]} />
          <Text style={[styles.title, { color: th.text }]}>{t("bookSubcats.sheet_title")}</Text>
          <Text style={[styles.hint, { color: th.textMuted }]}>{t("bookSubcats.sheet_hint")}</Text>

          <View style={[styles.inputRow, { borderColor: th.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={40}
              placeholder={t("bookSubcats.create_placeholder")}
              placeholderTextColor={th.textSubtle}
              style={[styles.input, { color: th.text }]}
              returnKeyType="done"
              onSubmitEditing={() => void createOne()}
            />
            <Pressable
              onPress={() => void createOne()}
              disabled={!canCreate || busy}
              accessibilityRole="button"
              accessibilityLabel={t("bookSubcats.create_label")}
              style={[styles.createBtn, { backgroundColor: th.primary, opacity: canCreate ? 1 : 0.45 }]}
            >
              {busy && draft ? <ActivityIndicator color={th.primaryFg} /> : <Ionicons name="add" size={18} color={th.primaryFg} />}
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={th.primary} />
            </View>
          ) : items.length === 0 ? (
            <Text style={[styles.empty, { color: th.textMuted }]}>{t("bookSubcats.empty")}</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {items.map((subcat) => {
                const checked = selected.has(subcat.id);
                const pendingDelete = pendingDeleteId === subcat.id;
                return (
                  <View
                    key={subcat.id}
                    style={[styles.row, { borderColor: pendingDelete ? th.dangerFg : th.border, backgroundColor: th.bg }]}
                  >
                    <Pressable
                      onPress={() => toggle(subcat.id)}
                      disabled={busy || pendingDelete}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      style={styles.rowMain}
                    >
                      <Ionicons name={checked ? "checkbox-outline" : "square-outline"} size={20} color={checked ? th.accent : th.text} />
                      <Text style={[styles.rowTitle, { color: th.text }]} numberOfLines={1}>
                        {subcat.name}
                      </Text>
                      <Text style={[styles.rowMeta, { color: th.textSubtle }]}>{subcat.bookIds.length}</Text>
                    </Pressable>
                    {pendingDelete ? (
                      <View style={styles.deleteConfirm}>
                        <Pressable onPress={() => void removeOne(subcat.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.delete")}>
                          <Ionicons name="checkmark-circle" size={22} color={th.dangerFg} />
                        </Pressable>
                        <Pressable onPress={() => setPendingDeleteId(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
                          <Ionicons name="close-circle-outline" size={22} color={th.textMuted} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setPendingDeleteId(subcat.id)}
                        hitSlop={8}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={t("bookSubcats.delete_label", { name: subcat.name })}
                      >
                        <Ionicons name="trash-outline" size={18} color={th.textSubtle} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {error ? <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text> : null}

          <Pressable
            onPress={() => void save()}
            disabled={busy || !dirty}
            accessibilityRole="button"
            style={[styles.saveBtn, { backgroundColor: dirty ? th.primary : th.surfaceRaised, borderColor: th.border, opacity: busy ? 0.6 : 1 }]}
          >
            {busy && !draft ? (
              <ActivityIndicator color={dirty ? th.primaryFg : th.text} />
            ) : (
              <Text style={[styles.saveLabel, { color: dirty ? th.primaryFg : th.textMuted }]}>{t("common.save")}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function messageForError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    return (e.body as { error?: string } | null)?.error ?? e.message;
  }
  return e instanceof Error ? e.message : fallback;
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 10, maxHeight: "86%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  title: { fontSize: 18, fontFamily: fonts.bodyBold },
  hint: { fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  createBtn: { width: 40, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  center: { paddingVertical: 18 },
  empty: { fontSize: 13, lineHeight: 18, paddingVertical: 12 },
  list: { maxHeight: 300 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  rowTitle: { flex: 1, fontSize: 14, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 12 },
  deleteConfirm: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { fontSize: 13, lineHeight: 18 },
  saveBtn: { marginTop: 4, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveLabel: { fontSize: 15, fontFamily: fonts.bodySemibold },
});
