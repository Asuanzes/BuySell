/**
 * Tests de helpers puros de tarjetas de contexto.
 * Ejecutar:  node --import tsx --test src/lib/chat/context.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { propertyStatusLabel, type ContextCard } from "./context";

test("propertyStatusLabel: solo muestra estados de inmueble no activos", () => {
  const cases: Array<[string | null, string | null, boolean | undefined]> = [
    ["FOR_SALE", null, undefined],
    ["FOR_RENT", null, undefined],
    ["RESERVED", "Reservado", true],
    ["SOLD", "Vendido", true],
    ["WITHDRAWN", "Retirado", true],
    ["RENTED", "Alquilado", true],
    [null, null, undefined],
  ];

  for (const [status, expectedLabel, expectedShown] of cases) {
    const label = propertyStatusLabel(status);
    assert.equal(label, expectedLabel);
    assert.equal(label ? true : undefined, expectedShown);
  }

  assert.equal(propertyStatusLabel("ACTIVE"), null);
});

test("ContextCard: statusShown es opcional y true solo cuando se muestra estado", () => {
  const sold: ContextCard = {
    title: "Piso Centro",
    imageUrl: null,
    subtitle: "Oviedo",
    meta: [propertyStatusLabel("SOLD"), "3 hab", "2 baños"].filter(Boolean).join(" · "),
    statusShown: propertyStatusLabel("SOLD") ? true : undefined,
  };
  assert.equal(sold.meta, "Vendido · 3 hab · 2 baños");
  assert.equal(sold.statusShown, true);

  const active: ContextCard = {
    title: "Piso Centro",
    imageUrl: null,
    subtitle: "Oviedo",
    meta: ["3 hab", "2 baños", propertyStatusLabel("FOR_RENT")].filter(Boolean).join(" · "),
    ...(propertyStatusLabel("FOR_RENT") ? { statusShown: true } : {}),
  };
  assert.equal(active.meta, "3 hab · 2 baños");
  assert.equal(active.statusShown, undefined);
  assert.equal("statusShown" in active, false);
});
