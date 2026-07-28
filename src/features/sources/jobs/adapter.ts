import type {
  FetchOutcome,
  NormalizedRecord,
  SearchHit,
  SearchOpts,
  SourceAdapter,
  SourceInput,
} from "@/features/sources/types";
import { ingestInfoJobsOffersJina } from "@/features/sources/jobs/ingest-infojobs-jina";
import { normLocation } from "@/features/sources/jobs/province";
import { jobOfferToNormalized, type JobOffer } from "@/features/sources/jobs/types";

/**
 * Adaptador de EMPLEO. Encaja en el framework como cripto/mercado:
 *  - `search(query)` consulta la fuente UNA vez y devuelve candidatos con su
 *    `record` ya normalizado embebido,
 *  - al elegir uno, el móvil importa con `kind:"record"` → se guarda tal cual
 *    SIN volver a consultar la fuente.
 *
 * FUENTE ÚNICA: **InfoJobs vía Jina Reader**, gratis y sin clave
 * (`ingest-infojobs-jina.ts`). El 2026-07-28 se quitaron las de pago:
 *  - **LinkedIn**: su actor de Apify costaba dinero, y la alternativa gratuita
 *    NO es viable — Jina bloquea el acceso anónimo a linkedin.com por abuso
 *    (`AbuseAlleviationError` 403, con caducidad y reaparición). Funciona a
 *    ratos, que para una búsqueda de usuario es lo mismo que no funcionar.
 *  - **Indeed**: su actor era el único sin tope de gasto por ejecución, y por
 *    Jina devuelve una cáscara sin ofertas (protección anti-bot).
 * Los registros ya guardados de esas plataformas se siguen mostrando bien: el
 * tipo `JobPlatform` conserva sus valores.
 *
 * `fetch({kind:"query"})` existe por si se importa la primera coincidencia sin
 * elegir (no lo usa el flujo del móvil).
 */
const SOURCE = "jobs";

function platformLabel(p: JobOffer["platform"]): string {
  if (p === "linkedin") return "LinkedIn";
  if (p === "infojobs") return "InfoJobs";
  if (p === "indeed") return "Indeed";
  return "";
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
      const offers = await ingestInfoJobsOffersJina({ keywords: input.query, maxItems: 5 });
      const first = offers[0];
      if (!first) return { kind: "gone", reason: `Sin ofertas para "${input.query}"` };
      return { kind: "ok", record: jobOfferToNormalized(first) as NormalizedRecord };
    } catch (e) {
      return { kind: "error", error: e instanceof Error ? e.message : String(e) };
    }
  },

  async search(query: string, opts?: SearchOpts): Promise<SearchHit[]> {
    const offers = await ingestInfoJobsOffersJina({
      keywords: query,
      location: opts?.location,
      remote: opts?.remote,
      maxItems: 20,
    }).catch((e) => {
      console.error("[jobs] infojobs falló:", e instanceof Error ? e.message : e);
      return [] as JobOffer[];
    });

    const seen = new Set<string>();
    const deduped = offers.filter((o) => {
      const k = o.url || `${o.platform}:${o.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // La PROVINCIA ya viene filtrada por la URL de InfoJobs. Aquí solo se sube
    // la ciudad pedida al principio (ordenar, no descartar): dentro de Álava,
    // primero Vitoria y luego el resto de la provincia.
    const loc = opts?.location?.trim();
    let result = deduped;
    if (loc) {
      const term = normLocation(loc.split(",")[0]);
      if (term) {
        const inCity = (o: JobOffer) => normLocation(o.location ?? "").includes(term);
        result = [...deduped.filter(inCity), ...deduped.filter((o) => !inCity(o))];
      }
    }
    return result.slice(0, 30).map(hitFor);
  },
};
