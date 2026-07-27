import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { isProtectedName } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { useAuth } from "@/lib/auth-context";
import {
  chatBootstrap,
  getConversation,
  leaveConversation,
  removeConversationImage,
  removeParticipant,
  renameConversation,
  setConversationImage,
  type ChatParticipant,
} from "@/lib/chat/api";
import { pickAvatarImage, pickersAvailable, takeAvatarPhoto } from "@/lib/chat/media";
import { Avatar } from "@/components/chat/ConversationList";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { EmptyState, ResultModal } from "@/components/ui";

/**
 * Información del grupo: miembros con su rol, renombrar y añadir/expulsar
 * (solo OWNER/ADMIN), y salir. Denunciar el grupo está en el menú ⋮ del chat.
 */
export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const myId = state.kind === "authed" ? state.user.id : null;

  const { data: conversation, loading, error: loadError, refetch } = useQuery(() => getConversation(id), [id]);
  const { data: boot } = useQuery(chatBootstrap, [], { revalidateOnFocus: false });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [memberMenu, setMemberMenu] = useState<ChatParticipant | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ChatParticipant | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al VOLVER de "añadir miembros": useQuery revalida al volver la APP a primer
  // plano, no al volver de otra pantalla — sin esto los recién añadidos no
  // aparecían hasta el siguiente arranque.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const isAdmin = conversation?.myRole === "OWNER" || conversation?.myRole === "ADMIN";
  const members = conversation?.participants ?? [];

  function nameOf(p: ChatParticipant): string {
    if (p.userId === myId) return t("chat.you");
    return p.user.name?.trim() || (p.user.username ? "@" + p.user.username : null) || "—";
  }

  function fail(e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    setError(msg && !msg.startsWith("[object") ? msg : t("chat.action_error"));
  }

  async function saveTitle() {
    const next = title.trim();
    if (busy || !next || isProtectedName(next)) return;
    setBusy(true);
    try {
      await renameConversation(id, next);
      setRenaming(false);
      await refetch();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(option: SheetOption) {
    setPhotoMenu(false);
    // Elegir ANTES de bloquear: el selector puede tardar minutos (permisos,
    // cámara del sistema) y `busy` es el mismo flag del renombrado — se veía
    // el ✓ de guardar nombre girando mientras hacías la foto. Y si se cancela,
    // no debe pasar nada en absoluto.
    let file: { uri: string; mime: string } | null = null;
    if (option.id !== "remove") {
      try {
        file = option.id === "camera" ? await takeAvatarPhoto() : await pickAvatarImage();
      } catch (e) {
        fail(e);
        return;
      }
      if (!file) return;
    }
    setPhotoBusy(true);
    try {
      if (file) await setConversationImage(id, file);
      else await removeConversationImage(id);
      await refetch();
    } catch (e) {
      fail(e);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemove() {
    const p = confirmRemove;
    setConfirmRemove(null);
    if (!p) return;
    try {
      await removeParticipant(id, p.userId);
      await refetch();
    } catch (e) {
      fail(e);
    }
  }

  async function onLeave() {
    setConfirmLeave(false);
    try {
      await leaveConversation(id);
      // La conversación ya no es mía: hay que salir de ella Y de esta ficha.
      // `dismissAll` vaciaba TODO el stack raíz (se llevaba por delante la
      // ficha de registro desde la que se hubiera abierto el chat).
      router.dismissTo("/(tabs)");
    } catch (e) {
      fail(e);
    }
  }

  if (loading && !conversation) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("chat.group_info") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  // Sin datos y sin carga en curso = falló. Antes se pintaba la ficha vacía
  // ("0 miembros") con el botón rojo de salir activo.
  if (!conversation) {
    return (
      <View style={[styles.container, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("chat.group_info") }} />
        <EmptyState
          icon="cloud-offline-outline"
          title={t("chat.load_error")}
          description={loadError?.message}
          actionLabel={t("common.retry")}
          onAction={refetch}
        />
      </View>
    );
  }

  if (conversation.kind !== "GROUP") {
    return (
      <View style={[styles.container, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("chat.group_info") }} />
        <EmptyState icon="people-outline" title={t("chat.group_info_only")} />
      </View>
    );
  }

  // El lápiz solo aparece si se puede llegar al final: módulos nativos en el
  // binario (blindaje OTA) Y R2 configurado en el servidor. Sin lo segundo, el
  // usuario recorría cámara/recorte para acabar en un 503.
  const canEditPhoto = isAdmin && pickersAvailable() && boot?.flags.attachments !== false;

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={() => canEditPhoto && !photoBusy && setPhotoMenu(true)}
        disabled={!canEditPhoto || photoBusy}
        accessibilityRole={canEditPhoto ? "button" : undefined}
        accessibilityLabel={canEditPhoto ? t("chat.group_photo") : undefined}
      >
        <Avatar title={conversation?.title ?? "?"} imageUrl={conversation?.imageUrl ?? null} size={72} />
        {photoBusy && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {canEditPhoto && !photoBusy && (
          <View style={[styles.photoBadge, { backgroundColor: th.primary, borderColor: th.bg }]}>
            <Ionicons name="pencil" size={11} color="#fff" />
          </View>
        )}
      </Pressable>
      {renaming ? (
        <View style={styles.renameRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            autoFocus
            placeholder={t("chat.group_name_placeholder")}
            placeholderTextColor={th.textSubtle}
            style={[styles.renameInput, { color: th.text, backgroundColor: th.surface, borderColor: th.border }]}
          />
          <Pressable
            onPress={() => void saveTitle()}
            disabled={busy || !title.trim() || isProtectedName(title)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("common.save")}
            style={{ opacity: busy || !title.trim() || isProtectedName(title) ? 0.4 : 1 }}
          >
            {busy ? <ActivityIndicator size="small" color={th.primary} /> : <Ionicons name="checkmark" size={22} color={th.primary} />}
          </Pressable>
          <Pressable onPress={() => setRenaming(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
            <Ionicons name="close" size={22} color={th.textSubtle} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            if (!isAdmin) return;
            setTitle(conversation?.title ?? "");
            setRenaming(true);
          }}
          disabled={!isAdmin}
          accessibilityRole={isAdmin ? "button" : undefined}
          style={styles.titleRow}
        >
          <Text style={[styles.title, { color: th.text }]} numberOfLines={2}>
            {conversation?.title}
          </Text>
          {isAdmin && <Ionicons name="pencil-outline" size={16} color={th.textSubtle} />}
        </Pressable>
      )}
      {isProtectedName(title) && renaming && (
        <Text style={[styles.warn, { color: th.dangerFg }]}>{t("chat.group_name_taken")}</Text>
      )}

      <Text style={[styles.membersLabel, { color: th.textSubtle }]}>
        {t("chat.members", { count: members.length })}
      </Text>
    </View>
  );

  const memberOptions: SheetOption[] = memberMenu
    ? [
        { id: "remove", icon: "person-remove-outline", label: t("chat.group_remove_member"), danger: true },
      ]
    : [];

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ title: t("chat.group_info") }} />
      <FlatList
        data={members}
        keyExtractor={(p) => p.userId}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const canRemove = isAdmin && item.userId !== myId && item.role !== "OWNER";
          return (
            <View style={[styles.row, { backgroundColor: th.surface, borderColor: th.border }]}>
              <Avatar title={nameOf(item)} imageUrl={item.user.image} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: th.text }]} numberOfLines={1}>
                  {nameOf(item)}
                </Text>
                {!!item.user.username && (
                  <Text style={[styles.rowSecondary, { color: th.textMuted }]} numberOfLines={1}>
                    @{item.user.username}
                  </Text>
                )}
              </View>
              {item.role !== "MEMBER" && (
                <View style={[styles.roleChip, { backgroundColor: th.primarySoft }]}>
                  <Text style={[styles.roleText, { color: th.primary }]}>
                    {item.role === "OWNER" ? t("chat.group_role_owner") : t("chat.group_role_admin")}
                  </Text>
                </View>
              )}
              {/* Botón explícito: con solo pulsación larga, expulsar era
                  invisible y directamente inalcanzable con lector de pantalla. */}
              {canRemove && (
                <Pressable
                  onPress={() => setMemberMenu(item)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("chat.group_remove_member")}: ${nameOf(item)}`}
                  style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={th.textMuted} />
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <View style={[styles.footer, { borderColor: th.border, paddingBottom: insets.bottom + 12 }]}>
        {isAdmin && (
          <Pressable
            onPress={() => router.push(`/chat/add-members/${id}` as never)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-add-outline" size={18} color={th.primary} />
            <Text style={[styles.actionText, { color: th.primary }]}>{t("chat.group_add_members")}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => setConfirmLeave(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="exit-outline" size={18} color={th.dangerFg} />
          <Text style={[styles.actionText, { color: th.dangerFg }]}>{t("chat.group_leave")}</Text>
        </Pressable>
      </View>

      <ActionsSheet
        visible={photoMenu}
        title={t("chat.group_photo")}
        options={[
          { id: "camera", icon: "camera-outline", label: t("chat.attach_camera") },
          { id: "gallery", icon: "images-outline", label: t("chat.attach_gallery") },
          ...(conversation?.imageUrl
            ? [{ id: "remove", icon: "trash-outline" as const, label: t("chat.group_photo_remove"), danger: true }]
            : []),
        ]}
        onSelect={(o) => void onPhoto(o)}
        onClose={() => setPhotoMenu(false)}
      />
      <ActionsSheet
        visible={!!memberMenu}
        title={memberMenu ? nameOf(memberMenu) : ""}
        options={memberOptions}
        onSelect={(o) => {
          const p = memberMenu;
          setMemberMenu(null);
          if (p && o.id === "remove") setConfirmRemove(p);
        }}
        onClose={() => setMemberMenu(null)}
      />
      <ResultModal
        visible={!!confirmRemove}
        tone="error"
        icon="person-remove-outline"
        title={t("chat.group_remove_member")}
        message={confirmRemove ? t("chat.group_remove_confirm", { name: nameOf(confirmRemove) }) : undefined}
        actions={[
          { label: t("chat.group_remove_action"), variant: "danger", onPress: () => void onRemove() },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirmRemove(null) },
        ]}
        onRequestClose={() => setConfirmRemove(null)}
      />
      <ResultModal
        visible={confirmLeave}
        tone="error"
        icon="exit-outline"
        title={t("chat.group_leave")}
        message={t("chat.group_leave_message")}
        actions={[
          { label: t("chat.group_leave_action"), variant: "danger", onPress: () => void onLeave() },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirmLeave(false) },
        ]}
        onRequestClose={() => setConfirmLeave(false)}
      />
      <ResultModal
        visible={!!error}
        tone="error"
        title={t("chat.action_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", gap: 8, paddingVertical: 18 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24 },
  title: { fontSize: 19, fontFamily: fonts.heading, textAlign: "center" },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch", paddingHorizontal: 12 },
  renameInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  warn: { fontSize: 11 },
  membersLabel: { fontSize: 12, textTransform: "uppercase", marginTop: 6 },
  list: { paddingHorizontal: 12, paddingBottom: 12 },
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
  rowAction: { padding: 4 },
  roleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  roleText: { fontSize: 11, fontFamily: fonts.bodyMedium },
  footer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  actionText: { fontSize: 15, fontFamily: fonts.bodyMedium },
});
