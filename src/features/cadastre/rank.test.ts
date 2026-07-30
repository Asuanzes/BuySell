import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveConfidence, normalizeDoor, normalizeFloor, rankCandidates } from "./rank";

const REF_A = "9872023VH5797S0001WX";
const REF_B = "9872023VH5797S0002YZ";
const REF_C = "9872023VH5797S0003AB";

describe("normalizeFloor", () => {
  it("formatos 4, 04, 4º, 4ª → mismo valor", () => {
    assert.equal(normalizeFloor("4"), "4");
    assert.equal(normalizeFloor("04"), "4");
    assert.equal(normalizeFloor("4º"), "4");
    assert.equal(normalizeFloor("4ª"), "4");
  });
  it("bajo, entresuelo, sótano, semisótano y ático", () => {
    assert.equal(normalizeFloor("Bajo"), "BJ");
    assert.equal(normalizeFloor("BJ"), "BJ");
    assert.equal(normalizeFloor("PLANTA BAJA"), "BJ");
    assert.equal(normalizeFloor("Entresuelo"), "EN");
    assert.equal(normalizeFloor("Sótano"), "SS");
    assert.equal(normalizeFloor("SEMISOTANO"), "SM");
    assert.equal(normalizeFloor("Ático"), "AT");
    assert.equal(normalizeFloor("ático"), "AT");
  });
  it("OD/T (todo el edificio) y vacío no son comparables", () => {
    assert.equal(normalizeFloor("OD"), null);
    assert.equal(normalizeFloor("T"), null);
    assert.equal(normalizeFloor(""), null);
    assert.equal(normalizeFloor(null), null);
  });
});

describe("normalizeDoor", () => {
  it("01→1, izquierda/dcha/centro → códigos", () => {
    assert.equal(normalizeDoor("01"), "1");
    assert.equal(normalizeDoor("B"), "B");
    assert.equal(normalizeDoor("Izquierda"), "IZ");
    assert.equal(normalizeDoor("IZDA"), "IZ");
    assert.equal(normalizeDoor("Dcha"), "DR");
    assert.equal(normalizeDoor("DERECHA"), "DR");
    assert.equal(normalizeDoor("Centro"), "CE");
  });
});

describe("rankCandidates", () => {
  it("coincidencia exacta de planta y puerta gana con confianza alta", () => {
    const r = rankCandidates(
      [
        { ref: REF_B, floor: "01", door: "A" },
        { ref: REF_A, floor: "04", door: "B" },
        { ref: REF_C, floor: "02", door: "C" },
      ],
      { floor: "4º", door: "B" }
    );
    assert.equal(r[0].ref, REF_A);
    assert.equal(r[0].confidence, "high");
    assert.ok(r[0].reasons.some((x) => x.code === "floor_match"));
    assert.ok(r[0].reasons.some((x) => x.code === "door_match"));
    // los demás candidatos NUNCA se ocultan
    assert.equal(r.length, 3);
  });

  it("superficie ±5 % / ±10 % / ±20 % puntúan escalonado y >20 % penaliza", () => {
    const r = rankCandidates(
      [
        { ref: REF_A, builtArea: 92 }, // 92 vs 90 → ≤5%
        { ref: REF_B, builtArea: 99 }, // ≤10%
        { ref: REF_C, builtArea: 130 }, // >20% → penaliza
      ],
      { builtArea: 90 }
    );
    assert.equal(r[0].ref, REF_A);
    assert.equal(r[1].ref, REF_B);
    assert.equal(r[2].ref, REF_C);
    assert.ok(r[0].score > r[1].score);
    assert.ok(r[2].score < 0);
    assert.ok(r[0].reasons.some((x) => x.code === "surface_close" && x.listing === 90 && x.cadastre === 92));
  });

  it("el año pesa poco: no decide frente a la planta", () => {
    const r = rankCandidates(
      [
        { ref: REF_A, floor: "03", yearBuilt: 1950 },
        { ref: REF_B, floor: "01", yearBuilt: 1987 },
      ],
      { floor: "3", yearBuilt: 1987 }
    );
    assert.equal(r[0].ref, REF_A); // planta correcta > año exacto
  });

  it("datos ausentes: sin señal no hay puntos ni castigo", () => {
    const r = rankCandidates([{ ref: REF_A }, { ref: REF_B, floor: "02" }], {});
    assert.equal(r[0].score, 0);
    assert.equal(r[1].score, 0);
  });

  it("empate: orden determinista por RC y confianza baja", () => {
    const a = rankCandidates([{ ref: REF_B }, { ref: REF_A }], {});
    const b = rankCandidates([{ ref: REF_A }, { ref: REF_B }], {});
    assert.deepEqual(a.map((x) => x.ref), b.map((x) => x.ref));
    assert.equal(a[0].ref, REF_A); // desempate estable por RC
    assert.equal(a[0].confidence, "low");
  });

  it("gap insuficiente entre 1º y 2º: no hay confianza alta", () => {
    const r = rankCandidates(
      [
        { ref: REF_A, floor: "04", door: "B" },
        { ref: REF_B, floor: "04", door: "B" }, // clon: mismo score
      ],
      { floor: "4", door: "B" }
    );
    assert.equal(r[0].score, r[1].score);
    assert.equal(r[0].confidence, "low");
  });

  it("contradicción resta: planta equivocada peor que sin planta", () => {
    const r = rankCandidates(
      [
        { ref: REF_A, floor: "01" }, // contradice
        { ref: REF_B }, // sin dato
      ],
      { floor: "4" }
    );
    assert.equal(r[0].ref, REF_B);
    assert.ok(r[1].score < 0);
    assert.ok(r[1].reasons.some((x) => x.code === "floor_mismatch"));
  });

  it("distancia (RCCOOR_Distancia) puntúa por cercanía", () => {
    const r = rankCandidates(
      [
        { ref: REF_B, distanceMeters: 40 },
        { ref: REF_A, distanceMeters: 5 },
      ],
      {}
    );
    assert.equal(r[0].ref, REF_A);
    assert.ok(r[0].reasons.some((x) => x.code === "near_distance"));
  });
});

describe("deriveConfidence", () => {
  it("alta exige score alto Y gap claro; único candidato usa solo el score", () => {
    assert.equal(deriveConfidence(52, 10), "high");
    assert.equal(deriveConfidence(52, 45), "medium"); // score alto pero gap 7 < 14: nunca alta
    assert.equal(deriveConfidence(34, null), "high");
    assert.equal(deriveConfidence(20, null), "medium");
    assert.equal(deriveConfidence(5, null), "low");
  });

  it("una sola señal fuerte (solo puerta = 28) NO basta para alta en singleton", () => {
    // Revisión adversarial Codex 2026-07-30: candidato único con door_match
    // (28 pts) daba "high" con evidencia débil. Umbral singleton = 34.
    assert.equal(deriveConfidence(28, null), "medium");
    assert.equal(deriveConfidence(30, null), "medium");
  });
});
