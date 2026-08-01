/**
 * Progreso VISIBLE de la búsqueda inteligente de vuelos.
 *
 * Sustituye al spinner de 55 segundos por lo que el motor está haciendo de
 * verdad. Reglas de producto que sostienen este componente:
 *
 *  - Solo se enseñan ACCIONES VERIFICABLES ("comparando 34 alternativas",
 *    "verificando 4 opciones con las aerolíneas"). Nunca el razonamiento del
 *    modelo: el LLM aquí no decide precios y contar lo que "piensa" sería
 *    vender humo.
 *  - UNA acción a la vez, en vertical. La versión anterior ponía las tres fases
 *    en fila y en un móvil se salían de pantalla: "Comparando fechas y
 *    aeropuertos" no cabe al lado de nada.
 *  - Al cambiar de paso, el texto se deshace en puntos y se rehace. Es lo que
 *    da sensación de que algo ocurre sin ocupar más sitio.
 *  - El "mejor precio hasta ahora" solo puede bajar (lo garantiza el reductor
 *    de @nidokey/shared): un contador que sube se leería como "me han subido el
 *    precio por mirar", que es justo lo que este producto no puede insinuar.
 *  - Accesibilidad: se anuncian los hitos, no cada evento. Un lector de pantalla
 *    leyendo 60 candidatos es inutilizable. Y con "reducir movimiento" activo no
 *    hay dispersión ni transición: el texto cambia y ya.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatMoney, type SearchPhase, type SearchProgressState } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useReducedMotion } from "@/components/ui/ScreenBackground";

/** Fases con barra de avance. Las finales cierran la barra entera. */
const PHASE_ORDER: SearchPhase[] = ["planning", "scanning", "verifying"];

/** Cuánto se retrasa cada carácter respecto al anterior, en fracción de la animación. */
const STAGGER = 0.02;
/** Retraso acumulado máximo: por encima, una frase larga tardaría una eternidad. */
const MAX_STAGGER = 0.45;

type Props = {
  state: SearchProgressState;
  running: boolean;
  onStop: () => void;
};

/* -------------------------------------------------------------------------- */
/* Desintegración: la propia frase se rompe en partículas y se rehace.         */
/* -------------------------------------------------------------------------- */

/** Constantes fijas por carácter: dirección, alcance y giro de su partícula. */
type Particle = { char: string; dx: number; dy: number; rot: number; delay: number };

/**
 * Reparte la frase en partículas. Cada carácter sale hacia un sitio distinto,
 * pero SIEMPRE el mismo para ese carácter: si la dirección se sorteara en cada
 * transición, la frase parecería temblar en vez de desintegrarse.
 */
function particlesOf(text: string): Particle[] {
  const chars = [...text];
  return chars.map((char, i) => {
    // Dispersión pseudoaleatoria pero determinista: números primos sobre el
    // índice dan un reparto que no se ve "en abanico" ni alineado.
    const a = (i * 137.508 * Math.PI) / 180;
    const reach = 18 + ((i * 61) % 26);
    const stagger = Math.min(MAX_STAGGER, i * STAGGER);
    return {
      char,
      dx: Math.cos(a) * reach,
      dy: Math.sin(a) * reach - 6, // sesgo hacia arriba: se desvanece subiendo
      rot: ((i % 7) - 3) * 14,
      delay: stagger,
    };
  });
}

/**
 * Un carácter. Todos leen el MISMO `progress` compartido y derivan su estado de
 * él: una sola animación mueve la frase entera, en vez de una por letra.
 * `progress` 0 = frase entera; 1 = polvo.
 */
function Char({ p, progress, color }: { p: Particle; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    // Cada letra consume su propio tramo de la animación → la frase se deshace
    // en oleada, de izquierda a derecha, no de golpe.
    const raw = (progress.value - p.delay) / (1 - MAX_STAGGER);
    const t = Math.min(1, Math.max(0, raw));
    return {
      opacity: 1 - t,
      transform: [
        { translateX: p.dx * t },
        { translateY: p.dy * t },
        { rotate: `${p.rot * t}deg` },
        // Encoge hasta ser una mota antes de desaparecer: es lo que convierte
        // "la letra se va" en "la letra se deshace en un punto".
        { scale: 1 - 0.82 * t },
      ],
    };
  });
  // El espacio necesita ancho propio: sin él las palabras se pegarían al
  // renderizar carácter a carácter.
  return (
    <Animated.Text style={[styles.char, { color }, p.char === " " && styles.space, style]} allowFontScaling={false}>
      {p.char === " " ? " " : p.char}
    </Animated.Text>
  );
}

