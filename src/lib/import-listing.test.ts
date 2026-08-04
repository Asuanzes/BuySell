import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  detectPortal,
  filterImages,
  parseFeaturesArray,
  sanitizePayload,
  type ImportListingPayload,
} from "./import-listing";

/**
 * Caracterización del NÚCLEO PURO de la importación de anuncios.
 *
 * `import-listing.ts` es el camino de escritura de todo inmueble del producto
 * —precios en céntimos, dedup por `Listing.url` (@unique global), guard
 * cross-owner, snapshots, alertas y media— y hasta ahora no tenía ni una sola
 * prueba. Estas cubren sus cuatro funciones puras, que son las que deciden qué
 * dato entra en la base: no tocan Prisma ni la red.
 *
 * Son de CARACTERIZACIÓN: fijan lo que el código hace HOY, para que un refactor
 * posterior tenga red. Donde el comportamiento actual es discutible se dice en
 * el propio caso, en vez de bendecirlo en silencio.
 *
 * Bandas de cordura (packages/shared/src/sanity.ts): venta 10.000–50.000.000 €,
 * renta 100–50.000 €/mes, superficie 5–5.000 m², parcela 5–1.000.000 m².
 */

function payload(over: Partial<ImportListingPayload> = {}): ImportListingPayload {
  return {
    url: "https://www.idealista.com/inmueble/12345678/",
    title: "Piso en venta",
    images: [],
    features: [],
    ...over,
  } as ImportListingPayload;
}

describe("detectPortal", () => {
  it("reconoce cada portal por su dominio, sin importar mayúsculas ni subdominio", () => {
    assert.equal(detectPortal("https://WWW.Idealista.COM/inmueble/1/"), "IDEALISTA");
    assert.equal(detectPortal("https://www.fotocasa.es/es/alquiler/vivienda/x/1/d"), "FOTOCASA");
    assert.equal(detectPortal("https://www.pisos.com/alquiler/pisos-gijon/x-12345_1/"), "PISOS_COM");
    assert.equal(detectPortal("https://www.milanuncios.com/x-123456.htm"), "MILANUNCIOS");
    assert.equal(detectPortal("https://www.habitaclia.com/x"), "HABITACLIA");
    assert.equal(detectPortal("https://www.yaencontre.com/x"), "YAENCONTRE");
    assert.equal(detectPortal("https://www.thinkspain.com/x"), "THINKSPAIN");
    assert.equal(detectPortal("https://www.indomio.es/x"), "INDOMIO");
  });

  it("un dominio desconocido es OTHER, no un fallo", () => {
    assert.equal(detectPortal("https://www.example.com/piso"), "OTHER");
    assert.equal(detectPortal(""), "OTHER");
  });
});

describe("filterImages", () => {
  it("exige http(s) y descarta svg y gif", () => {
    assert.deepEqual(
      filterImages([
        "https://cdn.portal.com/foto1.jpg",
        "ftp://cdn.portal.com/foto2.jpg",
        "/relativa/foto3.jpg",
        "https://cdn.portal.com/dibujo.svg",
        "https://cdn.portal.com/anim.gif",
      ]),
      ["https://cdn.portal.com/foto1.jpg"]
    );
  });

  it("deduplica por ruta pero CONSERVA la query, que puede ser la firma de la URL", () => {
    // Dos URLs firmadas de la misma foto son la misma foto; se queda la primera
    // entera, con su firma, porque sin ella el CDN devuelve 403.
    const out = filterImages([
      "https://cdn.portal.com/foto.jpg?sig=abc",
      "https://cdn.portal.com/foto.jpg?sig=def",
    ]);
    assert.deepEqual(out, ["https://cdn.portal.com/foto.jpg?sig=abc"]);
  });

  it("descarta basura de marca y mapas, por SEGMENTO de ruta y por host", () => {
    assert.deepEqual(
      filterImages([
        "https://cdn.portal.com/logo.png",
        "https://cdn.portal.com/img/icons/casa.png",
        "https://maps.google.com/staticmap?c=1",
        "https://cdn.portal.com/watermark-foto.jpg",
        "https://cdn.portal.com/real.jpg",
      ]),
      ["https://cdn.portal.com/real.jpg"]
    );
  });

  it("no descarta una foto sólo porque la palabra aparezca DENTRO de otra", () => {
    // El filtro va por segmento: /static/ y /assets/ sirven fotos de verdad y
    // "iconos" no debe llevarse "biconos" ni /static/ contener "atic".
    const out = filterImages([
      "https://cdn.portal.com/static/foto.jpg",
      "https://cdn.portal.com/assets/salon.jpg",
    ]);
    assert.equal(out.length, 2);
  });

  it("tope de 60 fotos", () => {
    const many = Array.from({ length: 80 }, (_, i) => `https://cdn.portal.com/f${i}.jpg`);
    assert.equal(filterImages(many).length, 60);
  });

  it("undefined y vacío no rompen", () => {
    assert.deepEqual(filterImages(undefined), []);
    assert.deepEqual(filterImages([]), []);
  });
});

