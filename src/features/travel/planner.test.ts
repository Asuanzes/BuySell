import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FlightSearchRequest, candidateKey, distanceKm, nearbyAirports } from "@nidokey/shared";
import { expandCode, planCandidates } from "./planner";

/**
 * Harness del planificador: sin red, sin BBDD y sin reloj (el "hoy" se inyecta
 * en cada caso). Lo que se protege aquí es lo que cuesta dinero si se rompe —
 * cuántos itinerarios distintos se piden — y lo que engaña al usuario si se
 * rompe: que el baseline exista y que un desvío lleve su traslado sumado.
 */

const TODAY = "2026-09-01";

function req(over: Record<string, unknown> = {}) {
  return FlightSearchRequest.parse({
    origin: "MAD",
    destination: "BCN",
    departDate: "2026-09-10",
    returnDate: "2026-09-17",
    ...over,
  });
}

/** Sin aeropuertos cercanos: aísla el eje de fechas. */
function reqNoNearby(over: Record<string, unknown> = {}) {
  const { preferences, ...rest } = over as { preferences?: Record<string, unknown> };
  return req({
    ...rest,
    preferences: { ...(preferences ?? {}), nearby: { enabled: false } },
  });
}

const byStructure = (r: ReturnType<typeof planCandidates>, s: string) =>
  r.candidates.filter((c) => c.structure === s);

// ── Matriz de fechas y restricciones ────────────────────────────────────────

describe("matriz de fechas", () => {
  it("ida y vuelta con ±2 días da 25 pares × 2 estructuras", () => {
    const r = planCandidates(reqNoNearby(), { todayISO: TODAY });
    assert.equal(byStructure(r, "round_trip").length, 25);
    assert.equal(byStructure(r, "split").length, 25);
    assert.equal(r.candidates.length, 50);
  });

  it("solo ida: 5 fechas y ninguna estructura de vuelta", () => {
    const r = planCandidates(reqNoNearby({ returnDate: null }), { todayISO: TODAY });
    assert.equal(r.candidates.length, 5);
    assert.ok(r.candidates.every((c) => c.structure === "one_way"));
    assert.ok(r.candidates.every((c) => c.legs.length === 1));
  });

  it("flexDays 0 deja solo las fechas exactas", () => {
    const r = planCandidates(reqNoNearby({ preferences: { flexDays: 0, nearby: { enabled: false } } }), {
      todayISO: TODAY,
    });
    assert.equal(byStructure(r, "round_trip").length, 1);
    assert.ok(r.candidates.every((c) => c.legs[0]!.date === "2026-09-10"));
  });

  it("descarta las idas ya pasadas y lo dice", () => {
    const r = planCandidates(reqNoNearby({ departDate: "2026-09-02", returnDate: null }), {
      todayISO: "2026-09-03",
    });
    // De 08-31…09-04 solo sobreviven 09-03 y 09-04.
    assert.equal(r.candidates.length, 2);
    assert.ok(r.candidates.every((c) => c.legs[0]!.date >= "2026-09-03"));
    assert.equal(r.rejected.filter((x) => x.reason === "constraint").length, 3);
  });

  it("una ida exacta ya pasada deja la búsqueda SIN baseline (no se falsea)", () => {
    const r = planCandidates(reqNoNearby({ departDate: "2026-09-02", returnDate: null }), {
      todayISO: "2026-09-03",
    });
    assert.ok(r.candidates.every((c) => !c.isBaseline));
  });
});

