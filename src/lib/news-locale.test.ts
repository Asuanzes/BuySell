import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { newsLocale, newsLocaleFromRequest, parseAcceptLanguage } from "./news-locale";

describe("parseAcceptLanguage", () => {
  it("lee el idioma de una cabecera simple, con o sin región", () => {
    assert.equal(parseAcceptLanguage("en"), "en");
    assert.equal(parseAcceptLanguage("en-US"), "en");
    assert.equal(parseAcceptLanguage("es-ES"), "es");
  });

  it("respeta el factor q, no el orden de aparición", () => {
    // Un navegador puede mandar el preferido en segundo lugar. Coger el primero
    // a secas devolvería inglés a alguien que pidió español.
    assert.equal(parseAcceptLanguage("en;q=0.7,es;q=0.9"), "es");
    assert.equal(parseAcceptLanguage("es;q=0.4,en;q=0.8"), "en");
  });

  it("sin q, la entrada vale 1 y gana a las que sí lo llevan", () => {
    assert.equal(parseAcceptLanguage("en,es;q=0.9"), "en");
  });

  it("ignora los idiomas que no soportamos y sigue buscando", () => {
    assert.equal(parseAcceptLanguage("fr-FR,de;q=0.9,en;q=0.5"), "en");
    assert.equal(parseAcceptLanguage("pt-BR,es;q=0.3"), "es");
  });

  it("descarta las entradas con q=0, que significan «esta no»", () => {
    assert.equal(parseAcceptLanguage("en;q=0,es;q=0.5"), "es");
  });

  it("cae a español ante ausencia o basura", () => {
    assert.equal(parseAcceptLanguage(null), "es");
    assert.equal(parseAcceptLanguage(undefined), "es");
    assert.equal(parseAcceptLanguage(""), "es");
    assert.equal(parseAcceptLanguage("fr-FR,de-DE"), "es");
    assert.equal(parseAcceptLanguage("*"), "es");
  });
});

describe("newsLocale", () => {
  it("cada idioma lleva su región a las TRES fuentes, que es lo que estaba fijo a España", () => {
    const es = newsLocale("es");
    assert.deepEqual(es.yahoo, { region: "ES", lang: "es-ES" });
    assert.deepEqual(es.googleNews, { hl: "es-ES", gl: "ES", ceid: "ES:es" });
    assert.ok(es.benchmarkSymbols.includes("^IBEX"));

    const en = newsLocale("en");
    assert.deepEqual(en.yahoo, { region: "US", lang: "en-US" });
    assert.deepEqual(en.googleNews, { hl: "en-US", gl: "US", ceid: "US:en" });
    assert.ok(!en.benchmarkSymbols.includes("^IBEX"));
    assert.ok(en.benchmarkSymbols.includes("^GSPC"));
  });
});

describe("newsLocaleFromRequest", () => {
  it("resuelve desde la cabecera de la petición", () => {
    const req = (value: string | null) => ({ headers: { get: () => value } });
    assert.equal(newsLocaleFromRequest(req("en-US,en;q=0.9")).lang, "en");
    assert.equal(newsLocaleFromRequest(req(null)).lang, "es");
  });
});
