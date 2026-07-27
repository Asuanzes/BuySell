import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { contactDisplayName, listContacts, searchChatUsers, type ChatUser } from "@/lib/chat/api";
import { Avatar } from "@/components/chat/ConversationList";
import { isOfficialUsername } from "@/components/chat/VerifiedBadge";
import { Button, EmptyState } from "@/components/ui";

/**
 * Selector MÚLTIPLE de personas, compartido por "Nuevo grupo" y "Añadir
 * miembros": contactos guardados + búsqueda exacta por @usuario/email.
 *
 * El bot @Nidokey queda siempre fuera (no responde en grupos y su presencia
 * pintaba la conversación como cuenta verificada).
 */

/** Fila unificada: contactos y resultados de búsqueda se pintan igual. */
export type Candidate = { id: string; name: string; secondary: string; image: string | null };

function fromUser(u: ChatUser): Candidate {
  return {
    id: u.id,
    name: u.name?.trim() || (u.username ? "@" + u.username : "") || u.email?.split("@")[0] || "—",
    secondary: u.username ? "@" + u.username : u.email ?? "",
    image: u.image,
  };
}

export function MemberPicker({
  max,
  totalLimit,
  excludeIds,
  submitLabel,
  submitIcon = "people-outline",
  submitting,
  canSubmit = true,
  onSubmit,
  footerLabel,
  headerExtra,
}: {
  /** Cuántas personas caben TODAVÍA (lo dicta el servidor, no la app). */
  max: number;
  /** El tope REAL del grupo, solo para el aviso: `max` son huecos libres, y
   *  enunciarlo decía "máximo 3 participantes" en un grupo de 61. */
  totalLimit: number;
  /** Ya son miembros: no se ofrecen. */
  excludeIds?: ReadonlySet<string>;
  submitLabel: string;
  submitIcon?: keyof typeof Ionicons.glyphMap;
  submitting: boolean;
  /** Condición extra del consumidor (p. ej. que el grupo tenga nombre). */
  canSubmit?: boolean;
  onSubmit: (userIds: string[]) => void;
  /** Texto del pie; recibe cuántos llevo seleccionados. */
  footerLabel: (selected: number) => string;
  /** Contenido propio del consumidor sobre el buscador (p. ej. el nombre). */
  headerExtra?: ReactNode;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Map (no Set): las pastillas necesitan nombre y avatar de quien ya no está
  // en la lista visible (al buscar, los contactos desaparecen).
  const [selected, setSelected] = useState<Map<string, Candidate>>(new Map());

  const { data: contacts } = useQuery(listContacts, []);
  const full = selected.size >= max;

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

  const candidates: Candidate[] = useMemo(() => {
    const skip = (id: string, username: string | null) => isOfficialUsername(username) || !!excludeIds?.has(id);
    if (results) return results.filter((u) => !skip(u.id, u.username)).map(fromUser);
    return (contacts ?? [])
      .filter((c) => !skip(c.userId, c.user.username))
      .map((c) => ({
        id: c.userId,
        name: contactDisplayName(c),
        secondary: c.user.username ? "@" + c.user.username : c.user.email ?? "",
        image: c.user.image,
      }));
  }, [results, contacts, excludeIds]);

  function toggle(c: Candidate) {
    if (!selected.has(c.id) && full) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  }

  const header = (
    <View style={styles.header}>
      {headerExtra}

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
      {full && (
        <Text style={[styles.warn, { color: th.textSubtle }]}>
          {t("chat.group_max_reached", { count: totalLimit })}
        </Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: th.bg }]} behavior="padding">
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
            <EmptyState icon="people-outline" title={t("chat.contacts_empty_title")} description={t("chat.group_hint")} />
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
                !checked && full && { opacity: 0.45 },
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
        <Text style={[styles.count, { color: th.textMuted }]}>{footerLabel(selected.size)}</Text>
        <Button
          label={submitLabel}
          icon={submitIcon}
          onPress={() => onSubmit([...selected.keys()])}
          loading={submitting}
          disabled={selected.size === 0 || !canSubmit}
        />
      </View>
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
