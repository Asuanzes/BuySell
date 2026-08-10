import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { RecordCard } from "@/components/RecordCard";
import { EmptyState, ResultModal } from "@/components/ui";
import { fonts } from "@/lib/fonts";
import { getDecision, removeDecisionItem, type DecisionItem } from "@/lib/decisions";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";

export default function DecisionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data, error, loading, refreshing, refetch } = useQuery(() => getDecision(id!), [id], {
    enabled: !!id,
    revalidateOnFocus: true,
  });
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const propertyIds = useMemo(
    () => (data?.items ?? []).filter((item) => item.recordType === "property" && item.record).map((item) => item.recordId),
    [data]
  );
  const canCompare = propertyIds.length >= 2;

  const onRemove = useCallback(
    async (item: DecisionItem) => {
      const key = `${item.recordType}:${item.recordId}`;
      setRemoving(key);
      setNotice(null);
      try {
        await removeDecisionItem(id!, item.recordType, item.recordId);
        await refetch();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : t("decisions.errors.generic"));
      } finally {
        setRemoving(null);
      }
    },
    [id, refetch, t]
  );

  function openCompare() {
    if (!canCompare) return;
    router.push(`/property/compare?ids=${encodeURIComponent(propertyIds.slice(0, 3).join(","))}` as never);
  }

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ title: data?.decision.title ?? t("decisions.detail.title") }} />
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
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon="git-branch-outline"
          title={t("decisions.detail.empty_title")}
          description={t("decisions.detail.empty_desc")}
        />
      ) : (
        <>
          <View style={[styles.header, { backgroundColor: th.surface, borderColor: th.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: th.text }]}>{data.decision.title}</Text>
              <Text style={[styles.subtitle, { color: th.textMuted }]}>
                {t("decisions.detail.subtitle", { count: data.items.length, changed: data.changedCount })}
              </Text>
            </View>
            {canCompare ? (
              <Pressable
                onPress={openCompare}
                accessibilityRole="button"
                style={[styles.compareBtn, { backgroundColor: th.accentSoft, borderColor: th.accent }]}
              >
                <Ionicons name="git-compare-outline" size={17} color={th.accent} />
                <Text style={[styles.compareText, { color: th.accent }]}>{t("decisions.detail.compare")}</Text>
              </Pressable>
            ) : null}
          </View>
          <FlatList
            data={data.items}
            keyExtractor={(item) => `${item.recordType}:${item.recordId}`}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={th.primary} />}
            renderItem={({ item }) => (
              <DecisionRecordItem
                item={item}
                busy={removing === `${item.recordType}:${item.recordId}`}
                onRemove={() => void onRemove(item)}
              />
            )}
          />
        </>
      )}

      <ResultModal
        visible={!!notice}
        tone="error"
        title={t("decisions.error_title")}
        message={notice ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />
    </View>
  );
}

function DecisionRecordItem({
  item,
  busy,
  onRemove,
}: {
  item: DecisionItem;
  busy: boolean;
  onRemove: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.itemWrap}>
      {item.record ? (
        <RecordCard record={item.record} />
      ) : (
        <View style={[styles.orphanCard, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Ionicons name="alert-circle-outline" size={22} color={th.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.orphanTitle, { color: th.text }]}>{t("decisions.detail.orphan_title")}</Text>
            <Text style={[styles.orphanText, { color: th.textMuted }]}>
              {t("decisions.detail.orphan_desc", { type: item.recordType })}
            </Text>
          </View>
        </View>
      )}
      <Pressable
        onPress={onRemove}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t("decisions.detail.remove")}
        style={[styles.removeBtn, { backgroundColor: th.surface, borderColor: th.border }]}
      >
        {busy ? <ActivityIndicator size="small" color={th.dangerFg} /> : <Ionicons name="remove-circle-outline" size={19} color={th.dangerFg} />}
        <Text style={[styles.removeText, { color: th.dangerFg }]}>{t("decisions.detail.remove")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, margin: 12, padding: 12 },
  title: { fontSize: 18, fontFamily: fonts.bodyBold },
  subtitle: { fontSize: 12, marginTop: 3 },
  compareBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  compareText: { fontSize: 13, fontFamily: fonts.bodyBold },
  list: { paddingHorizontal: 12, paddingBottom: 28 },
  itemWrap: { marginBottom: 10 },
  orphanCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, opacity: 0.72 },
  orphanTitle: { fontSize: 14, fontFamily: fonts.bodyBold },
  orphanText: { fontSize: 12, marginTop: 2 },
  removeBtn: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: -4 },
  removeText: { fontSize: 12, fontFamily: fonts.bodySemibold },
});
