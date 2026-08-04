import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { getAccount, removeAvatar, setAvatar, updateAccount } from "@/lib/chat/account";
import { pickAvatarImage, pickersAvailable, takeAvatarPhoto } from "@/lib/chat/media";
import { Avatar } from "@/components/chat/ConversationList";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { UsernameEditor } from "@/components/chat/UsernameEditor";
import { Button, ResultModal } from "@/components/ui";

/**
 * Cabecera de perfil de Cuenta: avatar editable (tap → cámara / galería /
 * quitar), nombre visible editable (lápiz → modal), alias @username editable
 * (lápiz → modal con el editor de disponibilidad) y email fijo. La foto sube a
 * R2 vía presign; el resto de la app la recibe como URL servible. Sin módulos
 * nativos en el binario, el lápiz del avatar no aparece — blindaje OTA.
 */
export function AccountAvatar({ email, name }: { email: string; name: string | null }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: account, refetch } = useQuery(getAccount, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingAlias, setEditingAlias] = useState(false);

  const editable = pickersAvailable();
  const displayName = (account?.name ?? name)?.trim() || email;
  const alias = account?.username ?? null;

  const options: SheetOption[] = [
    { id: "camera", icon: "camera-outline", label: t("chat.attach_camera") },
    { id: "gallery", icon: "images-outline", label: t("chat.attach_gallery") },
    ...(account?.image
      ? [{ id: "remove", icon: "trash-outline" as const, label: t("account.avatar_remove"), danger: true }]
      : []),
  ];

  async function onSelect(option: SheetOption) {
    setMenuOpen(false);

    // iOS no puede presentar ImagePicker mientras el Modal de ActionsSheet
    // todavía está terminando su animación de cierre. Si se lanza en el mismo
    // tick, la promesa nativa puede quedar pendiente y el avatar carga para
    // siempre. Es el mismo guard que usa el flujo de adjuntos del chat.
    if (Platform.OS === "ios" && option.id !== "remove") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setBusy(true);
    try {
      if (option.id === "remove") {
        await removeAvatar();
      } else {
        const file = option.id === "camera" ? await takeAvatarPhoto() : await pickAvatarImage();
        if (file) await setAvatar(file);
      }
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("account.avatar_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => editable && !busy && setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("account.avatar_title")}
        disabled={!editable || busy}
      >
        <Avatar title={displayName} imageUrl={account?.image ?? null} size={72} />
        {busy && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {editable && !busy && (
          <View style={[styles.badge, { backgroundColor: th.primary, borderColor: th.surface }]}>
            <Ionicons name="pencil" size={11} color="#fff" />
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => setEditingName(true)}
        accessibilityRole="button"
        accessibilityLabel={t("account.edit_name")}
        hitSlop={8}
        style={styles.editableLine}
      >
        <Text style={[styles.name, { color: th.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        <Ionicons name="pencil-outline" size={14} color={th.textSubtle} />
      </Pressable>

      <Pressable
        onPress={() => setEditingAlias(true)}
        accessibilityRole="button"
        accessibilityLabel={t("account.edit_alias")}
        hitSlop={8}
        style={styles.editableLine}
      >
        <Text style={[styles.alias, { color: alias ? th.textMuted : th.textSubtle }]} numberOfLines={1}>
          {alias ? `@${alias}` : t("account.alias_none")}
        </Text>
        <Ionicons name="pencil-outline" size={12} color={th.textSubtle} />
      </Pressable>

      <Text style={[styles.email, { color: th.textSubtle }]} numberOfLines={1}>
        {email}
      </Text>

      <ActionsSheet
        visible={menuOpen}
        title={t("account.avatar_title")}
        options={options}
        onSelect={(o) => void onSelect(o)}
        onClose={() => setMenuOpen(false)}
      />
      <NameEditModal
        visible={editingName}
        initial={account?.name ?? name ?? ""}
        onClose={() => setEditingName(false)}
        onSaved={() => {
          setEditingName(false);
          void refetch();
        }}
      />
      <EditCardModal
        visible={editingAlias}
        // Refetch también al cerrar por backdrop/botón físico, no solo por el botón.
        onClose={() => {
          setEditingAlias(false);
          void refetch();
        }}
      >
        <UsernameEditor />
        <Button
          label={t("common.back")}
          variant="ghost"
          onPress={() => {
            setEditingAlias(false);
            void refetch();
          }}
        />
      </EditCardModal>
      <ResultModal
        visible={!!error}
        tone="error"
        title={t("account.avatar_error")}
        message={error ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setError(null) }]}
        onRequestClose={() => setError(null)}
      />
    </View>
  );
}

/** Card modal genérica para ediciones cortas (mismo lenguaje visual que ResultModal). */
function EditCardModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { th } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.backdrop, { backgroundColor: th.overlay }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            th.elevation.lg,
            { backgroundColor: th.surfaceRaised, borderColor: th.border, borderRadius: th.radii.xl },
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NameEditModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reabrir el modal siempre con el nombre vigente, no con restos de la edición anterior.
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
    }
  }, [visible, initial]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateAccount({ name: value.trim() || null });
      onSaved();
    } catch (e) {
      // El servidor valida el nombre (p. ej. anti-suplantación del bot).
      setError(e instanceof Error && e.message ? e.message : t("account.name_error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditCardModal visible={visible} onClose={onClose}>
      <Text style={[styles.modalTitle, { color: th.text }]}>{t("account.edit_name")}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t("account.name_placeholder")}
        placeholderTextColor={th.textSubtle}
        maxLength={60}
        autoFocus
        style={[styles.input, { color: th.text, backgroundColor: th.bg, borderColor: th.border }]}
      />
      {error ? <Text style={[styles.modalError, { color: th.dangerFg }]}>{error}</Text> : null}
      <Button label={t("common.save")} onPress={save} loading={saving} disabled={saving} />
      <Button label={t("common.cancel")} variant="ghost" onPress={onClose} disabled={saving} />
    </EditCardModal>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 4 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
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
  editableLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28, maxWidth: "88%" },
  name: { fontSize: 20, fontFamily: fonts.bodySemibold, marginTop: 6 },
  alias: { fontSize: 14 },
  email: { fontSize: 13, marginTop: 2 },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 360, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontFamily: fonts.heading },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  modalError: { fontSize: 12 },
});
