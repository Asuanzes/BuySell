import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import type { BaseRecord } from "@nidokey/shared";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/**
 * Lista "Compartidos conmigo": registros que otros usuarios me han compartido
 * (solo lectura). Lee GET /api/records/shared (BaseRecord[] con meta.sharedBy).
 * Al tocar uno abre su ficha normal (/tipo/id), que el backend sirve en lectura.
 * Vive como componente para poder montarse dentro del hub /shares.
 */
export function SharedWithMeList() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<BaseRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<BaseRecord[]>("/api/records/shared"));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Guarda una COPIA del registro compartido en mis registros (POST /adopt).
  const adopt = useCallback(
    async (item: BaseRecord) => {
      try {
        await api(`/api/records/${item.id}/adopt`, { method: "POST", body: JSON.stringify({ type: item.type }) });
        Alert.alert(t("share.saved"));
      } catch (e) {
        const msg = e instanceof ApiError ? (e.body as { error?: string } | undefined)?.error : null;
        Alert.alert(msg || t("share.error"));
      }
    },
    [t],
  );

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(r) => `${r.type}:${r.id}`}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.primary} />}
      ListEmptyComponent={<Text style={[styles.empty, { color: th.textSubtle }]}>{t("shared.empty")}</Text>}
      renderItem={({ item }) => {
        const by = (item.meta as Record<string, unknown> | null)?.sharedBy;
        return (
          <View style={[styles.row, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Pressable style={styles.rowMain} onPress={() => router.push(`/${item.type}/${item.id}` as never)}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: th.imagePlaceholder }]} />
              )}
              <View style={styles.body}>
                <Text numberOfLines={1} style={[styles.title, { color: th.text }]}>{item.title}</Text>
                {item.subtitle ? (
                  <Text numberOfLines={1} style={[styles.sub, { color: th.textMuted }]}>{item.subtitle}</Text>
                ) : null}
                {by ? (
                  <Text numberOfLines={1} style={[styles.by, { color: th.textSubtle }]}>
                    {t("shared.by", { user: "@" + String(by) })}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <View style={styles.rowRight}>
              {item.primaryValue ? <Text style={[styles.value, { color: th.text }]}>{item.primaryValue}</Text> : null}
              <Pressable
                onPress={() => adopt(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("share.save_short")}
                style={[styles.saveBtn, { borderColor: th.primary }]}
              >
                <Ionicons name="add" size={15} color={th.primary} />
                <Text style={[styles.saveTxt, { color: th.primary }]}>{t("share.save_short")}</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 48, fontSize: 14, paddingHorizontal: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600" },
  sub: { fontSize: 13, marginTop: 1 },
  by: { fontSize: 11, marginTop: 2 },
  value: { fontSize: 14, fontWeight: "600" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  saveTxt: { fontSize: 12, fontWeight: "600" },
});
