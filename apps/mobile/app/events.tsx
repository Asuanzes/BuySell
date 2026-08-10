import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { AlertsSheet } from "@/components/AlertsSheet";
import { RecordCreationRow } from "@/components/records/RecordCreationRow";
import { RecordEventRow } from "@/components/records/RecordEventRow";
import { Button, EmptyState, Screen } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  eventScreenTitleKey,
  fetchEvents,
  isVisibleRecordEvent,
  validEventRecordFilter,
  type RecordEventDto,
} from "@/lib/events";
import { fonts } from "@/lib/fonts";
import { useLanguage } from "@/lib/i18n/language-context";
import { useCategoryPrefs } from "@/lib/records/category-prefs-context";
import { useTheme } from "@/lib/theme";
import type { RecordType } from "@nidokey/shared";

const PAGE_SIZE = 30;

type LoadState = "loading" | "ready" | "error";

export default function EventsScreen() {
  const params = useLocalSearchParams<{
    recordType?: string;
    recordId?: string;
    recordTitle?: string;
    recordCreatedAt?: string;
    priceAlertField?: string;
  }>();
  const { th } = useTheme();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const { orderedVisible } = useCategoryPrefs();
  const [items, setItems] = useState<RecordEventDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const firstRun = useRef(true);
  const navigatingRef = useRef(false);
  const recordFilter = useMemo(
    () => validEventRecordFilter({ recordType: stringParam(params.recordType), recordId: stringParam(params.recordId) }),
    [params.recordId, params.recordType]
  );
  const recordTitle = stringParam(params.recordTitle);
  const recordCreatedAt = stringParam(params.recordCreatedAt);
  const priceAlertField = stringParam(params.priceAlertField) === "rent" ? "rent" : "price";
  const canCreateRecordAlert =
    recordFilter?.recordType === "property" || recordFilter?.recordType === "crypto" || recordFilter?.recordType === "market";

  const visibleItems = useMemo(
    () => items.filter((item) => isVisibleRecordEvent(item, recordFilter ? [recordFilter.recordType] : orderedVisible)),
    [items, orderedVisible, recordFilter]
  );

  const loadFirst = useCallback(async () => {
    if (firstRun.current) setState("loading");
    else setRefreshing(true);
    try {
      const page = await fetchEvents(null, PAGE_SIZE, recordFilter);
      setItems(page.items ?? []);
      setNextCursor(page.nextCursor ?? null);
      setError(null);
      setState("ready");
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setState("error");
    } finally {
      firstRun.current = false;
      setRefreshing(false);
    }
  }, [recordFilter]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || state !== "ready") return;
    setLoadingMore(true);
    try {
      const page = await fetchEvents(nextCursor, PAGE_SIZE, recordFilter);
      setItems((prev) => mergeEvents(prev, page.items ?? []));
      setNextCursor(page.nextCursor ?? null);
    } catch {
      // La paginacion conserva la lista actual; el usuario puede tirar para refrescar.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, recordFilter, state]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (state === "ready" && visibleItems.length === 0 && nextCursor && !loadingMore) {
      void loadMore();
    }
  }, [loadMore, loadingMore, nextCursor, state, visibleItems.length]);

  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
    }, [])
  );

  const openEvent = useCallback((item: RecordEventDto & { recordType: RecordType }) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push(`/${item.recordType}/${item.recordId}` as never);
  }, []);

  const offline = error ? isOfflineError(error) : false;
  const filteredEmpty = !recordFilter && items.length > 0 && visibleItems.length === 0;
  const titleKey = eventScreenTitleKey(recordFilter ?? {});

  return (
    <Screen
      title={t(titleKey, { title: recordTitle || t("events.title_record_fallback") })}
      subtitle={recordFilter ? t("events.subtitle_record") : t("events.subtitle")}
    >
      {state === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      ) : state === "error" ? (
        <View style={styles.center}>
          <EmptyState
            icon={offline ? "cloud-offline-outline" : "warning-outline"}
            title={offline ? t("events.offline_title") : t("events.error_title")}
            description={offline ? t("events.offline_desc") : t("events.error_desc")}
            actionLabel={t("common.retry")}
            onAction={() => void loadFirst()}
          />
        </View>
      ) : (
        <>
          <FlatList
            data={visibleItems}
            keyExtractor={(item) => item.id}
            // El relleno inferior SUMA el inset del sistema: `Screen` monta el
            // SafeAreaView con edges=["top"] a propósito, así que abajo manda
            // cada pantalla. Con un 28 fijo, la última fila (aquí «Añadido el…»,
            // que va en el footer) quedaba debajo de la barra de Android.
            contentContainerStyle={[
              styles.list,
              { paddingBottom: 28 + insets.bottom },
              visibleItems.length === 0 && styles.emptyList,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadFirst()}
                tintColor={th.primary}
                colors={[th.primary]}
              />
            }
            renderItem={({ item }) => (
              <RecordEventRow item={item} locale={language === "en" ? "en" : "es"} onPress={openEvent} />
            )}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.45}
            ListEmptyComponent={
              recordFilter ? (
                <View style={styles.center}>
                  <EmptyState
                    icon="pulse-outline"
                    title={t("events.empty_title")}
                    description={t("events.history_no_more")}
                  />
                  {canCreateRecordAlert ? (
                    <View style={styles.emptyActions}>
                      <Button
                        label={t("events.empty_alerts")}
                        icon="notifications-outline"
                        variant="secondary"
                        onPress={() => setAlertsOpen(true)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : filteredEmpty ? (
                <View style={styles.center}>
                  <EmptyState
                    icon="eye-off-outline"
                    title={t("events.filtered_empty_title")}
                    description={t("events.filtered_empty_desc")}
                  />
                  <View style={styles.emptyActions}>
                    <Button
                      label={t("events.filtered_empty_action")}
                      icon="options-outline"
                      onPress={() => router.push("/category-settings" as never)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.center}>
                  <EmptyState
                    icon="pulse-outline"
                    title={t("events.empty_title")}
                    description={t("events.empty_desc")}
                  />
                  <View style={styles.emptyActions}>
                    <Button
                      label={t("events.empty_import")}
                      icon="add-circle-outline"
                      onPress={() => router.push("/importar" as never)}
                    />
                    <Button
                      label={t("events.empty_alerts")}
                      icon="notifications-outline"
                      variant="secondary"
                      onPress={() => router.push("/notification-settings" as never)}
                    />
                  </View>
                </View>
              )
            }
            ListFooterComponent={
              <>
                {loadingMore ? (
                  <ActivityIndicator color={th.primary} style={styles.footerLoader} />
                ) : visibleItems.length > 0 && !nextCursor && !recordFilter ? (
                  <Text style={[styles.endLabel, { color: th.textSubtle }]}>{t("events.end_of_list")}</Text>
                ) : null}
                {recordCreatedAt && !nextCursor && !loadingMore ? (
                  <RecordCreationRow createdAt={recordCreatedAt} locale={language === "en" ? "en" : "es"} />
                ) : null}
              </>
            }
          />
          {recordFilter && canCreateRecordAlert ? (
            <AlertsSheet
              visible={alertsOpen}
              onClose={() => setAlertsOpen(false)}
              recordType={recordFilter.recordType}
              recordId={recordFilter.recordId}
              field={priceAlertField}
              allowStatus={recordFilter.recordType === "property"}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function mergeEvents(prev: RecordEventDto[], next: RecordEventDto[]): RecordEventDto[] {
  const seen = new Set(prev.map((item) => item.id));
  return [...prev, ...next.filter((item) => !seen.has(item.id))];
}

function isOfflineError(error: Error): boolean {
  if (error instanceof ApiError && error.status === 0) return true;
  return /network|fetch|abort|sin respuesta/i.test(error.message);
}

function stringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  emptyActions: { alignSelf: "stretch", gap: 10, paddingHorizontal: 18 },
  list: { padding: 16, gap: 10, paddingBottom: 28 },
  emptyList: { flexGrow: 1 },
  footerLoader: { marginVertical: 18 },
  endLabel: { marginVertical: 18, textAlign: "center", fontSize: 12, fontFamily: fonts.body },
});
