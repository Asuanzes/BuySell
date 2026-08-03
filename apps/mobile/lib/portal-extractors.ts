/**
 * Scripts de extracción JS que se inyectan en el WebView para cada portal.
 * Cada script extrae datos del anuncio y los envía via window.ReactNativeWebView.postMessage.
 *
 * Tipos de mensaje:
 *   { type: 'extracted', data: ImportPayload }
 *   { type: 'challenge' }               — captcha/DataDome detectado
 *   { type: 'error', reason: string }
 *
 * Robustez (todos los portales):
 *  - PRECIO: __price quita TODO lo no-dígito (en es-ES el '.' es separador de
 *    miles → parseFloat('185.000') daba 185). Fallback __priceDom() por si el
 *    JSON del portal no lo trae.
 *  - IMÁGENES: no se prioriza og:image. Se filtra basura SOLO por segmento de
 *    ruta (no se descartan fotos en /static/ o /assets/), por tamaño/ratio real
 *    (DOM) y, si la galería es lazy y hay pocas, se completa con un barrido del
 *    HTML excluyendo miniaturas (para no colar fotos de anuncios "similares").
 *  - CAMPOS: SIEMPRE se manda `features` (texto de las características) +
 *    descripción por DOM como fallback; el servidor re-parsea el resto.
 */

function detectPortal(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("idealista.")) return "IDEALISTA";
  if (u.includes("fotocasa.")) return "FOTOCASA";
  if (u.includes("pisos.com")) return "PISOS_COM";
  if (u.includes("milanuncios.")) return "MILANUNCIOS";
  if (u.includes("habitaclia.")) return "HABITACLIA";
  if (u.includes("yaencontre.")) return "YAENCONTRE";
  if (u.includes("thinkspain.")) return "THINKSPAIN";
  if (u.includes("indomio.")) return "INDOMIO";
  return "OTHER";
}

