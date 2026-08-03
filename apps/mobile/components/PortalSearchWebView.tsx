import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import {
  getSearchExtractorScript,
  portalDomain,
  type PortalDebug,
  type PortalHit,
  type PortalKey,
  type PortalProgress,
} from "@/lib/portal-search";

/**
 * Ejecuta una búsqueda EN UN PORTAL dentro del WebView del usuario y devuelve
 * los anuncios encontrados. Hermano de `WebViewImporter`, que hace lo mismo con
 * la ficha de un anuncio concreto.
 *
 * El UA de Chrome y las cookies compartidas son los mismos de allí y por la
 * misma razón: el UA por defecto del WebView de Android lleva "; wv)" y
 * DataDome lo marca al instante aunque detrás haya una persona.
 */
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

/**
 * Ajusta la página al ancho del móvil.
 *
 * Sin esto la web se pinta a su anchura natural y hay que hacer zoom para leer
 * nada — se nota sobre todo en la interstitial de DataDome, que no es
 * responsive y no trae `<meta viewport>`. Se corre en CADA carga (prop
 * `injectedJavaScript`), no solo en la del listado, porque el usuario ve
 * precisamente esas páginas intermedias.
 *
 * `maximum-scale=5` en vez de bloquear el zoom: impedir ampliar rompe la
 * accesibilidad de quien necesita agrandar el texto.
 */
const FIT_TO_SCREEN = `
(function() {
  var apply = function() {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    // Puede haber VARIOS meta viewport (la interstitial añade el suyo encima).
    // Gana el último, así que sobra con dejar uno.
    var metas = document.querySelectorAll('meta[name="viewport"]');
    for (var i = metas.length - 1; i > 0; i--) {
      try { metas[i].parentNode.removeChild(metas[i]); } catch (e) {}
    }
    var m = metas[0];
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'viewport'); head.appendChild(m); }
    m.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5');
    // Anchos fijos en píxeles: la página de DataDome trae un layout de
    // escritorio y desborda aunque el viewport sea correcto.
    try {
      var de = document.documentElement, b = document.body;
      if (de) { de.style.maxWidth = '100%'; de.style.overflowX = 'hidden'; }
      if (b) { b.style.maxWidth = '100%'; b.style.overflowX = 'hidden'; b.style.width = 'auto'; }
    } catch (e) {}
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  // La página puede reescribir su viewport al hidratar: se reafirma unos
  // segundos en vez de confiar en una sola pasada.
  var n = 0, id = setInterval(function() { apply(); if (++n > 12) clearInterval(id); }, 400);
})();
true;
`;

type Msg =
  | { type: "results"; data: PortalHit[]; debug?: PortalDebug }
  | { type: "progress"; stage: PortalProgress["stage"]; found: number; seconds: number }
  | { type: "challenge" };

export function PortalSearchWebView({
  url,
  portal,
  operation,
  city,
  forceVisible = false,
  onResults,
  onProgress,
  onCancel,
}: {
  url: string;
  portal: PortalKey;
  operation: "RENT" | "SALE";
  /** Municipio pedido: sirve para detectar que el portal nos ha desviado. */
  city: string;
  /**
   * Enseña la página aunque no haya captcha detectado. Se usa cuando la
   * extracción devuelve cero: si la máquina no sabe leer la página, lo honesto
   * es enseñársela a la persona, que sí sabrá si es un captcha, un muro de
   * cookies o que el municipio no existe en ese portal.
   */
  forceVisible?: boolean;
  onResults: (hits: PortalHit[], debug?: PortalDebug) => void;
  /** Qué está haciendo el script ahora mismo, para pintarlo en pantalla. */
  onProgress?: (p: PortalProgress) => void;
  onCancel: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const [challenge, setChallenge] = useState(false);
  const [host, setHost] = useState(() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  });
  const domain = portalDomain(portal);
  /** Sólo se inyecta en el dominio del portal: nunca en un tercero al que nos lleve. */
  const trusted = host === domain || host.endsWith(`.${domain}`);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as Msg;
      if (msg.type === "progress") {
        onProgress?.({ stage: msg.stage, found: msg.found, seconds: msg.seconds });
      } else if (msg.type === "challenge") {
        // El portal pide captcha: se enseña el WebView para que lo resuelva.
        // La cookie que deja sobrevive, así que no vuelve a pedirlo cada vez.
        setChallenge(true);
      } else if (msg.type === "results") {
        setChallenge(false);
        onResults(msg.data ?? [], msg.debug);
      }
    } catch {
      onResults([]);
    }
  }

  const shown = challenge || forceVisible;
  const containerStyle = shown
    ? [StyleSheet.absoluteFillObject, styles.visible, { paddingTop: insets.top }]
    : styles.hidden;

  return (
    <View style={containerStyle}>
      {shown && (
        <View style={[styles.bar, { backgroundColor: th.surface, borderBottomColor: th.border }]}>
          <View style={styles.barBody}>
            <Text style={[styles.barText, { color: th.text }]}>
              {challenge ? t("importar.captcha_hint") : t("search.portal_inspect_hint")}
            </Text>
            {/* Qué web es ESTA: sin decirlo, una página ajena a pantalla completa
                dentro de la app se confunde con la propia app. Nunca pidas aquí
                usuario ni contraseña de nada. */}
            <Text style={[styles.barHost, { color: th.textSubtle }]} numberOfLines={1}>
              {t("search.portal_external_site", { host: host || domain })}
            </Text>
          </View>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={[styles.cancel, { color: th.primary }]}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      )}

      <WebView
        ref={ref}
        source={{ uri: url }}
        onNavigationStateChange={(nav) => {
          try {
            setHost(new URL(nav.url).host);
          } catch {
            /* about:blank y similares */
          }
        }}
        onLoadEnd={() => {
          if (!trusted) return; // no se inyecta nada fuera del dominio del portal
          ref.current?.injectJavaScript(getSearchExtractorScript(portal, url, operation, city));
        }}
        onMessage={handleMessage}
        style={styles.webview}
        pointerEvents={shown ? "auto" : "none"}
        javaScriptEnabled
        domStorageEnabled
        // Ajuste al ancho del móvil, ANTES de que pinte (si no, se ve un
        // instante a tamaño de escritorio) y otra vez al terminar de cargar.
        injectedJavaScriptBeforeContentLoaded={FIT_TO_SCREEN}
        injectedJavaScript={FIT_TO_SCREEN}
        // Android: escala la página al ancho del WebView cuando la web ignora
        // el viewport. En iOS lo resuelve WKWebView con el meta de arriba.
        scalesPageToFit
        // Zoom manual disponible: si el usuario necesita agrandar, que pueda.
        setBuiltInZoomControls
        setDisplayZoomControls={false}
        userAgent={Platform.OS === "android" ? ANDROID_CHROME_UA : undefined}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", top: -5000, left: 0, width: 1, height: 1, overflow: "hidden" },
  visible: { backgroundColor: "#fff", zIndex: 999 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barBody: { flex: 1, gap: 2 },
  barText: { fontSize: 13, fontFamily: fonts.bodyMedium },
  barHost: { fontSize: 11, fontFamily: fonts.bodyMedium },
  cancel: { fontSize: 13, fontFamily: fonts.bodySemibold, paddingLeft: 12 },
  webview: { flex: 1 },
});
