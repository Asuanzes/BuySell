/**
 * Resolución de ubicación para empleo.
 *
 * El actor de InfoJobs (alvaraaz) valida `location` contra un ENUM de provincias
 * españolas (valores exactos abajo): si le pasas una ciudad ("Vitoria") devuelve
 * 400 y la búsqueda sale vacía. Aquí mapeamos lo que escribe el usuario
 * (ciudad o provincia, con o sin acentos) a la provincia canónica válida; si no
 * se reconoce, se omite el filtro (búsqueda nacional) en vez de fallar.
 *
 * LinkedIn (valig) acepta texto libre, pero sin país geolocaliza mal
 * ("Vitoria" → Brasil); por eso `withCountry` añade ", Spain".
 */

/** Provincias EXACTAS que acepta el actor de InfoJobs. */
const INFOJOBS_PROVINCES = [
  "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila",
  "Badajoz", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón",
  "Ceuta", "Ciudad Real", "Córdoba", "Cuenca", "Gerona", "Granada", "Guadalajara",
  "Guipúzcoa", "Huelva", "Huesca", "Islas Baleares", "Jaén", "La Rioja",
  "Las Palmas", "León", "Lérida", "Lugo", "Madrid", "Málaga", "Melilla", "Murcia",
  "Navarra", "Orense", "Palencia", "Pontevedra", "Salamanca", "Segovia", "Sevilla",
  "Soria", "Tarragona", "Tenerife", "Teruel", "Toledo", "Valencia", "Valladolid",
  "Vizcaya", "Zamora", "Zaragoza",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PROVINCE_BY_NORM = new Map(INFOJOBS_PROVINCES.map((p) => [norm(p), p]));

/** Ciudades/alias frecuentes (normalizados) → provincia canónica de InfoJobs. */
const CITY_TO_PROVINCE: Record<string, string> = {
  "vitoria": "Álava", "vitoria gasteiz": "Álava", "gasteiz": "Álava",
  "bilbao": "Vizcaya", "barakaldo": "Vizcaya", "getxo": "Vizcaya", "bizkaia": "Vizcaya",
  "san sebastian": "Guipúzcoa", "donostia": "Guipúzcoa", "irun": "Guipúzcoa", "gipuzkoa": "Guipúzcoa",
  "araba": "Álava",
  "gijon": "Asturias", "oviedo": "Asturias", "aviles": "Asturias",
  "santander": "Cantabria", "torrelavega": "Cantabria",
  "logroño": "La Rioja", "logrono": "La Rioja", "rioja": "La Rioja",
  "pamplona": "Navarra", "iruña": "Navarra", "iruna": "Navarra", "nafarroa": "Navarra",
  "vigo": "Pontevedra",
  "coruña": "A Coruña", "la coruña": "A Coruña", "santiago": "A Coruña", "santiago de compostela": "A Coruña", "ferrol": "A Coruña",
  "ourense": "Orense",
  "girona": "Gerona", "lleida": "Lérida",
  "palma": "Islas Baleares", "palma de mallorca": "Islas Baleares", "mallorca": "Islas Baleares", "menorca": "Islas Baleares", "ibiza": "Islas Baleares", "baleares": "Islas Baleares", "illes balears": "Islas Baleares",
  "santa cruz de tenerife": "Tenerife", "la laguna": "Tenerife",
  "las palmas de gran canaria": "Las Palmas", "gran canaria": "Las Palmas", "telde": "Las Palmas",
  "marbella": "Málaga", "fuengirola": "Málaga", "torremolinos": "Málaga",
  "jerez": "Cádiz", "jerez de la frontera": "Cádiz", "algeciras": "Cádiz",
  "elche": "Alicante", "benidorm": "Alicante", "torrevieja": "Alicante", "alacant": "Alicante",
  "cartagena": "Murcia", "lorca": "Murcia",
  "hospitalet": "Barcelona", "l hospitalet": "Barcelona", "badalona": "Barcelona", "terrassa": "Barcelona", "sabadell": "Barcelona", "mataro": "Barcelona",
  "mostoles": "Madrid", "alcala de henares": "Madrid", "fuenlabrada": "Madrid", "leganes": "Madrid", "getafe": "Madrid", "alcorcon": "Madrid",
  "gandia": "Valencia", "torrent": "Valencia",
  "dos hermanas": "Sevilla",
  "merida": "Badajoz",
  "reus": "Tarragona",
  "castello de la plana": "Castellón",
  "castellon de la plana": "Castellón",
  "castello": "Castellón",
  "a coruna": "A Coruña",
};

/**
 * Devuelve la provincia canónica de InfoJobs para lo que escriba el usuario, o
 * `undefined` si no se reconoce (→ búsqueda nacional, sin filtro de zona).
 */
export function resolveInfoJobsProvince(input?: string): string | undefined {
  if (!input) return undefined;
  // Prueba la cadena completa y cada parte separada por comas: LinkedIn da
  // "Bilbao, Basque Country, Spain"; InfoJobs da "Vitoria-Gasteiz".
  for (const part of [input, ...input.split(",")]) {
    const n = norm(part);
    if (!n) continue;
    const hit = PROVINCE_BY_NORM.get(n) ?? CITY_TO_PROVINCE[n];
    if (hit) return hit;
  }
  return undefined;
}

/**
 * `provinceIds` de InfoJobs para su buscador (`list.xhtml?keyword=…&provinceIds=N`).
 *
 * NO se puede derivar del orden alfabético de la lista de arriba (ahí A Coruña
 * va primera y en InfoJobs es la 28). La tabla se obtuvo **sondeando la web**:
 * una búsqueda por cada id y anotando la ciudad dominante de los resultados
 * (2026-07-28). Sin esto, una búsqueda "en Vitoria" devolvía ofertas de Madrid
 * y Palma, porque la única URL que respeta la palabra clave ignora la provincia
 * salvo por este parámetro.
 */
const PROVINCE_ID: Record<string, number> = {
  "Álava": 2, "Albacete": 3, "Alicante": 4, "Almería": 5, "Asturias": 6,
  "Ávila": 7, "Badajoz": 8, "Barcelona": 9, "Burgos": 10, "Cáceres": 11,
  "Cádiz": 12, "Cantabria": 13, "Castellón": 14, "Ceuta": 15, "Ciudad Real": 16,
  "Córdoba": 17, "Cuenca": 18, "Gerona": 19, "Las Palmas": 20, "Granada": 21,
  "Guadalajara": 22, "Guipúzcoa": 23, "Huelva": 24, "Huesca": 25,
  "Islas Baleares": 26, "Jaén": 27, "A Coruña": 28, "La Rioja": 29, "León": 30,
  "Lérida": 31, "Lugo": 32, "Madrid": 33, "Málaga": 34, "Melilla": 35,
  "Murcia": 36, "Navarra": 37, "Orense": 38, "Palencia": 39, "Pontevedra": 40,
  "Salamanca": 41, "Segovia": 42, "Sevilla": 43, "Soria": 44, "Tarragona": 45,
  "Tenerife": 46, "Teruel": 47, "Toledo": 48, "Valencia": 49, "Valladolid": 50,
  "Vizcaya": 51, "Zamora": 52, "Zaragoza": 53,
};

/** Id de provincia de InfoJobs para lo que escriba el usuario, o undefined. */
export function resolveInfoJobsProvinceId(input?: string): number | undefined {
  const province = resolveInfoJobsProvince(input);
  return province ? PROVINCE_ID[province] : undefined;
}

/**
 * Ids de provincia de TECNOEMPLEO (`?pr=,<id>,`). A diferencia de los de
 * InfoJobs, estos NO hubo que sondearlos: su buscador publica el `<select>` de
 * provincias en el propio HTML. Se indexan por el nombre canónico de arriba,
 * que en varios casos difiere del suyo (Vizcaya/Bizkaia, Gerona/Girona,
 * Lérida/Lleida, Orense/Ourense, Guipúzcoa/Gipuzkoa, Tenerife/Sta. Cruz…).
 */
const TECNOEMPLEO_PROVINCE_ID: Record<string, number> = {
  "A Coruña": 231, "Álava": 232, "Albacete": 233, "Alicante": 234, "Almería": 235,
  "Asturias": 236, "Ávila": 237, "Badajoz": 238, "Islas Baleares": 239,
  "Barcelona": 240, "Vizcaya": 241, "Burgos": 242, "Cáceres": 243, "Cádiz": 244,
  "Cantabria": 245, "Castellón": 246, "Ceuta": 247, "Ciudad Real": 248,
  "Córdoba": 249, "Cuenca": 250, "Guipúzcoa": 251, "Gerona": 252, "Granada": 253,
  "Guadalajara": 254, "Huelva": 255, "Huesca": 256, "Jaén": 257, "La Rioja": 258,
  "Las Palmas": 259, "León": 260, "Lugo": 261, "Lérida": 262, "Madrid": 263,
  "Málaga": 264, "Melilla": 265, "Murcia": 266, "Navarra": 267, "Orense": 268,
  "Palencia": 269, "Pontevedra": 270, "Salamanca": 271, "Tenerife": 272,
  "Segovia": 273, "Sevilla": 274, "Soria": 275, "Tarragona": 276, "Teruel": 277,
  "Toledo": 278, "Valencia": 279, "Valladolid": 280, "Zamora": 281, "Zaragoza": 282,
};

/** Id de provincia de Tecnoempleo para lo que escriba el usuario, o undefined. */
export function resolveTecnoempleoProvinceId(input?: string): number | undefined {
  const province = resolveInfoJobsProvince(input);
  return province ? TECNOEMPLEO_PROVINCE_ID[province] : undefined;
}

/** Normaliza una ubicación (sin acentos/guiones, minúsculas) para comparar. */
export function normLocation(s: string): string {
  return norm(s);
}

/** ¿El texto es el NOMBRE de una provincia entera (no una ciudad concreta)? */
export function isProvinceName(input: string): boolean {
  return PROVINCE_BY_NORM.has(norm(input));
}

/** Añade ", Spain" a una ubicación libre (LinkedIn) si no menciona país. */
export function withCountry(loc?: string): string {
  const l = (loc ?? "").trim();
  if (!l) return "";
  return /\b(spain|espa[ñn]a)\b/i.test(l) ? l : `${l}, Spain`;
}