const SHARED_HELPERS = `
// Operación del anuncio: venta vs alquiler. Idealista/Fotocasa/etc. lo llevan en
// la ruta (/alquiler-…, /comprar-…); fallback a __NEXT_DATA__ y, por último, a
// señales de texto (€/mes). Devuelve 'SALE' | 'RENT'.
var __operation = function() {
  var path = (location.pathname + ' ' + location.search).toLowerCase();
  if (/alquil|lloguer|arrenda|\\brent\\b|\\brental\\b/.test(path)) return 'RENT';
  if (/venta|comprar|vender|obra-?nueva|\\bsale\\b|\\bbuy\\b/.test(path)) return 'SALE';
  try {
    var nd = window.__NEXT_DATA__; var s = nd ? JSON.stringify(nd).toLowerCase() : '';
    if (/"transactiontypeid":\\s*3|"operation":"?rent|"isrental":true|"transactiontype":"?rent|"transaction":"?rent/.test(s)) return 'RENT';
    if (/"transactiontypeid":\\s*1|"operation":"?(sale|buy)|"transactiontype":"?(sale|buy)/.test(s)) return 'SALE';
  } catch(e) {}
  var t = (document.body ? document.body.innerText.slice(0, 4000) : '').toLowerCase();
  if (/€\\s*\\/\\s*mes|\\/mes\\b|al mes\\b|mensuales\\b/.test(t) && !/en venta|precio de venta/.test(t)) return 'RENT';
  return 'SALE';
};

var __postTries = 0;
var __post = function(obj) {
  if (obj && obj.type === 'extracted' && obj.data) {
    // Inyecta la operación en toda extracción (evita repetirlo en cada portal).
    if (obj.data.operationType == null) {
      try { obj.data.operationType = __operation(); } catch(e) { obj.data.operationType = 'SALE'; }
    }
    // SPA sin hidratar: onLoadEnd dispara antes de que el precio esté en el DOM
    // (las imágenes/descripción sobreviven porque se rascan del HTML/JSON crudo,
    // el precio no — Fotocasa importaba sin precio). Reintentar la extracción
    // entera; al 4º intento se envía lo que haya (hay anuncios "a consultar").
    // Idealista queda fuera: su script ya trae bucle propio (__nkIdealistaRunning)
    // y re-lanzarlo desde aquí chocaría con ese flag y no publicaría nunca.
    if (obj.data.price == null && __postTries < 3 && !window.__nkIdealistaRunning && typeof __extract === 'function') {
      __postTries++; setTimeout(__extract, 1300); return;
    }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify(obj));
};

var __jsonLd = function(type) {
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < scripts.length; i++) {
    try {
      var d = JSON.parse(scripts[i].textContent);
      var items = Array.isArray(d) ? d : [d];
      for (var j = 0; j < items.length; j++) {
        if (items[j]['@type'] === type) return items[j];
        if (items[j]['@graph']) {
          for (var k = 0; k < items[j]['@graph'].length; k++) {
            if (items[j]['@graph'][k]['@type'] === type) return items[j]['@graph'][k];
          }
        }
      }
    } catch(e) {}
  }
  return null;
};

// Precio de inmueble = euros enteros. Quitamos TODO lo no-dígito porque en
// es-ES el '.' es separador de miles (parseFloat('185.000') = 185 era un bug).
var __price = function(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v);
  var s = String(v).replace(/[^\\d]/g, '');
  if (!s) return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
};

// Resuelve a URL absoluta. keepQuery=true conserva la query (URLs firmadas de CDN).
var __abs = function(src, keepQuery) {
  if (!src) return '';
  try { var u = new URL(src, location.href).href; return keepQuery ? u : u.split('?')[0]; }
  catch(e) { return keepQuery ? String(src) : String(src).split('?')[0]; }
};

// Basura SOLO como segmento de ruta/fichero (no subcadena) → no descarta fotos
// reales en /static/ o /assets/. + hosts de no-fotos. + miniaturas.
var __junk = /(?:^|[\\/_.\\-])(logos?|sprites?|icons?|icono|favicon|placeholder|avatars?|watermark|marca-?agua|blank|pixel|spacer|loading|banner|badges?|sello|bandera|flags?)(?:[\\/_.\\-]|$)/i;
var __junkHost = /(googleapis|gstatic|staticmap|maps\\.google|fbcdn|facebook|whatsapp|instagram|twitter|gravatar)/i;
var __thumb = /(thumbs?|_thumb|-thumb|\\/mini\\/|_mini|web_listing|gallery-thumb|listing-thumb)/i;

var __goodImg = function(path) {
  if (!path || !/^https?:/i.test(path)) return false;
  if (/\\.(svg|gif)(\\?|$)/i.test(path)) return false;
  if (__junk.test(path) || __junkHost.test(path)) return false;
  return true;
};

// Barrido del HTML por URLs de imágenes (capta galerías lazy aún no en el DOM).
// Excluye miniaturas para no colar fotos de anuncios "similares".
var __htmlImgs = function(max) {
  var html = ''; try { html = document.documentElement.outerHTML || ''; } catch(e) {}
  var re = /https?:\\/\\/[^"'\\s<>()\\\\]+\\.(?:jpe?g|png|webp)(?:\\?[^"'\\s<>()\\\\]*)?/gi;
  var m, seen = {}, out = []; var lim = max || 60;
  while ((m = re.exec(html)) && out.length < lim) {
    var full = m[0]; var path = full.split('?')[0];
    if (!__goodImg(path) || __thumb.test(path) || seen[path]) continue;
    seen[path] = 1; out.push(full);
  }
  return out;
};

// (DOM) imágenes reales filtrando por tamaño, ratio y URL. NO prioriza og:image.
// Si hay pocas (galería lazy), completa con el barrido del HTML.
var __imgs = function(max) {
  var seen = {}; var result = []; var lim = max || 60;
  var imgs = document.querySelectorAll('img');
  for (var i = 0; i < imgs.length && result.length < lim; i++) {
    var el = imgs[i];
    var raw = el.currentSrc || el.src || el.getAttribute('data-src') ||
              el.getAttribute('data-lazy') || el.getAttribute('data-original') ||
              el.getAttribute('data-srcset') || '';
    if (raw && raw.indexOf(' ') > -1) raw = raw.split(' ')[0]; // srcset → primera URL
    var full = __abs(raw, true); var path = full.split('?')[0];
    if (!__goodImg(path) || seen[path]) continue;
    var w = el.naturalWidth || el.width || 0;
    var h = el.naturalHeight || el.height || 0;
    if (w && h) { if (w < 300 || h < 200) continue; var r = w / h; if (r > 4 || r < 0.25) continue; }
    seen[path] = 1; result.push(full);
  }
  if (result.length < 10) {
    var extra = __htmlImgs(lim);
    for (var e = 0; e < extra.length && result.length < lim; e++) {
      var p = extra[e].split('?')[0];
      if (!seen[p]) { seen[p] = 1; result.push(extra[e]); }
    }
  }
  if (!result.length) {
    var og = document.querySelector('meta[property="og:image"]');
    if (og && og.content) { var o = __abs(og.content, true); if (__goodImg(o.split('?')[0])) result.push(o); }
  }
  return result;
};

// Filtra/normaliza una lista de URLs estructuradas (multimedia del JSON).
var __cleanImgs = function(arr, max) {
  var seen = {}; var out = []; var lim = max || 60;
  for (var i = 0; i < (arr || []).length && out.length < lim; i++) {
    var full = __abs(arr[i], true); if (!full) continue;
    var path = full.split('?')[0];
    if (!__goodImg(path) || seen[path]) continue;
    seen[path] = 1; out.push(full);
  }
  return out;
};

// Precio desde el DOM (fallback). Siempre ignora €/m². En VENTA ignora también
// €/mes; en ALQUILER el €/mes es justamente el precio bueno (y el mínimo baja a
// 100 €, una renta puede ser de pocos cientos).
var __priceDom = function() {
  var op = __operation();
  // aria-label primero: Fotocasa (jul-2026) pasó a clases ofuscadas sin "price";
  // el contenedor del precio conserva aria-label="Precio del inmueble".
  var sels = ['[aria-label*="precio" i]','[itemprop="price"]','[class*="price" i]','[class*="Price"]','[data-testid*="price" i]'];
  for (var s = 0; s < sels.length; s++) {
    var els; try { els = document.querySelectorAll(sels[s]); } catch(e) { continue; }
    for (var i = 0; i < els.length; i++) {
      var txt = (els[i].innerText || els[i].textContent || '');
      if (txt.indexOf('€') === -1 && !/eur/i.test(txt)) continue;
      if (/€\\s*\\/\\s*m²|€\\/m2|\\/\\s*m²|\\/m2\\b/i.test(txt)) continue; // €/m² nunca
      if (op !== 'RENT' && /\\/\\s*mes|\\/mes|mensual|al mes/i.test(txt)) continue; // €/mes solo en alquiler
      var p = __price(txt.split('€')[0]); // solo la cifra ANTES del primer € (el nodo puede arrastrar más texto)
      if (p && p >= (op === 'RENT' ? 100 : 1000)) return p;
    }
  }
  // Último recurso: PRIMER precio válido del texto visible (los anuncios
  // relacionados van después en el DOM, el primero es el del anuncio). Bandas
  // por operación como en el server: venta >= 10.000, renta 100–50.000.
  try {
    var body = (document.body && document.body.innerText || '').slice(0, 20000);
    var re = /(\\d{1,3}(?:\\.\\d{3})+|\\d{3,7})\\s*€(\\s*\\/?\\s*m(es|²|2)\\b)?/g;
    var m;
    while ((m = re.exec(body)) !== null) {
      var unit = m[2] || '';
      if (/m²|m2/.test(unit)) continue;
      var v = parseInt(m[1].replace(/\\./g, ''), 10);
      if (op === 'RENT') { if (v >= 100 && v <= 50000) return v; }
      else { if (!unit && v >= 10000) return v; }
    }
  } catch(e) {}
  return null;
};

// ── Descripción del propietario: limpieza + descarte de basura ───────────────
// Espejo JS de packages/shared/src/text.ts (cleanDescription / isLikelyJunk).
var __decodeEnt = function(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch(e) { return ''; } })
    .replace(/&#(\\d+);/g, function(_, d) { try { return String.fromCodePoint(parseInt(d, 10)); } catch(e) { return ''; } });
};
var __cleanText = function(s) {
  if (!s) return '';
  var t = __decodeEnt(String(s).replace(/<[^>]+>/g, ' ').replace(/\\r?\\n+/g, ' ')).replace(/\\s+/g, ' ').trim();
  return t.length > 4000 ? t.slice(0, 4000) : t;
};
var __isJunkDesc = function(s) {
  if (!s) return true;
  var t = String(s).trim();
  if (t.length < 25) return true;
  if (/^[\\s\\d+()\\/.\\-]{6,}$/.test(t)) return true;          // solo teléfono/números
  var l = t.toLowerCase();
  if (/cookies|consentimiento|pol[ií]tica de privacidad|aceptar y continuar/.test(l)) return true;
  if (/(anuncios?|inmuebles?|viviendas?|propiedades?)\\s+(similares|relacionad[oa]s)|tambi[eé]n te puede interesar|otras viviendas/.test(l)) return true;
  if (t.length < 120 && /contacta|ll[aá]ma|solicita (m[aá]s )?informaci[oó]n|ver tel[eé]fono|pide cita|reserva (ya|ahora)|env[ií]a/.test(l)) return true;
  return false;
};
// Resumen del portal (último recurso para no dejar la descripción vacía).
var __metaDesc = function() {
  var og = document.querySelector('meta[property="og:description"]');
  if (og && og.content) return __cleanText(og.content);
  var md = document.querySelector('meta[name="description"]');
  if (md && md.content) return __cleanText(md.content);
  return '';
};
// Prioriza candidatos de JSON: limpio, >=20 y no basura. Acepta string u objeto
// ({text|value|content|es}) o array (algunos portales anidan la descripción).
var __pickJson = function(cands) {
  var coerce = function(x) {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    if (Array.isArray(x)) { for (var k = 0; k < x.length; k++) { var v = coerce(x[k]); if (v) return v; } return ''; }
    if (typeof x === 'object') return coerce(x.text || x.value || x.content || x.es || x.description || '');
    return '';
  };
  for (var i = 0; i < (cands || []).length; i++) {
    var c = __cleanText(coerce(cands[i]));
    if (c && c.length >= 20 && !__isJunkDesc(c)) return c;
  }
  return null;
};
// El más largo NO-basura entre unos selectores. Lee textContent (capta texto
// colapsado tras "ver más", que innerText recortaría).
var __bestFrom = function(sels, minLen) {
  var best = '';
  for (var s = 0; s < sels.length; s++) {
    var els; try { els = document.querySelectorAll(sels[s]); } catch(e) { continue; }
    for (var i = 0; i < els.length; i++) {
      var t = __cleanText(els[i].textContent || els[i].innerText || '');
      if (t.length >= minLen && !__isJunkDesc(t) && t.length > best.length) best = t;
    }
  }
  return best || null;
};
// Descripción desde el DOM: selectores de DESCRIPCIÓN reales (umbral bajo) y
// luego genéricos (umbral alto, para no colar bloques de UI).
var __descDom = function() {
  return __bestFrom(
    ['[itemprop="description"]', '.adCommentsLanguage', '.comment .adCommentsLanguage', '[class*="commentsLanguage" i]'],
    30
  ) || __bestFrom(
    ['[class*="Description" i]', '[class*="description" i]', '[class*="comment" i]', '[class*="detail-text" i]', '[class*="adText" i]', '[class*="texto" i]'],
    60
  );
};
// Raíces JSON embebidas en la página (agnóstico de portal): estados de framework
// + todos los <script> JSON/JSON-LD. Cada parse protegido.
var __jsonRoots = function() {
  var roots = [];
  var globals = ['__NEXT_DATA__', '__INITIAL_STATE__', '__NUXT__', '__APP_STATE__', '__PRELOADED_STATE__'];
  for (var g = 0; g < globals.length; g++) {
    try { var w = window[globals[g]]; if (w && typeof w === 'object') roots.push(w); } catch(e) {}
  }
  try {
    var scr = document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]');
    for (var i = 0; i < scr.length; i++) {
      var txt = scr[i].textContent || '';
      if (txt.length < 30 || txt.length > 2000000) continue;
      try { roots.push(JSON.parse(txt)); } catch(e) {}
    }
  } catch(e) {}
  return roots;
};
// Barrido genérico: busca en el estado JSON el valor de cualquier clave de
// descripción (description/comentario/adText…) y devuelve el más largo no-basura.
// Acotado en nodos y profundidad para no penalizar el rendimiento.
var __DESC_KEY = /^(description|descripcion|comment|comments|comentario|comentarios|adtext|longdescription|shortdescription|bodytext|detaildescription)$/i;
var __deepDesc = function() {
  var roots = __jsonRoots();
  var best = '';
  var budget = 20000;
  var consider = function(v) {
    var c = __pickJson([v]); // reusa coacción objeto/array + limpieza + no-junk
    if (c && c.length >= 40 && c.length > best.length) best = c;
  };
  var walk = function(node, depth) {
    if (budget <= 0 || depth > 8 || node == null) return;
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length && budget > 0; i++) { budget--; walk(node[i], depth + 1); }
      return;
    }
    for (var k in node) {
      if (budget <= 0) break;
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      budget--;
      var val = node[k];
      if (typeof val === 'string') {
        if ((__DESC_KEY.test(k) || /descripci|comentari/i.test(k)) && val.length >= 40) consider(val);
      } else if (val && typeof val === 'object') {
        // descripción anidada como objeto { text/value/es }
        if (__DESC_KEY.test(k)) consider(val);
        walk(val, depth + 1);
      }
    }
  };
  for (var r = 0; r < roots.length && budget > 0; r++) walk(roots[r], 0);
  return best || null;
};
// Descripción final: la MÁS RICA (más larga no-basura) entre 4 fuentes — claves
// JSON del portal, barrido JSON genérico (cualquier portal), DOM, y meta del
// portal como último recurso. El comentario real del dueño suele ser el más
// largo; los títulos SEO/meta son cortos y pierden.
var __desc = function(cands) {
  var cs = [__pickJson(cands), __deepDesc(), __descDom()];
  var best = '';
  for (var i = 0; i < cs.length; i++) { if (cs[i] && cs[i].length > best.length) best = cs[i]; }
  if (best) return best;
  var m = __metaDesc();
  return m && !__isJunkDesc(m) ? m : null;
};

var __features = function() {
  var out = []; var seen = {};
  var add = function(s) {
    if (!s) return; s = String(s).replace(/\\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 120) return;
    var k = s.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(s);
  };
  var sels = ['[class*="detail" i] li','[class*="feature" i] li','[class*="caracteristic" i] li',
    '[class*="characteristic" i] li','[class*="equipment" i] li','[class*="amenit" i] li',
    'ul[class*="info" i] li','[class*="property-features" i] li','.adProps li','[class*="basic" i] li'];
  for (var s = 0; s < sels.length && out.length < 60; s++) {
    var n; try { n = document.querySelectorAll(sels[s]); } catch(e) { continue; }
    for (var i = 0; i < n.length && out.length < 60; i++) add(n[i].innerText || n[i].textContent);
  }
  var dts = document.querySelectorAll('dt');
  for (var d = 0; d < dts.length && out.length < 60; d++) {
    var dd = dts[d].nextElementSibling;
    if (dd) add((dts[d].innerText || '') + ': ' + (dd.innerText || ''));
  }
  var en; try { en = document.querySelectorAll('[class*="energ" i],[class*="certific" i]'); } catch(e) { en = []; }
  for (var e = 0; e < en.length && out.length < 60; e++) add(en[e].innerText || en[e].textContent);
  return out;
};

/**
 * Habitaciones, baños y superficie leídos del TEXTO de la ficha.
 *
 * Existe porque los datos estructurados no siempre están: el JSON-LD de
 * Idealista no trae baños NUNCA, y cuando la ficha no lo publica (o lo inyecta
 * tarde) la rama de respaldo guardaba el anuncio sin una sola característica.
 * Un registro sin metros ni habitaciones no sirve para comparar, que es justo
 * para lo que se guarda.
 *
 * Se mira primero la lista de características (poco ruido) y solo después el
 * cuerpo acotado: en el texto largo hay números de teléfono, referencias y
 * anuncios relacionados.
 */
var __specs = function() {
  var pick = function(text) {
    var out = { rooms: null, bathrooms: null, builtArea: null };
    if (!text) return out;
    var t = String(text).replace(/\\s+/g, ' ');
    var r = t.match(/(\\d{1,2})\\s*(?:hab\\b|hab\\.|habitacion|habitaciones|dormitorio|dormitorios)/i);
    if (r) out.rooms = parseInt(r[1], 10);
    var b = t.match(/(\\d{1,2})\\s*(?:ba\\u00f1o|ba\\u00f1os|aseo|aseos|wc)\\b/i);
    if (b) out.bathrooms = parseInt(b[1], 10);
    // "90 m² construidos" gana a "12 m² de terraza": se prefiere la mayor.
    var areas = t.match(/(\\d{2,5})\\s*m(?:\\u00b2|2)\\b/gi);
    if (areas) {
      var best = 0;
      for (var i = 0; i < areas.length; i++) {
        var n = parseInt(String(areas[i]).replace(/[^\\d]/g, ''), 10);
        if (n > best && n <= 5000) best = n;
      }
      if (best > 0) out.builtArea = best;
    }
    return out;
  };

  var fromFeatures = pick(__features().join(' · '));
  if (fromFeatures.rooms && fromFeatures.bathrooms && fromFeatures.builtArea) return fromFeatures;

  var body = document.body ? document.body.innerText.slice(0, 4000) : '';
  var fromBody = pick(body);
  return {
    rooms: fromFeatures.rooms != null ? fromFeatures.rooms : fromBody.rooms,
    bathrooms: fromFeatures.bathrooms != null ? fromFeatures.bathrooms : fromBody.bathrooms,
    builtArea: fromFeatures.builtArea != null ? fromFeatures.builtArea : fromBody.builtArea
  };
};

var __challenge = function() {
  // Interstitial de DataDome: el captcha vive en un IFRAME de captcha-delivery
  // (o un script de datadome) y el body apenas tiene texto — las palabras clave
  // solas no lo cazaban. Selectores primero, keywords después.
  if (document.querySelector(
    'iframe[src*="captcha-delivery"],script[src*="captcha-delivery"],' +
    'iframe[src*="datadome"],script[src*="datadome"],' +
    '.g-recaptcha, #captcha, [data-sitekey]'
  )) return true;
  var t = (document.title + ' ' + (document.body ? document.body.innerText.slice(0,500) : '')).toLowerCase();
  return t.includes('captcha') || t.includes('robot') || t.includes('datadome') ||
         t.includes('verify') || t.includes('access denied') ||
         t.includes('has sido bloqueado') || t.includes('you have been blocked');
};
`;

