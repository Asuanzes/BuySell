import { useCallback, useEffect, useRef, useState } from "react";
import { fonts } from "@/lib/fonts";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCategoryPrefs } from "@/lib/records/category-prefs-context";
import { useTypeI18n } from "@/lib/records/type-i18n";
import { usePendingImport } from "@/lib/pending-import";
import { isPortalUrl } from "@/lib/portal-url";
import { bookShareQuery, firstShareUrl } from "@/lib/book-url";
import { useTheme } from "@/lib/theme";
import { api, ApiError } from "@/lib/api";
import { RECORD_TYPE_CONFIG } from "@/lib/records/config";
import { CategoryIcon } from "@/components/CategoryIcon";
import { WebViewImporter, type ExtractedPayload } from "@/components/WebViewImporter";
import { Button, Card, EmptyState, Screen } from "@/components/ui";

/**
 * Añadir registros — type-aware. Eliges el tipo (rail superior) y el input +
 * destino se adaptan:
 *  - URL  (inmuebles): pegar/compartir URL → extracción en WebView → /api/listings/import.
 *  - símbolo (cripto): teclear símbolo → /api/records/import (fetch server-side).
 *  - "soon": "Próximamente".
 * Cada registro se guarda en su tipo y aparece en su menú correspondiente.
 */

type ImportResult = { created: boolean; priceChanged: boolean; propertyId: string };
type RecordImportResult = { created: boolean; record: { id: string; title: string } | null };
type SearchHit = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  type: string | null;
  /** Empleo: el candidato ya trae su registro normalizado → import sin re-llamar. */
  record?: unknown;
};

type Status = "idle" | "extracting" | "sending" | "ok" | "error";

