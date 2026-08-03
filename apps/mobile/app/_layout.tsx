import "@/lib/logbox"; // PRIMERO: silencia warnings benignos de NativeEventEmitter
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { Appearance, Platform, StyleSheet, View } from "react-native";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import {
  ThemeContext,
  T,
  TD,
  T2100,
  TD2100,
  TOperativo,
  TDOperativo,
  useTheme,
  type ThemeMode,
} from "@/lib/theme";
import { applyNeonAccent } from "@/lib/neon-accents";
import { NeonProvider, useNeon } from "@/lib/neon-context";
import { useFonts } from "expo-font";
import { HeaderBack } from "@/components/HeaderBack";
import { fontAssets, fonts } from "@/lib/fonts";
import { isPortalUrl, extractSharedText } from "@/lib/portal-url";
import { isBookShareText } from "@/lib/book-url";
import { PendingImportProvider, usePendingImport } from "@/lib/pending-import";
import { BrandLoading } from "@/components/BrandLoading";
import { BootProvider, useBoot } from "@/lib/boot-context";
import { CategoryPrefsProvider } from "@/lib/records/category-prefs-context";
import { FoodCartProvider } from "@/lib/food-cart-context";
import { useChatNotificationTap } from "@/lib/chat/push";
import "@/lib/i18n"; // inicializa i18next (debe importarse antes de usar t())
import { useTranslation } from "react-i18next";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { AppStyleProvider, useAppStyle } from "@/lib/app-style-context";
import { getOnboardingDone, setOnboardingDone } from "@/lib/onboarding";

// Mantener el splash nativo hasta que la sesión esté resuelta: evita el
// "cuadrado blanco" y el flash blanco entre el splash y el primer render.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Carga Inter/Poppins (assets JS → OTA, sin recompilar nativo). No bloquea el
  // arranque: el loader de marca (≥1 s) tapa la carga; si tardara, un breve FOUT.
  useFonts(fontAssets);
  // Sembrar el tema desde el modo del SO de forma SÍNCRONA en el primer frame:
  // si arrancáramos siempre en claro (false), un usuario en modo oscuro vería
  // unos frames con fondo claro (#FAFAF7) sobre negro — el "cuadrado claro" del
  // arranque (visible en dev Y en release). SecureStore (async) luego respeta la
  // preferencia guardada del usuario si la hay.
  // Tema: "auto" sigue el sistema (default); "light"/"dark" lo fijan. Sembramos el
  // estado del SO de forma SÍNCRONA en el primer frame (evita el "cuadrado claro"
  // al arrancar en oscuro). SecureStore (async) carga luego la preferencia guardada.
  // Default = "light": el primer inicio (sin preferencia guardada) arranca en
  // vintage CLARO (appStyle también es "vintage" por defecto). Si el usuario ya
  // guardó una preferencia, SecureStore la carga abajo y manda.
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [systemDark, setSystemDark] = useState(() => Appearance.getColorScheme() === "dark");

  useEffect(() => {
    SecureStore.getItemAsync("nidokey.theme")
      .then((v) => {
        if (v === "dark" || v === "light" || v === "auto") setThemeModeState(v);
      })
      .catch(() => {});
  }, []);

  // En modo "auto", seguir en vivo los cambios de tema del sistema.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystemDark(colorScheme === "dark")
    );
    return () => sub.remove();
  }, []);

  // Red de seguridad: si la sesión tardara demasiado, no dejar el splash colgado.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, []);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    SecureStore.setItemAsync("nidokey.theme", m).catch(() => {});
  };
  const dark = themeMode === "auto" ? systemDark : themeMode === "dark";
  const toggleTheme = () => setThemeMode(dark ? "light" : "dark");

  // El tema (incl. estilo 2100) se resuelve en <ThemedShell>, bajo <AppStyleProvider>.

  // Barra de navegación de Android (edge-to-edge): por defecto sus botones siguen
  // al SISTEMA, no a la app → en tema claro con el sistema en oscuro quedaban
  // claros e invisibles. Forzamos los iconos según el tema de la app: OSCUROS en
  // claro (visibles sobre fondo claro), CLAROS en oscuro. (Solo button style es
  // aplicable en edge-to-edge.)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setButtonStyleAsync(dark ? "light" : "dark").catch(() => {});
  }, [dark]);

  return (
    // ShareIntentProvider entrega el contenido compartido al hook (un solo root)
    // en vez de montar una 2ª instancia como react-native-share-menu.
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <AppStyleProvider>
        <NeonProvider>
          <ThemedShell
            dark={dark}
            colorScheme={colorScheme}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            toggleTheme={toggleTheme}
          />
        </NeonProvider>
      </AppStyleProvider>
    </ShareIntentProvider>
  );
}

