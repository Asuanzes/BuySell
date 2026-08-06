/**
 * Cliente HTTP al sidecar de scraping (scripts/scraper-service.mjs).
 *
 * El sidecar corre en un proceso aparte (npm run scraper) por dos motivos:
 *  1. Aisla Playwright del bundling de Next.js (que rompía la resolución de
 *     paths de los binarios nativos en Windows).
 *  2. Permite que la app móvil futura use el mismo servicio sin duplicar.
 *
 * Si el sidecar no está corriendo, devolvemos "error" y `loadPage` degrada
 * la respuesta a "blocked" con sugerencia de usar el userscript.
 */

const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://127.0.0.1:4201";
const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN ?? null;

export type BrowserFetchResult =
  | { kind: "ok"; html: string; status: number; finalUrl: string }
  | { kind: "gone"; status: number }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; error: string };

export async function browserFetchPage(url: string, timeoutMs = 30000): Promise<BrowserFetchResult> {
  try {
    const res = await fetch(`${SCRAPER_URL}/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SCRAPER_TOKEN ? { Authorization: `Bearer ${SCRAPER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ url, timeoutMs }),
      // El sidecar puede tardar ~3-10s en respuestas complejas
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        kind: "error",
        error: body.error ?? `Scraper sidecar HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      ok: boolean;
      html?: string;
      status?: number;
      finalUrl?: string;
      error?: string;
    };
    if (!data.ok || !data.html) {
      return { kind: "error", error: data.error ?? "Respuesta inválida del sidecar" };
    }
    const status = data.status ?? 200;
    if (status === 404 || status === 410) return { kind: "gone", status };
    if (status === 403 || status === 429) {
      return { kind: "blocked", reason: `Sidecar HTTP ${status}` };
    }
    if (status >= 400) return { kind: "error", error: `Sidecar HTTP ${status}` };

    // Heurística anti-bot sobre el HTML
    if (/cf-chl-bypass|just a moment|please verify you are human|datadome|captcha/i.test(data.html.slice(0, 5000))) {
      return { kind: "blocked", reason: "Anti-bot detectado en contenido (sidecar)" };
    }

    return { kind: "ok", html: data.html, status, finalUrl: data.finalUrl ?? url };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // ECONNREFUSED → el sidecar no está arrancado
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return { kind: "error", error: "Scraper sidecar no está arrancado (npm run scraper)" };
    }
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { kind: "error", error: "timeout" };
    }
    return { kind: "error", error: msg };
  }
}