// ─── Per-portal extraction code ──────────────────────────────────────────────

const FOTOCASA_SCRIPT = (url: string) => `
var nd = window.__NEXT_DATA__;
var pp = nd && nd.props && nd.props.pageProps;
var ad = pp && (pp.ad || pp.realEstate || pp.listing);
if (ad) {
  var rawImgs = [];
  if (ad.multimedia && ad.multimedia.images) {
    for (var i = 0; i < ad.multimedia.images.length; i++) { var im = ad.multimedia.images[i]; if (im) rawImgs.push(im.url || im.src || ''); }
  }
  var imgs = __cleanImgs(rawImgs, 60);
  if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'FOTOCASA',
    title: ad.title || ad.name || document.title,
    price: __price(ad.price || (ad.priceInfo && ad.priceInfo.amount)) || __priceDom(),
    rooms: ad.rooms || ad.roomsNumber || null,
    bathrooms: ad.bathrooms || null,
    builtArea: ad.constructedArea || ad.surface || null,
    usableArea: ad.usableArea || null,
    floor: ad.floor || null,
    description: __desc([ad.description, ad.comment]),
    address: (ad.ubication && ad.ubication.address) || null,
    city: (ad.ubication && (ad.ubication.municipality || ad.ubication.city)) || null,
    province: (ad.ubication && ad.ubication.province) || null,
    postalCode: (ad.ubication && ad.ubication.postalCode) || null,
    latitude: (ad.ubication && ad.ubication.latitude) || null,
    longitude: (ad.ubication && ad.ubication.longitude) || null,
    images: imgs, features: __features()
  }});
  return;
}
var ld = __jsonLd('RealEstateListing') || __jsonLd('Apartment') || __jsonLd('House');
if (ld) {
  var li = []; if (ld.image) { var a = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i=0;i<a.length;i++){ var im=a[i]; li.push(typeof im==='string'?im:(im.url||im.contentUrl||'')); } }
  var imgs = __cleanImgs(li, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'FOTOCASA',
    title: ld.name || document.title,
    price: __price(ld.offers && ld.offers.price) || __priceDom(),
    rooms: ld.numberOfRooms || null,
    description: __desc([ld.description]),
    images: imgs, features: __features()
  }});
  return;
}
__post({ type: 'extracted', data: { url: ${JSON.stringify(url)}, portal: 'FOTOCASA', title: document.title, price: __priceDom(), description: __desc([]), images: __imgs(60), features: __features() }});
`;

