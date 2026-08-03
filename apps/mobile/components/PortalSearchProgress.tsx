import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useReducedMotion } from "@/components/ui/ScreenBackground";
import { ParticleText } from "@/components/travel/ParticleText";
import type { PortalProgress, PortalStage } from "@/lib/portal-search";

/**
 * Progreso VISIBLE de la búsqueda en un portal, con el mismo lenguaje que la
 * búsqueda de vuelos: la frase de la acción en curso se deshace en puntos y se
 * rehace al cambiar de fase.
 *
 * Las reglas que se heredan de allí, porque son de producto y no de estética:
 *
 *  - Solo ACCIONES VERIFICABLES. Cada frase corresponde a algo que el script
 *    acaba de hacer en la página ("aceptando el aviso de cookies", "23 anuncios
 *    leídos"), nunca relleno para entretener mientras se espera.
 *  - UNA acción a la vez y en vertical: en un móvil dos frases no caben.
 *  - La duración NO se simula. Una búsqueda en portal tarda entre 3 y 30 s según
 *    lo que tarde una web ajena, así que no hay barra de porcentaje que mentir:
 *    el avance lo marcan los hechos, y pasados ~10 s la propia frase reconoce
 *    que el portal va lento en vez de repetir la misma cantinela.
 *  - Con "reducir movimiento" activo no hay dispersión: el texto cambia y ya.
 */

/** Orden de las fases con tramo en la barra. `slow` y `challenge` no avanzan. */
const STAGE_ORDER: PortalStage[] = ["opening", "consent", "scanning"];

type Props = {
  portalLabel: string;
  progress: PortalProgress | null;
  onStop: () => void;
};

function PortalSearchProgressBase({ portalLabel, progress, onStop }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [lineWidth, setLineWidth] = useState(0);

  /**
   * Latido del icono de detener mientras dura la búsqueda.
   *
   * Media de ~30 s contra una web ajena: un icono quieto en ese rato se lee
   * como "esto se ha colgado". Late en el hilo de UI (Reanimated), así que no
   * compite con el JavaScript que está procesando los eventos del WebView —
   * justo lo que haría un `setInterval` con `setState`.
   */
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
      -1, // sin fin: lo para el desmontaje, que ocurre al terminar la búsqueda
      true // ida y vuelta
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.22 }],
    opacity: 0.55 + pulse.value * 0.45,
  }));

  const stage = progress?.stage ?? "opening";
  const found = progress?.found ?? 0;
  const seconds = progress?.seconds ?? 0;
  const activeIndex = STAGE_ORDER.indexOf(stage);

  const phrase =
    stage === "challenge"
      ? t("search.stage_challenge", { portal: portalLabel })
      : stage === "consent"
        ? t("search.stage_consent")
        : stage === "slow"
          ? t("search.stage_slow", { portal: portalLabel })
          : stage === "scanning" && found > 0
            ? t("search.stage_found", { count: found })
            : stage === "scanning"
              ? t("search.stage_scanning")
              : t("search.stage_opening", { portal: portalLabel });

  return (
    <View
      style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}
      onLayout={(e) => setLineWidth(Math.round(e.nativeEvent.layout.width) - 24)}
    >
      <View style={styles.bar}>
        {STAGE_ORDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.barSegment,
              {
                backgroundColor: i <= activeIndex ? th.accent : th.border,
                opacity: i <= activeIndex ? 1 : 0.5,
              },
            ]}
          />
        ))}
      </View>

      <ParticleText
        text={phrase}
        // La generación es la FASE, no un contador: si subiera con cada evento,
        // la frase se estaría desintegrando sin parar y sería ruido.
        generation={Math.max(0, activeIndex) + (stage === "slow" ? 1 : 0)}
        color={th.accent}
        reduceMotion={reduceMotion}
        width={lineWidth}
      />

      <Text style={{ color: th.textMuted, fontSize: 12 }}>
        {t("search.stage_counters", { count: found, seconds })}
      </Text>

      <Pressable
        onPress={onStop}
        hitSlop={8}
        accessibilityRole="button"
        style={[styles.stop, { borderColor: th.border }]}
      >
        <Animated.View style={pulseStyle}>
          <Ionicons name="stop-circle-outline" size={16} color={th.accent} />
        </Animated.View>
        <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: fonts.bodySemibold }}>
          {t("trip.stream_stop")}
        </Text>
      </Pressable>
    </View>
  );
}

/** Llegan ~25 eventos por búsqueda y la mayoría no cambian nada visible. */
export const PortalSearchProgress = memo(
  PortalSearchProgressBase,
  (a, b) =>
    a.portalLabel === b.portalLabel &&
    a.progress?.stage === b.progress?.stage &&
    a.progress?.found === b.progress?.found &&
    a.progress?.seconds === b.progress?.seconds
);

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  bar: { flexDirection: "row", gap: 4 },
  barSegment: { flex: 1, height: 3, borderRadius: 2 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
