import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planRecheck, type ListingState, type RecheckPlan } from "./recheck-plan";
import type { ScrapeOutcome } from "./types";

/**
 * Harness DETERMINISTA de cambios de precio (sin red, sin BBDD): reproduce la
 * secuencia completa exigida — venta 220.000 → 210.000 → sin cambios →
 * 215.000 → desaparece → reaparece; alquiler 900 → 850 → sin cambios → 875 —
 * y verifica snapshots, columnas, alertas, idempotencia, guard de carreras,
 * cordura y estados.
 */

const T0 = new Date("2026-07-30T08:00:00Z");

function saleListing(over: Partial<ListingState> = {}): ListingState {
  return {
    id: "l-sale",
    propertyId: "p1",
    operationType: "SALE",
    status: "ACTIVE",
    lastPrice: 22_000_000, // 220.000 €
    ...over,
  };
}

function rentListing(over: Partial<ListingState> = {}): ListingState {
  return {
    id: "l-rent",
    propertyId: "p1",
    operationType: "RENT",
    status: "ACTIVE",
    lastPrice: 90_000, // 900 €/mes
    ...over,
  };
}

function okOutcome(priceCents: number | null, at: Date = T0): ScrapeOutcome {
  return {
    kind: "ok",
    result: {
      portal: "FOTOCASA",
      url: "https://fotocasa.es/x",
      price: priceCents,
      status: "ACTIVE",
      observedAt: at,
    },
  };
}

/** Simula lo que applyRecheckPlan escribe en el Listing (estado en memoria). */
function apply(listing: ListingState, plan: RecheckPlan): ListingState {
  return {
    ...listing,
    status: plan.listingData.status ?? listing.status,
    lastPrice: plan.listingData.lastPrice ?? listing.lastPrice,
  };
}

describe("secuencia determinista VENTA: 220.000 → 210.000 → = → 215.000 → gone → reaparece", () => {
  it("recorre la secuencia con un snapshot por cambio real y alerta única", () => {
    let l = saleListing();

    // 1. Bajada a 210.000 €
    const drop = planRecheck(l, okOutcome(21_000_000), T0);
    assert.equal(drop.summary.priceChanged, true);
    assert.equal(drop.summary.previousPrice, 22_000_000);
    assert.equal(drop.summary.newPrice, 21_000_000);
    // diferencia absoluta y porcentual derivables del summary
    assert.equal(drop.summary.previousPrice! - drop.summary.newPrice!, 1_000_000);
    assert.ok(Math.abs((1 - drop.summary.newPrice! / drop.summary.previousPrice!) * 100 - 4.545) < 0.01);
    assert.deepEqual(drop.snapshot, { price: 21_000_000, status: "PRICE_DROP", observedAt: T0 });
    assert.deepEqual(drop.propertyPatch, { currentPrice: 21_000_000 }); // venta → currentPrice
    assert.equal(drop.alert?.field, "price");
    assert.equal(drop.alert?.newCents, 21_000_000);
    assert.equal(drop.guardPrevPrice, 22_000_000); // guard optimista contra carreras
    assert.equal(drop.listingData.lastCheckResult, "ok");
    l = apply(l, drop);
    assert.equal(l.status, "PRICE_DROP");

    // 2. Sin cambios (210.000 de nuevo): CERO snapshots, CERO alertas
    const same = planRecheck(l, okOutcome(21_000_000), T0);
    assert.equal(same.summary.priceChanged, false);
    assert.equal(same.snapshot, null);
    assert.equal(same.propertyPatch, null);
    assert.equal(same.alert, null);
    assert.equal(same.guardPrevPrice, undefined);
    l = apply(l, same);

    // 3. Subida a 215.000 €
    const up = planRecheck(l, okOutcome(21_500_000), T0);
    assert.equal(up.snapshot?.status, "PRICE_UP");
    assert.deepEqual(up.propertyPatch, { currentPrice: 21_500_000 });
    assert.equal(up.alert?.field, "price");
    l = apply(l, up);

    // 4. Desaparece: REMOVED + alerta de estado UNA vez
    const gone = planRecheck(l, { kind: "gone", reason: "HTTP 404" }, T0);
    assert.equal(gone.summary.outcome, "gone");
    assert.equal(gone.listingData.status, "REMOVED");
    assert.equal(gone.listingData.lastCheckResult, "gone");
    assert.equal(gone.snapshot, null);
    assert.equal(gone.alert?.status, "REMOVED");
    assert.ok(gone.notify);
    l = apply(l, gone);

    // 4b. Sigue desaparecido: NO se re-notifica (solo transición)
    const goneAgain = planRecheck(l, { kind: "gone", reason: "HTTP 404" }, T0);
    assert.equal(goneAgain.alert, null);
    assert.equal(goneAgain.notify, null);

    // 5. Reaparece con el mismo precio: se REACTIVA sin snapshot ni alerta
    const back = planRecheck(l, okOutcome(21_500_000), T0);
    assert.equal(back.summary.outcome, "ok");
    assert.equal(back.listingData.status, "ACTIVE");
    assert.equal(back.snapshot, null);
    assert.equal(back.alert, null);
    l = apply(l, back);
    assert.equal(l.status, "ACTIVE");
    assert.equal(l.lastPrice, 21_500_000);
  });
});