const PISOS_SCRIPT = (url: string) => `
var nd = window.__NEXT_DATA__;
var pp = nd && nd.props && nd.props.pageProps;
var pr = pp && (pp.property || pp.ad || pp.listing || pp.detail);
if (pr) {
  var imgSrc = pr.images || pr.photos || pr.multimedia || [];
  var rawImgs = [];
  for (var i = 0; i < imgSrc.length; i++) { var im = imgSrc[i]; rawImgs.push(typeof im === 'string' ? im : (im.url || im.src || '')); }
  var imgs = __cleanImgs(rawImgs, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'PISOS_COM',
    title: pr.title || pr.name || document.title,
    price: __price(pr.price || (pr.offers && pr.offers.price)) || __priceDom(),
    rooms: pr.rooms || pr.bedrooms || null,
    bathrooms: pr.bathrooms || null,
    builtArea: pr.area || pr.builtArea || pr.constructedArea || null,
    usableArea: pr.usableArea || null,
    city: pr.city || (pr.location && pr.location.city) || null,
    province: pr.province || (pr.location && pr.location.province) || null,
    description: __desc([pr.description, pr.comment, pr.adText]),
    images: imgs, features: __features()
  }});
  return;
}
var ld = __jsonLd('RealEstateListing') || __jsonLd('Apartment');
if (ld) {
  var li = []; if (ld.image) { var a = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i=0;i<a.length;i++){ var im=a[i]; li.push(typeof im==='string'?im:(im.url||im.contentUrl||'')); } }
  var imgs = __cleanImgs(li, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'PISOS_COM',
    title: ld.name || document.title,
    price: __price(ld.offers && ld.offers.price) || __priceDom(),
    description: __desc([ld.description]),
    images: imgs, features: __features()
  }});
  return;
}
__post({ type: 'extracted', data: { url: ${JSON.stringify(url)}, portal: 'PISOS_COM', title: document.title, price: __priceDom(), description: __desc([]), images: __imgs(60), features: __features() }});
`;

