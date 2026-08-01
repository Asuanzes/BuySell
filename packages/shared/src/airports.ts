/**
 * Tabla ESTÁTICA de aeropuertos para la búsqueda inteligente de vuelos.
 *
 * ¿Por qué estática y no una API? El planificador necesita distancias para
 * decidir qué aeropuertos son "cercanos" y cuánto cuesta el traslado terrestre.
 * Resolverlo por red haría el planificador impuro, lento y no determinista — y
 * lo que necesita es geometría, no disponibilidad.
 *
 * COBERTURA A PROPÓSITO PARCIAL: solo España, Europa occidental y los grupos
 * multi-aeropuerto que importan a un viajero desde España. Un aeropuerto que no
 * esté aquí NO rompe nada: se queda sin alternativos y sin estimación de
 * traslado, es decir, se comporta exactamente como la búsqueda de siempre. No
 * tiene sentido inventarse un atlas mundial para una función que solo aporta
 * valor donde hay más de un aeropuerto a mano.
 *
 * Sin APIs de Node: se comparte con la app móvil vía @nidokey/shared.
 */

export type Airport = {
  iata: string;
  name: string;
  city: string;
  /** ISO-3166 alfa-2. */
  country: string;
  lat: number;
  lng: number;
};

/**
 * Códigos de CIUDAD (metro) de IATA que los proveedores aceptan como origen o
 * destino y que cubren TODOS sus aeropuertos en UNA sola consulta. Es la forma
 * barata de explorar aeropuertos cercanos: cuesta cero llamadas extra.
 *
 * Lista corta y conservadora a propósito: solo grupos donde el código de ciudad
 * está fuera de duda. Beauvais (BVA), Skavsta (NYO) o Girona (GRO) NO entran
 * aquí aunque se vendan como "París/Estocolmo/Barcelona": tienen código de
 * ciudad propio y se tratan como aeropuerto cercano normal, con su traslado.
 */
export const METRO_GROUPS: Record<string, string[]> = {
  LON: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"],
  PAR: ["CDG", "ORY"],
  MIL: ["MXP", "LIN", "BGY"],
  ROM: ["FCO", "CIA"],
  STO: ["ARN", "BMA"],
  NYC: ["JFK", "LGA", "EWR"],
};

