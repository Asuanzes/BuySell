import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
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

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import type { I18nKey } from "@/lib/i18n/keys";
import { useQuery } from "@/lib/hooks/useQuery";
import { Button } from "@/components/ui";
import {
  createAlert,
  deleteAlert,
  listAlerts,
  setAlertActive,
  type AlertKind,
  type PriceAlert,
} from "@/lib/alerts";

/**
 * Alertas de precio de un registro: lista + creación. Sin dependencias nativas
 * (Modal de React Native, igual que CategoryContextSheet).
 *
 * El servidor es la autoridad: valida pertenencia, cuota del plan y rechaza
 * condiciones que ya se cumplen. Aquí solo se muestran sus errores.
 */
export function AlertsSheet({
  visible,
  onClose,
  recordType,
  recordId,
  /** "rent" para vigilar la renta de un alquiler (solo inmuebles). */
  field = "price",
  currency = "EUR",
  /** Permite alertas de cambio de estado (vendido/retirado): solo inmuebles. */
  allowStatus = false,
}: {
  visible: boolean;
  onClose: () => void;
  recordType: string;
  recordId: string;
  field?: "price" | "rent";
  currency?: string;
  allowStatus?: boolean;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, loading, refetch } = useQuery(() => listAlerts(recordType, recordId));
  const [kind, setKind] = useState<AlertKind>("PRICE_BELOW");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const kinds: { k: AlertKind; labelKey: I18nKey }[] = [
    { k: "PRICE_BELOW", labelKey: "alerts.kind_below" },
    { k: "PRICE_ABOVE", labelKey: "alerts.kind_above" },
    { k: "PRICE_DROP_PCT", labelKey: "alerts.kind_drop_pct" },
    ...(allowStatus ? ([{ k: "STATUS_CHANGE" as AlertKind, labelKey: "alerts.kind_status" as const }]) : []),
  ];

  async function submit() {
    setBusy(true);
    setError(null);
    setUpgrade(false);
    try {
      // Precios en céntimos (convención del proyecto); el porcentaje es entero.
      const n = Number(value.replace(",", "."));
      const threshold =
        kind === "STATUS_CHANGE"
          ? undefined
          : kind === "PRICE_DROP_PCT"
            ? Math.round(n)
            : Math.round(n * 100);
      if (kind !== "STATUS_CHANGE" && (!Number.isFinite(n) || n <= 0)) {
        setError(t("alerts.invalid_value"));
        return;
      }
      await createAlert({ recordType, recordId, kind, field, threshold });
      setValue("");
      void refetch();
    } catch (e) {
      const body = (e as { body?: { error?: string; upgrade?: boolean } }).body;
      if (body?.upgrade) setUpgrade(true);
      setError(body?.error ?? (e instanceof Error ? e.message : t("alerts.create_error")));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: PriceAlert) {
    try {
      await setAlertActive(a.id, !a.active);
      void refetch();
    } catch (e) {
      const body = (e as { body?: { error?: string; upgrade?: boolean } }).body;
      if (body?.upgrade) setUpgrade(true);
      setError(body?.error ?? t("alerts.create_error"));
    }
  }

  async function remove(a: PriceAlert) {
    try {
      await deleteAlert(a.id);
      void refetch();
    } catch {
      setError(t("alerts.create_error"));
    }
  }

  function describe(a: PriceAlert): string {
    const amount =
      a.threshold == null
        ? ""
        : a.kind === "PRICE_DROP_PCT"
          ? `${a.threshold} %`
          : (a.threshold / 100).toLocaleString("es-ES", { style: "currency", currency });
    if (a.kind === "STATUS_CHANGE") return t("alerts.desc_status");
    if (a.kind === "PRICE_BELOW") return t("alerts.desc_below", { amount });
    if (a.kind === "PRICE_ABOVE") return t("alerts.desc_above", { amount });
    return t("alerts.desc_drop_pct", { amount });
  }

  const atLimit = !!data && data.activeCount >= data.limit;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: th.surface, borderColor: th.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: th.border }]} />
        <Text style={[styles.title, { color: th.text }]}>{t("alerts.title")}</Text>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          {loading && !data ? (
            <ActivityIndicator color={th.primary} style={styles.loader} />
          ) : (
            <>
              {data?.alerts.length === 0 && (
                <Text style={[styles.empty, { color: th.textMuted }]}>{t("alerts.empty")}</Text>
              )}

              {data?.alerts.map((a) => (
                <View key={a.id} style={[styles.row, { borderColor: th.border }]}>
                  <Ionicons
                    name={a.active ? "notifications-outline" : "notifications-off-outline"}
                    size={18}
                    color={a.active ? th.primary : th.textSubtle}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: th.text }]}>{describe(a)}</Text>
                    <Text style={[styles.rowHint, { color: th.textSubtle }]}>
                      {a.active ? t("alerts.state_active") : t("alerts.state_fired")}
                      {a.field === "rent" ? ` · ${t("alerts.on_rent")}` : ""}
                    </Text>
                  </View>
                  <Pressable onPress={() => toggle(a)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name={a.active ? "pause-outline" : "refresh-outline"} size={18} color={th.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => remove(a)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={th.dangerFg} />
                  </Pressable>
                </View>
              ))}

              {data && (
                <Text style={[styles.quota, { color: th.textSubtle }]}>
                  {t("alerts.quota", { used: data.activeCount, limit: data.limit })}
                </Text>
              )}

              {/* Creación */}
              <Text style={[styles.sectionLabel, { color: th.textMuted }]}>{t("alerts.new")}</Text>
              <View style={styles.chipRow}>
                {kinds.map((k) => {
                  const on = kind === k.k;
                  return (
                    <Pressable
                      key={k.k}
                      onPress={() => setKind(k.k)}
                      style={[
                        styles.chip,
                        { borderColor: on ? th.primary : th.border, backgroundColor: on ? th.primarySoft : "transparent" },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: on ? th.primary : th.textMuted }]}>{t(k.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {kind !== "STATUS_CHANGE" && (
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  keyboardType="decimal-pad"
                  placeholder={kind === "PRICE_DROP_PCT" ? t("alerts.placeholder_pct") : t("alerts.placeholder_price")}
                  placeholderTextColor={th.textSubtle}
                  style={[styles.input, { color: th.text, borderColor: th.border, backgroundColor: th.bg }]}
                />
              )}

              {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}
              {upgrade && (
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push("/premium?from=alerts" as never);
                  }}
                >
                  <Text style={[styles.upgradeLink, { color: th.primary }]}>{t("alerts.go_premium")}</Text>
                </Pressable>
              )}

              <Button
                label={t("alerts.create")}
                icon="add-outline"
                onPress={submit}
                loading={busy}
                disabled={busy || atLimit}
                style={styles.createBtn}
              />
              {atLimit && (
                <Text style={[styles.rowHint, { color: th.textSubtle, textAlign: "center" }]}>
                  {t("alerts.limit_reached")}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 10 },
  title: { fontSize: 16, fontFamily: fonts.bodyBold, paddingHorizontal: 4, marginBottom: 8 },
  scroll: { flexGrow: 0 },
  loader: { marginVertical: 24 },
  empty: { fontSize: 13, paddingHorizontal: 4, paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: fonts.bodyMedium },
  rowHint: { fontSize: 12, marginTop: 1 },
  iconBtn: { padding: 4 },
  quota: { fontSize: 11, textAlign: "right", paddingHorizontal: 4, paddingTop: 6 },
  sectionLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, paddingHorizontal: 4, marginTop: 14, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontFamily: fonts.bodyMedium },
  input: {
    marginTop: 10,
    marginHorizontal: 4,
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  error: { fontSize: 12, paddingHorizontal: 4, paddingTop: 8 },
  upgradeLink: { fontSize: 13, paddingHorizontal: 4, paddingTop: 6, textDecorationLine: "underline" },
  createBtn: { marginTop: 12, marginHorizontal: 4 },
});
