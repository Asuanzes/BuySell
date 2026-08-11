import { useCallback, useRef, useState } from "react";
import { fonts } from "@/lib/fonts";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { formatPrice, isRentOperation } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useRecord } from "@/lib/hooks/useRecord";
import {
  fetchPropertyDetail,
  fetchZoneContext,
  fetchRelatedChats,
  type PropertyDetail,
  type ZoneContext,
  type RelatedChatsResponse,
} from "@/lib/records/property";
import { listAlerts, type AlertsResponse } from "@/lib/alerts";
import { toolsForType, type ToolDef } from "@/lib/records/tools";
import { CategoryContextSheet } from "@/components/CategoryContextSheet";
import { ResultModal } from "@/components/ui";
import { ShareRecordSheet } from "@/components/ShareRecordSheet";
import { AddToDecisionSheet } from "@/components/AddToDecisionSheet";
import { AlertsSheet } from "@/components/AlertsSheet";
import { PriceHistoryBlock } from "@/components/property/PriceHistoryBlock";
import { ZoneComparisonBlock } from "@/components/property/ZoneComparisonBlock";
import { RelatedChatsBlock } from "@/components/property/RelatedChatsBlock";
import { HomeButton } from "@/components/HomeButton";
import { RecordChecklistBlock } from "@/components/records/RecordChecklistBlock";
import { RecordHistoryBlock } from "@/components/records/RecordHistoryBlock";
import { RecordNotesBlock } from "@/components/records/RecordNotesBlock";
import { addChecklistItem, fetchLatestVisitChecklist, setChecklistItemDone } from "@/lib/record-tasks";
import { createRecordNote, deleteRecordNote, fetchRecordNotes, updateRecordNote } from "@/lib/record-notes";
import { track } from "@/lib/analytics";

type Notice = { tone: "success" | "error" | "info"; title: string; message?: string };

const SCREEN_WIDTH = Dimensions.get("window").width;

// Marcas de portal (no se traducen); OTHER/MANUAL se resuelven con t() abajo.
const PORTAL_BRAND: Record<string, string> = {
  IDEALISTA: "Idealista", FOTOCASA: "Fotocasa", PISOS_COM: "Pisos.com",
  MILANUNCIOS: "Milanuncios", HABITACLIA: "Habitaclia", YAENCONTRE: "Yaencontre",
  THINKSPAIN: "ThinkSPAIN", INDOMIO: "Indomio",
};

