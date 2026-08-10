import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { track, flush } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@/lib/hooks/useQuery";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES } from "@/lib/i18n/languages";
import { Button, Screen, Section } from "@/components/ui";
import { ActionsSheet, type SheetOption } from "@/components/chat/ActionsSheet";
import { AccountAvatar } from "@/components/chat/AccountAvatar";

/** Solo lo que la fila necesita del estado de facturación. */
type BillingSummary = { plan: "free" | "premium"; status: string | null };
const fetchBilling = () => api<BillingSummary>("/api/billing/status");

/**
 * Cuenta: cabecera de perfil + bloques Suscripción / Preferencias /
 * Organización / Privacidad y datos / Sesión. Cada fila navega a una
 * subpantalla salvo Idioma (sheet inline) y las acciones destructivas.
 */
export default function AccountScreen() {
  const { state, logout } = useAuth();
  const { th } = useTheme();
  const { t } = useTranslation();
  const { pref, language, setLanguage } = useLanguage();
  const { data: billing } = useQuery(fetchBilling);
  const [deleting, setDeleting] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

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

  const premium = billing?.plan === "premium";
  const pastDue = billing?.status === "PAST_DUE";
  const premiumHint = pastDue
    ? t("premium.past_due")
    : premium
      ? t("account.premium_active")
      : t("account.premium_cta");

  const effectiveNative = LANGUAGES.find((l) => l.code === language)?.nameNative ?? "";
  const langHint = pref === "auto" ? `${t("settings.language.auto")} · ${effectiveNative}` : effectiveNative;
  const langOptions: SheetOption[] = [
    {
      id: "auto",
      icon: pref === "auto" ? "checkmark-circle" : "globe-outline",
      label: t("settings.language.auto"),
      hint: effectiveNative,
    },
    ...LANGUAGES.map((l) => ({
      id: l.code,
      icon: (pref === l.code ? "checkmark-circle" : "language-outline") as SheetOption["icon"],
      label: l.nameNative,
      hint:
        l.translationQuality === "automatic"
          ? t("settings.language.automatic")
          : l.translationQuality === "partial"
            ? t("settings.language.partial")
            : l.nameEnglish,
    })),
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section>
          <AccountAvatar email={state.user.email} name={state.user.name} />
        </Section>

        <Section label={t("account.section_subscription")}>
          <Row
            icon="diamond-outline"
            iconColor={th.primary}
            label={t("account.premium")}
            hint={premiumHint}
            hintColor={pastDue ? th.dangerFg : undefined}
            badge={premium ? t("account.premium_active") : undefined}
            onPress={() => router.push("/premium" as never)}
          />
        </Section>

        <Section label={t("account.section_preferences")}>
          <Row
            icon="notifications-outline"
            label={t("account.notifications")}
            onPress={() => router.push("/notification-settings" as never)}
          />
          <Sep />
          <Row
            icon="color-palette-outline"
            label={t("account.theme")}
            onPress={() => router.push("/theme-settings")}
          />
          <Sep />
          <Row
            icon="language-outline"
            label={t("settings.language.title")}
            hint={langHint}
            chevron="chevron-expand"
            onPress={() => setLangOpen(true)}
          />
        </Section>

        <Section label={t("account.section_organization")}>
          <Row
            icon="albums-outline"
            label={t("account.manage_categories")}
            onPress={() => router.push("/category-settings")}
          />
          <Sep />
          <Row
            icon="share-social-outline"
            label={t("account.shared_records")}
            onPress={() => router.push("/shares" as never)}
          />
        </Section>

        <Section label={t("account.section_privacy")}>
          <Row
            icon="ban-outline"
            label={t("account.blocked_users")}
            onPress={() => router.push("/chat/blocked" as never)}
          />
          <Sep />
          <Row
            icon="download-outline"
            label={t("account.export_title")}
            onPress={() => router.push("/export-data" as never)}
          />
          <Sep />
          <Row
            icon="trash-outline"
            label={deleting ? t("common.loading") : t("account.delete_account")}
            danger
            chevron={null}
            onPress={() => !deleting && confirmDelete()}
          />
        </Section>

        <Section label={t("account.section_session")}>
          <Button label={t("account.logout")} icon="log-out-outline" variant="danger" onPress={logout} />
        </Section>

        <Text style={[styles.footer, { color: th.textSubtle }]}>{t("account.footer")}</Text>
        <Text style={[styles.credit, { color: th.textSubtle }]}>{t("account.credits")}</Text>
      </ScrollView>

      <ActionsSheet
        visible={langOpen}
        title={t("settings.language.title")}
        options={langOptions}
        onSelect={(o) => {
          setLangOpen(false);
          void setLanguage(o.id as Parameters<typeof setLanguage>[0]);
        }}
        onClose={() => setLangOpen(false)}
      />
    </Screen>
  );
}

/** Fila estándar de ajuste: icono, label, hint opcional, chevron y rol accesible. */
function Row({
  icon,
  iconColor,
  label,
  hint,
  hintColor,
  badge,
  danger = false,
  chevron = "chevron-forward",
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  hint?: string;
  hintColor?: string;
  badge?: string;
  danger?: boolean;
  chevron?: keyof typeof Ionicons.glyphMap | null;
  onPress: () => void;
}) {
  const { th } = useTheme();
  const fg = danger ? th.dangerFg : th.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={iconColor ?? (danger ? th.dangerFg : th.textMuted)} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: fg }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: hintColor ?? th.textSubtle }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <Text style={[styles.badge, { color: th.primary, borderColor: th.primary }]}>{badge}</Text>
      ) : null}
      {chevron ? <Ionicons name={chevron} size={18} color={th.textSubtle} /> : null}
    </Pressable>
  );
}

function Sep() {
  const { th } = useTheme();
  return <View style={[styles.sep, { backgroundColor: th.border }]} />;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 1 },
  badge: {
    fontSize: 10,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 11 },
  credit: { textAlign: "center", fontSize: 9, lineHeight: 13, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 16 },
});
