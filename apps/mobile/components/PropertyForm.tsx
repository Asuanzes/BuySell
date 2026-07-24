import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { Button } from "@/components/ui";
import type { I18nKey } from "@/lib/i18n/keys";

/**
 * Formulario reutilizable de inmueble (crear y editar). Soporta venta y
 * alquiler: el bloque de condiciones de alquiler aparece cuando la operación no
 * es venta. Los precios se introducen en EUROS y se convierten a céntimos en
 * `propertyFormToApiBody` (la API guarda tal cual lo recibido).
 */
export type PropertyFormValues = {
  title: string;
  type: string;
  operationType: "SALE" | "RENT" | "RENT_TO_OWN";
  status: string;
  priceEur: string; // venta (currentPrice)
  rentEur: string; // alquiler (monthlyRent)
  city: string;
  province: string;
  address: string;
  neighborhood: string;
  postalCode: string;
  rooms: string;
  bathrooms: string;
  builtArea: string;
  usableArea: string;
  plotArea: string;
  floor: string;
  yearBuilt: string;
  energyRating: string;
  hasElevator: boolean;
  hasGarage: boolean;
  hasStorage: boolean;
  hasTerrace: boolean;
  hasFireplace: boolean;
  hasGarden: boolean;
  hasPool: boolean;
  // Alquiler
  depositEur: string;
  minStayMonths: string;
  maxStayMonths: string;
  furnished: string; // "" | UNFURNISHED | SEMI | FURNISHED
  utilitiesIncluded: boolean | null;
  petsAllowed: boolean | null;
  contractType: string; // "" | RESIDENTIAL | SEASONAL | ROOM | COMMERCIAL
  description: string;
  notes: string;
};

export const EMPTY_PROPERTY_FORM: PropertyFormValues = {
  title: "", type: "PISO", operationType: "SALE", status: "FOR_SALE",
  priceEur: "", rentEur: "",
  city: "", province: "", address: "", neighborhood: "", postalCode: "",
  rooms: "", bathrooms: "", builtArea: "", usableArea: "", plotArea: "", floor: "", yearBuilt: "",
  energyRating: "UNKNOWN",
  hasElevator: false, hasGarage: false, hasStorage: false, hasTerrace: false,
  hasFireplace: false, hasGarden: false, hasPool: false,
  depositEur: "", minStayMonths: "", maxStayMonths: "", furnished: "",
  utilitiesIncluded: null, petsAllowed: null, contractType: "",
  description: "", notes: "",
};

const TYPES = ["PISO", "HOUSE", "ATICO", "CHALET", "DUPLEX", "ESTUDIO", "LOFT", "LOCAL", "TERRENO", "OTRO"] as const;
const ENERGY = ["UNKNOWN", "A", "B", "C", "D", "E", "F", "G"] as const;
const FURNISHED = ["UNFURNISHED", "SEMI", "FURNISHED"] as const;
const CONTRACTS = ["RESIDENTIAL", "SEASONAL", "ROOM", "COMMERCIAL"] as const;

const num = (s: string): number | null => {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

/** Convierte los valores del formulario al body que espera PropertyInput (API).
 *  Precios EUROS → céntimos. Omite vacíos (PATCH parcial seguro). */
export function propertyFormToApiBody(v: PropertyFormValues): Record<string, unknown> {
  const isRent = v.operationType !== "SALE";
  const priceEur = num(v.priceEur);
  const rentEur = num(v.rentEur);
  const depositEur = num(v.depositEur);
  const body: Record<string, unknown> = {
    title: v.title.trim(),
    type: v.type,
    operationType: v.operationType,
    status: v.status,
    city: v.city.trim() || "Desconocida",
    province: v.province.trim() || "",
    energyRating: v.energyRating,
  };
  // Venta vs alquiler: el importe va a su columna (en céntimos).
  body.currentPrice = !isRent && priceEur != null ? priceEur * 100 : null;
  body.monthlyRent = isRent && rentEur != null ? rentEur * 100 : null;

  const opt: [string, unknown][] = [
    ["address", v.address.trim() || null],
    ["neighborhood", v.neighborhood.trim() || null],
    ["postalCode", v.postalCode.trim() || null],
    ["rooms", num(v.rooms)],
    ["bathrooms", num(v.bathrooms)],
    ["builtArea", num(v.builtArea)],
    ["usableArea", num(v.usableArea)],
    ["plotArea", num(v.plotArea)],
    ["floor", v.floor.trim() || null],
    ["yearBuilt", num(v.yearBuilt)],
    ["hasElevator", v.hasElevator],
    ["hasGarage", v.hasGarage],
    ["hasStorage", v.hasStorage],
    ["hasTerrace", v.hasTerrace],
    ["hasFireplace", v.hasFireplace],
    ["hasGarden", v.hasGarden],
    ["hasPool", v.hasPool],
    ["description", v.description.trim() || null],
    // `notes` NO se envía: el detalle no lo carga, así que un PATCH lo borraría.
  ];
  for (const [k, val] of opt) body[k] = val;

  // Condiciones de alquiler solo cuando aplica.
  if (isRent) {
    body.deposit = depositEur != null ? depositEur * 100 : null;
    body.minStayMonths = num(v.minStayMonths);
    body.maxStayMonths = num(v.maxStayMonths);
    body.furnished = v.furnished || null;
    body.utilitiesIncluded = v.utilitiesIncluded;
    body.petsAllowed = v.petsAllowed;
    body.contractType = v.contractType || null;
  }
  return body;
}

type Props = {
  initial: PropertyFormValues;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: PropertyFormValues) => void;
};