describe("parseFeaturesArray", () => {
  it("lee superficies distinguiendo construida, útil y parcela", () => {
    const out = parseFeaturesArray([
      "186 m2",
      "65 m² útiles",
      "Parcela de 1.200 m²",
    ]);
    assert.equal(out.builtArea, 186);
    assert.equal(out.usableArea, 65);
    assert.equal(out.plotArea, 1200);
  });

  it("no confunde los metros de la terraza con los de la vivienda", () => {
    const out = parseFeaturesArray(["Terraza de 12 m²"]);
    assert.equal(out.builtArea, undefined);
  });

  it("ignora el precio por metro, que no es una superficie", () => {
    const out = parseFeaturesArray(["4.153 €/m²"]);
    assert.equal(out.builtArea, undefined);
  });

  it("lee habitaciones, baños, año y planta", () => {
    const out = parseFeaturesArray([
      "4 hab.",
      "3 baños",
      "Construido en 1931",
      "4ª Planta",
    ]);
    assert.equal(out.rooms, 4);
    assert.equal(out.bathrooms, 3);
    assert.equal(out.yearBuilt, 1931);
    assert.equal(out.floor, "4ª Planta");
  });

  it("un 0 de habitaciones es un dato real (un estudio) y no lo pisa una feature posterior", () => {
    // El guard de rango acepta explícitamente `num >= 0`, así que 0 es válido.
    // Antes se protegía con `!out.rooms`, que da true para 0, y la segunda
    // mención de habitaciones lo sobrescribía: un estudio acababa con 2.
    const out = parseFeaturesArray(["0 habitaciones", "2 habitaciones dobles"]);
    assert.equal(out.rooms, 0);
    const baths = parseFeaturesArray(["0 baños", "2 baños"]);
    assert.equal(baths.bathrooms, 0);
  });

  it("la primera mención gana cuando ambas son válidas", () => {
    assert.equal(parseFeaturesArray(["3 habitaciones", "5 habitaciones"]).rooms, 3);
  });

  it("lee amenidades y entiende la negación", () => {
    const yes = parseFeaturesArray(["Ascensor", "Garaje", "Piscina"]);
    assert.equal(yes.hasElevator, true);
    assert.equal(yes.hasGarage, true);
    assert.equal(yes.hasPool, true);

    const no = parseFeaturesArray(["Sin ascensor", "No dispone de garaje"]);
    assert.equal(no.hasElevator, false);
    assert.equal(no.hasGarage, false);
  });

  it("la eficiencia energética exige la palabra clave, no una letra suelta", () => {
    assert.equal(parseFeaturesArray(["Certificación energética: D"]).energyRating, "D");
    // Sin la palabra clave, una letra aislada no es una calificación.
    assert.equal(parseFeaturesArray(["Portal D"]).energyRating, undefined);
  });

  it("entrada vacía o basura devuelve un objeto vacío", () => {
    assert.deepEqual(parseFeaturesArray(undefined), {});
    assert.deepEqual(parseFeaturesArray([]), {});
    assert.deepEqual(parseFeaturesArray(["", "   "]), {});
  });
});

