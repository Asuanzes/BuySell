import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { normalizeUsername, usernameError, type RecordType } from "@nidokey/shared";

import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics";
import { checkUsername, updateAccount } from "@/lib/chat/account";
import { useCategoryPrefs, DEFAULT_CATEGORY } from "@/lib/records/category-prefs-context";
import { RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { useTypeI18n } from "@/lib/records/type-i18n";
import { useAppStyle } from "@/lib/app-style-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button, Chip, Screen, Section } from "@/components/ui";
import { NeonAccentPicker, StyleSelector, ThemeModeSelector } from "@/components/theme";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "saving";

const STEPS = ["username", "categories", "theme", "language"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const { state, markOnboardingComplete } = useAuth();
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [usernameDone, setUsernameDone] = useState(false);
  const step = STEPS[stepIndex]!;

  // Android: el botón/gesto "atrás" del sistema retrocede UN paso del onboarding.
  // Antes no hacía nada útil (AuthGate revierte cualquier salida del flujo). En el
  // primer paso se deja el comportamiento por defecto del SO (minimizar la app).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stepIndex > 0 && !saving) {
        setStepIndex((i) => Math.max(0, i - 1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stepIndex, saving]);

  if (state.kind !== "authed") return null;

  async function finish() {
    setSaving(true);
    try {
      await updateAccount({ onboardingCompleted: true });
      await markOnboardingComplete();
      track("onboarding_complete");
      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  }

  const canGoBack = stepIndex > 0 && !saving;
  const isLast = stepIndex === STEPS.length - 1;
  const canContinue = step !== "username" || usernameDone;

  return (
    <Screen background title={t("onboarding.title")} subtitle={t("onboarding.subtitle")}>
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              {
                backgroundColor: i <= stepIndex ? th.primary : th.border,
                opacity: i <= stepIndex ? 1 : 0.7,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === "username" ? (
          <UsernameStep
            email={state.user.email}
            name={state.user.name}
            username={state.user.username}
            onSavedChange={setUsernameDone}
          />
        ) : null}
        {step === "categories" ? <CategoriesStep /> : null}
        {step === "theme" ? <ThemeStep /> : null}
        {step === "language" ? <LanguageStep /> : null}
      </ScrollView>

      {/* paddingBottom dinámico: el footer va pegado al borde y Screen solo
          protege el top → sin esto los botones quedan bajo la barra de navegación
          de Android (o el home indicator de iOS). insets.bottom=0 cuando no aplica. */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: th.border,
            backgroundColor: th.surfaceRaised,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <Button
          label={t("common.back")}
          variant="secondary"
          disabled={!canGoBack}
          onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
          fullWidth={false}
          style={styles.footerButton}
        />
        <Button
          label={isLast ? t("onboarding.finish") : t("onboarding.next")}
          loading={saving}
          disabled={!canContinue}
          onPress={() => {
            if (isLast) void finish();
            else setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
          }}
          fullWidth={false}
          style={styles.footerButton}
        />
      </View>
    </Screen>
  );
}

function UsernameStep({
  email,
  name,
  username,
  onSavedChange,
}: {
  email: string;
  name: string | null;
  username: string | null;
  onSavedChange: (done: boolean) => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(username ?? "");
  const [status, setStatus] = useState<UsernameStatus>(username ? "available" : "idle");
  const [message, setMessage] = useState<string | null>(null);

  const normalized = normalizeUsername(value);
  const valid = !usernameError(normalized);

  useEffect(() => {
    onSavedChange(!!username && normalized === username);
  }, [normalized, onSavedChange, username]);

  useEffect(() => {
    if (!normalized) {
      setStatus("idle");
      return;
    }
    if (!valid) {
      setStatus("invalid");
      return;
    }
    if (normalized === username) {
      setStatus("available");
      return;
    }
    setStatus("checking");
    const id = setTimeout(async () => {
      try {
        const r = await checkUsername(normalized);
        setStatus(r.available ? "available" : r.reason === "taken" ? "taken" : "invalid");
      } catch {
        setStatus("idle");
      }
    }, 350);
    return () => clearTimeout(id);
  }, [normalized, username, valid]);

  async function save() {
    if (!valid || status !== "available") return;
    setStatus("saving");
    setMessage(null);
    try {
      await updateAccount({ name: name || normalized || email, username: normalized });
      setMessage(t("account.username_saved"));
      onSavedChange(true);
      setStatus("available");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setStatus(msg.includes("taken") ? "taken" : "invalid");
    }
  }

  const hint =
    status === "checking"
      ? t("account.username_checking")
      : status === "available"
        ? message ?? t("account.username_available")
        : status === "taken"
          ? t("account.username_taken")
          : status === "invalid"
            ? t("account.username_invalid")
            : t("account.username_hint");
  const hintColor =
    status === "available"
      ? "#15803D"
      : status === "taken" || status === "invalid"
        ? th.dangerFg
        : th.textSubtle;

  return (
    <Section label={t("onboarding.username_title")}>
      <Text style={[styles.help, { color: th.textSubtle }]}>{t("onboarding.username_help")}</Text>
      <View style={styles.usernameRow}>
        <View style={[styles.inputBox, { backgroundColor: th.bg, borderColor: th.border }]}>
          <Text style={[styles.at, { color: th.textSubtle }]}>@</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={t("account.username_placeholder")}
            placeholderTextColor={th.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            style={[styles.input, { color: th.text }]}
          />
          {status === "checking" || status === "saving" ? <ActivityIndicator size="small" color={th.primary} /> : null}
          {status === "available" ? <Ionicons name="checkmark-circle" size={18} color="#15803D" /> : null}
          {status === "taken" || status === "invalid" ? <Ionicons name="close-circle" size={18} color={th.dangerFg} /> : null}
        </View>
        <Pressable
          onPress={() => void save()}
          disabled={!valid || status !== "available"}
          style={[
            styles.saveButton,
            { backgroundColor: valid && status === "available" ? th.primary : th.border },
          ]}
        >
          <Text style={[styles.saveText, { color: th.primaryFg }]}>{t("common.save")}</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: hintColor }]}>{hint}</Text>
    </Section>
  );
}

function CategoriesStep() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { label } = useTypeI18n();
  const { managed, orderedVisible, startCategory, setStartCategory, toggleHidden } = useCategoryPrefs();
  const startOptions = orderedVisible.filter((tp) => RECORD_TYPE_CONFIG[tp].enabled);
  const effectiveStart =
    (startCategory && startOptions.includes(startCategory) && startCategory) ||
    (startOptions.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : startOptions[0]);

  return (
    <>
      <Section label={t("onboarding.categories_title")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("onboarding.categories_help")}</Text>
        <View style={styles.chips}>
          {managed.map((m) => (
            <Chip
              key={m.type}
              label={label(m.type)}
              leading={<CategoryIcon type={m.type} size={14} color={m.hidden ? th.textSubtle : undefined} />}
              selected={!m.hidden}
              onPress={() => toggleHidden(m.type)}
            />
          ))}
        </View>
      </Section>

      <Section label={t("catsettings.start_title")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("catsettings.start_help")}</Text>
        <View style={styles.chips}>
          {startOptions.map((tp: RecordType) => (
            <Chip
              key={tp}
              label={label(tp)}
              leading={<CategoryIcon type={tp} size={14} color={tp === effectiveStart ? th.primaryFg : undefined} />}
              selected={tp === effectiveStart}
              onPress={() => setStartCategory(tp)}
            />
          ))}
        </View>
      </Section>
    </>
  );
}

function ThemeStep() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { appStyle } = useAppStyle();

  return (
    <>
      <Section label={t("theme.appearance")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.appearance_help")}</Text>
        <ThemeModeSelector />
      </Section>
      <Section label={t("theme.style")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.style_help")}</Text>
        <StyleSelector />
      </Section>
      {appStyle === "2100" ? (
        <Section label={t("theme.neon_color")}>
          <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.neon_color_help")}</Text>
          <NeonAccentPicker />
        </Section>
      ) : null}
    </>
  );
}

function LanguageStep() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { pref, setLanguage } = useLanguage();
  const options = useMemo(() => [{ code: "auto" as const, label: t("settings.language.auto") }, ...LANGUAGES.map((l) => ({ code: l.code, label: l.nameNative }))], [t]);

  return (
    <Section label={t("onboarding.language_title")}>
      <Text style={[styles.help, { color: th.textSubtle }]}>{t("onboarding.language_help")}</Text>
      <View style={styles.chips}>
        {options.map((opt) => (
          <Chip
            key={opt.code}
            label={opt.label}
            selected={pref === opt.code}
            onPress={() => setLanguage(opt.code)}
          />
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  progressDot: { width: 34, height: 4, borderRadius: 999 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 10, fontFamily: fonts.body },
  usernameRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  inputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  at: { fontSize: 15, fontFamily: fonts.bodySemibold },
  input: { flex: 1, fontSize: 15, padding: 0, fontFamily: fonts.body },
  saveButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  saveText: { fontSize: 13, fontFamily: fonts.bodySemibold },
  hint: { fontSize: 11, marginTop: 6, fontFamily: fonts.body },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  footerButton: { flex: 1 },
});