export function PropertyForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { th } = useTheme();
  const { t } = useTranslation();
  const [v, setV] = useState<PropertyFormValues>(initial);
  const set = <K extends keyof PropertyFormValues>(k: K, val: PropertyFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const isRent = v.operationType !== "SALE";
  const showSale = v.operationType !== "RENT";
  const canSubmit = v.title.trim().length >= 3 && v.city.trim().length >= 1;

  // Cambiar de operación ajusta el estado por defecto coherente.
  const setOperation = (op: PropertyFormValues["operationType"]) => {
    setV((p) => ({
      ...p,
      operationType: op,
      status: op === "RENT" ? "FOR_RENT" : op === "SALE" ? "FOR_SALE" : p.status,
    }));
  };

  const input = (
    key: keyof PropertyFormValues,
    labelKey: I18nKey,
    opts: { numeric?: boolean; multiline?: boolean; placeholder?: string } = {}
  ) => (
    <Field label={t(labelKey)}>
      <TextInput
        value={String(v[key] ?? "")}
        onChangeText={(text) => set(key, text as never)}
        keyboardType={opts.numeric ? "numeric" : "default"}
        multiline={opts.multiline}
        placeholder={opts.placeholder}
        placeholderTextColor={th.textSubtle}
        editable={!submitting}
        style={[
          styles.input,
          opts.multiline && styles.inputMultiline,
          { backgroundColor: th.surface, borderColor: th.border, color: th.text },
        ]}
      />
    </Field>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Operación */}
      <Field label={t("form.operation")}>
        <View style={styles.chipRow}>
          {(["SALE", "RENT", "RENT_TO_OWN"] as const).map((op) => (
            <Chip
              key={op}
              label={op === "SALE" ? t("form.op_sale") : op === "RENT" ? t("form.op_rent") : t("form.op_rent_to_own")}
              active={v.operationType === op}
              onPress={() => setOperation(op)}
            />
          ))}
        </View>
      </Field>

      {input("title", "form.title")}

      <Field label={t("form.type")}>
        <View style={styles.chipWrap}>
          {TYPES.map((tp) => (
            <Chip key={tp} label={t(`form.type_${tp}` as I18nKey)} active={v.type === tp} onPress={() => set("type", tp)} small />
          ))}
        </View>
      </Field>

      {showSale && input("priceEur", "form.price_eur", { numeric: true, placeholder: "185000" })}
      {isRent && input("rentEur", "form.rent_eur", { numeric: true, placeholder: "850" })}

      {/* Ubicación */}
      {input("city", "form.city", { placeholder: "Oviedo" })}
      {input("province", "form.province", { placeholder: "Asturias" })}
      {input("address", "form.address")}
      {input("neighborhood", "form.neighborhood")}
      {input("postalCode", "form.postal_code", { numeric: true })}

      {/* Características */}
      <View style={styles.row2}>
        <View style={styles.col}>{input("rooms", "form.rooms", { numeric: true })}</View>
        <View style={styles.col}>{input("bathrooms", "form.bathrooms", { numeric: true })}</View>
      </View>
      <View style={styles.row2}>
        <View style={styles.col}>{input("builtArea", "form.built_area", { numeric: true })}</View>
        <View style={styles.col}>{input("usableArea", "form.usable_area", { numeric: true })}</View>
      </View>
      <View style={styles.row2}>
        <View style={styles.col}>{input("plotArea", "form.plot_area", { numeric: true })}</View>
        <View style={styles.col}>{input("floor", "form.floor")}</View>
      </View>
      {input("yearBuilt", "form.year_built", { numeric: true })}

      <Field label={t("form.energy")}>
        <View style={styles.chipWrap}>
          {ENERGY.map((e) => (
            <Chip
              key={e}
              label={e === "UNKNOWN" ? "—" : e}
              active={v.energyRating === e}
              onPress={() => set("energyRating", e)}
              small
            />
          ))}
        </View>
      </Field>

      {/* Amenidades */}
      <Field label={t("form.amenities")}>
        <View>
          <ToggleRow label={t("detail.property.amenity_elevator")} value={v.hasElevator} onChange={(b) => set("hasElevator", b)} />
          <ToggleRow label={t("detail.property.amenity_garage")} value={v.hasGarage} onChange={(b) => set("hasGarage", b)} />
          <ToggleRow label={t("detail.property.amenity_storage")} value={v.hasStorage} onChange={(b) => set("hasStorage", b)} />
          <ToggleRow label={t("detail.property.amenity_terrace")} value={v.hasTerrace} onChange={(b) => set("hasTerrace", b)} />
          <ToggleRow label={t("detail.property.amenity_fireplace")} value={v.hasFireplace} onChange={(b) => set("hasFireplace", b)} />
          <ToggleRow label={t("detail.property.amenity_garden")} value={v.hasGarden} onChange={(b) => set("hasGarden", b)} />
          <ToggleRow label={t("detail.property.amenity_pool")} value={v.hasPool} onChange={(b) => set("hasPool", b)} />
        </View>
      </Field>

      {/* Condiciones de alquiler */}
      {isRent && (
        <View style={[styles.rentBlock, { borderColor: th.border, backgroundColor: th.surface }]}>
          <Text style={[styles.rentTitle, { color: th.textMuted }]}>{t("detail.property.section_rental")}</Text>
          {input("depositEur", "form.deposit_eur", { numeric: true })}
          <View style={styles.row2}>
            <View style={styles.col}>{input("minStayMonths", "form.min_stay", { numeric: true })}</View>
            <View style={styles.col}>{input("maxStayMonths", "form.max_stay", { numeric: true })}</View>
          </View>
          <Field label={t("detail.property.rent_furnished")}>
            <View style={styles.chipRow}>
              <Chip label="—" active={v.furnished === ""} onPress={() => set("furnished", "")} small />
              {FURNISHED.map((f) => (
                <Chip key={f} label={t(`detail.property.rent_furnished_${f.toLowerCase()}` as I18nKey)} active={v.furnished === f} onPress={() => set("furnished", f)} small />
              ))}
            </View>
          </Field>
          <Field label={t("detail.property.rent_contract")}>
            <View style={styles.chipWrap}>
              <Chip label="—" active={v.contractType === ""} onPress={() => set("contractType", "")} small />
              {CONTRACTS.map((c) => (
                <Chip key={c} label={t(`detail.property.rent_contract_${c.toLowerCase()}` as I18nKey)} active={v.contractType === c} onPress={() => set("contractType", c)} small />
              ))}
            </View>
          </Field>
          <TriState label={t("detail.property.rent_utilities")} value={v.utilitiesIncluded} onChange={(b) => set("utilitiesIncluded", b)} t={t} />
          <TriState label={t("detail.property.rent_pets")} value={v.petsAllowed} onChange={(b) => set("petsAllowed", b)} t={t} />
        </View>
      )}

      {input("description", "form.description", { multiline: true })}

      <Button
        label={submitLabel}
        icon="checkmark-circle-outline"
        onPress={() => onSubmit(v)}
        loading={submitting}
        disabled={!canSubmit}
        style={{ marginTop: 8 }}
      />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { th } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: th.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  const { th } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        small && styles.chipSmall,
        { borderColor: active ? th.accent : th.border, backgroundColor: active ? th.accentSoft : th.surface },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? th.accent : th.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  const { th } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: th.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: th.accentSoft }} thumbColor={value ? th.accent : undefined} />
    </View>
  );
}

// Firma estrecha (evita TS2589 del TFunction genérico; ver lib/trends/sources.ts).
type TFn = (key: "common.yes" | "common.no") => string;
function TriState({ label, value, onChange, t }: { label: string; value: boolean | null; onChange: (b: boolean | null) => void; t: TFn }) {
  const { th } = useTheme();
  const opts: { v: boolean | null; l: string }[] = [
    { v: null, l: "—" },
    { v: true, l: t("common.yes") },
    { v: false, l: t("common.no") },
  ];
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: th.textMuted }]}>{label}</Text>
      <View style={styles.chipRow}>
        {opts.map((o) => (
          <Chip key={String(o.v)} label={o.l} active={value === o.v} onPress={() => onChange(o.v)} small />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  chipRow: { flexDirection: "row", gap: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipSmall: { paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: 13, fontFamily: fonts.bodySemibold },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleLabel: { fontSize: 14 },
  rentBlock: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12, gap: 2 },
  rentTitle: { fontSize: 11, fontFamily: fonts.bodySemibold, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
});
