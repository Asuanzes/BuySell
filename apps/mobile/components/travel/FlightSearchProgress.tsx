/**
 * Progreso VISIBLE de la búsqueda inteligente de vuelos.
 *
 * Sustituye al spinner de 55 segundos por lo que el motor está haciendo de
 * verdad. Reglas de producto que sostienen este componente:
 *
 *  - Solo se enseñan ACCIONES VERIFICABLES ("comprobando aeropuertos cercanos",
 *    "verificando 4 opciones con la aerolínea"). Nunca el razonamiento del
 *    modelo: el LLM aquí no decide precios y contar lo que "piensa" sería
 *    vender humo.
 *  - Nada de spinner central como experiencia principal. Hay barra de fases,
 *    contadores reales y las tarjetas van apareciendo según se encuentran.
 *  - El "mejor precio hasta ahora" solo puede bajar (lo garantiza el reductor
 *    de @nidokey/shared): un contador que sube se leería como "me han subido el
 *    precio por mirar", que es justo lo que este producto no puede insinuar.
 *  - Accesibilidad: se anuncian los hitos (ANNOUNCED_EVENTS), no cada evento.
 *    Un lector de pantalla leyendo 60 candidatos es inutilizable.
 */
import { memo, useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatMoney, type SearchPhase, type SearchProgressState } from "@nidokey/shared";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useReducedMotion } from "@/components/ui/ScreenBackground";

/** Fases visibles. `idle` no pinta nada y los finales cierran la barra. */
const PHASE_ORDER: SearchPhase[] = ["planning", "scanning", "verifying"];

const PHASE_KEY: Record<string, string> = {
  planning: "trip.stream_phase_planning",
  scanning: "trip.stream_phase_scanning",
  verifying: "trip.stream_phase_verifying",
};

type Props = {
  state: SearchProgressState;
  running: boolean;
  onStop: () => void;
};

function FlightSearchProgressBase({ state, running, onStop }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const announced = useRef<string | null>(null);

  const done = state.phase === "completed" || state.phase === "partial" || state.phase === "failed";
  const activeIndex = PHASE_ORDER.indexOf(state.phase);

  /**
   * Anuncio para lector de pantalla. Solo cuando cambia el HITO (mejor precio o
   * final), nunca por cada oferta: `announced` guarda el último texto dicho para
   * no repetirlo en cada render.
   */
  const milestone = done
    ? state.phase === "failed"
      ? t("trip.stream_failed")
      : t("trip.stream_done", { count: state.offers.length })
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
      {/* ── Fases ── */}
      <View style={styles.phases}>
        {PHASE_ORDER.map((phase, i) => {
          const reached = done || i <= activeIndex;
          const current = !done && i === activeIndex;
          return (
            <View key={phase} style={styles.phaseItem}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: reached ? th.accent : th.border,
                    // Sin animación cuando el sistema pide reducir movimiento:
                    // el estado se distingue por tamaño y color, no por latido.
                    transform: [{ scale: current && !reduceMotion ? 1.35 : 1 }],
                  },
                ]}
              />
              <Text
                style={{
                  color: current ? th.accent : reached ? th.textMuted : th.textSubtle,
                  fontSize: 11,
                  fontFamily: current ? fonts.bodySemibold : fonts.body,
                }}
                numberOfLines={1}
              >
                {t(PHASE_KEY[phase] as never)}
              </Text>
              {i < PHASE_ORDER.length - 1 ? (
                <View style={[styles.line, { backgroundColor: i < activeIndex || done ? th.accent : th.border }]} />
              ) : null}
            </View>
          );
        })}
      </View>

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
    a.state.best?.candidateKey === b.state.best?.candidateKey &&
    a.state.best?.totalTripCost === b.state.best?.totalTripCost &&
    a.state.baseline?.totalTripCost === b.state.baseline?.totalTripCost &&
    a.state.partialReason === b.state.partialReason
);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  phases: { flexDirection: "row", alignItems: "center", gap: 6 },
  phaseItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 14, height: 1, marginHorizontal: 4 },
  bestRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stop: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
