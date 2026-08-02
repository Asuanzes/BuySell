/**
 * Búsqueda de anuncios EN LOS PORTALES, desde el WebView del móvil.
 *
 * Por qué en el WebView y no en el servidor: se midió el 2026-08-02 que
 * Idealista y yaencontre devuelven 403 anti-bot a un fetch de servidor, y son
 * justo los que más importan. El WebView, en cambio, es el navegador del
 * usuario, con su IP y sus cookies — es el mismo camino por el que ya se
 * importa un anuncio hoy (`WebViewImporter` + `portal-extractors.ts`), con el
 * UA de Chrome que evita el interstitial de DataDome y `sharedCookiesEnabled`
 * para que un captcha resuelto no vuelva a pedirse.
 *
 * Diseño deliberado: la URL de búsqueda sólo lleva la ZONA. Los filtros de
 * precio, habitaciones y superficie se aplican después sobre lo extraído, con
 * nuestros propios datos. Cada portal tiene una gramática distinta para sus
 * filtros y adivinarlas sería lo primero que se rompiera.
 */

export type PortalKey = "IDEALISTA" | "FOTOCASA" | "PISOS_COM" | "HABITACLIA" | "MILANUNCIOS";

export type PortalHit = {
  url: string;
  title: string;
  /** Euros (no céntimos): es lo que se lee del anuncio. */
  price: number | null;
  rooms: number | null;
  area: number | null;
  imageUrl: string | null;
  portal: PortalKey;
};

/** Municipio → slug de portal: sin acentos, minúsculas, espacios por guiones. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type PortalDef = {
  label: string;
  /** URL de resultados de ALQUILER para una zona. */
  rentUrl: (city: string, province: string) => string;
  /** URL de resultados de VENTA. */
  saleUrl: (city: string, province: string) => string;
  /** Cómo es el enlace de un anuncio en ese portal (para reconocerlos). */
  detailPattern: RegExp;
};

