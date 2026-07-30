import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCadastralRefs } from "./extract";

const RC = "9872023VH5797S0001WX"; // inmueble (20)
const PARCEL = "9872023VH5797S"; // finca (14)

describe("extractCadastralRefs", () => {
  it("RC etiquetada: la encuentra y la marca labeled", () => {
    const r = extractCadastralRefs([`Referencia catastral: ${RC}. Piso luminoso.`]);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0], { ref: RC, kind: "unit", labeled: true });
  });

  it("RC sin etiqueta: la encuentra igualmente (labeled false)", () => {
    const r = extractCadastralRefs([`Piso céntrico ${RC} con ascensor`]);
    assert.equal(r.length, 1);
    assert.equal(r[0].labeled, false);
  });

  it("RC con espacios y separadores internos", () => {
    const r = extractCadastralRefs([`ref. catastral 9872023 VH5797S 0001 WX`]);
    assert.equal(r.length, 1);
    assert.equal(r[0].ref, RC);
    assert.equal(r[0].labeled, true);
  });

  it("varias RC: únicas, etiquetadas primero, 20 antes que 14", () => {
    const r = extractCadastralRefs([
      `Parcela 1234567AB1234C sin etiquetar.`,
      `Referencia catastral ${RC}.`,
    ]);
    assert.equal(r[0].ref, RC);
    assert.equal(r[0].labeled, true);
    assert.ok(r.some((x) => x.ref === "1234567AB1234C" && x.kind === "parcel"));
  });

  it("la parcela prefijo de una RC de 20 encontrada se suprime (redundante)", () => {
    const r = extractCadastralRefs([`Parcela ${PARCEL}. Referencia catastral ${RC}.`]);
    assert.equal(r.length, 1);
    assert.equal(r[0].ref, RC);
  });

  it("RC de 14 (parcela) no se confunde con RC exacta", () => {
    const r = extractCadastralRefs([`RC: ${PARCEL}`]);
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, "parcel");
  });

  it("falsos positivos: teléfonos, IDs de anuncio, certificado energético", () => {
    assert.equal(extractCadastralRefs(["Llama al 612345678 o al 985123456"]).length, 0);
    // ID de anuncio: solo dígitos (14) → sin letras, fuera
    assert.equal(extractCadastralRefs(["Anuncio nº 12345678901234"]).length, 0);
    // Certificado energético
    assert.equal(extractCadastralRefs(["Certificado energético: E (126 kWh/m² año)"]).length, 0);
    // Palabra larga en mayúsculas, sin dígitos
    assert.equal(extractCadastralRefs(["EXTRAORDINARIAMENTE LUMINOSO"]).length, 0);
  });

  it("no muerde el prefijo de un identificador más largo", () => {
    // 30 alfanuméricos seguidos: ningún tramo interior es una RC extraíble
    assert.equal(extractCadastralRefs([`ID interno ${RC}ABCDE12345 del portal`]).length, 0);
  });

  it("RC estructuralmente inválida: no se extrae", () => {
    // 19 chars
    assert.equal(extractCadastralRefs(["ref catastral 9872023VH5797S0001W"]).length, 0);
    // 20 pero las 2 últimas no son letras
    assert.equal(extractCadastralRefs(["ref catastral 9872023VH5797S000123"]).length, 0);
  });

  it("textos nulos o vacíos: sin resultados y sin lanzar", () => {
    assert.equal(extractCadastralRefs([null, undefined, "", "   "]).length, 0);
  });
});
