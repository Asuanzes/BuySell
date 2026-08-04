import type { Portal } from "@prisma/client";
import type * as cheerio from "cheerio";
import type { PortalAdapter, ScrapeContext, ScrapeOutcome } from "../types";
import { loadPage, parsePriceEur, readJsonLd, priceFromJsonLd } from "./_common";
import { isValidPriceEur, isValidMonthlyRentEur, isRentOperation } from "@nidokey/shared";

/**
 * Adaptador genérico para re-check server-side de portales sin anti-bot fuerte.
 *
 * Estrategia de precio (en orden de confianza):
 *   1. JSON-LD `offers.price` — dato estructurado canónico del anuncio.
 *   2. Selectores CSS específicos del portal (lo que el dev confió manualmente).
 *   3. ÚLTIMO recurso: regex sobre <body>, pero solo si los anteriores fallan
 *      y no hay precio previo (y solo en venta: en el body de un alquiler un
 *      número de 3 dígitos suelto es demasiado ambiguo).
 *
 * Si `previousPriceCents` está disponible, descartamos candidatos > 2x o < 0.5x
 * del anterior antes de elegir — esto evita coger precios de "anuncios
 * relacionados" o banners publicitarios que aparecen en la misma página.
 *
 * La banda de validez depende de la OPERACIÓN del anuncio: venta ≥ 10.000 €,
 * renta mensual 100–50.000 €. Sin esto, el recheck de un alquiler de 850 €
 * descartaba siempre el precio (isValidPriceEur exige ≥ 10.000 €) y el
 * seguimiento de rentas era un no-op silencioso.
 */

export type ExtractPriceOpts = {
  priceSelectors: string[];
  previousPriceCents?: number | null;
  operationType?: "SALE" | "RENT" | "RENT_TO_OWN";
};

/** Selección de precio PURA sobre un documento ya cargado (testeable con fixtures). */
export function extractPriceEur($: cheerio.CheerioAPI, opts: ExtractPriceOpts): number | null {
  const isRent = isRentOperation(opts.operationType);
  const validBand = isRent ? isValidMonthlyRentEur : isValidPriceEur;
  const prevEur = opts.previousPriceCents != null ? opts.previousPriceCents / 100 : null;

  // Si tenemos precio anterior, todo candidato debe estar dentro de ±50%
  // (rango común para variaciones reales: bajadas hasta -30%, subidas raras).
  function withinRange(p: number): boolean {
    if (!validBand(p)) return false;
    if (prevEur == null) return true;
    return p >= prevEur * 0.5 && p <= prevEur * 2;
  }

  // 1. JSON-LD primero. Si pasa el filtro, lo usamos sin más.
  const ldPrice = priceFromJsonLd(readJsonLd($));
  if (ldPrice != null && withinRange(ldPrice)) return ldPrice;

  // 2. Selectores específicos del portal.
  for (const sel of opts.priceSelectors) {
    let found: number | null = null;
    $(sel).each((_, el) => {
      if (found != null) return;
      const p = parsePriceEur($(el).text(), isRent ? 3 : 4);
      if (p != null && withinRange(p)) found = p;
    });
    if (found != null) return found;
  }

  // 3. Último recurso (solo VENTA y solo primera vez): si no había precio
  // anterior y los selectores fallaron, escaneamos <body> con regex y nos
  // quedamos con el primero válido. NO usamos Math.max porque la página tiene
  // muchos precios (relacionados, banners) que no son del anuncio.
  if (!isRent && prevEur == null) {
    const bodyText = $("body").text();
    const re = /(\d{1,3}(?:\.\d{3})+|\d{6,})\s*€/g;
    let m;
    while ((m = re.exec(bodyText)) !== null) {
      const p = parseInt(m[1].replace(/\./g, ""), 10);
      if (isValidPriceEur(p)) return p; // PRIMERO, no MAX
    }
  }

  return null;
}

export function makeGenericAdapter(opts: {
  portal: Portal;
  matches: (url: string) => boolean;
  priceSelectors: string[];
  externalIdFromUrl?: (url: string) => string | null;
}): PortalAdapter {
  return {
    portal: opts.portal,
    matches: opts.matches,
    async scrape(url, ctx?: ScrapeContext): Promise<ScrapeOutcome> {
      const page = await loadPage(url);
      if (page.kind !== "ok") return page;
      const { $ } = page;

      const priceEur = extractPriceEur($, {
        priceSelectors: opts.priceSelectors,
        previousPriceCents: ctx?.previousPriceCents,
        operationType: ctx?.operationType,
      });

      // Título (para debug)
      let title: string | null = null;
      for (const d of readJsonLd($)) {
        if (d && typeof d === "object" && "name" in d) {
          const n = (d as { name?: unknown }).name;
          if (typeof n === "string") { title = n; break; }
        }
      }
      if (!title) title = $("h1").first().text().trim() || null;

      return {
        kind: "ok",
        result: {
          portal: opts.portal,
          url,
          externalId: opts.externalIdFromUrl?.(url) ?? null,
          price: priceEur != null ? priceEur * 100 : null,
          status: "ACTIVE",
          title,
          observedAt: new Date(),
        },
      };
    },
  };
}