describe("secuencia determinista ALQUILER: 900 → 850 → = → 875", () => {
  it("la renta va a monthlyRent con alerta field=rent, nunca a currentPrice", () => {
    let l = rentListing();

    const drop = planRecheck(l, okOutcome(85_000), T0);
    assert.equal(drop.summary.priceChanged, true);
    assert.deepEqual(drop.propertyPatch, { monthlyRent: 85_000 }); // alquiler → monthlyRent
    assert.equal(drop.alert?.field, "rent");
    assert.deepEqual(drop.snapshot, { price: 85_000, status: "PRICE_DROP", observedAt: T0 });
    l = apply(l, drop);

    const same = planRecheck(l, okOutcome(85_000), T0);
    assert.equal(same.snapshot, null);
    assert.equal(same.alert, null);
    l = apply(l, same);

    const up = planRecheck(l, okOutcome(87_500), T0);
    assert.deepEqual(up.propertyPatch, { monthlyRent: 87_500 });
    assert.equal(up.snapshot?.status, "PRICE_UP");
    assert.equal(up.alert?.field, "rent");
    l = apply(l, up);
    assert.equal(l.lastPrice, 87_500);
  });

  it("RENT_TO_OWN se sigue por su RENTA (monthlyRent), como cualquier alquiler", () => {
    // Su precio principal es la cuota mensual: es lo que anuncia el portal y lo
    // que guarda la importación. El importe de la compra, si se conoce, vive
    // aparte en currentPrice y no es lo que sigue el recheck.
    const l = rentListing({ id: "l-rto", operationType: "RENT_TO_OWN" });
    const drop = planRecheck(l, okOutcome(85_000), T0);
    assert.deepEqual(drop.propertyPatch, { monthlyRent: 85_000 });
    assert.equal(drop.alert?.field, "rent");
  });
});

describe("primer precio conocido (lastPrice null)", () => {
  it("fija la línea base SIN etiquetar bajada/subida, con snapshot y guard null", () => {
    const l = saleListing({ lastPrice: null });
    const plan = planRecheck(l, okOutcome(21_000_000), T0);
    assert.equal(plan.summary.priceChanged, true);
    assert.equal(plan.listingData.status, "ACTIVE"); // NO "PRICE_DROP"
    assert.equal(plan.snapshot?.status, "ACTIVE");
    assert.equal(plan.snapshot?.price, 21_000_000);
    assert.deepEqual(plan.propertyPatch, { currentPrice: 21_000_000 });
    // El guard con null protege igual: updateMany exige lastPrice IS NULL.
    assert.equal(plan.guardPrevPrice, null);
    // La alerta sí puede saltar (shouldFire trata oldCents null como "sin cruce previo").
    assert.equal(plan.alert?.oldCents, null);
    assert.equal(plan.alert?.newCents, 21_000_000);
  });
});

describe("idempotencia y carreras", () => {
  it("procesar dos veces la misma respuesta no duplica snapshot", () => {
    let l = saleListing();
    const first = planRecheck(l, okOutcome(21_000_000), T0);
    assert.ok(first.snapshot);
    l = apply(l, first);
    const second = planRecheck(l, okOutcome(21_000_000), T0);
    assert.equal(second.snapshot, null); // mismo payload otra vez → sin cambio
    assert.equal(second.alert, null);
  });

  it("dos ejecuciones concurrentes desde el mismo estado: el guard deja pasar solo una", () => {
    const l = saleListing();
    const a = planRecheck(l, okOutcome(21_000_000), T0);
    const b = planRecheck(l, okOutcome(21_000_000), T0);
    // Ambos planes proponen el cambio con el MISMO guard: en BBDD, el
    // updateMany condicionado (lastPrice = guard) solo puede acertar una vez.
    assert.equal(a.guardPrevPrice, 22_000_000);
    assert.equal(b.guardPrevPrice, 22_000_000);
    // Tras aplicar a, lastPrice ya no coincide con el guard de b:
    const after = apply(l, a);
    assert.notEqual(after.lastPrice, b.guardPrevPrice);
  });
});

