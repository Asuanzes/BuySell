import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts } from "@/lib/fonts";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import {
  type BaseRecord,
  metaField,
  formatMoney,
  type TransportLeg,
  type AccommodationChoice,
} from "@nidokey/shared";
import { api } from "@/lib/api";
import { resolveCommercialRedirect } from "@/lib/commercial-redirect";
import { useRecord } from "@/lib/hooks/useRecord";
import { track } from "@/lib/analytics";
import { getItem, setItem } from "@/lib/secure-store";
import { useTheme } from "@/lib/theme";
import { ShareOpenActions } from "@/components/ShareOpenActions";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";
import { AddToDecisionSheet } from "@/components/AddToDecisionSheet";
import { RelatedChatsBlock } from "@/components/records/RelatedChatsBlock";
import { RecordChecklistBlock } from "@/components/records/RecordChecklistBlock";
import { RecordHistoryBlock } from "@/components/records/RecordHistoryBlock";
import { RecordNotesBlock } from "@/components/records/RecordNotesBlock";
import { useRecordNotes } from "@/lib/hooks/useRecordNotes";
import { addChecklistItem, createChecklist, fetchLatestVisitChecklist, setChecklistItemDone, setChecklistSchedule } from "@/lib/record-tasks";

/** meta.planning del viaje EN ORGANIZACIÓN (C8). */
type TripPlanning = {
  destinationTentative?: string | null;
  windowStartISO?: string | null;
  windowEndISO?: string | null;
  budgetCents?: number | null;
};

type Outcome = "yes" | "no" | "later";

const outcomeKey = (recordId: string) => `nidokey.holiday.bookingOutcome.${recordId}`;

/**
 * Ficha de un VIAJE guardado (record `holiday`). Muestra destino, fechas,
 * alojamiento y desplazamiento con sus precios y el Total. Botones para reservar
 * (in-app browser). ⚠️ La comisión es interna: NUNCA se lee ni se pinta aquí.
 */
