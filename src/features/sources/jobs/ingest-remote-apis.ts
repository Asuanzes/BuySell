import type { JobOffer, JobSearchParams } from "@/features/sources/jobs/types";

/**
 * Ofertas de EMPLEO REMOTO INTERNACIONAL desde seis APIs abiertas — todas
 * gratis, sin clave y con JSON de verdad (nada de scraping). Se enrutan SOLO
 * cuando el usuario marca "solo remoto": son bolsas internacionales (casi todo
 * en inglés) y meterlas en una búsqueda "programador en Vitoria" sería ruido.
 *
 * Capacidades REALES de cada una (sondeadas el 2026-07-28, no de memoria):
 *
 * | API       | Búsqueda en servidor            | Filtrado aquí               |
 * | --------- | ------------------------------- | --------------------------- |
 * | Remotive  | `?search=` (laxa: descripción)  | re-filtro por palabra       |
 * | Jobicy    | `?tag=` + `?geo=europe` ✔       | —                           |
 * | Arbeitnow | `?search=` existe pero NO acota | filtro por palabra          |
 * | RemoteOK  | ninguna (últimas ~100)          | filtro por palabra          |
 * | Himalayas | `?keyword=` NO filtra           | filtro por palabra          |
 * | The Muse  | `?category=` (sin keyword)      | filtro por palabra          |
 *
 * El filtro local mira título + etiquetas + descripción. OJO idioma: estas
 * bolsas están en inglés — "programador" casará poco; "react", "python" o
 * "designer" casan bien. Es una limitación honesta, no un bug.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0";
const TIMEOUT_MS = 15_000;
/** Tope por API: seis fuentes × 8 ya son 48 candidatos, de sobra. */
const PER_API = 8;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Texto plano y en minúsculas para casar palabras clave. */
function plain(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();
}

/** ¿La oferta menciona TODAS las palabras de la búsqueda? (título/tags/descripción) */
export function matchesKeyword(o: JobOffer, keywords: string): boolean {
  const words = keywords.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return true;
  const hay = plain(`${o.title} ${o.sector ?? ""} ${o.description ?? ""}`);
  return words.every((w) => hay.includes(w));
}

/** Salario anual → céntimos; descarta ceros y basura. */
function cents(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1000 && v <= 1_000_000 ? Math.round(v) * 100 : undefined;
}

