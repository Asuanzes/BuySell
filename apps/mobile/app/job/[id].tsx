import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import RNShare from "react-native-share";
import { useTranslation } from "react-i18next";

import { type BaseRecord, metaField } from "@nidokey/shared";
import { api } from "@/lib/api";
import { useRecord } from "@/lib/hooks/useRecord";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { provinceImage } from "@/lib/records/province-images";
import { ShareOpenActions } from "@/components/ShareOpenActions";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";

/**
 * Ficha propia de un empleo guardado. Muestra los datos scrapeados (lugar,
 * sueldo, contrato, descripción…) sin redirigir a LinkedIn/InfoJobs; ofrece un
 * botón para abrir la oferta original si el usuario quiere.
 */
export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: record, error, loading } = useRecord<BaseRecord>(
    () => api<BaseRecord>(`/api/records/${id}?type=job`),
    [id]
  );
  const [shareChatOpen, setShareChatOpen] = useState(false);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.job.singular") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }
  if (error || !record) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.job.singular") }} />
        <Text style={{ color: th.dangerFg }}>{error?.message ?? t("detail.not_found")}</Text>
      </View>
    );
  }

  const company = metaField<string | null>(record, "company", null);
  const location = metaField<string | null>(record, "location", null);
  const salary = metaField<string | null>(record, "salaryLabel", null) ?? record.primaryValue ?? null;
  const contract = metaField<string | null>(record, "contractType", null);
  const experience = metaField<string | null>(record, "experienceLevel", null);
  const sector = metaField<string | null>(record, "sector", null);
  const remote = metaField<boolean | null>(record, "remote", null);
  const platform = metaField<string | null>(record, "platform", null);
  const description = metaField<string | null>(record, "description", null);
  const url = metaField<string | null>(record, "url", null);
  const applyUrl = metaField<string | null>(record, "applyUrl", null);
  const postedAt = metaField<string | null>(record, "postedAt", null);
  const province = metaField<string | null>(record, "province", null);
  const banner = provinceImage(province);
  const platformLabel =
    platform === "linkedin"
      ? "LinkedIn"
      : platform === "infojobs"
      ? "InfoJobs"
      : platform === "indeed"
      ? "Indeed"
      : t("detail.source_web");

  const rows: [string, string][] = (
    [
      [t("detail.job.row_company"), company],
      [t("detail.job.row_location"), location],
      [t("detail.job.row_contract"), contract],
      [t("detail.job.row_experience"), experience],
      [t("detail.job.row_sector"), sector],
      [t("detail.job.row_modality"), remote ? t("card.remote") : null],
      [t("detail.job.row_posted"), postedAt ? new Date(postedAt).toLocaleDateString("es-ES") : null],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => Boolean(r[1]));

  const externalUrl = applyUrl || url;
  const recordTitle = record.title;
  async function onShare() {
    const msg = [recordTitle, [company, location].filter(Boolean).join(" · "), externalUrl]
      .filter((l): l is string => !!l)
      .join("\n");
    try {
      await RNShare.open({ message: `${msg}\n\nNIDOKEY`, failOnCancel: false });
    } catch {
      // cancelado o sin app de destino → ignorar
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("types.job.singular") }} />
      <ScrollView style={{ backgroundColor: th.bg }} contentContainerStyle={styles.content}>
        {banner && (
          <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" transition={200} />
        )}
        {banner && province && (
          <Text style={[styles.bannerCaption, { color: th.textSubtle }]}>{province} · Wikimedia</Text>
        )}
        <Text style={[styles.title, { color: th.text }]}>{record.title}</Text>
        {(company || location) && (
          <Text style={[styles.sub, { color: th.textMuted }]}>
            {[company, location].filter(Boolean).join(" · ")}
          </Text>
        )}
        {salary && <Text style={[styles.salary, { color: th.accent }]}>{salary}</Text>}

        {rows.length > 0 && (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={[styles.rowKey, { color: th.textSubtle }]}>{k}</Text>
                <Text style={[styles.rowVal, { color: th.text }]}>{v}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Compartir + abrir la oferta original (estilo cripto/mercados),
            a la derecha y encima de la descripción. */}
        <ShareOpenActions
          style={styles.actions}
          onShare={onShare}
          onSendToChat={() => setShareChatOpen(true)}
          onOpen={externalUrl ? () => void Linking.openURL(externalUrl) : undefined}
          openLabel={t("detail.job.view_offer", { source: platformLabel })}
        />

        {description && (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.descTitle, { color: th.textMuted }]}>{t("detail.description")}</Text>
            <Text style={[styles.descText, { color: th.text }]}>{description}</Text>
          </View>
        )}
      </ScrollView>
      <ShareRecordSheet visible={shareChatOpen} onClose={() => setShareChatOpen(false)} type="job" id={id!} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 6, paddingBottom: 40 },
  banner: { width: "100%", height: 150, borderRadius: 12 },
  bannerCaption: { fontSize: 10, textAlign: "right", marginTop: -2 },
  title: { fontSize: 20, fontFamily: fonts.bodyBold },
  sub: { fontSize: 14, marginTop: 2 },
  salary: { fontSize: 18, fontFamily: fonts.bodyBold, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  rowKey: { fontSize: 13 },
  rowVal: { fontSize: 13, fontFamily: fonts.bodySemibold, flexShrink: 1, textAlign: "right" },
  descTitle: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 6 },
  descText: { fontSize: 14, lineHeight: 20 },
  actions: { alignSelf: "flex-end", marginTop: 14 },
});
