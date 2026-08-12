import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState, Screen } from "@/components/ui";
import { fonts } from "@/lib/fonts";
import { fetchAppointments, type Appointment } from "@/lib/record-tasks";
import { useTheme } from "@/lib/theme";
import type { RecordType } from "@nidokey/shared";

/**
 * Vista de citas (C6i4, D6-01): las tareas CON fecha — hoy, próximas y las de
 * los últimos 30 días — con enlace a su registro y el progreso del checklist.
 * Solo día, sin horas ni sync externa: es una vista, no un calendario.
 */

type Row = { kind: "header"; id: string; label: string } | { kind: "item"; id: string; item: Appointment };

/** "YYYY-MM-DD" local de hoy; las citas se comparan como día puro (partes UTC del ISO). */
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDay(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function AppointmentsScreen() {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigatingRef = useRef(false);

  const load = useCallback(async (asRefresh: boolean) => {
    if (asRefresh) setRefreshing(true);
    try {
      setItems(await fetchAppointments());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refresco por FOCO de navegación (no solo AppState): al volver de una ficha
  // donde se cambió la fecha, la lista tiene que reflejarlo.
  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
      void load(false);
    }, [load])
  );

  const rows = useMemo<Row[]>(() => {
    if (!items) return [];
    const today = todayYmd();
    const byBucket: Record<"today" | "upcoming" | "past", Appointment[]> = { today: [], upcoming: [], past: [] };
    for (const item of items) {
      const ymd = item.scheduledAt.slice(0, 10);
      byBucket[ymd === today ? "today" : ymd > today ? "upcoming" : "past"].push(item);
    }
    // Pasadas al final y de la más reciente a la más antigua (el servidor manda ascendente).
    byBucket.past.reverse();
    const out: Row[] = [];
    for (const bucket of ["today", "upcoming", "past"] as const) {
      if (byBucket[bucket].length === 0) continue;
      out.push({ kind: "header", id: `h:${bucket}`, label: t(`appointments.section_${bucket}`) });
      out.push(...byBucket[bucket].map((item): Row => ({ kind: "item", id: item.id, item })));
    }
    return out;
  }, [items, t]);

  const openItem = useCallback((item: Appointment) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push(`/${item.recordType}/${item.recordId}` as never);
  }, []);

  return (
    <Screen title={t("appointments.title")} subtitle={t("appointments.subtitle")}>
      {items == null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : error && (items == null || items.length === 0) ? (
        <View style={styles.center}>
          <EmptyState
            icon="warning-outline"
            title={t("appointments.error_title")}
            description={error}
            actionLabel={t("common.retry")}
            onAction={() => void load(false)}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={[styles.list, { paddingBottom: 28 + insets.bottom }, rows.length === 0 && styles.emptyList]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={th.primary} colors={[th.primary]} />
          }
          renderItem={({ item: row }) =>
            row.kind === "header" ? (
              <Text style={[styles.sectionHeader, { color: th.textMuted }]}>{row.label}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => openItem(row.item)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: th.surface, borderColor: th.border },
                  th.elevation.sm,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <CategoryIcon type={row.item.recordType as RecordType} size={22} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: th.text }]} numberOfLines={1}>
                    {row.item.recordTitle ?? row.item.title}
                  </Text>
                  <Text style={[styles.rowMeta, { color: th.textSubtle }]} numberOfLines={1}>
                    {row.item.recordTitle ? row.item.title : t("appointments.no_record")}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowDate, { color: th.accent }]}>{fmtDay(row.item.scheduledAt, i18n.language)}</Text>
                  {row.item.itemsTotal > 0 ? (
                    <Text style={[styles.rowProgress, { color: th.textMuted }]}>
                      {t("appointments.progress", { done: row.item.itemsDone, total: row.item.itemsTotal })}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <EmptyState
                icon="calendar-outline"
                title={t("appointments.empty_title")}
                description={t("appointments.empty_desc")}
              />
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  sectionHeader: { fontSize: 13, fontFamily: fonts.bodySemibold, marginTop: 6, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 2 },
  rowDate: { fontSize: 13, fontFamily: fonts.bodySemibold },
  rowProgress: { fontSize: 12 },
});