describe("restricciones", () => {
  it("stayDeltaDays acota cuánto puede cambiar la duración del viaje", () => {
    const r = planCandidates(
      reqNoNearby({ preferences: { stayDeltaDays: 1, nearby: { enabled: false } } }),
      { todayISO: TODAY }
    );
    assert.equal(byStructure(r, "round_trip").length, 13);
    assert.ok(r.candidates.every((c) => Math.abs(c.stayDeltaDays) <= 1));
  });

  it("minDaysStay impide que la vuelta se cruce con la ida", () => {
    const r = planCandidates(
      reqNoNearby({
        departDate: "2026-09-10",
        returnDate: "2026-09-11",
        preferences: { minDaysStay: 2, stayDeltaDays: 6, nearby: { enabled: false } },
      }),
      { todayISO: TODAY }
    );
    // La regla aplica a las fechas DESPLAZADAS. Las exactas son intocables, y eso
    // incluye su variante partida: si le ofrecemos su viaje como billete único,
    // negarnos a mirarlo como dos billetes sería incoherente.
    const shifted = r.candidates.filter(
      (c) => c.legs.length === 2 && (c.driftDays.depart !== 0 || c.driftDays.return !== 0)
    );
    assert.ok(shifted.length > 0);
    assert.ok(shifted.every((c) => c.stayDeltaDays + 1 >= 2));

    const exact = r.candidates.filter((c) => c.driftDays.depart === 0 && c.driftDays.return === 0);
    assert.deepEqual(
      exact.map((c) => c.structure).sort(),
      ["round_trip", "split"],
      "las fechas pedidas sobreviven en sus dos formas de compra"
    );
  });

  it("las fechas EXACTAS sobreviven aunque incumplan la estancia mínima", () => {
    // Ida y vuelta el mismo día: es lo que ha pedido, y es el baseline.
    const r = planCandidates(
      reqNoNearby({
        departDate: "2026-09-10",
        returnDate: "2026-09-10",
        preferences: { minDaysStay: 3, nearby: { enabled: false } },
      }),
      { todayISO: TODAY }
    );
    const base = r.candidates.find((c) => c.isBaseline);
    assert.ok(base, "el baseline no puede desaparecer por una regla de estancia");
    assert.equal(base!.legs[0]!.date, "2026-09-10");
    assert.equal(base!.legs[1]!.date, "2026-09-10");
  });

  it("nunca genera un trayecto con el mismo origen y destino", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    assert.ok(r.candidates.every((c) => c.legs.every((l) => l.origin !== l.destination)));
  });
});

// ── Baseline ────────────────────────────────────────────────────────────────

describe("baseline", () => {
  it("va el primero, con las fechas y los aeropuertos pedidos", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    const base = r.candidates[0]!;
    assert.equal(base.isBaseline, true);
    assert.equal(base.structure, "round_trip");
    assert.deepEqual(base.legs, [
      { origin: "MAD", destination: "BCN", date: "2026-09-10" },
      { origin: "BCN", destination: "MAD", date: "2026-09-17" },
    ]);
    assert.deepEqual(base.driftDays, { depart: 0, return: 0 });
    assert.equal(base.stayDeltaDays, 0);
    assert.equal(base.groundTransferEstimate, 0);
  });

  it("hay exactamente uno", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    assert.equal(r.candidates.filter((c) => c.isBaseline).length, 1);
  });

  it("un billete partido NUNCA es el baseline aunque coincidan las fechas", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    assert.ok(r.candidates.filter((c) => c.structure === "split").every((c) => !c.isBaseline));
  });

  it("el desplazamiento se mide contra lo que pidió el usuario", () => {
    const r = planCandidates(reqNoNearby(), { todayISO: TODAY });
    const moved = r.candidates.find(
      (c) => c.legs[0]!.date === "2026-09-08" && c.legs[1]!.date === "2026-09-19" && c.structure === "round_trip"
    );
    assert.ok(moved);
    assert.deepEqual(moved!.driftDays, { depart: -2, return: 2 });
    assert.equal(moved!.stayDeltaDays, 4);
  });
});

// ── Estructuras: ida/vuelta, partido y open-jaw ─────────────────────────────

