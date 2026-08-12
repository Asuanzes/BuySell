import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, type DateData } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { api, ApiError } from "@/lib/api";
import { fonts } from "@/lib/fonts";
import { useCalendarLocale } from "@/lib/i18n/calendar-locales";
import { useTheme } from "@/lib/theme";

/**
 * C8 — «Organizar viaje»: la fase PREVIA a la reserva. Solo pide lo tentativo
 * (destino + ventana aproximada + presupuesto, los dos últimos opcionales) y
 * crea el registro holiday en estado Organizando; reservar después completa
 * esa misma fila desde el asistente normal.
 */

/** "YYYY-MM-DD" de HOY en hora local (minDate del calendario). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangeMarks(start: string, end: string, color: string, textColor: string): Record<string, object> {
  if (!start) return {};
  if (!end || end === start) return { [start]: { color, textColor, startingDay: true, endingDay: true } };
  const marks: Record<string, object> = {};
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    marks[iso] = { color, textColor, startingDay: iso === start, endingDay: iso === end };
    cur.setDate(cur.getDate() + 1);
  }
  return marks;
}

export default function OrganizeTrip() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const calLang = useCalendarLocale();
  const [destination, setDestination] = useState("");
  const [startISO, setStartISO] = useState("");
  const [endISO, setEndISO] = useState("");
  const [budget, setBudget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = destination.trim().length >= 1 && destination.trim().length <= 80 && !loading;

  function onPickDay(day: DateData) {
    const iso = day.dateString;
    if (!startISO || (startISO && endISO) || iso < startISO) {
      setStartISO(iso);
      setEndISO("");
    } else {
      setEndISO(iso);
    }
  }

  async function create() {
    if (!canCreate) return;
    setLoading(true);
    setError(null);
    const budgetEur = Number(budget.replace(",", "."));
    try {
      const { record } = await api<{ record: { id: string } }>("/api/travel/organize", {
        method: "POST",
        body: JSON.stringify({
          destination: destination.trim(),
          title: t("trip.organize_record_title", { destination: destination.trim() }),
          windowStartISO: startISO || null,
          windowEndISO: endISO || startISO || null,
          budgetEur: Number.isFinite(budgetEur) && budgetEur > 0 ? budgetEur : null,
        }),
      });
      router.replace(`/holiday/${record.id}` as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("trip.organize_error"));
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("trip.organize_title") }} />
      <ScrollView
        style={{ backgroundColor: th.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.hint, { color: th.textMuted }]}>{t("trip.organize_hint")}</Text>

        <Text style={[styles.label, { color: th.textMuted }]}>{t("trip.organize_destination")}</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          maxLength={80}
          placeholder={t("trip.organize_destination_ph")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
        />

        <Text style={[styles.label, { color: th.textMuted }]}>{t("trip.organize_window")}</Text>
        <Text style={{ color: startISO ? th.text : th.textSubtle, fontSize: 13, fontFamily: fonts.bodyMedium }}>
          {startISO && endISO
            ? `${startISO} → ${endISO}`
            : startISO
            ? t("trip.organize_window_end")
            : t("trip.organize_window_optional")}
        </Text>
        <View style={[styles.calendarWrap, { borderColor: th.border, backgroundColor: th.surface }]}>
          <Calendar
            key={calLang}
            minDate={todayISO()}
            firstDay={1}
            markingType="period"
            markedDates={rangeMarks(startISO, endISO, th.accent, th.primaryFg)}
            onDayPress={onPickDay}
            theme={{
              calendarBackground: th.surface,
              monthTextColor: th.text,
              dayTextColor: th.text,
              textDisabledColor: th.textSubtle,
              textSectionTitleColor: th.textMuted,
              arrowColor: th.accent,
              todayTextColor: th.accent,
            }}
          />
        </View>
        {startISO ? (
          <Pressable onPress={() => { setStartISO(""); setEndISO(""); }} style={styles.clearRow} hitSlop={6}>
            <Ionicons name="close-circle-outline" size={15} color={th.textSubtle} />
            <Text style={{ color: th.textSubtle, fontSize: 12, fontFamily: fonts.bodySemibold }}>
              {t("trip.organize_window_clear")}
            </Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: th.textMuted }]}>{t("trip.organize_budget")}</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          maxLength={7}
          placeholder={t("trip.organize_budget_ph")}
          placeholderTextColor={th.textSubtle}
          style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
        />

        {error ? <Text style={{ color: th.dangerFg, fontSize: 13 }}>{error}</Text> : null}

        <Pressable
          onPress={() => void create()}
          disabled={!canCreate}
          accessibilityRole="button"
          style={[styles.cta, { backgroundColor: canCreate ? th.primary : th.surfaceRaised, borderColor: th.border }]}
        >
          {loading ? (
            <ActivityIndicator color={th.primaryFg} />
          ) : (
            <Text style={{ color: canCreate ? th.primaryFg : th.textMuted, fontFamily: fonts.bodySemibold, fontSize: 15 }}>
              {t("trip.organize_cta")}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  label: { fontSize: 12, fontFamily: fonts.bodySemibold, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  calendarWrap: { borderWidth: 1, borderRadius: 10, overflow: "hidden", paddingBottom: 4, marginTop: 4 },
  clearRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 4 },
  cta: { minHeight: 48, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 14 },
});
