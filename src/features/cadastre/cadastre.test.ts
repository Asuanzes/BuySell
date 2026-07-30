import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCadastralRef, isValidCadastralRef, isParcelRef, sedeCatastroUrl } from "./ref";
import { parseDnprc, type DnpRcResponse } from "./lookup";
import { wrapCadastreData } from "./types";

describe("normalizeCadastralRef", () => {
  it("mayúsculas y sin separadores", () => {
    assert.equal(normalizeCadastralRef(" 9872023 vh5797s 0001wx "), "9872023VH5797S0001WX");
    assert.equal(normalizeCadastralRef("9872023-VH5797S.0001·WX"), "9872023VH5797S0001WX");
  });
});

describe("isValidCadastralRef", () => {
  it("acepta RC de inmueble (20) y de finca (14)", () => {
    assert.ok(isValidCadastralRef("9872023VH5797S0001WX"));
    assert.ok(isValidCadastralRef("9872023VH5797S"));
  });
  it("rechaza longitudes y caracteres inválidos", () => {
    assert.ok(!isValidCadastralRef("9872023VH5797"));       // 13
    assert.ok(!isValidCadastralRef("9872023VH5797S0001W")); // 19
    assert.ok(!isValidCadastralRef("9872023VH5797S0001W!"));
    assert.ok(!isValidCadastralRef(""));
    // Las 2 últimas posiciones de la RC de 20 son letras de control.
    assert.ok(!isValidCadastralRef("9872023VH5797S000123"));
  });
  it("distingue finca de inmueble", () => {
    assert.ok(isParcelRef("9872023VH5797S"));
    assert.ok(!isParcelRef("9872023VH5797S0001WX"));
  });
});

describe("sedeCatastroUrl", () => {
  it("apunta a la Sede con la RC", () => {
    const u = sedeCatastroUrl("9872023VH5797S0001WX");
    assert.ok(u.startsWith("https://www1.sedecatastro.gob.es/"));
    assert.ok(u.includes("RefC=9872023VH5797S0001WX"));
  });
});

