import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { BaseRecord, RecordType } from "@nidokey/shared";

import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import { fetchRecords } from "@/lib/data/records-repository";
import { RECORD_TYPE_CONFIG, categoryColor } from "@/lib/records/config";
import { useTypeI18n } from "@/lib/records/type-i18n";
import { RecordCard } from "@/components/RecordCard";
import {
  availableVisitProperties,
  buildCounterpointMessage,
  buildVisitMessage,
  eligibleCounterpointTypes,
  type BotRecordActionMode,
} from "@/lib/chat/bot-record-actions";
import { router } from "expo-router";

const ACTIONABLE_TYPES = (Object.keys(RECORD_TYPE_CONFIG) as RecordType[]).filter(
  (type) => RECORD_TYPE_CONFIG[type].enabled && RECORD_TYPE_CONFIG[type].addMode !== "none" && type !== "chat",
);

export function BotRecordActionSheet({
  visible,
  mode,
  onClose,
  onSend,
}: {
  visible: boolean;
  mode: BotRecordActionMode;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  const typeI18n = useTypeI18n();
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<BaseRecord[]>([]);
  const [selectedType, setSelectedType] = useState<RecordType | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedType(null);
    setSelectedIds([]);
    setError(null);
    setLoading(true);
    Promise.all(ACTIONABLE_TYPES.map((type) => fetchRecords({ type })))
      .then((groups) => setRecords(groups.flat()))
      .catch((e) => setError(e instanceof Error ? e.message : t("chat.bot_actions.load_error")))
      .finally(() => setLoading(false));
  }, [visible, t]);

  const counterpointTypes = useMemo(() => eligibleCounterpointTypes(records), [records]);
  const typeRecords = useMemo(
    () => (selectedType ? records.filter((record) => record.type === selectedType) : []),
    [records, selectedType],
  );
  const visitRecords = useMemo(() => availableVisitProperties(records), [records]);
  const selectedRecords = useMemo(() => {
    const source = mode === "visit" ? visitRecords : typeRecords;
    return selectedIds.map((id) => source.find((record) => record.id === id)).filter((record): record is BaseRecord => !!record);
  }, [mode, selectedIds, typeRecords, visitRecords]);

  const canConfirm = mode === "visit" ? selectedRecords.length === 1 : selectedRecords.length >= 2 && selectedRecords.length <= 3;
  const title = mode === "visit" ? t("chat.bot_actions.visit_title") : t("chat.bot_actions.counterpoint_title");
  const hint = mode === "visit" ? t("chat.bot_actions.visit_hint") : t("chat.bot_actions.counterpoint_hint");

  function toggleRecord(record: BaseRecord) {
    if (mode === "visit") {
      setSelectedIds([record.id]);
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(record.id)) return prev.filter((id) => id !== record.id);
      if (prev.length >= 3) return prev;
      return [...prev, record.id];
    });
  }

  function confirm() {
    if (!canConfirm) return;
    onSend(mode === "visit" ? buildVisitMessage(selectedRecords[0]) : buildCounterpointMessage(selectedRecords));
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.kav}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.cancel")} />
        <View style={[styles.sheet, { backgroundColor: th.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: th.border }]} />
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={[styles.title, { color: th.text }]}>{title}</Text>
              <Text style={[styles.hint, { color: th.textMuted }]}>{hint}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.cancel")} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={th.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={th.primary} />
            </View>
          ) : error ? (
            <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>
          ) : mode === "counterpoint" && !selectedType ? (
            counterpointTypes.length === 0 ? (
              <Text style={[styles.empty, { color: th.textMuted }]}>{t("chat.bot_actions.counterpoint_empty")}</Text>
            ) : (
              <ScrollView style={styles.list}>
                {counterpointTypes.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedType(type)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.typeRow,
                      { borderColor: th.border, backgroundColor: th.bg },
                      pressed && { opacity: 0.78 },
                    ]}
                  >
                    <Ionicons name={RECORD_TYPE_CONFIG[type].icon} size={20} color={categoryColor(type, dark)} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: th.text }]}>{typeI18n.label(type)}</Text>
                      <Text style={[styles.rowMeta, { color: th.textSubtle }]}>
                        {t("chat.bot_actions.records_count", { count: records.filter((r) => r.type === type).length })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
                  </Pressable>
                ))}
              </ScrollView>
            )
          ) : (
            <>
              {mode === "counterpoint" && selectedType ? (
                <Pressable onPress={() => { setSelectedType(null); setSelectedIds([]); }} accessibilityRole="button" style={styles.backRow}>
                  <Ionicons name="chevron-back" size={18} color={th.primary} />
                  <Text style={[styles.backText, { color: th.primary }]}>{t("chat.bot_actions.change_type")}</Text>
                </Pressable>
              ) : null}
              {(mode === "visit" ? visitRecords : typeRecords).length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={[styles.empty, { color: th.textMuted }]}>
                    {mode === "visit" ? t("chat.bot_actions.visit_empty") : t("chat.bot_actions.counterpoint_empty")}
                  </Text>
                  {mode === "visit" ? (
                    <Pressable
                      onPress={() => {
                        onClose();
                        router.push("/importar" as never);
                      }}
                      accessibilityRole="button"
                      style={[styles.importBtn, { backgroundColor: th.primary }]}
                    >
                      <Text style={[styles.importText, { color: th.primaryFg }]}>{t("chat.bot_actions.import_cta")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
                  {(mode === "visit" ? visitRecords : typeRecords).map((record) => (
                    <RecordCard
                      key={`${record.type}:${record.id}`}
                      record={record}
                      selecting
                      selected={selectedIds.includes(record.id)}
                      selectionDisabled={mode === "counterpoint" && selectedIds.length >= 3 && !selectedIds.includes(record.id)}
                      onToggleSelected={toggleRecord}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}

          <Pressable
            onPress={confirm}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityLabel={t("chat.bot_actions.send")}
            style={[styles.confirmBtn, { backgroundColor: th.primary, opacity: canConfirm ? 1 : 0.45 }]}
          >
            <Text style={[styles.confirmText, { color: th.primaryFg }]}>{t("chat.bot_actions.send")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 12, maxHeight: "88%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  titleText: { flex: 1, gap: 4 },
  title: { fontSize: 18, fontFamily: fonts.bodyBold },
  hint: { fontSize: 13, lineHeight: 18 },
  closeBtn: { padding: 4 },
  center: { paddingVertical: 24 },
  error: { fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 13, lineHeight: 18 },
  emptyBlock: { gap: 12, paddingVertical: 8 },
  list: { maxHeight: 320 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 12, marginTop: 2 },
  backRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 3, paddingVertical: 2 },
  backText: { fontSize: 13, fontFamily: fonts.bodySemibold },
  cards: { maxHeight: 420 },
  cardsContent: { gap: 10, paddingBottom: 4 },
  confirmBtn: { alignItems: "center", justifyContent: "center", minHeight: 44, borderRadius: 10, paddingHorizontal: 14 },
  confirmText: { fontSize: 15, fontFamily: fonts.bodyBold },
  importBtn: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  importText: { fontSize: 14, fontFamily: fonts.bodyBold },
});
