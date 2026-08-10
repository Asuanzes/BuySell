import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXTAUTH_URL = "https://nidokey.test";

let botTools: typeof import("./bot-tools") | null = null;

async function tools(): Promise<typeof import("./bot-tools")> {
  botTools ??= await import("./bot-tools");
  return botTools;
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { "content-type": "application/json" } });
}

test("comparar_registros rechaza menos de 2 ids sin llamar a la API", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse({});
  };

  const out = JSON.parse(await (await tools()).runTool("comparar_registros", JSON.stringify({ type: "property", ids: ["p1"] }), "token"));

  assert.match(out.error, /2 o 3 ids/);
  assert.equal(calls, 0);
});

test("comparar_registros rechaza ids ajenos o no propios", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/records/p1?")) {
      return jsonResponse({ id: "p1", type: "property", title: "Piso propio", meta: { currentPrice: 100_000_00 } });
    }
    if (url.includes("/api/records/p2?")) return jsonResponse({ error: "Not found" }, { status: 404 });
    if (url.includes("/api/events?")) return jsonResponse({ items: [] });
    return jsonResponse({ error: "unexpected" }, { status: 500 });
  };

  const out = JSON.parse(await (await tools()).runTool("comparar_registros", JSON.stringify({ type: "property", ids: ["p1", "p2"] }), "token"));

  assert.match(out.error, /registro no comparable \(p2\)/);
  assert.match(out.error, /ids propios del mismo tipo/);
});

test("comparar_registros rechaza tipo mixto", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/records/p1?")) return jsonResponse({ id: "p1", type: "property", title: "Piso" });
    if (url.includes("/api/records/c1?")) return jsonResponse({ id: "c1", type: "crypto", title: "Bitcoin" });
    if (url.includes("/api/events?")) return jsonResponse({ items: [] });
    return jsonResponse({ error: "unexpected" }, { status: 500 });
  };

  const out = JSON.parse(await (await tools()).runTool("comparar_registros", JSON.stringify({ type: "property", ids: ["p1", "c1"] }), "token"));

  assert.match(out.error, /tipo mixto|mismo tipo/);
});

test("comparar_registros serializa campos relevantes y eventos lado-a-lado", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/records/p1?")) {
      return jsonResponse({
        id: "p1",
        type: "property",
        title: "Piso centro",
        primaryValue: "200.000 €",
        status: "FOR_SALE",
        meta: { currentPrice: 200_000_00, builtArea: 100, rooms: 3, city: "Oviedo", neighborhood: "Centro" },
      });
    }
    if (url.includes("/api/records/p2?")) {
      return jsonResponse({
        id: "p2",
        type: "property",
        title: "Piso sur",
        primaryValue: "150.000 €",
        status: "RESERVED",
        meta: { currentPrice: 150_000_00, builtArea: 75, rooms: 2, city: "Gijón" },
      });
    }
    if (url.includes("recordId=p1")) {
      return jsonResponse({
        items: [
          {
            eventType: "price_changed",
            source: "recheck",
            observedAt: "2026-08-10T10:00:00.000Z",
            payload: { previousCents: 210_000_00, newCents: 200_000_00, field: "price" },
          },
        ],
      });
    }
    if (url.includes("recordId=p2")) return jsonResponse({ items: [] });
    return jsonResponse({ error: "unexpected" }, { status: 500 });
  };

  const out = JSON.parse(await (await tools()).runTool("comparar_registros", JSON.stringify({ type: "property", ids: ["p1", "p2"] }), "token"));

  assert.equal(out.type, "property");
  assert.equal(out.provenance, "datos_guardados_del_usuario");
  assert.deepEqual(out.ids, ["p1", "p2"]);
  assert.equal(out.records[0].precio_eur, 200000);
  assert.equal(out.records[0].eur_m2, 2000);
  assert.equal(out.records[0].habitaciones, 3);
  assert.equal(out.records[0].ubicacion, "Oviedo · Centro");
  assert.equal(out.records[1].precio_eur, 150000);
  assert.equal(out.records[1].m2, 75);
  assert.equal(out.events.p1[0].previousCents, 210_000_00);
  assert.equal(out.events.p1[0].newCents, 200_000_00);
});

