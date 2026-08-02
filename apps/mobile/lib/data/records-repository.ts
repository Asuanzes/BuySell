import { api } from "@/lib/api";
import type { BaseRecord, RecordListParams } from "@nidokey/shared";
import {
  propertyToRecord,
  rentalSearchItemToRecord,
  type RawPropertyListItem,
  type RawRentalSearchItem,
} from "@/lib/records/mappers";

/**
 * Repositorio de registros: ÚNICA puerta de entrada a los datos de records.
 *
 * Hoy traduce los endpoints existentes (/api/properties) al modelo
 * `BaseRecord`. Cuando el backend exponga /api/records (ya implementado pero
 * sin desplegar), solo cambia este archivo — ni la UI ni los hooks se tocan.
 *
 * Tipos aún no implementados (crypto, job…) devuelven [] de momento.
 */
export async function fetchRecords(params: RecordListParams = {}): Promise<BaseRecord[]> {
  const type = params.type ?? "property";

  if (type === "property") {
    const qs = params.query ? `?q=${encodeURIComponent(params.query)}` : "";
    const rows = await api<RawPropertyListItem[]>(`/api/properties${qs}`);
    return rows.map(propertyToRecord);
  }

  // Cripto (y futuros tipos): el backend ya devuelve BaseRecord[] desde
  // /api/records — no hace falta mapper de cliente. Requiere desplegar
  // /api/records + migración en producción para tener datos.
  if (type === "crypto" || type === "market" || type === "job" || type === "book" || type === "holiday") {
    return api<BaseRecord[]>(`/api/records?type=${type}`);
  }

  // Tipos reservados: sin backend todavía.
  return [];
}

/**
 * Borra un registro. Enruta por tipo:
 *  - property → DELETE /api/properties/:id (endpoint ya en producción).
 *  - resto    → DELETE /api/records/:id?type= (requiere el handler desplegado).
 * Cascada en BD (listings, snapshots, media) la hace el backend.
 */
export async function deleteRecord(record: BaseRecord): Promise<void> {
  if (record.type === "property") {
    await api(`/api/properties/${record.id}`, { method: "DELETE" });
    return;
  }
  await api(`/api/records/${record.id}?type=${record.type}`, { method: "DELETE" });
}

/**
 * Filtros del buscador de inmuebles. Espejo de los parámetros que acepta
 * `/api/rentals/search` (ver `src/lib/rentals/filters.ts`). Los precios van en
 * EUROS: el backend los convierte a céntimos.
 */
export type PropertySearchFilters = {
  operation: "RENT" | "SALE" | "ANY";
  q?: string;
  province?: string;
  city?: string;
  neighborhood?: string;
  types?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  minBaths?: number;
  minArea?: number;
  maxArea?: number;
  sort?: "recent" | "price_asc" | "price_desc" | "area_desc";
};

export type PropertySearchResult = {
  results: BaseRecord[];
  /** Total que casa con los filtros (sólo en la primera página). */
  total?: number;
  /** Provincia que el backend reconoció, o null si descartó la escrita. */
  resolvedProvince: string | null;
};

/**
 * Buscador de inmuebles con filtros. Devuelve el total además de los
 * resultados: sin él no se puede distinguir "no hay nada en esa zona" de
 * "estás filtrando demasiado", que es la diferencia entre un buscador honesto
 * y uno que parece roto.
 *
 * Fase 2: una sola página (el tope del endpoint). El cursor existe en el
 * backend y se cablea cuando haya corpus que lo justifique.
 */
export async function searchProperties(
  filters: PropertySearchFilters
): Promise<PropertySearchResult> {
  const sp = new URLSearchParams({ operation: filters.operation, limit: "50" });
  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      sp.set(key, `${value}`);
    }
  };
  put("q", filters.q?.trim());
  put("province", filters.province?.trim());
  put("city", filters.city?.trim());
  put("neighborhood", filters.neighborhood?.trim());
  put("minPrice", filters.minPrice);
  put("maxPrice", filters.maxPrice);
  put("minRooms", filters.minRooms);
  put("minBaths", filters.minBaths);
  put("minArea", filters.minArea);
  put("maxArea", filters.maxArea);
  put("sort", filters.sort);
  if (filters.types?.length) sp.set("type", filters.types.join(","));

  const data = await api<{
    results: RawRentalSearchItem[];
    total?: number;
    applied?: { province?: string | null };
  }>(`/api/rentals/search?${sp.toString()}`);

  return {
    results: (data.results ?? []).map(rentalSearchItemToRecord),
    total: data.total,
    resolvedProvince: data.applied?.province ?? null,
  };
}

/**
 * Búsqueda global de registros. Hoy consulta /api/search (solo inmuebles) y
 * mapea a BaseRecord. Devuelve [] para queries de menos de 2 caracteres.
 */
export async function searchRecords(query: string): Promise<BaseRecord[]> {
  if (query.trim().length < 2) return [];
  // Búsqueda UNIFICADA (propiedades + cripto + mercados): con scope=all el
  // backend ya devuelve BaseRecord[], sin mapper de cliente.
  const data = await api<{ results: BaseRecord[] }>(
    `/api/search?q=${encodeURIComponent(query)}&scope=all`
  );
  return data.results ?? [];
}
