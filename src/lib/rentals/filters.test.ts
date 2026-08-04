import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  buildRentalWhere,
  parseRentalFilters,
  priceColumn,
  rentalOrderBy,
} from "./filters";

/**
 * Sin red y sin BBDD: se comprueba la FORMA del `where` y del `orderBy` que
 * recibiría Prisma. Lo que se protege aquí es lo que rompe en silencio:
 *  - que el rango de precio apunte a la columna de la operación buscada,
 *  - que el parseo no deje pasar valores de enum ni columnas arbitrarias,
 *  - que el orden por precio lleve desempate por id (o el cursor duplica filas).
 */

const parse = (qs: string) => parseRentalFilters(new URLSearchParams(qs));

/** Busca la primera cláusula del AND que tenga esta clave. */
function clause(where: ReturnType<typeof buildRentalWhere>, key: string): unknown {
  const and = (where.AND ?? []) as Record<string, unknown>[];
  return and.find((c) => key in c)?.[key];
}

describe("parseRentalFilters", () => {
  it("por defecto busca alquiler disponible, orden reciente y límite sano", () => {
    const f = parse("");
    assert.equal(f.operation, "RENT");
    assert.equal(f.sort, "recent");
    assert.equal(f.limit, DEFAULT_LIMIT);
    assert.equal(f.includeUnavailable, false);
  });

  it("convierte el precio de euros a céntimos", () => {
    const f = parse("minPrice=600&maxPrice=1200");
    assert.equal(f.minPrice, 60_000);
    assert.equal(f.maxPrice, 120_000);
  });

  it("resuelve la provincia canónica desde una ciudad o un alias", () => {
    assert.equal(parse("province=bilbao").province, "Vizcaya");
    assert.equal(parse("province=donostia").province, "Guipúzcoa");
    assert.equal(parse("province=ALAVA").province, "Álava");
    // No reconocida = no se filtra por provincia (búsqueda más amplia).
    assert.equal(parse("province=Narnia").province, undefined);
  });

  it("descarta valores de enum inventados y se queda con los válidos", () => {
    assert.deepEqual(parse("type=PISO,DRAGON,atico").types, ["PISO", "ATICO"]);
    assert.equal(parse("furnished=MUCHO").furnished, undefined);
    assert.equal(parse("furnished=semi").furnished, "SEMI");
    assert.equal(parse("contractType=ROOM").contractType, "ROOM");
  });

  it("sólo acepta extras de la lista blanca", () => {
    assert.deepEqual(parse("features=garage,ownerId,terrace").features, ["garage", "terrace"]);
  });

  it("acota el límite y tolera basura numérica", () => {
    assert.equal(parse("limit=999").limit, MAX_LIMIT);
    assert.equal(parse("limit=0").limit, 1);
    assert.equal(parse("limit=abc").limit, DEFAULT_LIMIT);
    assert.equal(parse("minRooms=abc").minRooms, undefined);
  });
});

