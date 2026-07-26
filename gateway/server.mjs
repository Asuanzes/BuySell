import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import * as jose from "jose";

/**
 * Gateway de tiempo real del chat de Nidokey. Proceso ÚNICO, SIN base de datos
 * (cero datos en reposo). Vive en el VPS del usuario detrás de nginx/Caddy (TLS).
 *
 * Hace dos cosas en el mismo puerto:
 *   1. HTTP  POST /notify  — webhook firmado (HMAC) desde Vercel. Reenvía un
 *      aviso opaco {type:"message", conversationId} a los sockets de cada
 *      participante (el contenido NO viaja por aquí: el móvil hace refetch a
 *      Neon → E2E-ready).
 *   2. WSS   /ws?ticket=…  — el móvil se conecta con un ticket corto (JWT 60 s
 *      firmado por Vercel con CHAT_WS_SECRET). Relaya "escribiendo…" entre los
 *      sockets suscritos a una conversación (peer-to-peer, sin tocar Neon).
 *
 * Protecciones de escala: límite de sockets por usuario, backpressure (clientes
 * lentos se terminan en vez de acumular RAM), índice conversación→sockets para
 * el typing (O(suscriptores), no O(todos)), y /healthz con métricas.
 *
 * Secretos (en /etc/nidokey-gateway.env, NUNCA AUTH_SECRET ni DATABASE_URL):
 *   PORT                 puerto local (def 8787; nginx/Caddy hacen el TLS)
 *   CHAT_WS_SECRET       valida los tickets WS (mismo valor que en Vercel)
 *   CHAT_GATEWAY_SECRET  valida el HMAC del webhook (mismo valor que en Vercel)
 *   ALLOWED_ORIGIN       opcional; el ticket es la auth real
 */

const PORT = Number(process.env.PORT) || 8787;
const WS_SECRET = process.env.CHAT_WS_SECRET
  ? new TextEncoder().encode(process.env.CHAT_WS_SECRET)
  : null;
const GATEWAY_SECRET = process.env.CHAT_GATEWAY_SECRET || "";
const WS_ISSUER = "nidokey-chat-ws";

// Límites anti-abuso / anti-OOM. Un cliente legítimo tiene 1-2 sockets (móvil
// + reconexión solapada); 8 deja margen de sobra y corta el acaparamiento.
const MAX_SOCKETS_PER_USER = 8;
// Backpressure: si el buffer TCP de un cliente lento acumula más de esto, se
// termina el socket (el cliente reconecta o cae a polling) en vez de crecer en RAM.
const MAX_BUFFERED_BYTES = 64 * 1024;
// Frames entrantes: un cliente legítimo manda subscribe + typing esporádicos.
// Más de esto por ventana = hostil o roto → cierre 1008 (anti-amplificación:
// cada typing se relaya a todos los suscriptores).
const MAX_CLIENT_MSGS_PER_WINDOW = 40;
const CLIENT_MSG_WINDOW_MS = 10_000;

if (!WS_SECRET) console.warn("[gateway] CHAT_WS_SECRET sin definir: rechazará todas las conexiones WS");
if (!GATEWAY_SECRET) console.warn("[gateway] CHAT_GATEWAY_SECRET sin definir: rechazará todos los webhooks");

// Contadores para /healthz (observabilidad sin dependencias).
const stats = {
  startedAt: Date.now(),
  notifyRecv: 0,
  notifyErr: 0,
  relayedMessage: 0,
  relayedOrder: 0,
  relayedTyping: 0,
  ticketRejected: 0,
  hmacRejected: 0,
  overLimitClosed: 0,
  backpressureKilled: 0,
};

/** userId -> Set<ws>. Un usuario puede tener varios dispositivos. */
const userSockets = new Map();
/** conversationId -> Set<ws> suscritos (índice para el typing: O(suscriptores)). */
const conversationSockets = new Map();
/** ws -> { userId, conversationIds:Set<string>, alive:boolean } */
const meta = new WeakMap();

function addSocket(userId, ws) {
  let set = userSockets.get(userId);
  if (!set) userSockets.set(userId, (set = new Set()));
  set.add(ws);
}

function removeSocket(userId, ws) {
  const set = userSockets.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) userSockets.delete(userId);
  }
  // Sacarlo también del índice de conversaciones (siempre en sincronía).
  const m = meta.get(ws);
  if (m) {
    for (const convId of m.conversationIds) {
      const cs = conversationSockets.get(convId);
      if (cs) {
        cs.delete(ws);
        if (cs.size === 0) conversationSockets.delete(convId);
      }
    }
    m.conversationIds.clear();
  }
}

