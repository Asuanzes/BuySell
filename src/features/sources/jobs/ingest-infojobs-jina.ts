import { fetchPortalHtml } from "@/features/sources/jobs/fetch-portal-html";
import { resolveInfoJobsProvinceId } from "@/features/sources/jobs/province";
import { parseSalaryToCents, type InfoJobsSearchParams, type JobOffer } from "@/features/sources/jobs/types";

/**
 * Ingesta de ofertas de InfoJobs SIN Apify: se lee la página pública de
 * resultados a través de Jina Reader (`https://r.jina.ai/<url>`), un GET
 * gratuito y sin clave. Sustituye al actor de pago `alvaraaz/infojobs-actor`.
 *
 * Cómo funciona (medido contra la web real el 2026-07-28):
 *  - Se pide `x-return-format: html`. El markdown de Jina NO sirve: se come el
 *    título y el enlace de cada oferta.
 *  - La página trae DOS copias de los datos: 5 tarjetas renderizadas en
 *    servidor (el resto las pinta el cliente, y el tramo gratuito de Jina no
 *    ejecuta JS — `x-engine: browser` responde 401) y un **JSON embebido con
 *    las ~22 ofertas completas**. Se usa el JSON, y de las tarjetas solo se
 *    rescata el salario, que es lo único que el JSON no lleva.
 *
 * ⚠️ Trampa de la propia web: `/ofertas-trabajo/<kw>/en-<provincia>` parece la
 * URL buena para buscar por zona, pero **ignora la palabra clave** (devuelve
 * repartidores y vigilantes para "programador"). La única que respeta el
 * término es `list.xhtml?keyword=…&page=…`, que a su vez ignora la provincia.
 * Por eso la zona se prioriza en el adaptador, ordenando por `city`.
 */

/** Ofertas por página en el estado embebido (las tarjetas visibles son solo 5). */
const PER_PAGE = 20;

/**
 * Entidades con nombre que aparecen de verdad en InfoJobs. El HTML real mezcla
 * entidades y UTF-8 literal en el mismo documento (p. ej. `&nbsp;` junto a un
 * "€" tal cual), así que hay que decodificar sí o sí: sin esto, "Selecci&oacute;n"
 * llega con la entidad cruda al nombre de la empresa y `&euro;` impide detectar
 * el salario.
 */
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", euro: "€",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç", ordf: "ª", ordm: "º",
  laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", deg: "°",
};

/** Texto plano desde un fragmento HTML, con entidades resueltas. */
function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * URL de resultados: la de búsqueda, que respeta la palabra clave, admite
 * `page` y —con `provinceIds`— filtra por provincia de verdad.
 *
 * ⚠️ NO usar `/ofertas-trabajo/<kw>/en-<provincia>`: filtra la zona pero IGNORA
 * la palabra clave (comprobado — devuelve repartidores y vigilantes para
 * "programador"). Y `province=Madrid` en esta URL se ignora: el filtro solo
 * entiende el id numérico interno (ver `resolveInfoJobsProvinceId`).
 */
export function infoJobsSearchUrl(keywords: string, provinceId?: number, page = 1): string {
  const qs = new URLSearchParams({ keyword: keywords });
  if (provinceId) qs.set("provinceIds", String(provinceId));
  if (page > 1) qs.set("page", String(page));
  return `https://www.infojobs.net/jobsearch/search-results/list.xhtml?${qs}`;
}

/** Oferta tal y como viene en el estado embebido de InfoJobs. */
type RawOffer = {
  code?: string;
  title?: string;
  description?: string;
  city?: string;
  link?: string;
  contractType?: string;
  workday?: string;
  teleworking?: string;
  publishedAt?: string;
  companyName?: string;
  companyLogo?: string;
};

/**
 * Saca el array `offers` del estado que InfoJobs embebe en la página.
 *
 * La página trae DOS fuentes de lo mismo: 5 tarjetas renderizadas en servidor y
 * un JSON con las ~22 ofertas completas (con descripción y fecha ISO), pero
 * ESCAPADO dentro de una cadena JS. Se desescapa con un `JSON.parse` sobre la
 * cadena entrecomillada — así no hay que adivinar niveles de barras.
 * Devuelve [] si el formato cambia: quien llama cae a las tarjetas.
 */