const HABITACLIA_SCRIPT = (url: string) => `
var nd = window.__NEXT_DATA__;
var pp = nd && nd.props && nd.props.pageProps;
var ad = pp && (pp.ad || pp.property || pp.listing);
if (ad) {
  var rawImgs = [];
  if (ad.multimedia && ad.multimedia.images) { for (var i = 0; i < ad.multimedia.images.length; i++) { var im = ad.multimedia.images[i]; if (im) rawImgs.push(im.url || im.src || ''); } }
  var imgs = __cleanImgs(rawImgs, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'HABITACLIA',
    title: ad.title || ad.name || document.title,
    price: __price(ad.price || (ad.priceInfo && ad.priceInfo.amount)) || __priceDom(),
    rooms: ad.rooms || null,
    bathrooms: ad.bathrooms || null,
    builtArea: ad.constructedArea || ad.surface || null,
    usableArea: ad.usableArea || null,
    city: (ad.ubication && (ad.ubication.municipality || ad.ubication.city)) || null,
    province: (ad.ubication && ad.ubication.province) || null,
    description: __desc([ad.description, ad.comment]),
    images: imgs, features: __features()
  }});
  return;
}
__post({ type: 'extracted', data: { url: ${JSON.stringify(url)}, portal: 'HABITACLIA', title: document.title, price: __priceDom(), description: __desc([]), images: __imgs(60), features: __features() }});
`;