/** Reemplaza las suscripciones de un socket manteniendo el índice inverso. */
function setSubscriptions(ws, newIds) {
  const m = meta.get(ws);
  if (!m) return;
  for (const convId of m.conversationIds) {
    if (!newIds.has(convId)) {
      const cs = conversationSockets.get(convId);
      if (cs) {
        cs.delete(ws);
        if (cs.size === 0) conversationSockets.delete(convId);
      }
    }
  }
  for (const convId of newIds) {
    let cs = conversationSockets.get(convId);
    if (!cs) conversationSockets.set(convId, (cs = new Set()));
    cs.add(ws);
  }
  m.conversationIds = newIds;
}

/** Envío con backpressure: clientes atascados se terminan, no acumulan RAM. */
function safeSend(ws, data) {
  if (ws.readyState !== ws.OPEN) return false;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    stats.backpressureKilled++;
    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    ws.send(data);
    return true;
  } catch {
    return false;
  }
}

/** Envía un objeto JSON a todos los sockets de un usuario (si los hay). */
function sendToUser(userId, payload) {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (safeSend(ws, data)) stats.relayedMessage++;
  }
}

function totalSockets() {
  let n = 0;
  for (const set of userSockets.values()) n += set.size;
  return n;
}

// ── HTTP: healthz + webhook /notify ──────────────────────────────────────────
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        uptimeS: Math.round((Date.now() - stats.startedAt) / 1000),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        sockets: totalSockets(),
        users: userSockets.size,
        conversations: conversationSockets.size,
        relayed: { message: stats.relayedMessage, order: stats.relayedOrder, typing: stats.relayedTyping },
        notify: { recv: stats.notifyRecv, err: stats.notifyErr },
        rejected: { ticket: stats.ticketRejected, hmac: stats.hmacRejected },
        closed: { overLimit: stats.overLimitClosed, backpressure: stats.backpressureKilled },
      })
    );
    return;
  }

  if (req.method === "POST" && req.url === "/notify") {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 256 * 1024) req.destroy(); // anti-abuso
      else chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      if (!verifyHmac(req.headers["x-nidokey-signature"], raw)) {
        stats.hmacRejected++;
        console.warn("[gateway] notify con firma HMAC inválida");
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad signature" }));
        return;
      }
      let body;
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        stats.notifyErr++;
        res.writeHead(400);
        res.end();
        return;
      }
      stats.notifyRecv++;
      handleNotify(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

/** Compara la firma `sha256=<hex>` del header con el HMAC del body (timing-safe). */
function verifyHmac(header, raw) {
  if (!GATEWAY_SECRET || typeof header !== "string") return false;
  const expected = "sha256=" + createHmac("sha256", GATEWAY_SECRET).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Body del webhook: {event:"message"|"order", conversationId/orderId, participantIds[], senderId/actorUserId}. */
function handleNotify(body) {
  if (!body) return;
  if (body.event === "message") {
    const { conversationId, participantIds, senderId } = body;
    if (!conversationId || !Array.isArray(participantIds)) return;
    const payload = { type: "message", conversationId };
    for (const uid of participantIds) {
      if (uid && uid !== senderId) sendToUser(uid, payload);
    }
    return;
  }
  if (body.event === "order") {
    const { orderId, status, participantIds, actorUserId } = body;
    if (!orderId || !Array.isArray(participantIds)) return;
    const payload = { type: "order", orderId, status: typeof status === "string" ? status : undefined };
    for (const uid of participantIds) {
      if (uid && uid !== actorUserId) {
        const before = stats.relayedMessage;
        sendToUser(uid, payload);
        stats.relayedOrder += stats.relayedMessage - before;
        stats.relayedMessage = before;
      }
    }
  }
}

// ── WSS: /ws?ticket=… ────────────────────────────────────────────────────────
// maxPayload: el mensaje legítimo más grande (subscribe con 500 ids) ronda los
// 35 KB; 64 KB corta los frames-bomba (el default de ws es 100 MiB).
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && req.headers.origin && req.headers.origin !== allowedOrigin) {
    socket.destroy();
    return;
  }
  const ticket = url.searchParams.get("ticket");
  const userId = await verifyTicket(ticket);
  if (!userId) {
    stats.ticketRejected++;
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Límite por usuario: corta el acaparamiento de fds/RAM. 1008 = policy
    // violation; el cliente cae a polling o reconecta cuando suelte sockets.
    const existing = userSockets.get(userId);
    if (existing && existing.size >= MAX_SOCKETS_PER_USER) {
      stats.overLimitClosed++;
      console.warn(`[gateway] límite de sockets por usuario alcanzado (${userId.slice(0, 8)}…)`);
      try {
        ws.close(1008, "too many connections");
      } catch {
        /* ignore */
      }
      // Este socket NO se registra (sin heartbeat que lo vigile): si el cliente
      // no completa el handshake de cierre, quedaría en CLOSING para siempre.
      const killer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
      }, 3000);
      killer.unref?.();
      return;
    }
    meta.set(ws, { userId, conversationIds: new Set(), alive: true });
    addSocket(userId, ws);
    ws.on("message", (data) => onClientMessage(ws, data));
    ws.on("pong", () => {
      const m = meta.get(ws);
      if (m) m.alive = true;
    });
    ws.on("close", () => removeSocket(userId, ws));
    ws.on("error", () => removeSocket(userId, ws));
    try {
      ws.send(JSON.stringify({ type: "ready" }));
    } catch {
      /* ignore */
    }
  });
});

