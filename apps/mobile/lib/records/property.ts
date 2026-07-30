import { api } from "@/lib/api";

/**
 * Dominio "property": tipos de detalle y fetchers específicos.
 * La capa de presentación (pantalla de detalle) importa de aquí en vez de
 * declarar el tipo inline y llamar a `api()` directamente.
 */
export type PropertyDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  operationType: string; // "SALE" | "RENT" | "RENT_TO_OWN"
  currentPrice: number | null;
  monthlyRent: number | null;
  deposit: number | null;
  minStayMonths: number | null;
  maxStayMonths: number | null;
  availableFrom: string | null;
  utilitiesIncluded: boolean | null;
  furnished: string | null; // "UNFURNISHED" | "SEMI" | "FURNISHED"
  petsAllowed: boolean | null;
  contractType: string | null; // "RESIDENTIAL" | "SEASONAL" | "ROOM" | "COMMERCIAL"
  address: string | null;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  rooms: number | null;
  bathrooms: number | null;
  builtArea: number | null;
  usableArea: number | null;
  plotArea: number | null;
  floor: string | null;
  yearBuilt: number | null;
  hasElevator: boolean | null;
  hasGarage: boolean | null;
  hasStorage: boolean | null;
  hasTerrace: boolean | null;
  hasFireplace: boolean | null;
  hasGarden: boolean | null;
  hasPool: boolean | null;
  energyRating: string;
  cadastralRef: string | null;
  /** Datos catastrales persistidos (legado o schema 1); parsear con parseCadastralData. */
  cadastralData: unknown;
  tags: string[];
  media: { id: string; kind: string; url: string }[];
  listings: {
    id: string;
    portal: string;
    operationType: string;
    url: string;
    status: string; // ACTIVE | PRICE_DROP | PRICE_UP | SOLD | REMOVED | UNKNOWN
    lastPrice: number | null;
    lastSeenAt: string | null;
    lastCheckedAt: string | null;
    /** "ok" | "gone" | "blocked" | "error" | "manual" | null (aún sin comprobar). */
    lastCheckResult?: string | null;
    lastCheckDetail?: string | null;
  }[];
};

export function fetchPropertyDetail(id: string): Promise<PropertyDetail> {
  return api<PropertyDetail>(`/api/properties/${id}`);
}