/**
 * Resuelve el TEMA aplicando el ESTILO visual (vintage / 2100). Vive bajo
 * <AppStyleProvider> para poder leer `appStyle`: cuando es "2100" entrega las
 * paletas T2100/TD2100; si no, T/TD. (Antes ThemeContext quedaba por ENCIMA de
 * AppStyleProvider y `th` nunca conmutaba → el picker guardaba "2100" pero no
 * tenía efecto visual en colores/superficies/texto.)
 */
function ThemedShell({
  dark,
  colorScheme,
  themeMode,
  setThemeMode,
  toggleTheme,
}: {
  dark: boolean;
  colorScheme: ReturnType<typeof useColorScheme>;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
}) {
  const { appStyle } = useAppStyle();
  const { accent } = useNeon();
  const base =
    appStyle === "2100"
      ? dark
        ? TD2100
        : T2100
      : appStyle === "operativo"
        ? dark
          ? TDOperativo
          : TOperativo
        : dark
          ? TD
          : T;
  const th = appStyle === "2100" ? applyNeonAccent(base, accent, dark) : base;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: th.bg }}>
      <LanguageProvider>
        <AuthProvider>
          <ThemeContext.Provider value={{ dark, th, themeMode, setThemeMode, toggleTheme }}>
            <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              <PendingImportProvider>
                <BootProvider>
                  <CategoryPrefsProvider>
                    <FoodCartProvider>
                      <AuthGate />
                    </FoodCartProvider>
                  </CategoryPrefsProvider>
                </BootProvider>
                <StatusBar style="auto" />
              </PendingImportProvider>
            </ThemeProvider>
          </ThemeContext.Provider>
        </AuthProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate() {
  const { state } = useAuth();
  const { th } = useTheme();
  const { t } = useTranslation();
  const segments = useSegments();
  const router = useRouter();
  // Estado del navegador raíz: su `.key` solo existe cuando el Stack está
  // montado. Lo usamos para no navegar antes de tiempo (cold-start desde share).
  const rootNavState = useRootNavigationState();
  const { setUrl, setBookShare } = usePendingImport();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [localOnboardingDone, setLocalOnboardingDone] = useState<boolean | null>(null);

  // El loader (bolitas) se queda hasta que: la sesión está resuelta + (si está
  // logueado) los REGISTROS de la primera pantalla (Inmuebles) ya cargaron + un
  // mínimo de 1 s para que se vean girar. Así las bolitas tapan también la
  // precarga de los registros → UNA sola carga, no dos.
  const { firstScreenReady } = useBoot();
  const authResolved = state.kind !== "loading";

  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    // `id`, no `t`: evita sombrear la función de traducción del componente.
    const id = setTimeout(() => setMinElapsed(true), 1000);
    return () => clearTimeout(id);
  }, []);

  // Al tocar una notificación de chat → abrir la conversación (deep-link).
  useEffect(() => useChatNotificationTap(), []);

  // Embudo: un session_start por arranque, cuando la sesión queda resuelta.
  const sessionTracked = useRef(false);
  useEffect(() => {
    if (state.kind === "loading" || sessionTracked.current) return;
    sessionTracked.current = true;
    track("session_start", { authed: state.kind === "authed" });
  }, [state.kind]);

  // Red de seguridad: nunca dejar el loader colgado más de 8 s si los registros
  // tardaran o fallaran sin avisar.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBootTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  const onOnboarding = segments[0] === "onboarding";
  const readyForCurrentRoute =
    state.kind !== "authed" || onOnboarding || firstScreenReady || bootTimedOut;
  const showLoader = !(authResolved && readyForCurrentRoute && minElapsed);

  useEffect(() => {
    if (state.kind !== "authed") {
      setLocalOnboardingDone(null);
      return;
    }
    let alive = true;
    getOnboardingDone()
      .then(async (done) => {
        if (!state.user.needsOnboarding && !done) {
          await setOnboardingDone();
          if (alive) setLocalOnboardingDone(true);
          return;
        }
        if (alive) setLocalOnboardingDone(done);
      })
      .catch(() => {
        if (alive) setLocalOnboardingDone(false);
      });
    return () => {
      alive = false;
    };
  }, [state]);

  // El redirect se dispara en cuanto la sesión resuelve (el Stack ya está montado
  // debajo del overlay), así la pantalla de registros monta y empieza a cargar.
  useEffect(() => {
    if (!authResolved) return;
    // Mismo guard que el efecto del share: el <Stack> se renderiza condicionalmente
    // (`authResolved ? <Stack> : null`), así que monta tarde y este redirect corre en
    // la MISMA transición que lo revela → sin esperar a que el navegador raíz esté
    // montado, router.replace puede lanzar "navigate before mounting" en frío.
    if (!rootNavState?.key) return;
    const onLogin = segments[0] === "login";
    const effectiveOnboardingDone =
      state.kind === "authed" && !state.user.needsOnboarding ? true : localOnboardingDone;
    const onboardingKnown = state.kind !== "authed" || effectiveOnboardingDone !== null;
    const requiresOnboarding =
      state.kind === "authed" &&
      onboardingKnown &&
      (state.user.needsOnboarding || !effectiveOnboardingDone);
    if (state.kind === "unauthed" && !onLogin) {
      router.replace("/login");
    } else if (state.kind === "authed" && requiresOnboarding && !onOnboarding) {
      router.replace("/onboarding");
    } else if (state.kind === "authed" && onboardingKnown && !requiresOnboarding && onOnboarding) {
      router.replace("/(tabs)");
    } else if (state.kind === "authed" && onLogin && onboardingKnown && !requiresOnboarding) {
      // Solo saltar a tabs cuando YA conocemos el estado de onboarding y no se
      // requiere. Para un usuario NUEVO recién verificado, onboardingKnown es
      // false hasta que localOnboardingDone resuelve: en esa ventana NO navegamos
      // (el loader del AuthGate tapa la pantalla) y, al resolver, la rama
      // requiresOnboarding lo lleva a /onboarding — sin parpadeo previo a tabs.
      router.replace("/(tabs)");
    }
  }, [authResolved, rootNavState?.key, state, segments, router, localOnboardingDone, onOnboarding]);

  // Ocultar el splash nativo en cuanto monta el JS, para que SÍ se vea la
  // pantalla de carga (BrandLoading) mientras se resuelve la sesión, en vez de
  // saltar del splash directo a la app. Mismo fondo que el splash → sin saltos.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Deep links (expo-linking): una URL de portal abierta como enlace → Importar.
  useEffect(() => {
    if (state.kind !== "authed") return;
    let alive = true;
    const go = (u: string | null) => {
      if (!alive || !u) return;
      if (isPortalUrl(u)) {
        setUrl(u);
        router.navigate("/importar");
      } else if (isBookShareText(u)) {
        // Libros por deep-link (no solo por share-intent): también se importan.
        setBookShare(u);
        router.navigate("/importar");
      }
    };
    Linking.getInitialURL().then((u) => go(u ?? null));
    const linkSub = Linking.addEventListener("url", ({ url }) => go(url));
    return () => {
      alive = false;
      linkSub.remove();
    };
  }, [state.kind, router, setUrl, setBookShare]);

  // Share-to-app (expo-share-intent): la hoja de Compartir entrega el contenido al
  // HOOK (un solo root React — no crea una 2ª instancia como react-native-share-menu,
  // que corrompía TODA la navegación). Clasificamos el texto compartido: URL de
  // portal → inmueble; ISBN/host de libro → libro. Navegamos a Importar (seguro
  // ahora) y allí se auto-importa.
  useEffect(() => {
    if (state.kind !== "authed" || !hasShareIntent) return;
    const text = extractSharedText(shareIntent);
    if (text) {
      const url = text.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
      if (url && isPortalUrl(url)) {
        setUrl(url);
        router.navigate("/importar");
      } else if (isBookShareText(text)) {
        setBookShare(text);
        router.navigate("/importar");
      }
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, state.kind, router, setUrl, setBookShare, resetShareIntent]);

  return (
    <>
      {/* El navegador (<Stack>) se monta SIEMPRE desde el primer render — nunca
          condicionado a authResolved. Es la única forma fiable de evitar el
          "Attempted to navigate before mounting the Root Layout": si el Stack
          falta aunque sea un instante, cualquier navegación (share, ficha,
          botones) revienta. El loader se superpone encima mientras resuelve la
          sesión; las pantallas leen el token de SecureStore en cada llamada, así
          que no fallan por montar antes de que el AuthProvider resuelva. */}
      <Stack screenOptions={{ headerLeft: () => <HeaderBack /> }}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="property/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: "",
            }}
          />
          {/* Detalle de un resultado de BÚSQUEDA (aún no es un registro). Va
              en el Stack raíz, no en las pestañas, para que la lista de
              resultados siga montada debajo y volver conserve resultados,
              filtros y scroll — las pestañas usan <Slot/> y desmontan. */}
          <Stack.Screen
            name="listing/preview"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("preview.title"),
            }}
          />
          <Stack.Screen
            name="shared"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("shared.title"),
            }}
          />
          <Stack.Screen
            name="my-shares"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("shares.title"),
            }}
          />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen
            name="chat/new"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.new_chat"),
            }}
          />
          <Stack.Screen
            name="chat/new-group"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.new_group"),
            }}
          />
          <Stack.Screen
            name="chat/info/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.group_info"),
            }}
          />
          <Stack.Screen
            name="chat/add-members/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.group_add_members"),
            }}
          />
          <Stack.Screen
            name="chat/contacts"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.contacts_title"),
            }}
          />
          <Stack.Screen
            name="chat/blocked"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("chat.blocked_title"),
            }}
          />
          <Stack.Screen
            name="property/form"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("form.create_title"),
            }}
          />
          <Stack.Screen
            name="job/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("types.job.singular"),
            }}
          />
          <Stack.Screen
            name="book/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("types.book.singular"),
            }}
          />
          <Stack.Screen
            name="article"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("news.article_title"),
            }}
          />
          <Stack.Screen
            name="trends/index"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("trends.title"),
            }}
          />
          <Stack.Screen
            name="trends/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("types.trends.singular"),
            }}
          />
          <Stack.Screen
            name="tools/mortgage"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
            }}
          />
          <Stack.Screen
            name="tools/[tool]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
            }}
          />
          <Stack.Screen
            name="category-settings"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("account.categories"),
            }}
          />
          <Stack.Screen
            name="theme-settings"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("account.theme"),
            }}
          />
          <Stack.Screen
            name="notification-settings"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("account.notifications"),
            }}
          />
          <Stack.Screen
            name="premium"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("premium.title"),
            }}
          />
          <Stack.Screen
            name="scan-book"
            options={{
              presentation: "modal",
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("scan.title"),
            }}
          />
          <Stack.Screen
            name="viajes/nuevo"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("trip.title"),
            }}
          />
          <Stack.Screen
            name="holiday/[id]"
            options={{
              headerShown: true,
              headerBackTitle: t("common.back"),
              headerTintColor: th.primary,
              headerStyle: { backgroundColor: th.surface },
              headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
              title: t("types.holiday.singular"),
            }}
          />
          {[
            ["food/address", t("food.address")],
            ["food/restaurant/[id]", t("food.restaurant")],
            ["food/cart", t("food.cart")],
            ["food/checkout", t("food.checkout")],
            ["food/order/[id]", t("food.order")],
            ["food/orders", t("food.orders")],
            ["food/restaurant-panel/index", t("food.restaurant_panel")],
            ["food/courier/index", t("food.courier")],
          ].map(([name, title]) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{
                headerShown: true,
                headerBackTitle: t("common.back"),
                headerTintColor: th.primary,
                headerStyle: { backgroundColor: th.surface },
                headerTitleStyle: { color: th.text, fontFamily: fonts.heading },
                title,
              }}
            />
          ))}
      </Stack>
      {showLoader ? (
        <View style={StyleSheet.absoluteFill}>
          <BrandLoading />
        </View>
      ) : null}
    </>
  );
}
