import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button } from "@/components/ui";

/**
 * Pin ajustable en mapa (embudo catastral, capa 4). Sin módulos nativos: WebView
 * (ya en el binario) + Leaflet 1.9.4 con SRI + teselas oficiales del IGN (IDEE,
 * CC BY 4.0, atribución visible). El contenido del WebView se trata como NO
 * confiable: el único mensaje aceptado es {type:"pin"|"ready"|"error"} y las
 * coordenadas se re-validan aquí antes de salir del componente.
 *
 * Elegir el edificio NO identifica la puerta: el aviso es fijo en la UI.
 */

type Props = {
  visible: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  onConfirm: (coords: { latitude: number; longitude: number }) => void;
  onClose: () => void;
};

// Centro de España como arranque cuando la ficha no tiene coordenadas.
const FALLBACK = { lat: 40.2, lng: -3.7, zoom: 6 };
const PIN_ZOOM = 18;

function validCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function buildHtml(lat: number, lng: number, zoom: number): string {
  // Leaflet fijado a 1.9.4 con integridad (SRI): si el CDN falla o el hash no
  // cuadra, el onerror avisa y la UI ofrece la alternativa manual.
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#dfe6dd}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""
  onerror="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'error'}))"></script>
<script>
(function(){
  function send(m){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  if (typeof L === "undefined") { send({type:"error"}); return; }
  try {
    var map = L.map("map", { zoomControl: true, attributionControl: true })
      .setView([${lat}, ${lng}], ${zoom});
    L.tileLayer("https://tms-ign-base.idee.es/1.0.0/IGNBaseTodo/{z}/{x}/{-y}.png", {
      maxZoom: 19,
      attribution: "&copy; <a href='https://www.ign.es'>Instituto Geogr\\u00e1fico Nacional</a>"
    }).addTo(map);
    var pin = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
    function report(ll){ send({type:"pin", lat: ll.lat, lng: ll.lng}); }
    pin.on("dragend", function(){ report(pin.getLatLng()); });
    map.on("click", function(e){ pin.setLatLng(e.latlng); report(e.latlng); });
    send({type:"ready"});
    report(pin.getLatLng());
  } catch (e) { send({type:"error"}); }
})();
</script></body></html>`;
}

export function MapPinSheet({ visible, initialLat, initialLng, onConfirm, onClose }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  const hasInitial = validCoords(initialLat ?? null, initialLng ?? null);
  const html = useMemo(
    () =>
      buildHtml(
        hasInitial ? (initialLat as number) : FALLBACK.lat,
        hasInitial ? (initialLng as number) : FALLBACK.lng,
        hasInitial ? PIN_ZOOM : FALLBACK.zoom
      ),
    [hasInitial, initialLat, initialLng]
  );

  function onMessage(ev: WebViewMessageEvent) {
    // Contenido no confiable: solo JSON con type conocido; coords re-validadas.
    let msg: unknown;
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string; lat?: unknown; lng?: unknown };
    if (m.type === "ready") setStatus("ready");
    else if (m.type === "error") setStatus("error");
    else if (m.type === "pin" && validCoords(m.lat, m.lng)) {
      setPin({ latitude: m.lat as number, longitude: m.lng as number });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: th.bg, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            style={styles.headerBtn}
          >
            <Ionicons name="close" size={22} color={th.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: th.text }]}>{t("detail.cadastre.map_pin_title")}</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.mapWrap}>
          {status === "error" ? (
            <View style={[styles.center, { backgroundColor: th.bg }]}>
              <Ionicons name="map-outline" size={32} color={th.textMuted} />
              <Text style={[styles.errText, { color: th.textMuted }]}>
                {t("detail.cadastre.map_pin_error")}
              </Text>
              <Button label={t("common.close")} variant="secondary" size="sm" onPress={onClose} style={{ marginTop: 12 }} />
            </View>
          ) : (
            <>
              <WebView
                ref={webRef}
                source={{ html }}
                originWhitelist={["about:blank"]}
                onShouldStartLoadWithRequest={(req) =>
                  // Solo el documento inicial; cualquier navegación fuera se corta.
                  req.url === "about:blank" || req.url.startsWith("data:")
                }
                onMessage={onMessage}
                setSupportMultipleWindows={false}
                allowFileAccess={false}
                allowUniversalAccessFromFileURLs={false}
                javaScriptEnabled
                domStorageEnabled={false}
                onError={() => setStatus("error")}
                style={{ flex: 1 }}
              />
              {status === "loading" && (
                <View style={[styles.center, styles.overlay]} pointerEvents="none">
                  <ActivityIndicator color={th.primary} />
                </View>
              )}
            </>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: th.bg }]}>
          <Text style={[styles.note, { color: th.textMuted }]}>
            {t("detail.cadastre.map_pin_note")}
          </Text>
          <Button
            label={t("detail.cadastre.map_pin_confirm")}
            icon="checkmark-outline"
            disabled={status !== "ready" || !pin}
            onPress={() => pin && onConfirm(pin)}
            style={{ marginTop: 10 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontFamily: fonts.bodySemibold },
  mapWrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  errText: { fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 10 },
  note: { fontSize: 12, lineHeight: 17 },
});
