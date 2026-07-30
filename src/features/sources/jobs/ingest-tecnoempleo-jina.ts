import { fetchPortalHtml } from "@/features/sources/jobs/fetch-portal-html";
import { resolveTecnoempleoProvinceId } from "@/features/sources/jobs/province";
import { parseSalaryToCents, type JobSearchParams, type JobOffer } from "@/features/sources/jobs/types";

/**
 * Ingesta de ofertas de TECNOEMPLEO vía Jina Reader — gratis y sin clave, igual
 * que InfoJobs. Es la segunda fuente de la búsqueda multiportal: portal español
 * especializado en informática y telecomunicaciones, así que complementa a
 * InfoJobs en vez de repetirlo.
 *
 * Ventajas frente a InfoJobs (medido el 2026-07-28):
 *  - **30 ofertas por página** ya renderizadas en servidor (InfoJobs sirve 5
 *    tarjetas y hay que sacar el resto de un JSON escondido).
 *  - Su buscador **publica la tabla de provincias** en el `<select>` del HTML,
 *    así que los ids no hubo que adivinarlos.
 *  - Los filtros funcionan de verdad y son verificables: el `<title>` de la
 *    página responde "181 Ofertas Trabajo de programador en Álava".
 *
 * Parámetros de su buscador: `te` (texto), `pr` (provincia, entre comas:
 * `,232,`), `en_remoto`, `pagina`.
 */

/** Ofertas renderizadas por página. */
const PER_PAGE = 30;

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", euro: "€",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", ordf: "ª", ordm: "º", hellip: "…", ndash: "–", mdash: "—",
};

function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export function tecnoempleoSearchUrl(keywords: string, provinceId?: number, remote?: boolean, page = 1): string {
  const qs = new URLSearchParams();
  if (keywords.trim()) qs.set("te", keywords.trim());
  // Su formato es una lista entre comas, no un número suelto.
  if (provinceId) qs.set("pr", `,${provinceId},`);
  if (remote) qs.set("en_remoto", "1");
  if (page > 1) qs.set("pagina", String(page));
  return `https://www.tecnoempleo.com/ofertas-trabajo/?${qs}`;
}

/** "28/07/2026" → Date (UTC). undefined si no cuadra. */
export function parseEsDate(raw?: string): Date | undefined {
  const m = raw?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Extrae las ofertas del HTML de una página de resultados. PURA: es lo que se
 * testea (el fetch a Jina no).
 *
 * Cada tarjeta empieza con `<a name="rf-<id>">` y lleva:
 *   <h3><a href="<url>">TÍTULO</a></h3>
 *   <a title="Ofertas de Empleo <EMPRESA>" …>EMPRESA</a>
 *   <b>CIUDAD</b> (MODALIDAD) - DD/MM/YYYY
 * más una descripción recortada y etiquetas de tecnología.
 */
export function parseTecnoempleoHtml(html: string, now = new Date()): JobOffer[] {
  const out: JobOffer[] = [];
  for (const card of html.split(/(?=<a name="rf-)/).slice(1)) {
    const externalId = card.match(/name="(rf-[0-9a-zA-Z]+)"/)?.[1];
    const url = card.match(/href="(https:\/\/www\.tecnoempleo\.com\/[^"]*\/rf-[0-9a-zA-Z]+)"/)?.[1];
    const title = strip(card.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "");
    if (!title || !url) continue;

    const company = strip(card.match(/title="Ofertas de Empleo ([^"]+)"/)?.[1] ?? "");
    // <b>Madrid</b> (Híbrido) - 28/07/2026
    // "Madrid (Híbrido) - 28/07/2026", pero si la oferta es totalmente remota
    // el portal escribe "100% remoto" EN EL HUECO DE LA CIUDAD, sin paréntesis.
    const head = card.match(/<b>([^<]{2,60})<\/b>\s*(?:\(([^)]{2,40})\))?\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    const location = head ? strip(head[1]) : undefined;
    const modality = head?.[2] ? strip(head[2]) : undefined;
    const REMOTO = /100% remoto|teletrabajo|remoto total/i;

    const text = strip(card);
    const salaryRaw = text.match(/[\d.]{4,9}\s*€(?:\s*-\s*[\d.]{4,9}\s*€)?/)?.[0];
    const { min, max } = parseSalaryToCents(salaryRaw);
    const skills = [...card.matchAll(/badge bg-gray-500[^>]*>([^<]{2,30})</g)].map((m) => strip(m[1]));

    out.push({
      platform: "tecnoempleo",
      source: "jina",
      externalId,
      title,
      companyName: company,
      location,
      // "100% remoto" sí; "Híbrido" no (criterio igual que en InfoJobs). Se
      // mira también la ciudad porque ahí es donde acaba el remoto puro.
      remote: REMOTO.test(modality ?? "") || REMOTO.test(location ?? "") || undefined,
      description: undefined, // la lista solo trae un recorte con "..."
      url,
      salaryMin: min,
      salaryMax: max,
      currency: "EUR",
      contractType: undefined,
      sector: skills.length ? skills.join(", ") : undefined,
      companyLogoUrl: card.match(/data-src="(https:\/\/www\.tecnoempleo\.com\/logotipos\/[^"]+)"/)?.[1],
      postedAt: parseEsDate(head?.[3]),
      scrapedAt: now,
      raw: { modality, salaryRaw, skills },
    });
  }
  return out;
}

async function fetchPage(url: string, timeoutMs: number): Promise<string> {
  // 2026-07-30: directo primero, Jina de respaldo (Cloudflare reta a Jina → 403).
  return fetchPortalHtml(url, timeoutMs);
}

/** Ofertas de Tecnoempleo vía Jina. Misma firma que las demás ingestas. */
export async function ingestTecnoempleoOffers(params: JobSearchParams): Promise<JobOffer[]> {
  const want = params.maxItems ?? 20;
  const provinceId = resolveTecnoempleoProvinceId(params.location);
  // Misma regla que InfoJobs: zona pedida y no reconocida → nada, en vez de
  // devolver ofertas de la otra punta del país.
  if (params.location?.trim() && !provinceId) return [];

  const pages = Math.min(2, Math.max(1, Math.ceil(want / PER_PAGE)));
  const htmls = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetchPage(tecnoempleoSearchUrl(params.keywords, provinceId, params.remote, i + 1), 25_000).catch((e) => {
        console.error(`[jobs-tecnoempleo] página ${i + 1} falló:`, e instanceof Error ? e.message : e);
        return "";
      })
    )
  );

  const seen = new Set<string>();
  const offers: JobOffer[] = [];
  for (const html of htmls) {
    if (!html) continue;
    for (const o of parseTecnoempleoHtml(html)) {
      const key = o.externalId ?? o.url;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(o);
    }
  }
  return offers.slice(0, want);
}
