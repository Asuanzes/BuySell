import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, type DateData } from "react-native-calendars";
import { useTranslation } from "react-i18next";

import {
  buildHolidayImport,
  formatMoney,
  type NormalizedOffer,
  type TransportLeg,
  type AccommodationChoice,
} from "@nidokey/shared";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useFlightSearchStream } from "@/lib/flight-stream";
import { useCalendarLocale, shortMonth, type CalendarLang } from "@/lib/i18n/calendar-locales";
import { ResultModal } from "@/components/ui";
import { HotelDetailModal } from "@/components/travel/HotelDetailModal";
import { FlightSearchProgress } from "@/components/travel/FlightSearchProgress";

/**
 * Asistente de VIAJES (record interno `holiday`). 4 pasos:
 *  1. Destino + fechas (autocomplete Travelpayouts).
 *  2. Alojamiento (LiteAPI, precios reales).
 *  3. Desplazamiento (vuelo, precio Travelpayouts; best-effort).
 *  4. Resumen con TOTAL + botones reservar (in-app browser) + crear viaje.
 *
 * ⚠️ La COMISIÓN nunca se muestra. El resumen enseña precios retail + Total.
 */

type Place = {
  id: string;
  name: string;
  iata: string | null;
  countryCode: string | null;
  cityName: string;
  lat: number | null;
  lng: number | null;
};
type HotelItem = {
  hotelId: string;
  name: string;
  stars: number | null;
  thumbnail: string | null;
  priceCents: number;
  currency: string;
  bookUrl: string;
  lat: number | null;
  lng: number | null;
};
type FlightOption = {
  offerId: string | null;
  origin: string;
  destination: string;
  priceCents: number;
  currency: string;
  airline: string | null;
  flightNumber: string | null;
  departISO: string | null;
  returnISO: string | null;
  returnArriveISO: string | null;
  stops: number;
  bookUrl: string;
  // ── solo con "Buscar con IA" (ver src/features/travel/flight-search.ts) ──
  ticketType?: "single" | "split";
  bookUrls?: string[];
  dateShift?: { depart: number; return: number | null };
  savingsPct?: number | null;
  returnAirline?: string | null;
  // ── solo en la búsqueda en directo (SSE) ──
  /** Firmeza del precio: solo `verified` puede presentarse como disponible. */
  confidence?: NormalizedOffer["confidence"];
  /** Partes del total que son estimación NUESTRA, no precio del proveedor. */
  estimatedComponents?: NormalizedOffer["estimatedComponents"];
  /** La conexión corre por cuenta del viajero (dos billetes independientes). */
  selfTransfer?: boolean;
};

/**
 * Oferta del motor nuevo → forma que ya sabe pintar `flightCard`.
 *
 * El `dateShift` se recalcula aquí contra las fechas con las que se lanzó la
 * búsqueda, porque el motor devuelve fechas absolutas y la tarjeta razona en
 * desplazamientos relativos a lo que pidió el usuario.
 */
function offerToFlightOption(o: NormalizedOffer, base: { start: string; end: string }): FlightOption {
  const out = o.legs[0]!;
  const back = o.legs[1] ?? null;
  return {
    offerId: o.offerKey,
    origin: out.origin,
    destination: out.destination,
    priceCents: o.totalTripCost,
    currency: o.currency,
    airline: out.airline,
    flightNumber: out.flightNumber,
    departISO: out.departISO,
    returnISO: back?.departISO ?? null,
    returnArriveISO: back?.arriveISO ?? null,
    stops: out.stops,
    bookUrl: o.bookUrls[0]!,
    ticketType: o.ticketType,
    bookUrls: o.bookUrls,
    dateShift: {
      depart: daysBetween(base.start, out.departISO.slice(0, 10)),
      return: back ? daysBetween(base.end, back.departISO.slice(0, 10)) : null,
    },
    savingsPct: o.savingsPct,
    returnAirline: back?.airline ?? null,
    confidence: o.confidence,
    estimatedComponents: o.estimatedComponents,
    selfTransfer: o.selfTransfer,
  };
}
/** Bloque `ai` de la respuesta: baseline, presupuesto gastado y resumen. */
type AiInfo = {
  baselineCents: number | null;
  duffelCalls: { max: number; used: number };
  partial: boolean;
  degraded: "quota" | "no_dates" | null;
  summary: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Una habitación: adultos + edades de los niños. */
type Room = { adults: number; children: number[] };
/** Tipos de viaje SUGERIDOS (claves i18n trip.type_*; el usuario puede escribir
 *  uno propio). El valor elegido se guarda tal cual se muestra (texto libre). */
const TRIP_TYPE_KEYS = ["vacaciones", "negocios", "trabajo", "familia", "pareja", "grupo", "amigos"] as const;

/** Paquete del viaje: qué se reserva (decide qué pasos se muestran). La
 *  etiqueta sale de i18n (trip.pkg_{id}, template literal tipado sobre Pkg). */
type Pkg = "flight_hotel" | "hotel" | "flight" | "flight_hotel_transfer";
const PKGS: { id: Pkg; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "flight_hotel", icon: "airplane" },
  { id: "hotel", icon: "bed" },
  { id: "flight", icon: "airplane-outline" },
  { id: "flight_hotel_transfer", icon: "car" },
];
/** Traslado aeropuerto↔hotel: estimación mientras no haya proveedor en vivo. */
const TRANSFER_ESTIMATE_CENTS = 4000; // ~40 € ida y vuelta (estimado)

/** "YYYY-MM-DD" de HOY en hora local (minDate del calendario). */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Varias habitaciones → una sola lista de pasajeros (tope del buscador: 9 y 4). */
function mergeRooms(rs: Room[]): Room {
  return {
    adults: Math.min(9, rs.reduce((s, r) => s + r.adults, 0)),
    children: rs.flatMap((r) => r.children).slice(0, 4),
  };
}

/** Desplaza "YYYY-MM-DD" n días. UTC: inmune al horario de verano. */
function shiftISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (= noches de una estancia). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "2026-07-15" → "15 jul" / "15 Jul". TZ-safe (no usa new Date sobre el ISO);
 *  el mes corto sale del locale del calendario activo. */
