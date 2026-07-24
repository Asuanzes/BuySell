import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { track, flush } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button, Screen, Section } from "@/components/ui";
import { LanguageSelector } from "@/components/LanguageSelector";
import { UsernameEditor } from "@/components/chat/UsernameEditor";
import { AccountAvatar } from "@/components/chat/AccountAvatar";

export default function AccountScreen() {
  const { state, logout } = useAuth();
  const { th } = useTheme();
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  // Doble confirmación destructiva: Alert nativo → DELETE → logout local.
  function confirmDelete() {
    Alert.alert(t("account.delete_title"), t("account.delete_body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.delete_confirm"),
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            track("account_deleted");
            await flush();
            await api("/api/account", { method: "DELETE" });
            await logout();
          } catch {
            Alert.alert(t("account.delete_error"));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (state.kind !== "authed") return null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
      <Section>
        <AccountAvatar email={state.user.email} name={state.user.name} />
      </Section>

      <Section label={t("account.username_section")}>
        <UsernameEditor />
      </Section>

      <Section label={t("account.premium")}>
        <Pressable style={styles.toggleRow} onPress={() => router.push("/premium" as never)}>
          <Ionicons name="diamond-outline" size={20} color={th.primary} />
          <Text style={[styles.toggleLabel, { color: th.text }]}>{t("account.premium")}</Text>
          <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
        </Pressable>
      </Section>

      <Section label={t("account.theme")}>
        <Pressable style={styles.toggleRow} onPress={() => router.push("/theme-settings")}>
          <Ionicons name="color-palette-outline" size={20} color={th.textMuted} />
          <Text style={[styles.toggleLabel, { color: th.text }]}>{t("account.theme")}</Text>
          <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
        </Pressable>
      </Section>

      <Section label={t("settings.language.title")}>
        <LanguageSelector />
      </Section>

      <Section label={t("account.categories")}>
        <Pressable style={styles.toggleRow} onPress={() => router.push("/category-settings")}>
          <Ionicons name="albums-outline" size={20} color={th.textMuted} />
          <Text style={[styles.toggleLabel, { color: th.text }]}>{t("account.manage_categories")}</Text>
          <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
        </Pressable>
      </Section>

      <Section label={t("account.privacy")}>
        <Pressable style={styles.toggleRow} onPress={() => router.push("/chat/blocked" as never)}>
          <Ionicons name="ban-outline" size={20} color={th.textMuted} />
          <Text style={[styles.toggleLabel, { color: th.text }]}>{t("account.blocked_users")}</Text>
          <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
        </Pressable>
      </Section>

      <Section label={t("shared.title")}>
        <Pressable style={styles.toggleRow} onPress={() => router.push("/shared")}>
          <Ionicons name="share-social-outline" size={20} color={th.textMuted} />
          <Text style={[styles.toggleLabel, { color: th.text }]}>{t("account.shared_with_me")}</Text>
          <Ionicons name="chevron-forward" size={18} color={th.textSubtle} />
        </Pressable>
      </Section>

      <Button
        label={t("account.logout")}
        icon="log-out-outline"
        variant="danger"
        onPress={logout}
        style={styles.logout}
      />

      <Pressable onPress={confirmDelete} disabled={deleting} style={styles.deleteLink}>
        <Text style={[styles.deleteText, { color: th.dangerFg }]}>
          {deleting ? t("common.loading") : t("account.delete_account")}
        </Text>
      </Pressable>

      <Text style={[styles.footer, { color: th.textSubtle }]}>{t("account.footer")}</Text>
      <Text style={[styles.credit, { color: th.textSubtle }]}>
        Iconos: Solar (CC BY 4.0) · game-icons.net (CC BY 3.0) · Material Design Icons (Apache 2.0) · Phosphor (MIT)
      </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, flexGrow: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { flex: 1, fontSize: 15 },
  logout: { marginTop: 4 },
  deleteLink: { alignItems: "center", paddingVertical: 10 },
  deleteText: { fontSize: 13, textDecorationLine: "underline" },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 11 },
  credit: { textAlign: "center", fontSize: 9, lineHeight: 13, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 16 },
});