function DisintegratingLine({
  text,
  generation,
  color,
  reduceMotion,
}: {
  text: string;
  /** Cambia una vez por PROCESO. Es lo que dispara la desintegración. */
  generation: number;
  color: string;
  reduceMotion: boolean;
}) {
  const [shown, setShown] = useState(text);
  const progress = useSharedValue(0);
  const particles = useMemo(() => particlesOf(shown), [shown]);
  const gen = useRef(generation);
  const rebuilding = useRef(false);

  useEffect(() => {
    // MISMO proceso: lo único que cambia son los números ("34 alternativas" →
    // "35 alternativas"). Se actualiza en silencio. Desintegrar la frase cada
    // vez que sube un contador sería un parpadeo continuo, no un efecto.
    if (generation === gen.current) {
      if (text !== shown && !rebuilding.current) setShown(text);
      return;
    }
    gen.current = generation;
    if (reduceMotion) {
      setShown(text);
      return;
    }
    rebuilding.current = true;
    // Se desintegra del todo y solo entonces se cambia el texto: así nunca se
    // ve el salto de una frase a otra a mitad de la transición.
    progress.value = withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setShown)(text);
    });
  }, [text, generation, shown, reduceMotion, progress]);

  useEffect(() => {
    if (!rebuilding.current) return;
    rebuilding.current = false;
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    // La frase nueva se rehace desde el polvo.
    progress.value = 1;
    progress.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [shown, reduceMotion, progress]);

  return (
    <View
      style={styles.line}
      // El lector de pantalla lee la frase entera de una vez; leer letra a letra
      // sería inutilizable.
      accessible
      accessibilityLabel={shown}
    >
      {particles.map((p, i) => (
        <Char key={`${i}-${p.char}`} p={p} progress={progress} color={color} />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

function FlightSearchProgressBase({ state, running, onStop }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const announced = useRef<string | null>(null);

  const done = state.phase === "completed" || state.phase === "partial" || state.phase === "failed";
  const activeIndex = PHASE_ORDER.indexOf(state.phase);

  /**
   * La frase describe la acción CONCRETA en curso, con sus números. Es lo que
   * distingue "está pasando algo" de "esto se ha colgado".
   */
  const phrase = done
    ? state.phase === "failed"
      ? t("trip.stream_failed")
      : t("trip.stream_done", { count: state.offers.length })
    : state.phase === "verifying"
      ? t("trip.stream_phase_verifying_n", { count: Math.max(1, state.quota.max) })
      : state.phase === "scanning"
        ? state.candidatesTotal > 0
          ? t("trip.stream_phase_scanning_n", { count: state.candidatesTotal })
          : t("trip.stream_phase_scanning")
        : t("trip.stream_phase_planning");

  const milestone = done
    ? phrase
    : state.best
      ? t("trip.stream_best_now", { price: formatMoney(state.best.totalTripCost, state.best.currency) })
      : null;

  useEffect(() => {
    if (!milestone || announced.current === milestone) return;
    announced.current = milestone;
    // En Android basta accessibilityLiveRegion (abajo); iOS necesita el anuncio
    // explícito, porque no tiene equivalente de live region.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility?.(milestone);
  }, [milestone]);

  if (state.phase === "idle" && !running) return null;

  const savings =
    state.best && state.baseline && state.best.savingsCents != null && state.best.savingsCents > 0
      ? state.best
      : null;

  return (
    <View
      style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}
      accessibilityLiveRegion={done ? "polite" : "none"}
    >
      {/* ── Barra de avance: tres tramos, sin texto (el texto va debajo) ── */}
      <View style={styles.bar}>
        {PHASE_ORDER.map((phase, i) => (
          <View
            key={phase}
            style={[
              styles.barSegment,
              { backgroundColor: done || i <= activeIndex ? th.accent : th.border, opacity: done || i <= activeIndex ? 1 : 0.5 },
            ]}
          />
        ))}
      </View>

      {/* ── La acción en curso, una a la vez ── */}
      <DisintegratingLine
        text={phrase}
        // La generación es la FASE: cambia tres veces por búsqueda (planificar →
        // comparar → verificar) y una cuarta al terminar. Un contador que sube
        // no desintegra nada.
        generation={done ? PHASE_ORDER.length : activeIndex}
        color={done ? th.text : th.accent}
        reduceMotion={reduceMotion}
      />

      {/* ── Contadores reales ── */}
      <Text style={{ color: th.textMuted, fontSize: 12 }}>
        {t("trip.stream_counters", {
          analyzed: state.candidatesAnalyzed || state.candidatesTotal,
          verified: state.verifiedCount,
        })}
        {state.quota.max > 0 ? ` · ${t("trip.stream_queries", { used: state.quota.used, max: state.quota.max })}` : ""}
      </Text>

      {/* ── Mejor precio hasta ahora ── */}
      {state.best ? (
        <View style={styles.bestRow}>
          <Ionicons name="pricetag-outline" size={14} color={th.accent} />
          <Text style={{ color: th.text, fontFamily: fonts.bodySemibold, fontSize: 13 }}>
            {t("trip.stream_best", { price: formatMoney(state.best.totalTripCost, state.best.currency) })}
          </Text>
          {savings ? (
            <View style={[styles.badge, { backgroundColor: th.accentSoft }]}>
              <Text style={{ color: th.accent, fontSize: 11, fontFamily: fonts.bodyBold }}>
                {t("trip.ai_savings", { pct: savings.savingsPct })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Comparación con la búsqueda normal ── */}
      {state.baseline ? (
        <Text style={{ color: th.textSubtle, fontSize: 11 }}>
          {t("trip.stream_baseline", {
            price: formatMoney(state.baseline.totalTripCost, state.baseline.currency),
          })}
        </Text>
      ) : null}

      {/* ── Aviso de búsqueda a medias ── */}
      {state.partial && state.partialReason ? (
        <Text style={{ color: th.textMuted, fontSize: 11 }}>
          <Ionicons name="information-circle-outline" size={11} color={th.textMuted} />{" "}
          {t(`trip.stream_partial_${state.partialReason}` as never)}
        </Text>
      ) : null}

      {/* ── Detener ── */}
      {running && !done ? (
        <Pressable
          onPress={onStop}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("trip.stream_stop")}
          style={[styles.stop, { borderColor: th.border }]}
        >
          <Ionicons name="stop-circle-outline" size={14} color={th.textMuted} />
          <Text style={{ color: th.textMuted, fontSize: 12, fontFamily: fonts.bodySemibold }}>
            {t("trip.stream_stop")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Memo con comparación por los campos que se pintan: llegan decenas de eventos
 * por búsqueda y la mayoría no cambian nada visible.
 */
export const FlightSearchProgress = memo(
  FlightSearchProgressBase,
  (a, b) =>
    a.running === b.running &&
    a.state.phase === b.state.phase &&
    a.state.candidatesAnalyzed === b.state.candidatesAnalyzed &&
    a.state.candidatesTotal === b.state.candidatesTotal &&
    a.state.verifiedCount === b.state.verifiedCount &&
    a.state.quota.used === b.state.quota.used &&
    a.state.quota.max === b.state.quota.max &&
    a.state.offers.length === b.state.offers.length &&
    a.state.best?.offerKey === b.state.best?.offerKey &&
    a.state.best?.totalTripCost === b.state.best?.totalTripCost &&
    a.state.baseline?.totalTripCost === b.state.baseline?.totalTripCost &&
    a.state.partialReason === b.state.partialReason
);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  bar: { flexDirection: "row", gap: 4 },
  barSegment: { flex: 1, height: 3, borderRadius: 2 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", minHeight: 18 },
  char: { fontSize: 13, fontFamily: fonts.bodySemibold },
  space: { width: 4 },
  bestRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stop: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