const ROWS: Airport[] = [
  // ── España peninsular ──
  { iata: "MAD", name: "Adolfo Suárez Madrid-Barajas", city: "Madrid", country: "ES", lat: 40.4719, lng: -3.5626 },
  { iata: "BCN", name: "Josep Tarradellas Barcelona-El Prat", city: "Barcelona", country: "ES", lat: 41.2971, lng: 2.0785 },
  { iata: "GRO", name: "Girona-Costa Brava", city: "Girona", country: "ES", lat: 41.901, lng: 2.7605 },
  { iata: "REU", name: "Reus", city: "Reus", country: "ES", lat: 41.1474, lng: 1.1672 },
  { iata: "AGP", name: "Málaga-Costa del Sol", city: "Málaga", country: "ES", lat: 36.6749, lng: -4.4991 },
  { iata: "ALC", name: "Alicante-Elche", city: "Alicante", country: "ES", lat: 38.2822, lng: -0.5582 },
  { iata: "VLC", name: "Valencia", city: "Valencia", country: "ES", lat: 39.4893, lng: -0.4816 },
  { iata: "SVQ", name: "Sevilla", city: "Sevilla", country: "ES", lat: 37.418, lng: -5.8931 },
  { iata: "XRY", name: "Jerez", city: "Jerez de la Frontera", country: "ES", lat: 36.7446, lng: -6.0601 },
  { iata: "GRX", name: "Federico García Lorca Granada-Jaén", city: "Granada", country: "ES", lat: 37.1887, lng: -3.7774 },
  { iata: "LEI", name: "Almería", city: "Almería", country: "ES", lat: 36.8439, lng: -2.3701 },
  { iata: "RMU", name: "Región de Murcia", city: "Murcia", country: "ES", lat: 37.803, lng: -1.125 },
  { iata: "BIO", name: "Bilbao", city: "Bilbao", country: "ES", lat: 43.3011, lng: -2.9106 },
  { iata: "EAS", name: "San Sebastián", city: "San Sebastián", country: "ES", lat: 43.3565, lng: -1.7906 },
  { iata: "VIT", name: "Vitoria", city: "Vitoria-Gasteiz", country: "ES", lat: 42.8828, lng: -2.7244 },
  { iata: "PNA", name: "Pamplona", city: "Pamplona", country: "ES", lat: 42.77, lng: -1.6463 },
  { iata: "SDR", name: "Seve Ballesteros-Santander", city: "Santander", country: "ES", lat: 43.4271, lng: -3.82 },
  { iata: "OVD", name: "Asturias", city: "Oviedo", country: "ES", lat: 43.5636, lng: -6.0346 },
  { iata: "SCQ", name: "Santiago-Rosalía de Castro", city: "Santiago de Compostela", country: "ES", lat: 42.8963, lng: -8.4151 },
  { iata: "LCG", name: "A Coruña", city: "A Coruña", country: "ES", lat: 43.3021, lng: -8.3773 },
  { iata: "VGO", name: "Vigo", city: "Vigo", country: "ES", lat: 42.2318, lng: -8.6273 },
  { iata: "ZAZ", name: "Zaragoza", city: "Zaragoza", country: "ES", lat: 41.6662, lng: -1.0416 },
  { iata: "VLL", name: "Valladolid", city: "Valladolid", country: "ES", lat: 41.7061, lng: -4.8519 },
  { iata: "BJZ", name: "Badajoz", city: "Badajoz", country: "ES", lat: 38.8913, lng: -6.8213 },
  { iata: "MLN", name: "Melilla", city: "Melilla", country: "ES", lat: 35.2798, lng: -2.9563 },
  // ── Baleares y Canarias ──
  { iata: "PMI", name: "Palma de Mallorca", city: "Palma", country: "ES", lat: 39.5517, lng: 2.7388 },
  { iata: "IBZ", name: "Ibiza", city: "Ibiza", country: "ES", lat: 38.8729, lng: 1.3731 },
  { iata: "MAH", name: "Menorca", city: "Mahón", country: "ES", lat: 39.8626, lng: 4.2186 },
  { iata: "LPA", name: "Gran Canaria", city: "Las Palmas", country: "ES", lat: 27.9319, lng: -15.3866 },
  { iata: "TFN", name: "Tenerife Norte-Ciudad de La Laguna", city: "Tenerife", country: "ES", lat: 28.4827, lng: -16.3415 },
  { iata: "TFS", name: "Tenerife Sur", city: "Tenerife", country: "ES", lat: 28.0445, lng: -16.5725 },
  { iata: "ACE", name: "César Manrique-Lanzarote", city: "Lanzarote", country: "ES", lat: 28.9455, lng: -13.6052 },
  { iata: "FUE", name: "Fuerteventura", city: "Fuerteventura", country: "ES", lat: 28.4527, lng: -13.8638 },
  { iata: "SPC", name: "La Palma", city: "La Palma", country: "ES", lat: 28.6265, lng: -17.7556 },
  // ── Portugal ──
  { iata: "LIS", name: "Humberto Delgado", city: "Lisboa", country: "PT", lat: 38.7756, lng: -9.1354 },
  { iata: "OPO", name: "Francisco Sá Carneiro", city: "Oporto", country: "PT", lat: 41.2481, lng: -8.6814 },
  { iata: "FAO", name: "Faro", city: "Faro", country: "PT", lat: 37.0144, lng: -7.9659 },
  // ── Reino Unido e Irlanda ──
  { iata: "LHR", name: "Heathrow", city: "Londres", country: "GB", lat: 51.47, lng: -0.4543 },
  { iata: "LGW", name: "Gatwick", city: "Londres", country: "GB", lat: 51.1537, lng: -0.1821 },
  { iata: "STN", name: "Stansted", city: "Londres", country: "GB", lat: 51.886, lng: 0.2389 },
  { iata: "LTN", name: "Luton", city: "Londres", country: "GB", lat: 51.8747, lng: -0.3683 },
  { iata: "LCY", name: "London City", city: "Londres", country: "GB", lat: 51.5053, lng: 0.0553 },
  { iata: "SEN", name: "Southend", city: "Londres", country: "GB", lat: 51.5714, lng: 0.6956 },
  { iata: "MAN", name: "Manchester", city: "Mánchester", country: "GB", lat: 53.3537, lng: -2.275 },
  { iata: "BHX", name: "Birmingham", city: "Birmingham", country: "GB", lat: 52.4539, lng: -1.748 },
  { iata: "BRS", name: "Bristol", city: "Bristol", country: "GB", lat: 51.3827, lng: -2.7191 },
  { iata: "LPL", name: "Liverpool John Lennon", city: "Liverpool", country: "GB", lat: 53.3336, lng: -2.8497 },
  { iata: "EDI", name: "Edimburgo", city: "Edimburgo", country: "GB", lat: 55.95, lng: -3.3725 },
  { iata: "GLA", name: "Glasgow", city: "Glasgow", country: "GB", lat: 55.8719, lng: -4.4331 },
  { iata: "DUB", name: "Dublín", city: "Dublín", country: "IE", lat: 53.4213, lng: -6.2701 },
  // ── Francia ──
  { iata: "CDG", name: "Charles de Gaulle", city: "París", country: "FR", lat: 49.0097, lng: 2.5479 },
  { iata: "ORY", name: "Orly", city: "París", country: "FR", lat: 48.7233, lng: 2.3794 },
  { iata: "BVA", name: "Beauvais-Tillé", city: "Beauvais", country: "FR", lat: 49.4544, lng: 2.1128 },
  { iata: "LYS", name: "Lyon-Saint Exupéry", city: "Lyon", country: "FR", lat: 45.7256, lng: 5.0811 },
  { iata: "MRS", name: "Marsella-Provenza", city: "Marsella", country: "FR", lat: 43.4393, lng: 5.2214 },
  { iata: "NCE", name: "Niza-Costa Azul", city: "Niza", country: "FR", lat: 43.6584, lng: 7.2159 },
  { iata: "TLS", name: "Toulouse-Blagnac", city: "Toulouse", country: "FR", lat: 43.6293, lng: 1.3638 },
  { iata: "BOD", name: "Burdeos-Mérignac", city: "Burdeos", country: "FR", lat: 44.8283, lng: -0.7156 },
  { iata: "NTE", name: "Nantes Atlantique", city: "Nantes", country: "FR", lat: 47.1532, lng: -1.6107 },
  { iata: "BIQ", name: "Biarritz-País Vasco", city: "Biarritz", country: "FR", lat: 43.4684, lng: -1.5233 },
  { iata: "PGF", name: "Perpiñán-Rivesaltes", city: "Perpiñán", country: "FR", lat: 42.7404, lng: 2.8707 },
  // ── Italia ──
  { iata: "FCO", name: "Leonardo da Vinci-Fiumicino", city: "Roma", country: "IT", lat: 41.8003, lng: 12.2389 },
  { iata: "CIA", name: "Ciampino", city: "Roma", country: "IT", lat: 41.7994, lng: 12.5949 },
  { iata: "MXP", name: "Malpensa", city: "Milán", country: "IT", lat: 45.6306, lng: 8.7281 },
  { iata: "LIN", name: "Linate", city: "Milán", country: "IT", lat: 45.4451, lng: 9.2767 },
  { iata: "BGY", name: "Orio al Serio", city: "Bérgamo", country: "IT", lat: 45.6739, lng: 9.7042 },
  { iata: "VCE", name: "Marco Polo", city: "Venecia", country: "IT", lat: 45.5053, lng: 12.3519 },
  { iata: "TSF", name: "Treviso", city: "Treviso", country: "IT", lat: 45.6484, lng: 12.1944 },
  { iata: "BLQ", name: "Guglielmo Marconi", city: "Bolonia", country: "IT", lat: 44.5354, lng: 11.2887 },
  { iata: "PSA", name: "Galileo Galilei", city: "Pisa", country: "IT", lat: 43.6839, lng: 10.3927 },
  { iata: "FLR", name: "Amerigo Vespucci", city: "Florencia", country: "IT", lat: 43.81, lng: 11.2051 },
  { iata: "TRN", name: "Turín-Caselle", city: "Turín", country: "IT", lat: 45.2008, lng: 7.6496 },
  { iata: "NAP", name: "Nápoles-Capodichino", city: "Nápoles", country: "IT", lat: 40.886, lng: 14.2908 },
  { iata: "CTA", name: "Catania-Fontanarossa", city: "Catania", country: "IT", lat: 37.4668, lng: 15.0664 },
  { iata: "PMO", name: "Palermo-Punta Raisi", city: "Palermo", country: "IT", lat: 38.176, lng: 13.091 },
  // ── Centro y norte de Europa ──
  { iata: "AMS", name: "Schiphol", city: "Ámsterdam", country: "NL", lat: 52.3105, lng: 4.7683 },
  { iata: "EIN", name: "Eindhoven", city: "Eindhoven", country: "NL", lat: 51.45, lng: 5.3745 },
  { iata: "RTM", name: "Rotterdam-La Haya", city: "Róterdam", country: "NL", lat: 51.9569, lng: 4.4372 },
  { iata: "BRU", name: "Bruselas", city: "Bruselas", country: "BE", lat: 50.9014, lng: 4.4844 },
  { iata: "CRL", name: "Bruselas-Charleroi", city: "Charleroi", country: "BE", lat: 50.4592, lng: 4.4538 },
  { iata: "FRA", name: "Fráncfort", city: "Fráncfort", country: "DE", lat: 50.0379, lng: 8.5622 },
  { iata: "HHN", name: "Fráncfort-Hahn", city: "Hahn", country: "DE", lat: 49.9487, lng: 7.2639 },
  { iata: "MUC", name: "Múnich", city: "Múnich", country: "DE", lat: 48.3537, lng: 11.775 },
  { iata: "BER", name: "Berlín Brandeburgo", city: "Berlín", country: "DE", lat: 52.3667, lng: 13.5033 },
  { iata: "DUS", name: "Düsseldorf", city: "Düsseldorf", country: "DE", lat: 51.2895, lng: 6.7668 },
  { iata: "CGN", name: "Colonia/Bonn", city: "Colonia", country: "DE", lat: 50.8659, lng: 7.1427 },
  { iata: "NRN", name: "Weeze", city: "Weeze", country: "DE", lat: 51.6024, lng: 6.1422 },
  { iata: "HAM", name: "Hamburgo", city: "Hamburgo", country: "DE", lat: 53.6304, lng: 9.9882 },
  { iata: "ZRH", name: "Zúrich", city: "Zúrich", country: "CH", lat: 47.4647, lng: 8.5492 },
  { iata: "GVA", name: "Ginebra", city: "Ginebra", country: "CH", lat: 46.2381, lng: 6.109 },
  { iata: "BSL", name: "EuroAirport Basilea-Mulhouse", city: "Basilea", country: "CH", lat: 47.5896, lng: 7.5299 },
  { iata: "VIE", name: "Viena-Schwechat", city: "Viena", country: "AT", lat: 48.1103, lng: 16.5697 },
  { iata: "BTS", name: "M. R. Štefánik", city: "Bratislava", country: "SK", lat: 48.1702, lng: 17.2127 },
  { iata: "PRG", name: "Václav Havel", city: "Praga", country: "CZ", lat: 50.1008, lng: 14.26 },
  { iata: "WAW", name: "Chopin", city: "Varsovia", country: "PL", lat: 52.1657, lng: 20.9671 },
  { iata: "WMI", name: "Varsovia-Modlin", city: "Modlin", country: "PL", lat: 52.4511, lng: 20.6518 },
  { iata: "BUD", name: "Ferenc Liszt", city: "Budapest", country: "HU", lat: 47.4369, lng: 19.2556 },
  { iata: "CPH", name: "Copenhague-Kastrup", city: "Copenhague", country: "DK", lat: 55.618, lng: 12.656 },
  { iata: "MMX", name: "Malmö", city: "Malmö", country: "SE", lat: 55.5363, lng: 13.3762 },
  { iata: "ARN", name: "Arlanda", city: "Estocolmo", country: "SE", lat: 59.6519, lng: 17.9186 },
  { iata: "BMA", name: "Bromma", city: "Estocolmo", country: "SE", lat: 59.3544, lng: 17.9416 },
  { iata: "NYO", name: "Skavsta", city: "Nyköping", country: "SE", lat: 58.7886, lng: 16.9122 },
  { iata: "OSL", name: "Gardermoen", city: "Oslo", country: "NO", lat: 60.1939, lng: 11.1004 },
  { iata: "TRF", name: "Sandefjord-Torp", city: "Sandefjord", country: "NO", lat: 59.1867, lng: 10.2586 },
  { iata: "HEL", name: "Helsinki-Vantaa", city: "Helsinki", country: "FI", lat: 60.3172, lng: 24.9633 },
  { iata: "ATH", name: "Eleftherios Venizelos", city: "Atenas", country: "GR", lat: 37.9364, lng: 23.9445 },
  { iata: "IST", name: "Estambul", city: "Estambul", country: "TR", lat: 41.2753, lng: 28.7519 },
  { iata: "SAW", name: "Sabiha Gökçen", city: "Estambul", country: "TR", lat: 40.8986, lng: 29.3092 },
  // ── Marruecos (rutas cortas desde España) ──
  { iata: "CMN", name: "Mohammed V", city: "Casablanca", country: "MA", lat: 33.3675, lng: -7.59 },
  { iata: "RAK", name: "Menara", city: "Marrakech", country: "MA", lat: 31.6069, lng: -8.0363 },
  { iata: "TNG", name: "Ibn Battouta", city: "Tánger", country: "MA", lat: 35.7269, lng: -5.9169 },
  // ── Nueva York (único grupo multi-aeropuerto relevante fuera de Europa) ──
  { iata: "JFK", name: "John F. Kennedy", city: "Nueva York", country: "US", lat: 40.6413, lng: -73.7781 },
  { iata: "EWR", name: "Newark Liberty", city: "Nueva York", country: "US", lat: 40.6895, lng: -74.1745 },
  { iata: "LGA", name: "LaGuardia", city: "Nueva York", country: "US", lat: 40.7769, lng: -73.874 },
];

