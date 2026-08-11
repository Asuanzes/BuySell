import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { fonts } from "@/lib/fonts";
import { useLanguage } from "@/lib/i18n/language-context";
import { MAX_NOTE_LENGTH, type RecordNote } from "@/lib/record-notes";
import { formatRecordCreationDate } from "@/lib/records/creation-date";
import { useTheme } from "@/lib/theme";

/** A partir de aquí se enseña cuánto queda: antes solo sería ruido. */
const COUNTER_FROM = MAX_NOTE_LENGTH - 300;

export function RecordNotesBlock({
  notes,
  loading = false,
  error = null,
  onAdd,
  onEdit,
  onDelete,
  onRetry,
}: {
  notes: RecordNote[] | null;
  loading?: boolean;
  error?: string | null;
  /** Resuelven cuando el SERVIDOR lo confirma: hasta entonces no se toca el texto. */
  onAdd: (body: string) => Promise<void>;
  onEdit: (noteId: string, body: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onRetry?: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  // Igual que RecordHistoryBlock: el bloque resuelve su idioma, no lo pide como
  // prop a las 6 fichas que lo montan.
  const { language } = useLanguage();
  const locale = language === "en" ? "en" : "es";
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
        <Text style={[styles.errorText, { color: th.text }]}>{error}</Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.smallButton,
              { backgroundColor: th.surfaceRaised, borderColor: th.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.smallButtonLabel, { color: th.text }]}>{t("common.retry")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Igual que en el checklist: la carga solo manda si aún no hay nada en
  // pantalla, para que refrescar tras guardar no haga parpadear la lista.
  if (loading && !notes) {
    return (
      <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
        <Text style={[styles.mutedText, { color: th.textMuted }]}>{t("notes.loading")}</Text>
      </View>
    );
  }

  if (!notes) return null;

  // Guardar NO limpia el texto hasta que el servidor responde: el valor entero
  // de esta pieza es no perder lo que el usuario acaba de razonar, y limpiar
  // antes de la confirmación es justo perderlo cuando falla la red.
  async function submitDraft() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAdd(body);
      setDraft("");
    } catch {
      // El padre ya avisa del error; aquí lo único importante es conservar el texto.
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    const body = editDraft.trim();
    if (!body || !editingId || busy) return;
    setBusy(true);
    try {
      await onEdit(editingId, body);
      setEditingId(null);
      setEditDraft("");
    } catch {
      // Se queda en modo edición con el texto intacto.
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(note: RecordNote) {
    Alert.alert(t("notes.delete_title"), t("notes.delete_message"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        // El padre ya avisa del fallo y RELANZA; sin este catch la promesa
        // rechazada quedaría sin dueño (unhandled rejection en RN).
        onPress: () => {
          onDelete(note.id).catch(() => {});
        },
      },
    ]);
  }

  const counterFor = (value: string) =>
    value.length >= COUNTER_FROM ? t("notes.remaining", { count: MAX_NOTE_LENGTH - value.length }) : null;

  return (
    <View style={[styles.container, { backgroundColor: th.surface, borderColor: th.border }, th.elevation.sm]}>
      <View style={styles.header}>
        <Ionicons name="create-outline" size={20} color={th.textSubtle} />
        <Text style={[styles.headerTitle, { color: th.text }]} numberOfLines={1}>
          {t("notes.title")}
        </Text>
      </View>

      {notes.length === 0 ? (
        <Text style={[styles.mutedText, { color: th.textMuted }]}>{t("notes.empty")}</Text>
      ) : (
        <View style={styles.entries}>
          {notes.map((note) => {
            const date = formatRecordCreationDate(note.createdAt, locale);
            const edited = note.updatedAt !== note.createdAt;
            const isEditing = editingId === note.id;

            return (
              <View key={note.id} style={[styles.entry, { borderColor: th.border }]}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.entryDate, { color: th.textSubtle }]}>
                    {[date, edited ? t("notes.edited") : null].filter(Boolean).join(" · ")}
                  </Text>
                  {isEditing ? null : (
                    <View style={styles.entryActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("common.edit")}
                        hitSlop={8}
                        onPress={() => {
                          setEditingId(note.id);
                          setEditDraft(note.body);
                        }}
                      >
                        <Ionicons name="pencil-outline" size={16} color={th.textSubtle} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("common.delete")}
                        hitSlop={8}
                        onPress={() => confirmDelete(note)}
                      >
                        <Ionicons name="trash-outline" size={16} color={th.textSubtle} />
                      </Pressable>
                    </View>
                  )}
                </View>

                {isEditing ? (
                  <>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: th.surfaceRaised, borderColor: th.border, color: th.text },
                      ]}
                      value={editDraft}
                      onChangeText={setEditDraft}
                      multiline
                      maxLength={MAX_NOTE_LENGTH}
                      autoFocus
                      placeholderTextColor={th.textSubtle}
                    />
                    {counterFor(editDraft) ? (
                      <Text style={[styles.counter, { color: th.textSubtle }]}>{counterFor(editDraft)}</Text>
                    ) : null}
                    <View style={styles.editActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                        style={({ pressed }) => [
                          styles.smallButton,
                          { backgroundColor: th.surface, borderColor: th.border },
                          (pressed || busy) && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={[styles.smallButtonLabel, { color: th.text }]}>{t("common.cancel")}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || !editDraft.trim()}
                        onPress={() => void submitEdit()}
                        style={({ pressed }) => [
                          styles.smallButton,
                          { backgroundColor: th.surfaceRaised, borderColor: th.border },
                          (pressed || busy || !editDraft.trim()) && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={[styles.smallButtonLabel, { color: th.text }]}>
                          {busy ? t("common.saving") : t("common.save")}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.entryBody, { color: th.text }]}>{note.body}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {editingId ? null : (
        <View style={styles.composer}>
          <TextInput
            style={[styles.input, { backgroundColor: th.surfaceRaised, borderColor: th.border, color: th.text }]}
            value={draft}
            onChangeText={setDraft}
            placeholder={t("notes.add_placeholder")}
            placeholderTextColor={th.textSubtle}
            multiline
            // El servidor RECHAZA por encima del tope en vez de recortar, así que
            // el freno tiene que estar aquí: ver el límite es mejor que un 400.
            maxLength={MAX_NOTE_LENGTH}
          />
          <View style={styles.composerFooter}>
            <Text style={[styles.counter, { color: th.textSubtle }]}>{counterFor(draft) ?? ""}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy || !draft.trim()}
              onPress={() => void submitDraft()}
              style={({ pressed }) => [
                styles.smallButton,
                { backgroundColor: th.surfaceRaised, borderColor: th.border },
                (pressed || busy || !draft.trim()) && { opacity: 0.6 },
              ]}
            >
              <Text style={[styles.smallButtonLabel, { color: th.text }]}>
                {busy ? t("common.saving") : t("notes.add")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headerTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.bodySemibold },
  entries: { gap: 10 },
  entry: { borderTopWidth: 1, paddingTop: 8 },
  entryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  entryDate: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  entryActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  entryBody: { marginTop: 4, fontSize: 15, lineHeight: 21, fontFamily: fonts.body },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  composer: { marginTop: 12 },
  composerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 },
  counter: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.body,
    textAlignVertical: "top",
  },
  mutedText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  errorText: { marginBottom: 10, fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  smallButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallButtonLabel: { fontSize: 14, fontFamily: fonts.bodySemibold },
});
