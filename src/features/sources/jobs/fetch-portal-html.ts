/**
 * Fetch del HTML de un portal de empleo: DIRECTO primero, Jina de respaldo.
 *
 * 2026-07-30: Cloudflare empezó a servir su challenge ("Just a moment…") a las
 * IPs de Jina Reader en InfoJobs Y Tecnoempleo → 403 → cero resultados en toda
 * búsqueda no-remota. El GET directo con cabeceras de navegador responde 200
 * con el contenido completo, así que se invierte el orden: directo primero y
 * Jina solo como respaldo (por si algún día es Vercel a quien retan).
 */

const JINA = "https://r.jina.ai/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** Challenge de Cloudflare u otro interstitial: el body no es la página real. */
function looksBlocked(html: string): boolean {
  const head = html.slice(0, 3000);
  return head.includes("Just a moment") || head.includes("cf-chl") || head.includes("challenge-platform");
}

export async function fetchPortalHtml(url: string, timeoutMs: number): Promise<string> {
  // 1. Directo con pinta de navegador.
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "es-ES,es;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const html = await res.text();
      if (!looksBlocked(html)) return html;
    }
  } catch {
    // caemos a Jina
  }
  // 2. Respaldo: Jina Reader en modo HTML (el markdown se come título y enlace).
  const res = await fetch(`${JINA}${url}`, {
    headers: { "User-Agent": UA, "x-return-format": "html" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
  const html = await res.text();
  if (looksBlocked(html)) throw new Error("Portal bloqueado (challenge) en directo y vía Jina");
  return html;
}
