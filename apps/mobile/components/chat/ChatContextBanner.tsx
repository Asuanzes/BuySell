import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { formatRecordEventDescription, type RecordEventPayload } from "@/lib/events-format";
import { fonts } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";

export type ContextHeaderEvent = {
  recordType: string;
  recordId: string;
  eventType: string;
  observedAt: string;
  // Mismo tipo que en el resto del canal de eventos (RecordEventDto), que es de
  // donde sale: así el formateador no necesita un cast en el punto de uso.
  payload: RecordEventPayload;
};

export type ChatContextCard = {
  title: string;
  subtitle: string | null;
  meta?: string | null;
  statusShown?: boolean;
  imageUrl: string | null;
  viewerOwnsRecord?: boolean;
  relatedRecordCount?: number;
  /** El servidor manda esto SOLO al dueño del registro, y como máximo 3 eventos. */
  changedSinceMyLastMessage?: { total: number; since: string; events: ContextHeaderEvent[] } | null;
};

/**
 * Cabecera de la conversación: de qué se está hablando y —lo que la diferencia
 * de cualquier chat— qué ha cambiado ahí desde la última vez que el usuario
 * escribió. Son dos destinos distintos: la ficha y la historia del registro.
 */
export function ChatContextBanner({
  card,
  contextType,
  contextId,
  deletedLabel,
  onOpenRecord,
  onOpenHistory,
  locale,
}: {
  card: ChatContextCard | null;
  contextType: string | null;
  contextId: string | null;
  deletedLabel: string;
  onOpenRecord: () => void;
  onOpenHistory: () => void;
  locale: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();

  if (!card) {
    if (!contextType || !contextId) return null;
    return (
      <View style={[styles.banner, { backgroundColor: th.surface, borderColor: th.border }]}>
        <Text style={[styles.sub, { color: th.textSubtle }]}>{deletedLabel}</Text>
      </View>
    );
  }

  const changed = card.changedSinceMyLastMessage;
  // Nada de «0 cambios»: sin actividad, el banner es el de siempre.
  const latest =
    changed && changed.total > 0
      ? [...changed.events].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]
      : null;
  const latestDescription = latest
    ? formatRecordEventDescription(latest.eventType, latest.payload, t, locale)
    : null;

  return (
    <View style={[styles.banner, { backgroundColor: th.surface, borderColor: th.border }]}>
      <Pressable
        onPress={onOpenRecord}
        accessibilityRole="button"
        accessibilityLabel={card.title}
        style={({ pressed }) => [styles.rowTop, pressed && { opacity: 0.7 }]}
      >
        {card.imageUrl ? (
          <Image source={{ uri: card.imageUrl }} style={styles.img} contentFit="cover" />
        ) : (
          <View style={[styles.img, { backgroundColor: th.imagePlaceholder }]} />
        )}
        <View style={styles.body}>
          <Text style={[styles.title, { color: th.text }]} numberOfLines={1}>
            {card.title}
          </Text>
          {card.subtitle ? (
            <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>
              {card.subtitle}
            </Text>
          ) : null}
          {card.meta ? (
            <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>
              {card.meta}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={th.textSubtle} />
      </Pressable>

      {changed && changed.total > 0 ? (
        <Pressable
          onPress={onOpenHistory}
          accessibilityRole="button"
          accessibilityLabel={t("chat.changed_open")}
          style={({ pressed }) => [
            styles.rowChanged,
            { borderTopColor: th.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="time-outline" size={16} color={th.textSubtle} />
          <View style={styles.body}>
            <Text style={[styles.changedCount, { color: th.text }]} numberOfLines={1}>
              {t("chat.changed_count", { count: changed.total })}
            </Text>
            {latestDescription ? (
              <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>
                {latestDescription}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={th.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 10,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowChanged: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  img: { width: 38, height: 38, borderRadius: 6 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontFamily: fonts.bodyMedium },
  sub: { fontSize: 12, fontFamily: fonts.body },
  changedCount: { fontSize: 13, fontFamily: fonts.bodyMedium },
});
