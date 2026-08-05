import { StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import type { RelatedChat } from "@/lib/records/property";

/** "ahora", "hace 5 m", "hace 3 h", "hace 2 d"… localizado. */
function timeAgo(iso: string, locale: string): string {
  const diff = Date.now() - Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (min < 1) return rtf.format(0, "minute");
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 7) return rtf.format(-d, "day");
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/**
 * "¿Qué se ha hablado?": conversaciones vinculadas a la ficha con su último
 * mensaje relevante (SYSTEM de cambio o el mensaje que acompañó a la tarjeta).
 * Vacío → CTA de compartir, que es justo lo que genera el vínculo.
 */
export function RelatedChatsBlock({
  chats,
  loading,
  onOpenChat,
  onShare,
}: {
  chats: RelatedChat[] | null;
  loading: boolean;
  onOpenChat: (conversationId: string) => void;
  onShare: () => void;
}) {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();

  if (loading && !chats) {
    return (
      <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
        <ActivityIndicator size="small" color={th.primary} />
      </View>
    );
  }
  if (!chats) return null;

  if (chats.length === 0) {
    return (
      <View style={[styles.card, styles.emptyCard, { backgroundColor: th.surface, borderColor: th.border }]}>
        <View style={[styles.emptyIcon, { backgroundColor: th.primarySoft }]}>
          <Ionicons name="chatbubbles-outline" size={18} color={th.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: th.text }]}>
          {t("detail.property.chat_empty_title")}
        </Text>
        <Text style={[styles.emptyBody, { color: th.textMuted }]}>
          {t("detail.property.chat_empty_body")}
        </Text>
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.shareBtn,
            { backgroundColor: th.primary, borderColor: th.primary },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="person-add-outline" size={15} color={th.primaryFg} />
          <Text style={[styles.shareBtnText, { color: th.primaryFg }]}>
            {t("detail.property.chat_share_cta")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.head}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={th.primary} />
        <Text style={[styles.title, { color: th.text }]}>{t("detail.property.chat_title")}</Text>
      </View>
      <View style={[styles.list, { borderTopColor: th.border }]}>
        {chats.map((chat, i) => {
          const body = chat.lastMessage?.body?.trim() ?? "";
          const from =
            chat.lastMessage && chat.lastMessage.senderName
              ? `${chat.lastMessage.senderName}: `
              : "";
          return (
            <Pressable
              key={chat.conversationId}
              onPress={() => onOpenChat(chat.conversationId)}
              accessibilityRole="button"
              accessibilityLabel={chat.title}
              style={({ pressed }) => [
                styles.chatRow,
                { borderBottomColor: th.border },
                i === chats.length - 1 && { borderBottomWidth: 0 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {chat.imageUrl ? (
                <Image
                  source={{ uri: chat.imageUrl }}
                  style={[styles.avatar, { backgroundColor: th.imagePlaceholder }]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: th.primarySoft }]}>
                  <Text style={[styles.avatarLetter, { color: th.primary }]}>
                    {chat.title.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.chatTitle, { color: th.text }]} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  {chat.lastMessage && (
                    <Text style={[styles.time, { color: th.textSubtle }]}>
                      {timeAgo(chat.lastMessage.createdAt, i18n.language)}
                    </Text>
                  )}
                </View>
                {body ? (
                  <Text style={[styles.preview, { color: th.textMuted }]} numberOfLines={1}>
                    {from}
                    {body}
                  </Text>
                ) : (
                  <Text style={[styles.preview, { color: th.textSubtle }]}>
                    {t("detail.property.chat_no_messages")}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={15} color={th.textSubtle} />
            </Pressable>
          );
        })}
      </View>
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
  emptyCard: {
    alignItems: "center",
  },
  emptyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  list: {
    borderTopWidth: 1,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  chatTitle: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  time: {
    fontSize: 11,
  },
  preview: {
    fontSize: 12,
    marginTop: 2,
  },
});
