import * as cheerio from "cheerio";
import type { ScrapeOutcome } from "../types";
import { fetchPage } from "../http";
import { browserFetchPage } from "../browser-fetch";

/**
 * Estrategia escalonada:
 *  1. Intenta `fetchPage` simple (fetch HTTP+headers realistas). Rápido (~200ms).
 *  2. Si vuelve `blocked`, escalamos a `browserFetchPage` (Playwright Chromium
 *     con stealth). Más lento (~3s) pero pasa Cloudflare y la mayoría de
 *     fingerprinting básico.
 *
 * NO escalamos a Playwright en GONE o ERROR — esos no se arreglan con browser.
 *
 * Se puede desactivar el fallback con env BUYSELL_DISABLE_BROWSER_FETCH=1.
 */
export async function loadPage(url: string): Promise<
  | { kind: "ok"; $: cheerio.CheerioAPI; html: string; finalUrl: string }
  | Exclude<ScrapeOutcome, { kind: "ok" }>
> {
  const r = await fetchPage(url);

  // Si bloqueado y tenemos browser fallback, intentamos con Playwright.
  // Si Playwright falla (no instalado, error de launch en el entorno actual,
  // etc.), degradamos a "blocked" para que la UI sugiera usar el userscript.
  // NUNCA propagamos el error técnico de Playwright al usuario.
  let result = r;
  if (r.kind === "blocked" && process.env.BUYSELL_DISABLE_BROWSER_FETCH !== "1") {
    try {
      const r2 = await browserFetchPage(url);
      if (r2.kind === "ok") result = r2;
      else if (r2.kind === "gone") result = { kind: "gone", status: r2.status };
      else if (r2.kind === "blocked") result = { kind: "blocked", status: 403, reason: r2.reason };
      else {
        console.warn(`[scraping] browser fetch failed for ${url}: ${r2.error}. Degrading to manual-only.`);
        result = { kind: "blocked", status: 403, reason: "Server scrape no disponible — usa el userscript en el navegador" };
      }
    } catch (e) {
      console.warn(`[scraping] browser fetch threw for ${url}:`, (e as Error).message);
      result = { kind: "blocked", status: 403, reason: "Server scrape no disponible — usa el userscript en el navegador" };
    }
  }

  if (result.kind === "gone") return { kind: "gone", reason: `HTTP ${result.status}` };
  if (result.kind === "blocked") return { kind: "blocked", reason: result.reason };
  if (result.kind === "error") return { kind: "error", error: result.error };

  const $ = cheerio.load(result.html);
  // Heurística genérica: si el body es muy pequeño o solo dice "no disponible"
  const bodyText = $("body").text().slice(0, 500).toLowerCase();
  if (
    /anuncio (?:retirado|no disponible|caducado)|no longer available|propiedad vendida|inmueble vendido/i.test(
      bodyText
    )
  ) {
    return { kind: "gone", reason: "Texto 'retirado/vendido' detectado" };
  }
  return { kind: "ok", $, html: result.html, finalUrl: result.finalUrl };
}

export function intFrom(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = s.replace(/[\.\s]/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Extrae el precio en EUROS (entero) de un texto tipo "270.000 €".
 * Devuelve null si no detecta.
 *
 * `minPlainDigits`: mínimo de dígitos para un número SIN puntos de millar.
 * Venta usa 4 (evita ruido tipo "3 €"); alquiler necesita 3 ("850 €/mes").
 */
export function parsePriceEur(s: string | null | undefined, minPlainDigits: 3 | 4 = 4): number | null {
  if (!s) return null;
  const re = minPlainDigits === 3 ? /(\d{1,3}(?:\.\d{3})+|\d{3,})\s*€/ : /(\d{1,3}(?:\.\d{3})+|\d{4,})\s*€/;
  const m = s.replace(/\s/g, "").match(re);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ""), 10);
}

/**
 * Lee JSON-LD del documento.
 */
export function readJsonLd($: cheerio.CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).text();
      if (!txt) return;
      const d = JSON.parse(txt);
      if (Array.isArray(d)) out.push(...d);
      else out.push(d);
    } catch {
      // skip
    }
  });
  return out;
}

export function priceFromJsonLd(jsonLd: unknown[]): number | null {
  for (const d of jsonLd) {
    if (!d || typeof d !== "object") continue;
    const obj = d as { offers?: { price?: number | string; lowPrice?: number | string } };
    const p = obj.offers?.price ?? obj.offers?.lowPrice;
    if (p != null) {
      const n = typeof p === "number" ? p : parseFloat(String(p));
      if (Number.isFinite(n)) return Math.round(n);
    }
  }
  return null;
}