export function extractOffersJson(html: string): RawOffer[] {
  const marker = '\\"offers\\":';
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const from = html.indexOf("[", at + marker.length);
  if (from < 0) return [];
  // Los corchetes no van escapados: se puede balancear sobre el texto crudo.
  let depth = 0;
  let end = -1;
  for (let i = from; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return [];
  try {
    const unescaped = JSON.parse(`"${html.slice(from, end)}"`) as string;
    const arr = JSON.parse(unescaped) as unknown;
    return Array.isArray(arr) ? (arr as RawOffer[]) : [];
  } catch {
    return [];
  }
}

/** Salario por oferta desde las 5 tarjetas renderizadas (el JSON no lo trae). */
function salaryByCode(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const card of html.split(/(?=<h2[^>]*id="job-title-)/).slice(1)) {
    const code = card.match(/id="job-title-([0-9a-zA-Z]+)"/)?.[1];
    if (!code) continue;
    const li = [...card.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => strip(m[1]));
    const salary = li.find((t) => t.includes("€"));
    if (salary) out.set(code, salary);
  }
  return out;
}

/**
 * Extrae las ofertas del HTML de una página de resultados. PURA: es lo que se
 * testea (el fetch a Jina no).
 *
 * Se prefiere el JSON embebido (~22 ofertas con descripción) y se le añade el
 * salario de las tarjetas, que es el único dato que el JSON no lleva.
 */
export function parseInfoJobsHtml(html: string, now = new Date()): JobOffer[] {
  const salaries = salaryByCode(html);
  const out: JobOffer[] = [];
  for (const o of extractOffersJson(html)) {
    const title = (o.title ?? "").trim();
    const link = (o.link ?? "").trim();
    if (!title || !link) continue; // sin título o sin enlace no es usable
    const salaryRaw = o.code ? salaries.get(o.code) : undefined;
    const { min, max } = parseSalaryToCents(salaryRaw);
    const published = o.publishedAt ? new Date(o.publishedAt) : undefined;
    out.push({
      platform: "infojobs",
      source: "jina",
      externalId: o.code,
      title,
      companyName: (o.companyName ?? "").trim(),
      location: o.city?.trim() || undefined,
      // "Híbrido" NO es teletrabajo: solo cuenta el remoto puro.
      remote: /solo teletrabaj|100% remoto|^teletrabajo$/i.test(o.teleworking ?? "") || undefined,
      description: o.description?.trim() || undefined,
      url: link.startsWith("http") ? link : `https:${link}`,
      salaryMin: min,
      salaryMax: max,
      currency: "EUR",
      contractType: o.contractType?.trim() || undefined,
      companyLogoUrl: o.companyLogo?.trim() || undefined,
      postedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
      scrapedAt: now,
      raw: { teleworking: o.teleworking, workday: o.workday, salaryRaw },
    });
  }
  return out;
}

// 2026-07-30: directo primero, Jina de respaldo (Cloudflare reta a Jina → 403).
const fetchPage = fetchPortalHtml;

/**
 * Ofertas de InfoJobs vía Jina. Firma compatible con la variante de Apify para
 * poder sustituirla sin tocar el adaptador.
 */
export async function ingestInfoJobsOffersJina(params: InfoJobsSearchParams): Promise<JobOffer[]> {
  const want = params.maxItems ?? 20;
  const pages = Math.min(3, Math.max(1, Math.ceil(want / PER_PAGE)));
  // La provincia se filtra EN LA URL: si se pide zona y no se resuelve, mejor
  // no devolver nada que devolver ofertas de la otra punta del país.
  const provinceId = resolveInfoJobsProvinceId(params.location);
  if (params.location?.trim() && !provinceId) return [];

  const htmls = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetchPage(infoJobsSearchUrl(params.keywords, provinceId, i + 1), 25_000).catch((e) => {
        console.error(`[jobs-jina] página ${i + 1} falló:`, e instanceof Error ? e.message : e);
        return "";
      })
    )
  );

  const seen = new Set<string>();
  const offers: JobOffer[] = [];
  for (const html of htmls) {
    if (!html) continue;
    for (const o of parseInfoJobsHtml(html)) {
      const key = o.externalId ?? o.url;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push(o);
    }
  }
  // Filtro de remoto: la web no lo aplica por URL, así que se hace aquí.
  const filtered = params.remote ? offers.filter((o) => o.remote) : offers;
  return filtered.slice(0, want);
}
