/**
 * Idioma —y con él la región— de las noticias.
 *
 * El problema que resuelve: las noticias de mercados, cripto y tendencias salían
 * SIEMPRE en español, tuviera la app en el idioma que tuviera, porque los tres
 * proveedores llevaban `ES`/`es-ES` escrito a mano. Y no podía ser de otro modo:
 * el móvil nunca le decía su idioma al backend. Ahora lo manda en
 * `Accept-Language` y aquí se traduce a los parámetros de cada fuente.
 *
 * La REGIÓN se deriva del idioma, no se pregunta aparte (decisión del
 * propietario). Acierta en la mayoría de los casos y no añade otro ajuste que
 * mantener. Su límite conocido: un angloparlante residente en España verá
 * titulares en inglés y los índices estadounidenses, aunque su mercado de
 * referencia sea el IBEX. El día que ese caso importe, se añade un ajuste de
 * región propio y este módulo es el único sitio que cambia.
 */

export type NewsLang = "es" | "en";

export type NewsLocale = {
  lang: NewsLang;
  /** RSS de Yahoo Finanzas. */
  yahoo: { region: string; lang: string };
  /** RSS de Google News. */
  googleNews: { hl: string; gl: string; ceid: string };
  /**
   * Índices generalistas que se consultan ADEMÁS de los activos del usuario:
   * muchos ETF de nicho no tienen noticias propias y el panel quedaría vacío.
   * Son de la región del idioma, que es justo lo que antes estaba fijo a España.
   */
  benchmarkSymbols: string[];
};

const LOCALES: Record<NewsLang, NewsLocale> = {
  es: {
    lang: "es",
    yahoo: { region: "ES", lang: "es-ES" },
    googleNews: { hl: "es-ES", gl: "ES", ceid: "ES:es" },
    benchmarkSymbols: ["^IBEX", "^STOXX50E", "^GSPC"],
  },
  en: {
    lang: "en",
    yahoo: { region: "US", lang: "en-US" },
    googleNews: { hl: "en-US", gl: "US", ceid: "US:en" },
    benchmarkSymbols: ["^GSPC", "^DJI", "^FTSE"],
  },
};

/** Español por defecto: es el idioma fuente de la app. */
export const DEFAULT_NEWS_LANG: NewsLang = "es";

/**
 * Idioma preferido de una cabecera `Accept-Language`.
 *
 * Se ordena por factor `q` en vez de coger el primero a secas: un navegador
 * puede mandar `en;q=0.7,es;q=0.9`, donde el primero NO es el preferido. Son
 * cuatro líneas y evitan reintroducir exactamente el bug que estamos quitando.
 * Cualquier idioma que no soportemos cae al de por defecto.
 */
export function parseAcceptLanguage(header: string | null | undefined): NewsLang {
  if (!header) return DEFAULT_NEWS_LANG;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const quality = q == null ? 1 : Number(q);
      return { base: (tag ?? "").trim().split("-")[0]!.toLowerCase(), quality };
    })
    .filter((e) => e.base && Number.isFinite(e.quality) && e.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  const match = ranked.find((e) => e.base === "es" || e.base === "en");
  return (match?.base as NewsLang) ?? DEFAULT_NEWS_LANG;
}

export function newsLocale(lang: NewsLang): NewsLocale {
  return LOCALES[lang] ?? LOCALES[DEFAULT_NEWS_LANG];
}

/** Atajo para las rutas: cabecera → configuración de proveedores. */
export function newsLocaleFromRequest(req: { headers: { get(name: string): string | null } }): NewsLocale {
  return newsLocale(parseAcceptLanguage(req.headers.get("accept-language")));
}