/**
 * WRITE_TOOLS es la lista de tools que EXIGEN confirmación del usuario.
 *
 * `comparar_registros` no entra porque solo lee. `preparar_visita` sí escribe
 * desde que persiste el checklist (RecordTask + evento), pero tampoco entra, y
 * es deliberado: pedir «¿confirmas?» a quien acaba de pedir que le preparen la
 * visita sería absurdo. Cae en la misma categoría que `guardar_compartido`:
 * ADITIVA y sobre un registro propio, con techo de daño nulo (idempotente por
 * día, no borra ni modifica datos del inmueble).
 *
 * Si algún día se le añade a `preparar_visita` una escritura que MODIFIQUE o
 * BORRE algo del registro, deja de valer esta excepción y tiene que entrar en
 * WRITE_TOOLS.
 */
test("preparar_visita escribe pero es aditiva: fuera de WRITE_TOOLS a propósito", async () => {
  const defs = await import("./tool-defs");
  const names = defs.BOT_TOOLS.map((t) => t.function.name);
  const writeTools = defs.WRITE_TOOLS as readonly string[];
  assert.ok(names.includes("comparar_registros"));
  assert.ok(names.includes("preparar_visita"));
  assert.ok(!writeTools.includes("comparar_registros"));
  assert.ok(!writeTools.includes("preparar_visita"));
  // Y las que sí destruyen o modifican siguen exigiendo confirmación.
  for (const destructive of ["borrar_registro", "fusionar_registros", "editar_registro"]) {
    assert.ok(writeTools.includes(destructive), `${destructive} debe exigir confirmación`);
  }
});

test("preparar_visita rechaza ids ajenos y registros que no son property", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/records/p-ajeno?")) return jsonResponse({ error: "Not found" }, { status: 404 });
    if (url.includes("/api/records/c1?")) return jsonResponse({ id: "c1", type: "crypto", title: "Bitcoin" });
    return jsonResponse({ error: "unexpected" }, { status: 500 });
  };

  const foreign = JSON.parse(await (await tools()).runTool("preparar_visita", JSON.stringify({ id: "p-ajeno" }), "token"));
  const wrongType = JSON.parse(await (await tools()).runTool("preparar_visita", JSON.stringify({ id: "c1" }), "token"));

  assert.match(foreign.error, /id propio|Not found/);
  assert.match(wrongType.error, /solo admite inmuebles/);
});

test("preparar_visita detecta campos faltantes en ficha completa vs incompleta", async () => {
  const complete = {
    id: "p-completa",
    type: "property",
    title: "Piso completo",
    status: "FOR_SALE",
    meta: {
      currentPrice: 240_000_00,
      builtArea: 120,
      rooms: 3,
      city: "Oviedo",
      detail: {
        yearBuilt: 1998,
        communityFees: 85,
        orientation: "sur",
        floor: "4ª planta",
        hasElevator: false,
        bathrooms: 2,
        usableArea: 105,
        energyRating: "C",
      },
    },
  };
  const incomplete = {
    id: "p-incompleta",
    type: "property",
    title: "Piso incompleto",
    status: "FOR_SALE",
    meta: { currentPrice: 180_000_00, builtArea: 90, rooms: 2, city: "Gijón", detail: { energyRating: "UNKNOWN" } },
  };
  const createCalls: unknown[] = [];
  const checklistCalls: unknown[] = [];
  const deps = {
    apiGet: async (path: string) => {
      if (path.includes("/api/events?")) {
        return {
          items: [
            { eventType: "price_changed", source: "recheck", observedAt: "2026-08-10T09:00:00.000Z", payload: { previousCents: 190_000_00, newCents: 180_000_00 } },
            { eventType: "record_imported", source: "import", observedAt: "2026-08-09T09:00:00.000Z", payload: {} },
          ],
        };
      }
      if (path.includes("p-completa")) return complete;
      if (path.includes("p-incompleta")) return incomplete;
      return { error: "unexpected" };
    },
    createEvent: async (input: unknown) => {
      createCalls.push(input);
    },
    createChecklist: async (_userId: string, input: unknown) => {
      checklistCalls.push(input);
      return { id: `task-${checklistCalls.length}` } as any;
    },
    userFromToken: async () => ({ userId: "u1", email: "u1@n.test" }),
    now: () => new Date("2026-08-10T12:00:00.000Z"),
  };

  const t = await tools();
  const outComplete = (await t.prepareVisit("p-completa", "token", deps)) as { missingFields: { field: string }[] };
  const outIncomplete = (await t.prepareVisit("p-incompleta", "token", deps)) as {
    missingFields: { field: string }[];
    items: { key: string; label: string; reason: string }[];
    taskId: string | null;
    recentEvents: unknown[];
  };

  assert.deepEqual(outComplete.missingFields, []);
  assert.deepEqual(outIncomplete.missingFields.map((f) => f.field), [
    "yearBuilt",
    "communityFees",
    "orientation",
    "floor",
    "hasElevator",
    "bathrooms",
    "usableArea",
    "energyRating",
  ]);
  assert.equal(outIncomplete.recentEvents.length, 1);
  assert.deepEqual(
    outIncomplete.items.slice(0, 3).map((item) => item.key),
    ["missing:yearBuilt", "missing:communityFees", "missing:orientation"]
  );
  assert.ok(outIncomplete.items.every((item) => item.label && item.reason));
  assert.equal(outIncomplete.taskId, "task-2");
  assert.equal(createCalls.length, 2);
  assert.equal(checklistCalls.length, 2);
});

