import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { listBlocks, unblockUser } from "@/lib/chat/api";
import { Avatar } from "@/components/chat/ConversationList";
import { EmptyState, ResultModal } from "@/components/ui";

/** Cuenta → Privacidad → Usuarios bloqueados: lista + desbloquear. */
export default function BlockedUsersScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: blocks, loading, refetch } = useQuery(listBlocks, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUnblock(userId: string) {
    if (busy) return;
    setBusy(userId);
    try {
      await unblockUser(userId);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.action_error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ title: t("chat.blocked_title") }} />

      {loading && !blocks ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : (blocks?.length ?? 0) === 0 ? (
        <EmptyState icon="ban-outline" title={t("chat.blocked_empty_title")} description={t("chat.blocked_empty_desc")} />
      ) : (
        <FlatList
          data={blocks ?? []}
          keyExtractor={(b) => b.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const name =
              item.user.name?.trim() ||
              (item.user.username ? "@" + item.user.username : null) ||
              item.user.email?.split("@")[0] ||
              "—";
            const secondary = item.user.username ? "@" + item.user.username : item.user.email ?? "";
            return (
              <View style={[styles.row, { backgroundColor: th.surface, borderColor: th.border }]}>
                <Avatar title={name} imageUrl={item.user.image} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: th.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.rowEmail, { color: th.textMuted }]} numberOfLines={1}>
                    {secondary}
                  </Text>
                </View>
                {busy === item.userId ? (
                  <ActivityIndicator size="small" color={th.primary} />
                ) : (
                  <Pressable
                    onPress={() => void onUnblock(item.userId)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("chat.menu_unblock")}
                    style={[styles.unblockBtn, { borderColor: th.border }]}
                  >
                    <Ionicons name="lock-open-outline" size={14} color={th.primary} />
                    <Text style={[styles.unblockText, { color: th.primary }]}>{t("chat.menu_unblock")}</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.action_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowName: { fontSize: 14, fontFamily: fonts.bodySemibold },
  rowEmail: { fontSize: 12 },
  unblockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unblockText: { fontSize: 12, fontFamily: fonts.bodyMedium },
});