export default function PropertyDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [shareOpen, setShareOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // El tipo viene de la API como string libre → Record construido con t() (no
  // se puede usar template literal tipado sobre un union aquí).
  const TYPE_LABEL: Record<string, string> = {
    PISO: t("detail.property.type_piso"),
    HOUSE: t("detail.property.type_house"),
    ATICO: t("detail.property.type_atico"),
    CHALET: t("detail.property.type_chalet"),
    DUPLEX: t("detail.property.type_duplex"),
    ESTUDIO: t("detail.property.type_estudio"),
    LOFT: t("detail.property.type_loft"),
    LOCAL: t("detail.property.type_local"),
    TERRENO: t("detail.property.type_terreno"),
    OTRO: t("detail.property.type_otro"),
  };
  const LISTING_STATUS_LABEL: Record<string, string | null> = {
    ACTIVE: t("detail.property.listing_status_active"),
    PRICE_DROP: t("detail.property.listing_status_drop"),
    PRICE_UP: t("detail.property.listing_status_up"),
    SOLD: t("detail.property.listing_status_sold"),
    REMOVED: t("detail.property.listing_status_removed"),
    UNKNOWN: null,
  };
  const portalLabel = (portal: string): string =>
    PORTAL_BRAND[portal] ??
    (portal === "OTHER"
      ? t("detail.property.portal_other")
      : portal === "MANUAL"
      ? t("detail.property.portal_manual")
      : portal);
  const { data: p, error, refetch } = useRecord<PropertyDetail>(
    () => fetchPropertyDetail(id!),
    [id],
    { enabled: !!id }
  );
  // Pantalla de decisión: comparativa de zona, chat vinculado y alerta activa.
  const zoneQ = useRecord<ZoneContext>(() => fetchZoneContext(id!), [id], { enabled: !!id });
  const chatsQ = useRecord<RelatedChatsResponse>(() => fetchRelatedChats(id!), [id], { enabled: !!id });
  const alertsQ = useRecord<AlertsResponse>(() => listAlerts("property", id!), [id], { enabled: !!id });
  // El checklist es del DUEÑO: en una ficha compartida ni se pide (la ruta
  // responde 404 a lo ajeno, pero no hay razón para provocar la llamada).
  const ownsThisRecord = !!id && !!p && p.shared !== true && p.readOnly !== true;
  const checklistQ = useRecord(
    () => fetchLatestVisitChecklist("property", id!),
    [id, ownsThisRecord],
    { enabled: ownsThisRecord }
  );
  // Las notas son PRIVADAS del dueño: en una ficha compartida no se piden.
  const notesQ = useRecord(() => fetchRecordNotes("property", id!), [id, ownsThisRecord], {
    enabled: ownsThisRecord,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const relatedChatOpenLockedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      relatedChatOpenLockedRef.current = false;
    }, [])
  );

  const onOpenChat = useCallback((conversationId: string, hasPreview: boolean) => {
    if (relatedChatOpenLockedRef.current) return;
    relatedChatOpenLockedRef.current = true;
    track("related_chat_open", { has_preview: hasPreview });
    router.push(`/chat/${conversationId}` as never);
  }, []);

  // El bloque marca el ítem al instante (optimista); si el servidor lo rechaza,
  // el refetch devuelve la verdad y el usuario ve por qué en vez de creerse una
  // marca que no se guardó.
  async function onChecklistFailure(e: unknown) {
    await checklistQ.refetch();
    setNotice({
      tone: "error",
      title: t("detail.property.notice_error_title"),
      message: e instanceof Error ? e.message : t("detail.property.unknown_error"),
    });
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

  // Notas: el aviso lo da la ficha, pero el error se RELANZA para que el bloque
  // conserve el texto que el usuario acababa de escribir. Tragárselo aquí sería
  // dejarle la caja vacía y la nota sin guardar.
  async function runNoteAction(action: () => Promise<unknown>) {
    try {
      await action();
      await notesQ.refetch();
    } catch (e) {
      setNotice({
        tone: "error",
        title: t("detail.property.notice_error_title"),
        message: e instanceof Error ? e.message : t("detail.property.unknown_error"),
      });
      throw e;
    }
  }

  // Re-check: re-consulta cada anuncio vinculado y refresca el detalle.
  async function recheck() {
    if (!p) return;
    if (p.listings.length === 0) {
      setNotice({
        tone: "info",
        title: t("detail.property.notice_no_listings_title"),
        message: t("detail.property.notice_no_listings_msg"),
      });
      return;
    }
    setBusyTool("recheck");
    try {
      for (const l of p.listings) {
        await api("/api/listings/check", { method: "POST", body: JSON.stringify({ listingId: l.id }) });
      }
      await refetch();
      setSheetOpen(false);
      setNotice({
        tone: "success",
        title: t("detail.property.notice_updated_title"),
        message: t("detail.property.notice_updated_msg"),
      });
    } catch (e) {
      setNotice({
        tone: "error",
        title: t("detail.property.notice_error_title"),
        message: e instanceof Error ? e.message : t("detail.property.unknown_error"),
      });
    } finally {
      setBusyTool(null);
    }
  }

  // Compartir nativo (OS): sale ahora como botón propio, fuera del panel de herramientas.
  function nativeShare() {
    if (!p) return;
    void Share.share({
      message: [p.title, formatPrice(p.currentPrice), p.listings[0]?.url].filter(Boolean).join("\n"),
    });
  }

  // Dispatch del panel contextual por id de herramienta.
  function handleTool(tool: ToolDef) {
    if (!p) return;
    switch (tool.id) {
      case "recheck":
        void recheck();
        return;
      case "mortgage":
        setSheetOpen(false);
        router.push(`/tools/mortgage?amount=${p.currentPrice ? Math.round(p.currentPrice / 100) : ""}` as never);
        return;
      case "alert":
        setSheetOpen(false);
        setAlertsOpen(true);
        return;
      case "share":
        setSheetOpen(false);
        nativeShare();
        return;
    }
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: th.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text style={{ color: th.dangerFg, fontSize: 13 }}>{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!p) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: th.bg }]}>
        <ActivityIndicator color={th.primary} />
      </View>
    );
  }

  const photos = p.media.filter((m) => m.kind === "PHOTO");
  // Incluye el alquiler con opción a compra: su precio principal es la renta.
  const isRent = isRentOperation(p.operationType);
  // Ficha mixta: el mismo inmueble se vende Y se alquila → enseñamos ambos y la
  // rentabilidad bruta (renta anual / precio de compra).
  const hasBoth = p.currentPrice != null && p.monthlyRent != null;
  const grossYield =
    hasBoth && p.currentPrice
      ? ((p.monthlyRent! * 12) / p.currentPrice) * 100
      : null;
  // Campo de precio que vigila la ficha (venta vs renta) → serie del histórico.
  const priceField: "price" | "rent" =
    p.monthlyRent != null && p.currentPrice == null ? "rent" : "price";
  // Alerta activa para el chip inline de la pantalla de decisión.
  const activeAlert = (alertsQ.data?.alerts ?? []).find((a) => a.active) ?? null;
  const FURNISHED_LABEL: Record<string, string> = {
    UNFURNISHED: t("detail.property.rent_furnished_unfurnished"),
    SEMI: t("detail.property.rent_furnished_semi"),
    FURNISHED: t("detail.property.rent_furnished_furnished"),
  };
  const CONTRACT_LABEL: Record<string, string> = {
    RESIDENTIAL: t("detail.property.rent_contract_residential"),
    SEASONAL: t("detail.property.rent_contract_seasonal"),
    ROOM: t("detail.property.rent_contract_room"),
    COMMERCIAL: t("detail.property.rent_contract_commercial"),
  };
  const boolLabel = (v: boolean | null) =>
    v == null ? "—" : v ? t("common.yes") : t("common.no");
  const isReadOnly = p.shared === true || p.readOnly === true;

  return (
    <View style={[styles.container, { backgroundColor: th.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}>
        {photos.length > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
          >
            {photos.map((m) => (
              <Image
                key={m.id}
                source={{ uri: m.url }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.66 }}
                contentFit="cover"
                transition={150}
              />
            ))}
          </ScrollView>
        )}
        <Text style={[styles.photoCount, { color: th.textMuted }]}>
          {t("detail.property.photos", { count: photos.length })}
        </Text>

        <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Text style={[styles.title, { color: th.text }]}>{p.title}</Text>
          <Text style={[styles.location, { color: th.textMuted }]}>
            {[TYPE_LABEL[p.type], p.neighborhood, p.city, p.province].filter(Boolean).join(" · ")}
          </Text>
          <Text style={[styles.price, { color: th.accent }]}>
            {isRent
              ? t("card.per_month", { value: formatPrice(p.monthlyRent) })
              : formatPrice(p.currentPrice)}
          </Text>
          {/* Ficha mixta: además del precio principal, el otro importe en pequeño. */}
          {hasBoth && (
            <Text style={[styles.pricePerSqm, { color: th.textMuted }]}>
              {isRent
                ? formatPrice(p.currentPrice)
                : t("card.per_month", { value: formatPrice(p.monthlyRent) })}
            </Text>
          )}
          {!isRent && p.builtArea && p.currentPrice && (
            <Text style={[styles.pricePerSqm, { color: th.accent }]}>
              {Math.round(p.currentPrice / 100 / p.builtArea).toLocaleString("es-ES")} €/m²
            </Text>
          )}
          {grossYield != null && (
            <Text style={[styles.pricePerSqm, { color: th.accent }]}>
              {t("detail.property.rent_gross_yield", { value: grossYield.toFixed(1) })}
            </Text>
          )}
        </View>

        {/* Histórico + variación: la respuesta a "¿ha cambiado?". */}
        <View style={styles.decisionBlock}>
          <PriceHistoryBlock history={p.priceHistory ?? []} field={priceField} />
        </View>

        {/* Checklist de la visita: solo aparece si el usuario preparó una, y
            entonces es lo más accionable de la ficha, así que va por encima del
            chat, la historia y la comparativa de zona. */}
        {!isReadOnly && checklistQ.data ? (
          <View style={styles.decisionBlock}>
            <RecordChecklistBlock
              checklist={checklistQ.data}
              loading={checklistQ.loading}
              error={checklistQ.error ? t("checklist.error") : null}
              onToggleItem={(itemId, done) => void toggleChecklistItem(itemId, done)}
              onAddItem={(label) => void addOwnChecklistItem(label)}
              onRetry={() => void checklistQ.refetch()}
            />
          </View>
        ) : null}

        {/* Acciones de la ficha, juntas: herramientas · compartir (OS) · compartir con usuario · editar. */}
        <View style={styles.actionsRow}>
          <ActionBtn icon="construct-outline" label={t("detail.property.tools_title")} onPress={() => setSheetOpen(true)} />
          <ActionBtn icon="share-social-outline" label={t("common.share")} onPress={nativeShare} />
          <ActionBtn icon="chatbubble-ellipses-outline" label={t("share.action")} onPress={() => setShareOpen(true)} />
          <ActionBtn icon="git-branch-outline" label={t("decisions.add.action")} onPress={() => setDecisionOpen(true)} />
          <ActionBtn icon="create-outline" label={t("common.edit")} onPress={() => router.push(`/property/form?id=${p.id}` as never)} />
        </View>

        {/* Tus notas: lo que sabes y el anuncio no dice. Va aquí, sobre el chat y
            la historia, porque es la capa PROPIA del usuario (lo suyo primero, lo
            hablado y lo cambiado después). Nunca en una ficha ajena. */}
        {!isReadOnly ? (
          <View style={styles.decisionBlock}>
            <RecordNotesBlock
              notes={notesQ.data ?? null}
              loading={notesQ.loading}
              error={notesQ.error ? t("notes.error") : null}
              onAdd={(body) => runNoteAction(() => createRecordNote("property", id!, body))}
              onEdit={(noteId, body) => runNoteAction(() => updateRecordNote(noteId, body))}
              onDelete={(noteId) => runNoteAction(() => deleteRecordNote(noteId))}
              onRetry={() => void notesQ.refetch()}
            />
          </View>
        ) : null}

        {/* Chat relacionado: ¿qué se ha hablado? */}
        <View style={styles.decisionBlock}>
          <RelatedChatsBlock
            chats={chatsQ.data?.chats ?? null}
            loading={chatsQ.loading}
            onOpenChat={onOpenChat}
            onShare={() => setShareOpen(true)}
          />
        </View>

        {!isReadOnly ? (
          <View style={styles.decisionBlock}>
            <RecordHistoryBlock
              recordType="property"
              recordId={id}
              recordTitle={p.title}
              recordCreatedAt={p.createdAt}
              priceAlertField={priceField}
              onCreateAlert={() => setAlertsOpen(true)}
            />
          </View>
        ) : null}

        {/* Anuncios vinculados ANTES de características: es lo accionable
            (precio por portal + abrir) y compacto — una fila por anuncio. */}
        {p.listings.length > 0 && (
          <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.sectionTitle, { color: th.textMuted }]}>{t("detail.property.section_listings")}</Text>
            {p.listings.map((l, i) => {
              const statusLabel = LISTING_STATUS_LABEL[l.status];
              // "No se pudo comprobar" (blocked/error) ≠ "el anuncio ya no existe".
              const checkFailed = l.lastCheckResult === "blocked" || l.lastCheckResult === "error";
              const fmtDay = (iso: string | null) =>
                iso ? new Date(iso).toLocaleDateString() : null;
              const metaLine = [
                checkFailed && t("detail.property.listing_check_failed"),
                fmtDay(l.lastCheckedAt) && t("detail.property.listing_checked_at", { date: fmtDay(l.lastCheckedAt) }),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[
                    styles.listingRow,
                    { borderBottomColor: th.border },
                    i === p.listings.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 },
                  ]}
                  onPress={() => Linking.openURL(l.url)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.listingPortal, { color: th.text }]}>{portalLabel(l.portal)}</Text>
                      {statusLabel && (
                        <Text style={[styles.statusChip, { backgroundColor: th.primarySoft, color: th.primary }]}>
                          {statusLabel}
                        </Text>
                      )}
                    </View>
                    {!!metaLine && (
                      <Text style={[styles.listingMeta, { color: checkFailed ? th.dangerFg : th.textMuted }]}>
                        {metaLine}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.listingPrice, { color: th.accent }]}>
                    {l.operationType === "RENT"
                      ? t("card.per_month", { value: formatPrice(l.lastPrice) })
                      : formatPrice(l.lastPrice)}
                  </Text>
                  <Ionicons name="open-outline" size={16} color={th.primary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Comparativa de zona (Tier 1): ¿es buen precio? */}
        <View style={styles.decisionBlock}>
          <ZoneComparisonBlock
            zone={zoneQ.data}
            loading={zoneQ.loading}
            currentPrice={isRent ? p.monthlyRent : p.currentPrice}
            isRent={isRent}
            typeLabel={p.type ? TYPE_LABEL[p.type] ?? undefined : undefined}
            onOpenAlternative={(altId) => router.push(`/property/${altId}` as never)}
            onAddAlternative={() => router.push("/property/form" as never)}
          />
        </View>

        {/* Alerta activa: acceso directo a la hoja de alertas. */}
        {activeAlert && (
          <View style={styles.decisionBlock}>
            <Pressable
              onPress={() => setAlertsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("detail.property.alert_active")}
              style={[styles.alertChip, { backgroundColor: th.accentSoft, borderColor: th.accent }]}
            >
              <Ionicons name="notifications" size={16} color={th.accent} />
              <Text style={[styles.alertChipTitle, { color: th.text }]}>
                {t("detail.property.alert_active")}
              </Text>
              <Text style={[styles.alertChipBody, { color: th.textMuted }]} numberOfLines={1}>
                {alertDescription(activeAlert, t)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={th.accent} />
            </Pressable>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Text style={[styles.sectionTitle, { color: th.textMuted }]}>{t("detail.property.section_features")}</Text>
          <View style={styles.grid}>
            <Spec label={t("detail.property.spec_rooms")} value={p.rooms ?? "—"} />
            <Spec label={t("detail.property.spec_bathrooms")} value={p.bathrooms ?? "—"} />
            <Spec label={t("detail.property.spec_built")} value={p.builtArea ? `${p.builtArea} m²` : "—"} />
            <Spec label={t("detail.property.spec_usable")} value={p.usableArea ? `${p.usableArea} m²` : "—"} />
            <Spec label={t("detail.property.spec_plot")} value={p.plotArea ? `${p.plotArea} m²` : "—"} />
            <Spec label={t("detail.property.spec_floor")} value={p.floor ?? "—"} />
            <Spec label={t("detail.property.spec_year")} value={p.yearBuilt ?? "—"} />
            <Spec label={t("detail.property.spec_energy")} value={p.energyRating !== "UNKNOWN" ? p.energyRating : "—"} />
          </View>
          <View style={[styles.tags, { borderTopColor: th.border }]}>
            {[
              { v: p.hasElevator, label: t("detail.property.amenity_elevator") },
              { v: p.hasGarage, label: t("detail.property.amenity_garage") },
              { v: p.hasStorage, label: t("detail.property.amenity_storage") },
              { v: p.hasTerrace, label: t("detail.property.amenity_terrace") },
              { v: p.hasFireplace, label: t("detail.property.amenity_fireplace") },
              { v: p.hasGarden, label: t("detail.property.amenity_garden") },
              { v: p.hasPool, label: t("detail.property.amenity_pool") },
            ]
              .filter((x) => x.v)
              .map((x) => (
                <View key={x.label} style={[styles.tag, { backgroundColor: th.primarySoft }]}>
                  <Text style={[styles.tagText, { color: th.primary }]}>{x.label}</Text>
                </View>
              ))}
          </View>
        </View>

        {p.operationType !== "SALE" && (
          <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.sectionTitle, { color: th.textMuted }]}>{t("detail.property.section_rental")}</Text>
            <View style={styles.grid}>
              <Spec
                label={t("detail.property.rent_monthly")}
                value={p.monthlyRent != null ? t("card.per_month", { value: formatPrice(p.monthlyRent) }) : "—"}
              />
              <Spec
                label={t("detail.property.rent_deposit")}
                value={p.deposit != null ? formatPrice(p.deposit) : "—"}
              />
              <Spec
                label={t("detail.property.rent_min_stay")}
                value={p.minStayMonths != null ? t("detail.property.months", { count: p.minStayMonths }) : "—"}
              />
              <Spec
                label={t("detail.property.rent_max_stay")}
                value={p.maxStayMonths != null ? t("detail.property.months", { count: p.maxStayMonths }) : "—"}
              />
              <Spec label={t("detail.property.rent_furnished")} value={p.furnished ? FURNISHED_LABEL[p.furnished] ?? "—" : "—"} />
              <Spec label={t("detail.property.rent_utilities")} value={boolLabel(p.utilitiesIncluded)} />
              <Spec label={t("detail.property.rent_pets")} value={boolLabel(p.petsAllowed)} />
              <Spec label={t("detail.property.rent_contract")} value={p.contractType ? CONTRACT_LABEL[p.contractType] ?? "—" : "—"} />
            </View>
          </View>
        )}

        {p.description && (
          <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.sectionTitle, { color: th.textMuted }]}>{t("detail.description")}</Text>
            <Text style={[styles.description, { color: th.text }]}>{p.description}</Text>
          </View>
        )}

      </ScrollView>

      {/* La ficha oculta el header, así que el `headerRight` global no llega:
          la casa va aquí, al otro extremo de la barra flotante (space-between). */}
      <View style={[styles.floatBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <FloatButton icon="chevron-back" onPress={() => (from === "import" ? router.replace("/") : router.back())} />
        <HomeButton variant="float" />
      </View>

      <CategoryContextSheet
        visible={sheetOpen}
        title={t("detail.property.tools_title")}
        tools={toolsForType("property").filter((tl) => tl.id !== "share")}
        busyToolId={busyTool}
        onClose={() => setSheetOpen(false)}
        onSelect={handleTool}
      />

      <ResultModal
        visible={!!notice}
        tone={notice?.tone ?? "info"}
        title={notice?.title ?? ""}
        message={notice?.message}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />

      <ShareRecordSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        type="property"
        id={id}
        preview={{ title: p.title, subtitle: p.city ?? null, imageUrl: photos[0]?.url ?? null }}
      />
      <AddToDecisionSheet
        visible={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        recordType="property"
        recordId={id}
      />
      <AlertsSheet
        visible={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        recordType="property"
        recordId={id}
        // En una ficha de alquiler la alerta vigila la RENTA, no el precio de venta.
        field={p?.monthlyRent != null && p?.currentPrice == null ? "rent" : "price"}
        allowStatus
      />
    </View>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { th } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.actionBtn, { backgroundColor: th.surface, borderColor: th.border }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={22} color={th.primary} />
    </Pressable>
  );
}

function FloatButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.floatBtn}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  const { th } = useTheme();
  return (
    <View style={styles.spec}>
      <Text style={[styles.specLabel, { color: th.textMuted }]}>{label}</Text>
      <Text style={[styles.specValue, { color: th.text }]}>{value}</Text>
    </View>
  );
}

/** Descripción corta de la alerta activa para el chip de la pantalla de decisión. */
function alertDescription(a: { kind: string; threshold: number | null }, t: TFunction): string {
  switch (a.kind) {
    case "PRICE_BELOW":
      return a.threshold != null
        ? t("detail.property.alert_below", { value: formatPrice(a.threshold) })
        : t("detail.property.alert_status");
    case "PRICE_ABOVE":
      return a.threshold != null
        ? t("detail.property.alert_above", { value: formatPrice(a.threshold) })
        : t("detail.property.alert_status");
    case "PRICE_DROP_PCT":
      return a.threshold != null
        ? t("detail.property.alert_drop_pct", { value: a.threshold })
        : t("detail.property.alert_status");
    default:
      return t("detail.property.alert_status");
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  floatBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  floatBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: { flexDirection: "row", gap: 8, marginHorizontal: 12, marginTop: 12 },
  actionBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  actionLabel: { fontSize: 11 },
  decisionBlock: { marginHorizontal: 12, marginTop: 12 },
  alertChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertChipTitle: { fontSize: 13, fontWeight: "700" },
  alertChipBody: { flex: 1, fontSize: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  gallery: { height: SCREEN_WIDTH * 0.66, backgroundColor: "#000" },
  photoCount: {
    fontSize: 11, textAlign: "right",
    paddingHorizontal: 16, paddingTop: 6,
  },
  section: {
    marginHorizontal: 12, marginTop: 12,
    padding: 16, borderRadius: 10,
    borderWidth: 1,
  },
  title: { fontSize: 18, fontFamily: fonts.bodyBold },
  location: { fontSize: 13, marginTop: 4 },
  price: { fontSize: 26, fontFamily: fonts.bodyBold, marginTop: 12 },
  toolsFab: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pricePerSqm: { fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontSize: 11, fontFamily: fonts.bodySemibold,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12,
  },
  // 4 columnas × 2 filas (antes 2 col × 4 filas): gana mucho espacio vertical.
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  spec: { width: "23%" },
  specLabel: { fontSize: 10 },
  specValue: { fontSize: 14, fontFamily: fonts.bodyMedium, marginTop: 2 },
  tags: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    marginTop: 16, paddingTop: 12, borderTopWidth: 1,
  },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
  },
  tagText: { fontSize: 11, fontFamily: fonts.bodyMedium },
  description: { fontSize: 13, lineHeight: 20 },
  listingRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, borderBottomWidth: 1,
  },
  listingPortal: { fontSize: 14, fontFamily: fonts.bodyMedium },
  listingPrice: { fontSize: 14, fontFamily: fonts.bodySemibold },
  listingMeta: { fontSize: 11, marginTop: 1 },
  statusChip: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});
