import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import type { MessageDto } from "@/lib/chat/api";

/**
 * Sheet de acciones sobre un mensaje (long-press): reacciones rápidas + picker
 * completo de emojis + responder / copiar / compartir / editar / denunciar /
 * eliminar. Todo JS (Modal nativo) → entregable por OTA.
 */

// Portapapeles: módulo nativo OPCIONAL (mismo blindaje que expo-audio en
// media.ts). Una OTA sobre un binario sin ExpoClipboard no crashea: la fila
// "Copiar" no aparece hasta el siguiente build nativo.
let clipboardModule: { setStringAsync: (s: string) => Promise<boolean> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require("expo-clipboard");
} catch {
  clipboardModule = null;
}
export const clipboardAvailable = (): boolean => !!clipboardModule;

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Set curado (~120) para el picker: sin dependencia nativa ni JSON gigante. */
const EMOJIS =
  "😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤔 🤗 🥳 😅 😉 😢 😭 😡 🤯 😴 🥺 🙃 😇 🤭 🫡 " +
  "👍 👎 👏 🙌 🙏 🤝 💪 ✌️ 🤞 👌 🫶 👋 🤙 ✊ ☝️ 🖐️ " +
  "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💖 💘 💝 " +
  "🐶 🐱 🦁 🐼 🦄 🐝 🌸 🌵 🌊 ☀️ 🌙 ⭐ 🔥 ❄️ 🌈 " +
  "🍕 🍔 🌮 🍣 🍜 🍩 🍪 🎂 🍺 🍷 ☕ 🥑 🍓 🍉 " +
  "⚽ 🏀 🎮 🎲 🎸 🎧 🎁 🎉 🏆 🚀 ✈️ 🚗 🏠 💡 📱 💻 📚 ✏️ 💶 💰 🔑 ⏰ " +
  "✅ ❌ ⚠️ ❓ ❗ 💯 ♻️ ➕ ➖ ✨ 💤 🚫";
const EMOJI_LIST = EMOJIS.split(" ").filter(Boolean);

export type MessageAction = "reply" | "edit" | "report" | "delete";

export function MessageActionsSheet({
  message,
  canEdit,
  canDelete,
  canReport,
  onReact,
  onAction,
  onClose,
}: {
  message: MessageDto | null;
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  onReact: (emoji: string) => void;
  onAction: (action: MessageAction) => void;
  onClose: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [picker, setPicker] = useState(false);
  const myEmoji = message?.reactions.find((r) => r.mine)?.emoji ?? null;

  // Cada mensaje abre el sheet en su vista inicial (filas, no picker).
  useEffect(() => setPicker(false), [message?.id]);

  const body = message?.body ?? null;

  async function onCopy() {
    if (!body || !clipboardModule) return;
    try {
      await clipboardModule.setStringAsync(body);
    } catch {
      // sin drama: el sheet se cierra igual
    }
    onClose();
  }

  async function onShare() {
    if (!body) return;
    onClose();
    try {
      await Share.share({ message: body });
    } catch {
      // usuario canceló o no hay destino: nada que hacer
    }
  }

  const rows: { id: string; icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; run: () => void }[] =
    [];
  rows.push({ id: "reply", icon: "arrow-undo-outline", label: t("chat.msg_reply"), run: () => onAction("reply") });
  if (body && clipboardAvailable()) {
    rows.push({ id: "copy", icon: "copy-outline", label: t("chat.msg_copy"), run: () => void onCopy() });
  }
  if (body) {
    rows.push({ id: "share", icon: "share-social-outline", label: t("chat.msg_share"), run: () => void onShare() });
  }
  if (canEdit) {
    rows.push({ id: "edit", icon: "pencil-outline", label: t("chat.msg_edit"), run: () => onAction("edit") });
  }
  if (canReport) {
    rows.push({ id: "report", icon: "flag-outline", label: t("chat.msg_report"), danger: true, run: () => onAction("report") });
  }
  if (canDelete) {
    rows.push({ id: "delete", icon: "trash-outline", label: t("chat.delete_title"), danger: true, run: () => onAction("delete") });
  }

  return (
    <Modal
      visible={!!message}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => (picker ? setPicker(false) : onClose())}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("common.cancel")} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: th.surface, borderColor: th.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: th.border }]} />

        {picker ? (
          <>
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setPicker(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
                <Ionicons name="chevron-back" size={22} color={th.primary} />
              </Pressable>
              <Text style={[styles.pickerTitle, { color: th.text }]}>{t("chat.more_reactions")}</Text>
            </View>
            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerGrid}>
              {EMOJI_LIST.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => onReact(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.react_label")}
                  style={({ pressed }) => [
                    styles.pickerBtn,
                    myEmoji === emoji && { backgroundColor: th.primarySoft },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.pickerEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.reactRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => onReact(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.react_label")}
                  style={({ pressed }) => [
                    styles.reactBtn,
                    myEmoji === emoji && { backgroundColor: th.primarySoft },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.reactEmoji}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t("chat.more_reactions")}
                style={({ pressed }) => [styles.reactBtn, { backgroundColor: th.bg }, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add" size={22} color={th.textMuted} />
              </Pressable>
            </View>
            {rows.map((r) => (
              <Pressable
                key={r.id}
                onPress={r.run}
                accessibilityRole="button"
                accessibilityLabel={r.label}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: th.imagePlaceholder }]}
              >
                <View style={[styles.iconWrap, { backgroundColor: r.danger ? th.dangerSoft : th.primarySoft }]}>
                  <Ionicons name={r.icon} size={18} color={r.danger ? th.dangerFg : th.primary} />
                </View>
                <Text style={[styles.rowLabel, { color: r.danger ? th.dangerFg : th.text }]}>{r.label}</Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 10 },
  reactRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 6, marginBottom: 4 },
  reactBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactEmoji: { fontSize: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontFamily: fonts.bodyMedium },
  pickerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  pickerTitle: { fontSize: 15, fontFamily: fonts.bodySemibold },
  pickerScroll: { maxHeight: 320 },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingBottom: 8 },
  pickerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pickerEmoji: { fontSize: 26 },
});
