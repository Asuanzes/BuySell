import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isRentOperation, operationPrice, priceFieldFor } from "./operation";

/**
 * La regla que llevaba una quincena de copias sueltas. Lo que estas pruebas
 * fijan no es el caso fácil —venta y alquiler— sino el tercero, que es donde
 * `=== "RENT"` y `!== "SALE"` dejan de coincidir y de donde salieron cuatro
 * defectos en un día.
 */

describe("isRentOperation", () => {
  it("el alquiler con opción a compra CUENTA como alquiler", () => {
    // Es la decisión entera de este módulo: lo que el portal anuncia es la
    // cuota mensual, así que su precio principal es una renta.
    assert.equal(isRentOperation("RENT_TO_OWN"), true);
  });

  it("alquiler sí, venta no", () => {
    assert.equal(isRentOperation("RENT"), true);
    assert.equal(isRentOperation("SALE"), false);
  });

  it("ausente o desconocida es VENTA, que es el valor por defecto del esquema", () => {
    // Lista blanca y no `!== "SALE"`: un payload de importación sin operación es
    // válido y así lo documenta el Zod. Con la negación se habría validado
    // contra la banda de renta (tope 50.000 €) y habría nuleado el precio de
    // cualquier venta.
    assert.equal(isRentOperation(null), false);
    assert.equal(isRentOperation(undefined), false);
    assert.equal(isRentOperation(""), false);
    assert.equal(isRentOperation("LEASE"), false);
  });
});

describe("priceFieldFor", () => {
  it("cada operación a su columna", () => {
    assert.equal(priceFieldFor("SALE"), "currentPrice");
    assert.equal(priceFieldFor("RENT"), "monthlyRent");
    assert.equal(priceFieldFor("RENT_TO_OWN"), "monthlyRent");
  });
});

describe("operationPrice", () => {
  const mixta = { currentPrice: 22_000_000, monthlyRent: 90_000 };

  it("devuelve el importe de la columna que corresponde a la ficha", () => {
    assert.equal(operationPrice({ ...mixta, operationType: "SALE" }), 22_000_000);
    assert.equal(operationPrice({ ...mixta, operationType: "RENT" }), 90_000);
    assert.equal(operationPrice({ ...mixta, operationType: "RENT_TO_OWN" }), 90_000);
  });

  it("sin importe en su columna devuelve null, no el de la otra", () => {
    // Mezclar columnas es peor que no tener precio: enseñaría 220.000 € como si
    // fuera una renta mensual.
    assert.equal(
      operationPrice({ operationType: "RENT", currentPrice: 22_000_000, monthlyRent: null }),
      null
    );
    assert.equal(
      operationPrice({ operationType: "SALE", currentPrice: null, monthlyRent: 90_000 }),
      null
    );
  });
});
