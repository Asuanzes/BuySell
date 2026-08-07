#!/usr/bin/env node
/**
 * Seed de registros para PERFILAR la home con volumen realista.
 *
 * Crea ~100 registros (cripto/mercado/libros, las fichas más pesadas) en una
 * CUENTA DE PRUEBA vía la API real (POST /api/records/import, kind:"record":
 * guarda el registro normalizado tal cual, sin llamar a CoinGecko ni a ninguna
 * fuente externa — cero gasto de cuotas).
 *
 * Uso:
 *   node scripts/seed-perf-records.mjs --email tu+perf@correo.com [--count 100]
 *                                      [--base https://nidokey.es] [--token JWT]
 *
 * Sin --token hace el login OTP completo: pide el código de 6 dígitos que
 * llega al email (usa un email al que tengas acceso; el signup es automático).
 *
 * Cómo perfilar después (guía Callstack: medir → optimizar → re-medir):
 *   1. Entra en la app con ese email (OTP) en un dispositivo/dev build.
 *   2. Metro → tecla `j` → React Native DevTools → pestaña Profiler.
 *   3. Graba: entrada fría a la pestaña de inicio, scroll hasta el fondo y
 *      cambio de categoría. Busca commits >16ms y filas repintadas en cascada.
 *   4. Compara antes/después de la virtualización de ReorderableRecordList.
 *
 * Limpieza: en la app, Ajustes → Cuenta → Eliminar cuenta (borrado RGPD
 * completo), o DELETE /api/account con el mismo Bearer.
 */

import { createInterface } from "node:readline/promises";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = (arg("base", "https://nidokey.es")).replace(/\/$/, "");
const EMAIL = arg("email");
const COUNT = Number(arg("count", "100"));
let token = arg("token");

if (!EMAIL && !token) {
  console.error("Falta --email (o --token). Ej: node scripts/seed-perf-records.mjs --email tu+perf@correo.com");
  process.exit(1);
}

async function post(path, body, bearer) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* respuesta no-JSON */ }
  return { status: res.status, json, text };
}

async function login() {
  console.log(`→ Pidiendo código OTP para ${EMAIL} …`);
  const req = await post("/api/auth/mobile/request", { email: EMAIL });
  if (req.status !== 200) {
    console.error(`request falló (${req.status}):`, req.json ?? req.text);
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question("Código de 6 dígitos recibido por email: ")).trim();
  rl.close();
  const ver = await post("/api/auth/mobile/verify", { email: EMAIL, code });
  if (ver.status !== 200 || !ver.json?.token) {
    console.error(`verify falló (${ver.status}):`, ver.json ?? ver.text);
    process.exit(1);
  }
  console.log("✓ Login OK");
  return ver.json.token;
}

/** Paseo aleatorio de 24 puntos para el mini-gráfico de la ficha. */
function sparkline(seed) {
  const points = [];
  let v = 100 + (seed % 50);
  for (let i = 0; i < 24; i++) {
    v = Math.max(1, v * (1 + (Math.sin(seed * 7 + i) + Math.cos(seed * 3 + i * 2)) * 0.02));
    points.push(Number(v.toFixed(2)));
  }
  return points;
}

const CRYPTOS = ["BTC", "ETH", "SOL", "ADA", "DOT", "AVAX", "LINK", "MATIC", "ATOM", "XRP"];
const STOCKS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "NFLX", "INTC"];
const BOOKS = ["Sapiens", "Dune", "1984", "El Quijote", "Hyperion", "Neuromante", "Fundación", "Rayuela", "Solaris", "Ubik"];

function buildRecord(i) {
  const now = new Date().toISOString();
  // 60% cripto / 25% mercado / 15% libro: las dos primeras son las fichas más
  // caras de pintar (logo remoto + mini-gráfico + formateo numérico).
  if (i % 20 < 12) {
    const sym = CRYPTOS[i % CRYPTOS.length];
    return {
      type: "crypto",
      record: {
        recordType: "crypto",
        title: `${sym} seed ${i}`,
        subtitle: sym,
        currentValue: 100 + (i * 977) % 5_000_000,
        currency: "EUR",
        source: "seed-perf",
        externalId: `seed-crypto-${i}`,
        observedAt: now,
        meta: {
          symbol: sym,
          quoteCurrency: "EUR",
          change24h: ((i * 13) % 200 - 100) / 10,
          volume: 1_000_000 + i * 12_345,
          marketCap: 50_000_000 + i * 987_654,
          sparkline: sparkline(i),
          lastCheckedAt: now,
        },
      },
    };
  }
  if (i % 20 < 17) {
    const sym = STOCKS[i % STOCKS.length];
    return {
      type: "market",
      record: {
        recordType: "market",
        title: `${sym} seed ${i}`,
        subtitle: sym,
        currentValue: 1_000 + (i * 631) % 90_000,
        currency: "USD",
        source: "seed-perf",
        externalId: `seed-market-${i}`,
        observedAt: now,
        meta: {
          symbol: sym,
          quoteCurrency: "USD",
          change24h: ((i * 7) % 120 - 60) / 10,
          volume: 2_000_000 + i * 54_321,
          marketCap: 1_000_000_000 + i * 5_555_555,
          sparkline: sparkline(i + 1000),
          exchange: "NASDAQ",
          lastCheckedAt: now,
        },
      },
    };
  }
  return {
    type: "book",
    record: {
      recordType: "book",
      title: `${BOOKS[i % BOOKS.length]} (seed ${i})`,
      subtitle: "Autor de prueba",
      currentValue: 1_500 + (i * 97) % 3_000,
      currency: "EUR",
      source: "seed-perf",
      externalId: `seed-book-${i}`,
      observedAt: now,
      meta: { format: "paperback" },
    },
  };
}

async function main() {
  if (!token) token = await login();
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < COUNT; i++) {
    const { type, record } = buildRecord(i);
    let res = await post("/api/records/import", { type, input: { kind: "record", record } }, token);
    if (res.status === 429) {
      // Backoff simple: la única cuota que podríamos rozar es genérica por IP.
      await new Promise((r) => setTimeout(r, 5000));
      res = await post("/api/records/import", { type, input: { kind: "record", record } }, token);
    }
    if (res.status >= 200 && res.status < 300) {
      ok++;
    } else {
      fail++;
      console.error(`  ✗ ${type} #${i} → ${res.status}:`, JSON.stringify(res.json ?? res.text).slice(0, 200));
    }
    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${COUNT} (ok ${ok}, fail ${fail})`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`Hecho: ${ok} creados, ${fail} fallidos. Abre la app con esa cuenta y perfila (ver cabecera del script).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
