import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { fonts } from "@/lib/fonts";
import { formatRecordCreationDate } from "@/lib/records/creation-date";
import { useTheme } from "@/lib/theme";

export function RecordCreationRow({
  createdAt,
  locale,
  compact = false,
}: {
  createdAt?: string | null;
  locale: string;
  compact?: boolean;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const date = formatRecordCreationDate(createdAt, locale);

  if (!date) return null;

  return (
    <View
      style={[
        styles.row,
        compact && styles.compactRow,
        { backgroundColor: th.surface, borderColor: th.border },
        th.elevation.sm,
      ]}
    >
      <View style={[styles.iconWrap, compact && styles.compactIconWrap, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
        <Ionicons name="add-circle-outline" size={compact ? 20 : 24} color={th.textSubtle} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.title, { color: th.text }]} numberOfLines={1}>
          {t("events.record_added_on", { date })}
        </Text>
        <Text style={[styles.description, { color: th.textMuted }]} numberOfLines={compact ? 1 : 2}>
          {t("events.record_added_desc")}
        </Text>
      </View>
    </View>
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
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  description: { marginTop: 3, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
});
