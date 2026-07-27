import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { isProtectedName } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import {
  chatBootstrap,
  contactDisplayName,
  createConversation,
  listContacts,
  searchChatUsers,
  type ChatUser,
} from "@/lib/chat/api";
import { Avatar } from "@/components/chat/ConversationList";
import { isOfficialUsername } from "@/components/chat/VerifiedBadge";
import { Button, EmptyState, ResultModal } from "@/components/ui";

/**
 * Nuevo grupo: nombre + selección MÚLTIPLE de participantes (contactos
 * guardados y búsqueda exacta por @usuario/email, igual que "Nuevo chat").
 *
 * La membresía queda FIJA al crear: todavía no hay endpoint para añadir o
 * expulsar después, así que la pantalla insiste en elegir a todos de una vez.
 */

/** Fila unificada: contactos y resultados de búsqueda se pintan igual. */
type Candidate = { id: string; name: string; secondary: string; image: string | null };

function fromUser(u: ChatUser): Candidate {
  return {
    id: u.id,
    name: u.name?.trim() || (u.username ? "@" + u.username : "") || u.email?.split("@")[0] || "—",
    secondary: u.username ? "@" + u.username : u.email ?? "",
    image: u.image,
  };
}

export default function NewGroupScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Map (no Set): las pastillas necesitan nombre y avatar de quien ya no está
  // en la lista visible (al buscar, los contactos desaparecen).
  const [selected, setSelected] = useState<Map<string, Candidate>>(new Map());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts } = useQuery(listContacts, []);
  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });
  // El tope lo manda el servidor (incluyéndome); nunca hardcodear.
  const maxInvitees = (boot?.limits.maxGroupParticipants ?? 64) - 1;
  const full = selected.size >= maxInvitees;

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

  // El bot @Nidokey queda fuera: no responde en grupos (su agente es solo 1:1)
  // y su presencia pintaba el grupo como "cuenta verificada".
  const candidates: Candidate[] = useMemo(() => {
    if (results) return results.filter((u) => !isOfficialUsername(u.username)).map(fromUser);
    return (contacts ?? [])
      .filter((c) => !isOfficialUsername(c.user.username))
      .map((c) => ({
        id: c.userId,
        name: contactDisplayName(c),
        secondary: c.user.username ? "@" + c.user.username : c.user.email ?? "",
        image: c.user.image,
      }));
  }, [results, contacts]);

  function toggle(c: Candidate) {
    if (!selected.has(c.id) && full) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  }

  const nameTaken = isProtectedName(title);
  const canCreate = title.trim().length > 0 && selected.size > 0 && !nameTaken;

  async function create() {
    if (creating || !canCreate) return;
    setCreating(true);
    try {
      const c = await createConversation({
        kind: "GROUP",
        participantIds: [...selected.keys()],
        title: title.trim(),
      });
      router.replace(`/chat/${c.id}` as never);
    } catch (e) {
      // Un 400 de zod trae un OBJETO en `error` → el mensaje sería
      // "[object Object]"; en ese caso, texto genérico.
      const msg = e instanceof Error ? e.message : "";
      setError(msg && !msg.startsWith("[object") ? msg : t("chat.group_create_error"));
      setCreating(false);
    }
  }

  const header = (
    <View style={styles.header}>
      <View style={[styles.field, { backgroundColor: th.surface, borderColor: nameTaken ? th.dangerFg : th.border }]}>
        <Ionicons name="people-outline" size={16} color={th.textSubtle} />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("chat.group_name_placeholder")}
          placeholderTextColor={th.textSubtle}
          maxLength={80}
          autoFocus
          style={[styles.fieldInput, { color: th.text }]}
        />
      </View>
      {nameTaken && <Text style={[styles.warn, { color: th.dangerFg }]}>{t("chat.group_name_taken")}</Text>}

      {selected.size > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[...selected.values()].map((c) => (
            <Pressable
              key={c.id}
              onPress={() => toggle(c)}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              style={[styles.chip, { backgroundColor: th.surface, borderColor: th.border }]}
            >
              <Avatar title={c.name} imageUrl={c.image} size={22} />
              <Text style={[styles.chipText, { color: th.text }]} numberOfLines={1}>
                {c.name}
              </Text>
              <Ionicons name="close-circle" size={15} color={th.textSubtle} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[styles.field, { backgroundColor: th.surface, borderColor: th.border }]}>
        <Ionicons name="search" size={16} color={th.textSubtle} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("chat.search_placeholder")}
          placeholderTextColor={th.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.fieldInput, { color: th.text }]}
        />
        {searching && <ActivityIndicator size="small" color={th.primary} />}
      </View>
      {/* El tope se enuncia en TOTAL (incluyéndome), igual que el contador del
          pie: si no, el aviso decía 63 y el pie 64. */}
      {full && (
        <Text style={[styles.warn, { color: th.textSubtle }]}>
          {t("chat.group_max_reached", { count: maxInvitees + 1 })}
        </Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: th.bg }]} behavior="padding">
      <Stack.Screen options={{ title: t("chat.new_group") }} />
      <FlatList
        data={candidates}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          results ? (
            <EmptyState icon="person-outline" title={t("chat.no_users_title")} description={t("chat.no_users_desc")} />
          ) : contacts ? (
            // Solo con los contactos YA cargados: con `contacts` a null (primer
            // fetch) se veía un parpadeo de "sin contactos guardados".
            <EmptyState
              icon="people-outline"
              title={t("chat.contacts_empty_title")}
              description={t("chat.group_hint")}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const checked = selected.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: !checked && full }}
              accessibilityLabel={item.name}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: th.surface, borderColor: checked ? th.primary : th.border },
                (!checked && full) && { opacity: 0.45 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Avatar title={item.name} imageUrl={item.image} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: th.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowSecondary, { color: th.textMuted }]} numberOfLines={1}>
                  {item.secondary}
                </Text>
              </View>
              <Ionicons
                name={checked ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={checked ? th.primary : th.textSubtle}
              />
            </Pressable>
          );
        }}
      />

      <View
        style={[
          styles.footer,
          { backgroundColor: th.surface, borderColor: th.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Text style={[styles.count, { color: th.textMuted }]}>
          {t("chat.members", { count: selected.size + 1 })}
        </Text>
        <Button
          label={t("chat.group_create")}
          icon="people-outline"
          onPress={() => void create()}
          loading={creating}
          disabled={!canCreate}
        />
      </View>

      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.group_create_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 8, paddingBottom: 6 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  fieldInput: { flex: 1, fontSize: 14, padding: 0 },
  warn: { fontSize: 11, marginLeft: 2 },
  chips: { gap: 6, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 190,
  },
  chipText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.bodyMedium },
  list: { padding: 12, paddingBottom: 24 },
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
  rowSecondary: { fontSize: 12 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1 },
  count: { fontSize: 12, textAlign: "center" },
});
