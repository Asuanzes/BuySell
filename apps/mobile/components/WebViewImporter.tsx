import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { getExtractorScript } from "@/lib/portal-extractors";

/**
 * UA de Chrome Android REAL para el WebView. El UA por defecto del WebView de
 * Android lleva el token "; wv)" (y `applicationNameForUserAgent` solo AÑADE un
 * sufijo, no lo quita) — DataDome (Idealista/Milanuncios) lo marca a la primera
 * y sirve el interstitial de captcha aunque el tráfico sea de un usuario real.
 * En iOS el UA de WKWebView ya es el de Safari (no delata) → se deja el suyo.
 */
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

export type ExtractedPayload = {
  url: string;
  portal?: string;
  title: string;
  // Operación detectada del anuncio (ruta /alquiler- vs /venta-, etc.).
  operationType?: "SALE" | "RENT" | "RENT_TO_OWN";
  price?: number | null;
  description?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  builtArea?: number | null;
  usableArea?: number | null;
  floor?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  images: string[];
  features?: string[];
};

type Props = {
  url: string;
  onExtracted: (data: ExtractedPayload) => void;
  onError: (reason: string) => void;
  onCancel: () => void;
  /** Progreso de carga del anuncio (0–1), para pintar la barra en el importador. */
  onProgress?: (p: number) => void;
};

type WebViewMsg =
  | { type: "extracted"; data: ExtractedPayload }
  | { type: "challenge" }
  | { type: "error"; reason: string };

export function WebViewImporter({ url, onExtracted, onError, onCancel, onProgress }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const [challenge, setChallenge] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as WebViewMsg;
      if (msg.type === "extracted") {
        setChallenge(false);
        onExtracted(msg.data);
      } else if (msg.type === "challenge") {
        setChallenge(true);
      } else if (msg.type === "error") {
        onError(msg.reason);
      }
    } catch {
      onError("Respuesta inesperada del WebView");
    }
  }

  function handleLoadEnd() {
    const script = getExtractorScript(url);
    ref.current?.injectJavaScript(script);
  }

  // Cuando no hay challenge, el WebView está fuera de pantalla (carga en background).
  // Cuando hay challenge, ocupa toda la pantalla para que el usuario interactúe.
  const containerStyle = challenge
    ? [StyleSheet.absoluteFillObject, styles.visible, { paddingTop: insets.top }]
    : styles.hidden;

  return (
    <View style={containerStyle}>
      {challenge && (
        <View style={[styles.bar, { backgroundColor: th.surface, borderBottomColor: th.border }]}>
          <Text style={[styles.barText, { color: th.text }]}>
            {t("importar.captcha_hint")}
          </Text>
          <Pressable onPress={() => { setChallenge(false); onCancel(); }}>
            <Text style={[styles.cancel, { color: th.primary }]}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      )}

      {!challenge && loadProgress < 1 && (
        <ActivityIndicator
          style={styles.hiddenIndicator}
          size="small"
          color={th.primary}
        />
      )}

      <WebView
        ref={ref}
        source={{ uri: url }}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onLoadProgress={({ nativeEvent }) => {
          setLoadProgress(nativeEvent.progress);
          onProgress?.(nativeEvent.progress);
        }}
        style={styles.webview}
        // Evitar que el WebView intercepte gestos de la pantalla principal cuando está oculto
        pointerEvents={challenge ? "auto" : "none"}
        javaScriptEnabled
        domStorageEnabled
        // UA completo (Android): sin el "; wv)" que dispara DataDome. iOS: el suyo.
        userAgent={Platform.OS === "android" ? ANDROID_CHROME_UA : undefined}
        // Cookies persistentes/compartidas: la cookie `datadome` que deja un
        // captcha RESUELTO sobrevive entre imports → no vuelve a pedirlo cada vez.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Oculto pero A TAMAÑO COMPLETO, fuera de pantalla. Escondiéndolo en 1×1 px
   * el WebView maqueta con un viewport de 1 px de ancho, y cuando aparece el
   * captcha a pantalla completa la página se ve gigante. El tamaño del lienzo
   * manda sobre cualquier `<meta viewport>`.
   */
  hidden: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ translateY: -10000 }],
  },
  visible: {
    backgroundColor: "#fff",
    zIndex: 999,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  cancel: {
    fontSize: 13,
    fontFamily: fonts.bodySemibold,
    paddingLeft: 12,
  },
  webview: {
    flex: 1,
  },
  hiddenIndicator: {
    position: "absolute",
    top: -10100,
  },
});
