import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { isRentOperation } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { searchProperties, searchRecords, type PropertySearchFilters } from "@/lib/data/records-repository";
import {
  buildPreviewParams,
  isListingSaved,
  savedListingsVersion,
  subscribeSavedListings,
} from "@/lib/listing-preview";
import {
  PORTALS,
  applyLocalFilters,
  buildSearchUrl,
  dedupeHits,
  type PortalHit,
  type PortalKey,
  type PortalProgress,
} from "@/lib/portal-search";
import { PortalSearchWebView } from "@/components/PortalSearchWebView";
import { PortalSearchProgress } from "@/components/PortalSearchProgress";
import { RecordCard } from "@/components/RecordCard";
import {
  EMPTY_FILTERS,
  PropertyFilterSheet,
  countActiveFilters,
} from "@/components/PropertyFilterSheet";
import { EmptyState, Screen } from "@/components/ui";

/**
 * Buscador. Dos ámbitos:
 *  - "Todo": búsqueda de texto sobre todos los registros (lo de siempre).
 *  - "Inmuebles": buscador con filtros (zona, tipo, precio, habitaciones,
 *    baños, superficie y orden) contra `/api/rentals/search`.
 *
 * En Inmuebles se puede buscar SIN texto: los filtros por sí solos son una
 * búsqueda válida ("alquiler en Vizcaya hasta 900 €"). Los filtros sólo se
 * aplican al pulsar "Aplicar" en la hoja — ver PropertyFilterSheet.
 */
