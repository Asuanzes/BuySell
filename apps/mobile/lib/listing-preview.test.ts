import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildPreviewParams,
  isListingSaved,
  markListingSaved,
  parsePreviewParams,
  resetSavedListings,
  subscribeSavedListings,
} from "./listing-preview";
import type { PortalHit } from "./portal-search";

const HIT: PortalHit = {
  url: "https://www.idealista.com/inmueble/12345678/",
  title: "Piso en alquiler en Gijón",
  price: 850,
  rooms: 2,
  area: 70,
  imageUrl: "https://img.idealista.com/a.jpg",
  portal: "IDEALISTA",
};

describe("contrato de navegación lista → detalle de búsqueda", () => {
  it("va y vuelve sin perder ni deformar ningún campo", () => {
    const seed = parsePreviewParams(buildPreviewParams(HIT, "RENT"));
    assert.deepEqual(seed, { ...HIT, operation: "RENT" });
  });

  it("un anuncio sin precio/habitaciones/metros vuelve como null, nunca como 0", () => {
    // Es la trampa de serializar por la ruta: Number("") es 0, y un 0 pinta
    // "0 €" y "0 hab" donde no debe pintarse nada.
    const bare: PortalHit = { ...HIT, price: null, rooms: null, area: null, imageUrl: null };
    const seed = parsePreviewParams(buildPreviewParams(bare, "SALE"));
    assert.equal(seed?.price, null);
    assert.equal(seed?.rooms, null);
    assert.equal(seed?.area, null);
    assert.equal(seed?.imageUrl, null);
    assert.equal(seed?.operation, "SALE");
  });

  it("rechaza una URL que no es de un portal conocido", () => {
    // Un deep link nidokey://listing/preview?url=… llega desde fuera de la app,
    // y la pantalla carga esa URL en un WebView con cookies compartidas.
    assert.equal(parsePreviewParams({ ...buildPreviewParams(HIT, "RENT"), url: "https://evil.example/x" }), null);
    assert.equal(parsePreviewParams({ url: "no-es-una-url" }), null);
    assert.equal(parsePreviewParams({}), null);
  });

  it("una operación desconocida cae a alquiler, no a venta", () => {
    // Importa: `importListing` valida el precio contra la banda de la operación
    // y la de venta empieza en 10.000 €, así que colar un alquiler como venta
    // tiraría el precio del anuncio.
    const seed = parsePreviewParams({ ...buildPreviewParams(HIT, "RENT"), operation: "" });
    assert.equal(seed?.operation, "RENT");
  });
});

describe("señal de anuncios ya guardados", () => {
  beforeEach(resetSavedListings);

  it("marca, consulta y avisa a la lista una sola vez por anuncio", () => {
    let notified = 0;
    const stop = subscribeSavedListings(() => { notified++; });

    assert.equal(isListingSaved(HIT.url), false);
    markListingSaved(HIT.url);
    assert.equal(isListingSaved(HIT.url), true);
    assert.equal(notified, 1);

    // Reañadir el mismo (volver a entrar al detalle) no debe repintar la lista.
    markListingSaved(HIT.url);
    assert.equal(notified, 1);

    stop();
    markListingSaved("https://www.fotocasa.es/es/alquiler/vivienda/gijon/1/d");
    assert.equal(notified, 1, "tras desuscribirse no se notifica");
  });

  it("ignora una URL vacía", () => {
    markListingSaved("");
    assert.equal(isListingSaved(""), false);
  });
});
