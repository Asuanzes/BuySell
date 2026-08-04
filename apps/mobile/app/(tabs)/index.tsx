import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { metaField, type BaseRecord } from "@nidokey/shared";
import { useCategoryPrefs } from "@/lib/records/category-prefs-context";
import { useTypeI18n } from "@/lib/records/type-i18n";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useRecords } from "@/lib/hooks/useRecords";
import { useBoot } from "@/lib/boot-context";
import { categoryColor, RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { useAppStyle } from "@/lib/app-style-context";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BooksByAuthor } from "@/components/BooksByAuthor";
import { ConversationList } from "@/components/chat/ConversationList";
import { ReorderableRecordList } from "@/components/ReorderableRecordList";
import { deleteRecord } from "@/lib/data/records-repository";
import { getSavedOrder, saveOrder, applySavedOrder } from "@/lib/local-order";
import { AdBannerSlot, EmptyState, ResultModal, Screen } from "@/components/ui";
import { NewsSheet } from "@/components/NewsSheet";
import { FoodHome } from "@/components/food/FoodHome";

/**
 * Lista unificada de registros. El filtro de tipo es un rail VERTICAL en el
 * lado derecho (solo iconos, algo más grandes); el tipo activo se marca en
 * bronce (th.accent) sobre fondo accentSoft, consistente con la tab bar.
 * Solo "property" tiene datos; el resto muestra el estado "Próximamente".
 */
