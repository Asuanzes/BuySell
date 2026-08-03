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

import { isValidMonthlyRentEur, isValidPriceEur } from "@nidokey/shared";

/**
 * Habitaclia se retiró el 2026-08-03: servía muro de verificación al WebView de
 * forma sistemática (y en francés), así que el usuario pagaba el captcha sin
 * llegar nunca a ver anuncios. Su adaptador de importación por URL sigue vivo en
 * `src/features/scraping/adapters/habitaclia.ts`; lo retirado es sólo la
 * búsqueda.
 */
export type PortalKey = "IDEALISTA" | "FOTOCASA" | "PISOS_COM" | "MILANUNCIOS";

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
    rentUrl: (c, p) =>
      `https://www.fotocasa.es/es/alquiler/viviendas/${fotocasaSlug(c, p)}/todas-las-zonas/l`,
    saleUrl: (c, p) =>
      `https://www.fotocasa.es/es/comprar/viviendas/${fotocasaSlug(c, p)}/todas-las-zonas/l`,
    detailPattern: /\/(?:alquiler|comprar)\/vivienda\/[^"']+\/\d+\/d/,
  },
  PISOS_COM: {
    label: "Pisos.com",
    rentUrl: (c) => `https://www.pisos.com/alquiler/pisos-${slugify(c)}/`,
    saleUrl: (c) => `https://www.pisos.com/venta/pisos-${slugify(c)}/`,
    detailPattern: /-\d{5,}_\d+\/?$/,
  },
  MILANUNCIOS: {
    label: "Milanuncios",
    // CIUDAD-PROVINCIA. Medido el 2026-08-03:
    //   …-en-barcelona-barcelona/  → "Barcelona Capital"  ✅ la ciudad
    //   …-en-barcelona/            → "Barcelona Provincia" (la provincia entera)
    //   …-en-gijon/                → listado NACIONAL
    //   …-en-gijon-asturias/       → "Gijón"              ✅
    // Que en el móvil acabara en el listado nacional NO era culpa de la URL:
    // era el aceptador de cookies de este mismo fichero clicando un botón
    // cualquiera y navegando fuera. Desde servidor, sin nadie clicando, esta
    // URL siempre devolvió la ciudad.
    rentUrl: (c, p) =>
      `https://www.milanuncios.com/alquiler-de-pisos-en-${slugify(c)}-${slugify(p)}/`,
    saleUrl: (c, p) => `https://www.milanuncios.com/venta-de-pisos-en-${slugify(c)}-${slugify(p)}/`,
    detailPattern: /-\d{6,}\.htm/,
  },
};

/**
 * Fotocasa distingue la CAPITAL de su provincia con el sufijo "-capital".
 * Sin él, "barcelona" devuelve los 5.066 anuncios de la provincia entera en vez
 * de los 3.970 de la ciudad; con él en un municipio normal ("gijon-capital")
 * responde 404. Ambos comportamientos medidos el 2026-08-03.
 */
function fotocasaSlug(city: string, province: string): string {
  const c = slugify(city);
  const p = slugify(province);
  return p && c === p ? `${c}-capital` : c;
}

/**
 * Dominio registrable del portal ("idealista.com"). Se usa para dos cosas:
 * no inyectar el script en un host que no esperamos, y enseñar al usuario en
 * qué web está cuando el WebView ocupa la pantalla. Una página ajena a pantalla
 * completa dentro de la app es una superficie de phishing si no se identifica.
 */