describe("cordura de precios (isReasonablePriceChange)", () => {
  it("una caída a <50% se rechaza: sin snapshot, sin alerta, con log", () => {
    const l = saleListing(); // 220.000 €
    const crazy = planRecheck(l, okOutcome(10_000_000), T0); // 100.000 € (45%)
    assert.equal(crazy.summary.outcome, "error");
    assert.equal(crazy.snapshot, null);
    assert.equal(crazy.propertyPatch, null);
    assert.equal(crazy.alert, null);
    assert.ok(crazy.logEvent);
    assert.equal(crazy.listingData.lastCheckResult, "error");
    assert.ok(crazy.listingData.lastCheckDetail);
  });

  it("los límites son ratio 0.5–2.0 inclusive", () => {
    const l = saleListing({ lastPrice: 20_000_000 });
    assert.ok(planRecheck(l, okOutcome(10_000_000), T0).snapshot); // exactamente 0.5 → pasa
    assert.ok(planRecheck(l, okOutcome(40_000_000), T0).snapshot); // exactamente 2.0 → pasa
    assert.equal(planRecheck(l, okOutcome(9_999_999), T0).snapshot, null);
    assert.equal(planRecheck(l, okOutcome(40_000_001), T0).snapshot, null);
  });
});

describe("respuestas degradadas", () => {
  it("respuesta incompleta (sin precio): se registra visto, sin snapshot ni alerta", () => {
    const l = saleListing();
    const plan = planRecheck(l, okOutcome(null), T0);
    assert.equal(plan.summary.outcome, "ok");
    assert.equal(plan.summary.priceChanged, false);
    assert.equal(plan.snapshot, null);
    assert.equal(plan.listingData.lastPrice, undefined); // no pisa el precio
    assert.equal(plan.listingData.lastSeenAt, T0);
    assert.equal(plan.summary.newPrice, 22_000_000); // conserva el anterior
  });

  it("blocked/error: solo marca de comprobación con detalle, estado intacto", () => {
    const l = saleListing({ status: "PRICE_DROP" });
    for (const outcome of [
      { kind: "blocked", reason: "DataDome" } as const,
      { kind: "error", error: "timeout" } as const,
    ]) {
      const plan = planRecheck(l, outcome, T0);
      assert.equal(plan.listingData.status, undefined); // el estado NO cambia
      assert.equal(plan.snapshot, null);
      assert.equal(plan.alert, null);
      assert.equal(plan.listingData.lastCheckResult, outcome.kind);
      assert.ok(plan.listingData.lastCheckDetail); // "no se pudo comprobar" visible
    }
  });
});

describe("multi-anuncio: autoridad y separación del histórico", () => {
  it("cada anuncio escribe SU columna; el último cambio observado gana dentro de ella", () => {
    // Ficha mixta: venta en Fotocasa + alquiler en Pisos.com.
    const sale = saleListing({ id: "l1" });
    const rent = rentListing({ id: "l2" });

    const p1 = planRecheck(sale, okOutcome(21_000_000), T0);
    const p2 = planRecheck(rent, okOutcome(85_000), T0);
    // Venta y renta jamás se cruzan de columna:
    assert.deepEqual(p1.propertyPatch, { currentPrice: 21_000_000 });
    assert.deepEqual(p2.propertyPatch, { monthlyRent: 85_000 });
    // El histórico es separable: cada snapshot nace ligado a su listing
    // (applyRecheckPlan persiste listingId + portal como source).
    assert.ok(p1.snapshot && p2.snapshot);

    // Dos anuncios de VENTA con precios distintos: autoridad = último cambio
    // observado (decisión explícita, ver recheck-plan.ts y ADR).
    const saleB = saleListing({ id: "l3", lastPrice: 22_500_000 });
    const p3 = planRecheck(saleB, okOutcome(21_800_000), T0);
    assert.deepEqual(p3.propertyPatch, { currentPrice: 21_800_000 });
  });
});
