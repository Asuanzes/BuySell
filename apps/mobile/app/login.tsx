import { useState } from "react";
import { fonts } from "@/lib/fonts";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type Phase = "email" | "code";

export default function LoginScreen() {
  const { requestOtp, verifyOtp } = useAuth();
  const { t } = useTranslation();
  const { th } = useTheme();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Lógica de auth: SIN CAMBIOS (zona crítica) ──────────────────────────
  async function handleEmail() {
    if (!email.includes("@") || loading) return;
    setLoading(true);
    setError(null);
    try {
      await requestOtp(email.trim().toLowerCase());
      track("login_request");
      setPhase("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error_network"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCode() {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email.trim().toLowerCase(), code);
      track("login_verify_success");
      // useAuth cambiará el estado y el root layout redirigirá a tabs
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.error_code"));
    } finally {
      setLoading(false);
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: th.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.brand}>
          {/* Logo de marca (monograma NK). El PNG ya trae su fondo crema redondeado. */}
          <Image
            source={require("../assets/images/brand-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: th.text }]}>Nidokey</Text>
        </View>

        <View
          style={[
            styles.card,
            th.elevation.sm,
            { backgroundColor: th.surfaceRaised, borderColor: th.border, borderRadius: th.radii.lg },
          ]}
        >
          {phase === "email" ? (
            <>
              <Text style={[styles.heading, { color: th.text }]}>{t("login.heading")}</Text>
              <Text style={[styles.sub, { color: th.textMuted }]}>{t("login.sub")}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t("login.email_placeholder")}
                placeholderTextColor={th.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                editable={!loading}
                style={[
                  styles.input,
                  { backgroundColor: th.surfaceSoft, borderColor: th.border, borderRadius: th.radii.sm, color: th.text },
                ]}
              />
              {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}
              <Button
                label={t("login.send_code")}
                onPress={handleEmail}
                loading={loading}
                disabled={!email.includes("@")}
                style={styles.cta}
              />
            </>
          ) : (
            <>
              <Text style={[styles.heading, { color: th.text }]}>{t("login.code_heading")}</Text>
              <Text style={[styles.sub, { color: th.textMuted }]}>{t("login.code_sub", { email })}</Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("login.code_placeholder")}
                placeholderTextColor={th.textSubtle}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                editable={!loading}
                style={[
                  styles.input,
                  styles.codeInput,
                  { backgroundColor: th.surfaceSoft, borderColor: th.border, borderRadius: th.radii.sm, color: th.text },
                ]}
              />
              {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}
              <Button
                label={t("login.enter")}
                onPress={handleCode}
                loading={loading}
                disabled={code.length !== 6}
                style={styles.cta}
              />
              <Button
                label={t("login.change_email")}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setPhase("email");
                  setCode("");
                  setError(null);
                }}
              />
            </>
          )}
        </View>

        <Text style={[styles.footer, { color: th.textSubtle }]}>{t("login.footer")}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, padding: 24, justifyContent: "center" },
  brand: { alignItems: "center", gap: 8, marginBottom: 32 },
  logo: { width: 64, height: 64 },
  title: { fontSize: 18, fontFamily: fonts.bodySemibold },
  card: {
    padding: 24,
    borderWidth: 1,
    gap: 12,
  },
  heading: { fontSize: 18, fontFamily: fonts.bodySemibold },
  sub: { fontSize: 13, marginBottom: 8 },
  input: {
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  codeInput: {
    fontSize: 24,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    letterSpacing: 8,
    textAlign: "center",
  },
  cta: { marginTop: 4 },
  error: { fontSize: 12 },
  footer: { fontSize: 11, textAlign: "center", marginTop: 24 },
});
