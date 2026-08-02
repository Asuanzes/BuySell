import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickBestMunicipality, type CartoCiudadCandidate } from "./cartociudad";
import { canonicalProvinceLoose, isProvinceOnlyQuery } from "./geo-es";

/**
 * Sin red: se testea la ELECCIÓN de candidato, que es donde se corrompen datos.
 * Las respuestas de abajo reproducen la forma real del servicio del IGN
 * (campos `muni`, `muniCode`, `province`, `type`, `state`).
 */

const portal: CartoCiudadCandidate = {
  type: "portal",
  address: "CALLE URIA 1",
  muni: "Oviedo",
  muniCode: "33044",
  province: "Asturias",
  state: 1,
};
const municipio: CartoCiudadCandidate = {
  type: "municipio",
  muni: "Oviedo",
  muniCode: "33044",
  province: "Asturias",
  state: 1,
};
const provinciaSola: CartoCiudadCandidate = {
  type: "provincia",
  muni: null,
  province: "Asturias",
  state: 1,
};

describe("canonicalProvinceLoose", () => {
  it("entiende la forma bilingüe del INE/IGN", () => {
    assert.equal(canonicalProvinceLoose("Araba/Álava"), "Álava");
    assert.equal(canonicalProvinceLoose("Valencia/València"), "Valencia");
    assert.equal(canonicalProvinceLoose("Bizkaia"), "Vizcaya");
    assert.equal(canonicalProvinceLoose("Gipuzkoa"), "Guipúzcoa");
  });

  it("sigue resolviendo lo que ya resolvía y no inventa", () => {
    assert.equal(canonicalProvinceLoose("Madrid"), "Madrid");
    assert.equal(canonicalProvinceLoose("bilbao"), "Vizcaya");
    assert.equal(canonicalProvinceLoose("Narnia/Gondor"), undefined);
    assert.equal(canonicalProvinceLoose(""), undefined);
    assert.equal(canonicalProvinceLoose(null), undefined);
  });
});

describe("isProvinceOnlyQuery", () => {
  it("detecta las consultas que no pueden identificar un municipio", () => {
    assert.equal(isProvinceOnlyQuery("Asturias"), true);
    assert.equal(isProvinceOnlyQuery("Madrid, España"), true);
    assert.equal(isProvinceOnlyQuery("  "), true);
  });

  it("no marca como amplia una consulta con calle o municipio", () => {
    assert.equal(isProvinceOnlyQuery("Calle Uría 1, Oviedo, Asturias"), false);
    assert.equal(isProvinceOnlyQuery("Gijón, Asturias"), false);
    assert.equal(isProvinceOnlyQuery("33001"), false);
  });
});

describe("pickBestMunicipality", () => {
  it("prefiere el candidato más preciso", () => {
    const match = pickBestMunicipality([municipio, portal]);
    assert.equal(match?.matchedType, "portal");
    assert.equal(match?.city, "Oviedo");
    assert.equal(match?.province, "Asturias");
    assert.equal(match?.municipalityCode, "33044");
  });

  it("descarta lo que no llega a municipio (nunca pone un centroide)", () => {
    assert.equal(pickBestMunicipality([provinciaSola]), null);
    assert.equal(pickBestMunicipality([]), null);
  });

  it("descarta candidatos con provincia que no reconocemos", () => {
    const extranjero: CartoCiudadCandidate = {
      type: "municipio",
      muni: "Braga",
      province: "Braga",
      state: 1,
    };
    assert.equal(pickBestMunicipality([extranjero]), null);
  });

  it("con pista de provincia, gana la de esa provincia aunque sea menos precisa", () => {
    const homonimoOtraProvincia: CartoCiudadCandidate = {
      type: "portal",
      muni: "Villanueva",
      muniCode: "06153",
      province: "Badajoz",
      state: 1,
    };
    const enLaPistada: CartoCiudadCandidate = {
      type: "municipio",
      muni: "Villanueva de Oscos",
      muniCode: "33075",
      province: "Asturias",
      state: 1,
    };
    const match = pickBestMunicipality([homonimoOtraProvincia, enLaPistada], {
      province: "Asturias",
    });
    assert.equal(match?.city, "Villanueva de Oscos");
    assert.equal(match?.province, "Asturias");
  });

  it("si la pista de provincia no casa con NINGÚN candidato, es ambiguo", () => {
    // Devolver el candidato de otra provincia dejaría la ficha contradictoria
    // (municipio de Asturias con provincia Madrid). Ambiguo = no tocar.
    assert.equal(pickBestMunicipality([portal], { province: "Madrid" }), null);
  });

  it("la pista se interpreta con la misma tolerancia bilingüe", () => {
    const bilbao: CartoCiudadCandidate = {
      type: "municipio", muni: "Bilbao", muniCode: "48020", province: "Bizkaia", state: 1,
    };
    assert.equal(pickBestMunicipality([bilbao], { province: "Bizkaia" })?.city, "Bilbao");
    assert.equal(pickBestMunicipality([bilbao], { province: "Vizcaya" })?.city, "Bilbao");
  });

  it("con consulta de sólo provincia, ignora calles y portales", () => {
    // Caso REAL del informe del 2026-08-02: cinco fichas cuya única pista era
    // "Asturias" resolvían todas a la calle Asturias de Corvera. Un homónimo
    // de calle no dice dónde está el inmueble.
    const calleAsturias: CartoCiudadCandidate = {
      type: "callejero",
      address: "CALLE ASTURIAS",
      muni: "Corvera de Asturias",
      muniCode: "33020",
      province: "Asturias",
      state: 1,
    };
    assert.equal(
      pickBestMunicipality([calleAsturias], { province: "Asturias", onlyMunicipalityLevel: true }),
      null
    );
    // Pero un municipio real sí vale con la misma consulta amplia ("Madrid").
    const muniMadrid: CartoCiudadCandidate = {
      type: "municipio", muni: "Madrid", muniCode: "28079", province: "Madrid", state: 1,
    };
    assert.equal(
      pickBestMunicipality([muniMadrid], { onlyMunicipalityLevel: true })?.city,
      "Madrid"
    );
  });

  it("acepta la provincia bilingüe que devuelve el IGN", () => {
    const bilbao: CartoCiudadCandidate = {
      type: "municipio",
      muni: "Bilbao",
      muniCode: "48020",
      province: "Bizkaia",
      state: 1,
    };
    assert.equal(pickBestMunicipality([bilbao])?.province, "Vizcaya");
  });
});