export function portalDomain(portal: PortalKey): string {
  const host = new URL(PORTALS[portal].rentUrl("x", "y")).host;
  return host.split(".").slice(-2).join(".");
}

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
export function getSearchExtractorScript(
  portal: PortalKey,
  url: string,
  operation: "RENT" | "SALE",
  city: string
): string {
  const pattern = PORTALS[portal].detailPattern.source;
  // Palabra más larga del municipio: "l-hospitalet" → "hospitalet". El portal
  // puede reescribir el slug ("pisos-gijon" → "pisos-gijon_concejo_xixon…")
  // pero el nombre del pueblo sigue dentro.
  const cityToken =
    slugify(city)
      .split("-")
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const opWords = operation === "SALE" ? ["venta", "comprar"] : ["alquiler", "alquilar"];
  // Bandas de `packages/shared/src/sanity.ts`. Van inline porque esto es un
  // string que se inyecta en la página del portal: no hay imports ahí dentro.
  const min = operation === "SALE" ? 10000 : 100;
  const max = operation === "SALE" ? 50000000 : 50000;
  return `
(function() {
  if (window.__nkSearchRunning) return;
  window.__nkSearchRunning = true;

  var RE = new RegExp(${JSON.stringify(pattern)});
  var MIN = ${min}, MAX = ${max};
  var CITY = ${JSON.stringify(cityToken)};
  var OPS = ${JSON.stringify(opWords)};
  var post = function(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };

  /**
   * ¿Seguimos donde pedimos? Los portales redirigen en silencio: Fotocasa a su
   * portada, pisos.com de alquiler a VENTA, Milanuncios al listado nacional. Un
   * redirect así devuelve tarjetas plausibles del sitio equivocado, que es peor
   * que un error: el usuario se cree unos datos que no ha pedido.
   */
  var urlOk = function() {
    var h = String(location.href).toLowerCase();
    if (CITY && h.indexOf(CITY) < 0) return false;
    for (var i = 0; i < OPS.length; i++) if (h.indexOf(OPS[i]) >= 0) return true;
    return false;
  };

  var isChallenge = function() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('just a moment') >= 0 || t.indexOf('un momento') >= 0) return true;
    if (document.querySelector('iframe[src*="datadome"], iframe[src*="captcha"], #px-captcha')) return true;
    var b = (document.body && document.body.innerText || '').slice(0, 400).toLowerCase();
    return b.indexOf('no eres un robot') >= 0 || b.indexOf('verify you are human') >= 0;
  };

  /**
   * Precio del anuncio dentro del texto de su tarjeta. Dos trampas reales:
   *  - "1.450 €/m²" es el precio POR METRO, no el del piso.
   *  - Hay cifras sueltas (gastos, "desde 45 €", publicidad) que no son precio.
   * Por eso se recogen TODOS los candidatos y se devuelve el primero que cae
   * dentro de la banda de cordura de la operación.
   */
  var priceOf = function(text) {
    // €  y  ²  van ESCAPADOS (\\u20AC, \\u00B2) a propósito: el WebView de
    // Android puede mutilar los no-ASCII de un script inyectado, y si el símbolo
    // llega roto ninguna expresión que dependa de él casa. Salían tarjetas sin
    // precio justo por esto.
    var re = /([\\d][\\d.\\s]{0,12}?)\\s*\\u20AC(\\s*\\/\\s*m[\\u00B22])?/g;
    var m, best = null;
    while ((m = re.exec(text)) !== null) {
      if (m[2]) continue; // €/m² → precio por metro, no el del anuncio
      var n = parseInt(String(m[1]).replace(/[.\\s]/g, ''), 10);
      if (isFinite(n) && n >= MIN && n <= MAX) { best = n; break; }
    }
    return best;
  };

  /** Segunda vía: el nodo del precio suele llevar "price" en la clase (ASCII). */
  var priceFromNode = function(box) {
    var nodes = box.querySelectorAll('[class*="price" i], [class*="Price"], [data-testid*="price" i]');
    for (var i = 0; i < nodes.length; i++) {
      var n = priceOf((nodes[i].innerText || nodes[i].textContent || '').replace(/\\s+/g, ' '));
      if (n != null) return n;
      // Ni con el símbolo: número suelto dentro de un nodo que se llama "precio".
      var raw = (nodes[i].innerText || '').replace(/[.\\s]/g, '').match(/\\d{3,8}/);
      if (raw) {
        var v = parseInt(raw[0], 10);
        if (v >= MIN && v <= MAX) return v;
      }
    }
    return null;
  };

  /**
   * Muro de cookies: en la primera visita tapa el listado y el DOM se queda sin
   * tarjetas. Se acepta igual que lo haría el usuario a mano. Sin esto,
   * Idealista devolvía cero anuncios en el primer intento.
   */
  var acceptConsent = function() {
    // SOLO ids conocidos de gestores de consentimiento, y además el texto del
    // botón tiene que sonar a aceptar. Un selector ancho como
    // 'button[class*="accept"]' clicaba cualquier cosa de la página: es lo que
    // mandaba Fotocasa a su portada y pisos.com de alquiler a venta.
    var sels = [
      '#didomi-notice-agree-button',
      '#onetrust-accept-btn-handler',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.sp_choice_type_11',
      'button[mode="primary"][title*="cept"]'
    ];
    var ok = /acept|accept|agree|consent|entendido|de acuerdo/i;
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el || el.offsetParent === null) continue;
      var label = (el.innerText || el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (!ok.test(label)) continue;
      try { el.click(); return true; } catch (e) {}
    }
    return false;
  };

  var stats = { anchors: 0, matched: 0, cards: 0, noPrice: 0, withPrice: 0, mismatch: false };

  var collect = function() {
    var anchors = document.querySelectorAll('a[href]');
    stats.anchors = anchors.length;
    var out = [];
    var seen = {};
    for (var i = 0; i < anchors.length && out.length < 40; i++) {
      var a = anchors[i];
      var href = a.href;
      if (!href || !RE.test(href) || seen[href]) continue;
      stats.matched++;
      seen[href] = 1;

      // Contenedor del anuncio: el ancestro más cercano que ya incluye un precio.
      var box = a;
      for (var up = 0; up < 6 && box.parentElement; up++) {
        if (/\\d[\\d.\\s]*\\s*\\u20AC/.test(box.innerText || '')) break;
        box = box.parentElement;
      }
      var text = (box.innerText || '').replace(/\\s+/g, ' ');
      var price = priceOf(text);
      if (price == null) price = priceFromNode(box);
      if (price != null) stats.withPrice++;
      var roomsM = text.match(/(\\d+)\\s*(?:hab|dorm)/i);
      var areaM = text.match(/(\\d+)\\s*m[\\u00B22]\\b/);
      // Sin precio válido, sólo vale si tiene pinta de anuncio (m² o hab): así
      // Idealista aparece aunque su tarjeta no traiga el precio en texto plano.
      if (price == null && !roomsM && !areaM) { stats.noPrice++; continue; }

      var img = box.querySelector('img');
      var title = (a.innerText || '').trim() || (a.getAttribute('title') || '').trim();
      if (!title) {
        var h = box.querySelector('h2, h3, [class*="title"]');
        title = h ? (h.innerText || '').trim() : '';
      }

      stats.cards++;
      out.push({
        url: href,
        title: (title || 'Anuncio').slice(0, 140),
        price: price,
        rooms: roomsM ? parseInt(roomsM[1], 10) : null,
        area: areaM ? parseInt(areaM[1], 10) : null,
        imageUrl: img ? (img.currentSrc || img.src || null) : null,
        portal: ${JSON.stringify(portal)}
      });
    }
    return out;
  };

  var finish = function(hits) {
    try { window.scrollTo(0, 0); } catch (e) {}
    // Página distinta a la pedida → no se entrega nada: mejor "no encontré" que
    // una lista de otra ciudad o de venta cuando se pidió alquiler.
    stats.mismatch = !urlOk();
    if (stats.mismatch) hits = [];
    stats.title = (document.title || '').slice(0, 80);
    stats.href = String(location.href).slice(0, 120);
    stats.text = ((document.body && document.body.innerText) || '')
      .replace(/\\s+/g, ' ')
      .slice(0, 160);
    post({ type: 'results', data: hits, debug: stats });
  };

  /**
   * VIGILA la página en vez de intentarlo una vez y rendirse.
   *
   * Antes se daba por fallida a los ~7 s y se le echaba la página encima al
   * usuario, que tenía que buscar a mano; en cuanto él tocaba algo, las
   * tarjetas ya estaban ahí. Ahora se sondea hasta 30 s y se entrega en cuanto
   * aparecen anuncios — y si el usuario está mirando la página y navega o
   * resuelve un captcha, este mismo bucle lo recoge sin que pulse nada.
   */
  var tries = 0;
  var announcedChallenge = false;
  var MAX_TRIES = 25;

  // Cada vuelta informa de lo que ACABA de hacer: es lo que convierte la espera
  // en algo legible en vez de una ruedecita.
  var t0 = Date.now();
  var say = function(stage, found) {
    post({
      type: 'progress',
      stage: stage,
      found: found || 0,
      seconds: Math.round((Date.now() - t0) / 1000)
    });
  };

  var tick = function() {
    if (isChallenge()) {
      if (!announcedChallenge) { announcedChallenge = true; post({ type: 'challenge' }); }
      say('challenge', 0);
      if (tries++ < MAX_TRIES) { setTimeout(tick, 1500); return; }
      return finish([]);
    }
    if (tries < 3 && acceptConsent()) say('consent', 0);
    // Fallar PRONTO: si a la tercera vuelta seguimos en una página que no es la
    // pedida, es un redirect, no una carga lenta. Esperar 30 s no lo arregla y
    // deja al usuario mirando una ruedecita (objeción de Codex, aceptada).
    if (tries >= 3 && !urlOk()) return finish([]);
    // Los listados cargan por scroll (Fotocasa carga tandas al bajar): sin esto
    // sólo se ve la primera pantalla y salen cuatro resultados.
    try { window.scrollTo(0, document.body.scrollHeight * Math.min(1, tries / 4)); } catch (e) {}

    var hits = collect();
    // "slow" a partir de ~10 s: si el portal tarda, decirlo es más honesto que
    // repetir "leyendo anuncios" veinte veces.
    say(tries === 0 ? 'opening' : (Date.now() - t0 > 10000 ? 'slow' : 'scanning'), hits.length);
    // Entrega en cuanto hay material: dos vueltas más si aún entran pocos, por
    // si el scroll está trayendo la siguiente tanda.
    if (hits.length >= 8 || (hits.length > 0 && tries >= 4)) return finish(hits);
    if (tries++ < MAX_TRIES) { setTimeout(tick, 1200); return; }
    finish(hits);
  };
  tick();
})();
true;
`;
}

