import { useEffect, useRef, useState } from "react";
import { fonts } from "@/lib/fonts";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import RNShare from "react-native-share";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type BaseRecord, type Book, metaField } from "@nidokey/shared";
import { api } from "@/lib/api";
import { fetchBookSubcategories, type BookSubcategory } from "@/lib/book-subcategories";
import { useRecord } from "@/lib/hooks/useRecord";
import { useTheme } from "@/lib/theme";
import { ShareOpenActions } from "@/components/ShareOpenActions";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";
import { AddToDecisionSheet } from "@/components/AddToDecisionSheet";
import { BookSubcategoriesSheet } from "@/components/BookSubcategoriesSheet";

/**
 * Ficha de un libro guardado. Lee el `Book` completo de `meta.book` (lo guarda
 * el backend al importar desde Google Books) y muestra portada, ficha y sinopsis.
 * Botón para abrir el libro en la web del proveedor (detailUrl).
 */
export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: record, error, loading } = useRecord<BaseRecord>(
    () => api<BaseRecord>(`/api/records/${id}?type=book`),
    [id]
  );
  const [descExpanded, setDescExpanded] = useState(false);
  const [shareChatOpen, setShareChatOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  // Comentario propio del usuario (meta.userNotes). Sin caja a la vista: si no hay,
  // solo un "＋ Añadir comentario"; al tocar aparece el editor.
  const [note, setNote] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // C7: subcategorías personalizadas (solo libros propios).
  const [subcats, setSubcats] = useState<BookSubcategory[] | null>(null);
  const [subcatsOpen, setSubcatsOpen] = useState(false);
  const isReadOnly = record
    ? metaField<boolean>(record, "shared", false) === true || metaField<boolean>(record, "readOnly", false) === true
    : false;

  useEffect(() => {
    if (!record || isReadOnly) return;
    let cancel = false;
    fetchBookSubcategories()
      .then((items) => { if (!cancel) setSubcats(items); })
      .catch(() => { /* sin red: el bloque simplemente no se pinta */ });
    return () => { cancel = true; };
  }, [record, isReadOnly]);

  // Inicializa la nota desde el record UNA sola vez (primer load). No se reasigna
  // en revalidaciones por foco para no pisar una edición en curso del usuario.
  const noteInit = useRef(false);
  useEffect(() => {
    if (record && !noteInit.current) {
      noteInit.current = true;
      setNote(metaField<string | null>(record, "userNotes", null));
    }
  }, [record]);

  async function saveNote() {
    const text = draftNote.trim();
    setSavingNote(true);
    try {
      await api(`/api/records/${id}?type=book`, {
        method: "PATCH",
        body: JSON.stringify({ notes: text }),
      });
      setNote(text || null);
      setEditingNote(false);
    } catch {
      /* error de red → se queda en modo edición para reintentar */
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.book.singular") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  const book = record ? metaField<Book | null>(record, "book", null) : null;
  if (error || !record || !book) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.book.singular") }} />
        <Text style={{ color: th.dangerFg }}>{error?.message ?? t("detail.not_found")}</Text>
      </View>
    );
  }

  const cover = book.imageUrls.large ?? book.imageUrls.thumbnail ?? null;
  const rows: [string, string][] = (
    [
      [t("detail.book.row_authors"), book.authors.join(", ")],
      [t("detail.book.row_publisher"), book.publisher],
      [t("detail.book.row_published"), book.publishedDate],
      [t("detail.book.row_pages"), book.pageCount != null ? String(book.pageCount) : null],
      [t("detail.book.row_language"), book.language ? book.language.toUpperCase() : null],
      [t("detail.book.row_categories"), book.categories.join(", ")],
      [t("detail.book.row_isbn"), book.isbn13 ?? book.isbn10],
    ] as [string, string | null | undefined][]
  ).filter((r): r is [string, string] => Boolean(r[1]));

  const sourceLabel =
    book.source === "OPEN_LIBRARY"
      ? "Open Library"
      : book.source === "GOOGLE_BOOKS"
      ? "Google Books"
      : t("detail.source_web");
  const bookTitle = book.title;
  const bookAuthors = book.authors;
  const detailUrl = book.detailUrl;
  async function onShare() {
    const msg = [
      bookTitle + (bookAuthors.length ? " — " + bookAuthors.join(", ") : ""),
      detailUrl,
    ]
      .filter((l): l is string => !!l)
      .join("\n");
    try {
      await RNShare.open({ message: `${msg}\n\nNIDOKEY`, failOnCancel: false });
    } catch {
      // cancelado o sin app de destino → ignorar
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("types.book.singular") }} />
      <ScrollView
        style={{ backgroundColor: th.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <View style={styles.hero}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: th.imagePlaceholder }]}>
              <Ionicons name="book-outline" size={40} color={th.textSubtle} />
            </View>
          )}
          <View style={styles.heroInfo}>
            <Text style={[styles.title, { color: th.text }]}>{book.title}</Text>
            {book.subtitle ? (
              <Text style={[styles.subtitle, { color: th.textMuted }]}>{book.subtitle}</Text>
            ) : null}
            {book.authors.length > 0 ? (
              <Text style={[styles.authors, { color: th.textMuted }]} numberOfLines={2}>
                {book.authors.join(", ")}
              </Text>
            ) : null}
            {book.averageRating != null && book.averageRating > 0 ? (
              <RatingStars
                value={book.averageRating}
                count={book.ratingsCount ?? null}
                color={th.accent}
                mutedColor={th.textMuted}
              />
            ) : null}
            {/* Compartir + abrir, abajo-derecha del hero: pegados al thumbnail y
                justo encima de la ficha. marginTop:auto los empuja al fondo del
                hero (que se estira a la altura de la portada). */}
            <ShareOpenActions
              style={styles.heroActions}
              onShare={onShare}
              onSendToChat={() => setShareChatOpen(true)}
              onAddToDecision={() => setDecisionOpen(true)}
              onOpen={detailUrl ? () => void Linking.openURL(detailUrl) : undefined}
              openLabel={t("detail.book.view_on", { source: sourceLabel })}
            />
          </View>
        </View>

        {rows.length > 0 && (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={[styles.rowKey, { color: th.textSubtle }]}>{k}</Text>
                <Text style={[styles.rowVal, { color: th.text }]} numberOfLines={3}>
                  {v}
                </Text>
              </View>
            ))}
          </View>
        )}

        {book.description ? (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.descTitle, { color: th.textMuted }]}>{t("detail.book.synopsis")}</Text>
            <Text
              style={[styles.descText, { color: th.text }]}
              numberOfLines={descExpanded ? undefined : 4}
            >
              {book.description}
            </Text>
            {book.description.length > 200 ? (
              <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                <Text style={[styles.moreLink, { color: th.primary }]}>
                  {descExpanded ? t("detail.book.see_less") : t("detail.book.see_more")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Mis notas: comentario propio del usuario. Editor oculto hasta que toca. */}
        <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
          {editingNote ? (
            <>
              <Text style={[styles.descTitle, { color: th.textMuted }]}>{t("detail.book.my_notes")}</Text>
              <TextInput
                value={draftNote}
                onChangeText={setDraftNote}
                multiline
                autoFocus
                placeholder={t("detail.book.notes_placeholder")}
                placeholderTextColor={th.textSubtle}
                style={[
                  styles.noteInput,
                  { color: th.text, borderColor: th.border, backgroundColor: th.bg },
                ]}
              />
              <View style={styles.noteActions}>
                <Pressable
                  onPress={() => {
                    setEditingNote(false);
                    setDraftNote(note ?? "");
                  }}
                  hitSlop={8}
                >
                  <Text style={[styles.noteBtn, { color: th.textMuted }]}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable onPress={saveNote} disabled={savingNote} hitSlop={8}>
                  <Text style={[styles.noteBtn, { color: th.primary, fontFamily: fonts.bodyBold }]}>
                    {savingNote ? t("common.saving") : t("common.save")}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : note ? (
            <Pressable
              onPress={() => {
                setDraftNote(note);
                setEditingNote(true);
              }}
            >
              <View style={styles.noteHeader}>
                <Text style={[styles.descTitle, { color: th.textMuted, marginBottom: 0 }]}>
                  {t("detail.book.my_notes")}
                </Text>
                <Ionicons name="pencil" size={13} color={th.textSubtle} />
              </View>
              <Text style={[styles.descText, { color: th.text, marginTop: 6 }]}>{note}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                setDraftNote("");
                setEditingNote(true);
              }}
              style={styles.addNoteRow}
              hitSlop={8}
            >
              <Ionicons name="add-circle-outline" size={18} color={th.primary} />
              <Text style={[styles.addNoteText, { color: th.primary }]}>{t("detail.book.add_comment")}</Text>
            </Pressable>
          )}
        </View>

        {/* C7: subcategorías personalizadas del usuario (solo libros propios). */}
        {!isReadOnly ? (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Pressable
              onPress={() => setSubcatsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("bookSubcats.edit_label")}
            >
              <View style={styles.noteHeader}>
                <Text style={[styles.descTitle, { color: th.textMuted, marginBottom: 0 }]}>{t("bookSubcats.card_title")}</Text>
                <Ionicons name="pencil" size={13} color={th.textSubtle} />
              </View>
              {(() => {
                const assigned = (subcats ?? []).filter((s) => s.bookIds.includes(id!));
                return assigned.length > 0 ? (
                  <View style={styles.subcatChips}>
                    {assigned.map((s) => (
                      <View key={s.id} style={[styles.subcatChip, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
                        <Text style={[styles.subcatChipText, { color: th.text }]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.addNoteRow, { marginTop: 6 }]}>
                    <Ionicons name="add-circle-outline" size={18} color={th.primary} />
                    <Text style={[styles.addNoteText, { color: th.primary }]}>{t("bookSubcats.card_add")}</Text>
                  </View>
                );
              })()}
            </Pressable>
          </View>
        ) : null}

      </ScrollView>
      <BookSubcategoriesSheet
        visible={subcatsOpen}
        bookId={id!}
        onClose={(changed) => {
          setSubcatsOpen(false);
          if (changed) {
            fetchBookSubcategories().then(setSubcats).catch(() => {});
          }
        }}
      />
      <ShareRecordSheet
        visible={shareChatOpen}
        onClose={() => setShareChatOpen(false)}
        type="book"
        id={id!}
        preview={{ title: book.title, subtitle: book.authors.join(", ") || null, imageUrl: cover ?? null }}
      />
      <AddToDecisionSheet
        visible={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        recordType="book"
        recordId={id!}
      />
    </>
  );
}

/** Valoración de lectores: estrellas (Ionicons, con media estrella) + nota + nº de
 *  votos. El dato es opcional (muchos volúmenes no lo traen), por eso el llamador
 *  lo condiciona a averageRating != null. La nota se redondea a la media estrella
 *  más cercana solo para pintar; el número exacto se muestra al lado. */
function RatingStars({
  value,
  count,
  color,
  mutedColor,
}: {
  value: number;
  count: number | null;
  color: string;
  mutedColor: string;
}) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <View style={styles.ratingRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={rounded >= i ? "star" : rounded >= i - 0.5 ? "star-half" : "star-outline"}
          size={14}
          color={color}
        />
      ))}
      <Text style={[styles.ratingNum, { color }]}>{value.toFixed(1)}</Text>
      {count != null && count > 0 ? (
        <Text style={[styles.ratingCount, { color: mutedColor }]}>
          ({count.toLocaleString("es-ES")})
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 6, paddingBottom: 40 },
  hero: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  cover: { width: 110, height: 165, borderRadius: 8 },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  heroInfo: { flex: 1, gap: 3 },
  title: { fontSize: 19, fontFamily: fonts.bodyBold },
  subtitle: { fontSize: 14 },
  authors: { fontSize: 14, marginTop: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  ratingNum: { fontSize: 14, fontFamily: fonts.bodyBold, marginLeft: 3 },
  ratingCount: { fontSize: 13, fontFamily: fonts.bodyMedium, marginLeft: 1 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  rowKey: { fontSize: 13 },
  rowVal: { fontSize: 13, fontFamily: fonts.bodySemibold, flexShrink: 1, textAlign: "right" },
  descTitle: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 6 },
  descText: { fontSize: 14, lineHeight: 20 },
  moreLink: { fontSize: 13, fontFamily: fonts.bodySemibold, marginTop: 6 },
  noteInput: { minHeight: 80, borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, textAlignVertical: "top" },
  noteActions: { flexDirection: "row", justifyContent: "flex-end", gap: 18, marginTop: 10 },
  noteBtn: { fontSize: 14 },
  noteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addNoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 2 },
  addNoteText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  subcatChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  subcatChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: "100%" },
  subcatChipText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  heroActions: { alignSelf: "flex-end", marginTop: "auto" },
});