// Idealista (DataDome): la extracción REINTENTA con espera antes de rendirse.
// El interstitial de DataDome puede montarse tarde (iframe async) y la página
// real puede tardar en hidratar — el patrón anterior "challenge o extrae YA"
// mandaba extracciones vacías (→ guard anti-vacío) sin dar tiempo a ninguna de
// las dos cosas. Ahora: challenge → fuera; datos sustanciales (JSON-LD, h1 o
// precio) → extrae; nada aún → espera 1,5s y reintenta (máx. 3); agotado →
// manda lo que haya (el guard del importador avisará con err_empty_listing).
const IDEALISTA_SCRIPT = (url: string) => `
var __extract = function() {
  var sp = __specs();
  var ld = __jsonLd('RealEstateListing');
  if (ld) {
    var imgArr = [];
    if (ld.image) { var src = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i = 0; i < src.length; i++) { var im = src[i]; imgArr.push(typeof im === 'string' ? im : (im.url || im.contentUrl || '')); } }
    var imgs = __cleanImgs(imgArr, 60); if (imgs.length < 5) imgs = __imgs(60);
    __post({ type: 'extracted', data: {
      url: ${JSON.stringify(url)}, portal: 'IDEALISTA',
      title: ld.name || document.title,
      price: __price(ld.offers && ld.offers.price) || __priceDom(),
      description: __desc([ld.description]),
      // El JSON-LD de Idealista no publica baños nunca, y a veces tampoco
      // habitaciones: se completa con lo leído del texto de la ficha.
      rooms: ld.numberOfRooms || sp.rooms,
      bathrooms: sp.bathrooms,
      builtArea: (ld.floorSize && ld.floorSize.value) ? Math.round(ld.floorSize.value) : sp.builtArea,
      address: (ld.address && ld.address.streetAddress) || null,
      city: (ld.address && ld.address.addressLocality) || null,
      province: (ld.address && ld.address.addressRegion) || null,
      postalCode: (ld.address && ld.address.postalCode) || null,
      latitude: (ld.geo && ld.geo.latitude) || null,
      longitude: (ld.geo && ld.geo.longitude) || null,
      images: imgs, features: __features()
    }});
    return true;
  }
  var titleEl = document.querySelector('h1.main-info__title, span.main-info__title-main, h1');
  var hasTitle = titleEl && titleEl.innerText && titleEl.innerText.trim().length > 3;
  if (hasTitle || __priceDom()) {
    __post({ type: 'extracted', data: {
      url: ${JSON.stringify(url)}, portal: 'IDEALISTA',
      title: hasTitle ? titleEl.innerText.trim() : document.title,
      price: __priceDom(),
      // Sin JSON-LD, ESTA es la única fuente de características: sin ella el
      // registro se guardaba sin metros, habitaciones ni baños.
      rooms: sp.rooms, bathrooms: sp.bathrooms, builtArea: sp.builtArea,
      description: __desc([]),
      images: __imgs(60), features: __features()
    }});
    return true;
  }
  return false;
};
var __tries = 0;
var __run = function() {
  // Challenge visible: avisa a la app (muestra el WebView) y SIGUE SONDEANDO —
  // si el usuario resuelve el captcha sin que DataDome recargue la página (quita
  // el iframe y continúa), no habría loadEnd que re-inyecte: este timer extrae.
  if (__challenge()) { __post({ type: 'challenge' }); setTimeout(__run, 2000); return; }
  if (__extract()) return;
  if (__tries++ < 3) { setTimeout(__run, 1500); return; }
  // Sin datos tras ~4,5s y sin challenge detectable: manda lo que haya.
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'IDEALISTA',
    title: document.title, price: __priceDom(), description: __desc([]),
    rooms: sp.rooms, bathrooms: sp.bathrooms, builtArea: sp.builtArea,
    images: __imgs(60), features: __features()
  }});
};
// Evita carreras si el WebView re-inyecta sobre el MISMO documento (cada
// navegación/reload crea documento nuevo → el flag se resetea solo).
if (!window.__nkIdealistaRunning) { window.__nkIdealistaRunning = true; __run(); }
`;

