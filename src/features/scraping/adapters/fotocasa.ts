import { makeGenericAdapter } from "./_genericAdapter";

export const fotocasaAdapter = makeGenericAdapter({
  portal: "FOTOCASA",
  matches: (url) => /fotocasa\.es\//i.test(url),
  priceSelectors: [
    // jul-2026: clases ofuscadas, el precio vive en aria-label="Precio del inmueble"
    "[aria-label*='precio' i]",
    "[class*='Price']",
    ".re-DetailHeader-price",
    "[data-test='price']",
    "[itemprop='price']",
  ],
  externalIdFromUrl: (url) => {
    const m = url.match(/\/(\d+)\/[^/]*\/?$/);
    return m ? m[1] : null;
  },
});
