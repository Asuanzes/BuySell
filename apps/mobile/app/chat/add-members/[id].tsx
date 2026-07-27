import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/hooks/useQuery";
import { addParticipants, chatBootstrap, getConversation } from "@/lib/chat/api";
import { MemberPicker } from "@/components/chat/MemberPicker";
import { EmptyState, ResultModal } from "@/components/ui";

/** Añadir miembros a un grupo existente (solo OWNER/ADMIN; el servidor manda). */
export default function AddMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: conversation, loading } = useQuery(() => getConversation(id), [id]);
  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });

  const current = conversation?.participants.length ?? 0;
  const maxMembers = boot?.limits.maxGroupParticipants ?? 64;
  // Huecos que quedan: el tope del servidor cuenta a TODOS los miembros.
  const free = Math.max(0, maxMembers - current);
  const allowed = !conversation || (conversation.kind === "GROUP" && conversation.myRole !== "MEMBER");
  const excludeIds = useMemo(
    () => new Set((conversation?.participants ?? []).map((p) => p.userId)),
    [conversation]
  );

  async function add(userIds: string[]) {
    if (busy || userIds.length === 0) return;
    setBusy(true);
    try {
      await addParticipants(id, userIds);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg && !msg.startsWith("[object") ? msg : t("chat.action_error"));
      setBusy(false);
    }
  }

  if (loading && !conversation) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("chat.group_add_members") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  // Por enlace directo se puede caer aquí desde un 1:1 o siendo MEMBER; sin
  // esta guarda el selector se pintaba entero y solo fallaba al pulsar Añadir.
  if (!allowed) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("chat.group_add_members") }} />
        <EmptyState icon="lock-closed-outline" title={t("chat.group_admins_only")} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t("chat.group_add_members") }} />
      <MemberPicker
        max={free}
        totalLimit={maxMembers}
        excludeIds={excludeIds}
        submitLabel={t("chat.group_add_action")}
        submitIcon="person-add-outline"
        submitting={busy}
        onSubmit={(ids) => void add(ids)}
        footerLabel={(n) => t("chat.members", { count: current + n })}
      />
      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.action_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