describe("sanitizePayload — banda de precio según la operación", () => {
  it("una renta de 850 € sobrevive en RENT y se nulea en SALE", () => {
    // Es la razón de que la banda sea propia: isValidPriceEur exige >= 10.000,
    // así que sin banda de renta todo alquiler entraría a null.
    assert.equal(sanitizePayload(payload({ price: 850, operationType: "RENT" })).price, 850);
    assert.equal(sanitizePayload(payload({ price: 850, operationType: "SALE" })).price, null);
  });

  it("un precio de venta de 220.000 € se nulea si se declara como alquiler", () => {
    // 220.000 excede el techo de renta (50.000/mes): es un precio de venta mal
    // etiquetado y entrar así corrompería la columna de renta.
    assert.equal(sanitizePayload(payload({ price: 220000, operationType: "RENT" })).price, null);
  });

  it("sin operationType se asume VENTA, y por eso una renta se pierde", () => {
    // Retrocompatibilidad con los imports antiguos. Es también la razón de que
    // el detalle de búsqueda mande la operación de la búsqueda como respaldo.
    assert.equal(sanitizePayload(payload({ price: 850 })).price, null);
  });

  it("effectiveOperation manda sobre el payload en un re-import", () => {
    // Un re-import de un alquiler cuyo payload no traiga operationType debe
    // seguir validándose como alquiler: si no, cada re-import nulearía la renta
    // y el cambio de precio jamás se registraría.
    const p = payload({ price: 850 });
    assert.equal(sanitizePayload(p, "RENT").price, 850);
  });

  it("RENT_TO_OWN se valida hoy con la banda de VENTA", () => {
    // Comportamiento ACTUAL, deliberado del lado de escritura y documentado en
    // features/scraping/recheck-plan.ts y matching/auto-merge-guard.ts: el
    // alquiler con opción a compra se sigue por su precio de venta.
    // ⚠️ El buscador de alquiler (lib/rentals/filters.ts) asume lo contrario y
    // lo consulta por monthlyRent. La contradicción está abierta y decidida
    // aparte; esta prueba fija el lado de escritura para que el cambio se vea.
    assert.equal(sanitizePayload(payload({ price: 850, operationType: "RENT_TO_OWN" })).price, null);
    assert.equal(sanitizePayload(payload({ price: 220000, operationType: "RENT_TO_OWN" })).price, 220000);
  });
});

describe("sanitizePayload — cordura del resto de campos", () => {
  it("nulea superficies, año y coordenadas fuera de banda", () => {
    const out = sanitizePayload(
      payload({
        builtArea: 99999,
        usableArea: 1,
        plotArea: 2,
        yearBuilt: 1200,
        latitude: 120,
        longitude: -200,
      })
    );
    assert.equal(out.builtArea, null);
    assert.equal(out.usableArea, null);
    assert.equal(out.plotArea, null);
    assert.equal(out.yearBuilt, null);
    assert.equal(out.latitude, null);
    assert.equal(out.longitude, null);
  });

  it("conserva valores dentro de banda", () => {
    const out = sanitizePayload(
      payload({ builtArea: 90, yearBuilt: 1990, latitude: 43.53, longitude: -5.66 })
    );
    assert.equal(out.builtArea, 90);
    assert.equal(out.yearBuilt, 1990);
    assert.equal(out.latitude, 43.53);
  });

  it("habitaciones y baños absurdos se nulean; el 0 se conserva", () => {
    assert.equal(sanitizePayload(payload({ rooms: 99 })).rooms, null);
    assert.equal(sanitizePayload(payload({ bathrooms: -1 })).bathrooms, null);
    assert.equal(sanitizePayload(payload({ rooms: 0 })).rooms, 0);
  });

  it("rellena los huecos desde `features` sólo cuando el campo viene vacío", () => {
    const out = sanitizePayload(payload({ builtArea: null, features: ["90 m2", "3 hab."] }));
    assert.equal(out.builtArea, 90);
    assert.equal(out.rooms, 3);

    // Y no pisa lo que ya venía bien en el payload.
    const kept = sanitizePayload(payload({ builtArea: 120, features: ["90 m2"] }));
    assert.equal(kept.builtArea, 120);
  });

  it("recupera un dato que la banda acababa de nulear", () => {
    // La secuencia importa: primero se nulea lo absurdo, después se re-parsea
    // features. Un builtArea imposible en el JSON puede salvarse del texto.
    const out = sanitizePayload(payload({ builtArea: 99999, features: ["90 m2"] }));
    assert.equal(out.builtArea, 90);
  });

  it("filtra las imágenes basura también en el servidor", () => {
    const out = sanitizePayload(
      payload({ images: ["https://cdn.x.com/logo.png", "https://cdn.x.com/salon.jpg"] })
    );
    assert.deepEqual(out.images, ["https://cdn.x.com/salon.jpg"]);
  });

  it("una descripción basura entra como null, no como texto incorrecto", () => {
    const out = sanitizePayload(
      payload({ description: "Utilizamos cookies propias y de terceros para mejorar tu experiencia" })
    );
    assert.equal(out.description, null);
  });

  it("una descripción real se conserva limpia", () => {
    const out = sanitizePayload(
      payload({ description: "  Luminoso piso reformado   con vistas al mar y garaje incluido.  " })
    );
    assert.ok(out.description && out.description.includes("Luminoso piso reformado"));
    assert.ok(!out.description.startsWith(" "));
  });

  it("no muta el payload recibido", () => {
    const p = payload({ price: 850, operationType: "SALE" });
    sanitizePayload(p);
    assert.equal(p.price, 850, "sanitizePayload debe devolver copia, no editar el original");
  });
});
