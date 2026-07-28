import type {
  FetchOutcome,
  NormalizedRecord,
  SearchHit,
  SearchOpts,
  SourceAdapter,
  SourceInput,
} from "@/features/sources/types";
import { hasApifyToken } from "@/features/sources/providers/apify";
import { ingestInfoJobsOffers } from "@/features/sources/jobs/ingest-infojobs";
import { ingestInfoJobsOffersJina } from "@/features/sources/jobs/ingest-infojobs-jina";
import { ingestLinkedInOffers } from "@/features/sources/jobs/ingest-linkedin";
import { ingestIndeedOffers } from "@/features/sources/jobs/ingest-indeed";
import { isProvinceName, normLocation } from "@/features/sources/jobs/province";
import { jobOfferToNormalized, type JobOffer } from "@/features/sources/jobs/types";

/**
 * Adaptador de EMPLEO. Encaja en el framework como cripto/mercado, con un matiz
 * de coste: parte de las fuentes cuestan dinero. Por eso:
 *  - `search(query)` consulta las fuentes UNA vez y devuelve candidatos con su
 *    `record` ya normalizado embebido,
 *  - al elegir uno, el móvil importa con `kind:"record"` → se guarda tal cual
 *    SIN volver a consultar la fuente (coste 0 al elegir).
 *
 * FUENTES (2026-07-28, tras dar de baja el plan de Apify):
 *  - **InfoJobs → Jina Reader, GRATIS y sin clave** (`ingest-infojobs-jina.ts`).
 *    Es la fuente por defecto y la única que funciona siempre. Trae 5 ofertas
 *    por página (InfoJobs solo renderiza eso en servidor); sin provincia se
 *    paginan hasta 20.
 *  - **LinkedIn e Indeed → actores de Apify, DE PAGO**: solo se consultan si hay
 *    `APIFY_TOKEN`. Sin token se omiten en silencio, que es correcto porque
 *    InfoJobs sigue devolviendo resultados.
 *
 * `fetch({kind:"query"})` existe por si se importa la primera coincidencia sin
 * elegir (no lo usa el flujo del móvil).
 */
const SOURCE = "jobs";

/** InfoJobs sin coste; Apify solo si hay token (LinkedIn/Indeed no tienen alternativa). */
function infoJobs(params: Parameters<typeof ingestInfoJobsOffersJina>[0]) {
  return process.env.JOBS_INFOJOBS_APIFY === "1" && hasApifyToken()
    ? ingestInfoJobsOffers(params)
    : ingestInfoJobsOffersJina(params);
}

function platformLabel(p: JobOffer["platform"]): string {
  if (p === "linkedin") return "LinkedIn";
  if (p === "infojobs") return "InfoJobs";
  if (p === "indeed") return "Indeed";
  return "";
}

/** Fuentes de empleo disponibles, en orden de intercalado (InfoJobs primero). */
const ALL_SOURCES = ["infojobs", "linkedin", "indeed"] as const;
type JobSource = (typeof ALL_SOURCES)[number];

function wantedSources(sources?: string[]): Set<JobSource> {
  const sel = (sources ?? []).filter((s): s is JobSource =>
    (ALL_SOURCES as readonly string[]).includes(s)
  );
  // Sin selección válida → todas (comportamiento por defecto).
  return new Set(sel.length > 0 ? sel : ALL_SOURCES);
}

/** Candidato para el buscador: muestra título/empresa/plataforma/ubicación y lleva el record. */
function hitFor(o: JobOffer): SearchHit {
  return {
    symbol: "", // empleo no se re-fetchea por símbolo; los datos van en `record`
    name: o.title,
    exchange: [o.companyName, platformLabel(o.platform)].filter(Boolean).join(" · ") || null,
    type: o.location ?? null,
    record: jobOfferToNormalized(o),
  };
}

export const apifyJobsAdapter: SourceAdapter = {
  type: "job",
  source: SOURCE,

  identify(input: SourceInput): boolean {
    return input.kind === "query";
  },

  async fetch(input: SourceInput): Promise<FetchOutcome> {
    if (input.kind !== "query") {
      return { kind: "error", error: "Empleo requiere una búsqueda (palabras clave)" };
    }
    try {
      const offers = await infoJobs({ keywords: input.query, maxItems: 5 });
      const first = offers[0];
      if (!first) return { kind: "gone", reason: `Sin ofertas para "${input.query}"` };
      return { kind: "ok", record: jobOfferToNormalized(first) as NormalizedRecord };
    } catch (e) {
      return { kind: "error", error: e instanceof Error ? e.message : String(e) };
    }
  },

  async search(query: string, opts?: SearchOpts): Promise<SearchHit[]> {
    const base = { keywords: query, location: opts?.location, remote: opts?.remote };
    const want = wantedSources(opts?.sources);
    // InfoJobs necesita palabra clave (sin ella devuelve 0); LinkedIn e Indeed sí
    // buscan solo por zona. Cada fuente solo se ejecuta si está elegida → coste 0
    // por las no seleccionadas.
    const hasKeyword = query.trim().length >= 2;
    const none = Promise.resolve([] as JobOffer[]);
    // LinkedIn e Indeed son actores de Apify (de pago): sin token ni se intentan.
    const paid = hasApifyToken();
    const fail = (src: string) => (e: unknown) => {
      console.error(`[jobs] ${src} falló:`, e instanceof Error ? e.message : e);
      return [] as JobOffer[];
    };
    const [infojobs, linkedin, indeed] = await Promise.all([
      want.has("infojobs") && hasKeyword
        ? infoJobs({ ...base, maxItems: 20 }).catch(fail("infojobs"))
        : none,
      want.has("linkedin") && paid
        ? ingestLinkedInOffers({ ...base, maxItems: 15 }).catch(fail("linkedin"))
        : none,
      want.has("indeed") && paid
        ? ingestIndeedOffers({ ...base, maxItems: 15 }).catch(fail("indeed"))
        : none,
    ]);
    // Intercala (InfoJobs, LinkedIn, Indeed) para que se vean todas arriba; dedup.
    const merged: JobOffer[] = [];
    const max = Math.max(infojobs.length, linkedin.length, indeed.length);
    for (let i = 0; i < max; i++) {
      if (infojobs[i]) merged.push(infojobs[i]);
      if (linkedin[i]) merged.push(linkedin[i]);
      if (indeed[i]) merged.push(indeed[i]);
    }
    const seen = new Set<string>();
    const deduped = merged.filter((o) => {
      const k = o.url || `${o.platform}:${o.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Búsqueda por ciudad concreta: InfoJobs busca por PROVINCIA y LinkedIn por
    // geo amplia, así que aquí se prioriza la ciudad — ordenando, no filtrando.
    // Antes se descartaba todo lo que no fuera de la ciudad, y con InfoJobs vía
    // Jina (5 ofertas por página, no 20 como el actor de pago) eso dejaba la
    // pantalla en una sola oferta. Ahora la ciudad va primero y el resto de la
    // provincia detrás: nada se pierde y lo relevante manda.
    const loc = opts?.location?.trim();
    let result = deduped;
    if (loc && !isProvinceName(loc)) {
      const term = normLocation(loc.split(",")[0]);
      if (term) {
        const inCity = (o: JobOffer) => normLocation(o.location ?? "").includes(term);
        result = [...deduped.filter(inCity), ...deduped.filter((o) => !inCity(o))];
      }
    }
    return result.slice(0, 30).map(hitFor);
  },
};