export const PORTALS: Record<PortalKey, PortalDef> = {
  IDEALISTA: {
    label: "Idealista",
    rentUrl: (c, p) => `https://www.idealista.com/alquiler-viviendas/${slugify(c)}-${slugify(p)}/`,
    saleUrl: (c, p) => `https://www.idealista.com/venta-viviendas/${slugify(c)}-${slugify(p)}/`,
    detailPattern: /\/inmueble\/\d+/,
  },
  FOTOCASA: {
    label: "Fotocasa",
    rentUrl: (c) => `https://www.fotocasa.es/es/alquiler/viviendas/${slugify(c)}/todas-las-zonas/l`,
    saleUrl: (c) => `https://www.fotocasa.es/es/comprar/viviendas/${slugify(c)}/todas-las-zonas/l`,
    detailPattern: /\/(?:alquiler|comprar)\/vivienda\/[^"']+\/\d+\/d/,
  },
  PISOS_COM: {
    label: "Pisos.com",
    rentUrl: (c) => `https://www.pisos.com/alquiler/pisos-${slugify(c)}/`,
    saleUrl: (c) => `https://www.pisos.com/venta/pisos-${slugify(c)}/`,
    detailPattern: /-\d{5,}_\d+\/?$/,
  },
  HABITACLIA: {
    label: "Habitaclia",
    rentUrl: (c) => `https://www.habitaclia.com/alquiler-${slugify(c)}.htm`,
    saleUrl: (c) => `https://www.habitaclia.com/viviendas-${slugify(c)}.htm`,
    detailPattern: /-i\d+\.htm/,
  },
  MILANUNCIOS: {
    label: "Milanuncios",
    rentUrl: (c, p) =>
      `https://www.milanuncios.com/alquiler-de-pisos-en-${slugify(c)}-${slugify(p)}/`,
    saleUrl: (c, p) => `https://www.milanuncios.com/venta-de-pisos-en-${slugify(c)}-${slugify(p)}/`,
    detailPattern: /-\d{6,}\.htm/,
  },
};

export function buildSearchUrl(
  portal: PortalKey,
  operation: "RENT" | "SALE",
  city: string,
  province: string
): string {
  const def = PORTALS[portal];
  return operation === "SALE" ? def.saleUrl(city, province) : def.rentUrl(city, province);
}

/**
 * Script inyectado en la página de RESULTADOS. Es GENÉRICO a propósito: en vez
 * de depender de los nombres de clase de cada portal (que cambian sin avisar y
 * no puedo verificar sin cargar la página), parte de los ENLACES a fichas —
 * que no pueden cambiar sin romper el propio portal— y lee el precio, las
 * habitaciones y los metros del bloque que contiene cada enlace.
 */
export function getSearchExtractorScript(portal: PortalKey, url: string): string {
  const pattern = PORTALS[portal].detailPattern.source;
  return `
(function() {
  if (window.__nkSearchRunning) return;
  window.__nkSearchRunning = true;

  var RE = new RegExp(${JSON.stringify(pattern)});
  var post = function(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };

  var isChallenge = function() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('just a moment') >= 0 || t.indexOf('un momento') >= 0) return true;
    if (document.querySelector('iframe[src*="datadome"], iframe[src*="captcha"], #px-captcha')) return true;
    var b = (document.body && document.body.innerText || '').slice(0, 400).toLowerCase();
    return b.indexOf('no eres un robot') >= 0 || b.indexOf('verify you are human') >= 0;
  };

  var num = function(s) {
    if (!s) return null;
    var m = String(s).replace(/\\./g, '').match(/\\d+/);
    return m ? parseInt(m[0], 10) : null;
  };

  var collect = function() {
    var anchors = document.querySelectorAll('a[href]');
    var out = [];
    var seen = {};
    for (var i = 0; i < anchors.length && out.length < 40; i++) {
      var a = anchors[i];
      var href = a.href;
      if (!href || !RE.test(href) || seen[href]) continue;

      // Contenedor del anuncio: el ancestro más cercano que ya incluye un precio.
      var box = a;
      for (var up = 0; up < 5 && box.parentElement; up++) {
        if (/\\d[\\d.\\s]*\\s*€/.test(box.innerText || '')) break;
        box = box.parentElement;
      }
      var text = (box.innerText || '').replace(/\\s+/g, ' ');
      var priceM = text.match(/([\\d][\\d.\\s]{2,})\\s*€/);
      if (!priceM) continue; // sin precio no es una tarjeta de anuncio

      seen[href] = 1;
      var img = box.querySelector('img');
      var roomsM = text.match(/(\\d+)\\s*(?:hab|dorm)/i);
      var areaM = text.match(/(\\d+)\\s*m²/);
      var title = (a.innerText || '').trim() || (a.getAttribute('title') || '').trim();
      if (!title) {
        var h = box.querySelector('h2, h3, [class*="title"]');
        title = h ? (h.innerText || '').trim() : '';
      }

      out.push({
        url: href,
        title: (title || 'Anuncio').slice(0, 140),
        price: num(priceM[1]),
        rooms: roomsM ? parseInt(roomsM[1], 10) : null,
        area: areaM ? parseInt(areaM[1], 10) : null,
        imageUrl: img ? (img.currentSrc || img.src || null) : null,
        portal: ${JSON.stringify(portal)}
      });
    }
    return out;
  };

  var tries = 0;
  var run = function() {
    if (isChallenge()) { post({ type: 'challenge' }); setTimeout(run, 2500); return; }
    var hits = collect();
    // Los listados cargan tarde (scroll infinito, hidratación): reintenta antes
    // de dar por vacía una página que sí tiene anuncios.
    if (hits.length === 0 && tries++ < 5) { setTimeout(run, 1200); return; }
    post({ type: 'results', data: hits });
  };
  run();
})();
true;
`;
}

/** Filtros nuestros aplicados a lo extraído (el portal sólo filtró la zona). */
export function applyLocalFilters(
  hits: PortalHit[],
  f: { minPrice?: number; maxPrice?: number; minRooms?: number; minArea?: number; maxArea?: number }
): PortalHit[] {
  return hits.filter((h) => {
    if (f.minPrice != null && (h.price ?? 0) < f.minPrice) return false;
    if (f.maxPrice != null && (h.price ?? Infinity) > f.maxPrice) return false;
    if (f.minRooms != null && (h.rooms ?? 0) < f.minRooms) return false;
    if (f.minArea != null && (h.area ?? 0) < f.minArea) return false;
    if (f.maxArea != null && (h.area ?? Infinity) > f.maxArea) return false;
    return true;
  });
}
