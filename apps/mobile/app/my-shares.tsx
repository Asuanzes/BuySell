import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { RecordType } from "@nidokey/shared";

import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { categoryColor, RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { EmptyState, ResultModal, Screen } from "@/components/ui";

/**
 * "Mis compartidos": lo que YO he concedido, con opción de retirarlo.
 *
 * Compartir da acceso a la ficha VIVA (se actualiza sola), así que el usuario
 * necesita ver el estado y poder deshacerlo. Los accesos vienen AGRUPADOS por
 * origen: compartir en un grupo es UNA concesión, no una fila por miembro.
 */

type ShareGrant = {
  key: string;
  recordType: string;
  recordId: string;
  title: string;
  /** false = el registro ya no existe: fila huérfana, solo para limpiarla. */
  exists: boolean;
  conversationId: string | null;
  conversationTitle: string | null;
  /** Solo en concesiones directas (las de grupo se retiran en bloque). */
  toUserId: string | null;
  recipientName: string | null;
  recipientCount: number;
  createdAt: string;
};

export default function MySharesScreen() {
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<ShareGrant[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** Distinto de "no hay nada": esta pantalla no puede mentir sobre el estado. */
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<ShareGrant | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ grants: ShareGrant[]; truncated: boolean }>("/api/records/shares");
      setItems(res.grants);
      setTruncated(res.truncated);
      setFailed(false);
    } catch (e) {
      // NO vaciar la lista: dejarla en "no has compartido nada" sería afirmar
      // algo falso sobre quién ve tus fichas, que es justo lo que esta pantalla
      // existe para contar.
      setFailed(true);
      setError(e instanceof Error ? e.message : t("shares.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function revoke(g: ShareGrant) {
    setConfirm(null);
    setBusy(g.key);
    try {
      await api("/api/records/shares", {
        method: "DELETE",
        body: JSON.stringify({
          recordType: g.recordType,
          recordId: g.recordId,
          // Grupo → se retira la concesión entera; directo → solo esa persona.
          ...(g.conversationId ? { conversationId: g.conversationId } : { toUserId: g.toUserId }),
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shares.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t("shares.title") }} />
      {failed ? (
        <EmptyState
          icon="cloud-offline-outline"
          title={t("shares.load_error")}
          actionLabel={t("common.retry")}
          onAction={() => void load()}
        />
      ) : items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon="share-social-outline" title={t("shares.empty_title")} description={t("shares.empty_desc")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(g) => g.key}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.primary} />}
          ListHeaderComponent={
            <>
              <Text style={[styles.intro, { color: th.textMuted }]}>{t("shares.intro")}</Text>
              {truncated && (
                <Text style={[styles.intro, { color: th.dangerFg }]}>{t("shares.truncated")}</Text>
              )}
            </>
          }
          renderItem={({ item }) => {
            const accent = categoryColor(item.recordType as RecordType, dark) ?? th.primary;
            const icon = RECORD_TYPE_CONFIG[item.recordType as RecordType]?.icon ?? "bookmark-outline";
            const who = item.conversationTitle
              ? t("shares.in_group", { name: item.conversationTitle, count: item.recipientCount })
              : t("shares.with_person", { name: item.recipientName ?? "—" });
            return (
              <View style={[styles.row, { backgroundColor: th.surface, borderColor: th.border }]}>
                <View style={[styles.badge, { backgroundColor: accent + "22" }]}>
                  <Ionicons name={icon} size={17} color={accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, { color: item.exists ? th.text : th.textSubtle }]} numberOfLines={2}>
                    {item.exists ? item.title : t("shares.record_gone")}
                  </Text>
                  <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={2}>
                    {who}
                  </Text>
                </View>
                {busy === item.key ? (
                  <ActivityIndicator size="small" color={th.primary} />
                ) : (
                  <Pressable
                    onPress={() => setConfirm(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("shares.revoke")}: ${item.title}`}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={th.dangerFg} />
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <ResultModal
        visible={!!confirm}
        tone="error"
        icon="close-circle-outline"
        title={t("shares.revoke")}
        // Decir QUÉ y A QUIÉN: un toque en la fila equivocada retira sin deshacer.
        message={
          confirm
            ? `${confirm.exists ? confirm.title : t("shares.record_gone")} · ${
                confirm.conversationTitle
                  ? t("shares.in_group", { name: confirm.conversationTitle, count: confirm.recipientCount })
                  : t("shares.with_person", { name: confirm.recipientName ?? "—" })
              }\n\n${t("shares.revoke_message")}`
            : undefined
        }
        actions={[
          { label: t("shares.revoke"), variant: "danger", onPress: () => confirm && void revoke(confirm) },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirm(null) },
        ]}
        onRequestClose={() => setConfirm(null)}
      />
      <ResultModal
        visible={!!error}
        tone="error"
        title={t("shares.error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  list: { padding: 12, paddingBottom: 24 },
  intro: { fontSize: 12, lineHeight: 17, marginBottom: 10, paddingHorizontal: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontFamily: fonts.bodySemibold },
  sub: { fontSize: 12 },
  action: { padding: 4 },
});
