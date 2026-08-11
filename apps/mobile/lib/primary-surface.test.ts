import { test } from "node:test";
import assert from "node:assert/strict";

import { acquireSurface, isPrimaryFree, onPrimaryFree } from "./primary-surface";

// El contador es estado de módulo compartido entre tests: cada test libera TODO
// lo que ocupa (también lo que ocupan sus listeners) antes de terminar.

test("la primera surface ocupa el slot y la liberación es idempotente", () => {
  assert.equal(isPrimaryFree(), true);
  const release = acquireSurface();
  assert.equal(isPrimaryFree(), false);
  release();
  release(); // doble liberación no deja el contador en negativo
  assert.equal(isPrimaryFree(), true);
});

test("la duplicada del arranque en frío hereda el slot cuando muere la 1ª (BUG-15)", () => {
  // Orden real del share en frío: surface 1 monta, surface 2 nace SOLAPADA
  // (slot ocupado), y solo DESPUÉS muere la 1ª.
  const release1 = acquireSurface();
  assert.equal(isPrimaryFree(), false);

  const promoted: Array<() => void> = [];
  const unsubscribe = onPrimaryFree(() => {
    if (!isPrimaryFree()) return;
    unsubscribe();
    promoted.push(acquireSurface());
  });

  release1();
  assert.equal(promoted.length, 1, "el aviso de slot libre debe llegar al morir la 1ª");
  assert.equal(isPrimaryFree(), false, "la promocionada ocupa el slot síncronamente");

  promoted[0]?.();
  assert.equal(isPrimaryFree(), true);
});

test("con varios duplicados solo gana uno; el resto sigue esperando", () => {
  const winners: string[] = [];
  const releases: Array<() => void> = [];
  const listen = (name: string) => {
    const unsubscribe = onPrimaryFree(() => {
      if (!isPrimaryFree()) return;
      unsubscribe();
      releases.push(acquireSurface());
      winners.push(name);
    });
    return unsubscribe;
  };

  const release1 = acquireSurface();
  const unsubA = listen("A");
  const unsubB = listen("B");

  release1();
  assert.deepEqual(winners, ["A"], "solo el primer listener del bucle se promociona");
  assert.equal(isPrimaryFree(), false);

  // B sigue suscrito: si la promocionada muere, hereda B.
  for (const release of releases.splice(0)) release();
  assert.deepEqual(winners, ["A", "B"], "al morir la promocionada hereda el siguiente");

  unsubA();
  unsubB();
  for (const release of releases.splice(0)) release();
  assert.equal(isPrimaryFree(), true);
});
