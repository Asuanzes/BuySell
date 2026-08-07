import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/lib/theme";
import { useAppStyle } from "@/lib/app-style-context";
import { categoryColor } from "@/lib/records/config";
import type { RecordType } from "@nidokey/shared";

type Props = {
  category?: RecordType;
  color?: string;
};

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.slice(0, 6);
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a: string, b: string, amount: number) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}

export function ScreenBackground({ category, color }: Props) {
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  // Hook centralizado para "anim. reducidas" del sistema: si la persona la tiene
  // activada, saltamos el barrido de entrada y dejamos las capas en su estado
  // final. iOS y Android exponen el flag; en web no falla, devuelve false.
  const reduceMotion = useReducedMotion();
  if (appStyle === "2100") {
    return (
      <Wave2100
        category={category}
        color={color}
        th={th}
        dark={dark}
        reduceMotion={reduceMotion}
      />
    );
  }
  if (appStyle === "operativo") {
    return (
      <FlatOperativo
        category={category}
        color={color}
        th={th}
        dark={dark}
        reduceMotion={reduceMotion}
      />
    );
  }
  return (
    <DuneVintage
      category={category}
      color={color}
      th={th}
      dark={dark}
      reduceMotion={reduceMotion}
    />
  );
}

/** Hook util: lee `AccessibilityInfo.isReduceMotionEnabled` una vez al montar
 *  y se suscribe a cambios. La pantalla puede saltar la animación de entrada
 *  cuando el sistema lo pide (iOS "Reduce Motion", Android "Remove animations").
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let cancel = false;
    if (typeof AccessibilityInfo.isReduceMotionEnabled === "function") {
      AccessibilityInfo.isReduceMotionEnabled().then((v) => {
        if (!cancel) setReduce(!!v);
      }).catch(() => {});
    }
    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (v: boolean) => setReduce(!!v)
    );
    return () => {
      cancel = true;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** Reinicia la intro al cambiar tema/categoría/dark y al reenfocar la
 *  pantalla. El PRIMER render lo cubre ya `useFocusEffect` (el foco inicial):
 *  el efecto de `animationKey` se salta esa ejecución para no disparar la
 *  intro dos veces al montar. */
function useIntroRestart(restartIntro: () => void, animationKey: string) {
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    restartIntro();
  }, [animationKey, restartIntro]);

  useFocusEffect(
    useCallback(() => {
      restartIntro();
    }, [restartIntro])
  );
}

/* -------------------------------------------------------------------------- */
/* Vintage (acero y latón envejecido): tres dunas escalonadas + contornos.    */
/* -------------------------------------------------------------------------- */

type LayerProps = {
  category?: RecordType;
  color?: string;
  th: ReturnType<typeof useTheme>["th"];
  dark: boolean;
  reduceMotion: boolean;
};

/* -------------------------------------------------------------------------- */
/* Operativo: fondo casi plano, con gradiente vertical suave y guías finas.    */
/* -------------------------------------------------------------------------- */

function FlatOperativo({ category, color, th, dark }: LayerProps) {
  const { width, height } = useWindowDimensions();
  const accent = color ?? (category ? categoryColor(category, dark, "operativo") : th.primary);
  const h = Math.max(height, 640);
  const w = Math.max(width, 320);
  const top = mixHex(th.bgTop, accent, dark ? 0.05 : 0.025);
  const mid = mixHex(th.bg, th.surfaceSoft, dark ? 0.16 : 0.32);
  const bottom = mixHex(th.bgBottom, accent, dark ? 0.07 : 0.035);
  const line = mixHex(accent, th.text, dark ? 0.26 : 0.34);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: th.bg }]}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="screenBgOperativo" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} stopOpacity="1" />
            <Stop offset="0.55" stopColor={mid} stopOpacity="1" />
            <Stop offset="1" stopColor={bottom} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#screenBgOperativo)" />
        <Rect
          x="0"
          y="0"
          width={w}
          height={Math.round(h * 0.18)}
          fill={th.surfaceSoft}
          opacity={dark ? 0.1 : 0.18}
        />
        <Path
          d={`M 0 ${Math.round(h * 0.24)} L ${w} ${Math.round(h * 0.2)}`}
          fill="none"
          stroke={line}
          strokeOpacity={dark ? 0.08 : 0.1}
          strokeWidth={1}
        />
        <Path
          d={`M 0 ${Math.round(h * 0.66)} L ${w} ${Math.round(h * 0.62)}`}
          fill="none"
          stroke={line}
          strokeOpacity={dark ? 0.06 : 0.08}
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

