import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts } from "@/lib/fonts";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";

import {
  type BaseRecord,
  metaField,
  formatMoney,
  type TransportLeg,
  type AccommodationChoice,
} from "@nidokey/shared";
import { api } from "@/lib/api";
import { useRecord } from "@/lib/hooks/useRecord";
import { useTheme } from "@/lib/theme";
import { ShareOpenActions } from "@/components/ShareOpenActions";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";

/**
 * Ficha de un VIAJE guardado (record `holiday`). Muestra destino, fechas,
 * alojamiento y desplazamiento con sus precios y el Total. Botones para reservar
 * (in-app browser). ⚠️ La comisión es interna: NUNCA se lee ni se pinta aquí.
 */
export default function HolidayDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: record, error, loading } = useRecord<BaseRecord>(
    () => api<BaseRecord>(`/api/records/${id}?type=holiday`),
    [id]
  );
  const [shareChatOpen, setShareChatOpen] = useState(false);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.holiday.singular") }} />
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }
  if (error || !record) {
    return (
      <View style={[styles.center, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ title: t("types.holiday.singular") }} />
        <Text style={{ color: th.dangerFg }}>{error?.message ?? t("detail.not_found")}</Text>
      </View>
    );
  }

  const destination = metaField<string | null>(record, "destination", null);
  const accommodation = metaField<AccommodationChoice | null>(record, "accommodation", null);
  const transport = metaField<TransportLeg | null>(record, "transport", null);
  const transportReturn = metaField<TransportLeg | null>(record, "transportReturn", null);
  const transfer = metaField<TransportLeg | null>(record, "transfer", null);
  const tripType = metaField<string | null>(record, "tripType", null);
  const occupancy = metaField<{ adults: number; children: number[] }[] | null>(record, "occupancy", null);
  const booking = metaField<{ hotelRef?: string | null; flightRef?: string | null } | null>(record, "booking", null);
  // ⚠️ NO leer metaField(record, "commission", …): es interno, no se pinta.

  const statusLabel =
    record.status === "BOOKED"
      ? t("detail.holiday.status_booked")
      : record.status === "PLANNING"
      ? t("detail.holiday.status_planning")
      : null;
  const bookingRefs = booking
    ? [
        booking.hotelRef ? t("detail.holiday.ref_hotel", { ref: booking.hotelRef }) : null,
        booking.flightRef ? t("detail.holiday.ref_flight", { ref: booking.flightRef }) : null,
      ]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  const childCount = occupancy ? occupancy.flatMap((r) => r.children ?? []).length : 0;
  const occSummary =
    occupancy && occupancy.length
      ? [
          t("detail.holiday.rooms", { count: occupancy.length }),
          t("detail.holiday.adults", {
            count: occupancy.reduce((s, r) => s + (r.adults ?? 0), 0),
          }),
          childCount ? t("detail.holiday.children", { count: childCount }) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const rows: [string, string][] = (
    [
      [t("detail.holiday.row_status"), statusLabel],
      [t("detail.holiday.row_destination"), destination],
      [t("detail.holiday.row_type"), tripType],
      [t("detail.holiday.row_dates"), record.subtitle],
      [t("detail.holiday.row_travelers"), occSummary],
      [t("detail.holiday.row_booking"), bookingRefs],
      [
        t("detail.holiday.row_accommodation"),
        accommodation
          ? `${accommodation.name}${accommodation.priceCents != null ? ` · ${formatMoney(accommodation.priceCents, accommodation.currency ?? "EUR")}` : ""}`
          : null,
      ],
      [
        t("detail.holiday.row_transport"),
        transport
          ? `${transport.provider ?? t("detail.holiday.flight_fallback")}${transport.priceCents != null ? ` · ${formatMoney(transport.priceCents, transport.currency ?? "EUR")}` : ""}`
          : null,
      ],
      [
        // Billete partido: la vuelta es otra compra y su importe ya va incluido
        // en el transporte, por eso aquí solo se enseña compañía y fecha.
        t("detail.holiday.row_transport_return"),
        transportReturn
          ? `${transportReturn.provider ?? t("detail.holiday.flight_fallback")}${transportReturn.departISO ? ` · ${transportReturn.departISO.slice(0, 10)}` : ""}`
          : null,
      ],
      [
        t("detail.holiday.row_transfer"),
        transfer
          ? `${transfer.provider ?? t("detail.holiday.transfer_fallback")}${transfer.priceCents != null ? ` · ${formatMoney(transfer.priceCents, transfer.currency ?? "EUR")}` : ""}`
          : null,
      ],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => Boolean(r[1]));

  return (
    <>
      <Stack.Screen options={{ title: t("types.holiday.singular") }} />
      <ScrollView style={{ backgroundColor: th.bg }} contentContainerStyle={styles.content}>
        {record.imageUrl ? (
          <Image source={{ uri: record.imageUrl }} style={styles.hero} contentFit="cover" transition={200} />
        ) : null}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: th.text }]}>{record.title}</Text>
            {record.primaryValue ? (
              <Text style={[styles.total, { color: th.accent }]}>{record.primaryValue}</Text>
            ) : null}
          </View>
          <ShareOpenActions onSendToChat={() => setShareChatOpen(true)} />
        </View>

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

        {accommodation?.affiliateUrl ? (
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(accommodation.affiliateUrl!)}
            style={[styles.outlineBtn, { borderColor: th.border }]}
          >
            <Ionicons name="bed-outline" size={18} color={th.accent} />
            <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_hotel")}</Text>
          </Pressable>
        ) : null}
        {transport?.affiliateUrl ? (
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(transport.affiliateUrl!)}
            style={[styles.outlineBtn, { borderColor: th.border }]}
          >
            <Ionicons name="airplane-outline" size={18} color={th.accent} />
            <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_flight")}</Text>
          </Pressable>
        ) : null}
        {transportReturn?.affiliateUrl ? (
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(transportReturn.affiliateUrl!)}
            style={[styles.outlineBtn, { borderColor: th.border }]}
          >
            <Ionicons name="airplane-outline" size={18} color={th.accent} style={{ transform: [{ scaleX: -1 }] }} />
            <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_return_flight")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <ShareRecordSheet
        visible={shareChatOpen}
        onClose={() => setShareChatOpen(false)}
        type="holiday"
        id={id!}
        preview={{ title: record.title, subtitle: record.subtitle ?? null, imageUrl: record.imageUrl ?? null }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  hero: { width: "100%", height: 160, borderRadius: 12 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { fontSize: 20, fontFamily: fonts.bodyBold, marginTop: 4 },
  total: { fontSize: 22, fontFamily: fonts.bodyBold, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  rowKey: { fontSize: 13 },
  rowVal: { fontSize: 13, fontFamily: fonts.bodySemibold, flexShrink: 1, textAlign: "right" },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10, borderWidth: 1, marginTop: 10 },
});
