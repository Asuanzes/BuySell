import { useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { contactDisplayName, deleteContact, saveContact, type ContactDto } from "@/lib/chat/api";
import { Avatar } from "@/components/chat/ConversationList";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";

/**
 * Lista de contactos guardados, compartida por "Nuevo chat" y la pantalla
 * Contactos. Tap = abrir chat; long-press = editar alias / eliminar (gestiona
 * su propio sheet y el modal de alias; tras mutar llama a onChanged()).
 */
export function ContactsList({
  contacts,
  creating,
  onStartChat,
  onChanged,
  onError,
  label,
}: {
  contacts: ContactDto[];
  /** userId con apertura de chat en curso (spinner en su fila). */
  creating: string | null;
  onStartChat: (userId: string) => void;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
  /** Encabezado de sección opcional (p. ej. "TUS CONTACTOS" en Nuevo chat). */
  label?: string;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [menu, setMenu] = useState<ContactDto | null>(null);
  const [aliasEditing, setAliasEditing] = useState<ContactDto | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  async function onMenuSelect(option: SheetOption) {
    const c = menu;
    setMenu(null);
    if (!c) return;
    if (option.id === "alias") {
      setAliasText(c.alias ?? "");
      setAliasEditing(c);
      return;
    }
    if (option.id === "remove") {
      try {
        await deleteContact(c.userId);
        await onChanged();
      } catch (e) {
        onError(e instanceof Error ? e.message : t("chat.action_error"));
      }
    }
  }

  async function onSaveAlias() {
    const c = aliasEditing;
    if (!c || savingAlias) return;
    setSavingAlias(true);
    try {
      await saveContact(c.userId, aliasText.trim() || null);
      await onChanged();
      setAliasEditing(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("chat.action_error"));
    } finally {
      setSavingAlias(false);
    }
  }

  return (
    <>
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.userId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          label ? <Text style={[styles.sectionLabel, { color: th.textSubtle }]}>{label}</Text> : null
        }
        renderItem={({ item }) => {
          const name = contactDisplayName(item);
          const secondary = item.user.username ? "@" + item.user.username : item.user.email ?? "";
          return (
            <Pressable
              onPress={() => onStartChat(item.userId)}
              onLongPress={() => setMenu(item)}
              delayLongPress={350}
              disabled={!!creating}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: th.surface, borderColor: th.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Avatar title={name} imageUrl={item.user.image} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: th.text }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.rowEmail, { color: th.textMuted }]} numberOfLines={1}>
                  {secondary}
                </Text>
              </View>
              {creating === item.userId ? (
                <ActivityIndicator size="small" color={th.primary} />
              ) : (
                <Ionicons name="chatbubble-outline" size={18} color={th.primary} />
              )}
            </Pressable>
          );
        }}
      />

      {/* Menú del contacto (long-press): alias / eliminar */}
      <ActionsSheet
        visible={!!menu}
        title={menu ? contactDisplayName(menu) : ""}
        options={[
          { id: "alias", icon: "pencil-outline", label: t("chat.contact_alias_edit") },
          { id: "remove", icon: "person-remove-outline", label: t("chat.menu_contact_remove"), danger: true },
        ]}
        onSelect={(o) => void onMenuSelect(o)}
        onClose={() => setMenu(null)}
      />

      {/* Editor de alias */}
      <Modal visible={!!aliasEditing} transparent animationType="fade" onRequestClose={() => setAliasEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAliasEditing(null)} />
        <View style={styles.aliasWrap} pointerEvents="box-none">
          <View style={[styles.aliasCard, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.aliasTitle, { color: th.text }]}>{t("chat.contact_alias_title")}</Text>
            <TextInput
              value={aliasText}
              onChangeText={setAliasText}
              placeholder={aliasEditing ? contactDisplayName({ ...aliasEditing, alias: null }) : ""}
              placeholderTextColor={th.textSubtle}
              maxLength={60}
              autoFocus
              style={[styles.aliasInput, { color: th.text, backgroundColor: th.bg, borderColor: th.border }]}
            />
            <Text style={[styles.aliasHint, { color: th.textSubtle }]}>{t("chat.contact_alias_hint")}</Text>
            <View style={styles.aliasActions}>
              <Pressable onPress={() => setAliasEditing(null)} style={styles.aliasBtn}>
                <Text style={{ color: th.textMuted, fontFamily: fonts.bodyMedium }}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void onSaveAlias()} disabled={savingAlias} style={styles.aliasBtn}>
                {savingAlias ? (
                  <ActivityIndicator size="small" color={th.primary} />
                ) : (
                  <Text style={{ color: th.primary, fontFamily: fonts.bodySemibold }}>{t("common.save")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    marginBottom: 8,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowName: { fontSize: 14, fontFamily: fonts.bodySemibold },
  rowEmail: { fontSize: 12 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  aliasWrap: { flex: 1, justifyContent: "center", padding: 24 },
  aliasCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  aliasTitle: { fontSize: 15, fontFamily: fonts.bodySemibold },
  aliasInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  aliasHint: { fontSize: 11 },
  aliasActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  aliasBtn: { paddingHorizontal: 12, paddingVertical: 8 },
});