export const AIRPORTS: Record<string, Airport> = Object.fromEntries(ROWS.map((a) => [a.iata, a]));

/** Aeropuerto → código de ciudad que lo engloba ("LGW" → "LON"). */
const METRO_OF: Record<string, string> = Object.fromEntries(
  Object.entries(METRO_GROUPS).flatMap(([metro, members]) => members.map((m) => [m, metro]))
);

/** Código de ciudad que cubre este aeropuerto, o null si no pertenece a ninguno. */
export function metroCodeFor(iata: string): string | null {
  return METRO_OF[iata.toUpperCase()] ?? null;
}

/** ¿Es un código de ciudad (LON/PAR/…) en lugar de un aeropuerto concreto? */
export function isMetroCode(code: string): boolean {
  return code.toUpperCase() in METRO_GROUPS;
}

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia ortodrómica en km entre dos puntos. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distancia entre dos IATA, o null si alguno no está en la tabla. */
export function distanceKm(from: string, to: string): number | null {
  const a = AIRPORTS[from.toUpperCase()];
  const b = AIRPORTS[to.toUpperCase()];
  return a && b ? haversineKm(a, b) : null;
}

export type NearbyAirport = { iata: string; distanceKm: number };

/**
 * Aeropuertos dentro del radio, del más cercano al más lejano. Excluye el propio
 * y los que ya cubre su código de ciudad (si LON entra como candidato, ofrecer
 * además LGW por separado es gastar una llamada en lo mismo).
 *
 * Devuelve [] para un IATA desconocido: sin dato no se inventa una alternativa.
 */
export function nearbyAirports(
  iata: string,
  opts: { radiusKm: number; max: number; excludeSameMetro?: boolean }
): NearbyAirport[] {
  const code = iata.toUpperCase();
  const origin = AIRPORTS[code];
  if (!origin || opts.max <= 0 || opts.radiusKm <= 0) return [];
  const ownMetro = METRO_OF[code];
  const out: NearbyAirport[] = [];
  for (const a of ROWS) {
    if (a.iata === code) continue;
    if (opts.excludeSameMetro !== false && ownMetro && METRO_OF[a.iata] === ownMetro) continue;
    const d = haversineKm(origin, a);
    if (d <= opts.radiusKm) out.push({ iata: a.iata, distanceKm: Math.round(d) });
  }
  // Orden por distancia y, a igual distancia, por IATA: el resultado no puede
  // depender del orden de la tabla (los tests y la semilla de exploración
  // dependen de que esto sea reproducible).
  out.sort((x, y) => x.distanceKm - y.distanceKm || x.iata.localeCompare(y.iata));
  return out.slice(0, opts.max);
}
