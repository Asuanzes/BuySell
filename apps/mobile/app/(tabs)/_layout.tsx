import { Slot, Link, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useDuplicatesChanged } from "@/lib/dup-signal";
import { TAB_ICON_SVG, type TabIconKey } from "@/lib/ui-icons";
import { TAB_ICON_SVG_2100 } from "@/lib/ui-icons-2100";
import { useCategoryPrefs } from "@/lib/records/category-prefs-context";
import { useAppStyle } from "@/lib/app-style-context";
import { useNeon } from "@/lib/neon-context";
import { NeonIcon } from "@/components/ui/NeonIcon";

/**
 * Navegación principal: una sola barra de pestañas con los 5 destinos clave.
 *
 * Antes había un "menú dentro del menú" (botón Menú → bottom-sheet con
 * Importar/Dashboard/Actividad/tema/logout mezclados). Importar, que es la
 * acción principal para añadir registros, quedaba escondida. Ahora todo
 * destino primario es una pestaña; tema y cierre de sesión viven en Cuenta.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/** Color del botón central "Importar". El FONDO es steel-blue en vintage / el
 * acento neón en 2100; el "+" (FAB_FG) es SIEMPRE blanco puro, en cualquier
 * tema, modo (claro/oscuro) o acento de color. */
const FAB_BG = "#3A5F8A";
const FAB_FG = "#FFFFFF";

const TAB_ICON_OPERATIVO: Record<TabIconKey, IconName> = {
  records: "albums-outline",
  search: "search-outline",
  duplicates: "layers-outline",
  account: "person-circle-outline",
};

export default function TabsLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { intensity } = useNeon();
  const { t } = useTranslation();
  const { category } = useCategoryPrefs();
  const [dupCount, setDupCount] = useState(0);
  const dupChanged = useDuplicatesChanged();
  const isFoodCategory = category === "food";
  // FOOD-NAV-HIDE: en comida la home es una mini-app de delivery → ocultamos la
  // barra inferior completa SOLO en la home (pathname "/"). En cualquier otra ruta
  // (p. ej. /account, que se abre desde el menú superior de comida) la barra vuelve
  // entera, para no dejar al usuario sin salida. Cuenta vive arriba en FoodHome.
  // Quitar esta línea (y el !hideBar de abajo) restaura la barra siempre.
  const hideBar = isFoodCategory && pathname === "/";
  const is2100 = appStyle === "2100";
  const isOperativo = appStyle === "operativo";
  const fabBg = is2100 ? th.primary : FAB_BG;
  const fabFg = FAB_FG; // el "+" SIEMPRE blanco puro (vintage/2100, claro/oscuro, cualquier acento)
  const fabGlow =
    is2100 && dark
      ? {
          shadowColor: fabBg,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.58 * (intensity / 0.6),
          shadowRadius: 18 * (intensity / 0.6),
          elevation: 12,
        }
      : null;

  // Recalcula el badge al cambiar de pestaña Y tras fusionar/descartar (dupChanged).
  useEffect(() => {
    let cancelled = false;
    api<{ groups: unknown[] }>("/api/records/duplicates")
      .then((d) => {
        if (!cancelled) setDupCount(Array.isArray(d?.groups) ? d.groups.length : 0);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return;
      });
    return () => { cancelled = true; };
  }, [pathname, dupChanged]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : !!pathname?.startsWith(href);

  const TABS: {
    href: string;
    label: string;
    icon?: IconName;
    svg?: TabIconKey;
    badge?: number;
    primary?: boolean;
  }[] = [
    { href: "/",         label: t("tabs.records"),    svg: "records" },
    { href: "/search",   label: t("tabs.search"),     svg: "search" },
    { href: "/importar", label: t("tabs.import"),     icon: "add", primary: true },
    { href: "/matches",  label: t("tabs.duplicates"), svg: "duplicates", badge: dupCount || undefined },
    { href: "/account",  label: t("tabs.account"),    svg: "account" },
  ];

  return (
    <SafeAreaView style={[styles.frame, { backgroundColor: th.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.content}>
        <Slot />
      </View>

      {!hideBar && (
      <View
        style={[
          styles.tabBar,
          th.elevation.md,
          {
            backgroundColor: th.surfaceRaised,
            borderTopColor: th.border,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ]}
      >
        {TABS.map((tab) => {
          const active = isActive(tab.href);

          // Acción principal: botón central, más grande y elevado sobre la barra.
          if (tab.primary) {
            return (
              <Link key={tab.href} href={tab.href as never} asChild>
                <Pressable style={styles.fabItem} accessibilityLabel={tab.label}>
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.fab,
                        th.elevation.lg,
                        { backgroundColor: fabBg, borderColor: th.surfaceRaised, opacity: pressed ? 0.9 : 1 },
                        fabGlow,
                        pressed && { transform: [{ translateY: 1 }] },
                      ]}
                    >
                      {is2100 ? (
                        <NeonIcon name={tab.icon ?? "add"} size={30} color={fabFg} active />
                      ) : (
                        <Ionicons name={tab.icon ?? "add"} size={30} color={fabFg} />
                      )}
                    </View>
                  )}
                </Pressable>
              </Link>
            );
          }

          const color = active ? th.accent : th.textMuted;
          return (
            <Link key={tab.href} href={tab.href as never} asChild>
              <Pressable style={styles.tabItem} accessibilityLabel={tab.label}>
                <View
                  style={[
                    styles.iconWrap,
                    { borderColor: active ? th.accent : "transparent" },
                    !is2100 && active && { backgroundColor: th.accentSoft },
                    is2100 && active && styles.iconWrap2100Active,
                    is2100 && active && { backgroundColor: th.accentSoft },
                  ]}
                >
                  {is2100 ? (
                    <NeonIcon
                      svgXml={TAB_ICON_SVG_2100[tab.svg!]}
                      size={24}
                      color={color}
                      active={active}
                      framed={false}
                    />
                  ) : isOperativo ? (
                    <Ionicons name={TAB_ICON_OPERATIVO[tab.svg!]} size={24} color={color} />
                  ) : (
                    <SvgXml xml={TAB_ICON_SVG[tab.svg!]} width={24} height={24} color={color} />
                  )}
                  {tab.badge ? (
                    <View style={[styles.badge, { backgroundColor: th.dangerFg }]}>
                      <Text style={styles.badgeText}>{tab.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.tabLabel, { color }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  ellipsizeMode="tail"
                  maxFontSizeMultiplier={1.15}
                >
                  {tab.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    width: "100%",
  },
  tabItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 1,
    paddingVertical: 4,
  },
  // Botón central elevado (acción principal "Importar").
  fabItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
  },
  iconWrap: {
    position: "relative",
    minWidth: 38,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap2100Active: {
    width: 42,
    height: 36,
    borderRadius: 16,
  },
  tabLabel: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
    fontSize: 10,
    fontFamily: fonts.bodySemibold,
    includeFontPadding: false,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: fonts.bodyBold },
});
