import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import {
  leaveConversation,
  listConversations,
  markRead,
  setPinned,
  type ConversationDto,
} from "@/lib/chat/api";
import { chatSocket } from "@/lib/chat/socket";
import { useSocketOpen } from "@/lib/chat/use-socket-open";
import { categoryColor } from "@/lib/records/config";
import type { RecordType } from "@nidokey/shared";
import { stripRecordLinks } from "@nidokey/shared";
import { AdBannerSlot, EmptyState, ResultModal } from "@/components/ui";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { VerifiedBadge, isOfficialConversation } from "@/components/chat/VerifiedBadge";

/**
 * Lista de conversaciones (categoría Chat del rail): búsqueda, filtro de no
 * leídos, long-press (fijar / marcar leído / eliminar) y refetch al volver del
 * chat (sin él, el badge de no-leídos quedaba "fantasma" hasta el próximo poll).
 */
export function ConversationList() {
  const { th, dark } = useTheme();
  const { t } = useTranslation();
  // Polling adaptativo: con socket conectado los eventos refrescan la lista y
  // el polling pasa a fallback lento; con socket caído vuelve a 20 s.
  const socketOpen = useSocketOpen();
  const { data, error, loading, refreshing, refetch } = useQuery(listConversations, [], {
    refreshInterval: socketOpen ? 60_000 : 20_000,
  });

  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [rowActions, setRowActions] = useState<ConversationDto | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<ConversationDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Al VOLVER a esta pantalla (p. ej. desde una conversación recién leída),
  // refrescar ya: el unreadCount viejo no debe sobrevivir hasta el poll.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  // Tiempo real (F3): un cambio en cualquier conversación refresca la lista.
  // Coalescing trailing de 500 ms: una ráfaga (grupo activo) = UN refetch.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = chatSocket.onMessageEvent(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refetch();
      }, 500);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [refetch]);

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (onlyUnread) list = list.filter((c) => c.unreadCount > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.lastMessagePreview ?? "").toLowerCase().includes(q) ||
          (c.context?.title ?? "").toLowerCase().includes(q)
      );
    }
    // El DM oficial de @Nidokey SIEMPRE arriba (por delante incluso de los
    // fijados): es el buzón de alertas y del asistente. sort es estable en
    // Hermes → el resto conserva el orden del servidor.
    return [...list].sort(
      (a, b) => Number(isOfficialConversation(b)) - Number(isOfficialConversation(a))
    );
  }, [data, query, onlyUnread]);

  async function onRowAction(o: SheetOption) {
    const c = rowActions;
    setRowActions(null);
    if (!c) return;
    try {
      if (o.id === "pin") {
        await setPinned(c.id, !c.pinnedAt);
        await refetch();
      } else if (o.id === "read") {
        await markRead(c.id);
        await refetch();
      } else if (o.id === "leave") {
        setConfirmLeave(c);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  async function onLeave() {
    const c = confirmLeave;
    setConfirmLeave(null);
    if (!c) return;
    try {
      await leaveConversation(c.id);
      await refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("chat.action_error"));
    }
  }

  const rowOptions: SheetOption[] = rowActions
    ? [
        {
          id: "pin",
          icon: "pin-outline",
          label: rowActions.pinnedAt ? t("chat.menu_unpin") : t("chat.menu_pin"),
        },
        ...(rowActions.unreadCount > 0
          ? [{ id: "read", icon: "checkmark-done-outline" as const, label: t("chat.menu_mark_read") }]
          : []),
        // En grupo NO es "eliminar de mi lista": salir es definitivo (todavía
        // no hay endpoint para re-invitar), así que el copy tiene que decirlo.
        rowActions.kind === "GROUP"
          ? { id: "leave", icon: "exit-outline", label: t("chat.group_leave"), danger: true }
          : { id: "leave", icon: "trash-outline", label: t("chat.menu_leave"), danger: true },
      ]
    : [];

  let content: ReactNode;
  if (loading && !data) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={th.primary} />
      </View>
    );
  } else if (error && !data) {
    content = (
      <EmptyState
        icon="cloud-offline-outline"
        title={t("chat.load_error")}
        description={error.message}
        actionLabel={t("common.retry")}
        onAction={refetch}
      />
    );
  } else if (data && data.length === 0) {
    content = (
      <EmptyState
        icon="chatbubbles-outline"
        title={t("chat.empty_title")}
        description={t("chat.empty_desc")}
        actionLabel={t("chat.new_chat")}
        onAction={() => router.push("/chat/new" as never)}
      />
    );
  } else {
    content = (
      <>
        {/* Hueco de anuncios sobre la lista de conversaciones. Inerte mientras
            `adsEnabled` esté apagado. */}
        <AdBannerSlot />

        {/* Búsqueda + filtro no leídos */}
        <View style={styles.toolsRow}>
          <View style={[styles.searchBox, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Ionicons name="search-outline" size={16} color={th.textSubtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("chat.list_search_placeholder")}
              placeholderTextColor={th.textSubtle}
              accessibilityLabel={t("chat.list_search_placeholder")}
              style={[styles.searchInput, { color: th.text }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
                <Ionicons name="close-circle" size={16} color={th.textSubtle} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setOnlyUnread((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: onlyUnread }}
            accessibilityLabel={t("chat.filter_unread")}
            style={[
              styles.unreadFilter,
              { borderColor: onlyUnread ? th.primary : th.border, backgroundColor: onlyUnread ? th.primarySoft : th.surface },
            ]}
          >
            <Ionicons name="mail-unread-outline" size={16} color={onlyUnread ? th.primary : th.textMuted} />
          </Pressable>
        </View>

        {filtered.length === 0 ? (
          <EmptyState icon="search-outline" title={t("chat.no_results")} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => <Row c={item} dark={dark} onLongPress={() => setRowActions(item)} />}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={th.primary} />}
          />
        )}
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push("/chat/contacts" as never)}
            accessibilityRole="button"
            accessibilityLabel={t("chat.contacts_title")}
            style={({ pressed }) => [
              styles.contactsBtn,
              { backgroundColor: th.surface, borderColor: th.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="people-outline" size={20} color={th.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/chat/new" as never)}
            accessibilityRole="button"
            accessibilityLabel={t("chat.new_chat")}
            style={({ pressed }) => [styles.newChatBtn, { backgroundColor: th.primary }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        <ActionsSheet
          visible={!!rowActions}
          title={rowActions?.title ?? ""}
          options={rowOptions}
          onSelect={(o) => void onRowAction(o)}
          onClose={() => setRowActions(null)}
        />
        <ResultModal
          visible={!!confirmLeave}
          tone="error"
          icon={confirmLeave?.kind === "GROUP" ? "exit-outline" : "trash-outline"}
          title={confirmLeave?.kind === "GROUP" ? t("chat.group_leave") : t("chat.leave_confirm_title")}
          message={
            confirmLeave?.kind === "GROUP" ? t("chat.group_leave_message") : t("chat.leave_confirm_message")
          }
          actions={[
            {
              label: confirmLeave?.kind === "GROUP" ? t("chat.group_leave_action") : t("common.delete"),
              variant: "danger",
              onPress: () => void onLeave(),
            },
            { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirmLeave(null) },
          ]}
          onRequestClose={() => setConfirmLeave(null)}
        />
        <ResultModal
          visible={!!actionError}
          tone="error"
          title={t("chat.action_error")}
          message={actionError ?? undefined}
          actions={[{ label: t("common.understood"), onPress: () => setActionError(null) }]}
          onRequestClose={() => setActionError(null)}
        />
      </>
    );
  }

  // Sin fondo propio: el <Screen background> padre pinta el fondo dinámico.
  return <View style={styles.fill}>{content}</View>;
}

/**
 * Fila MEMOIZADA por los campos que pinta: cada poll crea instancias nuevas de
 * ConversationDto con datos idénticos; sin memo, todas las filas se repintaban
 * en cada refresco (20-60 s + uno por mensaje entrante).
 */
const Row = memo(RowInner, (prev, next) => {
  const a = prev.c;
  const b = next.c;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.imageUrl === b.imageUrl &&
    a.lastMessageAt === b.lastMessageAt &&
    a.lastMessagePreview === b.lastMessagePreview &&
    a.unreadCount === b.unreadCount &&
    a.pinnedAt === b.pinnedAt &&
    a.muteUntil === b.muteUntil &&
    a.contextType === b.contextType &&
    (a.context?.title ?? null) === (b.context?.title ?? null) &&
    prev.dark === next.dark
  );
});

function RowInner({ c, dark, onLongPress }: { c: ConversationDto; dark: boolean; onLongPress: () => void }) {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  const accent = c.contextType ? categoryColor(c.contextType as RecordType, dark) : null;
  const official = isOfficialConversation(c);
  const muted = !!c.muteUntil && new Date(c.muteUntil) > new Date();

  return (
    <Pressable
      onPress={() => router.push(`/chat/${c.id}` as never)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={c.title}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: th.surface, borderColor: th.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Avatar title={c.title} imageUrl={c.imageUrl} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.rowTitleWrap}>
            <Text style={[styles.rowTitle, { color: th.text }]} numberOfLines={1}>
              {c.title}
            </Text>
            {official && <VerifiedBadge size={14} />}
            {c.pinnedAt && <Ionicons name="pin" size={12} color={th.textSubtle} />}
            {muted && <Ionicons name="notifications-off-outline" size={12} color={th.textSubtle} />}
          </View>
          {c.lastMessageAt && (
            <Text style={[styles.rowTime, { color: th.textSubtle }]}>{chatTime(c.lastMessageAt, i18n.language)}</Text>
          )}
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.rowPreview, { color: th.textMuted }]} numberOfLines={1}>
            {c.lastMessagePreview ? stripRecordLinks(c.lastMessagePreview) : t("chat.no_messages")}
          </Text>
          {c.unreadCount > 0 && (
            <View style={[styles.unread, { backgroundColor: th.accent }]}>
              <Text style={styles.unreadText}>{c.unreadCount > 99 ? "99+" : c.unreadCount}</Text>
            </View>
          )}
        </View>
        {accent && c.context && (
          <View style={[styles.ctxChip, { backgroundColor: accent + "22" }]}>
            <Ionicons name="link-outline" size={11} color={accent} />
            <Text style={[styles.ctxChipText, { color: accent }]} numberOfLines={1}>
              {c.context.title}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function Avatar({ title, imageUrl, size = 46 }: { title: string; imageUrl: string | null; size?: number }) {
  const { th } = useTheme();
  // Si la imagen no carga (objeto borrado en R2, red caída), degradar a las
  // iniciales: sin esto expo-image deja un círculo transparente sin explicación.
  // Se guarda la URL fallida, no un booleano: al cambiar la foto cambia el
  // `?v=`, así que la nueva se intenta pintar en vez de quedarse en iniciales.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = title
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        onError={() => setFailedUrl(imageUrl)}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: th.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: th.primary, fontFamily: fonts.bodyBold, fontSize: size * 0.36 }}>{initials || "?"}</Text>
    </View>
  );
}

/** Hoy → HH:MM; este año → "12 jun"; si no, fecha corta. */
export function chatTime(iso: string, lang: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const locale = lang === "en" ? "en-GB" : "es-ES";
  if (sameDay) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Columna: contactos ENCIMA del FAB de nuevo chat, centrados en vertical.
  fabWrap: { position: "absolute", right: 14, bottom: 14, alignItems: "center", gap: 10 },
  contactsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newChatBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  toolsRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, paddingVertical: 7, fontSize: 13 },
  unreadFilter: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 12, paddingBottom: 90 },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    alignItems: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  rowTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.bodySemibold },
  rowTime: { fontSize: 11 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowPreview: { flex: 1, fontSize: 13 },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#fff", fontSize: 11, fontFamily: fonts.bodyBold },
  ctxChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 2,
  },
  ctxChipText: { fontSize: 11, fontFamily: fonts.bodyMedium, maxWidth: 200 },
});