export default function HolidayDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: record, error, loading } = useRecord<BaseRecord>(
    () => api<BaseRecord>(`/api/records/${id}?type=holiday`),
    [id]
  );
  const [shareChatOpen, setShareChatOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [showOutcomeQuestion, setShowOutcomeQuestion] = useState(false);
  const [outcomeAlreadyAnswered, setOutcomeAlreadyAnswered] = useState(false);
  const browserPendingRef = useRef(false);
  const relatedChatOpenLockedRef = useRef(false);

  const accommodation = record ? metaField<AccommodationChoice | null>(record, "accommodation", null) : null;
  const transport = record ? metaField<TransportLeg | null>(record, "transport", null) : null;
  const transportReturn = record ? metaField<TransportLeg | null>(record, "transportReturn", null) : null;
  // Antes de los returns tempranos porque los hooks lo necesitan: las notas son
  // del dueño (404 en una ficha compartida), así que ni se piden en ajenas.
  const isReadOnly = record
    ? metaField<boolean>(record, "readOnly", false) || metaField<boolean>(record, "shared", false)
    : false;
  const notes = useRecordNotes("holiday", id, {
    enabled: !!record && !isReadOnly,
    onError: (e) =>
      Alert.alert(t("notes.error"), e instanceof Error ? e.message : String(e)),
  });
  // C8: checklist de VIAJE (kind trip_checklist), solo del dueño; el bloque
  // desaparece hasta que el bot la crea con preparar_viaje.
  const checklistQ = useRecord(
    () => fetchLatestVisitChecklist("holiday", id!, "trip_checklist"),
    [id, !!record && !isReadOnly],
    { enabled: !!id && !!record && !isReadOnly }
  );

  async function onChecklistFailure(e: unknown) {
    await checklistQ.refetch();
    Alert.alert(t("checklist.error"), e instanceof Error ? e.message : String(e));
  }

  async function toggleChecklistItem(itemId: string, done: boolean) {
    const taskId = checklistQ.data?.id;
    if (!taskId) return;
    try {
      await setChecklistItemDone(taskId, itemId, done);
      await checklistQ.refetch();
    } catch (e) {
      await onChecklistFailure(e);
    }
  }

  async function addOwnChecklistItem(label: string) {
    const taskId = checklistQ.data?.id;
    if (!taskId) return;
    try {
      await addChecklistItem(taskId, label);
      await checklistQ.refetch();
    } catch (e) {
      await onChecklistFailure(e);
    }
  }

  // Fecha de SALIDA como cita (C6i4): aparece en la pantalla Citas del rail.
  async function scheduleChecklist(scheduledOn: string | null) {
    const taskId = checklistQ.data?.id;
    if (!taskId) return;
    try {
      await setChecklistSchedule(taskId, scheduledOn);
      await checklistQ.refetch();
    } catch (e) {
      await onChecklistFailure(e);
    }
  }

  // Crear el checklist de viaje desde la ficha (sin pasar por el bot).
  async function createOwnChecklist() {
    try {
      await createChecklist("holiday", id!, "trip_checklist");
      await checklistQ.refetch();
    } catch (e) {
      await onChecklistFailure(e);
    }
  }
  const hasBookingActions = Boolean(
    accommodation?.affiliateUrl || transport?.affiliateUrl || transportReturn?.affiliateUrl
  );

  useEffect(() => {
    if (!id || !hasBookingActions) return;
    track("commercial_action_view", { recordType: "holiday", recordId: id });
  }, [hasBookingActions, id]);

  useFocusEffect(
    useCallback(() => {
      relatedChatOpenLockedRef.current = false;
    }, [])
  );

  const onOpenChat = useCallback((conversationId: string, hasPreview: boolean) => {
    if (relatedChatOpenLockedRef.current) return;
    relatedChatOpenLockedRef.current = true;
    track("related_chat_open", { has_preview: hasPreview, recordType: "holiday" });
    router.push(`/chat/${conversationId}` as never);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!id) return () => {
      alive = false;
    };
    setShowOutcomeQuestion(false);
    setOutcomeAlreadyAnswered(false);
    void getItem(outcomeKey(id)).then((stored) => {
      if (alive) setOutcomeAlreadyAnswered(Boolean(stored));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const maybeAskOutcome = useCallback(() => {
    if (!id || outcomeAlreadyAnswered) return;
    setShowOutcomeQuestion(true);
  }, [id, outcomeAlreadyAnswered]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !browserPendingRef.current) return;
      browserPendingRef.current = false;
      maybeAskOutcome();
    });
    return () => sub.remove();
  }, [maybeAskOutcome]);

  const openAffiliate = useCallback(
    async (target: string) => {
      if (!id) return;
      browserPendingRef.current = true;
      try {
        const finalUrl = await resolveCommercialRedirect({ target, recordType: "holiday", recordId: id });
        track("commercial_action_click", { recordType: "holiday", recordId: id, fallback: finalUrl.fallback });
        const result = await WebBrowser.openBrowserAsync(finalUrl.url);
        if (result.type !== "opened") {
          browserPendingRef.current = false;
          maybeAskOutcome();
        }
      } catch {
        browserPendingRef.current = false;
      }
    },
    [id, maybeAskOutcome]
  );

  const reportOutcome = useCallback(
    (outcome: Outcome) => {
      if (!id) return;
      setOutcomeAlreadyAnswered(true);
      setShowOutcomeQuestion(false);
      track("booking_outcome_reported", { recordType: "holiday", recordId: id, outcome });
      void setItem(outcomeKey(id), outcome);
    },
    [id]
  );

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
  const planning = metaField<TripPlanning | null>(record, "planning", null);
  const isOrganizing = Boolean(planning) && record.status !== "BOOKED";
  const transfer = metaField<TransportLeg | null>(record, "transfer", null);
  const tripType = metaField<string | null>(record, "tripType", null);
  const occupancy = metaField<{ adults: number; children: number[] }[] | null>(record, "occupancy", null);
  const booking = metaField<{ hotelRef?: string | null; flightRef?: string | null } | null>(record, "booking", null);
  // ⚠️ NO leer metaField(record, "commission", …): es interno, no se pinta.
  // (isReadOnly se calcula arriba, antes de los returns, porque lo usan los hooks.)

  const statusLabel =
    record.status === "BOOKED"
      ? t("detail.holiday.status_booked")
      : isOrganizing
      ? t("detail.holiday.status_organizing")
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
      <ScrollView style={{ backgroundColor: th.bg }} contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
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
          <ShareOpenActions onSendToChat={() => setShareChatOpen(true)} onAddToDecision={() => setDecisionOpen(true)} />
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

        {/* C8: viaje EN ORGANIZACIÓN — lo tentativo y el paso siguiente. */}
        {isOrganizing && !isReadOnly ? (
          <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.planningTitle, { color: th.textMuted }]}>{t("detail.holiday.planning_title")}</Text>
            {planning?.windowStartISO ? (
              <View style={styles.row}>
                <Text style={[styles.rowKey, { color: th.textSubtle }]}>{t("detail.holiday.planning_window")}</Text>
                <Text style={[styles.rowVal, { color: th.text }]}>
                  {planning.windowStartISO}
                  {planning.windowEndISO && planning.windowEndISO !== planning.windowStartISO ? ` → ${planning.windowEndISO}` : ""}
                </Text>
              </View>
            ) : null}
            {planning?.budgetCents != null ? (
              <View style={styles.row}>
                <Text style={[styles.rowKey, { color: th.textSubtle }]}>{t("detail.holiday.planning_budget")}</Text>
                <Text style={[styles.rowVal, { color: th.text }]}>{formatMoney(planning.budgetCents, "EUR")}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() =>
                router.push(
                  `/viajes/nuevo?holidayId=${id}&q=${encodeURIComponent(planning?.destinationTentative ?? destination ?? "")}` as never
                )
              }
              accessibilityRole="button"
              style={[styles.outlineBtn, { borderColor: th.accent }]}
            >
              <Ionicons name="airplane-outline" size={18} color={th.accent} />
              <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.planning_cta")}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Checklist de viaje (C8): lo crea el bot con preparar_viaje o el CTA. */}
        {!isReadOnly && !checklistQ.loading ? (
          <RecordChecklistBlock
            checklist={checklistQ.data ?? null}
            loading={checklistQ.loading}
            error={checklistQ.error ? t("checklist.error") : null}
            onToggleItem={(itemId, done) => void toggleChecklistItem(itemId, done)}
            onAddItem={(label) => void addOwnChecklistItem(label)}
            onSchedule={(scheduledOn) => void scheduleChecklist(scheduledOn)}
            onCreate={() => void createOwnChecklist()}
            createLabel={t("checklist.create_trip")}
            onRetry={() => void checklistQ.refetch()}
          />
        ) : null}

        {id ? (
          <RelatedChatsBlock
            recordType="holiday"
            recordId={id}
            onOpenChat={onOpenChat}
            onShare={() => setShareChatOpen(true)}
          />
        ) : null}

        {/* Tus notas: la capa propia del usuario, encima de la historia. */}
        {id && !isReadOnly ? (
          <RecordNotesBlock
            notes={notes.notes}
            loading={notes.loading}
            error={notes.error ? t("notes.error") : null}
            onAdd={notes.add}
            onEdit={notes.edit}
            onDelete={notes.remove}
            onRetry={() => void notes.retry()}
          />
        ) : null}

        {id && !isReadOnly ? (
          <RecordHistoryBlock
            recordType="holiday"
            recordId={id}
            recordTitle={record.title}
            recordCreatedAt={record.createdAt}
          />
        ) : null}

        {hasBookingActions ? (
          <View style={styles.bookingSection}>
            <Text style={[styles.disclosure, { color: th.textMuted }]}>
              {t("detail.holiday.affiliate_disclosure")}
            </Text>
            {accommodation?.affiliateUrl ? (
              <Pressable
                onPress={() => void openAffiliate(accommodation.affiliateUrl!)}
                style={[styles.outlineBtn, { borderColor: th.border }]}
              >
                <Ionicons name="bed-outline" size={18} color={th.accent} />
                <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_hotel")}</Text>
              </Pressable>
            ) : null}
            {transport?.affiliateUrl ? (
              <Pressable
                onPress={() => void openAffiliate(transport.affiliateUrl!)}
                style={[styles.outlineBtn, { borderColor: th.border }]}
              >
                <Ionicons name="airplane-outline" size={18} color={th.accent} />
                <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_flight")}</Text>
              </Pressable>
            ) : null}
            {transportReturn?.affiliateUrl ? (
              <Pressable
                onPress={() => void openAffiliate(transportReturn.affiliateUrl!)}
                style={[styles.outlineBtn, { borderColor: th.border }]}
              >
                <Ionicons name="airplane-outline" size={18} color={th.accent} style={{ transform: [{ scaleX: -1 }] }} />
                <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("detail.holiday.view_return_flight")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {showOutcomeQuestion ? (
          <View style={[styles.outcomeBox, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.outcomeTitle, { color: th.text }]}>{t("detail.holiday.booking_outcome_question")}</Text>
            <View style={styles.outcomeActions}>
              <OutcomeButton label={t("detail.holiday.booking_outcome_yes")} onPress={() => reportOutcome("yes")} color={th.accent} />
              <OutcomeButton label={t("detail.holiday.booking_outcome_no")} onPress={() => reportOutcome("no")} color={th.accent} />
              <OutcomeButton label={t("detail.holiday.booking_outcome_later")} onPress={() => reportOutcome("later")} color={th.accent} />
            </View>
          </View>
        ) : null}
      </ScrollView>
      <ShareRecordSheet
        visible={shareChatOpen}
        onClose={() => setShareChatOpen(false)}
        type="holiday"
        id={id!}
        preview={{ title: record.title, subtitle: record.subtitle ?? null, imageUrl: record.imageUrl ?? null }}
      />
      <AddToDecisionSheet
        visible={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        recordType="holiday"
        recordId={id!}
      />
    </>
  );
}

function OutcomeButton({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.outcomeButton, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontFamily: fonts.bodySemibold }}>{label}</Text>
    </Pressable>
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
  bookingSection: { marginTop: 8 },
  planningTitle: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 4 },
  disclosure: { fontSize: 11, lineHeight: 15, marginBottom: 2 },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  outcomeBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12, gap: 10 },
  outcomeTitle: { fontSize: 13, fontFamily: fonts.bodySemibold },
  outcomeActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outcomeButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
});