const MILANUNCIOS_SCRIPT = (url: string) => `
if (__challenge()) { __post({ type: 'challenge' }); return; }
var ld = __jsonLd('Product') || __jsonLd('RealEstateListing');
if (ld) {
  var imgArr = []; if (ld.image) { var src = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i = 0; i < src.length; i++) { var im = src[i]; imgArr.push(typeof im === 'string' ? im : (im.url || im.contentUrl || '')); } }
  var imgs = __cleanImgs(imgArr, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'MILANUNCIOS',
    title: ld.name || document.title,
    price: __price(ld.offers && ld.offers.price) || __priceDom(),
    description: __desc([ld.description]),
    images: imgs, features: __features()
  }});
  return;
}
var titleEl = document.querySelector('h1, [class*="title"]');
__post({ type: 'extracted', data: {
  url: ${JSON.stringify(url)}, portal: 'MILANUNCIOS',
  title: (titleEl && titleEl.innerText && titleEl.innerText.trim()) || document.title,
  price: __priceDom(),
  description: __desc([]),
  images: __imgs(60), features: __features()
}});
`;

const YAENCONTRE_SCRIPT = (url: string) => `
var nd = window.__NEXT_DATA__;
var pp = nd && nd.props && nd.props.pageProps;
var pr = pp && (pp.property || pp.ad || pp.listing || pp.detail);
if (pr) {
  var imgSrc = pr.images || pr.photos || pr.multimedia || [];
  var rawImgs = [];
  for (var i = 0; i < imgSrc.length; i++) { var im = imgSrc[i]; rawImgs.push(typeof im === 'string' ? im : (im.url || im.src || '')); }
  var imgs = __cleanImgs(rawImgs, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'YAENCONTRE',
    title: pr.title || pr.name || document.title,
    price: __price(pr.price || (pr.offers && pr.offers.price)) || __priceDom(),
    rooms: pr.rooms || pr.bedrooms || null,
    bathrooms: pr.bathrooms || null,
    builtArea: pr.area || pr.constructedArea || null,
    city: pr.city || (pr.location && pr.location.city) || null,
    description: __desc([pr.description, pr.comment, pr.adText]),
    images: imgs, features: __features()
  }});
  return;
}
var ld = __jsonLd('RealEstateListing');
if (ld) {
  var li = []; if (ld.image) { var a = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i=0;i<a.length;i++){ var im=a[i]; li.push(typeof im==='string'?im:(im.url||im.contentUrl||'')); } }
  var imgs = __cleanImgs(li, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: 'YAENCONTRE',
    title: ld.name || document.title,
    price: __price(ld.offers && ld.offers.price) || __priceDom(),
    description: __desc([ld.description]),
    images: imgs, features: __features()
  }});
  return;
}
__post({ type: 'extracted', data: { url: ${JSON.stringify(url)}, portal: 'YAENCONTRE', title: document.title, price: __priceDom(), description: __desc([]), images: __imgs(60), features: __features() }});
`;

