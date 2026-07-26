import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { api, ApiError } from "@/lib/api";
import { listContacts, contactDisplayName, type ContactDto } from "@/lib/chat/api";

/**
 * Hoja para compartir un registro (acceso de SOLO LECTURA) con otra persona,
 * por su @username o eligiendo un contacto. Reutilizable desde cualquier ficha:
 *   const [open, setOpen] = useState(false);
 *   <ShareRecordSheet visible={open} onClose={() => setOpen(false)} type="property" id={id} />
 * Llama a POST /api/records/:id/share { type, username }.
 */
export function ShareRecordSheet({
  visible,
  onClose,
  type,
  id,
}: {
  visible: boolean;
  onClose: () => void;
  type: string;
  id: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Conversación donde aterrizó la tarjeta (para el botón "Ver el chat").
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setUsername("");
    setError(null);
    setDone(null);
    setConversationId(null);
    listContacts()
      .then((c) => setContacts(c.filter((x) => x.user.username)))
      .catch(() => setContacts([]));
  }, [visible]);

  async function submit(handle: string) {
    const u = handle.replace(/^@/, "").trim();
    if (!u || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        sharedWith?: { username: string | null; name: string | null };
        conversationId?: string | null;
      }>(`/api/records/${id}/share`, { method: "POST", body: JSON.stringify({ type, username: u }) });
      setDone(res.sharedWith?.username ? "@" + res.sharedWith.username : "@" + u);
      setConversationId(res.conversationId ?? null);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { error?: string } | undefined)?.error : null;
      setError(msg || t("share.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: th.surface, paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={[styles.grabber, { backgroundColor: th.border }]} />
          <Text style={[styles.title, { color: th.text }]}>{t("share.title")}</Text>

          {done ? (
            <View style={styles.doneBox}>
              <Ionicons name="chatbubble-ellipses" size={44} color={th.primary} />
              <Text style={[styles.doneText, { color: th.text }]}>{t("share.done", { user: done })}</Text>
              {conversationId && (
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push(`/chat/${conversationId}` as never);
                  }}
                  style={[styles.primaryBtn, { backgroundColor: th.primary }]}
                >
                  <Text style={[styles.primaryBtnText, { color: th.primaryFg }]}>{t("share.view_chat")}</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={styles.ghostBtn}>
                <Text style={[styles.primaryBtnText, { color: th.textMuted }]}>{t("common.understood")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.hint, { color: th.textMuted }]}>{t("share.hint")}</Text>

              <View style={[styles.inputRow, { borderColor: th.border }]}>
                <Text style={{ color: th.textSubtle, fontSize: 15 }}>@</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder={t("share.username_placeholder")}
                  placeholderTextColor={th.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: th.text }]}
                  onSubmitEditing={() => submit(username)}
                  returnKeyType="send"
                />
                <Pressable
                  disabled={busy || !username.trim()}
                  onPress={() => submit(username)}
                  style={[styles.sendBtn, { backgroundColor: th.primary, opacity: busy || !username.trim() ? 0.5 : 1 }]}
                >
                  {busy ? (
                    <ActivityIndicator color={th.primaryFg} />
                  ) : (
                    <Text style={[styles.sendText, { color: th.primaryFg }]}>{t("share.send")}</Text>
                  )}
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {contacts.length > 0 && (
                <>
                  <Text style={[styles.contactsLabel, { color: th.textSubtle }]}>{t("share.contacts")}</Text>
                  <ScrollView style={styles.contactsList} keyboardShouldPersistTaps="handled">
                    {contacts.map((c) => (
                      <Pressable key={c.userId} onPress={() => submit(c.user.username as string)} style={styles.contactRow}>
                        <Ionicons name="person-circle-outline" size={30} color={th.textMuted} />
                        <Text style={[styles.contactName, { color: th.text }]} numberOfLines={1}>
                          {contactDisplayName(c)}
                        </Text>
                        <Text style={[styles.contactHandle, { color: th.textSubtle }]}>@{c.user.username}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8 },
  sendBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  sendText: { fontSize: 14, fontWeight: "600" },
  error: { color: "#B91C1C", fontSize: 13, marginTop: 6 },
  contactsLabel: { fontSize: 12, marginTop: 14, marginBottom: 4 },
  contactsList: { maxHeight: 260 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  contactName: { flex: 1, fontSize: 15 },
  contactHandle: { fontSize: 13 },
  doneBox: { alignItems: "center", gap: 12, paddingVertical: 16 },
  doneText: { fontSize: 16, textAlign: "center" },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
  ghostBtn: { paddingHorizontal: 24, paddingVertical: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: "600" },
});
