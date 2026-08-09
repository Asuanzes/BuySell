/**
 * Enlaces de los mensajes del bot @Nidokey — FUENTE ÚNICA compartida entre el
 * prompt del agente (src/lib/chat/bot.ts), la linkificación del móvil
 * (apps/mobile/app/chat/[id].tsx) y los evals (scripts/bot-eval).
 *  - [[tipo:id|Título]]    → abre la ficha del registro (/tipo/id, owner-scoped)
 *  - [[ir:/ruta|Etiqueta]] → navega a una pantalla (lista blanca NAV_ALLOW)
 */

/** OJO: lleva flag /g (stateful) — clonar con `new RegExp(RECORD_LINK_RE)` antes de exec en bucle. */
export const RECORD_LINK_RE = /\[\[([a-z]+):([^\]|]+)\|([^\]]+)\]\]/g;

export const RECORD_ROUTES: Record<string, string> = {
  property: "property",
  crypto: "crypto",
  market: "market",
  job: "job",
  book: "book",
  holiday: "holiday",
  trends: "trends",
};

/**
 * Lista blanca de navegación: el bot solo debe usar estas rutas; validar en el
 * móvil evita empujar rutas arbitrarias o peligrosas desde un mensaje.
 */
export const NAV_ALLOW: ReadonlySet<string> = new Set([
  "/", "/search", "/importar", "/matches", "/account",
  "/theme-settings", "/category-settings",
  // Fase 0 food OFF (2026-08-09): rutas /food/* retiradas de la whitelist.
  "/chat/contacts", "/chat/new", "/chat/blocked",
  "/viajes/nuevo",
  "/tools/mortgage", "/tools/registro", "/tools/ine",
]);

/** Ruta destino de un token [[kind:target|label]], o null si no es válido. */
export function linkDest(kind: string, target: string): string | null {
  if (kind === "ir") return NAV_ALLOW.has(target) ? target : null;
  const route = RECORD_ROUTES[kind];
  return route ? `/${route}/${target}` : null;
}
