import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { getAccount, removeAvatar, setAvatar } from "@/lib/chat/account";
import { pickAvatarImage, pickersAvailable, takeAvatarPhoto } from "@/lib/chat/media";
import { Avatar } from "@/components/chat/ConversationList";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { ResultModal } from "@/components/ui";

/**
 * Avatar editable de Cuenta: tap → cámara / galería (recorte cuadrado) /
 * quitar foto. Sube a R2 vía presign y guarda la key en el perfil; el resto de
 * la app (chats, contactos) la recibe como URL servible y se refresca con el
 * polling. Sin módulos nativos en el binario, el lápiz no aparece (solo se ve
 * la foto/iniciales) — blindaje OTA.
 */
export function AccountAvatar({ email, name }: { email: string; name: string | null }) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: account, refetch } = useQuery(getAccount, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = pickersAvailable();
  const title = name?.trim() || email;

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
        <Avatar title={title} imageUrl={account?.image ?? null} size={72} />
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
      <Text style={[styles.email, { color: th.text }]}>{email}</Text>
      {name && <Text style={[styles.name, { color: th.textMuted }]}>{name}</Text>}

      <ActionsSheet
        visible={menuOpen}
        title={t("account.avatar_title")}
        options={options}
        onSelect={(o) => void onSelect(o)}
        onClose={() => setMenuOpen(false)}
      />
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

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 8 },
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
  email: { fontSize: 15, fontFamily: fonts.bodyMedium },
  name: { fontSize: 13 },
});
