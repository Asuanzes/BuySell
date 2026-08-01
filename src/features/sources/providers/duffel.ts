/**
 * Cliente fino de Duffel (https://duffel.com) para PRECIOS DE VUELO en vivo del
 * vertical VIAJES. A diferencia de la Data API cacheada de Travelpayouts, Duffel
 * busca en tiempo real CUALQUIER ruta/fecha con aerolíneas reales.
 *
 * Uso en el producto: Duffel da el PRECIO (mostrado en la app, fechas exactas);
 * la RESERVA/monetización sigue por enlace afiliado de Aviasales (marker
 * Travelpayouts) — NO usamos el flujo de reserva+pago de Duffel (eso te convierte
 * en comercio: pesado). Así: precio real de cualquier ruta + comisión sin pagos.
 *
 * Patrón del repo (fetch plano, sin SDK, throttle). Auth: `Authorization: Bearer
 * DUFFEL_TOKEN` (server-side) + cabecera `Duffel-Version`. Token de test empieza
 * por `duffel_test_`.
 */

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function duffelToken(): string {
  const t = process.env.DUFFEL_TOKEN?.trim() || "";
  if (!t) {
    throw new Error(
      "Falta DUFFEL_TOKEN. Créalo en app.duffel.com → (organización) → Developers " +
        "→ Access tokens (modo test) y ponlo en .env / Vercel."
    );
  }
  return t;
}

let lastCall = 0;
async function throttle(ms = 300): Promise<void> {
  const wait = lastCall + ms - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/** Equipaje INCLUIDO en la tarifa (viene en la propia oferta, sin llamada extra). */
export type DuffelBaggage = { type?: "checked" | "carry_on" | string; quantity?: number };

export type DuffelSegment = {
  departing_at?: string;
  arriving_at?: string;
  /** Duración ISO-8601 ("PT2H15M"). */
  duration?: string;
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  marketing_carrier?: { name?: string; iata_code?: string };
  marketing_carrier_flight_number?: string;
  /** Equipaje por pasajero en ESTE segmento. */
  passengers?: Array<{ baggages?: DuffelBaggage[] }>;
};

export type DuffelSlice = {
  duration?: string;
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  segments?: DuffelSegment[];
};

export type DuffelOffer = {
  id: string;
  total_amount: string; // "144.91"
  total_currency: string; // "EUR"
  /**
   * Tarifa antes de tasas y tasas obligatorias. Duffel garantiza
   * base + tax = total; el desglose del coste total los usa por separado y, si
   * no vienen, los deriva del total (lo que se paga manda).
   */
  base_amount?: string | null;
  tax_amount?: string | null;
  /** Caducidad REAL de la oferta. Es lo que distingue "verificado" de "caducado". */
  expires_at?: string | null;
  owner?: { name?: string; iata_code?: string };
  slices?: DuffelSlice[];
};

/** Un trayecto de la búsqueda. Varios = ida y vuelta, u open-jaw. */
export type DuffelSliceRequest = { origin: string; destination: string; departure_date: string };

/**
 * POST /air/offer_requests?return_offers=true — búsqueda EN VIVO. `slices` =
 * trayectos (ida + vuelta si hay returnDate). Devuelve las ofertas inline.
 */
export async function duffelSearchOffers(opts: {
  origin: string;
  destination: string;
  departDate: string; // "YYYY-MM-DD"
  returnDate?: string;
  adults?: number;
  /** Edades de los niños (Duffel exige edad por pasajero infantil). */
  childAges?: number[];
  cabin?: "economy" | "premium_economy" | "business" | "first";
  /**
   * Trayectos explícitos. Si vienen, MANDAN sobre origin/destination/fechas: es
   * la única forma de pedir un open-jaw (volver desde otro aeropuerto), que no
   * se puede expresar con un par origen/destino.
   */
  slices?: DuffelSliceRequest[];
  /** Escalas máximas por trayecto. Filtra en la aerolínea: no cuesta una llamada extra. */
  maxConnections?: number;
  /** Cancelación desde fuera (el usuario detiene la búsqueda). */
  signal?: AbortSignal;
}): Promise<DuffelOffer[]> {
  const o = opts.origin.toUpperCase();
  const d = opts.destination.toUpperCase();
  const slices: DuffelSliceRequest[] = opts.slices?.length
    ? opts.slices.map((s) => ({
        origin: s.origin.toUpperCase(),
        destination: s.destination.toUpperCase(),
        departure_date: s.departure_date,
      }))
    : [{ origin: o, destination: d, departure_date: opts.departDate }];
  if (!opts.slices?.length && opts.returnDate) {
    slices.push({ origin: d, destination: o, departure_date: opts.returnDate });
  }
  // Duffel: adulto = {type:"adult"}; niño/bebé = {age: N}.
  const passengers: Array<{ type: "adult" } | { age: number }> = [
    ...Array.from({ length: Math.max(1, opts.adults ?? 1) }, () => ({ type: "adult" as const })),
    ...(opts.childAges ?? []).map((age) => ({ age: Math.max(0, Math.min(17, Math.round(age))) })),
  ];

  await throttle();
  const res = await fetch(`${DUFFEL_BASE}/air/offer_requests?return_offers=true&supplier_timeout=12000`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${duffelToken()}`,
      "Duffel-Version": DUFFEL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        slices,
        passengers,
        cabin_class: opts.cabin ?? "economy",
        ...(opts.maxConnections != null ? { max_connections: opts.maxConnections } : {}),
      },
    }),
    cache: "no-store",
    // El timeout propio SIEMPRE está; la señal externa solo se suma. Si se
    // cancelara únicamente por fuera, una búsqueda abandonada seguiría pagando.
    signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Duffel ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    const json = JSON.parse(text) as { data?: { offers?: DuffelOffer[] } };
    return json.data?.offers ?? [];
  } catch {
    throw new Error(`Duffel: respuesta no-JSON: ${text.slice(0, 200)}`);
  }
}

/** Oferta más barata (por total_amount). */
export function cheapestOffer(offers: DuffelOffer[]): DuffelOffer | null {
  let best: DuffelOffer | null = null;
  let bestVal = Infinity;
  for (const o of offers) {
    const v = parseFloat(o.total_amount);
    if (Number.isFinite(v) && v < bestVal) {
      best = o;
      bestVal = v;
    }
  }
  return best;
}
