import type {
  FetchOutcome,
  NormalizedRecord,
  SearchHit,
  SearchOpts,
  SourceAdapter,
  SourceInput,
} from "@/features/sources/types";
import { ingestInfoJobsOffersJina } from "@/features/sources/jobs/ingest-infojobs-jina";
import { ingestTecnoempleoOffers } from "@/features/sources/jobs/ingest-tecnoempleo-jina";
import { normLocation } from "@/features/sources/jobs/province";
import { jobOfferToNormalized, type JobOffer } from "@/features/sources/jobs/types";

/**
 * Adaptador de EMPLEO. Encaja en el framework como cripto/mercado:
 *  - `search(query)` consulta la fuente UNA vez y devuelve candidatos con su
 *    `record` ya normalizado embebido,
 *  - al elegir uno, el móvil importa con `kind:"record"` → se guarda tal cual
 *    SIN volver a consultar la fuente.
 *
 * FUENTES, todas **gratis y sin clave** vía Jina Reader:
 *  - **InfoJobs** (`ingest-infojobs-jina.ts`) — generalista, ~20 por búsqueda.
 *  - **Tecnoempleo** (`ingest-tecnoempleo-jina.ts`) — informática y telecos,
 *    30 por página.
 * Se consultan EN PARALELO y se intercalan: el valor del producto es ver los
 * dos portales de una vez, no repetir uno.
 *
 * Retiradas el 2026-07-28 al dar de baja Apify, y sin alternativa gratuita:
 *  - **LinkedIn**: Jina bloquea el acceso anónimo al dominio por abuso
 *    (`AbuseAlleviationError` 403, con caducidad y reaparición). Funciona a
 *    ratos, que para una búsqueda de usuario es lo mismo que no funcionar.
 *  - **Indeed**: por Jina devuelve una cáscara sin ofertas (anti-bot), y su
 *    actor era el único que corría sin tope de gasto.
 * `JobPlatform` conserva sus valores para los registros ya guardados.
 *
 * `fetch({kind:"query"})` existe por si se importa la primera coincidencia sin
 * elegir (no lo usa el flujo del móvil).
 */
const SOURCE = "jobs";

function platformLabel(p: JobOffer["platform"]): string {
  if (p === "infojobs") return "InfoJobs";
  if (p === "tecnoempleo") return "Tecnoempleo";
  if (p === "linkedin") return "LinkedIn";
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
    const base = { keywords: query, location: opts?.location, remote: opts?.remote, maxItems: 20 };
    // Que una fuente caiga no debe dejar la búsqueda vacía: cada una se rescata
    // por separado y la otra sigue dando resultados.
    const fail = (src: string) => (e: unknown) => {
      console.error(`[jobs] ${src} falló:`, e instanceof Error ? e.message : e);
      return [] as JobOffer[];
    };
    const [infojobs, tecnoempleo] = await Promise.all([
      ingestInfoJobsOffersJina(base).catch(fail("infojobs")),
      ingestTecnoempleoOffers(base).catch(fail("tecnoempleo")),
    ]);

    // Intercalado 1:1 para que ambos portales se vean arriba, no uno detrás del
    // otro (con 20+30 ofertas, concatenar escondería Tecnoempleo entero).
    const offers: JobOffer[] = [];
    for (let i = 0; i < Math.max(infojobs.length, tecnoempleo.length); i++) {
      if (infojobs[i]) offers.push(infojobs[i]);
      if (tecnoempleo[i]) offers.push(tecnoempleo[i]);
    }

    const seen = new Set<string>();
    const deduped = offers.filter((o) => {
      const k = o.url || `${o.platform}:${o.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // La PROVINCIA ya viene filtrada en la URL de cada portal. Aquí solo se sube
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