describe("buildRentalWhere", () => {
  it("alquiler NO incluye el alquiler con opción a compra", () => {
    // Cambiado a propósito. Su importe se guarda como precio de VENTA en
    // `currentPrice` (convención de import-listing, recheck y auto-merge), así
    // que dentro de una búsqueda de alquiler salía sin precio, se esfumaba al
    // filtrar por renta y ordenaba el último. Para el buscador es una venta
    // mientras su precio sea de venta.
    const where = buildRentalWhere(parse("operation=RENT"));
    assert.deepEqual(clause(where, "operationType"), "RENT");
  });

  it("venta sí lo incluye, que es donde vive su precio", () => {
    const where = buildRentalWhere(parse("operation=SALE"));
    assert.deepEqual(clause(where, "operationType"), { in: ["SALE", "RENT_TO_OWN"] });
  });

  it("una búsqueda mixta con precio mira las DOS columnas", () => {
    // Regresión real: iba sólo contra monthlyRent, así que "Todos" + cualquier
    // rango escondía todas las ventas, que son la mayor parte del corpus.
    // Los importes viajan en euros y se guardan en céntimos.
    const where = buildRentalWhere(parse("operation=ANY&minPrice=100000"));
    assert.deepEqual(clause(where, "OR"), [
      { monthlyRent: { gte: 10_000_000 } },
      { currentPrice: { gte: 10_000_000 } },
    ]);
  });

  it("con una sola operación el precio sigue yendo a su columna", () => {
    assert.deepEqual(clause(buildRentalWhere(parse("operation=RENT&maxPrice=900")), "monthlyRent"), {
      lte: 90_000,
    });
    assert.deepEqual(
      clause(buildRentalWhere(parse("operation=SALE&maxPrice=300000")), "currentPrice"),
      { lte: 30_000_000 }
    );
  });

  it("excluye los estados terminales salvo que se pidan", () => {
    assert.deepEqual(clause(buildRentalWhere(parse("")), "status"), {
      notIn: ["RENTED", "SOLD", "WITHDRAWN"],
    });
    assert.equal(clause(buildRentalWhere(parse("includeUnavailable=1")), "status"), undefined);
  });

  it("el rango de precio va a monthlyRent en alquiler y a currentPrice en venta", () => {
    const rent = buildRentalWhere(parse("operation=RENT&minPrice=600&maxPrice=900"));
    assert.deepEqual(clause(rent, "monthlyRent"), { gte: 60_000, lte: 90_000 });
    assert.equal(clause(rent, "currentPrice"), undefined);

    const sale = buildRentalWhere(parse("operation=SALE&maxPrice=250000"));
    assert.deepEqual(clause(sale, "currentPrice"), { lte: 25_000_000 });
    assert.equal(clause(sale, "monthlyRent"), undefined);
  });

  it("traduce habitaciones, baños y superficie", () => {
    const where = buildRentalWhere(parse("minRooms=2&maxRooms=4&minBaths=2&minArea=70"));
    assert.deepEqual(clause(where, "rooms"), { gte: 2, lte: 4 });
    assert.deepEqual(clause(where, "bathrooms"), { gte: 2 });
    assert.deepEqual(clause(where, "builtArea"), { gte: 70 });
  });

  it("municipio y barrio buscan por coincidencia parcial insensible a mayúsculas", () => {
    const where = buildRentalWhere(parse("city=gijon&neighborhood=cimadevilla"));
    assert.deepEqual(clause(where, "city"), { contains: "gijon", mode: "insensitive" });
    assert.deepEqual(clause(where, "neighborhood"), {
      contains: "cimadevilla",
      mode: "insensitive",
    });
  });

  it("cada extra pedido añade su columna booleana", () => {
    const where = buildRentalWhere(parse("features=garage,terrace"));
    assert.equal(clause(where, "hasGarage"), true);
    assert.equal(clause(where, "hasTerrace"), true);
  });

  it("sin filtros no restringe nada (el ownerId lo pone la ruta)", () => {
    // Sólo operación + estado disponible: nada de ownerId aquí.
    const where = buildRentalWhere(parse(""));
    assert.equal(JSON.stringify(where).includes("ownerId"), false);
  });
});

describe("rentalOrderBy", () => {
  it("ordena por la columna de precio de la operación, con nulos al final", () => {
    assert.deepEqual(rentalOrderBy(parse("sort=price_asc")), [
      { monthlyRent: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ]);
    assert.deepEqual(rentalOrderBy(parse("operation=SALE&sort=price_desc")), [
      { currentPrice: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("en búsqueda mixta ordena por las DOS columnas, y quién va delante depende del sentido", () => {
    // Antes iba sólo contra monthlyRent, así que las ventas caían al final por
    // nulas y sin ordenar entre ellas: el orden pedido no se aplicaba a la
    // mayor parte de la lista.
    const asc = { sort: "asc", nulls: "last" };
    const desc = { sort: "desc", nulls: "last" };

    // Lo más barato primero → una renta, así que el alquiler encabeza.
    assert.deepEqual(rentalOrderBy(parse("operation=ANY&sort=price_asc")), [
      { monthlyRent: asc },
      { currentPrice: asc },
      { id: "asc" },
    ]);
    // Lo más caro primero → una compra, así que la venta encabeza.
    assert.deepEqual(rentalOrderBy(parse("operation=ANY&sort=price_desc")), [
      { currentPrice: desc },
      { monthlyRent: desc },
      { id: "asc" },
    ]);
  });

  it("ninguna ficha se queda sin ordenar por no tener importe en una columna", () => {
    // La garantía que importa: en mixta, toda ficha entra por una de las dos
    // claves, así que nada acaba en el montón inordenado del final.
    for (const sort of ["price_asc", "price_desc"]) {
      const order = rentalOrderBy(parse(`operation=ANY&sort=${sort}`));
      const keys = order.flatMap((o) => Object.keys(o));
      assert.ok(keys.includes("monthlyRent"), `falta monthlyRent en ${sort}`);
      assert.ok(keys.includes("currentPrice"), `falta currentPrice en ${sort}`);
    }
  });

  it("todo orden desempata por id (sin esto el cursor duplica filas)", () => {
    for (const sort of ["recent", "price_asc", "price_desc", "area_desc"]) {
      const order = rentalOrderBy(parse(`sort=${sort}`));
      assert.deepEqual(order[order.length - 1], { id: "asc" }, `falta desempate en ${sort}`);
    }
  });
});

describe("priceColumn", () => {
  it("alquiler y alquiler-con-opción usan monthlyRent; venta usa currentPrice", () => {
    assert.equal(priceColumn("RENT"), "monthlyRent");
    assert.equal(priceColumn("ANY"), "monthlyRent");
    assert.equal(priceColumn("SALE"), "currentPrice");
  });
});