function DuneVintage({ category, color, th, dark, reduceMotion }: LayerProps) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const accent = color ?? (category ? categoryColor(category, dark) : th.primary);
  const warmNeutral = dark ? "#3A342D" : "#E9DDCB";
  // Vintage tweak (Block A): mezcla del fondo y dunas un poco menos tenue.
  // Claro: +25–35% para que se note el matiz sin perder el look sobrio.
  // Oscuro: +10–15% para sumar profundidad sin saturar.
  const rampTop = mixHex(th.bgTop, accent, dark ? 0.18 : 0.09);
  const rampMid = mixHex(th.bg, warmNeutral, dark ? 0.2 : 0.25);
  const rampBottom = mixHex(th.bgBottom, accent, dark ? 0.15 : 0.08);
  const duneNear = mixHex(th.bgBottom, accent, dark ? 0.27 : 0.14);
  const duneMid = mixHex(th.bg, accent, dark ? 0.22 : 0.1);
  const duneFar = mixHex(th.bgTop, accent, dark ? 0.18 : 0.09);
  const contour = mixHex(accent, th.text, dark ? 0.26 : 0.36);
  const h = Math.max(height, 640);
  const w = Math.max(width, 320);
  const animationKey = `${category ?? "none"}-${color ?? "auto"}-${dark ? "dark" : "light"}`;

  const restartIntro = useCallback(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduceMotion]);

  useIntroRestart(restartIntro, animationKey);

  const farDuneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.32 : 0.54]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [24, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [-18, 0]) },
    ],
  }));

  const midDuneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.36 : 0.58]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [38, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [20, 0]) },
    ],
  }));

  const nearDuneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.4 : 0.62]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [52, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [-10, 0]) },
    ],
  }));

  const farDune =
    `M -40 ${Math.round(h * 0.26)} ` +
    `C ${Math.round(w * 0.12)} ${Math.round(h * 0.18)}, ${Math.round(w * 0.28)} ${Math.round(h * 0.31)}, ${Math.round(w * 0.44)} ${Math.round(h * 0.24)} ` +
    `C ${Math.round(w * 0.62)} ${Math.round(h * 0.16)}, ${Math.round(w * 0.77)} ${Math.round(h * 0.29)}, ${w + 40} ${Math.round(h * 0.21)} ` +
    `L ${w + 40} ${Math.round(h * 0.44)} ` +
    `C ${Math.round(w * 0.68)} ${Math.round(h * 0.39)}, ${Math.round(w * 0.3)} ${Math.round(h * 0.46)}, -40 ${Math.round(h * 0.38)} Z`;

  const midDune =
    `M -40 ${Math.round(h * 0.54)} ` +
    `C ${Math.round(w * 0.16)} ${Math.round(h * 0.43)}, ${Math.round(w * 0.28)} ${Math.round(h * 0.62)}, ${Math.round(w * 0.5)} ${Math.round(h * 0.51)} ` +
    `C ${Math.round(w * 0.7)} ${Math.round(h * 0.41)}, ${Math.round(w * 0.84)} ${Math.round(h * 0.59)}, ${w + 40} ${Math.round(h * 0.48)} ` +
    `L ${w + 40} ${Math.round(h * 0.74)} ` +
    `C ${Math.round(w * 0.72)} ${Math.round(h * 0.68)}, ${Math.round(w * 0.28)} ${Math.round(h * 0.76)}, -40 ${Math.round(h * 0.66)} Z`;

  const nearDune =
    `M -40 ${Math.round(h * 0.78)} ` +
    `C ${Math.round(w * 0.1)} ${Math.round(h * 0.68)}, ${Math.round(w * 0.32)} ${Math.round(h * 0.88)}, ${Math.round(w * 0.54)} ${Math.round(h * 0.77)} ` +
    `C ${Math.round(w * 0.73)} ${Math.round(h * 0.68)}, ${Math.round(w * 0.9)} ${Math.round(h * 0.82)}, ${w + 40} ${Math.round(h * 0.74)} ` +
    `L ${w + 40} ${h + 40} L -40 ${h + 40} Z`;

  const contourOne =
    `M -24 ${Math.round(h * 0.35)} ` +
    `C ${Math.round(w * 0.18)} ${Math.round(h * 0.31)}, ${Math.round(w * 0.34)} ${Math.round(h * 0.42)}, ${Math.round(w * 0.54)} ${Math.round(h * 0.35)} ` +
    `C ${Math.round(w * 0.73)} ${Math.round(h * 0.29)}, ${Math.round(w * 0.84)} ${Math.round(h * 0.38)}, ${w + 24} ${Math.round(h * 0.34)}`;

  const contourTwo =
    `M -24 ${Math.round(h * 0.63)} ` +
    `C ${Math.round(w * 0.13)} ${Math.round(h * 0.57)}, ${Math.round(w * 0.3)} ${Math.round(h * 0.7)}, ${Math.round(w * 0.52)} ${Math.round(h * 0.62)} ` +
    `C ${Math.round(w * 0.72)} ${Math.round(h * 0.55)}, ${Math.round(w * 0.88)} ${Math.round(h * 0.67)}, ${w + 24} ${Math.round(h * 0.6)}`;

  const contourThree =
    `M -24 ${Math.round(h * 0.86)} ` +
    `C ${Math.round(w * 0.2)} ${Math.round(h * 0.8)}, ${Math.round(w * 0.37)} ${Math.round(h * 0.93)}, ${Math.round(w * 0.6)} ${Math.round(h * 0.84)} ` +
    `C ${Math.round(w * 0.78)} ${Math.round(h * 0.77)}, ${Math.round(w * 0.92)} ${Math.round(h * 0.88)}, ${w + 24} ${Math.round(h * 0.82)}`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: th.bg }]}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="screenBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={rampTop} stopOpacity="1" />
            <Stop offset="0.5" stopColor={rampMid} stopOpacity="1" />
            <Stop offset="1" stopColor={rampBottom} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#screenBg)" />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, farDuneStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={farDune} fill={duneFar} />
          <Path d={contourOne} fill="none" stroke={contour} strokeOpacity={dark ? 0.14 : 0.17} strokeWidth={1} />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, midDuneStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={midDune} fill={duneMid} />
          <Path d={contourTwo} fill="none" stroke={contour} strokeOpacity={dark ? 0.15 : 0.18} strokeWidth={1} />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, nearDuneStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={nearDune} fill={duneNear} />
          <Path d={contourThree} fill="none" stroke={contour} strokeOpacity={dark ? 0.17 : 0.2} strokeWidth={1} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* 2100 (futurista): tres ondas papercut con tinte melocotón/magenta y un      */
