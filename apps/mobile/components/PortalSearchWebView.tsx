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

type Msg =
  | { type: "results"; data: PortalHit[]; debug?: PortalDebug }
  | { type: "challenge" };

export function PortalSearchWebView({
  url,
  portal,
  operation,
  city,
  forceVisible = false,
  onResults,
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
      if (msg.type === "challenge") {
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
