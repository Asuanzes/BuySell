import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ResultModal } from "@/components/ui";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";
import {
  createDecision,
  deleteDecision,
  formatDecisionBadge,
  isValidDecisionTitle,
  listDecisions,
  normalizeDecisionTitle,
  updateDecision,
  type DecisionSummary,
} from "@/lib/decisions";

type ConfirmState =
  | { kind: "archive"; decision: DecisionSummary }
  | { kind: "delete"; decision: DecisionSummary }
  | null;

export default function DecisionsScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, error, loading, refreshing, refetch } = useQuery(() => listDecisions(), [], {
    revalidateOnFocus: true,
    refreshInterval: 60_000,
  });
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const decisions = data?.items ?? [];
  const canCreate = isValidDecisionTitle(draft);

  const onCreate = useCallback(async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const res = await createDecision(draft);
      setDraft("");
      await refetch();
      router.push(`/decisions/${res.decision.id}` as never);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("decisions.errors.generic"));
    } finally {
      setCreating(false);
    }
  }, [canCreate, creating, draft, refetch, t]);

  async function runConfirm() {
    const current = confirm;
    setConfirm(null);
    if (!current) return;
    try {
      if (current.kind === "archive") {
        await updateDecision(current.decision.id, { status: "archived" });
      } else {
        await deleteDecision(current.decision.id);
      }
      await refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("decisions.errors.generic"));
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ title: t("decisions.title") }} />
      <View style={[styles.createBox, { backgroundColor: th.surface, borderColor: th.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={80}
          placeholder={t("decisions.create.placeholder")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, { color: th.text }]}
          returnKeyType="done"
          onSubmitEditing={() => void onCreate()}
        />
        <Pressable
          onPress={() => void onCreate()}
          disabled={!canCreate || creating}
          accessibilityRole="button"
          accessibilityLabel={t("decisions.create.action")}
          style={[styles.createBtn, { backgroundColor: th.primary, opacity: canCreate ? 1 : 0.45 }]}
        >
          {creating ? <ActivityIndicator color={th.primaryFg} /> : <Ionicons name="add" size={18} color={th.primaryFg} />}
        </Pressable>
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t("decisions.error_title")}
          description={error.message}
          actionLabel={t("common.retry")}
          onAction={refetch}
        />
      ) : decisions.length === 0 ? (
        <EmptyState
          icon="git-branch-outline"
          title={t("decisions.empty_title")}
          description={t("decisions.empty_desc")}
        />
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: 28 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={th.primary} />}
          renderItem={({ item }) => (
            <DecisionRow
              decision={item}
              onArchive={() => setConfirm({ kind: "archive", decision: item })}
              onDelete={() => setConfirm({ kind: "delete", decision: item })}
            />
          )}
        />
      )}

      <ResultModal
        visible={!!notice}
        tone="error"
        title={t("decisions.error_title")}
        message={notice ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />
      <ResultModal
        visible={!!confirm}
        tone={confirm?.kind === "delete" ? "error" : "info"}
        icon={confirm?.kind === "delete" ? "trash-outline" : "archive-outline"}
        title={confirm?.kind === "delete" ? t("decisions.delete.title") : t("decisions.archive.title")}
        message={
          confirm
            ? confirm.kind === "delete"
              ? t("decisions.delete.message", { title: confirm.decision.title })
              : t("decisions.archive.message", { title: confirm.decision.title })
            : undefined
        }
        actions={[
          {
            label: confirm?.kind === "delete" ? t("common.delete") : t("decisions.archive.action"),
            variant: confirm?.kind === "delete" ? "danger" : "primary",
            onPress: () => void runConfirm(),
          },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirm(null) },
        ]}
        onRequestClose={() => setConfirm(null)}
      />
    </View>
  );
}

function DecisionRow({
  decision,
  onArchive,
  onDelete,
}: {
  decision: DecisionSummary;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const badge = formatDecisionBadge(decision.changedCount);
  const archived = decision.status === "archived";
  return (
    <Pressable
      onPress={() => router.push(`/decisions/${decision.id}` as never)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: th.surface, borderColor: th.border },
        archived && { opacity: 0.62 },
        pressed && { opacity: 0.78 },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: th.primarySoft }]}>
        <Ionicons name="git-branch-outline" size={20} color={th.primary} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardTitle, { color: th.text }]} numberOfLines={1}>
            {normalizeDecisionTitle(decision.title)}
          </Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: th.accent }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.meta, { color: th.textMuted }]}>
          {t("decisions.row_meta", {
            count: decision.itemCount,
            status: archived ? t("decisions.status_archived") : t("decisions.status_open"),
          })}
        </Text>
      </View>
      <View style={styles.actions}>
        {!archived ? (
          <Pressable onPress={onArchive} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("decisions.archive.action")}>
            <Ionicons name="archive-outline" size={20} color={th.textMuted} />
          </Pressable>
        ) : null}
        <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.delete")}>
          <Ionicons name="trash-outline" size={20} color={th.dangerFg} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  createBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 14, margin: 12, paddingHorizontal: 12, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  createBtn: { width: 40, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  list: { padding: 12, paddingBottom: 28 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  iconBubble: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 12, marginTop: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: fonts.bodyBold },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
});
