import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { CategoryIcon } from "@/components/CategoryIcon";
import {
  eventTimeAgo,
  eventTitle,
  formatRecordEventDescription,
  type RecordEventDto,
} from "@/lib/events";
import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import type { RecordType } from "@nidokey/shared";

export function RecordEventRow({
  item,
  locale,
  onPress,
  compact = false,
}: {
  item: RecordEventDto & { recordType: RecordType };
  locale: string;
  onPress?: (item: RecordEventDto & { recordType: RecordType }) => void;
  compact?: boolean;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const description = formatRecordEventDescription(item.eventType, item.payload, t, locale);
  const ago = eventTimeAgo(item.observedAt, t);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={eventTitle(item)}
      disabled={!onPress}
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [
        styles.row,
        compact && styles.compactRow,
        { backgroundColor: th.surface, borderColor: th.border },
        th.elevation.sm,
        pressed && { opacity: 0.76 },
      ]}
    >
      <View style={[styles.iconWrap, compact && styles.compactIconWrap, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
        <CategoryIcon type={item.recordType} size={compact ? 20 : 24} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.title, { color: th.text }]} numberOfLines={1}>
            {eventTitle(item)}
          </Text>
          {ago ? (
            <Text style={[styles.time, { color: th.textSubtle }]} numberOfLines={1}>
              {ago}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.description, { color: th.textMuted }]} numberOfLines={compact ? 1 : 2}>
          {description}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={th.textSubtle} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  compactRow: {
    minHeight: 60,
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderWidth: 0,
    borderRadius: 0,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  compactIconWrap: {
    width: 34,
    height: 34,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  time: { fontSize: 11, lineHeight: 15, fontFamily: fonts.body },
  description: { marginTop: 3, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
});