export default function RecordsScreen() {
  const { state } = useAuth();
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { t } = useTranslation();
  const { label: typeLabel } = useTypeI18n();
  // Categoría activa COMPARTIDA con Importar (contexto), no estado local: así
  // Importar abre la categoría en la que estás y "Ver {categoría}" vuelve a ella.
  const { category: type, setCategory: setType, orderedVisible } = useCategoryPrefs();

  // Chat no es una lista de records: renderiza su propia lista de conversaciones
  // (abajo) y no consulta /api/records.
  const isChat = type === "chat";
  const isFood = type === "food";
  const { data: records, error, loading, refreshing, refetch } = useRecords({ type }, { enabled: !isChat && !isFood });

  // Avisa al arranque cuando la primera carga de registros termina (datos o
  // error) → el loader de bolitas se retira. Tapamos así el spinner propio de la
  // lista: una sola carga, no dos.
  const { markFirstScreenReady } = useBoot();
  useEffect(() => {
    // Con chat activo el query de records está deshabilitado (loading se queda
    // en true): la lista de conversaciones gestiona su propia carga.
    if (!loading || isChat || isFood) markFirstScreenReady();
  }, [loading, isChat, isFood, markFirstScreenReady]);

  // Modo edición (pulsación larga): muestra ✕ para borrar. Sale al cambiar de
  // tipo o si la lista queda vacía.
  const [editing, setEditing] = useState(false);
  // Filtro de operación (solo Inmuebles): Todo / Venta / Alquiler. Client-side
  // sobre meta.operationType — no necesita endpoint nuevo. Se resetea al cambiar
  // de categoría.
  const [opFilter, setOpFilter] = useState<"ALL" | "SALE" | "RENT">("ALL");
  useEffect(() => { setEditing(false); setOpFilter("ALL"); }, [type]);
  useEffect(() => { if (records && records.length === 0) setEditing(false); }, [records]);

  // Orden manual local: aplica el orden guardado (SecureStore) a los registros
  // traídos. `draggingRef` evita que un refetch en segundo plano pise un
  // arrastre en curso.
  const [items, setItems] = useState<BaseRecord[] | null>(null);
  const draggingRef = useRef(false);
  // Confirmación de borrado + aviso de error con el estilo de la app (no Alert nativo).
  const [confirmDelete, setConfirmDelete] = useState<BaseRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!records) { setItems(null); return; }
    let cancel = false;
    getSavedOrder(type).then((ids) => {
      if (cancel || draggingRef.current) return;
      setItems(applySavedOrder(records, ids));
    });
    return () => { cancel = true; };
  }, [records, type]);

  function handleDelete(record: BaseRecord) {
    setConfirmDelete(record);
  }

  async function doDelete() {
    const record = confirmDelete;
    setConfirmDelete(null);
    if (!record) return;
    try {
      await deleteRecord(record);
      await refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudo eliminar el registro");
    }
  }

  if (state.kind !== "authed") return null;

  const cfg = RECORD_TYPE_CONFIG[type];
  const trendsColor = categoryColor("trends", dark, appStyle);
  const ordered = items ?? records;
  /**
   * Sólo Inmuebles ofrece el segmento de operación.
   *
   * El alquiler con opción a compra cuenta como VENTA, no como alquiler, por
   * más que su nombre diga lo contrario: su importe se guarda como precio de
   * venta en `currentPrice` — misma convención que la importación, el recheck y
   * el buscador. Antes esta lista lo metía en «Alquiler» (`op !== "SALE"`), de
   * modo que un registro así salía aquí bajo alquiler y NO salía al buscarlo
   * como alquiler: dos respuestas distintas a la misma pregunta según la
   * pantalla.
   */
  const showOpFilter = type === "property" && !editing;
  const shown =
    showOpFilter && ordered && opFilter !== "ALL"
      ? ordered.filter((r) => {
          const op = metaField<string>(r, "operationType", "SALE");
          return opFilter === "RENT" ? op === "RENT" : op !== "RENT";
        })
      : ordered;

  return (
    <Screen background backgroundCategory={type}>
      <View style={styles.body}>
        {/* Contenido */}
        <View style={styles.main}>
          {/* Chat: lista de conversaciones propia (no es una lista de records). */}
          {isChat && <ConversationList />}
          {isFood && <FoodHome />}

          {/* Hueco de anuncios en la home de registros. Inerte hasta que el flag
              `adsEnabled` se active; no afecta a chat ni a comida (renderizan en
              su propio árbol). El componente devuelve `null` con el flag
              apagado, así que la columna de registros queda exactamente igual
              que antes hasta que activemos ads. */}
          {!isChat && !isFood && <AdBannerSlot />}

          {!isChat && !isFood && showOpFilter && records && records.length > 0 && (
            <View style={[styles.opFilter, th.elevation.sm, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
              {(["ALL", "SALE", "RENT"] as const).map((opt) => {
                const active = opFilter === opt;
                const label =
                  opt === "ALL" ? t("records.op_all") : opt === "SALE" ? t("records.op_sale") : t("records.op_rent");
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setOpFilter(opt)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.opChip,
                      { borderColor: active ? th.accent : "transparent" },
                      active && { backgroundColor: th.accentSoft },
                    ]}
                  >
                    <Text style={[styles.opChipText, { color: active ? th.accent : th.textMuted }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!isChat && !isFood && loading && !records && (
            <View style={styles.center}>
              <ActivityIndicator color={th.primary} />
            </View>
          )}

          {!isChat && !isFood && error && (
            <EmptyState
              icon="cloud-offline-outline"
              title={t("records.load_error")}
              description={error.message}
              actionLabel={t("common.retry")}
              onAction={refetch}
            />
          )}

          {!isChat && !isFood && records && records.length === 0 && !error && (
            <EmptyState
              icon={cfg.enabled ? "file-tray-outline" : "time-outline"}
              title={cfg.enabled ? t("records.empty_title", { type: typeLabel(type).toLowerCase() }) : t("common.soon")}
              description={
                cfg.enabled
                  ? t("records.empty_desc")
                  : t("records.soon_desc", { type: typeLabel(type) })
              }
              actionLabel={cfg.enabled ? t("tabs.import") : undefined}
              onAction={cfg.enabled ? () => router.navigate("/importar") : undefined}
            />
          )}

          {/* Filtro de operación activo sin resultados (pero sí hay inmuebles). */}
          {showOpFilter && opFilter !== "ALL" && records && records.length > 0 && shown && shown.length === 0 && (
            <EmptyState
              icon="funnel-outline"
              title={t("records.filter_empty_title")}
              description={t("records.filter_empty_desc")}
            />
          )}

          {!isChat && !isFood && shown && shown.length > 0 && (
            <View style={styles.fill}>
              {editing && (
                <View style={[styles.editBar, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}>
                  <Text style={[styles.editHint, { color: th.textMuted }]} numberOfLines={1}>
                    {t("records.edit_hint")}
                  </Text>
                  <Pressable onPress={() => setEditing(false)} hitSlop={8}>
                    <Text style={[styles.editDone, { color: th.accent }]}>{t("common.done")}</Text>
                  </Pressable>
                </View>
              )}
              {type === "book" && !editing ? (
                // Libros: vista agrupada por autor (B7), plegable. El modo
                // edición (long-press) cae a la lista plana de abajo, donde el
                // drag y el borrado funcionan como en el resto de categorías.
                <BooksByAuthor
                  data={shown}
                  refreshing={refreshing}
                  onRefresh={refetch}
                  onEnterEdit={() => setEditing(true)}
                  tintColor={th.primary}
                  contentStyle={styles.list}
                />
              ) : (
                <ReorderableRecordList
                  data={shown}
                  editing={editing}
                  refreshing={refreshing}
                  onRefresh={refetch}
                  onEnterEdit={() => setEditing(true)}
                  onDelete={handleDelete}
                  onReorder={(next) => setItems(next)}
                  onCommit={(ids) => { void saveOrder(type, ids); }}
                  onDragStart={() => { draggingRef.current = true; }}
                  onDragEnd={() => { draggingRef.current = false; }}
                  tintColor={th.primary}
                  contentStyle={styles.list}
                />
              )}
            </View>
          )}
        </View>

        {/* Rail vertical de tipos (solo iconos, activo en bronce) */}
        <ScrollView
          style={[styles.rail, th.elevation.md, { backgroundColor: th.surfaceRaised, borderColor: th.border }]}
          contentContainerStyle={styles.railContent}
          showsVerticalScrollIndicator={false}
        >
          {orderedVisible.map((cat) => {
            const active = type === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setType(cat)}
                accessibilityRole="button"
                accessibilityLabel={typeLabel(cat)}
                accessibilityState={{ selected: active }}
                style={[
                  styles.railItem,
                  { borderColor: active ? th.accent : "transparent" },
                  active && { backgroundColor: th.accentSoft },
                ]}
              >
                <CategoryIcon type={cat} size={26} />
              </Pressable>
            );
          })}
          {/* Espaciador flexible: empuja "Tendencias" al fondo del rail (a la
              altura del FAB de nuevo chat). Se colapsa si hay muchas categorías. */}
          <View style={styles.railSpacer} />
          <View style={styles.railDivider} />
          <Pressable
            onPress={() => router.navigate("/trends" as never)}
            accessibilityRole="button"
            accessibilityLabel={typeLabel("trends")}
            style={[
              styles.railItem,
              { borderColor: "transparent" },
            ]}
          >
            <CategoryIcon type="trends" size={26} color={trendsColor} />
          </Pressable>
        </ScrollView>
      </View>

      {/* Sheet de noticias (estilo Bolsa de Apple): solo en categorías financieras,
          con noticias de los activos registrados del usuario. */}
      {(type === "crypto" || type === "market") && (
        <NewsSheet
          type={type}
          assets={(records ?? []).map((r) => ({
            symbol: metaField<string>(r, "symbol", r.title),
            name: r.title,
          }))}
        />
      )}

      {/* Confirmación de borrado (modal de la app) */}
      <ResultModal
        visible={!!confirmDelete}
        tone="error"
        icon="trash-outline"
        title={t("records.delete_title")}
        message={confirmDelete ? t("records.delete_message", { title: confirmDelete.title }) : undefined}
        actions={[
          { label: t("common.delete"), variant: "danger", onPress: () => void doDelete() },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirmDelete(null) },
        ]}
        onRequestClose={() => setConfirmDelete(null)}
      />
      <ResultModal
        visible={!!notice}
        tone="error"
        title={t("records.delete_error")}
        message={notice ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: "row", paddingLeft: 4 },
  main: { flex: 1 },
  fill: { flex: 1 },
  list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 18 },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
  },
  editHint: { fontSize: 12, fontFamily: fonts.bodyMedium, flex: 1, marginRight: 8 },
  editDone: { fontSize: 14, fontFamily: fonts.bodyBold },
  opFilter: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 18,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  opChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
  },
  opChipText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  rail: {
    width: 60,
    borderWidth: 1,
    borderRadius: 22,
    marginTop: 10,
    marginRight: 8,
    marginBottom: 10,
    flexGrow: 0,
  },
  railContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingVertical: 8,
    gap: 7,
    alignItems: "center",
  },
  railSpacer: { flex: 1, minHeight: 16 },
  railItem: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  railDivider: {
    width: 34,
    height: 1,
    backgroundColor: "#e0e0e0",
    marginVertical: 8,
  },
});