/**
 * Guardarraíl de BUG-14. El propietario cortó en seco el relleno genérico
 * («lo de las gafas de sol sobra, como que las vistas pueden deslumbrar…es una
 * gilipollez»). La regla no es de estilo: cada ítem tiene que estar anclado a un
 * hueco de la ficha (`missing:`), a un evento guardado (`event:`) o a un dato
 * concreto (`fact:`), y llevar la razón que lo justifica. Este test es lo que
 * impide que vuelva a colarse un consejo de manual, porque un ítem inventado no
 * tiene prefijo con el que anclarse.
 */
test("los ítems del checklist están todos anclados a un hueco, un evento o un dato", async () => {
  const { buildPrepareVisitItems } = await tools();
  const ANCHORS = /^(missing|event|fact):/;

  const conHuecos = buildPrepareVisitItems(
    { meta: { detail: {} } },
    { planta: "4ª", ascensor: false, ubicacion: "Calle Uría", descripcion: "Junto a avenida con tráfico" },
    [{ eventType: "price_changed", newCents: 180_000_00, observedAt: "2026-08-10T09:00:00.000Z" }]
  );
  const fichaVacia = buildPrepareVisitItems({ meta: { detail: {} } }, {}, []);

  for (const items of [conHuecos, fichaVacia]) {
    assert.ok(items.length > 0, "un checklist vacío no sirve de nada");
    assert.ok(items.length <= 8, `el tope son 8 ítems, llegaron ${items.length}`);
    for (const item of items) {
      assert.match(item.key, ANCHORS, `«${item.label}» no está anclado a nada`);
      assert.ok(item.reason && item.reason.trim().length > 0, `«${item.label}» no dice por qué está ahí`);
    }
    assert.equal(new Set(items.map((item) => item.key)).size, items.length, "hay ítems repetidos");
  }

  // Insonorización: el propietario la pidió expresamente, así que tiene que
  // salir tanto si la ficha tiene focos de ruido como si no guarda ninguno.
  assert.ok(conHuecos.some((item) => item.key === "fact:noise"));
  assert.ok(fichaVacia.some((item) => item.key === "missing:noise_sources"));
});

test("visit_prepared usa idempotency key determinista por día UTC", async () => {
  const { visitPreparedEventKey } = await import("../record-events");

  assert.equal(visitPreparedEventKey("p1", new Date("2026-08-10T00:01:00.000Z")), "visit-prep:p1:2026-08-10");
  assert.equal(visitPreparedEventKey("p1", new Date("2026-08-10T23:59:00.000Z")), "visit-prep:p1:2026-08-10");
  assert.equal(visitPreparedEventKey("p1", new Date("2026-08-11T00:00:00.000Z")), "visit-prep:p1:2026-08-11");
});
