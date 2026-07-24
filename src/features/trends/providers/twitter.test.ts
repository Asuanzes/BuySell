import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { twitterTrendProvider } from "./twitter";

/**
 * El provider es KEYLESS: lee trends24.in a través de Jina Reader (r.jina.ai)
 * y parsea el bloque de tendencias más reciente del markdown. Estos tests
 * mockean fetch con las tres respuestas posibles: markdown válido → ok,
 * bloqueo de Jina → blocked, error HTTP → error.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const TRENDS24_MD = [
  "# Twitter trends",
  "### 5 minutes ago",
  "1. [#FelizLunes](https://twitter.com/search?q=%23FelizLunes)",
  "2. [Feliz Semana](https://twitter.com/search?q=%22Feliz+Semana%22)",
  "### 1 hour ago",
  "1. [#Ayer](https://twitter.com/search?q=%23Ayer)",
].join("\n");

test("twitter provider normaliza el bloque más reciente de trends24", async () => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    assert.equal(String(url), "https://r.jina.ai/https://trends24.in/spain/");
    return new Response(TRENDS24_MD, { status: 200 });
  }) as typeof fetch;

  const out = await twitterTrendProvider.fetchTrends({ locale: "ES" });
  assert.equal(out.kind, "ok");
  if (out.kind === "ok") {
    // Solo el bloque "5 minutes ago" (2 items); el de "1 hour ago" se descarta.
    assert.equal(out.trends.length, 2);
    assert.equal(out.trends[0].name, "#FelizLunes");
    assert.equal(out.trends[0].query, "Feliz Lunes");
    assert.equal(out.trends[0].rank, 1);
    assert.equal(out.trends[1].name, "Feliz Semana");
  }
});

test("twitter provider traduce el bloqueo de Jina a blocked", async () => {
  globalThis.fetch = (async () =>
    new Response("Anonymous access to domain trends24.in blocked until tomorrow", {
      status: 200,
    })) as typeof fetch;

  const out = await twitterTrendProvider.fetchTrends({ locale: "WORLD" });
  assert.equal(out.kind, "blocked");
});

test("twitter provider traduce HTTP upstream a error", async () => {
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  const out = await twitterTrendProvider.fetchTrends({ locale: "ES" });
  assert.equal(out.kind, "error");
});

test("twitter provider devuelve error si el markdown no trae tendencias", async () => {
  globalThis.fetch = (async () => new Response("# vacío\nsin items", { status: 200 })) as typeof fetch;
  const out = await twitterTrendProvider.fetchTrends({ locale: "ES" });
  assert.equal(out.kind, "error");
});