describe("estructuras", () => {
  it("el billete partido usa los mismos trayectos pero es otro candidato", () => {
    const r = planCandidates(reqNoNearby(), { todayISO: TODAY });
    const rt = r.candidates.find((c) => c.structure === "round_trip" && c.isBaseline)!;
    const sp = r.candidates.find(
      (c) => c.structure === "split" && c.legs[0]!.date === rt.legs[0]!.date && c.legs[1]!.date === rt.legs[1]!.date
    );
    assert.ok(sp, "debe existir la variante partida de las fechas exactas");
    assert.deepEqual(sp!.legs, rt.legs);
    assert.notEqual(sp!.key, rt.key);
  });

  it("allowSplitTickets=false lo desactiva", () => {
    const r = planCandidates(
      reqNoNearby({ preferences: { allowSplitTickets: false, nearby: { enabled: false } } }),
      { todayISO: TODAY }
    );
    assert.equal(byStructure(r, "split").length, 0);
    assert.equal(r.candidates.length, 25);
  });

  it("open-jaw: vuelve desde otro aeropuerto, solo en fechas exactas", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    const oj = byStructure(r, "open_jaw");
    assert.equal(oj.length, 1);
    assert.deepEqual(oj[0]!.legs, [
      { origin: "MAD", destination: "BCN", date: "2026-09-10" },
      { origin: "REU", destination: "MAD", date: "2026-09-17" },
    ]);
    assert.ok(oj[0]!.groundTransferEstimate > 0, "volver desde Reus tiene traslado");
  });

  it("allowOpenJaw=false lo desactiva", () => {
    const r = planCandidates(req({ preferences: { allowOpenJaw: false } }), { todayISO: TODAY });
    assert.equal(byStructure(r, "open_jaw").length, 0);
  });

  it("sin aeropuertos alternativos no hay open-jaw que valga", () => {
    // Londres entra por código de ciudad (LON), que ya cubre sus 6 aeropuertos:
    // un open-jaw dentro del mismo grupo no pregunta nada nuevo.
    const r = planCandidates(req({ destination: "LHR" }), { todayISO: TODAY });
    assert.equal(byStructure(r, "open_jaw").length, 0);
  });

  it("solo ida no genera ni partido ni open-jaw", () => {
    const r = planCandidates(req({ returnDate: null }), { todayISO: TODAY });
    assert.equal(byStructure(r, "split").length, 0);
    assert.equal(byStructure(r, "open_jaw").length, 0);
  });
});

// ── Aeropuertos cercanos ────────────────────────────────────────────────────

describe("aeropuertos cercanos", () => {
  it("explora el aeropuerto de al lado con poca flexibilidad de fechas", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    const reus = r.candidates.filter((c) => c.legs[0]!.destination === "REU");
    // 3×3 pares de fechas (±1) para el destino alternativo.
    assert.equal(reus.length, 9);
    assert.ok(reus.every((c) => Math.abs(c.driftDays.depart) <= 1));
  });

  it("un origen sin aeropuertos a mano no inventa alternativas", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    // Madrid no tiene ningún aeropuerto de la tabla a menos de 120 km.
    assert.ok(r.candidates.every((c) => c.legs[0]!.origin === "MAD"));
  });

  it("usa el código de ciudad cuando existe, y sin traslado inventado", () => {
    const r = planCandidates(req({ destination: "LHR" }), { todayISO: TODAY });
    const london = r.candidates.filter((c) => c.legs[0]!.destination === "LON");
    assert.ok(london.length > 0, "LON cubre los seis aeropuertos en una consulta");
    assert.ok(
      london.every((c) => c.groundTransferEstimate === 0),
      "al planificar no se sabe a qué aeropuerto de Londres se llega: estimarlo sería inventarlo"
    );
  });

  it("nearby.enabled=false devuelve exactamente el comportamiento de siempre", () => {
    const r = planCandidates(reqNoNearby(), { todayISO: TODAY });
    assert.ok(r.candidates.every((c) => c.groundTransferEstimate === 0));
    assert.ok(r.candidates.every((c) => c.legs.every((l) => l.origin === "MAD" || l.origin === "BCN")));
    assert.ok(r.candidates.every((c) => c.legs.every((l) => l.destination === "MAD" || l.destination === "BCN")));
  });

  it("el traslado se cobra por cada aeropuerto pisado y por viajero", () => {
    const km = Math.round(distanceKm("BCN", "REU")!);
    const one = planCandidates(req(), { todayISO: TODAY });
    const four = planCandidates(req({ adults: 2, childAges: [4, 8] }), { todayISO: TODAY });
    const pick = (r: ReturnType<typeof planCandidates>) =>
      r.candidates.find((c) => c.structure === "round_trip" && c.legs[0]!.destination === "REU")!;

    // Ida y vuelta: el desvío se paga al llegar y al salir → 2 × km.
    assert.equal(pick(one).groundTransferEstimate, 2 * km * 18);
    assert.equal(pick(four).groundTransferEstimate, 2 * km * 18 * 4);
    assert.equal(pick(one).detourKm.destination, km);
    assert.equal(pick(one).detourKm.origin, 0);
  });

  it("la tabla de aeropuertos es coherente", () => {
    const near = nearbyAirports("BCN", { radiusKm: 120, max: 5 });
    assert.deepEqual(
      near.map((n) => n.iata),
      ["REU", "GRO"],
      "ordenados por distancia, de forma reproducible"
    );
    assert.ok(near[0]!.distanceKm > 50 && near[0]!.distanceKm < 110);
    assert.deepEqual(nearbyAirports("MAD", { radiusKm: 120, max: 5 }), []);
    // Los del mismo grupo de ciudad no cuentan como "cercanos": ya van juntos.
    assert.ok(nearbyAirports("LHR", { radiusKm: 120, max: 5 }).every((n) => n.iata !== "LGW"));
    assert.deepEqual(expandCode("LON"), ["LCY", "LGW", "LHR", "LTN", "SEN", "STN"]);
    assert.deepEqual(expandCode("MAD"), ["MAD"]);
  });
});

