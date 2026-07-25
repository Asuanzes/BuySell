import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";
import { Screen, Section } from "@/components/ui";

type Prefs = {
  chatPush: boolean;
  alertsPush: boolean;
  quietStartHour: number | null;
  quietEndHour: number | null;
};

const fetchPrefs = () => api<Prefs>("/api/account/notifications");

/**
 * Ajustes de notificaciones. Requisito de tiendas: el usuario debe poder
 * desactivarlas desde la app. Silenciar solo quita el PUSH — los avisos siguen
 * llegando al chat, así que no se pierde nada.
 */
export default function NotificationSettingsScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data, loading, refetch } = useQuery(fetchPrefs);
  const [saving, setSaving] = useState(false);

  async function patch(body: Partial<Prefs>) {
    setSaving(true);
    try {
      await api("/api/account/notifications", { method: "PATCH", body: JSON.stringify(body) });
      void refetch();
    } catch {
      // best-effort: al refrescar se ve el estado real
      void refetch();
    } finally {
      setSaving(false);
    }
  }

  const quietOn = data?.quietStartHour != null && data?.quietEndHour != null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !data ? (
          <ActivityIndicator color={th.primary} style={styles.loader} />
        ) : (
          <>
            <Section label={t("notifications.channels")}>
              <Row
                label={t("notifications.chat")}
                hint={t("notifications.chat_hint")}
                value={data?.chatPush ?? true}
                disabled={saving}
                onChange={(v) => patch({ chatPush: v })}
              />
              <View style={[styles.sep, { backgroundColor: th.border }]} />
              <Row
                label={t("notifications.alerts")}
                hint={t("notifications.alerts_hint")}
                value={data?.alertsPush ?? true}
                disabled={saving}
                onChange={(v) => patch({ alertsPush: v })}
              />
            </Section>

            <Section label={t("notifications.quiet")}>
              <Row
                label={t("notifications.quiet_enable")}
                hint={t("notifications.quiet_hint")}
                value={quietOn}
                disabled={saving}
                onChange={(v) =>
                  patch(v ? { quietStartHour: 23, quietEndHour: 8 } : { quietStartHour: null, quietEndHour: null })
                }
              />
              {quietOn && (
                <View style={styles.hoursRow}>
                  <HourPicker
                    label={t("notifications.quiet_from")}
                    value={data!.quietStartHour!}
                    onChange={(h) => patch({ quietStartHour: h, quietEndHour: data!.quietEndHour! })}
                  />
                  <HourPicker
                    label={t("notifications.quiet_to")}
                    value={data!.quietEndHour!}
                    onChange={(h) => patch({ quietStartHour: data!.quietStartHour!, quietEndHour: h })}
                  />
                </View>
              )}
            </Section>

            <Text style={[styles.footer, { color: th.textSubtle }]}>{t("notifications.footer")}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const { th } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: th.text }]}>{label}</Text>
        <Text style={[styles.rowHint, { color: th.textSubtle }]}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: th.primarySoft, false: th.border }}
        thumbColor={value ? th.primary : th.textSubtle}
      />
    </View>
  );
}

/** Selector de hora sencillo: toca para avanzar. Sin dependencias nativas. */
function HourPicker({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const { th } = useTheme();
  return (
    <Pressable
      onPress={() => onChange((value + 1) % 24)}
      style={[styles.hourBox, { borderColor: th.border, backgroundColor: th.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}:00`}
    >
      <Text style={[styles.hourLabel, { color: th.textSubtle }]}>{label}</Text>
      <Text style={[styles.hourValue, { color: th.text }]}>{String(value).padStart(2, "0")}:00</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  loader: { marginTop: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  hoursRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  hourBox: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  hourLabel: { fontSize: 11 },
  hourValue: { fontSize: 18, fontVariant: ["tabular-nums"], marginTop: 2 },
  footer: { fontSize: 11, textAlign: "center", paddingHorizontal: 16, paddingTop: 8, lineHeight: 15 },
});
