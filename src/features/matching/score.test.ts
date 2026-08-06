import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, type MatchSignals } from "./score";

function base(): MatchSignals {
  return {
    cadastreSame: false,
    photoMatches: 0,
    titleJaccard: 0,
    geoDistanceM: null,
    builtAreaDiffPct: null,
    rentDiffPct: null,
    rentSameOperation: false,
  };
}

test("3 fotos + renta casi idéntica + título alto → 95 (combo auto-merge)", () => {
  const s = { ...base(), photoMatches: 3, rentDiffPct: 0.02, rentSameOperation: true, titleJaccard: 0.8 };
  const r = scoreCandidate(s);
  assert.equal(r.score, 95);
  assert.ok(r.reasons.some((x) => x.includes("fotos + renta")), r.reasons.join(", "));
});

test("3 fotos + renta + título de plantilla NO auto-fusiona (95)", () => {
  const s = { ...base(), photoMatches: 3, rentDiffPct: 0.02, rentSameOperation: true, titleJaccard: 0.6 };
  const r = scoreCandidate(s);
  assert.equal(r.score, 90); // fotos corroboradas por título ≥0.5, pero sin combo
});

test("renta SIN título ni geo no puntúa (falso positivo de rentas parecidas)", () => {
  const s = { ...base(), rentDiffPct: 0.05, rentSameOperation: true };
  assert.equal(scoreCandidate(s).score, 0);
});

test("renta casi idéntica + geo cercana → 70", () => {
  const s = { ...base(), rentDiffPct: 0.05, rentSameOperation: true, geoDistanceM: 30 };
  const r = scoreCandidate(s);
  assert.equal(r.score, 70);
  assert.ok(r.reasons.some((x) => x.includes("renta")), r.reasons.join(", "));
});

test("renta + título de plantilla (0.5-0.6) NO puntúa (falso positivo)", () => {
  const s = { ...base(), rentDiffPct: 0.04, rentSameOperation: true, titleJaccard: 0.57 };
  assert.equal(scoreCandidate(s).score, 50); // solo el título ≥0.5
});

test("renta demasiado distinta (>10%) no suma aunque haya título", () => {
  const s = { ...base(), rentDiffPct: 0.4, rentSameOperation: true, titleJaccard: 0.6 };
  assert.equal(scoreCandidate(s).score, 50); // solo el título ≥0.5
});

test("operación distinta → sin señal de renta", () => {
  const s = { ...base(), rentDiffPct: 0.02, rentSameOperation: false, titleJaccard: 0.6 };
  assert.equal(scoreCandidate(s).score, 50);
});

test("fotos de stock SIN corroboración no llegan a 90 (falso positivo)", () => {
  const s = { ...base(), photoMatches: 3 };
  const r = scoreCandidate(s);
  assert.equal(r.score, 60);
  assert.ok(!r.reasons.some((x) => x.includes("fotos + renta")), r.reasons.join(", "));
});

test("fotos corroboradas por título suben (venta)", () => {
  const s = { ...base(), photoMatches: 2, titleJaccard: 0.6 };
  const r = scoreCandidate(s);
  // fotos(2, corroboradas) → 65, título ≥0.5 → 50, débil fotos+título → +15 = 80
  assert.equal(r.score, 80);
});

test("ficha casi idéntica (título ~100% + renta idéntica) → 95", () => {
  const s = { ...base(), titleJaccard: 1.0, rentDiffPct: 0.0, rentSameOperation: true };
  const r = scoreCandidate(s);
  assert.equal(r.score, 95);
  assert.ok(r.reasons.some((x) => x.includes("casi idéntica")), r.reasons.join(", "));
});
