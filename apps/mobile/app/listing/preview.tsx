import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { isRentOperation } from "@nidokey/shared";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { api, ApiError } from "@/lib/api";
import { PORTALS } from "@/lib/portal-search";
import { markListingSaved, parsePreviewParams } from "@/lib/listing-preview";
import { WebViewImporter, type ExtractedPayload } from "@/components/WebViewImporter";
import { Button, Card, EmptyState } from "@/components/ui";

/**
 * DETALLE DE UN RESULTADO DE BÚSQUEDA — no de un registro.
 *
 * Es deliberadamente una ruta del Stack raíz y no una pestaña: la pestaña
 * Buscar guarda sus resultados, filtros y scroll en estado local, y el layout
 * de pestañas usa `<Slot/>`, de modo que ir a otra pestaña la DESMONTA entera.
 * Empujada sobre el Stack, la lista sigue viva debajo y volver es gratis.
 *
 * Sólo se explora. La única acción es "Añadir a registros": aquí no hay
 * compartir, ni mensajería, ni editar, ni borrar, ni herramientas — todo eso
 * pertenece a la ficha guardada (`app/property/[id].tsx`) y sigue igual allí.
 * Ni siquiera se ofrece abrir el anuncio en el navegador: la fuente se enseña
 * como dato, no como botón.
 *
 * Los datos llegan en dos tiempos: la lista ya sabía título, precio, foto,
 * habitaciones y metros (se pintan al instante), y el resto — el resto de
 * fotos, la descripción, la ubicación, los baños, las características — lo
 * extrae el mismo WebView que usa Importar. La diferencia con Importar es que
 * aquí el resultado se ENSEÑA en vez de enviarse; cuando el usuario pulsa
 * añadir, se manda lo ya extraído, sin volver a cargar el anuncio.
 */

const SCREEN_WIDTH = Dimensions.get("window").width;

type ImportResult = { created: boolean; priceChanged: boolean; propertyId: string };
type Phase = "extracting" | "ready" | "failed";