export default function ImportarScreen() {
  const { th } = useTheme();
  // Categoría COMPARTIDA con la lista (contexto): al abrir Importar desde una
  // categoría (p. ej. Criptos) se abre directamente en ella.
  const { category: type, setCategory: setType, orderedVisible } = useCategoryPrefs();
  const { t } = useTranslation();
  const { label: typeLabel, singular: typeSingular } = useTypeI18n();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // Empleo: filtros extra de búsqueda (ciudad/zona + remoto). Sin selector de
  // portal: el servidor consulta SIEMPRE todas las fuentes gratuitas a la vez
  // (InfoJobs + Tecnoempleo) y las intercala — ver docs/jobs-ingestion.md.
  const [searchLocation, setSearchLocation] = useState("");
  const [searchRemote, setSearchRemote] = useState(false);
  // Confirmación por fila al elegir un resultado (check verde estilo WhatsApp).
  const [addedKeys, setAddedKeys] = useState<Set<number>>(new Set());
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // carga del anuncio (0–1)
  // Operación para el import por URL de inmuebles. AUTO = la detecta el extractor
  // por la ruta del portal; el usuario puede forzar Venta/Alquiler si la web no
  // lo deja claro.
  const [opOverride, setOpOverride] = useState<"AUTO" | "SALE" | "RENT">("AUTO");
  // Alta manual de libro (fallback final del híbrido): cuando ni el share ni la
  // búsqueda encuentran el libro, se mete a mano (título/autor/ISBN).
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualIsbn, setManualIsbn] = useState("");
  const [manualNotes, setManualNotes] = useState(""); // sinopsis/notas propias del usuario
  const [manualSaving, setManualSaving] = useState(false);
  // Sugerencias de PORTADA para el alta manual: el usuario las pide y ELIGE una
  // (o ninguna). El alta sigue siendo literal — esto solo adjunta la imagen.
  const [manualCovers, setManualCovers] = useState<{ url: string; title: string }[]>([]);
  const [manualCover, setManualCover] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverFailed, setCoverFailed] = useState<Set<string>>(new Set());

  const cfg = RECORD_TYPE_CONFIG[type];

  function reset() {
    setStatus("idle");
    setOkMsg(null);
    setErrorMsg(null);
  }

  // Pide SUGERENCIAS de portada (no decide el libro): muestra candidatos para que
  // el usuario elija la imagen que encaja con SU libro. El alta sigue siendo literal.
  const suggestCover = useCallback(async () => {
    const title = manualTitle.trim();
    const isbn = manualIsbn.trim();
    if (title.length < 2 && isbn.replace(/[^0-9Xx]/g, "").length < 10) return;
    setCoverLoading(true);
    setCoverFailed(new Set());
    try {
      const qs = new URLSearchParams({ title, author: manualAuthor.trim(), isbn }).toString();
      const r = await api<{ covers: { url: string; title: string }[] }>(`/api/books/cover?${qs}`);
      setManualCovers(r.covers ?? []);
    } catch {
      setManualCovers([]);
    } finally {
      setCoverLoading(false);
    }
  }, [manualTitle, manualAuthor, manualIsbn]);

  // Auto-sugerir portadas: en cuanto el usuario ha puesto TÍTULO y AUTOR, intentamos
  // la búsqueda (con debounce de 700 ms). El botón sigue valiendo para re-buscar o
  // cuando solo hay ISBN.
  useEffect(() => {
    if (!manualOpen || type !== "book") return;
    if (manualTitle.trim().length < 2 || manualAuthor.trim().length < 2) return;
    const t = setTimeout(() => void suggestCover(), 700);
    return () => clearTimeout(t);
  }, [manualOpen, type, manualTitle, manualAuthor, suggestCover]);

  // Guarda un libro a mano de forma LITERAL: lo que escribes es lo que se añade.
  // No hay búsqueda que pueda traer otro libro; solo se adjunta la portada elegida.
  async function submitManual() {
    const title = manualTitle.trim();
    if (title.length < 2) return;
    setManualSaving(true);
    setOkMsg(null);
    setErrorMsg(null);
    try {
      const r = await api<{ record: { title: string } | null }>("/api/books/manual", {
        method: "POST",
        body: JSON.stringify({
          title,
          author: manualAuthor.trim(),
          isbn: manualIsbn.trim(),
          description: manualNotes.trim(),
          imageUrl: manualCover,
        }),
      });
      setOkMsg(t("importar.ok_book_added", { title: r.record?.title ?? title }));
      setStatus("ok");
      setManualOpen(false);
      setManualTitle("");
      setManualAuthor("");
      setManualIsbn("");
      setManualNotes("");
      setManualCovers([]);
      setManualCover(null);
    } catch (e) {
      setErrorMsg(errMsg(e, t("importar.err_add_book")));
      setStatus("error");
    } finally {
      setManualSaving(false);
    }
  }

  // Share de un enlace de LIBRO: detecta el libro, busca (por ISBN o título) y,
  // si es un ISBN (match fiable), lo añade solo; si no, deja los resultados para
  // que elijas. Reutiliza la búsqueda + el import existentes.
  const importBookShare = useCallback(
    async (sharedText: string) => {
      setType("book");
      setOkMsg(null);
      setErrorMsg(null);
      setStatus("idle");
      setResults([]);
      setAddedKeys(new Set());
      setHasSearched(false);

      const parsed = bookShareQuery(sharedText);
      const url = firstShareUrl(sharedText);
      setValue(parsed?.query ?? "");
      setSearching(true);

      // Solo AUTO-añadimos con un match FIABLE (ISBN exacto, o el pipeline del
      // servidor que ya vetó por ISBN/score). Con un título ambiguo NO adivinamos:
      // dejamos la lista para que elijas (se acabó "añade el que le da la gana").
      let hits: SearchHit[] = [];
      let reliable = false;
      // B5-resiliencia: si los proveedores (Google Books/Open Library) están
      // caídos o sin cuota, el backend lo señala (PROVIDERS_UNAVAILABLE o 502)
      // → mensaje honesto "reintenta", no "no pude identificar el libro".
      let serviceDown = false;
      try {
        // 1) ISBN en la cadena/URL → match exacto.
        if (parsed?.isbn) {
          const res = await api<{ results: SearchHit[] }>(
            `/api/records/search?type=book&q=${encodeURIComponent(`isbn:${parsed.query}`)}`
          );
          hits = res.results ?? [];
          reliable = hits.length > 0;
        }
        // 2) Hay URL → pipeline del servidor (lee schema.org de la página y resuelve
        //    por ISBN/score). Si devuelve libro, es fiable.
        if (!reliable && url) {
          const res = await api<{ results: SearchHit[]; error?: string }>("/api/books/resolve", {
            method: "POST",
            body: JSON.stringify({ url }),
          });
          const rhits = res.results ?? [];
          if (rhits.length > 0) {
            hits = rhits;
            reliable = true;
          } else if (res.error === "PROVIDERS_UNAVAILABLE") {
            serviceDown = true;
          }
        }
        // 3) Solo título → buscar; fiable solo si el primero casa FUERTE (título
        //    largo y distintivo). Si es corto/ambiguo, se muestra la lista.
        if (!reliable && parsed?.query) {
          const res = await api<{ results: SearchHit[] }>(
            `/api/records/search?type=book&q=${encodeURIComponent(parsed.query)}`
          );
          hits = res.results ?? [];
          reliable = hits.length > 0 && strongTitleMatch(parsed.query, hits[0].name);
        }
      } catch (e) {
        // 502 = TODAS las fuentes de búsqueda caídas (la ruta lo señala así).
        if (e instanceof ApiError && e.status === 502) serviceDown = true;
        /* red caída → hits vacío → cae a alta manual */
      } finally {
        setSearching(false);
        setHasSearched(true);
      }
      setResults(hits);
      // Guard anti-ficha-vacía: aunque sea "fiable", no auto-añadimos un resultado
      // sin TÍTULO real (un share pobre de una app nativa podía colar una ficha en
      // blanco). Si el top no tiene título usable, cae a lista/manual en vez de crear basura.
      const topTitle = (hits[0]?.name ?? "").trim();
      // Match fiable + con título → lo añadimos solo. Ambiguo (hay resultados pero sin
      // match claro) → status idle: la lista queda visible para que elijas. Nada → manual.
      if (reliable && hits[0]?.record && topTitle.length >= 2) {
        setStatus("sending");
        try {
          const r = await api<RecordImportResult>("/api/records/import", {
            method: "POST",
            body: JSON.stringify({ type: "book", input: { kind: "record", record: hits[0].record } }),
          });
          setOkMsg(t("importar.ok_book_added_pick", { title: r.record?.title ?? hits[0].name ?? t("importar.book_fallback") }));
          setStatus("ok");
          setValue(""); // A1: limpiar la caja tras añadir el libro compartido.
          setAddedKeys(new Set([0]));
        } catch (e) {
          setErrorMsg(errMsg(e, t("importar.err_add_book")));
          setStatus("error");
        }
      } else if (hits.length === 0) {
        setErrorMsg(
          serviceDown
            ? t("importar.err_book_service_down")
            : t("importar.err_book_not_identified")
        );
        setStatus("error");
      }
    },
    [setType]
  );

  // Share/deep-link de INMUEBLE: una URL de portal → flujo property (WebView).
  const handleIncomingUrl = useCallback((u: string) => {
    if (isPortalUrl(u)) {
      setType("property");
      setValue(u);
      setOkMsg(null);
      setErrorMsg(null);
      setProgress(0);
      setStatus("extracting");
    }
  }, []);

  // El layout raíz captura el share/deep-link (estés donde estés) y deja aquí la
  // URL de inmueble O el TEXTO compartido de un libro; consumimos cada canal y lo
  // limpiamos (patrón consumidor → un segundo share igual vuelve a dispararse).
  const {
    url: pendingUrl,
    setUrl: setPendingUrl,
    bookShare: pendingBookShare,
    setBookShare: setPendingBookShare,
  } = usePendingImport();
  useEffect(() => {
    if (pendingUrl) {
      handleIncomingUrl(pendingUrl);
      setPendingUrl(null);
    }
  }, [pendingUrl, handleIncomingUrl, setPendingUrl]);
  useEffect(() => {
    if (pendingBookShare) {
      void importBookShare(pendingBookShare);
      setPendingBookShare(null);
    }
  }, [pendingBookShare, importBookShare, setPendingBookShare]);

  // ── Buscador (mercados / empleo): nombre/ticker/keywords → candidatos ──────
  // Guard de respuesta obsoleta por id de ejecución (evita pisar con una vieja).
  const searchRunId = useRef(0);
  const runSearch = useCallback(
    async (raw: string) => {
      let q = raw.trim();
      // Libros: si pegas un ENLACE de libro (Casa del Libro, Amazon, Google
      // Books, una tienda…), extrae el ISBN/título de la URL y busca por eso,
      // no por la URL cruda (que no devuelve nada).
      if (type === "book") {
        const parsed = bookShareQuery(q);
        if (parsed) q = parsed.query;
      }
      // Empleo: se puede buscar solo por zona (puesto vacío).
      const zoneOnly = type === "job" && searchLocation.trim().length > 0;
      if (q.length < 2 && !zoneOnly) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      setAddedKeys(new Set());
      setAddingIndex(null);
      const myId = ++searchRunId.current;
      setSearching(true);
      try {
        let url = `/api/records/search?type=${type}&q=${encodeURIComponent(q)}`;
        if (type === "job") {
          if (searchLocation.trim()) url += `&location=${encodeURIComponent(searchLocation.trim())}`;
          if (searchRemote) url += `&remote=1`;
        }
        const res = await api<{ results: SearchHit[] }>(url);
        if (myId === searchRunId.current) setResults(res.results ?? []);
      } catch {
        if (myId === searchRunId.current) setResults([]);
      } finally {
        if (myId === searchRunId.current) {
          setSearching(false);
          setHasSearched(true);
        }
      }
    },
    [type, searchLocation, searchRemote]
  );

  // Mercados (Yahoo, gratis): búsqueda EN VIVO con debounce. Empleo (Apify, de
  // pago) usa searchOnSubmit → no busca al teclear (ver botón "Buscar").
  useEffect(() => {
    if (cfg.addMode !== "search" || cfg.searchOnSubmit) return;
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    const handle = setTimeout(() => void runSearch(q), 350);
    return () => clearTimeout(handle);
  }, [value, cfg.addMode, cfg.searchOnSubmit, runSearch]);

  // ── URL flow (inmuebles, vía WebView) ───────────────────────────────────
  function startUrlImport() {
    if (value.trim().length < 8 || status === "extracting" || status === "sending") return;
    setProgress(0);
    setStatus("extracting");
    setOkMsg(null);
    setErrorMsg(null);
  }

  async function handleExtracted(data: ExtractedPayload) {
    // Guard anti-registro-vacío: si el portal bloqueó la lectura (p. ej. Idealista
    // en WebView) y no se extrajo nada útil, no creamos una ficha vacía → avisamos.
    const emptyExtraction =
      (!data.images || data.images.length === 0) &&
      data.price == null && !data.description &&
      data.builtArea == null && data.rooms == null;
    if (emptyExtraction) {
      setErrorMsg(t("importar.err_empty_listing"));
      setStatus("error");
      return;
    }
    // Override manual de la operación (si el usuario lo fijó); si no, vale la
    // que detectó el extractor por la ruta del portal.
    const payload = opOverride === "AUTO" ? data : { ...data, operationType: opOverride };
    setStatus("sending");
    try {
      const res = await api<ImportResult>("/api/listings/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOkMsg(res.created ? t("importar.ok_property_created") : res.priceChanged ? t("importar.ok_price_updated") : t("importar.ok_already_have"));
      setStatus("ok");
      setValue(""); // A1: limpiar el enlace de la caja tras importar.
      // A2: ?from=import → el botón "volver" del detalle irá al listado (no a Importar).
      setTimeout(() => router.push(`/property/${res.propertyId}?from=import`), 800);
    } catch (e) {
      setErrorMsg(errMsg(e, t("importar.err_save_property")));
      setStatus("error");
    }
  }

  // ── Symbol flow (cripto: símbolo directo / mercados: elegido del buscador) ─
  async function importSymbol(rawSymbol: string) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || status === "sending") return;
    setStatus("sending");
    setOkMsg(null);
    setErrorMsg(null);
    try {
      const res = await api<RecordImportResult>("/api/records/import", {
        method: "POST",
        body: JSON.stringify({ type, input: { kind: "symbol", symbol, quote: "EUR" } }),
      });
      setOkMsg(
        t(res.created ? "importar.ok_symbol_added" : "importar.ok_symbol_updated", {
          name: res.record?.title ?? symbol,
          type: typeLabel(type),
        })
      );
      setStatus("ok");
      setValue(""); // A1: limpiar la caja tras añadir el símbolo.
    } catch (e) {
      setErrorMsg(errMsg(e, t("importar.err_add_symbol", { name: symbol })));
      setStatus("error");
    }
  }

  function addSymbol() {
    void importSymbol(value);
  }

  // Elegir un candidato del buscador. Empleo: el hit trae su `record` → se
  // guarda tal cual (kind:"record", sin re-llamar a la fuente de pago).
  // Mercados: import por símbolo (fetch server-side, gratis).
  async function importHit(hit: SearchHit, i: number) {
    if (addingIndex !== null || addedKeys.has(i)) return;
    setAddingIndex(i);
    setOkMsg(null);
    setErrorMsg(null);
    try {
      const input = hit.record
        ? { kind: "record", record: hit.record }
        : { kind: "symbol", symbol: hit.symbol.trim().toUpperCase(), quote: "EUR" };
      await api<RecordImportResult>("/api/records/import", {
        method: "POST",
        body: JSON.stringify({ type, input }),
      });
      // Confirmación visual en la propia fila (check verde), sin tarjeta grande.
      setAddedKeys((prev) => {
        const n = new Set(prev);
        n.add(i);
        return n;
      });
    } catch (e) {
      setErrorMsg(errMsg(e, t("importar.err_add_symbol", { name: hit.name ?? hit.symbol ?? "" })));
      setStatus("error");
    } finally {
      setAddingIndex(null);
    }
  }

  const isExtracting = status === "extracting";
  const isSending = status === "sending";
  const isBusy = isExtracting || isSending;
  // % de la barra: carga del anuncio durante la extracción; 100% al guardar.
  const progressPct = isSending ? 100 : Math.max(8, Math.round((progress || 0) * 100));

  return (
    <Screen contentStyle={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      {/* Selector de tipo (a qué menú va el registro) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typeRow}
      >
        {orderedVisible
          .filter((tp) => tp !== "chat" && tp !== "food") // Categorías no-CRUD: no se añaden desde Importar.
          .map((tp) => {
          const active = type === tp;
          return (
            <Pressable
              key={tp}
              accessibilityRole="button"
              accessibilityLabel={typeLabel(tp)}
              accessibilityState={{ selected: active }}
              onPress={() => {
                setType(tp);
                setValue("");
                setResults([]);
                setHasSearched(false);
                setSearchLocation("");
                setSearchRemote(false);
                setAddedKeys(new Set());
                setAddingIndex(null);
                setOpOverride("AUTO");
                reset();
              }}
              style={[styles.typeItem, active && { backgroundColor: th.accentSoft }]}
            >
              <CategoryIcon type={tp} size={24} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.heading, { color: th.text }]}>{t("importar.heading", { type: typeSingular(type).toLowerCase() })}</Text>

      {cfg.addMode === "soon" && (
        <EmptyState
          icon="time-outline"
          title={t("common.soon")}
          description={t("importar.soon_desc", { type: typeLabel(type).toLowerCase() })}
        />
      )}

      {cfg.addMode === "wizard" && (
        <Card style={{ gap: 12 }}>
          <Text style={[styles.hintText, { color: th.textMuted }]}>{t("importar.wizard_hint")}</Text>
          <Button
            label={t("importar.create_trip")}
            icon="airplane-outline"
            onPress={() => router.push("/viajes/nuevo" as never)}
          />
        </Card>
      )}

      {cfg.addMode !== "soon" && cfg.addMode !== "wizard" && (
        <>
          <TextInput
            value={value}
            onChangeText={(v) => {
              setValue(v);
              reset();
              if (cfg.searchOnSubmit) setHasSearched(false);
            }}
            placeholder={t(`types.${type}.placeholder`)}
            placeholderTextColor={th.textSubtle}
            keyboardType={cfg.addMode === "url" ? "url" : "default"}
            autoCapitalize={cfg.addMode === "symbol" ? "characters" : "none"}
            autoCorrect={false}
            editable={!isBusy}
            returnKeyType={cfg.addMode === "search" ? "search" : "default"}
            onSubmitEditing={() => {
              if (cfg.addMode === "search" && cfg.searchOnSubmit) void runSearch(value);
            }}
            style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
          />

          {/* Operación (solo inmuebles por URL): Auto / Venta / Alquiler. */}
          {type === "property" && cfg.addMode === "url" && (
            <View style={styles.opRow}>
              {(["AUTO", "SALE", "RENT"] as const).map((opt) => {
                const active = opOverride === opt;
                const label =
                  opt === "AUTO"
                    ? t("importar.operation_auto")
                    : opt === "SALE"
                    ? t("importar.operation_sale")
                    : t("importar.operation_rent");
                return (
                  <Pressable
                    key={opt}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setOpOverride(opt)}
                    disabled={isBusy}
                    style={[
                      styles.opChip,
                      { borderColor: active ? th.accent : th.border, backgroundColor: active ? th.accentSoft : th.surface },
                    ]}
                  >
                    <Text style={[styles.opChipText, { color: active ? th.accent : th.textMuted }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {cfg.addMode !== "search" && (
            <Button
              label={cfg.addMode === "url" ? t("importar.import_btn") : t("importar.heading", { type: typeSingular(type).toLowerCase() })}
              icon={cfg.addMode === "url" ? "arrow-down-circle-outline" : "add-circle-outline"}
              onPress={cfg.addMode === "url" ? startUrlImport : addSymbol}
              loading={isBusy}
              disabled={value.trim().length < (cfg.addMode === "url" ? 8 : 1)}
            />
          )}

          {/* Inmuebles: alternativa a la URL → crear a mano (sin anuncio). */}
          {type === "property" && cfg.addMode === "url" && (
            <Button
              label={t("importar.create_manual")}
              icon="create-outline"
              variant="ghost"
              onPress={() => router.push("/property/form" as never)}
              disabled={isBusy}
            />
          )}

          {type === "job" && (
            <>
              <TextInput
                value={searchLocation}
                onChangeText={(v) => {
                  setSearchLocation(v);
                  if (cfg.searchOnSubmit) setHasSearched(false);
                }}
                placeholder={t("importar.location_placeholder")}
                placeholderTextColor={th.textSubtle}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!isBusy}
                returnKeyType="search"
                onSubmitEditing={() => void runSearch(value)}
                style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
              />
              <Pressable
                onPress={() => setSearchRemote((r) => !r)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: searchRemote }}
                style={styles.remoteToggle}
              >
                <Ionicons
                  name={searchRemote ? "checkbox" : "square-outline"}
                  size={20}
                  color={searchRemote ? th.accent : th.textSubtle}
                />
                <Text style={[styles.remoteLabel, { color: th.textMuted }]}>{t("importar.remote_only")}</Text>
              </Pressable>
            </>
          )}

          {cfg.addMode === "search" && cfg.searchOnSubmit && (
            <Button
              label={t("common.search")}
              icon="search-outline"
              onPress={() => void runSearch(value)}
              loading={searching}
              disabled={
                isSending ||
                (value.trim().length < 2 &&
                  !(type === "job" && searchLocation.trim().length > 0))
              }
            />
          )}

          {cfg.addMode === "search" && (searching || results.length > 0 || hasSearched) && (
            <View style={styles.results}>
              {searching && results.length === 0 && (
                <Text style={[styles.infoSub, { color: th.textSubtle }]}>{t("importar.searching")}</Text>
              )}
              {!searching && hasSearched && results.length === 0 && (
                <Text style={[styles.infoSub, { color: th.textSubtle }]}>
                  {t("importar.no_results", { q: value.trim() })}
                </Text>
              )}
              {results.map((hit, i) => {
                const jm = type === "job" ? jobMetaOf(hit) : null;
                const meta = [hit.symbol, hit.exchange, hit.type].filter(Boolean).join(" · ");
                const added = addedKeys.has(i);
                const adding = addingIndex === i;
                return (
                  <Pressable
                    key={`${hit.symbol}|${hit.name ?? ""}|${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={added ? t("importar.result_added", { name: hit.name ?? hit.symbol }) : t("importar.result_add", { name: hit.name ?? hit.symbol })}
                    onPress={() => void importHit(hit, i)}
                    disabled={added || addingIndex !== null}
                    style={[
                      styles.resultRow,
                      { backgroundColor: th.surface, borderColor: added ? "#15803D" : th.border },
                    ]}
                  >
                    <View style={styles.resultInfo}>
                      <Text style={[styles.resultName, { color: th.text }]} numberOfLines={2}>
                        {hit.name ?? hit.symbol}
                      </Text>
                      {jm ? (
                        <>
                          {jm.line2 && (
                            <Text style={[styles.resultMeta, { color: th.textSubtle }]} numberOfLines={1}>
                              {jm.line2}
                            </Text>
                          )}
                          {(jm.contract || jm.salary || jm.platform) && (
                            <Text style={[styles.resultMeta, { color: th.textMuted }]} numberOfLines={1}>
                              {jm.contract ?? ""}
                              {jm.salary ? (
                                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>
                                  {jm.contract ? " · " : ""}
                                  {jm.salary}
                                </Text>
                              ) : null}
                              {jm.platform ? `${jm.contract || jm.salary ? " · " : ""}${jm.platform}` : ""}
                            </Text>
                          )}
                        </>
                      ) : (
                        meta.length > 0 && (
                          <Text style={[styles.resultMeta, { color: th.textSubtle }]} numberOfLines={1}>
                            {meta}
                          </Text>
                        )
                      )}
                    </View>
                    {added ? (
                      <Ionicons name="checkmark-circle" size={24} color="#15803D" />
                    ) : adding ? (
                      <ActivityIndicator size="small" color={th.accent} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color={th.accent} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {isBusy && (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={th.primary} />
            <Text style={[styles.loadingText, { color: th.text }]}>
              {isSending
                ? t("importar.saving", { type: typeSingular(type).toLowerCase() })
                : progress < 1
                ? t("importar.loading_listing")
                : t("importar.reading_listing")}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: th.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: th.primary, width: `${progressPct}%` as `${number}%` },
              ]}
            />
          </View>
          <Text style={[styles.infoSub, { color: th.textSubtle }]}>
            {isExtracting ? t("importar.verification_hint") : t("importar.almost_done")}
          </Text>
        </Card>
      )}

      {status === "ok" && okMsg && (
        <Card>
          <Text style={[styles.resultText, { color: th.text }]}>{okMsg}</Text>
          {(cfg.addMode === "symbol" || cfg.addMode === "search") && (
            <Button
              label={t("importar.view_type", { type: typeLabel(type) })}
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => router.push("/" as never)}
              style={styles.retry}
            />
          )}
        </Card>
      )}

      {status === "error" && errorMsg && (
        <Card>
          <Text style={[styles.errorText, { color: th.dangerFg }]}>{errorMsg}</Text>
          <Button label={t("importar.retry")} variant="ghost" size="sm" fullWidth={false} onPress={reset} style={styles.retry} />
        </Card>
      )}

      {cfg.addMode === "url" && (
        <Card style={styles.hintBox}>
          <Text style={[styles.hintTitle, { color: th.textMuted }]}>{t("importar.how_property_title")}</Text>
          <Text style={[styles.hintText, { color: th.textSubtle }]}>{t("importar.how_property_steps")}</Text>
        </Card>
      )}
      {cfg.addMode === "symbol" && (
        <Card style={styles.hintBox}>
          <Text style={[styles.hintTitle, { color: th.textMuted }]}>{t("importar.how_type_title", { type: typeLabel(type).toLowerCase() })}</Text>
          <Text style={[styles.hintText, { color: th.textSubtle }]}>{t("importar.how_symbol")}</Text>
        </Card>
      )}
      {cfg.addMode === "search" && (
        <Card style={styles.hintBox}>
          <Text style={[styles.hintTitle, { color: th.textMuted }]}>{t("importar.how_type_title", { type: typeLabel(type).toLowerCase() })}</Text>
          <Text style={[styles.hintText, { color: th.textSubtle }]}>
            {type === "job" ? t("importar.hint_job") : type === "book" ? t("importar.hint_book") : t("importar.hint_market")}
          </Text>
        </Card>
      )}

      {type === "book" && (
        <Card>
          {!manualOpen ? (
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => router.push("/scan-book")} style={styles.manualToggle}>
                <Ionicons name="barcode-outline" size={18} color={th.primary} />
                <Text style={[styles.manualToggleText, { color: th.primary }]}>
                  {t("importar.scan_barcode")}
                </Text>
              </Pressable>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: th.border }} />
              <Pressable onPress={() => setManualOpen(true)} style={styles.manualToggle}>
                <Ionicons name="create-outline" size={16} color={th.primary} />
                <Text style={[styles.manualToggleText, { color: th.primary }]}>
                  {t("importar.manual_toggle")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.manualForm}>
              <Text style={[styles.hintTitle, { color: th.textMuted }]}>{t("importar.manual_title")}</Text>
              <TextInput
                placeholder={t("importar.field_title")}
                placeholderTextColor={th.textSubtle}
                value={manualTitle}
                onChangeText={setManualTitle}
                style={[styles.input, { color: th.text, borderColor: th.border, backgroundColor: th.bg }]}
              />
              <TextInput
                placeholder={t("importar.field_author")}
                placeholderTextColor={th.textSubtle}
                value={manualAuthor}
                onChangeText={setManualAuthor}
                style={[styles.input, { color: th.text, borderColor: th.border, backgroundColor: th.bg }]}
              />
              <TextInput
                placeholder={t("importar.field_notes")}
                placeholderTextColor={th.textSubtle}
                value={manualNotes}
                onChangeText={setManualNotes}
                multiline
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { color: th.text, borderColor: th.border, backgroundColor: th.bg },
                ]}
              />
              <TextInput
                placeholder={t("importar.field_isbn")}
                placeholderTextColor={th.textSubtle}
                value={manualIsbn}
                onChangeText={setManualIsbn}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                style={[styles.input, { color: th.text, borderColor: th.border, backgroundColor: th.bg }]}
              />

              {/* Portada (opcional): se SUGIERE de internet y el usuario elige; el
                  alta es literal, esto solo adjunta la imagen seleccionada. */}
              <Pressable
                onPress={suggestCover}
                disabled={
                  coverLoading ||
                  (manualTitle.trim().length < 2 &&
                    manualIsbn.replace(/[^0-9Xx]/g, "").length < 10)
                }
                style={styles.manualToggle}
              >
                <Ionicons name="image-outline" size={16} color={th.primary} />
                <Text style={[styles.manualToggleText, { color: th.primary }]}>
                  {coverLoading ? t("importar.searching_covers") : t("importar.suggest_cover")}
                </Text>
              </Pressable>
              {manualCovers.filter((c) => !coverFailed.has(c.url)).length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                >
                  {manualCovers
                    .filter((c) => !coverFailed.has(c.url))
                    .map((c) => {
                      const sel = c.url === manualCover;
                      return (
                        <Pressable key={c.url} onPress={() => setManualCover(sel ? null : c.url)}>
                          <Image
                            source={{ uri: c.url }}
                            style={[
                              styles.coverThumb,
                              {
                                borderColor: sel ? th.primary : th.border,
                                borderWidth: sel ? 2 : 1,
                              },
                            ]}
                            contentFit="cover"
                            onError={() =>
                              setCoverFailed((s) => {
                                const n = new Set(s);
                                n.add(c.url);
                                return n;
                              })
                            }
                          />
                          {sel ? (
                            <View style={styles.coverCheck}>
                              <Ionicons name="checkmark-circle" size={18} color={th.primary} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                </ScrollView>
              ) : manualCovers.length > 0 ? (
                <Text style={[styles.hintText, { color: th.textSubtle }]}>
                  {t("importar.no_covers")}
                </Text>
              ) : null}

              <Button
                label={manualSaving ? t("importar.saving_book") : t("importar.save_book")}
                onPress={submitManual}
                disabled={manualTitle.trim().length < 2 || manualSaving}
              />
            </View>
          )}
        </Card>
      )}

      </ScrollView>

      {isExtracting && (
        <WebViewImporter
          url={value.trim()}
          onExtracted={handleExtracted}
          onError={(reason) => { setErrorMsg(reason || "No se pudo extraer datos del anuncio"); setStatus("error"); }}
          onCancel={reset}
          onProgress={setProgress}
        />
      )}
    </Screen>
  );
}

/** Datos de empleo embebidos en el candidato (para mostrar sueldo/contrato). */
function jobMetaOf(
  hit: SearchHit
): { line2?: string; contract?: string; salary?: string; platform?: string } | null {
  const rec = hit.record as { meta?: Record<string, unknown> } | undefined;
  const m = rec?.meta;
  if (!m) return null;
  const s = (k: string) => (typeof m[k] === "string" && m[k] ? (m[k] as string) : undefined);
  const platform = s("platform");
  return {
    line2: [s("company"), s("location")].filter(Boolean).join(" · ") || undefined,
    contract: s("contractType"),
    salary: s("salaryLabel"),
    platform:
      platform === "infojobs"
        ? "InfoJobs"
        : platform === "tecnoempleo"
        ? "Tecnoempleo"
        : platform === "linkedin"
        ? "LinkedIn"
        : platform === "indeed"
        ? "Indeed"
        : undefined,
  };
}

/** ¿El primer resultado casa FUERTE con el título compartido? Solo entonces
 *  auto-añadimos por título (evita meter el libro equivocado). Títulos cortos o
 *  de 1–2 palabras se consideran ambiguos → mejor elegir a mano. */
function strongTitleMatch(shared: string, hitName: string | null): boolean {
  if (!hitName) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(shared);
  const b = norm(hitName);
  if (a.length < 12 || a.split(" ").length < 3) return false;
  return b.includes(a) || a.includes(b);
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const b = e.body as { error?: string; message?: string };
    return b.error ?? b.message ?? e.message;
  }
  return e instanceof Error ? e.message : fallback;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  typeRow: { gap: 6, paddingBottom: 4 },
  typeItem: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 16, fontFamily: fonts.bodyBold },
  input: { height: 48, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  inputMultiline: { height: undefined, minHeight: 80, paddingVertical: 10, textAlignVertical: "top" },
  infoText: { fontSize: 14, fontFamily: fonts.bodyMedium },
  infoSub: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden", marginTop: 12 },
  progressFill: { height: 6, borderRadius: 999, minWidth: 6 },
  resultText: { fontSize: 14, fontFamily: fonts.bodyMedium },
  manualToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 2 },
  manualToggleText: { fontSize: 14, fontFamily: fonts.bodySemibold },
  manualForm: { gap: 10 },
  coverThumb: { width: 56, height: 84, borderRadius: 6, backgroundColor: "#00000010" },
  coverCheck: { position: "absolute", top: 2, right: 2, borderRadius: 999, backgroundColor: "#fff" },
  remoteToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  remoteLabel: { fontSize: 13, fontFamily: fonts.bodyMedium },
  opRow: { flexDirection: "row", gap: 8 },
  opChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  opChipText: { fontSize: 13, fontFamily: fonts.bodySemibold },
  results: { gap: 8 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 14, fontFamily: fonts.bodySemibold },
  resultMeta: { fontSize: 12, marginTop: 2 },
  errorText: { fontSize: 13 },
  retry: { marginTop: 6 },
  hintBox: { marginTop: "auto" },
  hintTitle: { fontSize: 12, fontFamily: fonts.bodySemibold, marginBottom: 4 },
  hintText: { fontSize: 12, lineHeight: 18 },
});
