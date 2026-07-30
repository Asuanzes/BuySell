import type { Portal, ListingStatus } from "@prisma/client";

export type ScrapeResult = {
  portal: Portal;
  url: string;
  externalId?: string | null;
  price?: number | null; // céntimos
  status: ListingStatus;
  title?: string | null;
  observedAt: Date;
  raw?: unknown;
};

export type ScrapeOutcome =
  | { kind: "ok"; result: ScrapeResult }
  | { kind: "gone"; reason: string } // 404, "anuncio retirado" detectado en HTML
  | { kind: "blocked"; reason: string } // anti-bot, 403, captcha, CSP
  | { kind: "error"; error: string }; // cualquier otra

export type ScrapeContext = {
  /** Precio en céntimos guardado en BBDD para este Listing, si lo había. */
  previousPriceCents?: number | null;
  /**
   * Operación del anuncio: decide la banda de validación del precio.
   * RENT usa la banda de renta mensual (100–50.000 €); SALE y RENT_TO_OWN la
   * de venta (≥ 10.000 €). Sin ella, una renta de 850 € se descartaba siempre.
   */
  operationType?: "SALE" | "RENT" | "RENT_TO_OWN";
};

export interface PortalAdapter {
  portal: Portal;
  /** ¿Este adaptador soporta scrape server-side de esta URL? */
  matches(url: string): boolean;
  /** ¿El portal tiene anti-bot fuerte? Si true, el cron lo marca como "manual" en vez de intentarlo. */
  readonly manualOnly?: boolean;
  /** Implementación real. Devuelve outcome (no lanza). */
  scrape(url: string, ctx?: ScrapeContext): Promise<ScrapeOutcome>;
}
