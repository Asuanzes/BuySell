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

import { isRentOperation, isValidMonthlyRentEur, isValidPriceEur } from "@nidokey/shared";

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

  /**
   * ¿Hay un captcha DE VERDAD delante?
   *
   * Ojo con DataDome: Idealista carga su script y a menudo un iframe suyo en
   * páginas NORMALES, para huella digital. Detectarlo como captcha hacía que el
   * bucle se pasara los 25 reintentos en la rama equivocada y toda búsqueda
   * durase exactamente 30 s para acabar devolviendo cero.
   *
   * El captcha real se sirve desde captcha-delivery.com. Y por si acaso: si hay
   * anuncios en la página, no hay captcha que valga — manda la evidencia.
   */
  var isChallenge = function() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('just a moment') >= 0 || t.indexOf('un momento') >= 0) return true;
    if (t.indexOf('pardon our interruption') >= 0) return true;
    if (document.querySelector('iframe[src*="captcha-delivery"], iframe[src*="geo.captcha"], #px-captcha, .g-recaptcha')) return true;
    var b = (document.body && (document.body.innerText || document.body.textContent) || '')
      .slice(0, 400).toLowerCase();
    return b.indexOf('no eres un robot') >= 0 || b.indexOf('verify you are human') >= 0 ||
           b.indexOf('made us think you were a bot') >= 0;
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
      // Dedup por URL CANÓNICA (sin query ni fragmento): Fotocasa enlaza el
      // mismo anuncio con variantes (?from=list, ?from=srp, tracking…), y cada
      // variante contaba como anuncio distinto → duplicados x4-5.
      var canon = href ? href.split(/[?#]/)[0] : '';
      if (!href || !RE.test(href) || seen[canon]) continue;
      stats.matched++;
      seen[canon] = 1;

      // Contenedor del anuncio: subimos SOLO hasta la tarjeta. Cruzar al grid
      // (otro anuncio DISTINTO dentro) mezcla precios de varias fichas — el
      // origen de "todos a 22.300 €". Se cuenta por anuncio distinto (una
      // tarjeta puede enlazar la misma ficha varias veces: título+imagen+CTA).
      var box = a;
      for (var up = 0; up < 6 && box.parentElement; up++) {
        var parent = box.parentElement;
        var distinct = 0, canonSet = {};
        var links = parent.querySelectorAll('a[href]');
        for (var li = 0; li < links.length; li++) {
          var c = links[li].href.split(/[?#]/)[0];
          if (RE.test(links[li].href) && !canonSet[c]) { canonSet[c] = 1; distinct++; }
        }
        if (distinct > 1) break;
        if (/\\d[\\d.\\s]*\\s*\\u20AC/.test(parent.innerText || '')) { box = parent; break; }
        box = parent;
      }
      var text = (box.innerText || '').replace(/\\s+/g, ' ');
      // Preferir el nodo de precio específico (etiqueta "price") antes que el
      // escaneo de todo el texto del cajón: menos ruido de banners.
      var price = priceFromNode(box);
      if (price == null) price = priceOf(text);
      if (price != null) stats.withPrice++;
      var roomsM = text.match(/(\\d+)\\s*(?:hab|dorm)/i);
      var areaM = text.match(/(\\d+)\\s*m[\\u00B22]\\b/);
      // Sin precio válido, sólo vale si tiene pinta de anuncio (m² o hab): así
      // Idealista aparece aunque su tarjeta no traiga el precio en texto plano.
      if (price == null && !roomsM && !areaM) { stats.noPrice++; continue; }

      // Imagen: los portales cargan por lazy (data-src / data-lazy-src /
      // data-original / <picture><source srcset>); sin esto solo Fotocasa e
      // Idealista traían foto.
      var img = box.querySelector('img');
      var imageUrl = null;
      if (img) {
        imageUrl = img.currentSrc || img.src || null;
        if (!imageUrl) {
          var lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || null;
          if (lazy) imageUrl = lazy;
          else {
            var srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || null;
            if (srcset) imageUrl = String(srcset).split(',')[0].trim().split(' ')[0] || null;
          }
        }
      }
      if (!imageUrl) {
        var src = box.querySelector('source[srcset], source[data-srcset]');
        if (src) imageUrl = String(src.getAttribute('srcset') || src.getAttribute('data-srcset') || '').split(',')[0].trim().split(' ')[0] || null;
      }
      // Título: preferir el elemento de título dedicado. En Fotocasa la tarjeta
      // entera (badges "Líder de zona", contador "1/34", "video del inmueble" y
      // el precio) vive DENTRO del <a>, así que a.innerText mezclaba todo eso.
      var titleEl = box.querySelector('h2, h3, [class*="title"], [class*="Title"]') || a.querySelector('h2, h3');
      var title = titleEl ? (titleEl.innerText || '').trim() : ((a.getAttribute('title') || '').trim());
      if (!title) title = (a.innerText || '').trim();
      // Limpiar ruido: badges de portal, contadores de fotos y precios.
      title = title
        .replace(/Líder de zona|video del inmueble|tour virtual|video/i, ' ')
        .replace(/\\d[\\d.\\s]*\\s*\\u20AC/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();

      stats.cards++;
      out.push({
        url: href,
        title: (title || 'Anuncio').slice(0, 140),
        price: price,
        rooms: roomsM ? parseInt(roomsM[1], 10) : null,
        area: areaM ? parseInt(areaM[1], 10) : null,
        imageUrl: imageUrl,
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
    // Formas de enlace dominantes: revela el patrón real cuando el nuestro no
    // casa. Sólo se calcula al terminar, y sólo si hubo poca cosecha.
    if (stats.matched < 8) {
      var shapes = {};
      var as = document.querySelectorAll('a[href]');
      for (var s = 0; s < as.length; s++) {
        var raw = as[s].getAttribute('href') || '';
        if (!raw || raw.charAt(0) === '#' || raw.indexOf('javascript') === 0) continue;
        var shape = raw.split('?')[0].replace(/\\d+/g, '#');
        shapes[shape] = (shapes[shape] || 0) + 1;
      }
      stats.shapes = Object.keys(shapes)
        .sort(function(a, b) { return shapes[b] - shapes[a]; })
        .slice(0, 3)
        .map(function(k) { return shapes[k] + 'x ' + k.slice(-58); });
    }
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
  // Contenedores con scroll propio (el lazy de Milanuncios a veces vive en un
  // div con overflow, no en la ventana). Se cachean una vez.
  var scrollers = null;
  var findScrollers = function() {
    var all = document.querySelectorAll('body *');
    var out = [];
    for (var i = 0; i < all.length && out.length < 8; i++) {
      var el = all[i];
      try { if (el.scrollHeight > el.clientHeight + 40) out.push(el); } catch (e) {}
    }
    return out;
  };

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
    if (tries < 3 && acceptConsent()) say('consent', 0);
    // Los listados cargan por scroll (Fotocasa carga tandas al bajar; Milanuncios
    // solo renderiza ~5 y el resto por lazy). Se hace scroll por PASOS crecientes
    // y además sobre los contenedores con scroll propio, no solo la ventana.
    try {
      if (!scrollers) scrollers = findScrollers();
      var target = (tries + 1) * Math.max(500, window.innerHeight || 800);
      window.scrollTo(0, target);
      var se = document.scrollingElement || document.documentElement || document.body;
      if (se && se.scrollTop != null) se.scrollTop = target;
      for (var sc = 0; sc < scrollers.length; sc++) {
        try { scrollers[sc].scrollTop = Math.min(scrollers[sc].scrollHeight, target); } catch (e) {}
      }
    } catch (e) {}

    // PRIMERO se mira si hay anuncios. Antes se preguntaba por el captcha antes
    // de recoger, y como Idealista trae DataDome en páginas normales, el bucle
    // se iba por la rama del captcha y agotaba los 25 reintentos: 30 segundos
    // clavados en cada búsqueda, siempre iguales, para devolver cero.
    var hits = collect();

    if (hits.length === 0 && isChallenge()) {
      if (!announcedChallenge) { announcedChallenge = true; post({ type: 'challenge' }); }
      say('challenge', 0);
      if (tries++ < MAX_TRIES) { setTimeout(tick, 1500); return; }
      return finish([]);
    }
    // Fallar PRONTO: si a la tercera vuelta seguimos en una página que no es la
    // pedida, es un redirect, no una carga lenta. Esperar 30 s no lo arregla y
    // deja al usuario mirando una ruedecita (objeción de Codex, aceptada).
    if (tries >= 3 && !urlOk()) return finish([]);
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
  /**
   * Formas de enlace más repetidas de la página, con los dígitos sustituidos
   * por `#`. Es la única manera de averiguar el patrón real de un portal que
   * monta el listado por JavaScript: desde un `fetch` de servidor su HTML sólo
   * trae la cáscara (Milanuncios devuelve UN enlace).
   */
  shapes?: string[];
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
export type FilterOutcome = {
  kept: PortalHit[];
  /** Cuántos cayó cada motivo. "N tras filtros" a secas no dice qué filtro fue. */
  dropped: { sanity: number; price: number; rooms: number; area: number };
};

export function applyLocalFilters(
  hits: PortalHit[],
  f: {
    operation?: "RENT" | "SALE" | "RENT_TO_OWN" | "ANY";
    minPrice?: number;
    maxPrice?: number;
    minRooms?: number;
    minArea?: number;
    maxArea?: number;
  }
): FilterOutcome {
  const sane = isRentOperation(f.operation) ? isValidMonthlyRentEur : isValidPriceEur;
  const dropped = { sanity: 0, price: 0, rooms: 0, area: 0 };
  const kept = hits.filter((h) => {
    // Precio nulo se deja pasar (el anuncio existe, el precio se ve al abrirlo);
    // un precio presente pero absurdo se descarta.
    if (h.price != null && !sane(h.price)) return (dropped.sanity++, false);
    if (f.minPrice != null && (h.price ?? 0) < f.minPrice) return (dropped.price++, false);
    if (f.maxPrice != null && (h.price ?? Infinity) > f.maxPrice) return (dropped.price++, false);
    if (f.minRooms != null && (h.rooms ?? 0) < f.minRooms) return (dropped.rooms++, false);
    if (f.minArea != null && (h.area ?? 0) < f.minArea) return (dropped.area++, false);
    if (f.maxArea != null && (h.area ?? Infinity) > f.maxArea) return (dropped.area++, false);
    return true;
  });
  return { kept, dropped };
}

/**
 * Dedup final por URL canónica (misma ficha enlazada con variantes de query).
 * Doble red de seguridad: el script ya deduplica dentro de la página, pero lo
 * que llega por `onMessage` no debe repetir anuncios entre reinyecciones.
 */
export function dedupeHits(hits: PortalHit[]): PortalHit[] {
  const seen = new Set<string>();
  const out: PortalHit[] = [];
  for (const h of hits) {
    const canon = h.url.split(/[?#]/)[0];
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(h);
  }
  return out;
}