describe("parseDnprc", () => {
  const REF = "9872023VH5797S0001WX";

  it("un inmueble: normaliza dirección, uso, superficie, año y participación", () => {
    const data: DnpRcResponse = {
      consulta_dnprc: {
        bico: {
          bi: {
            idbi: { rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" }, cn: "UR" },
            dt: {
              np: "ASTURIAS",
              nm: "GIJON",
              locs: {
                lous: {
                  lourb: {
                    dir: { tv: "CL", nv: "URIA", pnp: "12" },
                    loint: { es: "1", pt: "03", pu: "B" },
                    dp: "33202",
                  },
                },
              },
            },
            debi: { luso: "Residencial", sfc: 92, ant: 1987, cpt: "2,150000" },
          },
          lcons: {
            cons: [
              { lcd: "VIVIENDA", dfcons: { stl: 84 } },
              { lcd: "ELEMENTOS COMUNES", dfcons: { stl: 8 } },
            ],
          },
        },
      },
    };
    const r = parseDnprc(data, REF);
    assert.equal(r.kind, "one");
    if (r.kind !== "one") return;
    assert.equal(r.info.ref, REF);
    assert.equal(r.info.landType, "UR");
    assert.equal(r.info.address, "CL URIA 12");
    assert.equal(r.info.province, "ASTURIAS");
    assert.equal(r.info.municipality, "GIJON");
    assert.equal(r.info.postalCode, "33202");
    assert.equal(r.info.stair, "1");
    assert.equal(r.info.floor, "03");
    assert.equal(r.info.door, "B");
    assert.equal(r.info.use, "Residencial");
    assert.equal(r.info.builtArea, 92);
    assert.equal(r.info.yearBuilt, 1987);
    assert.equal(r.info.participation, "2,150000");
    assert.equal(r.info.units?.length, 2);
    assert.equal(r.info.units?.[0].use, "VIVIENDA");
    assert.equal(r.info.units?.[0].area, 84);
    assert.ok(r.info.floorplanUrl?.includes(encodeURIComponent(REF)));
  });

  it("finca con varias unidades: candidatos, nunca elegimos", () => {
    const data: DnpRcResponse = {
      consulta_dnprc: {
        lrcdnp: {
          rcdnp: [
            {
              rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" },
              dt: { locs: { lous: { lourb: { dir: { tv: "CL", nv: "URIA", pnp: "12" }, loint: { pt: "01", pu: "A" } } } } },
            },
            {
              rc: { pc1: "9872023", pc2: "VH5797S", car: "0002", cc1: "Y", cc2: "Z" },
              dt: { locs: { lous: { lourb: { dir: { tv: "CL", nv: "URIA", pnp: "12" }, loint: { pt: "01", pu: "B" } } } } },
            },
          ],
        },
      },
    };
    const r = parseDnprc(data, "9872023VH5797S");
    assert.equal(r.kind, "many");
    if (r.kind !== "many") return;
    assert.equal(r.candidates.length, 2);
    assert.equal(r.candidates[0].ref, "9872023VH5797S0001WX");
    assert.equal(r.candidates[0].floor, "01");
    assert.equal(r.candidates[0].door, "A");
    assert.equal(r.candidates[1].door, "B");
  });

  it("finca con una única unidad distinta: pide seguimiento (no bucle)", () => {
    const data: DnpRcResponse = {
      consulta_dnprc: {
        lrcdnp: {
          rcdnp: { rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" } },
        },
      },
    };
    const r = parseDnprc(data, "9872023VH5797S");
    assert.deepEqual(r, { kind: "follow-up", ref: "9872023VH5797S0001WX" });
  });

  it("fixture DORADO del WCF JSON real (capturado 2026-07-30): parsea bi + finca + lcons array", () => {
    // Respuesta literal (recortada) de Consulta_DNPRC del servicio vigente.
    const data: DnpRcResponse = {
      consulta_dnprcResult: {
        bico: {
          bi: {
            idbi: { cn: "UR", rc: { pc1: "9872023", pc2: "VH5797S", car: "0001", cc1: "W", cc2: "X" } },
            dt: {
              loine: { cp: "13", cm: "77" },
              cmc: "77",
              np: "CIUDAD REAL",
              nm: "SANTA CRUZ DE MUDELA",
              locs: {
                lous: {
                  lourb: {
                    dir: { cv: "33", tv: "CL", nv: "GLORIA", pnp: "51", snp: "0" },
                    loint: { es: "T", pt: "OD", pu: "OS" },
                    dp: "13730",
                  },
                },
              },
            },
            ldt: "CL GLORIA 51 13730 SANTA CRUZ DE MUDELA (CIUDAD REAL)",
            debi: { luso: "Residencial", sfc: "308", cpt: "100,000000", ant: "1980" },
          },
          finca: {
            ldt: "CL GLORIA 51  SANTA CRUZ DE MUDELA (CIUDAD REAL)",
            ltp: "Parcela construida sin división horizontal",
            dff: { ss: "397" },
            infgraf: { igraf: "https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?del=13&mun=77&refcat=9872023VH5797S" },
          },
          lcons: [
            { lcd: "VIVIENDA", dt: { lourb: { loint: { pt: "00", pu: "01" } } }, dfcons: { stl: "109" } },
            { lcd: "ALMACEN", dt: { lourb: { loint: { pt: "00", pu: "02" } } }, dfcons: { stl: "187" } },
            { lcd: "OTROS USOS", dt: { lourb: { loint: { pt: "00", pu: "03" } } }, dfcons: { stl: "12" } },
          ],
        },
      },
    };
    const r = parseDnprc(data, "9872023VH5797S0001WX");
    assert.equal(r.kind, "one");
    if (r.kind !== "one") return;
    assert.equal(r.info.ref, "9872023VH5797S0001WX");
    assert.equal(r.info.landType, "UR");
    assert.equal(r.info.use, "Residencial");
    assert.equal(r.info.builtArea, 308);
    assert.equal(r.info.yearBuilt, 1980);
    assert.equal(r.info.plotArea, 397);
    assert.equal(r.info.participation, "100,000000");
    assert.equal(r.info.province, "CIUDAD REAL");
    assert.equal(r.info.municipality, "SANTA CRUZ DE MUDELA");
    assert.equal(r.info.postalCode, "13730");
    assert.equal(r.info.address, "CL GLORIA 51");
    assert.equal(r.info.units?.length, 3);
    assert.equal(r.info.units?.[0].area, 109);
    // El plano viene de la URL OFICIAL que devuelve el propio servicio.
    assert.ok(r.info.floorplanUrl?.includes("Cartografia/mapa.aspx"));
  });

  it("respuesta incompleta/vacía: none, sin lanzar", () => {
    assert.equal(parseDnprc({}, REF).kind, "none");
    assert.equal(parseDnprc({ consulta_dnprc: {} }, REF).kind, "none");
    // rcdnp sin rc utilizable (respuesta truncada del portal)
    assert.equal(parseDnprc({ consulta_dnprc: { lrcdnp: { rcdnp: [{}] } } }, REF).kind, "none");
  });
});

describe("wrapCadastreData", () => {
  it("añade schema, fuente y fecha; conserva info", () => {
    const stored = wrapCadastreData({ ref: "X", hasFloorplan: false, builtArea: 90 });
    assert.equal(stored.schema, 1);
    assert.ok(stored.source.includes("Catastro"));
    assert.ok(Number.isFinite(Date.parse(stored.fetchedAt)));
    assert.equal(stored.info.builtArea, 90);
  });
  it("descarta raw desmesurado", () => {
    const big = { blob: "x".repeat(100_000) };
    const stored = wrapCadastreData({ ref: "X", hasFloorplan: false, raw: big });
    assert.equal(stored.info.raw, undefined);
    const small = { ok: true };
    assert.deepEqual(wrapCadastreData({ ref: "X", hasFloorplan: false, raw: small }).info.raw, small);
  });
});
