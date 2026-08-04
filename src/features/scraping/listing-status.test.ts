import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isGoneStatus, nextListingStatus } from "./listing-status";

/**
 * La regla de estado tras observar un anuncio. Estaba duplicada entre la
 * importación y el recheck, y sólo una copia tenía pruebas; ahora es una sola
 * función y se prueba entera.
 */

const base = {
  priceChanged: false,
  previousPrice: null as number | null,
  newPrice: null as number | null,
  wasGone: false,
  fallbackStatus: "ACTIVE" as const,
};

describe("nextListingStatus", () => {
  it("sin cambio de precio conserva el estado que se le pase", () => {
    assert.equal(nextListingStatus({ ...base, fallbackStatus: "PRICE_DROP" }), "PRICE_DROP");
    assert.equal(nextListingStatus({ ...base, fallbackStatus: "UNKNOWN" }), "UNKNOWN");
  });

  it("distingue bajada de subida", () => {
    const changed = { ...base, priceChanged: true, previousPrice: 22_000_000 };
    assert.equal(nextListingStatus({ ...changed, newPrice: 21_000_000 }), "PRICE_DROP");
    assert.equal(nextListingStatus({ ...changed, newPrice: 23_000_000 }), "PRICE_UP");
  });

  it("el PRIMER precio conocido no es una bajada", () => {
    // El caso que hubo que arreglar: un anuncio con "precio a consultar" que por
    // fin publica cifra. previousPrice es null y cualquier número es menor que
    // nada, así que salía como PRICE_DROP y disparaba alerta de bajada.
    const out = nextListingStatus({
      ...base,
      priceChanged: true,
      previousPrice: null,
      newPrice: 22_000_000,
      fallbackStatus: "UNKNOWN",
    });
    assert.equal(out, "UNKNOWN", "no debe etiquetarse como PRICE_DROP");
  });

  it("un anuncio que reaparece vuelve a ACTIVE, con o sin cambio de precio", () => {
    // Antes un REMOVED era irreversible: si la página volvía a responder, el
    // anuncio se quedaba enterrado para siempre.
    assert.equal(
      nextListingStatus({ ...base, wasGone: true, fallbackStatus: "REMOVED" }),
      "ACTIVE"
    );
    assert.equal(
      nextListingStatus({
        ...base,
        priceChanged: true,
        previousPrice: null,
        newPrice: 90_000,
        wasGone: true,
        fallbackStatus: "REMOVED",
      }),
      "ACTIVE"
    );
  });

  it("reaparecer CON cambio de precio conocido sí etiqueta el movimiento", () => {
    // Aquí manda el precio: el usuario quiere enterarse de que bajó, y que esté
    // vivo se deduce de que tenga precio nuevo.
    assert.equal(
      nextListingStatus({
        ...base,
        priceChanged: true,
        previousPrice: 22_000_000,
        newPrice: 20_000_000,
        wasGone: true,
        fallbackStatus: "REMOVED",
      }),
      "PRICE_DROP"
    );
  });

  it("mismo precio no es cambio: priceChanged manda sobre los números", () => {
    assert.equal(
      nextListingStatus({
        ...base,
        priceChanged: false,
        previousPrice: 22_000_000,
        newPrice: 21_000_000,
        fallbackStatus: "ACTIVE",
      }),
      "ACTIVE"
    );
  });
});

describe("isGoneStatus", () => {
  it("sólo REMOVED y SOLD cuentan como desaparecido", () => {
    assert.equal(isGoneStatus("REMOVED"), true);
    assert.equal(isGoneStatus("SOLD"), true);
    assert.equal(isGoneStatus("ACTIVE"), false);
    assert.equal(isGoneStatus("PRICE_DROP"), false);
    assert.equal(isGoneStatus("UNKNOWN"), false);
  });
});
