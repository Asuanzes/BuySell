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
import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatMoney, type SearchPhase, type SearchProgressState } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useReducedMotion } from "@/components/ui/ScreenBackground";
import { ParticleText } from "./ParticleText";

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

function FlightSearchProgressBase({ state, running, onStop }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const announced = useRef<string | null>(null);
  // Skia necesita saber en cuántos píxeles cabe la frase para rasterizarla.
  const [lineWidth, setLineWidth] = useState(0);

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
      onLayout={(e) => setLineWidth(Math.round(e.nativeEvent.layout.width) - 24)}
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
      <ParticleText
        text={phrase}
        // La generación es la FASE: cambia tres veces por búsqueda (planificar →
        // comparar → verificar) y una cuarta al terminar. Un contador que sube
        // no desintegra nada.
        generation={done ? PHASE_ORDER.length : activeIndex}
        color={done ? th.text : th.accent}
        reduceMotion={reduceMotion}
        width={lineWidth}
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
  bestRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stop: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
