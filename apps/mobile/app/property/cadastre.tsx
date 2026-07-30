import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useRecord } from "@/lib/hooks/useRecord";
import { fetchPropertyDetail, type PropertyDetail } from "@/lib/records/property";
import {
  lookupCadastre,
  parseCadastralData,
  sedeCatastroUrl,
  type CadastreCandidate,
  type CadastreLookupResult,
} from "@/lib/records/cadastre";
import { Button, Card, ResultModal } from "@/components/ui";

type Notice = { tone: "success" | "error" | "info"; title: string; message?: string };

/**
 * Detalle catastral de un inmueble (visualización progresiva).
 *
 * Los datos vienen de la Sede Electrónica del Catastro (OVC) vía nuestro
 * backend; son informativos, nunca certificación. Los datos del ANUNCIO y los
 * del CATASTRO se muestran lado a lado con su procedencia — jamás se pisan.
 */
export default function CadastreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  const { data: p, error, refetch } = useRecord<PropertyDetail>(
    () => fetchPropertyDetail(id!),
    [id],
    { enabled: !!id }
  );

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [candidates, setCandidates] = useState<CadastreCandidate[] | null>(null);
  const [addressFix, setAddressFix] = useState("");
  const [manualRef, setManualRef] = useState("");

  const view = useMemo(() => (p ? parseCadastralData(p.cadastralData) : null), [p]);

  function errorNotice(r: CadastreLookupResult): Notice {
    const title = t("detail.cadastre.title");
    switch (r.kind) {
      case "unavailable":
        return { tone: "error", title, message: t("detail.cadastre.error_unavailable") };
      case "rate_limited":
        return { tone: "error", title, message: t("detail.cadastre.error_rate_limited") };
      case "ref_invalid":
        return { tone: "error", title, message: t("detail.cadastre.error_ref_invalid") };
      case "not_found":
        return {
          tone: "info",
          title,
          message: [t("detail.cadastre.error_not_found"), ...(r.warnings ?? [])].join("\n"),
        };
      default:
        return { tone: "error", title, message: t("detail.cadastre.error_generic") };
    }
  }

  async function consult(body: Parameters<typeof lookupCadastre>[1] = {}) {
    if (!id || busy) return;
    setBusy(true);
    try {
      const r = await lookupCadastre(id, body);
      if (r.kind === "ok") {
        setCandidates(null);
        await refetch();
        setNotice({
          tone: "success",
          title: t("detail.cadastre.title"),
          message: r.cached ? t("detail.cadastre.updated_cached") : t("detail.cadastre.updated_ok"),
        });
        return;
      }
      if (r.kind === "ambiguous") {
        setCandidates(r.candidates);
        return;
      }
      setNotice(errorNotice(r));
    } finally {
      setBusy(false);
    }
  }

  async function copyRef(ref: string) {
    await Clipboard.setStringAsync(ref);
    setNotice({ tone: "success", title: t("detail.cadastre.copied") });
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("detail.cadastre.title") }} />
        <Text style={{ color: th.dangerFg, fontSize: 13 }}>{error.message}</Text>
      </View>
    );
  }
  if (!p) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("detail.cadastre.title") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  const info = view?.info ?? null;
  const locale = i18n.language === "en" ? "en-GB" : "es-ES";
  const fetchedLabel =
    view?.fetchedAt != null ? new Date(view.fetchedAt).toLocaleString(locale) : null;

  // Comparación anuncio ↔ Catastro con tolerancias: superficie ±10 %, año ±2.
  const surfaceMismatch =
    info?.builtArea != null && p.builtArea != null &&
    Math.abs(info.builtArea - p.builtArea) > p.builtArea * 0.1;
  const yearMismatch =
    info?.yearBuilt != null && p.yearBuilt != null && Math.abs(info.yearBuilt - p.yearBuilt) > 2;
  const anyMismatch = surfaceMismatch || yearMismatch;

  return (
    <ScrollView style={{ backgroundColor: th.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("detail.cadastre.title") }} />

      {/* ── Candidatos: la elección es SIEMPRE del usuario ── */}
      {candidates && (
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: th.textMuted }]}>
            {t("detail.cadastre.candidates_title")}
          </Text>
          <Text style={[styles.help, { color: th.textMuted }]}>
            {t("detail.cadastre.candidates_help")}
          </Text>
          {candidates.map((c) => (
            <TouchableOpacity
              key={c.ref}
              style={[styles.candidateRow, { borderBottomColor: th.border }]}
              disabled={busy}
              onPress={() => void consult({ ref: c.ref })}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.mono, { color: th.text, fontSize: 12 }]}>{c.ref}</Text>
                <Text style={{ color: th.textMuted, fontSize: 12, marginTop: 2 }}>
                  {[
                    c.address,
                    c.block && `${t("detail.cadastre.block")} ${c.block}`,
                    c.stair && `${t("detail.cadastre.stair")} ${c.stair}`,
                    c.floor && `${t("detail.cadastre.floor")} ${c.floor}`,
                    c.door && `${t("detail.cadastre.door")} ${c.door}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={th.primary} />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {/* ── Sin datos todavía ── */}
      {!info && !candidates && (
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: th.textMuted }]}>
            {t("detail.cadastre.empty_title")}
          </Text>
          <Text style={[styles.help, { color: th.textMuted }]}>
            {t("detail.cadastre.empty_help")}
          </Text>
          <Button
            label={t("detail.cadastre.consult")}
            icon="cloud-download-outline"
            loading={busy}
            onPress={() => void consult({ force: true })}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      {info && (
        <>
          {/* ── 1. Resumen ── */}
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: th.textMuted }]}>
              {t("detail.cadastre.summary")}
            </Text>
            <Text selectable style={[styles.mono, { color: th.text }]}>{info.ref}</Text>
            <View style={styles.chipRow}>
              {info.landType && (
                <Text style={[styles.chip, { backgroundColor: th.primarySoft, color: th.primary }]}>
                  {info.landType === "UR"
                    ? t("detail.cadastre.land_urban")
                    : t("detail.cadastre.land_rustic")}
                </Text>
              )}
              {info.use && (
                <Text style={[styles.chip, { backgroundColor: th.primarySoft, color: th.primary }]}>
                  {info.use}
                </Text>
              )}
            </View>
            <View style={styles.actionsRow}>
              <MiniAction icon="copy-outline" label={t("detail.cadastre.copy_ref")} onPress={() => void copyRef(info.ref)} />
              <MiniAction icon="open-outline" label={t("detail.cadastre.open_sede")} onPress={() => void Linking.openURL(sedeCatastroUrl(info.ref))} />
              <MiniAction icon="refresh-outline" label={t("detail.cadastre.refresh")} busy={busy} onPress={() => void consult({ force: true })} />
            </View>
          </Card>

          {/* ── 2. Localización ── */}
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: th.textMuted }]}>
              {t("detail.cadastre.section_location")}
            </Text>
            <InfoRow label={t("detail.cadastre.address")} value={info.address} />
            <InfoRow label={t("detail.cadastre.municipality")} value={info.municipality} />
            <InfoRow label={t("detail.cadastre.province")} value={info.province} />
            <InfoRow label={t("detail.cadastre.postal_code")} value={info.postalCode} />
            <InfoRow label={t("detail.cadastre.block")} value={info.block} />
            <InfoRow label={t("detail.cadastre.stair")} value={info.stair} />
            <InfoRow label={t("detail.cadastre.floor")} value={info.floor} />
            <InfoRow label={t("detail.cadastre.door")} value={info.door} />
          </Card>

          {/* ── 3. Superficies y construcción ── */}
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: th.textMuted }]}>
              {t("detail.cadastre.section_construction")}
            </Text>
            <InfoRow
              label={t("detail.cadastre.built_area")}
              value={info.builtArea != null ? `${info.builtArea} m²` : undefined}
            />
            <InfoRow
              label={t("detail.cadastre.plot_area")}
              value={info.plotArea != null ? `${info.plotArea} m²` : undefined}
            />
            <InfoRow label={t("detail.cadastre.year")} value={info.yearBuilt?.toString()} />
            <InfoRow label={t("detail.cadastre.use")} value={info.use} />
            <InfoRow label={t("detail.cadastre.participation")} value={info.participation} />
            {info.units && info.units.length > 0 && (
              <>
                <Text style={[styles.subTitle, { color: th.textMuted }]}>
                  {t("detail.cadastre.section_units")}
                </Text>
                {info.units.map((u, i) => (
                  <View key={i} style={[styles.unitRow, { borderBottomColor: th.border }]}>
                    <Text style={{ color: th.text, fontSize: 13, flex: 1 }}>
                      {[u.use, [u.stair && `Esc ${u.stair}`, u.floor && `Pl ${u.floor}`, u.door && `Pt ${u.door}`].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                    <Text style={{ color: th.textMuted, fontSize: 13 }}>
                      {u.area != null ? `${u.area} m²` : "—"}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Card>

          {/* ── 4. Anuncio vs Catastro (procedencia siempre visible) ── */}
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: th.textMuted }]}>
              {t("detail.cadastre.section_compare")}
            </Text>
            <CompareRow
              label={t("detail.cadastre.compare_surface")}
              listing={p.builtArea != null ? `${p.builtArea} m²` : null}
              cadastre={info.builtArea != null ? `${info.builtArea} m²` : null}
              mismatch={surfaceMismatch}
            />
            <CompareRow
              label={t("detail.cadastre.compare_year")}
              listing={p.yearBuilt?.toString() ?? null}
              cadastre={info.yearBuilt?.toString() ?? null}
              mismatch={yearMismatch}
            />
            <CompareRow
              label={t("detail.cadastre.compare_address")}
              listing={p.address}
              cadastre={info.address ?? null}
            />
            {anyMismatch && (
              <Text style={[styles.help, { color: th.textMuted, marginTop: 8 }]}>
                {t("detail.cadastre.discrepancy_note")}
              </Text>
            )}
          </Card>
        </>
      )}

      {/* ── Ajustes de búsqueda: corregir dirección / RC manual ── */}
      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: th.textMuted }]}>
          {t("detail.cadastre.fix_address_title")}
        </Text>
        <TextInput
          value={addressFix}
          onChangeText={setAddressFix}
          placeholder={t("detail.cadastre.fix_address_placeholder")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, { color: th.text, borderColor: th.border }]}
          autoCapitalize="none"
        />
        <Button
          label={t("detail.cadastre.retry_with_address")}
          variant="secondary"
          size="sm"
          disabled={!addressFix.trim()}
          loading={busy}
          onPress={() => void consult({ address: addressFix.trim(), force: true })}
          style={{ marginTop: 8 }}
        />
        <Text style={[styles.cardTitle, { color: th.textMuted, marginTop: 16 }]}>
          {t("detail.cadastre.manual_ref_title")}
        </Text>
        <TextInput
          value={manualRef}
          onChangeText={setManualRef}
          placeholder={t("detail.cadastre.manual_ref_placeholder")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, styles.mono, { color: th.text, borderColor: th.border }]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button
          label={t("detail.cadastre.lookup_by_ref")}
          variant="secondary"
          size="sm"
          disabled={!manualRef.trim()}
          loading={busy}
          onPress={() => void consult({ ref: manualRef.trim() })}
          style={{ marginTop: 8 }}
        />
      </Card>

      {/* ── Fuente ── */}
      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: th.textMuted }]}>
          {t("detail.cadastre.section_source")}
        </Text>
        <Text style={{ color: th.text, fontSize: 13 }}>{view?.source ?? "Sede Electrónica del Catastro (OVC)"}</Text>
        {fetchedLabel && (
          <Text style={{ color: th.textMuted, fontSize: 12, marginTop: 4 }}>
            {t("detail.cadastre.updated_at", { date: fetchedLabel })}
          </Text>
        )}
        <Text style={[styles.help, { color: th.textMuted, marginTop: 8 }]}>
          {t("detail.cadastre.source_note")}
        </Text>
      </Card>

      <ResultModal
        visible={!!notice}
        tone={notice?.tone ?? "info"}
        title={notice?.title ?? ""}
        message={notice?.message}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const { th } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: th.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: th.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function CompareRow({
  label,
  listing,
  cadastre,
  mismatch,
}: {
  label: string;
  listing: string | null;
  cadastre: string | null;
  mismatch?: boolean;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  if (listing == null && cadastre == null) return null;
  return (
    <View style={[styles.compareRow, { borderBottomColor: th.border }]}>
      <Text style={[styles.compareLabel, { color: th.textMuted }]}>{label}</Text>
      <View style={styles.compareCell}>
        <Text style={[styles.compareTag, { color: th.textSubtle }]}>{t("detail.cadastre.compare_listing")}</Text>
        <Text style={{ color: th.text, fontSize: 13 }}>{listing ?? "—"}</Text>
      </View>
      <View style={styles.compareCell}>
        <Text style={[styles.compareTag, { color: th.textSubtle }]}>{t("detail.cadastre.compare_cadastre")}</Text>
        <Text style={{ color: mismatch ? th.dangerFg : th.text, fontSize: 13 }}>{cadastre ?? "—"}</Text>
      </View>
    </View>
  );
}

function MiniAction({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const { th } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.miniAction, { borderColor: th.border }]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={th.primary} />
      ) : (
        <Ionicons name={icon} size={16} color={th.primary} />
      )}
      <Text style={{ color: th.text, fontSize: 11, marginTop: 4, textAlign: "center" }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 40, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { padding: 16 },
  cardTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  help: { fontSize: 12, lineHeight: 17 },
  mono: { fontFamily: "monospace", fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 11,
    overflow: "hidden",
  },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  miniAction: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 12 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 13, flexShrink: 1, textAlign: "right" },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  compareRow: { paddingVertical: 8, borderBottomWidth: 1 },
  compareLabel: { fontSize: 11, marginBottom: 4 },
  compareCell: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  compareTag: { fontSize: 11 },
});
