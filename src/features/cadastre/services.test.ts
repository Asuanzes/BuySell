import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { parseDnploc, parseNearbyParcels, rccoorDistanciaUrl } from "./lookup";

// Mismo parser que producción: parseTagValue:false para NO perder ceros
// iniciales de pc1 (p. ej. "0071701").
const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });

// Fixture DORADO de Consulta_RCCOOR_Distancia (capturado 2026-07-30, punto a
// ~20 m del centroide de 9872023VH5797S — recortado a 3 parcelas).
const DISTANCIA_XML = `<?xml version="1.0" encoding="utf-8"?>
<consulta_coordenadas_distancias xmlns="http://www.catastro.meh.es/">
  <control><cucoor>1</cucoor><cuerr>0</cuerr></control>
  <coordenadas_distancias>
    <coordd>
      <geo><xcen>-3.46328</xcen><ycen>38.64025</ycen><srs>EPSG:4326</srs></geo>
      <lpcd>
        <pcd>
          <pc><pc1>9872023</pc1><pc2>VH5797S</pc2></pc>
          <dt><loine><cp>13</cp><cm>77</cm></loine><lourb><dir><cv>33</cv><pnp>51</pnp></dir></lourb></dt>
          <ldt>CL GLORIA 51 SANTA CRUZ DE MUDELA (CIUDAD REAL)</ldt>
          <dis>0</dis>
        </pcd>
        <pcd>
          <pc><pc1>9872028</pc1><pc2>VH5797S</pc2></pc>
          <dt><loine><cp>13</cp><cm>77</cm></loine><lourb><dir><cv>39</cv><pnp>39</pnp></dir></lourb></dt>
          <ldt>CL JUAN DOMINGO 39 SANTA CRUZ DE MUDELA (CIUDAD REAL)</ldt>
          <dis>8.75</dis>
        </pcd>
        <pcd>
          <pc><pc1>0071701</pc1><pc2>VH6707S</pc2></pc>
          <dt><loine><cp>13</cp><cm>77</cm></loine><lourb><dir><cv>33</cv><pnp>70</pnp></dir></lourb></dt>
          <ldt>CL GLORIA 70 SANTA CRUZ DE MUDELA (CIUDAD REAL)</ldt>
          <dis>22.13</dis>
        </pcd>
      </lpcd>
    </coordd>
  </coordenadas_distancias>
</consulta_coordenadas_distancias>`;

// Forma real "sin resultado" (punto lejos de parcelas): coordd sin lpcd.
const DISTANCIA_EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<consulta_coordenadas_distancias xmlns="http://www.catastro.meh.es/">
  <control><cucoor>1</cucoor><cuerr>0</cuerr></control>
  <coordenadas_distancias>
    <coordd><geo><xcen>-3.7038</xcen><ycen>40.4168</ycen><srs>EPSG:4326</srs></geo></coordd>
  </coordenadas_distancias>
