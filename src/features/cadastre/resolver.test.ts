import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCadastre, type ResolverDeps } from "./resolver";
import { CadastreUnavailableError } from "./lookup";
import { GeocoderUnavailableError } from "@/features/geocoding/cartociudad";

const RC = "9872023VH5797S0001WX";
const PARCEL = "9872023VH5797S";

const INFO = {
  ref: RC,
  address: "CL GLORIA 51",
  floor: "03",
  door: "B",
  builtArea: 92,
  yearBuilt: 1987,
  use: "Residencial",
  hasFloorplan: false,
};

/** Deps que fallan en todo: cada test sobreescribe solo lo que usa. */
function deps(overrides: Partial<ResolverDeps>): ResolverDeps {
  const nope = () => {
    throw new Error("etapa no esperada en este test");
  };
  return {
    fetchByRefDetailed: nope,
    lookupByCoordinates: nope,
    listNearbyParcels: nope,
    queryByAddress: nope,
    geocodeAddress: nope,
    ...overrides,
  };
}

describe("resolveCadastre", () => {
  it("RC en la descripción corta el resto del embudo (nada más se llama)", async () => {
    const calls: string[] = [];
    const r = await resolveCadastre(
      { description: `Referencia catastral ${RC}`, latitude: 40, longitude: -3 },
      deps({
        fetchByRefDetailed: async (ref) => {
          calls.push(ref);
          return { kind: "one", info: INFO };
        },
      })
    );
    assert.equal(r.status, "resolved_candidate");
    assert.equal(r.method, "description");
    assert.deepEqual(calls, [RC]);
    // RC completa del anuncio validada por DNPRC → confianza alta
    assert.equal(r.candidates[0].confidence, "high");
  });

  it("RC SIN etiquetar en la descripción: no se fuerza confianza alta (Codex #3)", async () => {
    const r = await resolveCadastre(
      { description: `Piso céntrico ${RC} con ascensor` },
      deps({ fetchByRefDetailed: async () => ({ kind: "one", info: INFO }) })
    );
    assert.equal(r.status, "resolved_candidate");
    assert.notEqual(r.candidates[0].confidence, "high");
  });

  it("singleton contradicho por el anuncio: la confianza NO se eleva (Codex #2)", async () => {
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46, floor: "5", builtArea: 60 },
      deps({
        lookupByCoordinates: async () => PARCEL,
        // planta 03 y 92 m² contra anuncio de planta 5 y 60 m²
        fetchByRefDetailed: async () => ({ kind: "one", info: INFO }),
      })
    );
    assert.equal(r.candidates[0].confidence, "low");
    assert.ok(r.candidates[0].reasons.some((x) => x.code === "floor_mismatch"));
  });

  it("RC exacta NUNCA se autoconfirma: confirmed false y el usuario decide", async () => {
    const r = await resolveCadastre(
      { description: `RC: ${RC}` },
      deps({ fetchByRefDetailed: async () => ({ kind: "one", info: INFO }) })
    );
    assert.equal(r.confirmed, false);
  });

  it("RC de parcela (14) en descripción: lista sus viviendas ordenadas", async () => {
    const r = await resolveCadastre(
      { description: `finca ${PARCEL}`, floor: "1", builtArea: null },
      deps({
        fetchByRefDetailed: async (ref) => {
          assert.equal(ref, PARCEL);
          return {
            kind: "many",
            candidates: [
              { ref: "9872023VH5797S0002YZ", floor: "02", door: "A" },
              { ref: RC, floor: "01", door: "B" },
            ],
          };
        },
      })
    );
    assert.equal(r.method, "description");
    assert.equal(r.candidates.length, 2);
    assert.equal(r.candidates[0].ref, RC); // planta 1 coincide
    assert.ok(r.candidates[0].reasons.some((x) => x.code === "floor_match"));
  });

  it("coordenadas exactas: RCCOOR → parcela → viviendas", async () => {
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46 },
      deps({
        lookupByCoordinates: async (lat, lng) => {
          assert.equal(lat, 38.64);
          assert.equal(lng, -3.46);
          return PARCEL;
        },
        fetchByRefDetailed: async () => ({ kind: "one", info: INFO }),
      })
    );
    assert.equal(r.status, "resolved_candidate");
    assert.equal(r.method, "coordinates");
  });

  it("coordenadas difuminadas: RCCOOR vacío → RCCOOR_Distancia → parcelas cercanas", async () => {
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46 },
      deps({
        lookupByCoordinates: async () => null,
        listNearbyParcels: async () => [
          { ref: PARCEL, address: "CL GLORIA 51", distanceMeters: 5 },
          { ref: "9872028VH5797S", address: "CL JUAN DOMINGO 39", distanceMeters: 20 },
        ],
      })
    );
    assert.equal(r.status, "ambiguous");
    assert.equal(r.method, "nearby_coordinates");
    assert.equal(r.candidates[0].ref, PARCEL); // más cercana primero
    assert.equal(r.confirmed, false);
  });

  it("REGRESIÓN coords basura: la dirección va ANTES que las parcelas por distancia", async () => {
    // Incidente 2026-07-30: 14 fichas con el centroide de Castilla-La Mancha
    // devolvían todas la misma lista de Mejorada (Toledo). Con coords que no
    // aciertan RCCOOR pero una dirección resoluble, gana la dirección y
    // listNearbyParcels ni se llama.
    let nearbyCalled = false;
    const r = await resolveCadastre(
      {
        latitude: 40.0094603,
        longitude: -4.8816368,
        address: "Calle Gloria 51",
        city: "Santa Cruz de Mudela",
        province: "Ciudad Real",
      },
      deps({
        lookupByCoordinates: async () => null,
        listNearbyParcels: async () => {
          nearbyCalled = true;
          return [{ ref: "0000000XX0000X", address: "CL SUIZA 2 MEJORADA", distanceMeters: 3 }];
        },
        queryByAddress: async () => ({ kind: "one", ref: RC }),
        fetchByRefDetailed: async () => ({ kind: "one", info: INFO }),
      })
    );
    assert.equal(r.method, "address");
    assert.equal(nearbyCalled, false);
  });

  it("dirección con número inexistente: numerero → needs_address_confirmation", async () => {
    const r = await resolveCadastre(
      { address: "Calle Gloria 71", city: "Santa Cruz de Mudela", province: "Ciudad Real" },
      deps({
        queryByAddress: async () => ({
          kind: "number_suggestions",
          suggestions: [
            { number: "66", parcelRef: "9971005VH5797S" },
            { number: "67", parcelRef: "9972008VH5797S" },
          ],
        }),
      })
    );
    assert.equal(r.status, "needs_address_confirmation");
    assert.equal(r.method, "address_suggestion");
    assert.equal(r.numberSuggestions?.length, 2);
    assert.equal(r.numberSuggestions?.[0].number, "66");
  });

  it("dirección geocodificada por CartoCiudad: pista de parcela validada vía DNPRC", async () => {
    const r = await resolveCadastre(
      { address: "Calle Gloria 51", city: "Santa Cruz de Mudela", province: "Ciudad Real" },
      deps({
        queryByAddress: async () => ({ kind: "none" }),
        geocodeAddress: async (p) => {
          // Solo campos de dirección; jamás la descripción
          assert.equal(p.address, "Calle Gloria 51");
          return [
            {
              address: "CALLE GLORIA 51, Santa Cruz de Mudela",
              latitude: 38.6401,
              longitude: -3.4632,
              parcelRefHint: PARCEL,
              type: "portal",
            },
          ];
        },
        fetchByRefDetailed: async (ref) => {
          assert.equal(ref, PARCEL);
          return { kind: "one", info: INFO };
        },
      })
    );
    assert.equal(r.status, "resolved_candidate");
    assert.equal(r.method, "cartociudad");
  });

  it("pin del usuario: solo cadena de coordenadas, sin fallback a dirección", async () => {
    const r = await resolveCadastre(
      {
        address: "no debe usarse",
        city: "X",
        province: "Y",
        pin: { latitude: 38.64, longitude: -3.46 },
      },
      deps({
        lookupByCoordinates: async () => PARCEL,
        fetchByRefDetailed: async () => ({ kind: "one", info: INFO }),
      })
    );
    assert.equal(r.method, "map_pin");
    assert.equal(r.status, "resolved_candidate");
  });

  it("fallo de una capa: continúa con la siguiente y lo registra en attempts", async () => {
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46, address: "Calle Gloria 51", city: "SCM", province: "CR" },
      deps({
        lookupByCoordinates: async () => {
          throw new CadastreUnavailableError("timeout");
        },
        listNearbyParcels: async () => {
          throw new CadastreUnavailableError("timeout");
        },
        queryByAddress: async () => ({ kind: "one", ref: RC }),
        fetchByRefDetailed: async () => ({ kind: "one", info: INFO }),
      })
    );
    assert.equal(r.status, "resolved_candidate");
    assert.equal(r.method, "address");
    assert.ok(r.attempts.some((a) => a.stage === "coordinates" && a.outcome === "error"));
  });

  it("ninguna capa disponible: upstream_unavailable (distinto de not_found)", async () => {
    const boom = async () => {
      throw new CadastreUnavailableError("caído");
    };
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46, address: "Calle Gloria 51", city: "SCM", province: "CR" },
      deps({
        lookupByCoordinates: boom,
        listNearbyParcels: boom,
        queryByAddress: boom,
        geocodeAddress: async () => {
          throw new GeocoderUnavailableError("caído");
        },
      })
    );
    assert.equal(r.status, "upstream_unavailable");
  });

  it("todo vacío (servicios sanos): needs_map_pin como capa 4", async () => {
    const r = await resolveCadastre(
      { latitude: 38.64, longitude: -3.46, address: "Calle Inventada 1", city: "SCM", province: "CR" },
      deps({
        lookupByCoordinates: async () => null,
        listNearbyParcels: async () => [],
        queryByAddress: async () => ({ kind: "none" }),
        geocodeAddress: async () => [],
      })
    );
    assert.equal(r.status, "needs_map_pin");
    assert.equal(r.candidates.length, 0);
  });

  it("NINGUNA selección silenciosa: toda resolución sale con confirmed false", async () => {
    const r = await resolveCadastre(
      { description: `Referencia catastral ${RC}` },
      deps({ fetchByRefDetailed: async () => ({ kind: "one", info: INFO }) })
    );
    assert.equal(r.confirmed, false);
    // y los attempts no llevan la RC ni la dirección
    for (const a of r.attempts) {
      assert.ok(!JSON.stringify(a).includes(RC));
      assert.ok(!JSON.stringify(a).includes("GLORIA"));
    }
  });

  it("hidratación limitada: máximo 8 DNPRC extra, fallos parciales conservados", async () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      ref: `987202${(i % 10)}VH5797S${String(i).padStart(2, "0")}01W${String.fromCharCode(65 + (i % 20))}`.slice(0, 20),
      floor: "01",
      door: String(i),
    }));
    let hydrateCalls = 0;
    const r = await resolveCadastre(
      { description: `finca ${PARCEL}`, builtArea: 90 },
      deps({
        fetchByRefDetailed: async (ref) => {
          if (ref === PARCEL) return { kind: "many", candidates };
          hydrateCalls++;
          if (hydrateCalls % 2 === 0) throw new Error("DNPRC caído para este");
          return { kind: "one", info: { ref, builtArea: 92, hasFloorplan: false } };
        },
      })
    );
    assert.ok(hydrateCalls <= 8, `hidrató ${hydrateCalls} > 8`);
    assert.equal(r.candidates.length, 20); // los no hidratados siguen ahí
    assert.ok(r.candidates.some((c) => c.hydrated));
    assert.ok(r.candidates.some((c) => !c.hydrated));
  });
});