export default function ListingPreviewScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const [seed] = useState(() => parsePreviewParams(params as Record<string, unknown>));

  const [phase, setPhase] = useState<Phase>("extracting");
  const [payload, setPayload] = useState<ExtractedPayload | null>(null);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Reintentar = volver a montar el WebView desde cero (key nueva). */
  const [attempt, setAttempt] = useState(0);

  /**
   * La extracción y el POST son asíncronos y esta pantalla se puede cerrar con
   * el back nativo en cualquier momento: sin esto, un `setState` posterior cae
   * sobre un componente desmontado.
   */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // ¿Ya es un registro mío? Se consulta ANTES de que pulse nada, para que el
  // botón diga la verdad de entrada en vez de descubrirlo al pulsarlo.
  useEffect(() => {
    if (!seed) return;
    api<{ propertyId: string | null }>(
      `/api/listings/status?url=${encodeURIComponent(seed.url)}`
    )
      .then((r) => {
        if (!alive.current || !r.propertyId) return;
        setSaved(true);
        markListingSaved(seed.url);
      })
      .catch(() => {
        // Que falle la consulta no debe bloquear el añadir: el servidor
        // deduplica por URL de todos modos, así que como mucho se ofrece
        // añadir algo que ya estaba y la respuesta será "ya lo tenías".
      });
  }, [seed]);

  const handleExtracted = useCallback((data: ExtractedPayload) => {
    if (!alive.current) return;
    // Mismo guard anti-ficha-vacía que Importar: si el portal bloqueó la
    // lectura no hay nada que enseñar ni nada que valga la pena guardar.
    const empty =
      (!data.images || data.images.length === 0) &&
      data.price == null && !data.description &&
      data.builtArea == null && data.rooms == null;
    if (empty) {
      setPhase("failed");
      return;
    }
    setPayload(data);
    setPhase("ready");
  }, []);

  async function add() {
    if (!seed || !payload || adding || saved) return;
    setAdding(true);
    setError(null);
    try {
      // La operación de la BÚSQUEDA como respaldo de la del anuncio: si el
      // extractor no la dedujo, `importListing` asume VENTA y validaría una
      // renta de 850 € contra la banda de venta (mínimo 10.000 €), tirando el
      // precio del anuncio. El usuario acaba de pedir explícitamente alquiler.
      const body = { ...payload, operationType: payload.operationType ?? seed.operation };
      // La respuesta distingue creado de "ya lo tenías", pero para esta
      // pantalla da igual: en los dos casos el anuncio queda guardado y el
      // usuario vuelve a explorar. El servidor deduplica por `Listing.url`.
      await api<ImportResult>("/api/listings/import", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Se marca ANTES del guard de montaje: si el usuario ya salió, la lista
      // sigue teniendo que enterarse de que ese anuncio está guardado.
      markListingSaved(seed.url);
      if (!alive.current) return;
      setSaved(true);
      // Se vuelve al LISTADO, no a la ficha creada: estaba explorando, y los
      // registros se revisan luego, cuando él quiera.
      router.back();
    } catch (e) {
      if (!alive.current) return;
      setError(
        e instanceof ApiError && e.status === 403
          ? t("preview.err_other_account")
          : e instanceof Error
            ? e.message
            : t("preview.err_add")
      );
    } finally {
      if (alive.current) setAdding(false);
    }
  }

  // URL que no es de un portal soportado. Llega por deep link, no desde la
  // lista: no se carga nada en el WebView.
  if (!seed) {
    return (
      <View style={[styles.screen, { backgroundColor: th.bg }]}>
        <EmptyState
          icon="alert-circle-outline"
          title={t("preview.invalid_title")}
          description={t("preview.invalid_desc")}
        />
      </View>
    );
  }

  const photos = payload?.images?.length ? payload.images : seed.imageUrl ? [seed.imageUrl] : [];
  const title = payload?.title?.trim() || seed.title || t("preview.untitled");
  const price = payload?.price ?? seed.price;
  const rooms = payload?.rooms ?? seed.rooms;
  const area = payload?.builtArea ?? payload?.usableArea ?? seed.area;
  const bathrooms = payload?.bathrooms ?? null;
  const location = [payload?.address, payload?.city, payload?.province]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" · ");
  // El alquiler con opción a compra cuenta como alquiler: su precio principal
  // es la cuota mensual. Una sola definición para toda la app.
  const isRent = isRentOperation(payload?.operationType ?? seed.operation);

  return (
    <View style={[styles.screen, { backgroundColor: th.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {photos.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((uri, i) => (
              <Image
                key={`${uri}|${i}`}
                source={{ uri }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.66 }}
                contentFit="cover"
                transition={150}
                accessibilityLabel={t("preview.photo_of", { n: i + 1, total: photos.length })}
              />
            ))}
          </ScrollView>
        ) : (
          // Anuncio sin foto: un hueco con icono es más honesto que un
          // rectángulo gris que parece una imagen que no termina de cargar.
          <View
            style={[
              styles.noPhoto,
              { height: SCREEN_WIDTH * 0.5, backgroundColor: th.surfaceRaised },
            ]}
          >
            <Ionicons name="image-outline" size={30} color={th.textSubtle} />
            <Text style={[styles.noPhotoText, { color: th.textSubtle }]}>
              {t("preview.no_photos")}
            </Text>
          </View>
        )}
        {photos.length > 0 && (
          <Text style={[styles.photoCount, { color: th.textMuted }]}>
            {t("preview.photos", { count: photos.length })}
          </Text>
        )}

        <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
          <Text style={[styles.title, { color: th.text }]}>{title}</Text>
          {!!location && (
            <Text style={[styles.location, { color: th.textMuted }]}>{location}</Text>
          )}
          {price != null && (
            <Text style={[styles.price, { color: th.accent }]}>
              {isRent
                ? t("card.per_month", { value: `${price.toLocaleString("es-ES")} €` })
                : `${price.toLocaleString("es-ES")} €`}
            </Text>
          )}
          <View style={styles.specs}>
            {rooms != null && <Spec icon="bed-outline" value={t("preview.rooms", { count: rooms })} />}
            {bathrooms != null && (
              <Spec icon="water-outline" value={t("preview.baths", { count: bathrooms })} />
            )}
            {area != null && <Spec icon="resize-outline" value={`${area} m²`} />}
            {!!payload?.floor && <Spec icon="business-outline" value={payload.floor} />}
          </View>
          {/* La FUENTE es un dato, no un botón: la única acción de esta
              pantalla es añadir. */}
          <Text style={[styles.source, { color: th.textSubtle }]}>
            {t("preview.source", { portal: PORTALS[seed.portal]?.label ?? seed.portal })}
          </Text>
        </View>

        {phase === "extracting" && (
          <Card>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={th.primary} />
              <Text style={[styles.loadingText, { color: th.text }]}>
                {t("preview.loading")}
              </Text>
            </View>
          </Card>
        )}

        {phase === "failed" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.failedText, { color: th.textMuted }]}>
              {t("preview.extraction_failed")}
            </Text>
            <Button
              label={t("importar.retry")}
              variant="ghost"
              size="sm"
              icon="refresh-outline"
              onPress={() => { setPhase("extracting"); setAttempt((n) => n + 1); }}
            />
          </Card>
        )}

        {!!payload?.description?.trim() && (
          <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.sectionTitle, { color: th.textMuted }]}>
              {t("preview.description")}
            </Text>
            <Text style={[styles.body, { color: th.text }]}>{payload.description.trim()}</Text>
          </View>
        )}

        {!!payload?.features?.length && (
          <View style={[styles.section, { backgroundColor: th.surface, borderColor: th.border }]}>
            <Text style={[styles.sectionTitle, { color: th.textMuted }]}>
              {t("preview.features")}
            </Text>
            <Text style={[styles.body, { color: th.text }]}>
              {payload.features.join(" · ")}
            </Text>
          </View>
        )}

        {!!error && (
          <Card>
            <Text style={[styles.errorText, { color: th.dangerFg }]}>{error}</Text>
          </Card>
        )}
      </ScrollView>

      {/* Única acción operativa de la pantalla.
          El `paddingBottom` sale del safe area, no de una constante: esta
          pantalla es una ruta del Stack raíz y no hereda el SafeAreaView de
          las pestañas, así que en Android la barra de navegación del sistema
          (gestos o tres botones) se comía el botón. Mismo idiom que la barra
          de pestañas en `(tabs)/_layout.tsx`. El 16 es el suelo, para que en
          un móvil sin barra tampoco quede pegado al borde. */}
      <View
        style={[
          styles.cta,
          {
            backgroundColor: th.surface,
            borderTopColor: th.border,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <Button
          label={saved ? t("preview.already_saved") : t("preview.add")}
          icon={saved ? "checkmark-circle" : "add-circle-outline"}
          onPress={add}
          loading={adding}
          disabled={saved || adding || phase !== "ready"}
        />
      </View>

      {phase === "extracting" && (
        <WebViewImporter
          key={`${seed.url}|${attempt}`}
          url={seed.url}
          onExtracted={handleExtracted}
          onError={() => { if (alive.current) setPhase("failed"); }}
          onCancel={() => { if (alive.current) setPhase("failed"); }}
        />
      )}
    </View>
  );
}

function Spec({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value: string }) {
  const { th } = useTheme();
  return (
    <View style={styles.spec}>
      <Ionicons name={icon} size={14} color={th.textMuted} />
      <Text style={[styles.specText, { color: th.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 24, gap: 12 },
  noPhoto: { alignItems: "center", justifyContent: "center", gap: 6 },
  noPhotoText: { fontSize: 12, fontFamily: fonts.bodyMedium },
  photoCount: { fontSize: 12, fontFamily: fonts.bodyMedium, marginHorizontal: 16 },
  section: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  sectionTitle: { fontSize: 12, fontFamily: fonts.bodySemibold },
  title: { fontSize: 17, fontFamily: fonts.heading },
  location: { fontSize: 13, fontFamily: fonts.bodyMedium },
  price: { fontSize: 20, fontFamily: fonts.bodyBold },
  specs: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  spec: { flexDirection: "row", alignItems: "center", gap: 4 },
  specText: { fontSize: 13, fontFamily: fonts.bodyMedium },
  source: { fontSize: 11, fontFamily: fonts.bodyMedium, marginTop: 4 },
  body: { fontSize: 13, lineHeight: 20 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  failedText: { fontSize: 13, lineHeight: 19 },
  errorText: { fontSize: 13 },
  cta: {
    paddingHorizontal: 16,
    paddingTop: 10,
    // paddingBottom lo pone el safe area en el componente.
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