function fmtDay(iso: string, lang: CalendarLang): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${shortMonth(lang, m ?? 1)}`;
}

type DayMark = { startingDay?: boolean; endingDay?: boolean; color: string; textColor: string };

/** Marca el rango entrada→salida (estilo Booking, markingType="period"). */
function rangeMarks(start: string, end: string, color: string, textColor: string): Record<string, DayMark> {
  if (!start) return {};
  if (!end) return { [start]: { startingDay: true, endingDay: true, color, textColor } };
  const marks: Record<string, DayMark> = {};
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    marks[iso] = { color, textColor, startingDay: iso === start, endingDay: iso === end };
    cur.setDate(cur.getDate() + 1);
  }
  return marks;
}

export default function NewTrip() {
  const { th } = useTheme();
  const { t, i18n } = useTranslation();
  // Locale del calendario sincronizado con el idioma; también alimenta fmtDay y
  // se usa como `key` del <Calendar> (fuerza remount al cambiar idioma).
  const calLang = useCalendarLocale();
  const tripTypes = TRIP_TYPE_KEYS.map((k) => t(`trip.type_${k}`));
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<Pkg>("flight_hotel");

  // Qué incluye el paquete (decide los pasos visibles).
  const wantHotel = pkg !== "flight";
  const wantFlight = pkg !== "hotel";
  const wantTransfer = pkg === "flight_hotel_transfer";

  // Paso 1
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [dest, setDest] = useState<Place | null>(null);
  const [origin, setOrigin] = useState("MAD");
  const [startISO, setStartISO] = useState("");
  const [endISO, setEndISO] = useState("");
  const [tripType, setTripType] = useState(() => t("trip.type_vacaciones"));
  const [rooms, setRooms] = useState<Room[]>([{ adults: 2, children: [] }]);

  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
  const allChildAges = rooms.flatMap((r) => r.children);
  // Mismos plurales que la ficha de viaje (detail.holiday.*). Sin alojamiento no
  // se habla de habitaciones: en "Solo vuelo" solo hay pasajeros.
  const occSummary = [
    wantHotel ? t("detail.holiday.rooms", { count: rooms.length }) : null,
    t("detail.holiday.adults", { count: totalAdults }),
    allChildAges.length ? t("detail.holiday.children", { count: allChildAges.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function setAdults(i: number, delta: number) {
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, adults: Math.max(1, Math.min(6, r.adults + delta)) } : r)));
  }
  function setChildrenCount(i: number, delta: number) {
    setRooms((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const children = [...r.children];
        if (delta > 0 && children.length < 4) children.push(8); // edad por defecto
        else if (delta < 0 && children.length > 0) children.pop();
        return { ...r, children };
      })
    );
  }
  function setChildAge(roomI: number, childI: number, age: number) {
    setRooms((rs) =>
      rs.map((r, j) =>
        j === roomI ? { ...r, children: r.children.map((a, k) => (k === childI ? Math.max(0, Math.min(17, age)) : a)) } : r
      )
    );
  }
  function addRoom() {
    setRooms((rs) => (rs.length < 4 ? [...rs, { adults: 2, children: [] }] : rs));
  }
  function removeRoom(i: number) {
    setRooms((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  }

  // Paso 2
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [hotelsReason, setHotelsReason] = useState<string | null>(null);
  const [hotel, setHotel] = useState<HotelItem | null>(null);
  const [exploreHotel, setExploreHotel] = useState<HotelItem | null>(null); // hotel abierto en el modal de detalle
  const [roomLabel, setRoomLabel] = useState<string | null>(null); // habitación elegida en el modal

  // Paso 3
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [flight, setFlight] = useState<FlightOption | null>(null);
  // Búsqueda inteligente: apagada por defecto (gasta cuota diaria de Duffel).
  const [aiSearch, setAiSearch] = useState(false);
  const [aiInfo, setAiInfo] = useState<AiInfo | null>(null);
  /** Aviso cuando un vuelo desplaza las fechas y hay que rehacer el alojamiento. */
  const [datesMoved, setDatesMoved] = useState<string | null>(null);
  /**
   * Fechas con las que se lanzó la búsqueda. Los `dateShift` que devuelve el
   * servidor son relativos a ESTAS, no a las del viaje: sin esta referencia,
   * elegir dos vuelos desplazados seguidos acumularía los saltos.
   */
  const [searchDates, setSearchDates] = useState<{ start: string; end: string } | null>(null);
  /**
   * Búsqueda IA EN DIRECTO. Sustituye a los 55 s de espera opaca: se entra al
   * paso 3 al instante y las opciones aparecen según se verifican.
   */
  const stream = useFlightSearchStream();
  /** Evita reintentar el camino clásico en bucle si el stream falla. */
  const streamFellBack = useRef(false);

  // Resultado de reserva (modal app-styled, sustituye al Alert nativo).
  const [booked, setBooked] = useState<{ id: string | null; hotelRef: string; flightRef: string | null } | null>(null);

  const transferCents = wantTransfer ? TRANSFER_ESTIMATE_CENTS : 0;
  const totalCents = (hotel?.priceCents ?? 0) + (flight?.priceCents ?? 0) + transferCents;
  /**
   * Todos los precios que enseñamos son TOTALES, no por persona: Duffel cobra
   * `total_amount` por la oferta entera (mandamos un pasajero por viajero) y
   * LiteAPI da el total de la estancia para la ocupación pedida.
   * Por eso el reparto por viajero es una MEDIA y se etiqueta como tal: ninguno
   * de los dos proveedores desglosa el precio pasajero a pasajero, y un niño no
   * paga lo mismo que un adulto.
   */
  const travelers = Math.max(1, totalAdults + allChildAges.length);
  const perTraveler = (cents: number) => Math.round(cents / travelers);
  const perTravelerLabel = (cents: number) =>
    t("trip.per_traveler_short", { price: formatMoney(perTraveler(cents), "EUR") });
  const nights = startISO && endISO ? Math.max(0, daysBetween(startISO, endISO)) : 0;

  // Pasos activos según el paquete → para la etiqueta "Paso X de N".
  const activeSteps: number[] = [1, ...(wantHotel ? [2] : []), ...(wantFlight ? [3] : []), 4];
  const stepIndex = Math.max(1, activeSteps.indexOf(step) + 1);

  async function searchPlaces() {
    const q = placeQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const { items } = await api<{ items: Place[] }>(`/api/travel/places?q=${encodeURIComponent(q)}`);
      setPlaces(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trip.err_search_place"));
    } finally {
      setSearching(false);
    }
  }

  // Selección de rango tipo Booking: 1ª pulsación = entrada; 2ª = salida.
  // Pulsar una fecha anterior a la entrada (o re-empezar) reinicia el rango.
  function onPickDay(day: DateData) {
    const d = day.dateString;
    if (!startISO || (startISO && endISO) || d <= startISO) {
      setStartISO(d);
      setEndISO("");
    } else {
      setEndISO(d);
    }
  }

  /** Consulta de alojamiento para unas fechas concretas (sin tocar estado). */
  async function fetchHotels(start: string, end: string) {
    // Coordenadas preferente (independiente del idioma del nombre).
    const qs = new URLSearchParams({ checkin: start, checkout: end });
    qs.set("occupancies", JSON.stringify(rooms.map((r) => ({ adults: r.adults, children: r.children }))));
    if (dest?.lat != null && dest?.lng != null) {
      qs.set("lat", String(dest.lat));
      qs.set("lng", String(dest.lng));
    }
    if (dest?.countryCode) qs.set("countryCode", dest.countryCode);
    if (dest?.cityName) qs.set("cityName", dest.cityName);
    return api<{ items: HotelItem[]; reason?: string }>(`/api/travel/hotels?${qs.toString()}`);
  }

  async function loadHotels() {
    if (!dest) {
      setError(t("trip.err_destination"));
      return;
    }
    if (!ISO.test(startISO) || !ISO.test(endISO)) {
      setError(t("trip.err_dates"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { items, reason } = await fetchHotels(startISO, endISO);
      setHotels(items);
      setHotelsReason(reason ?? null);
      setHotel(null);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trip.err_load_hotels"));
    } finally {
      setLoading(false);
    }
  }

  /** Query común a los dos caminos (clásico y en directo). */
  function flightQuery(): URLSearchParams | null {
    if (origin.trim().length !== 3 || !dest?.iata) return null;
    const fq = new URLSearchParams({
      origin: origin.trim().toUpperCase(),
      destination: dest.iata,
      departDate: startISO,
      returnDate: endISO,
      adults: String(totalAdults),
    });
    if (allChildAges.length) fq.set("children", allChildAges.join(","));
    fq.set("lang", i18n.language.startsWith("en") ? "en" : "es");
    return fq;
  }

  /**
   * Punto de entrada del paso 3. Con IA se abre el stream y se entra al paso 3
   * DE INMEDIATO: la gracia es ver el proceso y poder elegir una opción sin
   * esperar al final. Sin IA, el camino de siempre, intacto.
   */
  async function loadFlight() {
    const fq = flightQuery();
    if (aiSearch && fq) {
      setError(null);
      setAiInfo(null);
      setDatesMoved(null);
      setSearchDates({ start: startISO, end: endISO });
      setFlights([]);
      setFlight(null);
      streamFellBack.current = false;
      stream.start(Object.fromEntries(fq));
      setStep(3);
      return;
    }
    await loadFlightClassic();
  }

  /**
   * Búsqueda de siempre: una petición, se espera y se pinta.
   *
   * `useAi` se pasa EXPLÍCITAMENTE en vez de leer el estado `aiSearch`, porque
   * quien la llama desde el fallback necesita lo contrario de lo que dice el
   * interruptor: si el stream no abrió, repetir con IA gastaría otras 6
   * consultas de pago por una sola acción del usuario.
   */
  async function loadFlightClassic(useAi = aiSearch) {
    // Sin esto, apagar la IA y volver a buscar seguiría enseñando los resultados
    // de la búsqueda en directo anterior.
    stream.reset();
    setLoading(true);
    setError(null);
    setAiInfo(null);
    setDatesMoved(null);
    setSearchDates({ start: startISO, end: endISO });
    try {
      if (origin.trim().length === 3 && dest?.iata) {
        const fq = new URLSearchParams({
          origin: origin.trim().toUpperCase(),
          destination: dest.iata,
          departDate: startISO,
          returnDate: endISO,
          adults: String(totalAdults),
        });
        if (allChildAges.length) fq.set("children", allChildAges.join(","));
        if (useAi) {
          fq.set("aiSearch", "1");
          fq.set("lang", i18n.language.startsWith("en") ? "en" : "es");
        }
        // La búsqueda IA lanza varias consultas en vivo: no cabe en los 20 s
        // por defecto del cliente. Sin este margen el usuario ve "sin vuelos"
        // cuando lo que hubo fue un corte por tiempo.
        const { items, ai } = await api<{ items: FlightOption[]; ai?: AiInfo }>(
          `/api/travel/flights?${fq.toString()}`,
          useAi ? { timeoutMs: 55_000 } : undefined
        );
        setFlights(items);
        setAiInfo(ai ?? null);
        // Sin IA se preselecciona el más barato. Con IA NO: el primero puede
        // mover las fechas del viaje, y eso lo decide el usuario a propósito.
        setFlight(useAi ? null : items[0] ?? null);
      } else {
        setFlights([]);
        setFlight(null);
      }
    } catch (e) {
      setFlights([]);
      setFlight(null); // sin vuelo, no bloquea el viaje
      // NO se muestra "no hay vuelos": la búsqueda FALLÓ, que es otra cosa.
      // Confundirlas costó una tarde de depuración.
      setError(e instanceof Error ? e.message : t("trip.err_flights"));
    } finally {
      setLoading(false);
      setStep(3);
    }
  }

  /** Fechas de referencia de los `dateShift` (las de la última búsqueda). */
  const baseDates = searchDates ?? { start: startISO, end: endISO };

  /** ¿Hay una búsqueda en directo en marcha o recién terminada? */
  const streaming = stream.state.phase !== "idle";

  /** Ofertas del motor nuevo, ya en la forma que pinta la tarjeta. */
  const streamedFlights = useMemo(
    () => stream.state.offers.map((o) => offerToFlightOption(o, baseDates)),
    [stream.state.offers, baseDates.start, baseDates.end]
  );

  /** Lo que se pinta: en directo mientras dure, si no lo de la búsqueda clásica. */
  const shownFlights = streaming ? streamedFlights : flights;

  /**
   * Si el stream no llega a abrirse (proxy que no deja SSE, versión antigua del
   * backend), se cae al camino clásico UNA vez. Sin el candado se reintentaría
   * en bucle y cada intento gasta cuota de Duffel.
   */
  useEffect(() => {
    if (!stream.error || streamFellBack.current) return;
    streamFellBack.current = true;
    const status = stream.errorStatus;
    const message = stream.error;
    stream.reset();
    // Sin cuota (429) o sin sesión (401) no hay nada que reintentar: repetir
    // devolvería el mismo error y, si quedara algo de cuota, la gastaría para
    // nada. Se enseña el motivo del servidor tal cual.
    if (status === 429 || status === 401) {
      setError(message);
      setStep(3);
      return;
    }
    setError(t("trip.stream_unavailable"));
    // Reintento SIN IA a propósito: una consulta en vez de seis. El usuario ha
    // hecho una acción, no puede costarle el presupuesto de dos búsquedas.
    void loadFlightClassic(false);
    // loadFlightClassic depende de todo el formulario; el candado ya garantiza
    // que esto corre una sola vez por búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.error]);

  /**
   * Mueve el VIAJE ENTERO a unas fechas: vuelve a consultar alojamiento y trata
   * de conservar el hotel elegido. Si ese hotel ya no está disponible en las
   * fechas nuevas, se vuelve al paso 2 en vez de dejar una reserva incoherente.
   */
  async function applyTripDates(start: string, end: string) {
    setDatesMoved(start !== baseDates.start || end !== baseDates.end ? `${fmtDay(start, calLang)} → ${fmtDay(end, calLang)}` : null);
    if (start === startISO && end === endISO) return; // nada que rehacer
    setStartISO(start);
    setEndISO(end);
    if (!wantHotel) return;

    setLoading(true);
    try {
      const { items, reason } = await fetchHotels(start, end);
      setHotels(items);
      setHotelsReason(reason ?? null);
      const same = hotel ? items.find((h) => h.hotelId === hotel.hotelId) : null;
      if (same) {
        setHotel(same); // mismo hotel, precio de las fechas nuevas
        setRoomLabel(null); // la habitación elegida se re-elige en el modal
      } else if (hotel) {
        setHotel(null);
        setError(t("trip.ai_hotel_gone"));
        setStep(2);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("trip.err_load_hotels"));
    } finally {
      setLoading(false);
    }
  }

  /** Elige un vuelo; si la IA lo encontró en otras fechas, el viaje se mueve. */
  async function chooseFlight(f: FlightOption) {
    setFlight(f);
    const s = f.dateShift;
    await applyTripDates(shiftISO(baseDates.start, s?.depart ?? 0), shiftISO(baseDates.end, s?.return ?? s?.depart ?? 0));
  }

  /** Quitar la selección devuelve el viaje a las fechas que pidió el usuario. */
  async function clearFlight() {
    setFlight(null);
    await applyTripDates(baseDates.start, baseDates.end);
  }

  // Navegación dependiente del paquete: salta los pasos que no aplican.
  function startFromStep1() {
    if (!dest) {
      setError(t("trip.err_destination"));
      return;
    }
    if (!ISO.test(startISO) || !ISO.test(endISO)) {
      setError(t("trip.err_dates"));
      return;
    }
    setError(null);
    if (wantHotel) void loadHotels();
    else if (wantFlight) void loadFlight();
    else setStep(4);
  }
  function afterHotels() {
    if (wantFlight) void loadFlight();
    else setStep(4);
  }
  function backFromStep4() {
    setStep(wantFlight ? 3 : wantHotel ? 2 : 1);
  }

  async function createTrip() {
    if (!dest) {
      setError(t("trip.err_missing_destination"));
      return;
    }
    if (wantHotel && !hotel) {
      setError(t("trip.err_missing_hotel"));
      return;
    }
    if (pkg === "flight" && !flight) {
      setError(t("trip.err_missing_flight"));
      return;
    }
    setLoading(true);
    setError(null);

    const accommodation: AccommodationChoice | null = hotel
      ? {
          kind: "hotel",
          name: hotel.name,
          city: dest.cityName,
          country: dest.countryCode,
          geoCode: hotel.lat != null && hotel.lng != null ? { lat: hotel.lat, lng: hotel.lng } : null,
          checkInISO: startISO,
          checkOutISO: endISO,
          priceCents: hotel.priceCents,
          currency: hotel.currency,
          imageUrls: { thumbnail: hotel.thumbnail },
          affiliateUrl: hotel.bookUrl,
        }
      : null;
    const transport: TransportLeg | null = flight
      ? {
          mode: "flight",
          provider: flight.airline,
          number: flight.flightNumber,
          from: origin.trim().toUpperCase(),
          to: dest.iata,
          departISO: flight.departISO,
          arriveISO: null,
          priceCents: flight.priceCents,
          currency: flight.currency,
          affiliateUrl: flight.bookUrl,
        }
      : null;
    // Billete partido: la vuelta es OTRA compra. Se guarda con su enlace propio
    // y SIN precio (el importe conjunto ya está en `transport`, no se duplica).
    const transportReturn: TransportLeg | null =
      flight?.ticketType === "split" && flight.bookUrls?.[1]
        ? {
            mode: "flight",
            provider: flight.returnAirline ?? flight.airline,
            from: dest.iata,
            to: origin.trim().toUpperCase(),
            departISO: flight.returnISO,
            arriveISO: flight.returnArriveISO,
            priceCents: null,
            currency: flight.currency,
            affiliateUrl: flight.bookUrls[1],
          }
        : null;
    const transfer: TransportLeg | null = wantTransfer
      ? {
          mode: "car",
          // Se persiste en el idioma activo al crear (no se retraduce después).
          provider: t("trip.transfer_provider"),
          from: dest.iata,
          to: hotel?.name ?? null,
          priceCents: TRANSFER_ESTIMATE_CENTS,
          currency: "EUR",
          affiliateUrl: null,
        }
      : null;

    // buildHolidayImport calcula la comisión y la guarda en meta.commission
    // (INTERNA). El payload visible (currentValue) es solo el total.
    const record = buildHolidayImport({
      destination: dest.cityName,
      startISO,
      endISO,
      tripType,
      occupancy: rooms.map((r) => ({ adults: r.adults, children: r.children })),
      transport,
      transportReturn,
      transfer,
      accommodation,
      imageUrl: hotel?.thumbnail ?? null,
    });

    try {
      // Reserva completa (modo prueba): el backend confirma y persiste BOOKED.
      const { record: saved, booking } = await api<{
        record: { id: string } | null;
        booking: { hotelRef: string | null; flightRef: string | null };
      }>("/api/travel/book", { method: "POST", body: JSON.stringify({ record }) });
      // Confirmación con modal de la app (no Alert nativo).
      setBooked({ id: saved?.id ?? null, hotelRef: booking.hotelRef ?? "", flightRef: booking.flightRef });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("trip.err_book"));
    } finally {
      setLoading(false);
    }
  }

  const sameFlight = (a: FlightOption | null, f: FlightOption) =>
    !!a && a.priceCents === f.priceCents && a.departISO === f.departISO && a.airline === f.airline;

  function hotelCard(h: HotelItem) {
    const sel = hotel?.hotelId === h.hotelId;
    return (
      <View key={h.hotelId} style={{ gap: 2 }}>
        <Pressable
          onPress={() => {
            setHotel(sel ? null : h);
            setRoomLabel(null); // al cambiar de hotel se olvida la habitación elegida
          }}
          style={[styles.hotelRow, { backgroundColor: th.surface, borderColor: sel ? th.accent : th.border, borderWidth: sel ? 2 : 1 }]}
        >
          {h.thumbnail ? (
            <Image source={{ uri: h.thumbnail }} style={styles.hotelThumb} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.hotelThumb, styles.center, { backgroundColor: th.imagePlaceholder }]}>
              <Ionicons name="bed-outline" size={22} color={th.textSubtle} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }} numberOfLines={2}>{h.name}</Text>
            {h.stars ? <Text style={{ color: th.textSubtle, fontSize: 12 }}>{"★".repeat(Math.round(h.stars))}</Text> : null}
            {sel && roomLabel ? <Text style={{ color: th.accent, fontSize: 12 }} numberOfLines={1}>{roomLabel}</Text> : null}
          </View>
          {sel ? <Ionicons name="checkmark-circle" size={18} color={th.accent} /> : null}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>{formatMoney(h.priceCents, h.currency)}</Text>
            <Text style={{ color: th.textSubtle, fontSize: 10 }}>{perTravelerLabel(h.priceCents)}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setExploreHotel(h)} style={styles.linkRow} hitSlop={4}>
          <Ionicons name="information-circle-outline" size={15} color={th.accent} />
          <Text style={{ color: th.accent, fontSize: 12, fontFamily: fonts.bodySemibold }}>{t("trip.view_rooms_details")}</Text>
        </Pressable>
      </View>
    );
  }

  function flightCard(f: FlightOption) {
    const sel = sameFlight(flight, f);
    const stopsLabel = f.stops === 0 ? t("trip.direct") : t("trip.stops", { count: f.stops });
    const time = f.departISO ? f.departISO.slice(11, 16) : null;
    const split = f.ticketType === "split";
    const moved = f.dateShift && (f.dateShift.depart !== 0 || (f.dateShift.return ?? 0) !== 0);
    // El desplazamiento es relativo a lo que pidió el usuario, así que se aplica
    // sobre las fechas ORIGINALES, no sobre las ya movidas por otra selección.
    const shownDates =
      moved && f.dateShift
        ? `${fmtDay(shiftISO(baseDates.start, f.dateShift.depart), calLang)} → ${fmtDay(
            shiftISO(baseDates.end, f.dateShift.return ?? f.dateShift.depart),
            calLang
          )}`
        : null;
    // Un nocturno aterriza al día siguiente: se enseña la fecha real de llegada.
    const landsLater =
      f.returnISO && f.returnArriveISO && f.returnArriveISO.slice(0, 10) !== f.returnISO.slice(0, 10)
        ? f.returnArriveISO
        : null;
    return (
      <Pressable
        key={f.offerId ?? `${f.airline}|${f.departISO}|${f.priceCents}`}
        onPress={() => void (sel ? clearFlight() : chooseFlight(f))}
        style={[styles.flightCard, { backgroundColor: th.surface, borderColor: sel ? th.accent : th.border, borderWidth: sel ? 2 : 1 }]}
      >
        <View style={styles.flightTop}>
          <Ionicons name="airplane" size={18} color={th.textSubtle} />
          <View style={styles.flex}>
            <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }} numberOfLines={1}>
              {[f.airline ?? t("detail.holiday.flight_fallback"), split && f.returnAirline && f.returnAirline !== f.airline ? f.returnAirline : null]
                .filter(Boolean)
                .join(" + ")}
            </Text>
            <Text style={{ color: th.textSubtle, fontSize: 12 }}>
              {[t("trip.leg_out", { time: time ?? "—" }), stopsLabel].filter(Boolean).join(" · ")}
            </Text>
            {f.returnISO ? (
              <Text style={{ color: th.textSubtle, fontSize: 12 }}>
                {t("trip.leg_back", { date: fmtDay(f.returnISO.slice(0, 10), calLang), time: f.returnISO.slice(11, 16) })}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>{formatMoney(f.priceCents, f.currency)}</Text>
            <Text style={{ color: th.textSubtle, fontSize: 10 }}>{perTravelerLabel(f.priceCents)}</Text>
            {f.savingsPct != null && f.savingsPct > 0 ? (
              <View style={[styles.savingsBadge, { backgroundColor: th.accentSoft }]}>
                <Text style={{ color: th.accent, fontSize: 11, fontFamily: fonts.bodyBold }}>
                  {t("trip.ai_savings", { pct: f.savingsPct })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {shownDates ? (
          <Text style={{ color: th.textMuted, fontSize: 12 }}>
            <Ionicons name="calendar-outline" size={12} color={th.textMuted} /> {t("trip.ai_new_dates", { dates: shownDates })}
          </Text>
        ) : null}
        {landsLater ? (
          <Text style={{ color: th.textSubtle, fontSize: 11 }}>
            {t("trip.ai_lands", { date: fmtDay(landsLater.slice(0, 10), calLang), time: landsLater.slice(11, 16) })}
          </Text>
        ) : null}
        {split ? (
          <Text style={{ color: th.dangerFg, fontSize: 11 }}>
            <Ionicons name="warning-outline" size={11} color={th.dangerFg} /> {t("trip.ai_split_warning")}
          </Text>
        ) : null}
        {/* Etiquetas de CONFIANZA. Distinguen lo que dice la aerolínea de lo que
            estimamos nosotros: sin esto, un traslado estimado se leería como
            parte del precio del billete. */}
        {f.confidence ? (
          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: f.confidence === "verified" ? th.accentSoft : th.bg, borderColor: th.border }]}>
              <Ionicons
                name={f.confidence === "verified" ? "checkmark-circle-outline" : f.confidence === "expired" ? "time-outline" : "help-circle-outline"}
                size={11}
                color={f.confidence === "verified" ? th.accent : th.textMuted}
              />
              <Text style={{ color: f.confidence === "verified" ? th.accent : th.textMuted, fontSize: 10, fontFamily: fonts.bodySemibold }}>
                {f.confidence === "verified"
                  ? t("trip.verified")
                  : f.confidence === "expired"
                    ? t("trip.tag_expired")
                    : t("trip.estimated")}
              </Text>
            </View>
            {f.selfTransfer ? (
              <View style={[styles.tag, { backgroundColor: th.bg, borderColor: th.border }]}>
                <Ionicons name="git-branch-outline" size={11} color={th.textMuted} />
                <Text style={{ color: th.textMuted, fontSize: 10, fontFamily: fonts.bodySemibold }}>
                  {t("trip.tag_self_transfer")}
                </Text>
              </View>
            ) : null}
            {f.bookUrls && f.bookUrls.length > 1 ? (
              <View style={[styles.tag, { backgroundColor: th.bg, borderColor: th.border }]}>
                <Ionicons name="copy-outline" size={11} color={th.textMuted} />
                <Text style={{ color: th.textMuted, fontSize: 10, fontFamily: fonts.bodySemibold }}>
                  {t("trip.tag_separate_tickets")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {f.estimatedComponents?.length ? (
          <Text style={{ color: th.textSubtle, fontSize: 10 }}>
            {t("trip.estimated_includes", {
              parts: f.estimatedComponents.map((p) => t(`trip.estimated_part_${p}` as never)).join(" + "),
            })}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  const STEP_TITLES = [
    t("trip.step1_title"),
    t("trip.step2_title"),
    t("trip.step3_title"),
    t("trip.step4_title"),
  ];

  return (
    <>
      <Stack.Screen options={{ title: t("trip.title") }} />
      <ScrollView style={{ backgroundColor: th.bg }} contentContainerStyle={styles.content}>
        <Text style={[styles.stepLabel, { color: th.textSubtle }]}>
          {t("trip.step_label", { n: stepIndex, total: activeSteps.length, title: STEP_TITLES[step - 1] })}
        </Text>

        {error && <Text style={[styles.error, { color: th.dangerFg }]}>{error}</Text>}

        {/* ── Paso 1 ── */}
        {step === 1 && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.label, { color: th.textMuted }]}>{t("trip.what_book")}</Text>
            <View style={styles.chipsWrap}>
              {PKGS.map((p) => {
                const on = pkg === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPkg(p.id);
                      // Al quedarse sin alojamiento, las habitaciones dejan de
                      // existir: se funden en una única lista de pasajeros.
                      if (p.id === "flight") setRooms((rs) => (rs.length > 1 ? [mergeRooms(rs)] : rs));
                    }}
                    style={[styles.pkgChip, { borderColor: on ? th.accent : th.border, backgroundColor: on ? th.accentSoft : th.surface }]}
                  >
                    <Ionicons name={p.icon} size={15} color={on ? th.accent : th.textMuted} />
                    <Text style={{ color: on ? th.accent : th.textMuted, fontSize: 13, fontFamily: fonts.bodySemibold }}>{t(`trip.pkg_${p.id}`)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {wantFlight && (
              <Pressable
                onPress={() => setAiSearch((v) => !v)}
                style={[styles.aiToggle, { borderColor: aiSearch ? th.accent : th.border, backgroundColor: aiSearch ? th.accentSoft : th.surface }]}
              >
                <Ionicons name={aiSearch ? "checkbox" : "square-outline"} size={18} color={aiSearch ? th.accent : th.textMuted} />
                <Text style={{ color: aiSearch ? th.accent : th.text, fontFamily: fonts.bodySemibold, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {t("trip.ai_search")}
                </Text>
                <Ionicons name="sparkles-outline" size={14} color={aiSearch ? th.accent : th.textSubtle} />
              </Pressable>
            )}

            <Text style={[styles.label, { color: th.textMuted, marginTop: 6 }]}>{t("trip.destination")}</Text>
            {dest ? (
              <Pressable
                onPress={() => setDest(null)}
                style={[styles.chip, { backgroundColor: th.accentSoft, borderColor: th.accent }]}
              >
                <Ionicons name="location" size={16} color={th.accent} />
                <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>
                  {dest.name}
                  {dest.iata ? ` (${dest.iata})` : ""}
                </Text>
                <Ionicons name="close" size={16} color={th.accent} />
              </Pressable>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <TextInput
                    value={placeQuery}
                    onChangeText={setPlaceQuery}
                    placeholder={t("trip.destination_placeholder")}
                    placeholderTextColor={th.textSubtle}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => void searchPlaces()}
                    style={[styles.input, styles.flex, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
                  />
                  <Pressable
                    onPress={() => void searchPlaces()}
                    style={[styles.searchBtn, { backgroundColor: th.accent }]}
                  >
                    {searching ? (
                      <ActivityIndicator size="small" color={th.primaryFg} />
                    ) : (
                      <Ionicons name="search" size={18} color={th.primaryFg} />
                    )}
                  </Pressable>
                </View>
                {places.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setDest(p);
                      setPlaces([]);
                    }}
                    style={[styles.row, { backgroundColor: th.surface, borderColor: th.border }]}
                  >
                    <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }}>{p.name}</Text>
                    <Text style={{ color: th.textSubtle, fontSize: 12 }}>
                      {[p.iata, p.countryCode].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={[styles.label, { color: th.textMuted, marginTop: 6 }]}>{t("trip.trip_type")}</Text>
            <View style={styles.chipsWrap}>
              {tripTypes.map((label) => {
                const on = tripType === label;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setTripType(label)}
                    style={[styles.typeChip, { borderColor: on ? th.accent : th.border, backgroundColor: on ? th.accentSoft : th.surface }]}
                  >
                    <Text style={{ color: on ? th.accent : th.textMuted, fontSize: 13, fontFamily: fonts.bodySemibold }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={tripTypes.includes(tripType) ? "" : tripType}
              onChangeText={setTripType}
              placeholder={t("trip.other_type_placeholder")}
              placeholderTextColor={th.textSubtle}
              autoCapitalize="sentences"
              style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
            />

            {wantFlight && (
              <>
                <Text style={[styles.label, { color: th.textMuted, marginTop: 6 }]}>{t("trip.origin_iata")}</Text>
                <TextInput
                  value={origin}
                  onChangeText={(t) => setOrigin(t.toUpperCase().slice(0, 3))}
                  placeholder="MAD"
                  placeholderTextColor={th.textSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: th.surface, borderColor: th.border, color: th.text }]}
                />
              </>
            )}

            <Text style={[styles.label, { color: th.textMuted, marginTop: 6 }]}>{t("trip.dates")}</Text>
            <Text style={{ color: startISO ? th.text : th.textSubtle, fontSize: 13, fontFamily: fonts.bodyMedium }}>
              {startISO && endISO
                ? `${fmtDay(startISO, calLang)} → ${fmtDay(endISO, calLang)}`
                : startISO
                ? t("trip.pick_end", { date: fmtDay(startISO, calLang) })
                : t("trip.pick_start")}
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

            <Text style={[styles.label, { color: th.textMuted, marginTop: 6 }]}>
              {wantHotel ? t("trip.travelers_rooms") : t("trip.travelers")}
            </Text>
            <Text style={{ color: th.textSubtle, fontSize: 12 }}>{occSummary}</Text>
            {rooms.map((r, i) => (
              <View key={i} style={[styles.roomCard, { backgroundColor: th.surface, borderColor: th.border }]}>
                {/* Sin alojamiento no hay habitaciones: solo pasajeros del vuelo. */}
                {wantHotel ? (
                  <View style={styles.roomHeader}>
                    <Text style={{ color: th.text, fontFamily: fonts.bodyBold }}>{t("trip.room_n", { n: i + 1 })}</Text>
                    {rooms.length > 1 ? (
                      <Pressable onPress={() => removeRoom(i)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={th.dangerFg} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <Stepper label={t("trip.adults")} value={r.adults} onMinus={() => setAdults(i, -1)} onPlus={() => setAdults(i, 1)} th={th} />
                <Stepper label={t("trip.children")} value={r.children.length} onMinus={() => setChildrenCount(i, -1)} onPlus={() => setChildrenCount(i, 1)} th={th} />
                {r.children.length > 0 ? (
                  <View style={styles.agesRow}>
                    {r.children.map((age, ci) => (
                      <View key={ci} style={[styles.ageBox, { borderColor: th.border, backgroundColor: th.bg }]}>
                        <Text style={{ color: th.textSubtle, fontSize: 10 }}>{t("trip.age")}</Text>
                        <Pressable onPress={() => setChildAge(i, ci, age - 1)} hitSlop={6}>
                          <Ionicons name="remove" size={14} color={th.accent} />
                        </Pressable>
                        <Text style={{ color: th.text, fontFamily: fonts.bodySemibold, minWidth: 16, textAlign: "center" }}>{age}</Text>
                        <Pressable onPress={() => setChildAge(i, ci, age + 1)} hitSlop={6}>
                          <Ionicons name="add" size={14} color={th.accent} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {wantHotel && rooms.length < 4 ? (
              <Pressable onPress={addRoom} style={[styles.addRoomBtn, { borderColor: th.border }]}>
                <Ionicons name="add" size={16} color={th.accent} />
                <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("trip.add_room")}</Text>
              </Pressable>
            ) : null}

            <PrimaryBtn label={t("trip.next")} loading={loading} onPress={() => startFromStep1()} th={th} />
          </View>
        )}

        {/* ── Paso 2: alojamiento ── */}
        {step === 2 && (
          <View style={{ gap: 8 }}>
            {hotels.length === 0 ? (
              <Text style={{ color: th.textSubtle }}>
                {hotelsReason === "no_city"
                  ? t("trip.no_hotels_city", { name: dest?.name ?? t("trip.that_destination") })
                  : t("trip.no_availability")}
              </Text>
            ) : hotel ? (
              <>
                {hotelCard(hotel)}
                <Pressable onPress={() => setHotel(null)} style={styles.linkRow}>
                  <Ionicons name="swap-horizontal" size={16} color={th.accent} />
                  <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("trip.view_other_hotels", { count: hotels.length })}</Text>
                </Pressable>
              </>
            ) : (
              hotels.map((h) => hotelCard(h))
            )}
            <View style={styles.navRow}>
              <GhostBtn label={t("common.back")} onPress={() => setStep(1)} th={th} />
              <PrimaryBtn label={t("trip.next")} loading={loading} disabled={!hotel} onPress={() => afterHotels()} th={th} />
            </View>
          </View>
        )}

        {/* ── Paso 3: desplazamiento (lista seleccionable) ── */}
        {step === 3 && (
          <View style={{ gap: 8 }}>
            {aiInfo ? (
              <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border, gap: 6 }]}>
                <View style={styles.aiHeader}>
                  <Ionicons name="sparkles-outline" size={15} color={th.accent} />
                  <Text style={{ color: th.accent, fontSize: 12, fontFamily: fonts.bodyBold }}>{t("trip.ai_result_title")}</Text>
                </View>
                {aiInfo.summary ? <Text style={{ color: th.text, fontSize: 13 }}>{aiInfo.summary}</Text> : null}
                {aiInfo.baselineCents != null ? (
                  <Text style={{ color: th.textSubtle, fontSize: 11 }}>
                    {t("trip.ai_baseline", { price: formatMoney(aiInfo.baselineCents, "EUR") })}
                  </Text>
                ) : null}
                {aiInfo.degraded === "quota" ? (
                  <Text style={{ color: th.dangerFg, fontSize: 11 }}>{t("trip.ai_degraded_quota")}</Text>
                ) : aiInfo.partial ? (
                  <Text style={{ color: th.textSubtle, fontSize: 11 }}>{t("trip.ai_partial")}</Text>
                ) : null}
              </View>
            ) : null}
            {/* Progreso REAL de la búsqueda en directo. No es un spinner: es lo
                que el motor está haciendo, con contadores y botón de parar. */}
            {streaming ? (
              <FlightSearchProgress state={stream.state} running={stream.running} onStop={stream.stop} />
            ) : null}
            {streaming && stream.state.summary ? (
              <Text style={{ color: th.text, fontSize: 13 }}>{stream.state.summary}</Text>
            ) : null}
            {datesMoved ? (
              <Text style={{ color: th.accent, fontSize: 12, fontFamily: fonts.bodySemibold }}>
                {t("trip.ai_dates_moved", { dates: datesMoved })}
              </Text>
            ) : null}
            {shownFlights.length === 0 ? (
              // Mientras el stream busca no se dice "no hay vuelos": todavía no
              // se sabe. Ese mensaje solo vale cuando la búsqueda ha terminado.
              stream.running ? null : (
                <Text style={{ color: th.textSubtle }}>{t("trip.no_flights")}</Text>
              )
            ) : flight ? (
              <>
                {flightCard(flight)}
                {shownFlights.length > 1 ? (
                  <Pressable onPress={() => void clearFlight()} style={styles.linkRow}>
                    <Ionicons name="swap-horizontal" size={16} color={th.accent} />
                    <Text style={{ color: th.accent, fontFamily: fonts.bodySemibold }}>{t("trip.view_other_flights", { count: shownFlights.length })}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                {shownFlights.map((f) => flightCard(f))}
                <Text style={{ color: th.textSubtle, fontSize: 12 }}>
                  {t("trip.choose_flight_hint")}
                </Text>
              </>
            )}
            <View style={styles.navRow}>
              <GhostBtn label={t("common.back")} onPress={() => setStep(wantHotel ? 2 : 1)} th={th} />
              <PrimaryBtn label={t("trip.next")} onPress={() => setStep(4)} th={th} />
            </View>
          </View>
        )}

        {/* ── Paso 4: resumen / previsualización de la reserva (SIN comisión) ── */}
        {step === 4 && dest && (hotel || !wantHotel) && (
          <View style={{ gap: 12 }}>
            <Text style={[styles.label, { color: th.textMuted }]}>{t("trip.review")}</Text>

            {/* Datos del viaje */}
            <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
              <Row k={t("detail.holiday.row_destination")} v={dest.name} th={th} />
              {tripType.trim() ? <Row k={t("detail.holiday.row_type")} v={tripType.trim()} th={th} /> : null}
              <Row k={t("detail.holiday.row_dates")} v={`${fmtDay(startISO, calLang)} → ${fmtDay(endISO, calLang)}`} th={th} />
              <Row k={t("detail.holiday.row_travelers")} v={occSummary} th={th} />
            </View>

            {/* Alojamiento (previsualización con foto) */}
            {hotel ? (
              <Pressable
                onPress={() => setExploreHotel(hotel)}
                style={[styles.previewRow, { backgroundColor: th.surface, borderColor: th.border }]}
              >
                {hotel.thumbnail ? (
                  <Image source={{ uri: hotel.thumbnail }} style={styles.hotelThumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.hotelThumb, styles.center, { backgroundColor: th.imagePlaceholder }]}>
                    <Ionicons name="bed-outline" size={22} color={th.textSubtle} />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={{ color: th.textSubtle, fontSize: 11, fontFamily: fonts.bodySemibold }}>{t("trip.summary_accommodation")}</Text>
                  <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }} numberOfLines={2}>{hotel.name}</Text>
                  <Text style={{ color: th.textSubtle, fontSize: 12 }}>
                    {[hotel.stars ? "★".repeat(Math.round(hotel.stars)) : null, roomLabel ?? t("trip.view_rooms")].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>{formatMoney(hotel.priceCents, hotel.currency)}</Text>
              </Pressable>
            ) : null}

            {/* Vuelo (previsualización) */}
            {flight ? (
              <View style={[styles.previewRow, { backgroundColor: th.surface, borderColor: th.border }]}>
                <View style={[styles.hotelThumb, styles.center, { backgroundColor: th.imagePlaceholder }]}>
                  <Ionicons name="airplane" size={22} color={th.textSubtle} />
                </View>
                <View style={styles.flex}>
                  <Text style={{ color: th.textSubtle, fontSize: 11, fontFamily: fonts.bodySemibold }}>{t("trip.summary_flight")}</Text>
                  <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }} numberOfLines={1}>{flight.airline ?? t("detail.holiday.flight_fallback")}</Text>
                  <Text style={{ color: th.textSubtle, fontSize: 12 }}>
                    {[
                      `${origin.trim().toUpperCase()} → ${dest.iata ?? ""}`,
                      flight.departISO ? flight.departISO.slice(11, 16) : null,
                      flight.stops === 0 ? t("trip.direct") : t("trip.stops", { count: flight.stops }),
                    ].filter(Boolean).join(" · ")}
                  </Text>
                  {flight.ticketType === "split" ? (
                    <Text style={{ color: th.dangerFg, fontSize: 11 }}>{t("trip.ai_split_title")}</Text>
                  ) : null}
                </View>
                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>{formatMoney(flight.priceCents, flight.currency)}</Text>
              </View>
            ) : null}
            {flight?.ticketType === "split" ? (
              <Text style={{ color: th.textSubtle, fontSize: 11 }}>{t("trip.ai_split_warning")}</Text>
            ) : null}

            {/* Traslado (estimado) */}
            {wantTransfer ? (
              <View style={[styles.previewRow, { backgroundColor: th.surface, borderColor: th.border }]}>
                <View style={[styles.hotelThumb, styles.center, { backgroundColor: th.imagePlaceholder }]}>
                  <Ionicons name="car" size={22} color={th.textSubtle} />
                </View>
                <View style={styles.flex}>
                  <Text style={{ color: th.textSubtle, fontSize: 11, fontFamily: fonts.bodySemibold }}>{t("trip.summary_transfer")}</Text>
                  <Text style={{ color: th.text, fontFamily: fonts.bodySemibold }}>{t("trip.transfer_name")}</Text>
                  <Text style={{ color: th.textSubtle, fontSize: 12 }}>{t("trip.transfer_note")}</Text>
                </View>
                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold }}>{formatMoney(TRANSFER_ESTIMATE_CENTS, "EUR")}</Text>
              </View>
            ) : null}

            {/* Desglose + Total (⚠️ NUNCA comisión aquí) */}
            <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
              <Text style={[styles.label, { color: th.textMuted, marginBottom: 2 }]}>{t("trip.breakdown")}</Text>
              <Text style={{ color: th.textSubtle, fontSize: 11, marginBottom: 6 }}>
                {t("trip.prices_are_total", { count: travelers })}
              </Text>

              {hotel ? (
                <BreakdownRow
                  label={t("trip.summary_accommodation")}
                  detail={[
                    nights ? t("trip.nights", { count: nights }) : null,
                    t("detail.holiday.rooms", { count: rooms.length }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  cents={hotel.priceCents}
                  perTravelerLabel={perTravelerLabel(hotel.priceCents)}
                  th={th}
                />
              ) : null}
              {flight ? (
                <BreakdownRow
                  label={t("trip.summary_flight")}
                  detail={[
                    flight.returnISO ? t("trip.round_trip") : t("trip.one_way"),
                    flight.ticketType === "split" ? t("trip.ai_split_title") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  cents={flight.priceCents}
                  perTravelerLabel={perTravelerLabel(flight.priceCents)}
                  th={th}
                />
              ) : null}
              {wantTransfer ? (
                <BreakdownRow
                  label={t("trip.summary_transfer")}
                  detail={t("trip.transfer_note")}
                  cents={TRANSFER_ESTIMATE_CENTS}
                  perTravelerLabel={perTravelerLabel(TRANSFER_ESTIMATE_CENTS)}
                  th={th}
                />
              ) : null}

              <View style={[styles.totalRow, { borderTopColor: th.border }]}>
                <Text style={{ color: th.text, fontFamily: fonts.bodyBold }}>{t("trip.total")}</Text>
                <Text style={{ color: th.accent, fontFamily: fonts.bodyBold, fontSize: 19 }}>{formatMoney(totalCents, "EUR")}</Text>
              </View>
              <Text style={{ color: th.textMuted, fontSize: 12, textAlign: "right", fontFamily: fonts.bodySemibold }}>
                {t("trip.per_traveler_avg", { price: formatMoney(perTraveler(totalCents), "EUR") })}
              </Text>
              <Text style={{ color: th.textSubtle, fontSize: 11, marginTop: 6 }}>{t("trip.test_booking")}</Text>
            </View>

            <View style={styles.navRow}>
              <GhostBtn label={t("common.back")} onPress={() => backFromStep4()} th={th} />
              <PrimaryBtn label={t("trip.book_btn")} loading={loading} onPress={() => void createTrip()} th={th} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Explorar hotel: fotos, servicios y habitaciones (in-app) */}
      <HotelDetailModal
        visible={!!exploreHotel}
        hotelId={exploreHotel?.hotelId ?? null}
        fallbackName={exploreHotel?.name ?? ""}
        fallbackPriceCents={exploreHotel?.priceCents ?? 0}
        checkin={startISO}
        checkout={endISO}
        occupancies={rooms}
        onClose={() => setExploreHotel(null)}
        onChoose={(priceCents, roomName) => {
          if (exploreHotel) {
            setHotel({ ...exploreHotel, priceCents });
            setRoomLabel(roomName);
          }
          setExploreHotel(null);
        }}
      />

      {/* Confirmación de reserva con estilo de la app (no Alert nativo) */}
      <ResultModal
        visible={!!booked}
        tone="success"
        title={t("trip.booked_title")}
        message={t("trip.test_booking")}
        detail={
          booked
            ? [
                booked.hotelRef ? t("trip.ref_accommodation", { ref: booked.hotelRef }) : null,
                booked.flightRef ? t("detail.holiday.ref_flight", { ref: booked.flightRef }) : null,
              ]
                .filter(Boolean)
                .join("   ·   ") || null
            : null
        }
        actions={[
          {
            label: t("trip.view_trip"),
            onPress: () => {
              const id = booked?.id;
              setBooked(null);
              router.replace((id ? `/holiday/${id}` : "/(tabs)") as never);
            },
          },
        ]}
        onRequestClose={() => {
          const id = booked?.id;
          setBooked(null);
          router.replace((id ? `/holiday/${id}` : "/(tabs)") as never);
        }}
      />
    </>
  );
}

type Th = ReturnType<typeof useTheme>["th"];

/** Una línea del desglose: concepto + detalle · total · media por viajero. */
function BreakdownRow({
  label,
  detail,
  cents,
  perTravelerLabel,
  th,
}: {
  label: string;
  detail?: string | null;
  cents: number;
  perTravelerLabel: string;
  th: Th;
}) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.flex}>
        <Text style={{ color: th.text, fontSize: 13, fontFamily: fonts.bodySemibold }}>{label}</Text>
        {detail ? <Text style={{ color: th.textSubtle, fontSize: 11 }}>{detail}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: th.text, fontSize: 13, fontFamily: fonts.bodySemibold }}>{formatMoney(cents, "EUR")}</Text>
        <Text style={{ color: th.textSubtle, fontSize: 11 }}>{perTravelerLabel}</Text>
      </View>
    </View>
  );
}

function Row({ k, v, th, accent }: { k: string; v: string; th: Th; accent?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: th.textSubtle, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: accent ? th.accent : th.text, fontSize: 13, fontFamily: fonts.bodySemibold, flexShrink: 1, textAlign: "right" }}>
        {v}
      </Text>
    </View>
  );
}

function PrimaryBtn({
  label,
  onPress,
  loading,
  disabled,
  th,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  th: Th;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={[styles.primaryBtn, { backgroundColor: th.accent, opacity: loading || disabled ? 0.5 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={th.primaryFg} />
      ) : (
        <Text style={{ color: th.primaryFg, fontFamily: fonts.bodyBold }}>{label}</Text>
      )}
    </Pressable>
  );
}

function GhostBtn({ label, onPress, th }: { label: string; onPress: () => void; th: Th }) {
  return (
    <Pressable onPress={onPress} style={styles.ghostBtn}>
      <Text style={{ color: th.textMuted, fontFamily: fonts.bodySemibold }}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  th,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  th: Th;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={{ color: th.text, fontSize: 14 }}>{label}</Text>
      <View style={styles.stepperCtrls}>
        <Pressable onPress={onMinus} style={[styles.stepBtn, { borderColor: th.border }]} hitSlop={6}>
          <Ionicons name="remove" size={18} color={th.accent} />
        </Pressable>
        <Text style={{ color: th.text, fontFamily: fonts.bodyBold, minWidth: 22, textAlign: "center" }}>{value}</Text>
        <Pressable onPress={onPlus} style={[styles.stepBtn, { borderColor: th.border }]} hitSlop={6}>
          <Ionicons name="add" size={18} color={th.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  stepLabel: { fontSize: 12, fontFamily: fonts.bodySemibold },
  label: { fontSize: 13, fontFamily: fonts.bodySemibold },
  error: { fontSize: 13 },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  input: { height: 48, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  searchRow: { flexDirection: "row", gap: 8 },
  calendarWrap: { borderWidth: 1, borderRadius: 10, overflow: "hidden", paddingBottom: 4 },
  searchBtn: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  row: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" },
  hotelRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: 8 },
  flightCard: { borderRadius: 10, padding: 12, gap: 6 },
  flightTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  savingsBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  aiToggle: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  hotelThumb: { width: 56, height: 56, borderRadius: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 4 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  breakdownRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 5 },
  primaryBtn: { flex: 1, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ghostBtn: { height: 48, paddingHorizontal: 18, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 10, borderWidth: 1 },
  navRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pkgChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, padding: 10 },
  totalRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  roomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepperRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepperCtrls: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  agesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ageBox: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  addRoomBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 10, borderWidth: 1, borderStyle: "dashed" },
});
