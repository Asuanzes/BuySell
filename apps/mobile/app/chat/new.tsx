import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import {
  chatBootstrap,
  createConversation,
  listContacts,
  saveContact,
  searchChatUsers,
  type ChatUser,
} from "@/lib/chat/api";
import { Avatar } from "@/components/chat/ConversationList";
import { ContactsList } from "@/components/chat/ContactsList";
import { EmptyState, ResultModal } from "@/components/ui";

/**
 * Nuevo chat: tus contactos guardados arriba (sin buscar) y búsqueda EXACTA por
 * @usuario/email para encontrar a alguien nuevo (debounce 300 ms). Desde un
 * resultado se puede guardar como contacto; la lista de contactos (con alias /
 * eliminar en long-press) es el componente compartido ContactsList.
 */
export default function NewChatScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts, refetch: refetchContacts } = useQuery(listContacts, []);
  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults(null);
      setSearching(false); // borrar hasta <3 caracteres dejaba el spinner girando
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        setResults(await searchChatUsers(query));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  async function startChat(userId: string) {
    if (creating) return;
    setCreating(userId);
    try {
      // Siempre el chat GENERAL con esa persona (los registros viajan como
      // tarjeta-mensaje, nunca como conversación aparte → sin duplicados).
      const c = await createConversation({ kind: "DIRECT", participantIds: [userId] });
      router.replace(`/chat/${c.id}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.create_error"));
      setCreating(null);
    }
  }

  async function onSaveContact(user: ChatUser) {
    try {
      await saveContact(user.id);
      await refetchContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  const contactIds = new Set((contacts ?? []).map((c) => c.userId));
  const showContacts = !results && (contacts?.length ?? 0) > 0;

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ title: t("chat.new_chat") }} />

      {/* Grupos: entrada arriba del buscador (patrón WhatsApp/Telegram). Oculta
          si el servidor los tiene apagados — si no, el usuario acabaría en un
          403 "Grupos desactivados" después de elegir a todo el mundo. */}
      {boot?.flags.groups !== false && (
        <Pressable
          onPress={() => router.push("/chat/new-group" as never)}
          accessibilityRole="button"
          accessibilityLabel={t("chat.new_group")}
          style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.7 }]}
        >
          <View style={[styles.groupIcon, { backgroundColor: th.primarySoft }]}>
            <Ionicons name="people-outline" size={20} color={th.primary} />
          </View>
          <Text style={[styles.groupLabel, { color: th.text }]}>{t("chat.new_group")}</Text>
          <Ionicons name="chevron-forward" size={16} color={th.textSubtle} />
        </Pressable>
      )}

      <View style={[styles.searchBox, { backgroundColor: th.surface, borderColor: th.border }]}>
        <Ionicons name="search" size={16} color={th.textSubtle} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("chat.search_placeholder")}
          placeholderTextColor={th.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[styles.searchInput, { color: th.text }]}
        />
        {searching && <ActivityIndicator size="small" color={th.primary} />}
      </View>

      {results && results.length === 0 && !searching && (
        <EmptyState icon="person-outline" title={t("chat.no_users_title")} description={t("chat.no_users_desc")} />
      )}
      {!results && !showContacts && (
        <Text style={[styles.hint, { color: th.textSubtle }]}>{t("chat.search_hint")}</Text>
      )}

      {/* Resultados de búsqueda exacta */}
      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const name =
              item.name?.trim() || (item.username ? "@" + item.username : null) || item.email?.split("@")[0] || "—";
            const secondary = item.username ? "@" + item.username : item.email ?? "";
            return (
              <Pressable
                onPress={() => void startChat(item.id)}
                disabled={!!creating}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: th.surface, borderColor: th.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Avatar title={name} imageUrl={item.image} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: th.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.rowEmail, { color: th.textMuted }]} numberOfLines={1}>
                    {secondary}
                  </Text>
                </View>
                {!contactIds.has(item.id) && (
                  <Pressable
                    onPress={() => void onSaveContact(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("chat.menu_contact_save")}
                    style={styles.rowAction}
                  >
                    <Ionicons name="person-add-outline" size={18} color={th.textMuted} />
                  </Pressable>
                )}
                {creating === item.id ? (
                  <ActivityIndicator size="small" color={th.primary} />
                ) : (
                  <Ionicons name="chatbubble-outline" size={18} color={th.primary} />
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* Contactos guardados (cuando no hay búsqueda activa) */}
      {showContacts && (
        <ContactsList
          contacts={contacts ?? []}
          creating={creating}
          onStartChat={(userId) => void startChat(userId)}
          onChanged={refetchContacts}
          onError={setError}
          label={t("chat.contacts_title")}
        />
      )}

      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.create_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 14 },
  groupIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  groupLabel: { flex: 1, fontSize: 15, fontFamily: fonts.bodySemibold },
  hint: { fontSize: 12, textAlign: "center", marginTop: 8, paddingHorizontal: 24 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
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
  rowAction: { padding: 4 },
});
