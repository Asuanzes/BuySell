import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCandidates } from "./cartociudad";

// Fixture DORADO recortado del endpoint real /geocoder/api/geocoder/candidates
// (capturado 2026-07-30, q="Calle Gloria 51, Santa Cruz de Mudela").
const REAL_ITEM = {
  id: "08.13.G13_130770172267",
  province: "Ciudad Real",
  provinceCode: "13",
  comunidadAutonoma: "Castilla-La Mancha",
  muni: "Santa Cruz de Mudela",
  muniCode: "13077",
  type: "portal",
  address: "CALLE GLORIA 51, Santa Cruz de Mudela",
  postalCode: "13730",
  poblacion: "Santa Cruz de Mudela",
  geom: null,
  tip_via: "CALLE",
  lat: 38.64011327851474,
  lng: -3.4632741861643743,
  portalNumber: 51,
  noNumber: false,
  stateMsg: "",
  extension: null,
  state: 0,
  refCatastral: "9872023VH5797S",
  countryCode: "011",
};

describe("parseCandidates (CartoCiudad)", () => {
  it("fixture real: extrae dirección, coords y RC de parcela como pista", () => {
    const r = parseCandidates([REAL_ITEM]);
    assert.equal(r.length, 1);
    assert.equal(r[0].address, "CALLE GLORIA 51, Santa Cruz de Mudela");
    assert.equal(r[0].municipality, "Santa Cruz de Mudela");
    assert.equal(r[0].province, "Ciudad Real");
    assert.equal(r[0].postalCode, "13730");
    assert.equal(r[0].latitude, 38.64011327851474);
    assert.equal(r[0].longitude, -3.4632741861643743);
    assert.equal(r[0].parcelRefHint, "9872023VH5797S");
    assert.equal(r[0].type, "portal");
  });

  it("filtra por provincia y municipio cuando se conocen", () => {
    const otro = { ...REAL_ITEM, muni: "Valdepeñas", refCatastral: null };
    assert.equal(parseCandidates([REAL_ITEM, otro], { municipality: "Santa Cruz de Mudela" }).length, 1);
    assert.equal(parseCandidates([REAL_ITEM], { province: "Madrid" }).length, 0);
    // El filtro es tolerante a mayúsculas/espacios
    assert.equal(parseCandidates([REAL_ITEM], { province: " ciudad real " }).length, 1);
  });

  it("descarta items sin coordenadas o con coords fuera de rango, sin romper", () => {
    assert.equal(parseCandidates([{ ...REAL_ITEM, lat: null, lng: null }]).length, 0);
    assert.equal(parseCandidates([{ ...REAL_ITEM, lat: 95 }]).length, 0);
    assert.equal(parseCandidates([{ ...REAL_ITEM, lng: -181 }]).length, 0);
    assert.equal(parseCandidates([null, 42, "x", {}]).length, 0);
    assert.equal(parseCandidates("no es un array").length, 0);
    assert.equal(parseCandidates(undefined).length, 0);
  });

  it("refCatastral inválida no se propaga como pista", () => {
    const r = parseCandidates([{ ...REAL_ITEM, refCatastral: "no-es-una-rc" }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].parcelRefHint, undefined);
  });

  it("resultado ambiguo: conserva todos los candidatos (tope 10)", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      ...REAL_ITEM,
      id: `x${i}`,
      address: `CALLE GLORIA ${i}, Santa Cruz de Mudela`,
    }));
    assert.equal(parseCandidates(many).length, 10);
  });
});
