import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { newsTimeAgo } from "@/components/NewsSheet";
import { useRecord } from "@/lib/hooks/useRecord";
import { fetchRelatedChats, type RelatedChat, type RelatedRecordType } from "@/lib/records/related-chats";
import { relatedChatsText } from "@/lib/records/related-chats-ui";
import { useTheme } from "@/lib/theme";

export function RelatedChatsBlock({
  recordType,
  recordId,
  onOpenChat,
  onShare,
}: {
  recordType: RelatedRecordType;
  recordId: string;
  onOpenChat: (conversationId: string, hasPreview: boolean) => void;
  onShare: () => void;
}) {
  const chatsQ = useRecord(
    () => fetchRelatedChats(recordType, recordId),
    [recordType, recordId],
    { enabled: Boolean(recordType && recordId) }
  );

  return (
    <RelatedChatsPanel
      recordType={recordType}
      chats={chatsQ.data?.chats ?? null}
      loading={chatsQ.loading}
      onOpenChat={onOpenChat}
      onShare={onShare}
    />
  );
}

export function RelatedChatsPanel({
  recordType,
  chats,
  loading,
  onOpenChat,
  onShare,
}: {
  recordType: RelatedRecordType;
  chats: RelatedChat[] | null;
  loading: boolean;
  onOpenChat: (conversationId: string, hasPreview: boolean) => void;
  onShare: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();

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
        <Text style={[styles.emptyTitle, { color: th.text }]}>{relatedChatsText(t, recordType, "empty_title")}</Text>
        <Text style={[styles.emptyBody, { color: th.textMuted }]}>{relatedChatsText(t, recordType, "empty_body")}</Text>
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
            {relatedChatsText(t, recordType, "share_cta")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.head}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={th.primary} />
        <Text style={[styles.title, { color: th.text }]}>{relatedChatsText(t, recordType, "title")}</Text>
      </View>
      <View style={[styles.list, { borderTopColor: th.border }]}>
        {chats.map((chat, i) => {
          const body = chat.lastMessage?.body?.trim() ?? "";
          const hasPreview = !!body;
          const from =
            chat.lastMessage && chat.lastMessage.senderName
              ? `${chat.lastMessage.senderName}: `
              : "";
          return (
            <Pressable
              key={chat.conversationId}
              onPress={() => onOpenChat(chat.conversationId, hasPreview)}
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
                      {newsTimeAgo(chat.lastMessage.createdAt, t)}
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
                    {relatedChatsText(t, recordType, "no_messages")}
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
