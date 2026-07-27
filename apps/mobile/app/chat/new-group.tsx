import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { isProtectedName } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/hooks/useQuery";
import { chatBootstrap, createConversation } from "@/lib/chat/api";
import { MemberPicker } from "@/components/chat/MemberPicker";
import { ResultModal } from "@/components/ui";

/**
 * Nuevo grupo: nombre + selección múltiple de participantes.
 *
 * La membresía ya NO queda congelada (hay pantalla de miembros con añadir y
 * expulsar), pero elegir a todos aquí sigue siendo lo cómodo.
 */
export default function NewGroupScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });
  // El tope lo manda el servidor (incluyéndome); nunca hardcodear.
  const maxMembers = boot?.limits.maxGroupParticipants ?? 64;

  const nameTaken = isProtectedName(title);

  async function create(userIds: string[]) {
    if (creating || userIds.length === 0 || !title.trim() || nameTaken) return;
    setCreating(true);
    try {
      const c = await createConversation({ kind: "GROUP", participantIds: userIds, title: title.trim() });
      router.replace(`/chat/${c.id}` as never);
    } catch (e) {
      // Un 400 de zod trae un OBJETO en `error` → el mensaje sería
      // "[object Object]"; en ese caso, texto genérico.
      const msg = e instanceof Error ? e.message : "";
      setError(msg && !msg.startsWith("[object") ? msg : t("chat.group_create_error"));
      setCreating(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("chat.new_group") }} />
      <MemberPicker
        max={maxMembers - 1}
        totalLimit={maxMembers}
        submitLabel={t("chat.group_create")}
        submitting={creating}
        canSubmit={!!title.trim() && !nameTaken}
        onSubmit={(ids) => void create(ids)}
        // El pie cuenta en TOTAL (incluyéndome), como el tope del servidor.
        footerLabel={(n) => t("chat.members", { count: n + 1 })}
        headerExtra={
          <>
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
          </>
        }
      />
      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.group_create_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
});
