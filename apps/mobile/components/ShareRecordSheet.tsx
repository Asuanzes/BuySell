import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { RecordType } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { api, ApiError } from "@/lib/api";
import { categoryColor, RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { listContacts, contactDisplayName, type ContactDto } from "@/lib/chat/api";

/**
 * Hoja "Enviar a un chat" en dos pasos, sin pantalla de confirmación:
 *  1. elegir destinatario (@username o contacto),
 *  2. PREVISUALIZACIÓN de la tarjeta + mensaje opcional → Enviar → salta
 *     directamente al chat donde aterrizó.
 * La tarjeta llega al chat DIRECTO habitual (nunca una conversación aparte) y
 * da acceso de solo lectura al registro.
 */
export function ShareRecordSheet({
  visible,
  onClose,
  type,
  id,
  preview,
}: {
  visible: boolean;
  onClose: () => void;
  type: string;
  id: string;
  /** Datos locales del registro para la previsualización (la ficha los tiene). */
  preview?: { title: string; subtitle?: string | null; imageUrl?: string | null };
}) {
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Paso 2: destinatario elegido (handle sin @) + etiqueta visible. */
  const [recipient, setRecipient] = useState<{ handle: string; label: string } | null>(null);
  const [message, setMessage] = useState("");

  const accent = categoryColor(type as RecordType, dark) ?? th.primary;
  const icon = RECORD_TYPE_CONFIG[type as RecordType]?.icon ?? "bookmark-outline";

  useEffect(() => {
    if (!visible) return;
    setUsername("");
    setError(null);
    setRecipient(null);
    setMessage("");
    listContacts()
      .then((c) => setContacts(c.filter((x) => x.user.username)))
      .catch(() => setContacts([]));
  }, [visible]);

  function pick(handle: string, label?: string) {
    const u = handle.replace(/^@/, "").trim();
    if (!u) return;
    setError(null);
    setRecipient({ handle: u, label: label ?? "@" + u });
  }

  async function send() {
    if (!recipient || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; conversationId?: string | null }>(`/api/records/${id}/share`, {
        method: "POST",
        body: JSON.stringify({ type, username: recipient.handle, message: message.trim() || null }),
      });
      onClose();
      // Directo al chat donde aterrizó la tarjeta (sin pantalla intermedia).
      if (res.conversationId) router.push(`/chat/${res.conversationId}` as never);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { error?: string } | undefined)?.error : null;
      setError(msg || t("share.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KAV: el teclado empuja la hoja hacia arriba (Android edge-to-edge
          ignora adjustResize → "padding" en ambas plataformas, como el
          composer del chat). El velo es HERMANO de la hoja, no padre: tocar
          dentro de la hoja jamás burbujea al onClose del fondo. */}
      <KeyboardAvoidingView style={styles.kav} behavior="padding">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        />
        <View style={[styles.sheet, { backgroundColor: th.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grabber, { backgroundColor: th.border }]} />
          <View style={styles.titleRow}>
            {recipient && (
              <Pressable onPress={() => setRecipient(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
                <Ionicons name="chevron-back" size={22} color={th.primary} />
              </Pressable>
            )}
            <Text style={[styles.title, { color: th.text }]}>{t("share.title")}</Text>
          </View>

          {recipient ? (
            <>
              {/* Paso 2: destinatario + previsualización + mensaje → Enviar */}
              <View style={[styles.toRow, { borderColor: th.border }]}>
                <Text style={[styles.toLabel, { color: th.textSubtle }]}>{t("share.to")}</Text>
                <Text style={[styles.toValue, { color: th.text }]} numberOfLines={1}>
                  {recipient.label}
                </Text>
              </View>

              <View style={[styles.previewCard, { borderColor: th.border, backgroundColor: th.bg }]}>
                <View style={[styles.previewBar, { backgroundColor: accent }]} />
                {preview?.imageUrl ? (
                  <Image
                    source={{ uri: preview.imageUrl }}
                    style={[styles.previewImg, { backgroundColor: th.imagePlaceholder }]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.previewImg, { backgroundColor: accent + "22", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name={icon} size={22} color={accent} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[styles.previewTitle, { color: th.text }]} numberOfLines={2}>
                    {preview?.title ?? t("share.title")}
                  </Text>
                  {!!preview?.subtitle && (
                    <Text style={[styles.previewSub, { color: th.textMuted }]} numberOfLines={1}>
                      {preview.subtitle}
                    </Text>
                  )}
                </View>
                <View style={[styles.previewBadge, { backgroundColor: accent + "22" }]}>
                  <Ionicons name={icon} size={15} color={accent} />
                </View>
              </View>

              <View style={[styles.inputRow, { borderColor: th.border }]}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t("share.message_placeholder")}
                  placeholderTextColor={th.textSubtle}
                  multiline
                  maxLength={1000}
                  style={[styles.input, { color: th.text }]}
                />
                <Pressable
                  disabled={busy}
                  onPress={() => void send()}
                  accessibilityRole="button"
                  accessibilityLabel={t("share.send")}
                  style={[styles.sendBtn, { backgroundColor: th.primary, opacity: busy ? 0.5 : 1 }]}
                >
                  {busy ? (
                    <ActivityIndicator color={th.primaryFg} />
                  ) : (
                    <Ionicons name="send" size={16} color={th.primaryFg} />
                  )}
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          ) : (
            <>
              {/* Paso 1: elegir destinatario */}
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
                  onSubmitEditing={() => pick(username)}
                  returnKeyType="next"
                />
                <Pressable
                  disabled={!username.trim()}
                  onPress={() => pick(username)}
                  style={[styles.sendBtn, { backgroundColor: th.primary, opacity: !username.trim() ? 0.5 : 1 }]}
                >
                  <Ionicons name="arrow-forward" size={16} color={th.primaryFg} />
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {contacts.length > 0 && (
                <>
                  <Text style={[styles.contactsLabel, { color: th.textSubtle }]}>{t("share.contacts")}</Text>
                  <ScrollView style={styles.contactsList} keyboardShouldPersistTaps="handled">
                    {contacts.map((c) => (
                      <Pressable
                        key={c.userId}
                        onPress={() => pick(c.user.username as string, contactDisplayName(c))}
                        style={styles.contactRow}
                      >
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 13, lineHeight: 18 },
  toRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  toLabel: { fontSize: 13 },
  toValue: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    overflow: "hidden",
  },
  previewBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  previewImg: { width: 54, height: 54, borderRadius: 8, marginLeft: 4 },
  previewTitle: { fontSize: 14, fontWeight: "600" },
  previewSub: { fontSize: 12 },
  previewBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8, maxHeight: 90 },
  sendBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, minWidth: 48, alignItems: "center", justifyContent: "center" },
  error: { color: "#B91C1C", fontSize: 13, marginTop: 6 },
  contactsLabel: { fontSize: 12, marginTop: 14, marginBottom: 4 },
  contactsList: { maxHeight: 260 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  contactName: { flex: 1, fontSize: 15 },
  contactHandle: { fontSize: 13 },
});
