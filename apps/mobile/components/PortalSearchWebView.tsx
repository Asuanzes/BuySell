import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import {
  getSearchExtractorScript,
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
  onResults,
  onCancel,
}: {
  url: string;
  portal: PortalKey;
  operation: "RENT" | "SALE";
  onResults: (hits: PortalHit[], debug?: PortalDebug) => void;
  onCancel: () => void;
}) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const [challenge, setChallenge] = useState(false);

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

  const containerStyle = challenge
    ? [StyleSheet.absoluteFillObject, styles.visible, { paddingTop: insets.top }]
    : styles.hidden;

  return (
    <View style={containerStyle}>
      {challenge && (
        <View style={[styles.bar, { backgroundColor: th.surface, borderBottomColor: th.border }]}>
          <Text style={[styles.barText, { color: th.text }]}>{t("importar.captcha_hint")}</Text>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={[styles.cancel, { color: th.primary }]}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      )}

      <WebView
        ref={ref}
        source={{ uri: url }}
        onLoadEnd={() =>
          ref.current?.injectJavaScript(getSearchExtractorScript(portal, url, operation))
        }
        onMessage={handleMessage}
        style={styles.webview}
        pointerEvents={challenge ? "auto" : "none"}
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
  barText: { flex: 1, fontSize: 13, fontFamily: fonts.bodyMedium },
  cancel: { fontSize: 13, fontFamily: fonts.bodySemibold, paddingLeft: 12 },
  webview: { flex: 1 },
});
