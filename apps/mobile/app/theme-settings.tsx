import { ScrollView, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppStyle } from "@/lib/app-style-context";
import { useTheme } from "@/lib/theme";
import { Section } from "@/components/ui";
import {
  NeonAccentPicker,
  NeonIntensitySlider,
  StyleSelector,
  ThemeModeSelector,
} from "@/components/theme";

export default function ThemeSettingsScreen() {
  const { th } = useTheme();
  const { appStyle } = useAppStyle();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: th.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Section label={t("theme.appearance")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.appearance_help")}</Text>
        <ThemeModeSelector />
      </Section>

      <Section label={t("theme.style")}>
        <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.style_help")}</Text>
        <StyleSelector />
      </Section>

      {appStyle === "2100" ? (
        <>
          <Section label={t("theme.neon_color")}>
            <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.neon_color_help")}</Text>
            <NeonAccentPicker />
          </Section>

          <Section label={t("theme.neon_intensity")}>
            <Text style={[styles.help, { color: th.textSubtle }]}>{t("theme.neon_intensity_help")}</Text>
            <NeonIntensitySlider />
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
});
