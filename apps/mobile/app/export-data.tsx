import { useState } from "react";
import { ScrollView, Share, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme";
import { Button, Screen, Section } from "@/components/ui";

/**
 * Exportación de datos (RGPD, portabilidad): descarga GET /api/account/export
 * y abre la hoja de compartir del sistema con el JSON. Un archivo adjunto,
 * envío por email o CSV exigirían módulos nativos o backend nuevo — v1 comparte
 * el JSON como texto, que cubre la portabilidad con lo que hay en el binario.
 */
export default function ExportDataScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<unknown>("/api/account/export");
      track("account_export");
      await Share.share({
        title: t("account.export_title"),
        message: JSON.stringify(data, null, 2),
      });
    } catch {
      setError(t("account.export_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section>
          <Text style={[styles.description, { color: th.text }]}>{t("account.export_description")}</Text>
          <Text style={[styles.note, { color: th.textSubtle }]}>{t("account.export_privacy_note")}</Text>
          {error ? <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text> : null}
          <Button
            label={t("account.export_download")}
            icon="download-outline"
            onPress={exportData}
            loading={busy}
            disabled={busy}
            style={styles.button}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  description: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  error: { fontSize: 13, marginTop: 8 },
  button: { marginTop: 14 },
});
