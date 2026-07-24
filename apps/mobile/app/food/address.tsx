import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/hooks/useQuery";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button, Card, Screen } from "@/components/ui";
import * as Location from "expo-location";

const SPAIN_CENTER = { lat: 40.4168, lng: -3.7038 };

type FoodAddress = {
  id: string;
  label: string;
  line: string;
  city: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
};

type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

type PlaceDetails = {
  lat: number;
  lng: number;
  formattedAddress: string;
  name: string;
};

function cityFromAddress(address: string, fallback: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-2) ?? parts.at(-1) ?? fallback;
}

export default function FoodAddressScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const q = useQuery(() => api<{ addresses: FoodAddress[] }>("/api/food/addresses"), []);
  const [label, setLabel] = useState(() => t("food.address_default_label"));
  const [line, setLine] = useState("");
  const [city, setCity] = useState("Oviedo");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionToken = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`, []);
  const bias = useMemo(() => {
    const first = q.data?.addresses?.[0];
    return first ? { lat: first.latitude, lng: first.longitude } : SPAIN_CENTER;
  }, [q.data]);

  useEffect(() => {
    const input = line.trim();
    if (selectedCoords || input.length < 2) {
      setSuggestions([]);
      setAutocompleteLoading(false);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      setAutocompleteLoading(true);
      const qs = new URLSearchParams({
        input,
        lat: String(bias.lat),
        lng: String(bias.lng),
        sessionToken,
      });
      api<{ suggestions: PlaceSuggestion[] }>(`/api/food/places/autocomplete?${qs.toString()}`, {
        signal: controller.signal,
      })
        .then((res) => setSuggestions(res.suggestions))
        .catch((e) => {
          if (e instanceof Error && e.name === "AbortError") return;
          setSuggestions([]);
        })
        .finally(() => setAutocompleteLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [bias.lat, bias.lng, line, selectedCoords, sessionToken]);

  function onLineChange(text: string) {
    setLine(text);
    setSelectedCoords(null);
  }

  async function selectSuggestion(suggestion: PlaceSuggestion) {
    setError(null);
    setDetailsLoadingId(suggestion.placeId);
    try {
      const qs = new URLSearchParams({ placeId: suggestion.placeId });
      const details = await api<PlaceDetails>(`/api/food/places/details?${qs.toString()}`);
      setLine(details.formattedAddress || suggestion.mainText);
      setCity(cityFromAddress(details.formattedAddress || suggestion.secondaryText, city));
      setSelectedCoords({ lat: details.lat, lng: details.lng });
      setSuggestions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("food.address_resolve_error"));
    } finally {
      setDetailsLoadingId(null);
    }
  }

  async function useMyLocation() {
    setError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("food.location_permission_denied"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setSelectedCoords({ lat: latitude, lng: longitude });
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          const street = [place.street, place.streetNumber].filter(Boolean).join(" ").trim();
          const composed = street || place.name || "";
          if (composed) setLine(composed);
          const detectedCity = place.city || place.subregion;
          if (detectedCity) setCity(detectedCity);
          if (place.postalCode) setPostalCode(place.postalCode);
        }
      } catch {
        // reverse geocode best-effort: ya tenemos coords
      }
      setSuggestions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("food.location_error"));
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/food/addresses", {
        method: "POST",
        body: JSON.stringify({
          label,
          line,
          city,
          postalCode,
          notes,
          isDefault: true,
          ...(selectedCoords ? { lat: selectedCoords.lat, lng: selectedCoords.lng } : {}),
        }),
      });
      setLine("");
      setNotes("");
      setSelectedCoords(null);
      setSuggestions([]);
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("food.save_error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title={t("food.address_title")}>
      {/* paddingBottom + insets.bottom: el botón "Guardar dirección" y la lista van
          al final del scroll → en Android, bajo la barra de navegación. */}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Card style={styles.form}>
          <Pressable onPress={useMyLocation} disabled={locating} style={[styles.locBtn, { borderColor: th.primary, opacity: locating ? 0.6 : 1 }]}>
            {locating ? <ActivityIndicator color={th.primary} size="small" /> : <Text style={[styles.locBtnText, { color: th.primary }]}>{t("food.use_my_location")}</Text>}
          </Pressable>
          <TextInput value={label} onChangeText={setLabel} placeholder={t("food.address_label_placeholder")} placeholderTextColor={th.textSubtle} style={[styles.input, { color: th.text, borderColor: th.border }]} />
          <View>
            <TextInput value={line} onChangeText={onLineChange} placeholder={t("food.address_line_placeholder")} placeholderTextColor={th.textSubtle} style={[styles.input, { color: th.text, borderColor: th.border }]} />
            {(autocompleteLoading || suggestions.length > 0) && (
              <View style={[styles.suggestions, { borderColor: th.border, backgroundColor: th.surface }]}>
                {autocompleteLoading && suggestions.length === 0 ? <ActivityIndicator color={th.primary} /> : null}
                {suggestions.map((suggestion) => (
                  <Pressable key={suggestion.placeId} onPress={() => selectSuggestion(suggestion)} style={styles.suggestion}>
                    <Text style={[styles.suggestionMain, { color: th.text }]} numberOfLines={1}>{suggestion.mainText}</Text>
                    <Text style={[styles.suggestionSecondary, { color: th.textMuted }]} numberOfLines={1}>{suggestion.secondaryText}</Text>
                    {detailsLoadingId === suggestion.placeId ? <ActivityIndicator color={th.primary} size="small" /> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <TextInput value={city} onChangeText={setCity} placeholder={t("food.address_city_placeholder")} placeholderTextColor={th.textSubtle} style={[styles.input, { color: th.text, borderColor: th.border }]} />
          <TextInput value={postalCode} onChangeText={setPostalCode} placeholder={t("food.address_postal_placeholder")} placeholderTextColor={th.textSubtle} keyboardType="numbers-and-punctuation" style={[styles.input, { color: th.text, borderColor: th.border }]} />
          <TextInput value={notes} onChangeText={setNotes} placeholder={t("food.address_notes_placeholder")} placeholderTextColor={th.textSubtle} style={[styles.input, { color: th.text, borderColor: th.border }]} />
          {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}
          <Button label={t("food.save_address")} onPress={save} loading={saving} disabled={line.trim().length < 4 || city.trim().length < 2} />
        </Card>
        <Text style={[styles.section, { color: th.textMuted }]}>{t("food.saved_addresses")}</Text>
        {q.loading && !q.data ? <ActivityIndicator color={th.primary} /> : q.data?.addresses.map((a) => (
          <Card key={a.id}>
            <Text style={[styles.title, { color: th.text }]}>{a.label}{a.isDefault ? ` · ${t("food.default_address")}` : ""}</Text>
            <Text style={[styles.meta, { color: th.textMuted }]}>{a.line}</Text>
            <Text style={[styles.meta, { color: th.textSubtle }]}>{[a.postalCode, a.city].filter(Boolean).join(" ")}</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  form: { gap: 10 },
  locBtn: { height: 46, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  locBtnText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  suggestions: { marginTop: 6, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  suggestion: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 9, justifyContent: "center" },
  suggestionMain: { fontSize: 14, fontFamily: fonts.bodySemibold },
  suggestionSecondary: { fontSize: 12, marginTop: 2 },
  section: { fontSize: 12, fontFamily: fonts.bodyBold, textTransform: "uppercase" },
  title: { fontSize: 15, fontFamily: fonts.bodyBold },
  meta: { fontSize: 13, marginTop: 2 },
  error: { fontSize: 13 },
});