/**
 * Fases que reporta el script mientras trabaja. Son ACCIONES verificables —
 * cada una corresponde a algo que acaba de pasar en la página—, no relleno para
 * entretener. Es la misma regla que sostiene el progreso de vuelos.
 */
export type PortalStage = "opening" | "consent" | "scanning" | "slow" | "challenge";

export type PortalProgress = { stage: PortalStage; found: number; seconds: number };

/**
 * Diagnóstico del extractor: sin esto, "0 resultados" no dice dónde falla.
 * `title`/`href`/`text` identifican QUÉ página cargó de verdad — un captcha, un
 * muro de cookies o un 404 se distinguen al instante, y un recuento de enlaces
 * ridículo (4 en una lista que debería tener cientos) delata la interstitial.
 */
export type PortalDebug = {
  anchors: number;
  matched: number;
  cards: number;
  noPrice: number;
  /** Tarjetas a las que SÍ se les pudo leer el precio. */
  withPrice?: number;
  /** La página final no era la pedida (redirect silencioso). */
  mismatch?: boolean;
  title?: string;
  href?: string;
  text?: string;
};

/**
 * Filtros nuestros aplicados a lo extraído (el portal sólo filtró la zona) y
 * segunda pasada de cordura sobre el precio.
 *
 * La cordura se repite AQUÍ, con las funciones compartidas, aunque el script ya
 * filtre por banda: lo que llega del WebView es texto de una página de terceros
 * y no se confía en él. Un "45 €/mes" es un precio por metro o un gasto de
 * comunidad mal leído, nunca el alquiler de un piso.
 */
export function applyLocalFilters(
  hits: PortalHit[],
  f: {
    operation?: "RENT" | "SALE" | "ANY";
    minPrice?: number;
    maxPrice?: number;
    minRooms?: number;
    minArea?: number;
    maxArea?: number;
  }
): PortalHit[] {
  const sane = f.operation === "SALE" ? isValidPriceEur : isValidMonthlyRentEur;
  return hits.filter((h) => {
    // Precio nulo se deja pasar (el anuncio existe, el precio se ve al abrirlo);
    // un precio presente pero absurdo se descarta.
    if (h.price != null && !sane(h.price)) return false;
    if (f.minPrice != null && (h.price ?? 0) < f.minPrice) return false;
    if (f.maxPrice != null && (h.price ?? Infinity) > f.maxPrice) return false;
    if (f.minRooms != null && (h.rooms ?? 0) < f.minRooms) return false;
    if (f.minArea != null && (h.area ?? 0) < f.minArea) return false;
    if (f.maxArea != null && (h.area ?? Infinity) > f.maxArea) return false;
    return true;
  });
}
