import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { extractPriceEur } from "./adapters/_genericAdapter";

/** Extracción de precio sobre HTML fijo (sin red). */

const SELECTORS = ["[class*='Price']", "[itemprop='price']"];

describe("extractPriceEur — alquiler (banda de renta)", () => {
  it("detecta una renta de 850 € (antes la banda de venta la descartaba siempre)", () => {
    const $ = cheerio.load(`<html><body><span class="re-Price">850 € /mes</span></body></html>`);
    const p = extractPriceEur($, {
      priceSelectors: SELECTORS,
      previousPriceCents: 90_000, // 900 €/mes
      operationType: "RENT",
    });
    assert.equal(p, 850);
  });

  it("acepta renta vía JSON-LD offers.price", () => {
    const $ = cheerio.load(
      `<html><head><script type="application/ld+json">{"@type":"Offer","offers":{"price":875}}</script></head><body></body></html>`
    );
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: 90_000, operationType: "RENT" }),
      875
    );
  });

  it("rechaza importes fuera de la banda de renta (100–50.000 €)", () => {
    const $ = cheerio.load(`<html><body><span class="Price">60 €</span></body></html>`);
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: null, operationType: "RENT" }),
      null
    );
  });

  it("sin last-resort en alquiler: un número suelto del body no cuela", () => {
    const $ = cheerio.load(`<html><body><p>Llámanos: 900 123 456. Piso céntrico.</p></body></html>`);
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: null, operationType: "RENT" }),
      null
    );
  });
});

describe("extractPriceEur — venta", () => {
  it("detecta 210.000 € por selector", () => {
    const $ = cheerio.load(`<html><body><span class="re-DetailHeader-Price">210.000 €</span></body></html>`);
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: 22_000_000, operationType: "SALE" }),
      210_000
    );
  });

  it("descarta candidatos fuera de ±50% del precio anterior (banners/relacionados)", () => {
    const $ = cheerio.load(
      `<html><body>
        <span class="Price">89.000 €</span>
        <span class="Price">210.000 €</span>
      </body></html>`
    );
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: 22_000_000, operationType: "SALE" }),
      210_000
    );
  });

  it("una renta de 850 € NUNCA se cuela como precio de venta", () => {
    const $ = cheerio.load(`<html><body><span class="Price">850 €</span></body></html>`);
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: null, operationType: "SALE" }),
      null
    );
  });

  it("last-resort del body solo en venta y primera vez", () => {
    const $ = cheerio.load(`<html><body><div>Precio: 195.000 € — chollo</div></body></html>`);
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: null, operationType: "SALE" }),
      195_000
    );
    // Con precio previo, el last-resort NO se usa (evita banners).
    assert.equal(
      extractPriceEur($, { priceSelectors: SELECTORS, previousPriceCents: 22_000_000, operationType: "SALE" }),
      null
    );
  });
});
