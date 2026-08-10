import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { RecordEventRow } from "@/components/records/RecordEventRow";
import {
  fetchEvents,
  isVisibleRecordEvent,
  validEventRecordFilter,
  type RecordEventDto,
} from "@/lib/events";
import { fonts } from "@/lib/fonts";
import { useRecord } from "@/lib/hooks/useRecord";
import { useLanguage } from "@/lib/i18n/language-context";
import { useTheme } from "@/lib/theme";
import type { RecordType } from "@nidokey/shared";

const PREVIEW_LIMIT = 5;

export function RecordHistoryBlock({
  recordType,
  recordId,
  recordTitle,
  initiallyCollapsed = true,
}: {
  recordType: RecordType;
  recordId: string;
  recordTitle: string;
  initiallyCollapsed?: boolean;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const filter = useMemo(
    () => validEventRecordFilter({ recordType, recordId }),
    [recordId, recordType]
  );
  const eventsQ = useRecord(
    () => fetchEvents(null, PREVIEW_LIMIT, filter),
    [filter?.recordType, filter?.recordId],
    { enabled: Boolean(filter && !collapsed) }
  );
  const events = (eventsQ.data?.items ?? []).filter((item): item is RecordEventDto & { recordType: RecordType } =>
    isVisibleRecordEvent(item, [recordType])
  );

  if (!filter) return null;

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("events.history_toggle")}
        onPress={() => setCollapsed((value) => !value)}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="pulse-outline" size={16} color={th.primary} />
        <Text style={[styles.title, { color: th.text }]}>{t("events.history_title")}</Text>
        <View style={styles.headSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("events.history_view_all")}
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: "/events",
              params: { recordType, recordId, recordTitle },
            } as never)
          }
          style={({ pressed }) => [styles.viewAll, pressed && { opacity: 0.75 }]}
        >
          <Text style={[styles.viewAllText, { color: th.primary }]}>{t("events.history_view_all")}</Text>
        </Pressable>
        <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={th.textSubtle} />
      </Pressable>

      {!collapsed ? (
        eventsQ.loading && !eventsQ.data ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color={th.primary} />
          </View>
        ) : eventsQ.error ? (
          <Text style={[styles.emptyText, { color: th.dangerFg }]}>{t("events.history_error")}</Text>
        ) : events.length === 0 ? (
          <Text style={[styles.emptyText, { color: th.textMuted }]}>{t("events.history_empty")}</Text>
        ) : (
          <View style={[styles.list, { borderTopColor: th.border }]}>
            {events.map((event, index) => (
              <View key={event.id} style={[index > 0 && { borderTopWidth: 1, borderTopColor: th.border }]}>
                <RecordEventRow item={event} locale={language === "en" ? "en" : "es"} compact />
              </View>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  head: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.bodyBold,
  },
  headSpacer: { flex: 1 },
  viewAll: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: fonts.bodySemibold,
  },
  loader: { paddingVertical: 12 },
  list: { borderTopWidth: 1 },
  emptyText: {
    paddingTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
});
