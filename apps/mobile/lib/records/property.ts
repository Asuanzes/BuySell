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
  /** Serie de precio (PriceSnapshot). `listing.operationType` separa venta/renta. */
  priceHistory: PriceHistoryPoint[];
};

/** Un punto del histórico de precio (PriceSnapshot). */
export type PriceHistoryPoint = {
  id: string;
  price: number;
  status: string;
  source: string;
  observedAt: string;
  listing: { operationType: string } | null;
};

export function fetchPropertyDetail(id: string): Promise<PropertyDetail> {
  return api<PropertyDetail>(`/api/properties/${id}`);
}

/* ─────────── Pantalla de decisión: comparativa de zona y chat ─────────── */

export type ZoneComparable = {
  id: string;
  title: string;
  type: string;
  city: string;
  neighborhood: string | null;
  status: string;
  /** Renta o precio de venta en céntimos según la operación de la ficha. */
  price: number | null;
  builtArea: number | null;
};

export type ZoneStats = {
  count: number;
  min: number;
  median: number;
  max: number;
  perSqm: { min: number; median: number; max: number } | null;
};

export type ZoneContext = {
  level: "city" | "city_type" | "city_neighborhood_type";
  scope: { city: string; neighborhood: string | null; type: string };
  coldStart: boolean;
  count: number;
  stats: ZoneStats | null;
  alternatives: ZoneComparable[];
};

export function fetchZoneContext(id: string): Promise<ZoneContext> {
  return api<ZoneContext>(`/api/properties/${id}/zone-context`);
}

export type RelatedChatMessage = {
  kind: string;
  body: string | null;
  senderName: string | null;
  createdAt: string;
};

export type RelatedChat = {
  conversationId: string;
  kind: string; // "DIRECT" | "GROUP" | ...
  title: string;
  imageUrl: string | null;
  lastMessage: RelatedChatMessage | null;
  lastMessageAt: string | null;
};

export type RelatedChatsResponse = { chats: RelatedChat[] };

export function fetchRelatedChats(id: string): Promise<RelatedChatsResponse> {
  return api<RelatedChatsResponse>(`/api/properties/${id}/related-chats`);
}