/** Verifica el ticket (JWT corto). Devuelve userId o null. */
async function verifyTicket(ticket) {
  if (!ticket || !WS_SECRET) return null;
  try {
    // algorithms pinneado: sin esto, jose aceptaría cualquier HS* con el mismo
    // secreto (defensa en profundidad, no explotable hoy).
    const { payload } = await jose.jwtVerify(ticket, WS_SECRET, { issuer: WS_ISSUER, algorithms: ["HS256"] });
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/** Mensajes cliente→gateway: subscribe (para typing), typing, pong. */
function onClientMessage(ws, data) {
  const m = meta.get(ws);
  if (!m) return;
  // Rate limit de entrada por socket (ventana fija en memoria del proceso).
  const now = Date.now();
  if (!m.msgWindowStart || now - m.msgWindowStart > CLIENT_MSG_WINDOW_MS) {
    m.msgWindowStart = now;
    m.msgCount = 0;
  }
  if (++m.msgCount > MAX_CLIENT_MSGS_PER_WINDOW) {
    stats.overLimitClosed++;
    try {
      ws.close(1008, "too many messages");
    } catch {
      /* ignore */
    }
    return;
  }
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (msg.type === "subscribe" && Array.isArray(msg.conversationIds)) {
    // Lista declarada por el cliente (baja confianza): solo se usa para enrutar
    // "escribiendo…", nunca para entregar contenido (eso va por /notify).
    const ids = new Set(
      msg.conversationIds.filter((x) => typeof x === "string" && x.length <= 64).slice(0, 500)
    );
    setSubscriptions(ws, ids);
    return;
  }
  if (msg.type === "typing" && typeof msg.conversationId === "string") {
    relayTyping(m.userId, msg.conversationId, !!msg.on);
    return;
  }
  // msg.type === "pong" → no-op (lo gestiona el heartbeat de ping/pong nativo).
}

/**
 * Reenvía "escribiendo…" a los OTROS sockets suscritos a esa conversación.
 * Usa el índice conversación→sockets: O(suscriptores), no O(todos los sockets).
 */
function relayTyping(fromUserId, conversationId, on) {
  const subscribers = conversationSockets.get(conversationId);
  if (!subscribers || subscribers.size === 0) return;
  const payload = JSON.stringify({ type: "typing", conversationId, userId: fromUserId, on });
  for (const ws of subscribers) {
    const m = meta.get(ws);
    if (!m || m.userId === fromUserId) continue;
    if (safeSend(ws, payload)) stats.relayedTyping++;
  }
}

// ── Heartbeat: ping cada 30 s, termina sockets sin pong ──────────────────────
const HEARTBEAT_MS = 30_000;
const heartbeat = setInterval(() => {
  for (const set of userSockets.values()) {
    for (const ws of set) {
      const m = meta.get(ws);
      if (!m) continue;
      if (!m.alive) {
        ws.terminate();
        continue;
      }
      m.alive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref?.();

server.listen(PORT, () => {
  console.log(`[gateway] escuchando en :${PORT} (HTTP /notify + /healthz + WSS /ws)`);
});

function shutdown() {
  console.log("[gateway] apagando…");
  clearInterval(heartbeat);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref?.();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
