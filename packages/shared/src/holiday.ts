/**
 * Modelo de dominio UNIFICADO de VIAJES (vertical "Viajes" → records.ts tipo
 * `holiday`).
 *
 * Un VIAJE integra un DESPLAZAMIENTO (transporte elegido) + un ALOJAMIENTO
 * elegido, con un precio TOTAL. Independiente del proveedor: aquí NO entran
 * tipos crudos de Amadeus/Booking; los adaptadores traducen la respuesta de cada
 * API a estos tipos. Así la app y el backend conocen UN solo modelo.
 *
 * Compartido web ↔ mobile vía @nidokey/shared (solo tipos + helpers puros, sin
 * Prisma ni Node). Encaja con el patrón `BaseRecord` (records.ts): un viaje se
 * persiste como un registro `holiday` cuyo `currentValue` = total en céntimos y
 * cuyo detalle (transporte + alojamiento + comisión) viaja en `meta`
 * (HolidayTripMeta). El mapper server-side (src/lib/records/mapper.ts) lo
 * proyecta a `BaseRecord` reutilizando lista/cabecera genéricas.
 *
 * Convención de céntimos: TODOS los precios en `Int` de céntimos de su moneda
 * (consistente con Property.currentPrice / formatMoney).
 */

/** Modo de desplazamiento. Amadeus solo cubre `flight` (y hoteles); tren/bus/
 *  coche son fuente manual u otra integración futura — por eso el modo es un
 *  campo genérico y no se asume Amadeus. */
export type TransportMode = "flight" | "train" | "bus" | "car";

/** Tipo de alojamiento elegido. */
export type AccommodationKind = "hotel" | "apartment" | "rental";

/** Etiquetas en español por modo de transporte (para UI). */
export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  flight: "Avión",
  train: "Tren",
  bus: "Bus",
  car: "Coche",
};

/** Imágenes por tamaño (igual convención que BookImageUrls). Ambas opcionales. */
export interface TravelImageUrls {
  /** Pequeña/media → tarjetas de lista. */
  thumbnail?: string | null;
  /** Grande → detalle/zoom. */
  large?: string | null;
}

/** Coordenadas geográficas (WGS84). */
export interface GeoCode {
  lat: number;
  lng: number;
}

/**
 * DESPLAZAMIENTO elegido (un trayecto). Para `flight` los datos vienen de
 * Amadeus; para train/bus/car son manuales/otra fuente. `affiliateUrl` es la
 * capa de monetización (Renfe, ALSA, aerolínea…), separada del dato de búsqueda.
 */
export interface TransportLeg {
  mode: TransportMode;
  /** Compañía/operador ("Iberia", "Renfe", "ALSA"). */
  provider?: string | null;
  /** Identificador del servicio ("IB6423", "AVE 03071"). */
  number?: string | null;
  /** Origen y destino (IATA para vuelo: "MAD"; ciudad/estación para tren/bus). */
  from?: string | null;
  to?: string | null;
  /** Salida/llegada como STRING ISO (conserva zona/hora tal cual la da la API). */
  departISO?: string | null;
  arriveISO?: string | null;
  /** Nº de escalas/transbordos (0 = directo). */
  stops?: number | null;
  /** Duración total en minutos, si se conoce. */
  durationMin?: number | null;
  /** Precio del trayecto en céntimos de `currency`. */
  priceCents?: number | null;
  currency?: string | null;
  /** Enlace de afiliado/compra (capa monetización). */
  affiliateUrl?: string | null;
  /** Id en la fuente externa (offer id de Amadeus, etc.). */
  externalId?: string | null;
}

/**
 * ALOJAMIENTO elegido. Para hoteles los datos vienen de Amadeus (Hotel Search +
 * Hotel Ratings); apartamentos/alquiler pueden ser manuales/otra fuente.
 */
export interface AccommodationChoice {
  kind: AccommodationKind;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  geoCode?: GeoCode | null;
  /** Id de hotel en Amadeus (cuando aplica), para enriquecer/deduplicar. */
  amadeusHotelId?: string | null;
  /** Entrada/salida como STRING ISO ("2026-06-15"). */
  checkInISO?: string | null;
  checkOutISO?: string | null;
  /** Precio TOTAL de la estancia en céntimos de `currency`. */
  priceCents?: number | null;
  currency?: string | null;
  /** Valoración global 0–5 (de Hotel Ratings / sentiment), si se conoce. */
  rating?: number | null;
  /** Valoraciones por categoría 0–100 (sentiment de Amadeus): location,
   *  comfort, service, staff, internet, food, facilities, pool, sleep… */
  ratingCategories?: Record<string, number> | null;
  /** Servicios/facilities ("wifi", "parking", "pool"…). */
  facilities?: string[];
  imageUrls?: TravelImageUrls;
  /** Enlace de afiliado/compra (Booking…). */
  affiliateUrl?: string | null;
}

/** Ocupación de una habitación (adultos + edades de los niños). */
export interface TravelOccupancy {
  adults: number;
  children: number[]; // edades
}

/** Comisión estimada de afiliación (capa de monetización). */
export interface CommissionEstimate {
  /** Tasa aplicada (0–1; ej. 0.06 = 6%). */
  rate: number;
  /** Comisión estimada en céntimos. */
  estCents: number;
}

/**
 * Detalle de un VIAJE — vive en `Holiday.meta` (JSON). El precio total y la foto
 * de destino se denormalizan a columnas (`currentValue`, `imageUrl`) para la
 * lista; aquí va el resto.
 */
export interface HolidayTripMeta {
  destination?: string | null;
  startISO?: string | null;
  endISO?: string | null;
  /** Tipo de viaje libre: "Negocios", "Familia", "Pareja", "Grupo"… o uno propio. */
  tripType?: string | null;
  /** Ocupación por habitación (alojamiento). */
  occupancy?: TravelOccupancy[] | null;
  /** Desplazamiento elegido (la IDA, o el billete i/v completo). */
  transport?: TransportLeg | null;
  /**
   * VUELTA de un billete "partido": cuando la búsqueda inteligente encuentra
   * más barato comprar dos solo-idas independientes, la segunda vive aquí para
   * no perder su enlace de reserva (son dos compras distintas).
   *
   * ⚠️ Su `priceCents` va a null a propósito: el importe conjunto ya está en
   * `transport.priceCents`, y duplicarlo doblaría el total del viaje.
   */
  transportReturn?: TransportLeg | null;
  /** Traslado aeropuerto↔alojamiento (estimado; sin proveedor en vivo aún). */
  transfer?: TransportLeg | null;
  /** Alojamiento elegido. */
  accommodation?: AccommodationChoice | null;
  /** Total del viaje en céntimos (transporte + traslado + alojamiento). */
  totalCents?: number | null;
  currency?: string | null;
  /** Comisión estimada (afiliación). */
  commission?: CommissionEstimate | null;
  /** Código de referido propio del usuario. */
  referralCode?: string | null;
  imageUrls?: TravelImageUrls;
}

/** Suma de las patas de precio de un viaje (céntimos). Ignora nulos. */
export function holidayTotalCents(
  transport?: TransportLeg | null,
  accommodation?: AccommodationChoice | null,
  transfer?: TransportLeg | null
): number {
  return (transport?.priceCents ?? 0) + (accommodation?.priceCents ?? 0) + (transfer?.priceCents ?? 0);
}

/** Comisión estimada sobre el total (céntimos). `rate` por defecto 6%. */
export function estimateCommission(totalCents: number, rate = 0.06): CommissionEstimate {
  return { rate, estCents: Math.round(totalCents * rate) };
}