export default function SearchScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [scope, setScope] = useState<"all" | "property" | "portals">("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<PropertySearchFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Portales: el WebView carga una URL de resultados y devuelve los anuncios.
  const [portal, setPortal] = useState<PortalKey>("IDEALISTA");
  const [runningUrl, setRunningUrl] = useState<string | null>(null);
  const [portalHits, setPortalHits] = useState<PortalHit[] | null>(null);
  const [portalDebug, setPortalDebug] = useState<string | null>(null);
  const [progress, setProgress] = useState<PortalProgress | null>(null);
  // Extracción fallida: se enseña la página del portal para que el usuario vea
  // qué está pasando (captcha, muro de cookies, municipio inexistente).
  const [inspecting, setInspecting] = useState(false);
  /**
   * El scroll del listado NO se guarda en ninguna parte, y es correcto que no
   * se guarde: el detalle se empuja sobre el Stack raíz, así que esta pantalla
   * sigue montada debajo y el FlatList conserva su posición él solo.
   *
   * Codex objetó que el offset no estuviera persistido por si la pantalla se
   * remonta. Se revisó y no procede: si esto se remonta es porque el usuario
   * cambió de pestaña, y entonces `portalHits` — que también es estado local —
   * ya está vacío. Restaurar el scroll de una lista sin resultados no
   * significa nada, y un `contentOffset` reaplicado en cada render puede tirar
   * de la lista mientras el usuario la arrastra. Lo que sí queda pendiente es
   * verificar en dispositivo el swipe-back de iOS (ver el handoff).
   */
  /** Anuncios que el detalle ha guardado: repinta la fila con el check. */
  const savedTick = useSyncExternalStore(
    subscribeSavedListings,
    savedListingsVersion,
    savedListingsVersion
  );

  // Debounce de 250ms sobre el texto.
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(handle);
  }, [q]);

  // Corte por tiempo de la búsqueda en portal: si la página no carga, redirige
  // en bucle o cambia de estructura, el script inyectado puede no contestar
  // nunca. Sin esto el botón se queda girando para siempre.
  useEffect(() => {
    // Mientras el usuario está mirando la página (inspecting) no se corta: el
    // corte existe para páginas que no contestan, no para interrumpirle.
    if (!runningUrl || inspecting) return;
    // 45 s: el script vigila la página hasta ~32 s antes de rendirse. Cortar
    // antes lo mataría justo cuando estaba a punto de encontrar los anuncios.
    const handle = setTimeout(() => {
      setRunningUrl(null);
      setPortalHits((current) => current ?? []);
    }, 45000);
    return () => clearTimeout(handle);
  }, [runningUrl, inspecting]);

  const activeFilters = countActiveFilters(filters);
  const isProperty = scope === "property";
  const isPortals = scope === "portals";
  // Los portales organizan sus listados por municipio: sin municipio no hay URL
  // que construir. La provincia sólo la usan algunos (Idealista, Milanuncios).
  const city = filters.city?.trim() ?? "";
  const province = filters.province?.trim() ?? "";

  function runPortalSearch() {
    // Sin municipio no hay URL de portal que construir. En vez de dejar el botón
    // muerto (parecía roto), se abre la hoja de filtros, que es donde se pone.
    if (!city) {
      setSheetOpen(true);
      return;
    }
    setPortalHits(null);
    setPortalDebug(null);
    setInspecting(false);
    setProgress({ stage: "opening", found: 0, seconds: 0 });
    setRunningUrl(
      buildSearchUrl(portal, isRentOperation(filters.operation) ? "RENT" : "SALE", city, province)
    );
  }

  /**
   * Abre el DETALLE del anuncio. No importa nada todavía: el usuario está
   * explorando, y añadirlo es una decisión que se toma con la ficha delante.
   *
   * `push` sobre el Stack raíz, no `navigate` a la pestaña Importar: esta
   * pantalla guarda los resultados, los filtros y el scroll en estado local y
   * las pestañas usan `<Slot/>`, así que ir a otra pestaña la desmontaría
   * entera. Empujando una ruta del Stack, sigue viva debajo.
   */
  function openPortalHit(hit: PortalHit) {
    // Con una búsqueda en marcha ya hay un WebView vivo (y puede estar
    // pidiendo captcha a pantalla completa): montar el del detalle encima
    // serían dos WebViews compitiendo por las cookies y por la pantalla.
    if (runningUrl) return;
    // `as never`: las rutas tipadas de Expo Router se generan en
    // `.expo/types/router.d.ts`, que está en .gitignore y sólo se regenera al
    // arrancar Metro — una ruta recién creada aún no está en ese union. Es el
    // mismo apaño que ya usan /viajes/nuevo y /property/form.
    router.push({
      pathname: "/listing/preview",
      params: buildPreviewParams(hit, filters.operation === "SALE" ? "SALE" : "RENT"),
    } as never);
  }
  const textReady = debounced.trim().length >= 2;
  // Inmuebles busca SIEMPRE, incluso sin texto ni filtros: un buscador que no
  // enseña nada hasta que escribes parece roto (y lo pareció). En "Todo" sí
  // hace falta texto, porque ahí no hay nada que listar por defecto.
  const ready = isProperty || textReady;

  const { data: general, loading: loadingGeneral } = useQuery(
    () => searchRecords(debounced),
    [debounced],
    { enabled: ready && !isProperty, revalidateOnFocus: false }
  );

  const { data: properties, loading: loadingProperties } = useQuery(
    () => searchProperties({ ...filters, q: debounced }),
    [debounced, JSON.stringify(filters)],
    { enabled: ready && isProperty, revalidateOnFocus: false }
  );

  const results = isProperty ? properties?.results : general;
  const loading = isProperty ? loadingProperties : loadingGeneral;
  // Provincia escrita pero no reconocida: el backend la descartó, así que el
  // usuario debe saberlo (si no, "0 resultados" parece un corpus vacío).
  const unknownProvince =
    isProperty && !!filters.province?.trim() && properties?.resolvedProvince == null
      ? filters.province.trim()
      : null;

  return (
    <Screen>
      <View style={styles.scopeRow}>
        {(["all", "property", "portals"] as const).map((s) => {
          const active = scope === s;
          return (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.scopeChip,
                {
                  borderColor: active ? th.primary : th.border,
                  backgroundColor: active ? th.primarySoft : "transparent",
                },
              ]}
            >
              <Text style={[styles.scopeText, { color: active ? th.primary : th.textMuted }]}>
                {s === "all"
                  ? t("search.scope_all")
                  : s === "property"
                    ? t("search.scope_property")
                    : t("search.scope_portals")}
              </Text>
            </Pressable>
          );
        })}

        {(isProperty || isPortals) && (
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            style={[
              styles.scopeChip,
              styles.filterBtn,
              {
                borderColor: activeFilters ? th.primary : th.border,
                backgroundColor: activeFilters ? th.primarySoft : "transparent",
              },
            ]}
          >
            <Ionicons
              name="funnel-outline"
              size={14}
              color={activeFilters ? th.primary : th.textMuted}
            />
            <Text style={[styles.scopeText, { color: activeFilters ? th.primary : th.textMuted }]}>
              {activeFilters
                ? t("search.filters_count", { count: activeFilters })
                : t("search.filters")}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Operación a un toque: el 88 % de las fichas guardadas son de venta, así
          que esconder este selector dentro de la hoja de filtros hacía que
          "Inmuebles" pareciera vacío cuando sólo estaba filtrando alquiler. */}
      {(isProperty || isPortals) && (
        <View style={styles.scopeRow}>
          {/* Portales NO ofrece «con opción»: sus URLs de resultados sólo saben de
              alquiler y venta, y adivinar la gramática de filtros de cada portal
              es lo primero que se rompe (ver lib/portal-search.ts). Se detecta al
              importar, no al buscar. */}
          {(isPortals
            ? (["RENT", "SALE"] as const)
            : (["RENT", "RENT_TO_OWN", "SALE", "ANY"] as const)
          ).map((op) => {
            const active = filters.operation === op;
            return (
              <Pressable
                key={op}
                onPress={() => setFilters((f) => ({ ...f, operation: op }))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.scopeChip,
                  {
                    borderColor: active ? th.accent : th.border,
                    backgroundColor: active ? th.accentSoft : "transparent",
                  },
                ]}
              >
                <Text style={[styles.scopeText, { color: active ? th.accent : th.textMuted }]}>
                  {op === "RENT"
                    ? t("records.op_rent")
                    : op === "RENT_TO_OWN"
                      ? t("records.op_rent_to_own")
                      : op === "SALE"
                        ? t("records.op_sale")
                        : t("records.op_all")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {isPortals ? (
        <View style={styles.portalBlock}>
          <View style={styles.scopeRow}>
            {(Object.keys(PORTALS) as PortalKey[]).map((p) => {
              const active = portal === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => { setPortal(p); setPortalHits(null); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.scopeChip,
                    {
                      borderColor: active ? th.primary : th.border,
                      backgroundColor: active ? th.primarySoft : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.scopeText, { color: active ? th.primary : th.textMuted }]}>
                    {PORTALS[p].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Mientras busca, el botón deja paso al progreso: enseñar a la vez un
              botón inerte y una tarjeta de estado sería ruido duplicado. */}
          {runningUrl && !inspecting ? (
            <PortalSearchProgress
              portalLabel={PORTALS[portal].label}
              progress={progress}
              onStop={() => { setRunningUrl(null); setProgress(null); }}
            />
          ) : (
            <Pressable
              onPress={runPortalSearch}
              accessibilityRole="button"
              style={[
                styles.portalCta,
                { backgroundColor: th.primary, borderColor: th.border },
              ]}
            >
              <Ionicons name="globe-outline" size={16} color={th.primaryFg} />
              <Text style={[styles.portalCtaText, { color: th.primaryFg }]}>
                {city
                  ? t("search.portal_search", { portal: PORTALS[portal].label })
                  : t("search.portal_set_zone")}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.notice, { color: th.textSubtle }]}>
            {city
              ? t("search.portal_zone", { city, province: province || "—" })
              : t("search.portal_zone_required")}
          </Text>
          {portalDebug && (
            <Text style={[styles.notice, { color: th.textSubtle }]}>{portalDebug}</Text>
          )}
        </View>
      ) : (
        <View style={[styles.searchBar, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Ionicons name="search" size={16} color={th.textSubtle} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("search.placeholder")}
            placeholderTextColor={th.textSubtle}
            style={[styles.input, { color: th.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading && ready && <ActivityIndicator size="small" color={th.primary} />}
        </View>
      )}

      {unknownProvince && (
        <Text style={[styles.notice, { color: th.textMuted }]}>
          {t("search.province_unknown", { name: unknownProvince })}
        </Text>
      )}

      {isProperty && properties?.total != null && results && results.length > 0 && (
        <Text style={[styles.notice, { color: th.textSubtle }]}>
          {t("search.results_count", { count: properties.total })}
        </Text>
      )}

      {isPortals && portalHits?.length === 0 && (
        <EmptyState
          icon="globe-outline"
          title={t("search.portal_none_title", { portal: PORTALS[portal].label })}
          description={t("search.portal_none_desc")}
        />
      )}

      {!isPortals && ready && results && results.length === 0 && !loading && (
        isProperty ? (
          <EmptyState
            icon="funnel-outline"
            title={t("search.empty_filters_title")}
            // Sin filtros ni texto, "no hay resultados" significa que no tienes
            // guardado nada de esa operación: decirlo evita que parezca averiado.
            description={
              activeFilters === 0 && !textReady
                ? t("search.empty_operation_desc")
                : t("search.empty_filters_desc")
            }
          />
        ) : (
          <EmptyState icon="search-outline" title={t("search.no_results", { q: debounced })} />
        )
      )}

      {isPortals ? (
        <FlatList
          data={portalHits ?? []}
          keyExtractor={(h) => h.url.split(/[?#]/)[0]}
          // El check de "ya guardado" vive fuera de `data`: sin esto la fila no
          // se repinta al volver del detalle.
          extraData={savedTick}
          renderItem={({ item }) => {
            const alreadySaved = isListingSaved(item.url);
            return (
            <Pressable
              onPress={() => openPortalHit(item)}
              disabled={!!runningUrl}
              accessibilityRole="button"
              accessibilityLabel={
                alreadySaved
                  ? t("search.hit_open_saved", { title: item.title })
                  : t("search.hit_open", { title: item.title })
              }
              style={[styles.hit, { backgroundColor: th.surface, borderColor: th.border }]}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.hitImage} />
              ) : (
                <View style={[styles.hitImage, { backgroundColor: th.surfaceRaised }]} />
              )}
              <View style={styles.hitBody}>
                <Text numberOfLines={2} style={[styles.hitTitle, { color: th.text }]}>
                  {item.title}
                </Text>
                <Text style={[styles.hitMeta, { color: th.textMuted }]}>
                  {[
                    item.price != null
                      ? `${item.price.toLocaleString("es-ES")} €${filters.operation === "SALE" ? "" : "/mes"}`
                      : null,
                    item.rooms != null ? `${item.rooms} hab` : null,
                    item.area != null ? `${item.area} m²` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Text style={[styles.hitPortal, { color: th.textSubtle }]}>
                  {PORTALS[item.portal].label}
                </Text>
              </View>
              {/* Antes había un "+" aquí y mentía: no añadía, navegaba a
                  Importar. Ahora pulsar abre la ficha, así que el glifo es un
                  chevron — o un check si ya está en tus registros. */}
              <Ionicons
                name={alreadySaved ? "checkmark-circle" : "chevron-forward"}
                size={20}
                color={alreadySaved ? "#15803D" : th.textSubtle}
              />
            </Pressable>
            );
          }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
      <FlatList
        data={results ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <RecordCard record={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
      )}

      {/* Motor de búsqueda en el portal: WebView oculto salvo que pidan captcha. */}
      {runningUrl && (
        <PortalSearchWebView
          key={runningUrl}
          url={runningUrl}
          portal={portal}
          operation={isRentOperation(filters.operation) ? "RENT" : "SALE"}
          city={city}
          forceVisible={inspecting}
          onProgress={setProgress}
          onResults={(hits, debug) => {
            const { kept: filtered, dropped } = applyLocalFilters(hits, filters);
            // Dedup final por URL canónica (variantes de query del mismo anuncio).
            const kept = dedupeHits(filtered);
            setPortalHits(kept);
            // Traza legible: sin esto, "0 resultados" no distingue entre página
            // no cargada, enlaces no reconocidos y filtros demasiado estrechos.
            setPortalDebug(
              [
                debug
                  ? `${debug.anchors} enlaces · ${debug.matched} de anuncio · ${debug.cards} tarjetas · ${debug.withPrice ?? 0} con precio · ${kept.length} tras filtros`
                  : `${kept.length} tras filtros`,
                // Qué filtro se llevó por delante los que faltan.
                dropped.sanity + dropped.price + dropped.rooms + dropped.area > 0
                  ? `Descartados: ${dropped.sanity} precio absurdo · ${dropped.price} fuera de rango · ${dropped.rooms} habitaciones · ${dropped.area} superficie`
                  : null,
                debug?.mismatch ? t("search.portal_mismatch") : null,
                // Formas de enlace reales de la página: con esto se corrige el
                // patrón del portal en vez de adivinarlo.
                debug?.shapes?.length ? `Enlaces: ${debug.shapes.join(" | ")}` : null,
                debug?.title ? `Página: ${debug.title}` : null,
                debug?.href ?? null,
              ]
                .filter(Boolean)
                .join("\n")
            );
            // Cero anuncios = la página no era el listado. Se deja montada y
            // visible para que el usuario vea (y pueda resolver) qué la bloquea.
            // Si el usuario resuelve el captcha, la página recarga y el script
            // se reinyecta: esta misma rama recoge los anuncios y cierra el
            // WebView sin que tenga que volver a pulsar nada.
            if (hits.length === 0) {
              setInspecting(true);
            } else {
              setRunningUrl(null);
              setInspecting(false);
            }
            setProgress(null);
          }}
          onCancel={() => { setRunningUrl(null); setInspecting(false); }}
        />
      )}

      <PropertyFilterSheet
        visible={sheetOpen}
        filters={filters}
        onApply={setFilters}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scopeRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  scopeText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14 },
  notice: { fontSize: 12, fontFamily: fonts.bodyMedium, marginHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16 },
  portalBlock: { marginBottom: 4 },
  portalCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  portalCtaText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  hitImage: { width: 64, height: 64, borderRadius: 10 },
  hitBody: { flex: 1, gap: 2 },
  hitTitle: { fontSize: 13, fontFamily: fonts.bodySemibold },
  hitMeta: { fontSize: 12, fontFamily: fonts.bodyMedium },
  hitPortal: { fontSize: 11, fontFamily: fonts.bodyMedium },
});
