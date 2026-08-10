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

test("comparar_registros es tool de lectura y no entra en WRITE_TOOLS", async () => {
  const defs = await import("./tool-defs");
  const names = defs.BOT_TOOLS.map((t) => t.function.name);
  assert.ok(names.includes("comparar_registros"));
  assert.ok(!(defs.WRITE_TOOLS as readonly string[]).includes("comparar_registros"));
});
