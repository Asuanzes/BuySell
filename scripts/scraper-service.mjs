/**
 * Sidecar de scraping con Playwright.
 *
 * Corre en un proceso Node separado, fuera del bundling de Next.js. Expone
 * un endpoint HTTP simple que Next puede invocar para descargar páginas que
 * el fetch normal no puede (por Cloudflare ligero, lazy-load JS, etc.).
 *
 * Uso:
 *   npm run scraper            # arranca en :4201
 *
 * Endpoint:
 *   POST /fetch
 *   body: { url, timeoutMs?, waitForLoad? }
 *   resp: { ok: true,  html, status, finalUrl }
 *      o { ok: false, error, code }
 *
 * Entorno:
 *   SCRAPER_PORT (4201) · SCRAPER_HOST (127.0.0.1) · SCRAPER_TOKEN (opcional).
 *   SCRAPER_CHANNEL (opcional): "chrome" usa el Google Chrome de sistema en vez
 *   del Chromium empaquetado de Playwright — necesario en OS que Playwright aún
 *   no soporta (p. ej. Ubuntu 26.04). Requiere `google-chrome-stable` instalado.
 * Con SCRAPER_TOKEN, /fetch exige `Authorization: Bearer <token>`.
 * Por defecto solo escucha en 127.0.0.1: nginx hace de frontera pública.
 */
import http from "node:http";
import { chromium } from "playwright";

const PORT = parseInt(process.env.SCRAPER_PORT ?? "4201", 10);
const HOST = process.env.SCRAPER_HOST ?? "127.0.0.1";
const TOKEN = process.env.SCRAPER_TOKEN ?? null;
const CHANNEL = process.env.SCRAPER_CHANNEL ?? null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let browser = null;
let idleTimer = null;

async function getBrowser() {
  if (browser?.isConnected()) {
    scheduleIdleClose();
    return browser;
  }
  console.log(`[scraper] launching ${CHANNEL === "chrome" ? "Google Chrome (sistema)" : "chromium"}…`);
  browser = await chromium.launch({
    channel: CHANNEL ?? undefined,
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // En servicios systemd/containers /dev/shm suele ser pequeño y Chrome
      // crashea nada más arrancar ("Target ... has been closed") → /tmp como shm.
      "--disable-dev-shm-usage",
      "--disable-gpu",
      // Evita que el crashpad handler falle con "--database is required"
      // (SIGTRAP) en servicios sin HOME, aunque ya se fije HOME=/tmp.
      "--disable-breakpad",
    ],
  });
  console.log("[scraper] browser ready");
  scheduleIdleClose();
  return browser;
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  // Cerrar tras 5 min sin uso para liberar RAM
  idleTimer = setTimeout(async () => {
    if (browser?.isConnected()) {
      console.log("[scraper] closing idle browser");
      await browser.close().catch(() => {});
      browser = null;
    }
  }, 5 * 60 * 1000);
}

async function fetchPage({ url, timeoutMs = 30000 }) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 768 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    extraHTTPHeaders: { "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["es-ES", "es", "en"] });
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (!response) throw new Error("Sin respuesta");
    const status = response.status();
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const html = await page.content();
    return { ok: true, html, status, finalUrl: page.url() };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": buf.byteLength,
  });
  res.end(buf);
}

function authorized(req) {
  if (!TOKEN) return true; // sin token configurado → solo acceso local
  return (req.headers.authorization ?? "") === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return sendJson(res, 200, { ok: true, ts: Date.now() });
  }
  if (!authorized(req)) {
    return sendJson(res, 401, { ok: false, error: "No autorizado" });
  }
  if (req.method !== "POST" || req.url !== "/fetch") {
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, error: "JSON inválido" });
    }
    if (!payload.url || typeof payload.url !== "string") {
      return sendJson(res, 400, { ok: false, error: "Falta url" });
    }
    const t0 = Date.now();
    try {
      const result = await fetchPage(payload);
      const ms = Date.now() - t0;
      console.log(`[scraper] ${result.status} ${payload.url} (${ms}ms)`);
      sendJson(res, 200, result);
    } catch (e) {
      const ms = Date.now() - t0;
      console.error(`[scraper] FAIL ${payload.url} (${ms}ms):`, e.message);
      sendJson(res, 500, { ok: false, error: e.message, code: "SCRAPER_ERROR" });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[scraper] listening on http://${HOST}:${PORT}`);
  console.log(`[scraper] endpoints: GET /healthz, POST /fetch`);
});

// Cierre limpio
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`[scraper] ${sig} received, shutting down…`);
    if (browser?.isConnected()) await browser.close().catch(() => {});
    server.close(() => process.exit(0));
  });
}
