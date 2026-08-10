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
import type { TFunction } from "i18next";

import { ApiError } from "@/lib/api";
import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import {
  addDecisionItem,
  createDecision,
  isValidDecisionTitle,
  listDecisions,
  normalizeDecisionTitle,
  type ActiveDecisionRecordType,
  type DecisionSummary,
} from "@/lib/decisions";

export function AddToDecisionSheet({
  visible,
  onClose,
  recordType,
  recordId,
}: {
  visible: boolean;
  onClose: () => void;
  recordType: ActiveDecisionRecordType;
  recordId: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const openDecisions = useMemo(() => items.filter((d) => d.status === "open"), [items]);
  const canCreate = isValidDecisionTitle(draft);

  useEffect(() => {
    if (!visible) return;
    setDraft("");
    setError(null);
    setDone(null);
    setLoading(true);
    listDecisions()
      .then((res) => setItems(res.items))
      .catch((e) => setError(messageForError(e, t)))
      .finally(() => setLoading(false));
  }, [visible, t]);

  async function addTo(decision: DecisionSummary) {
    if (busyId) return;
    setBusyId(decision.id);
    setError(null);
    try {
      await addDecisionItem(decision.id, recordType, recordId);
      setDone(t("decisions.add.done", { title: decision.title }));
    } catch (e) {
      setError(messageForError(e, t));
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAdd() {
    if (!canCreate || busyId) return;
    setBusyId("create");
    setError(null);
    try {
      const created = await createDecision(draft);
      await addDecisionItem(created.decision.id, recordType, recordId);
      setDone(t("decisions.add.done", { title: created.decision.title }));
      setDraft("");
      setItems((prev) => [created.decision, ...prev]);
    } catch (e) {
      setError(messageForError(e, t));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.kav} behavior="padding">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        />
        <View style={[styles.sheet, { backgroundColor: th.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: th.border }]} />
          <Text style={[styles.title, { color: th.text }]}>{t("decisions.add.title")}</Text>
          <Text style={[styles.hint, { color: th.textMuted }]}>{t("decisions.add.hint")}</Text>

          <View style={[styles.inputRow, { borderColor: th.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={80}
              placeholder={t("decisions.create.placeholder")}
              placeholderTextColor={th.textSubtle}
              style={[styles.input, { color: th.text }]}
              returnKeyType="done"
              onSubmitEditing={() => void createAndAdd()}
            />
            <Pressable
              onPress={() => void createAndAdd()}
              disabled={!canCreate || busyId === "create"}
              accessibilityRole="button"
              accessibilityLabel={t("decisions.add.create_and_add")}
              style={[styles.createBtn, { backgroundColor: th.primary, opacity: canCreate ? 1 : 0.45 }]}
            >
              {busyId === "create" ? (
                <ActivityIndicator color={th.primaryFg} />
              ) : (
                <Ionicons name="add" size={18} color={th.primaryFg} />
              )}
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={th.primary} />
            </View>
          ) : openDecisions.length === 0 ? (
            <Text style={[styles.empty, { color: th.textMuted }]}>{t("decisions.add.empty")}</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {openDecisions.map((decision) => (
                <Pressable
                  key={decision.id}
                  onPress={() => void addTo(decision)}
                  disabled={!!busyId}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: th.border, backgroundColor: th.bg },
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <Ionicons name="git-branch-outline" size={19} color={th.primary} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: th.text }]} numberOfLines={1}>
                      {decision.title}
                    </Text>
                    <Text style={[styles.rowMeta, { color: th.textSubtle }]}>
                      {t("decisions.items_count", { count: decision.itemCount })}
                    </Text>
                  </View>
                  {busyId === decision.id ? (
                    <ActivityIndicator color={th.primary} />
                  ) : (
                    <Ionicons name="add-circle-outline" size={20} color={th.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}

          {done ? <Text style={[styles.done, { color: th.accent }]}>{done}</Text> : null}
          {error ? <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function messageForError(e: unknown, t: TFunction<"translation", undefined>): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return t("decisions.errors.open_limit");
    if (e.status === 400) return t("decisions.errors.item_limit_or_type");
    return (e.body as { error?: string } | null)?.error ?? e.message;
  }
  return e instanceof Error ? e.message : t("decisions.errors.generic");
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
  list: { maxHeight: 280 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 12, marginTop: 2 },
  done: { fontSize: 13, fontFamily: fonts.bodySemibold },
  error: { fontSize: 13, lineHeight: 18 },
});
