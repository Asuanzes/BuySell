/**
 * Construcción del payload de un VIAJE (record `holiday`) listo para
 * POST /api/records/import { input.kind:"record" }. Centraliza el cálculo del
 * total y de la COMISIÓN para que móvil y backend coincidan.
 *
 * ⚠️ COMISIÓN INTERNA: `estimateCommission` se guarda en `meta.commission` SOLO
 * para contabilidad nuestra. NUNCA debe mostrarse al usuario ni colarse en
 * `title`/`subtitle`/`currentValue`. El total visible = transporte + alojamiento.
 */
import {
  type TransportLeg,
  type AccommodationChoice,
  type HolidayTripMeta,
  type TravelOccupancy,
  holidayTotalCents,
  estimateCommission,
} from "./holiday";

/** Payload normalizado de holiday para el import unificado de records. */
export interface HolidayImportRecord {
  recordType: "holiday";
  title: string;
  subtitle: string | null;
  status: string;
  currentValue: number; // total en céntimos (lo que ve el usuario)
  currency: string;
  imageUrl: string | null;
  source: string;
  externalId: string;
  meta: HolidayTripMeta & Record<string, unknown>;
}

export function buildHolidayImport(args: {
  destination: string;
  startISO: string;
  endISO: string;
  /** Tipo de viaje libre (Negocios, Familia, Pareja…). */
  tripType?: string | null;
  /** Ocupación por habitación. */
  occupancy?: TravelOccupancy[] | null;
  transport?: TransportLeg | null;
  /** Vuelta de un billete partido (dos solo-idas). Ver HolidayTripMeta. */
  transportReturn?: TransportLeg | null;
  /** Traslado aeropuerto↔hotel (estimado), si el paquete lo incluye. */
  transfer?: TransportLeg | null;
  accommodation?: AccommodationChoice | null;
  imageUrl?: string | null;
  /** Tasa de comisión interna (0–1). Por defecto 6%. */
  commissionRate?: number;
}): HolidayImportRecord {
  const total = holidayTotalCents(args.transport, args.accommodation, args.transfer);
  // COMISIÓN: interna. Se guarda en meta.commission y NUNCA se muestra al usuario.
  const commission = estimateCommission(total, args.commissionRate ?? 0.06);
  const currency = args.accommodation?.currency ?? args.transport?.currency ?? "EUR";
  const tripType = args.tripType?.trim() || null;
  // Título: "Tipo - Destino" → "Negocios - Roma", "Vacaciones - Split",
  // "Escapada con Fátima - Viena" (tipo personalizado). Sin tipo: "Viaje a X".
  const title = tripType ? `${tripType} - ${args.destination}` : `Viaje a ${args.destination}`;
  return {
    recordType: "holiday",
    title,
    subtitle: `${args.startISO} – ${args.endISO}`,
    status: "PLANNING",
    currentValue: total, // total visible; sin desglose de comisión
    currency,
    imageUrl: args.imageUrl ?? args.accommodation?.imageUrls?.thumbnail ?? null,
    source: "nidokey-wizard",
    externalId: `${args.destination}|${args.startISO}|${args.endISO}`.toLowerCase(),
    meta: {
      destination: args.destination,
      startISO: args.startISO,
      endISO: args.endISO,
      tripType,
      occupancy: args.occupancy ?? null,
      transport: args.transport ?? null,
      transportReturn: args.transportReturn ?? null,
      transfer: args.transfer ?? null,
      accommodation: args.accommodation ?? null,
      totalCents: total,
      currency,
      commission, // 👈 INTERNO. No leer en ninguna UI de usuario.
    },
  };
}