/* trazo de luz fino encima de cada una. Misma rampa vertical de fondo, mismo  */
/* contrato de animación de 1.5s y mismo respeto por "reducir animaciones".    */
/* -------------------------------------------------------------------------- */

function Wave2100({ category, color, th, dark, reduceMotion }: LayerProps) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  // Acento de categoría en paleta 2100 (melocotón/magenta) cuando hay categoría;
  // si no, un magenta cálido por defecto coherente con la familia. El `color`
  // pasado por la pantalla siempre gana.
  const accent = color ?? (category ? categoryColor(category, dark, "2100") : (dark ? "#F26D9A" : "#D44D7C"));
  // Segundo acento (capa media) — naranja melocotón, complementario al magenta.
  const accent2 = dark ? "#FFB994" : "#F08A4B";
  // Fondo: rampa cálida oscura (o crema en claro) tirando hacia el acento abajo
  // para que las ondas "papercut" se funden.
  const rampTop = dark ? mixHex(th.bgTop, accent, 0.10) : mixHex(th.bgTop, accent, 0.06);
  const rampMid = dark ? mixHex(th.bg, accent2, 0.06) : mixHex(th.bg, accent2, 0.05);
  const rampBottom = dark ? mixHex(th.bgBottom, accent, 0.16) : mixHex(th.bgBottom, accent, 0.10);
  // Capas de las ondas: distintas tonalidades del mismo cálido.
  const waveFar = mixHex(th.bgTop, accent, dark ? 0.22 : 0.10);
  const waveMid = mixHex(th.bg, accent2, dark ? 0.28 : 0.14);
  const waveNear = mixHex(th.bgBottom, accent, dark ? 0.34 : 0.16);
  // Trazo de luz fino sobre cada onda — mismo color del acento mezclado con
  // crema para legibilidad.
  const highlight = mixHex(accent, dark ? "#FFE7D5" : "#FFFFFF", dark ? 0.4 : 0.5);
  const h = Math.max(height, 640);
  const w = Math.max(width, 320);
  const animationKey = `${category ?? "none"}-${color ?? "auto"}-${dark ? "dark" : "light"}-2100`;

  const restartIntro = useCallback(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduceMotion]);

  useIntroRestart(restartIntro, animationKey);

  const farStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.46 : 0.34]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [20, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [-14, 0]) },
    ],
  }));

  const midStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.55 : 0.4]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [34, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [16, 0]) },
    ],
  }));

  const nearStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, dark ? 0.6 : 0.46]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [46, 0]) },
      { translateX: interpolate(progress.value, [0, 1], [-10, 0]) },
    ],
  }));

  // Tres ondas papercut llenas (cierran abajo); el trazo de luz fino sigue la
  // cresta de cada una. Distinto perfil de curva para que no se vean clonadas.
  const farWave =
    `M -40 ${Math.round(h * 0.22)} ` +
    `C ${Math.round(w * 0.16)} ${Math.round(h * 0.14)}, ${Math.round(w * 0.34)} ${Math.round(h * 0.28)}, ${Math.round(w * 0.5)} ${Math.round(h * 0.20)} ` +
    `C ${Math.round(w * 0.66)} ${Math.round(h * 0.12)}, ${Math.round(w * 0.84)} ${Math.round(h * 0.26)}, ${w + 40} ${Math.round(h * 0.18)} ` +
    `L ${w + 40} ${Math.round(h * 0.42)} ` +
    `C ${Math.round(w * 0.7)} ${Math.round(h * 0.36)}, ${Math.round(w * 0.3)} ${Math.round(h * 0.44)}, -40 ${Math.round(h * 0.36)} Z`;

  const farHighlight =
    `M -24 ${Math.round(h * 0.22)} ` +
    `C ${Math.round(w * 0.16)} ${Math.round(h * 0.14)}, ${Math.round(w * 0.34)} ${Math.round(h * 0.28)}, ${Math.round(w * 0.5)} ${Math.round(h * 0.20)} ` +
    `C ${Math.round(w * 0.66)} ${Math.round(h * 0.12)}, ${Math.round(w * 0.84)} ${Math.round(h * 0.26)}, ${w + 24} ${Math.round(h * 0.18)}`;

  const midWave =
    `M -40 ${Math.round(h * 0.50)} ` +
    `C ${Math.round(w * 0.14)} ${Math.round(h * 0.40)}, ${Math.round(w * 0.30)} ${Math.round(h * 0.58)}, ${Math.round(w * 0.52)} ${Math.round(h * 0.48)} ` +
    `C ${Math.round(w * 0.72)} ${Math.round(h * 0.38)}, ${Math.round(w * 0.86)} ${Math.round(h * 0.56)}, ${w + 40} ${Math.round(h * 0.46)} ` +
    `L ${w + 40} ${Math.round(h * 0.72)} ` +
    `C ${Math.round(w * 0.7)} ${Math.round(h * 0.66)}, ${Math.round(w * 0.28)} ${Math.round(h * 0.74)}, -40 ${Math.round(h * 0.64)} Z`;

  const midHighlight =
    `M -24 ${Math.round(h * 0.50)} ` +
    `C ${Math.round(w * 0.14)} ${Math.round(h * 0.40)}, ${Math.round(w * 0.30)} ${Math.round(h * 0.58)}, ${Math.round(w * 0.52)} ${Math.round(h * 0.48)} ` +
    `C ${Math.round(w * 0.72)} ${Math.round(h * 0.38)}, ${Math.round(w * 0.86)} ${Math.round(h * 0.56)}, ${w + 24} ${Math.round(h * 0.46)}`;

  const nearWave =
    `M -40 ${Math.round(h * 0.76)} ` +
    `C ${Math.round(w * 0.12)} ${Math.round(h * 0.66)}, ${Math.round(w * 0.34)} ${Math.round(h * 0.86)}, ${Math.round(w * 0.56)} ${Math.round(h * 0.75)} ` +
    `C ${Math.round(w * 0.75)} ${Math.round(h * 0.66)}, ${Math.round(w * 0.9)} ${Math.round(h * 0.80)}, ${w + 40} ${Math.round(h * 0.72)} ` +
    `L ${w + 40} ${h + 40} L -40 ${h + 40} Z`;

  const nearHighlight =
    `M -24 ${Math.round(h * 0.76)} ` +
    `C ${Math.round(w * 0.12)} ${Math.round(h * 0.66)}, ${Math.round(w * 0.34)} ${Math.round(h * 0.86)}, ${Math.round(w * 0.56)} ${Math.round(h * 0.75)} ` +
    `C ${Math.round(w * 0.75)} ${Math.round(h * 0.66)}, ${Math.round(w * 0.9)} ${Math.round(h * 0.80)}, ${w + 24} ${Math.round(h * 0.72)}`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: th.bg }]}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="screenBg2100" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={rampTop} stopOpacity="1" />
            <Stop offset="0.5" stopColor={rampMid} stopOpacity="1" />
            <Stop offset="1" stopColor={rampBottom} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#screenBg2100)" />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, farStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={farWave} fill={waveFar} />
          <Path
            d={farHighlight}
            fill="none"
            stroke={highlight}
            strokeOpacity={dark ? 0.55 : 0.45}
            strokeWidth={StyleSheet.hairlineWidth * 2}
          />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, midStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={midWave} fill={waveMid} />
          <Path
            d={midHighlight}
            fill="none"
            stroke={highlight}
            strokeOpacity={dark ? 0.6 : 0.5}
            strokeWidth={StyleSheet.hairlineWidth * 2}
          />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, nearStyle]}>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={nearWave} fill={waveNear} />
          <Path
            d={nearHighlight}
            fill="none"
            stroke={highlight}
            strokeOpacity={dark ? 0.65 : 0.55}
            strokeWidth={StyleSheet.hairlineWidth * 2}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