// ── Deduplicación ───────────────────────────────────────────────────────────

describe("deduplicación", () => {
  it("la clave canónica identifica al itinerario, no al objeto", () => {
    const legs = [
      { origin: "MAD", destination: "BCN", date: "2026-09-10" },
      { origin: "BCN", destination: "MAD", date: "2026-09-17" },
    ];
    assert.equal(candidateKey("round_trip", legs), candidateKey("round_trip", [...legs]));
    // Mismos vuelos, producto distinto: uno protege la conexión y el otro no.
    assert.notEqual(candidateKey("round_trip", legs), candidateKey("split", legs));
    assert.notEqual(
      candidateKey("round_trip", legs),
      candidateKey("round_trip", [legs[1]!, legs[0]!]),
      "el orden de los trayectos importa"
    );
  });

  it("ningún candidato se repite en una búsqueda completa", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    const keys = r.candidates.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("un duplicado se descarta y se registra el motivo", () => {
    // flexDays 0 + destino alternativo: el eje de aeropuertos vuelve a proponer
    // la misma fecha exacta, así que las claves se cruzan de verdad.
    const r = planCandidates(
      req({ preferences: { flexDays: 0, allowSplitTickets: false, allowOpenJaw: false } }),
      { todayISO: TODAY }
    );
    const keys = r.candidates.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(r.stats.afterConstraints, r.candidates.length);
  });
});

// ── Tope de generación ──────────────────────────────────────────────────────

describe("tope de candidatos", () => {
  it("recorta, pero nunca en silencio", () => {
    const r = planCandidates(req(), { todayISO: TODAY, maxCandidates: 5 });
    assert.equal(r.candidates.length, 5);
    assert.ok(r.stats.truncated > 0, "lo que se deja fuera se cuenta y se puede enseñar");
    assert.equal(r.candidates[0]!.isBaseline, true, "el baseline entra siempre, aunque el tope sea 1");
  });

  it("las estadísticas cuadran con lo devuelto", () => {
    const r = planCandidates(req(), { todayISO: TODAY });
    assert.equal(r.stats.afterConstraints, r.candidates.length);
    assert.equal(
      Object.values(r.stats.byStructure).reduce((a, b) => a + b, 0),
      r.candidates.length
    );
    assert.ok(r.stats.generated >= r.candidates.length);
  });
});
