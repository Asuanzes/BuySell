/**
 * Fontanería del DETALLE DE RESULTADO DE BÚSQUEDA (`app/listing/preview.tsx`).
 *
 * Dos cosas, las dos fuera de React a propósito:
 *
 *  1. El contrato de parámetros de navegación entre la lista de resultados y el
 *     detalle. Expo Router sólo transporta cadenas, así que los números viajan
 *     serializados y hay que volver a parsearlos con cuidado: un `Number("")`
 *     es 0, no `null`, y un 0 en el precio pinta "0 €" donde debería no pintar
 *     nada.
 *
 *  2. Qué anuncios ya están guardados como registro. El emisor (el detalle, que
 *     es una ruta del Stack raíz) y el consumidor (la lista, que sigue montada
 *     debajo) son pantallas distintas, así que hace falta un canal entre ellas.
 *     Mismo patrón que `dup-signal.ts`: pub/sub de módulo, sin dependencias.
 *
 * La clave del conjunto es la URL del anuncio TAL CUAL. No se normaliza y no
 * hace falta: los extractores devuelven en `ExtractedPayload.url` la misma URL
 * que se les pasó (`portal-extractors.ts` la interpola literal, no lee
 * `location.href`), y ésa es exactamente la que el servidor guarda en
 * `Listing.url`, que es `@unique`.
 */

import { isPortalUrl } from "./portal-url";
import type { PortalHit, PortalKey } from "./portal-search";

export type PreviewOperation = "RENT" | "SALE";

/** Lo que la lista sabe del anuncio antes de abrirlo: pinta el detalle al
 *  instante mientras el WebView extrae la ficha completa. */
export type PreviewSeed = {
  url: string;
  title: string;
  price: number | null;
  rooms: number | null;
  area: number | null;
  imageUrl: string | null;
  portal: PortalKey;
  operation: PreviewOperation;
};

/** Params de ruta (todo cadenas: es lo único que transporta Expo Router). */
export type PreviewParams = Record<string, string>;

export function buildPreviewParams(hit: PortalHit, operation: PreviewOperation): PreviewParams {
  return {
    url: hit.url,
    title: hit.title ?? "",
    price: hit.price != null ? String(hit.price) : "",
    rooms: hit.rooms != null ? String(hit.rooms) : "",
    area: hit.area != null ? String(hit.area) : "",
    imageUrl: hit.imageUrl ?? "",
    portal: hit.portal,
    operation,
  };
}

/** `"12"` → 12; `""`, `"abc"` y `undefined` → null (nunca 0). */
function num(value: unknown): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Params → semilla, o `null` si no hay un anuncio de portal que enseñar.
 *
 * El guard de `isPortalUrl` NO es cosmético: la pantalla carga esta URL en un
 * WebView con cookies compartidas e inyecta el extractor. Como es una ruta
 * navegable, un deep link `nidokey://listing/preview?url=…` la alcanza desde
 * fuera de la app. Es el mismo guard que ya aplica Importar antes de extraer.
 */
export function parsePreviewParams(params: Record<string, unknown>): PreviewSeed | null {
  const url = str(params.url);
  if (!url || !isPortalUrl(url)) return null;
  const portal = str(params.portal);
  return {
    url,
    title: str(params.title),
    price: num(params.price),
    rooms: num(params.rooms),
    area: num(params.area),
    imageUrl: str(params.imageUrl) || null,
    portal: (portal || "IDEALISTA") as PortalKey,
    operation: str(params.operation) === "SALE" ? "SALE" : "RENT",
  };
}

// ── Anuncios ya guardados ───────────────────────────────────────────────────

const saved = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

/** Tras añadirlo (o al descubrir que ya estaba), para que la fila lo refleje. */
export function markListingSaved(url: string): void {
  if (!url || saved.has(url)) return;
  saved.add(url);
  version++;
  listeners.forEach((l) => l());
}

/**
 * Snapshot para `useSyncExternalStore`. Tiene que ser un primitivo estable —
 * devolver el `Set` haría que React lo viera cambiado en cada render y entrara
 * en bucle.
 */
export function savedListingsVersion(): number {
  return version;
}

export function isListingSaved(url: string): boolean {
  return saved.has(url);
}

/** Suscripción cruda; el hook de React vive en la pantalla que la consume. */
export function subscribeSavedListings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sólo para las pruebas: el estado de módulo sobrevive entre casos. */
export function resetSavedListings(): void {
  saved.clear();
  version = 0;
}
