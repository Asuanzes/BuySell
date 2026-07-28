import type { NormalizedRecord } from "@/features/sources/types";
import { resolveInfoJobsProvince } from "@/features/sources/jobs/province";

/**
 * Modelo interno de OFERTA DE EMPLEO (DTO) para Nidokey.
 *
 * Es el resultado normalizado de cualquier actor de Apify (InfoJobs, LinkedIn…).
 * Se diseña para mapear sin fricción a `NormalizedRecord` (el DTO universal del
 * framework de fuentes) vía `jobOfferToNormalized`, de modo que cuando exista la
 * tabla Prisma `JobListing` + `upsertJob`, la persistencia sea inmediata.
 *
 * Importes monetarios SIEMPRE en céntimos (como el resto del proyecto).
 */
export type JobPlatform = "infojobs" | "linkedin" | "indeed" | "other";

export interface JobOffer {
  externalId?: string; // id en la plataforma
  platform: JobPlatform;
  /** De dónde salió el dato: "jina" (gratis) o "apify" (actor de pago). */
  source?: string;
  title: string;
  companyName: string;
  location?: string;
  remote?: boolean;
  description?: string;
  url: string;
  applyUrl?: string;
  salaryMin?: number; // céntimos
  salaryMax?: number; // céntimos
  currency?: string; // "EUR"
  contractType?: string; // jornada/contrato (full-time, indefinido…)
  experienceLevel?: string;
  sector?: string;
  companyLogoUrl?: string;
  postedAt?: Date;
  scrapedAt: Date;
  raw?: Record<string, unknown>; // item original del actor (debug)
}

/** Parámetros de búsqueda comunes a las plataformas. */
export interface JobSearchParams {
  keywords: string;
  location?: string;
  remote?: boolean;
  /** Tope de resultados (y de coste). Default 25 en el provider. */
  maxItems?: number;
  /**
   * Escotilla de escape: input EXACTO del actor (pestaña "Input" del actor en
   * Apify). Si se pasa, se usa tal cual en vez del que construye la ingesta.
   * Útil porque cada actor tiene su propio esquema de input.
   */
  actorInput?: Record<string, unknown>;
}

export type InfoJobsSearchParams = JobSearchParams;
export type LinkedInSearchParams = JobSearchParams & {
  /** Filtro temporal de LinkedIn: "r86400" (24h), "r604800" (semana), etc. */
  datePosted?: string;
};
export type IndeedSearchParams = JobSearchParams & {
  /** País Indeed (ISO 3166-1 alpha-2; default "es"). Cubre 50+ países. */
  country?: string;
  /** Días desde publicación: "1", "3", "7", "14" (default "7"). */
  datePosted?: string;
};

/**
 * Extrae salario (en céntimos) de un texto libre tipo "20.000€ - 25.000€
 * Bruto/año". Los puntos son separador de millares (es-ES). No anualiza
 * mensuales (POC): guarda los importes tal cual y deja el original en meta.
 */
export function parseSalaryToCents(raw?: string | null): { min?: number; max?: number } {
  if (!raw) return {};
  const nums = (raw.match(/\d{1,3}(?:\.\d{3})+|\d{4,7}/g) ?? [])
    .map((s) => Number(s.replace(/\./g, "")))
    .filter((n) => Number.isFinite(n) && n >= 1000 && n <= 1_000_000);
  if (nums.length === 0) return {};
  const min = Math.min(...nums) * 100;
  const max = Math.max(...nums) * 100;
  return min === max ? { min } : { min, max };
}

/** Subtítulo "Empresa · Ubicación" (lo que ve la lista de la app). */
function subtitleFor(o: JobOffer): string | null {
  return [o.companyName, o.location].filter(Boolean).join(" · ") || null;
}

/** Salario legible, p.ej. "28.000–35.000 €" (entrada en céntimos). */
export function salaryLabel(o: JobOffer): string | null {
  const cur = !o.currency || o.currency === "EUR" ? "€" : o.currency;
  const fmt = (c: number) => Math.round(c / 100).toLocaleString("es-ES");
  if (o.salaryMin != null && o.salaryMax != null && o.salaryMax !== o.salaryMin) {
    return `${fmt(o.salaryMin)}–${fmt(o.salaryMax)} ${cur}`;
  }
  const one = o.salaryMin ?? o.salaryMax;
  return one != null ? `${fmt(one)} ${cur}` : null;
}

/**
 * Mapea una JobOffer al DTO universal del framework (`NormalizedRecord`) para
 * que `upsertRecord` la persista SIN reescribir nada cuando exista la tabla
 * `JobListing`. Hoy solo lo usa `saveJobOffers()` (esqueleto). El salario va en
 * `currentValue` (céntimos); el resto, específico de empleo, vive en `meta`.
 */
export function jobOfferToNormalized(o: JobOffer): NormalizedRecord {
  const footnote =
    [o.contractType, o.remote ? "Remoto" : null, salaryLabel(o)]
      .filter(Boolean)
      .join(" · ") || null;
  return {
    recordType: "job",
    title: o.title,
    subtitle: subtitleFor(o),
    status: "OPEN",
    currentValue: o.salaryMin ?? o.salaryMax ?? null, // céntimos
    currency: o.currency ?? "EUR",
    imageUrl: o.companyLogoUrl ?? null,
    source: o.source ?? "apify",
    externalId: o.externalId ?? o.url,
    observedAt: o.scrapedAt,
    meta: {
      platform: o.platform,
      company: o.companyName,
      location: o.location ?? null,
      remote: o.remote ?? null,
      url: o.url,
      applyUrl: o.applyUrl ?? null,
      contractType: o.contractType ?? null,
      experienceLevel: o.experienceLevel ?? null,
      sector: o.sector ?? null,
      salaryMin: o.salaryMin ?? null,
      salaryMax: o.salaryMax ?? null,
      salaryLabel: salaryLabel(o),
      description: o.description ?? null, // para la ficha propia (sin redirigir)
      // Provincia (resuelta desde la ciudad del empleo) → imagen de su capital en
      // la ficha, aunque el empleo sea de otra ciudad de la misma provincia.
      province: resolveInfoJobsProvince(o.location) ?? null,
      postedAt: o.postedAt ? o.postedAt.toISOString() : null,
      footnote,
    },
  };
}