const GENERIC_SCRIPT = (url: string, portal: string) => `
var sp = __specs();
var ld = __jsonLd('RealEstateListing') || __jsonLd('Apartment') || __jsonLd('House') || __jsonLd('Product');
if (ld) {
  var li = []; if (ld.image) { var a = Array.isArray(ld.image) ? ld.image : [ld.image]; for (var i=0;i<a.length;i++){ var im=a[i]; li.push(typeof im==='string'?im:(im.url||im.contentUrl||'')); } }
  var imgs = __cleanImgs(li, 60); if (imgs.length < 5) imgs = __imgs(60);
  __post({ type: 'extracted', data: {
    url: ${JSON.stringify(url)}, portal: ${JSON.stringify(portal)},
    title: ld.name || document.title,
    price: __price(ld.offers && ld.offers.price) || __priceDom(),
    rooms: ld.numberOfRooms || sp.rooms,
    bathrooms: sp.bathrooms,
    builtArea: (ld.floorSize && ld.floorSize.value) ? Math.round(ld.floorSize.value) : sp.builtArea,
    city: (ld.address && ld.address.addressLocality) || null,
    description: __desc([ld.description]),
    images: imgs, features: __features()
  }});
  return;
}
__post({ type: 'extracted', data: { url: ${JSON.stringify(url)}, portal: ${JSON.stringify(portal)}, title: document.title, price: __priceDom(), rooms: sp.rooms, bathrooms: sp.bathrooms, builtArea: sp.builtArea, description: __desc([]), images: __imgs(60), features: __features() }});
`;

// ─── Public API ───────────────────────────────────────────────────────────────

export function getExtractorScript(url: string): string {
  const portal = detectPortal(url);

  let portalCode: string;
  switch (portal) {
    case "FOTOCASA":   portalCode = FOTOCASA_SCRIPT(url); break;
    case "PISOS_COM":  portalCode = PISOS_SCRIPT(url); break;
    case "HABITACLIA": portalCode = HABITACLIA_SCRIPT(url); break;
    case "IDEALISTA":  portalCode = IDEALISTA_SCRIPT(url); break;
    case "MILANUNCIOS": portalCode = MILANUNCIOS_SCRIPT(url); break;
    case "YAENCONTRE": portalCode = YAENCONTRE_SCRIPT(url); break;
    default:           portalCode = GENERIC_SCRIPT(url, portal);
  }

  return `(function() {
  try {
    ${SHARED_HELPERS}
    // Declaración (no expresión) para que __post la vea por hoisting al reintentar.
    function __extract() {
      try {
        ${portalCode}
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', reason: String(e && e.message || e) }));
      }
    }
    __extract();
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', reason: String(e && e.message || e) }));
  }
})();
true;`;
}
