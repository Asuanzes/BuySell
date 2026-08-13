import { useEffect, useMemo, useState } from "react";
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

export type ChatContextRecord = {
  recordType: string;
  recordId: string;
  title: string;
  subtitle: string | null;
  meta?: string | null;
  statusShown?: boolean;
  imageUrl: string | null;
};

export type ChatContextCard = {
  title: string;
  subtitle: string | null;
  meta?: string | null;
  statusShown?: boolean;
  imageUrl: string | null;
  /** Registro elegido por el servidor (puede venir del último mensaje
   *  compartido, no solo del contexto propio de la conversación). */
  recordType?: string;
  recordId?: string;
  /** Carrusel: todos los registros de la conversación, por recencia. */
  records?: ChatContextRecord[];
  viewerOwnsRecord?: boolean;
  relatedRecordCount?: number;
  /** El servidor manda esto SOLO al dueño del registro, y como máximo 3 eventos. */
  changedSinceMyLastMessage?: { total: number; since: string; events: ContextHeaderEvent[] } | null;
};

/**
 * Cabecera de la conversación: de qué se está hablando y —lo que la diferencia
 * de cualquier chat— qué ha cambiado ahí desde la última vez que el usuario
 * escribió. Con varios registros en juego (compartidos y enlaces [[…]] de los
 * mensajes), el banner ROTA entre ellos con los chevrons; el más reciente va
 * primero, así una acción nueva mueve el contexto sola (petición 2026-08-13).
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
  onOpenRecord: (recordType: string | null, recordId: string | null) => void;
  onOpenHistory: (recordType: string | null, recordId: string | null) => void;
  locale: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();

  // Carrusel: records del servidor; sin ellos (cliente/servidor viejos), la
  // tarjeta primaria como única página.
  const pages = useMemo<ChatContextRecord[]>(() => {
    if (!card) return [];
    if (card.records?.length) return card.records;
    return [
      {
        recordType: card.recordType ?? contextType ?? "",
        recordId: card.recordId ?? contextId ?? "",
        title: card.title,
        subtitle: card.subtitle,
        meta: card.meta ?? null,
        ...(card.statusShown ? { statusShown: true } : {}),
        imageUrl: card.imageUrl,
      },
    ];
  }, [card, contextType, contextId]);

  const [index, setIndex] = useState(0);
  // La firma de páginas cambia (nuevo registro en juego) → volver a la primera:
  // así la última acción se ve sin tocar nada.
  const signature = pages.map((p) => `${p.recordType}:${p.recordId}`).join(",");
  useEffect(() => {
    setIndex(0);
  }, [signature]);

  if (!card) {
    if (!contextType || !contextId) return null;
    return (
      <View style={[styles.banner, { backgroundColor: th.surface, borderColor: th.border }]}>
        <Text style={[styles.sub, { color: th.textSubtle }]}>{deletedLabel}</Text>
      </View>
    );
  }

  const current = pages[Math.min(index, pages.length - 1)] ?? null;
  const changed = card.changedSinceMyLastMessage;
  // Nada de «0 cambios»: sin actividad, el banner es el de siempre.
  const latest =
    changed && changed.total > 0
      ? [...changed.events].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]
      : null;
  const latestDescription = latest
    ? formatRecordEventDescription(latest.eventType, latest.payload, t, locale)
    : null;

  const cycle = (delta: number) => {
    if (pages.length < 2) return;
    setIndex((prev) => (prev + delta + pages.length) % pages.length);
  };

  return (
    <View style={[styles.banner, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.rowTop}>
        {pages.length > 1 ? (
          <Pressable onPress={() => cycle(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("chat.context_prev")}>
            <Ionicons name="chevron-back" size={16} color={th.textSubtle} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onOpenRecord(current?.recordType || null, current?.recordId || null)}
          accessibilityRole="button"
          accessibilityLabel={current?.title ?? card.title}
          style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
        >
          {/* Sin imagen NO se reserva el hueco: un cuadrado vacío parecía una
              foto rota (fallo reportado 2026-08-13 con viajes organizándose). */}
          {current?.imageUrl ? <Image source={{ uri: current.imageUrl }} style={styles.img} contentFit="cover" /> : null}
          <View style={styles.body}>
            <Text style={[styles.title, { color: th.text }]} numberOfLines={1}>
              {current?.title ?? card.title}
            </Text>
            {current?.subtitle ? (
              <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>
                {current.subtitle}
              </Text>
            ) : null}
            {current?.meta ? (
              <Text style={[styles.sub, { color: th.textMuted }]} numberOfLines={1}>
                {current.meta}
              </Text>
            ) : null}
          </View>
          {pages.length > 1 ? (
            <Text style={[styles.pageIndicator, { color: th.textSubtle }]}>{`${Math.min(index, pages.length - 1) + 1}/${pages.length}`}</Text>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={th.textSubtle} />
        </Pressable>
        {pages.length > 1 ? (
          <Pressable onPress={() => cycle(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("chat.context_next")}>
            <Ionicons name="chevron-forward-circle-outline" size={18} color={th.textSubtle} />
          </Pressable>
        ) : null}
      </View>

      {changed && changed.total > 0 ? (
        <Pressable
          onPress={() => onOpenHistory(current?.recordType || null, current?.recordId || null)}
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
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
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
  pageIndicator: { fontSize: 11, fontFamily: fonts.body },
});