function when(raw: unknown): Date | undefined {
  if (raw == null) return undefined;
  const d = typeof raw === "number" ? new Date(raw * 1000) : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Recorta la descripción: estas APIs mandan HTML kilométrico. */
function excerpt(html: unknown, max = 600): string | undefined {
  const t = String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
}

type Raw = Record<string, unknown>;
const rows = (v: unknown, key?: string): Raw[] => {
  const arr = key ? (v as Raw)?.[key] : v;
  return Array.isArray(arr) ? (arr as Raw[]) : [];
};

// ─── Normalizadores (PUROS: son lo que se testea) ───

export function normalizeRemotive(r: Raw, now: Date): JobOffer {
  return {
    platform: "remotive",
    source: "api",
    externalId: r.id != null ? `remotive:${r.id}` : undefined,
    title: String(r.title ?? "").trim(),
    companyName: String(r.company_name ?? "").trim(),
    location: String(r.candidate_required_location ?? "").trim() || "Remote",
    remote: true,
    description: excerpt(r.description),
    url: String(r.url ?? ""),
    // Remotive da el salario como texto libre ("$60k-80k"): no se parsea.
    currency: "EUR",
    sector: Array.isArray(r.tags) ? r.tags.join(", ") : undefined,
    companyLogoUrl: String(r.company_logo_url ?? r.company_logo ?? "") || undefined,
    postedAt: when(r.publication_date),
    scrapedAt: now,
  };
}

export function normalizeJobicy(r: Raw, now: Date): JobOffer {
  const cur = String(r.salaryCurrency ?? "USD");
  return {
    platform: "jobicy",
    source: "api",
    externalId: r.id != null ? `jobicy:${r.id}` : undefined,
    title: String(r.jobTitle ?? "").trim(),
    companyName: String(r.companyName ?? "").trim(),
    location: String(r.jobGeo ?? "").trim() || "Remote",
    remote: true,
    description: excerpt(r.jobExcerpt ?? r.jobDescription),
    url: String(r.url ?? ""),
    salaryMin: cents(r.salaryMin),
    salaryMax: cents(r.salaryMax),
    currency: cur,
    sector: Array.isArray(r.jobIndustry) ? r.jobIndustry.join(", ") : String(r.jobIndustry ?? "") || undefined,
    companyLogoUrl: String(r.companyLogo ?? "") || undefined,
    postedAt: when(r.pubDate),
    scrapedAt: now,
  };
}

export function normalizeArbeitnow(r: Raw, now: Date): JobOffer {
  return {
    platform: "arbeitnow",
    source: "api",
    externalId: r.slug ? `arbeitnow:${r.slug}` : undefined,
    title: String(r.title ?? "").trim(),
    companyName: String(r.company_name ?? "").trim(),
    location: String(r.location ?? "").trim() || "Remote",
    // Arbeitnow mezcla presencial alemán con remoto: su campo manda.
    remote: r.remote === true || undefined,
    description: excerpt(r.description),
    url: String(r.url ?? ""),
    currency: "EUR",
    sector: Array.isArray(r.tags) ? r.tags.join(", ") : undefined,
    postedAt: when(r.created_at),
    scrapedAt: now,
  };
}

export function normalizeRemoteOk(r: Raw, now: Date): JobOffer {
  return {
    platform: "remoteok",
    source: "api",
    externalId: r.id != null ? `remoteok:${r.id}` : undefined,
    title: String(r.position ?? "").trim(),
    companyName: String(r.company ?? "").trim(),
    location: String(r.location ?? "").trim() || "Remote",
    remote: true,
    description: excerpt(r.description),
    url: String(r.url ?? ""),
    salaryMin: cents(r.salary_min),
    salaryMax: cents(r.salary_max),
    currency: "USD",
    sector: Array.isArray(r.tags) ? r.tags.join(", ") : undefined,
    companyLogoUrl: String(r.company_logo ?? r.logo ?? "") || undefined,
    postedAt: when(r.epoch),
    scrapedAt: now,
  };
}

export function normalizeHimalayas(r: Raw, now: Date): JobOffer {
  const locs = Array.isArray(r.locationRestrictions) ? r.locationRestrictions.join(", ") : "";
  return {
    platform: "himalayas",
    source: "api",
    externalId: r.guid ? `himalayas:${r.guid}` : undefined,
    title: String(r.title ?? "").trim(),
    companyName: String(r.companyName ?? "").trim(),
    location: locs || "Remote",
    remote: true,
    description: excerpt(r.excerpt ?? r.description),
    url: String(r.applicationLink ?? r.guid ?? "") || "",
    salaryMin: cents(r.minSalary),
    salaryMax: cents(r.maxSalary),
    currency: String(r.currency ?? "USD"),
    sector: Array.isArray(r.categories) ? r.categories.join(", ") : undefined,
    companyLogoUrl: String(r.companyLogo ?? "") || undefined,
    postedAt: when(r.pubDate),
    scrapedAt: now,
  };
}

export function normalizeTheMuse(r: Raw, now: Date): JobOffer {
  const company = (r.company as Raw | undefined)?.name;
  const locations = rows(r.locations).map((l) => String(l.name ?? "")).filter(Boolean);
  const refs = r.refs as Raw | undefined;
  return {
    platform: "themuse",
    source: "api",
    externalId: r.id != null ? `themuse:${r.id}` : undefined,
    title: String(r.name ?? "").trim(),
    companyName: String(company ?? "").trim(),
    location: locations.join(", ") || "Remote",
    remote: locations.some((l) => /flexible|remote/i.test(l)) || undefined,
    description: excerpt(r.contents),
    url: String(refs?.landing_page ?? ""),
    currency: "USD",
    sector: rows(r.categories).map((c) => String(c.name ?? "")).filter(Boolean).join(", ") || undefined,
    postedAt: when(r.publication_date),
    scrapedAt: now,
  };
}

// ─── Fetchers ───

async function fromRemotive(kw: string, now: Date): Promise<JobOffer[]> {
  const qs = kw ? `?search=${encodeURIComponent(kw)}&limit=30` : "?limit=30";
  const body = await getJson(`https://remotive.com/api/remote-jobs${qs}`);
  // Su search también casa por descripción entera: re-filtramos.
  return rows(body, "jobs").map((r) => normalizeRemotive(r, now)).filter((o) => matchesKeyword(o, kw));
}

async function fromJobicy(kw: string, now: Date): Promise<JobOffer[]> {
  // geo=europe: es la única con filtro geográfico de servidor; para un usuario
  // español, Europa es el remoto internacional con más encaje (husos, permisos).
  const tag = kw ? `&tag=${encodeURIComponent(kw)}` : "";
  const body = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=20&geo=europe${tag}`);
  return rows(body, "jobs").map((r) => normalizeJobicy(r, now));
}

async function fromArbeitnow(kw: string, now: Date): Promise<JobOffer[]> {
  const body = await getJson("https://www.arbeitnow.com/api/job-board-api");
  return rows(body, "data")
    .map((r) => normalizeArbeitnow(r, now))
    .filter((o) => o.remote === true) // su bolsa mezcla presencial alemán
    .filter((o) => matchesKeyword(o, kw));
}

async function fromRemoteOk(kw: string, now: Date): Promise<JobOffer[]> {
  const body = await getJson("https://remoteok.com/api");
  // El primer elemento es su aviso legal, no una oferta.
  return rows(body)
    .filter((r) => r.id != null && r.position != null)
    .map((r) => normalizeRemoteOk(r, now))
    .filter((o) => matchesKeyword(o, kw));
}

async function fromHimalayas(kw: string, now: Date): Promise<JobOffer[]> {
  const body = await getJson("https://himalayas.app/jobs/api?limit=100");
  return rows(body, "jobs").map((r) => normalizeHimalayas(r, now)).filter((o) => matchesKeyword(o, kw));
}

async function fromTheMuse(kw: string, now: Date): Promise<JobOffer[]> {
  const body = await getJson("https://www.themuse.com/api/public/jobs?page=0&location=Flexible%20%2F%20Remote");
  return rows(body, "results").map((r) => normalizeTheMuse(r, now)).filter((o) => matchesKeyword(o, kw));
}

const SOURCES: [string, (kw: string, now: Date) => Promise<JobOffer[]>][] = [
  ["remotive", fromRemotive],
  ["jobicy", fromJobicy],
  ["arbeitnow", fromArbeitnow],
  ["remoteok", fromRemoteOk],
  ["himalayas", fromHimalayas],
  ["themuse", fromTheMuse],
];

/**
 * Consulta las seis APIs en paralelo y devuelve un intercalado 1:1 (una oferta
 * de cada bolsa por ronda), deduplicado por URL. Una API caída solo se pierde
 * a sí misma.
 */
export async function ingestRemoteApisOffers(params: JobSearchParams): Promise<JobOffer[]> {
  const now = new Date();
  const kw = params.keywords?.trim() ?? "";
  const perSource = await Promise.all(
    SOURCES.map(([name, fn]) =>
      fn(kw, now)
        .then((offers) => offers.filter((o) => o.title && o.url).slice(0, PER_API))
        .catch((e) => {
          console.error(`[jobs-remote] ${name} falló:`, e instanceof Error ? e.message : e);
          return [] as JobOffer[];
        })
    )
  );

  const seen = new Set<string>();
  const out: JobOffer[] = [];
  for (let i = 0; i < PER_API; i++) {
    for (const list of perSource) {
      const o = list[i];
      if (!o) continue;
      const key = o.externalId ?? o.url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  return out.slice(0, params.maxItems ?? 20);
}