</consulta_coordenadas_distancias>`;

describe("parseNearbyParcels (Consulta_RCCOOR_Distancia)", () => {
  it("fixture dorado: parcelas ordenadas por distancia con dirección literal", () => {
    const r = parseNearbyParcels(xml.parse(DISTANCIA_XML));
    assert.equal(r.length, 3);
    assert.deepEqual(r[0], {
      ref: "9872023VH5797S",
      address: "CL GLORIA 51 SANTA CRUZ DE MUDELA (CIUDAD REAL)",
      distanceMeters: 0,
    });
    assert.equal(r[1].distanceMeters, 8.75);
    // ⚠️ pc1 con cero inicial: si el parser convirtiera a número, la RC se corrompería.
    assert.equal(r[2].ref, "0071701VH6707S");
  });

  it("un solo pcd (objeto, no array) también se parsea", () => {
    const r = parseNearbyParcels({
      consulta_coordenadas_distancias: {
        coordenadas_distancias: {
          coordd: {
            lpcd: { pcd: { pc: { pc1: "9872023", pc2: "VH5797S" }, ldt: "CL GLORIA 51", dis: "4.2" } },
          },
        },
      },
    });
    assert.equal(r.length, 1);
    assert.equal(r[0].ref, "9872023VH5797S");
    assert.equal(r[0].distanceMeters, 4.2);
  });

  it("sin lpcd = sin parcelas cerca (NO es fallo de servicio)", () => {
    assert.deepEqual(parseNearbyParcels(xml.parse(DISTANCIA_EMPTY_XML)), []);
  });

  it("respuesta inesperada: lista vacía sin lanzar", () => {
    assert.deepEqual(parseNearbyParcels({}), []);
    assert.deepEqual(parseNearbyParcels(null), []);
    assert.deepEqual(parseNearbyParcels("basura"), []);
  });

  it("deduplica por RC quedándose con la menor distancia y respeta el límite", () => {
    const data = {
      consulta_coordenadas_distancias: {
        coordenadas_distancias: {
          coordd: {
            lpcd: {
              pcd: [
                { pc: { pc1: "9872023", pc2: "VH5797S" }, dis: "15" },
                { pc: { pc1: "9872023", pc2: "VH5797S" }, dis: "3" },
                { pc: { pc1: "9872028", pc2: "VH5797S" }, dis: "9" },
              ],
            },
          },
        },
      },
    };
    const r = parseNearbyParcels(data, 1);
    assert.equal(r.length, 1);
    assert.equal(r[0].ref, "9872023VH5797S");
    assert.equal(r[0].distanceMeters, 3);
  });

  it("REGRESIÓN lat/lng intercambiadas: Coordenada_X=LONGITUD, Coordenada_Y=LATITUD", () => {
    // Contrato del OVC verificado 2026-07-30: X=lng, Y=lat. Un intercambio
    // silencioso enviaría el punto al océano Índico y devolvería la forma
    // vacía. Fijamos el orden en la URL y que la forma vacía es "sin
    // parcelas", nunca parcelas válidas.
    const url = rccoorDistanciaUrl(38.64025, -3.46328); // (lat, lng) de España
    assert.ok(url.includes("Coordenada_X=-3.46328"), url);
    assert.ok(url.includes("Coordenada_Y=38.64025"), url);
    assert.equal(parseNearbyParcels(xml.parse(DISTANCIA_EMPTY_XML)).length, 0);
  });
});

// Fixture REAL del numerero (capturado 2026-07-30: CL GLORIA 71, Santa Cruz de
// Mudela — el 71 no existe y el OVC sugiere números cercanos con su parcela).
const NUMERERO_JSON = {
  control: { cunum: 8, cuerr: 1 },
  numerero: {
    nump: [
      { pc: { pc1: "9971005", pc2: "VH5797S" }, num: { pnp: "66" } },
      { pc: { pc1: "9972008", pc2: "VH5797S" }, num: { pnp: "67" } },
      { pc: { pc1: "0072708", pc2: "VH6707S" }, num: { pnp: "69" } },
      { pc: { pc1: "0071701", pc2: "VH6707S" }, num: { pnp: "70" } },
    ],
  },
  lerr: [{ cod: "43", des: "EL NUMERO NO EXISTE" }],
};

describe("parseDnploc (Consulta_DNPLOC + numerero)", () => {
  it("numerero real: conserva las sugerencias en vez de perderlas en el error", () => {
    const r = parseDnploc(NUMERERO_JSON);
    assert.equal(r.kind, "number_suggestions");
    if (r.kind !== "number_suggestions") return;
    assert.equal(r.suggestions.length, 4);
    assert.deepEqual(r.suggestions[0], { number: "66", parcelRef: "9971005VH5797S" });
    // cero inicial preservado en la parcela
    assert.deepEqual(r.suggestions[3], { number: "70", parcelRef: "0071701VH6707S" });
  });

  it("cod 43 SIN numerero (número muy lejano, forma real): error de datos, no sugerencias inventadas", () => {
    const bare = { control: { cuerr: 1 }, lerr: [{ cod: "43", des: "EL NUMERO NO EXISTE" }] };
    assert.throws(() => parseDnploc(bare), /EL NUMERO NO EXISTE/);
  });

  it("otros errores de datos no producen sugerencias", () => {
    const err = { control: { cuerr: 1 }, lerr: [{ cod: "12", des: "CALLE NO ENCONTRADA" }] };
    assert.throws(() => parseDnploc(err), /CALLE NO ENCONTRADA/);
  });

  it("respuesta directa con un inmueble: kind one", () => {
    const r = parseDnploc({
      bico: { bi: { idbi: { rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" } } } },
    });
    assert.deepEqual(r, { kind: "one", ref: "9872023VH5797S0001WX" });
  });

  it("lista de inmuebles: kind candidates con loint", () => {
    const r = parseDnploc({
      lrcdnp: {
        rcdnp: [
          {
            rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" },
            dt: { locs: { lous: { lourb: { dir: { tv: "CL", nv: "GLORIA", pnp: "51" }, loint: { pt: "01", pu: "A" } } } } },
          },
        ],
      },
    });
    assert.equal(r.kind, "candidates");
    if (r.kind !== "candidates") return;
    assert.equal(r.candidates[0].floor, "01");
  });

  it("vacío: kind none", () => {
    assert.deepEqual(parseDnploc({}), { kind: "none" });
    assert.deepEqual(parseDnploc(undefined), { kind: "none" });
  });
});
