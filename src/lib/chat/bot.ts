import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { directKey, messagePreview } from "@/lib/chat/util";
import { sendChatPush } from "@/lib/chat/push";
import { notifyMessage } from "@/lib/chat/gateway";
import { runTool, mintUserToken } from "@/lib/chat/bot-tools";
import { runAgent, echoReply, HISTORY_TURNS, type Turn, type ToolRunner } from "@/lib/chat/agent";
import { rateLimit } from "@/lib/rate-limit";
import { botDailyLimit } from "@/lib/billing/entitlements";
import { withBotWriteToolAudit } from "@/lib/chat/bot-audit";

const MAX_REPLY_CHARS = 800;

/**
 * El asistente "Nidokey" es un participante de chat normal (una fila User), no
 * un caso especial del esquema. Se reconoce por id/username CONSTANTES:
 *  - el id fijo permite enrutar los mensajes hacia el agente,
 *  - el username "nidokey" ya está reservado en username.ts (anti-suplantación).
 * ponytail: sin campo `isBot` en el esquema — el badge "verificado" del front
 * se deriva de `username === NIDOKEY_BOT_USERNAME`, no necesita columna nueva.
 *
 * La INTELIGENCIA (prompt, cascada de modelos, loop de tools) vive en agent.ts
 * (puro e inyectable — los evals de scripts/bot-eval lo ejecutan con fixtures);
 * aquí queda solo la capa de persistencia y notificación.
 */
export const NIDOKEY_BOT_ID = "nidokey-bot";
export const NIDOKEY_BOT_USERNAME = "nidokey";

/** Crea (idempotente) la fila User del bot. */
export async function ensureNidokeyBot(): Promise<void> {
  await prisma.user.upsert({
    where: { id: NIDOKEY_BOT_ID },
    update: {},
    create: {
      id: NIDOKEY_BOT_ID,
      email: "nido@nidokey.es", // único; el bot no inicia sesión (sin Account)
      name: "Nidokey",
      username: NIDOKEY_BOT_USERNAME,
      emailVerified: new Date(),
    },
    select: { id: true },
  });
}

/**
 * Garantiza (idempotente) el DM 1:1 entre el usuario y el bot, y devuelve su id.
 * Tras la primera vez es un solo findUnique por `directKey`.
 */
export async function ensureBotDm(userId: string): Promise<string | null> {
  if (userId === NIDOKEY_BOT_ID) return null;
  const key = directKey(userId, NIDOKEY_BOT_ID);
  const existing = await prisma.conversation.findUnique({
    where: { directKey: key },
    select: { id: true, lastMessageAt: true },
  });
  if (existing) {
    // Sana DMs creados vacíos antes de añadir el saludo (no salían en la lista).
    if (existing.lastMessageAt === null) await seedWelcome(existing.id);
    return existing.id;
  }
  await ensureNidokeyBot(); // solo al crear el DM (no un upsert en cada poll de la lista)
  const created = await prisma.conversation.create({
    data: {
      kind: "DIRECT",
      createdById: NIDOKEY_BOT_ID,
      directKey: key,
      participants: {
        create: [
          { userId, role: "MEMBER" },
          { userId: NIDOKEY_BOT_ID, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });
  await seedWelcome(created.id);
  return created.id;
}

/**
 * Saludo inicial para que el DM nazca "no vacío" (con lastMessageAt + preview) y
 * aparezca en la lista. ponytail: sin dedup fuerte — dos bootstraps simultáneos
 * podrían duplicar el saludo (carrera improbable); subir a lock/upsert si pasa.
 */
async function seedWelcome(conversationId: string): Promise<void> {
  const welcome =
    "👋 ¡Hola! Soy Nidokey, tu asistente dentro de la app. Aún estoy aprendiendo: " +
    "pronto podré buscarte registros, importar enlaces y guiarte. Escríbeme lo que necesites.";
  await prisma.chatMessage.create({
    data: { conversationId, senderId: NIDOKEY_BOT_ID, kind: "TEXT", body: welcome },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessagePreview: messagePreview("TEXT", welcome) },
  });
}

/** ¿La conversación es un DM 1:1 con el bot? (participantes activos = userIds). */
export function isBotDirect(kind: string, participantUserIds: string[]): boolean {
  return kind === "DIRECT" && participantUserIds.includes(NIDOKEY_BOT_ID);
}

/**
 * Responde como Nidokey en la conversación, por el MISMO camino que un humano:
 * crea el mensaje, actualiza el preview y avisa (push + gateway WS). Pensado
 * para correr dentro de `after()` (post-respuesta) → fallo no-bloqueante.
 */
export async function replyAsBot(
  conversationId: string,
  text: string,
  options: { clientId?: string } = {},
): Promise<boolean> {
  const body = text.slice(0, MAX_REPLY_CHARS);
  const now = new Date();
  let message;
  try {
    message = await prisma.chatMessage.create({
      data: { conversationId, senderId: NIDOKEY_BOT_ID, kind: "TEXT", body, clientId: options.clientId ?? null },
      include: { attachments: true },
    });
  } catch (err) {
    if (options.clientId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now, lastMessagePreview: messagePreview("TEXT", body) },
  });
  await Promise.allSettled([sendChatPush(message), notifyMessage(message)]);
  return true;
}

/**
 * Avisa al destinatario de un registro compartido: publica un mensaje de Nidokey
 * en su DM con un enlace pulsable [[tipo:id|Título]] (+ push). Pensado para after().
 */
export async function notifyShare(
  toUserId: string,
  fromLabel: string,
  recordType: string,
  recordId: string,
  title: string,
): Promise<void> {
  try {
    const cid = await ensureBotDm(toUserId);
    if (!cid) return;
    const label = (title || "un registro").slice(0, 60);
    await replyAsBot(
      cid,
      `📩 ${fromLabel} te ha compartido [[${recordType}:${recordId}|${label}]]. Dime «guárdalo» y lo añado a tus registros.`,
    );
  } catch {
    /* no-bloqueante */
  }
}

/**
 * Genera y publica la respuesta del bot a partir del historial reciente del DM.
 * El agente (agent.ts) corre con un JWT del usuario para consultar SUS datos
 * vía los endpoints existentes. Si no hay key o falla → eco. Pensado para
 * correr en after() → no bloquea el envío del usuario.
 */
export async function respondAsBot(conversationId: string, userId: string): Promise<void> {
  // Embudo: uso del bot, contado server-side (fiable; el cliente no emite esto).
  await prisma.analyticsEvent.create({ data: { userId, name: "bot_message" } }).catch(() => {});

  // Cuota diaria del bot (control de coste LLM; mayor en Premium). Al agotarla
  // respondemos con un mensaje fijo sin tocar el modelo.
  const limit = await botDailyLimit(userId);
  const used = await rateLimit("bot-day", userId, { limit, windowMs: 86_400_000 });
  if (!used.ok) {
    await replyAsBot(
      conversationId,
      "Has alcanzado el límite diario del asistente. Mañana seguimos donde lo dejamos 😊 " +
        "Con Nidokey Premium el límite es mucho más amplio (Cuenta → Premium).",
    );
    return;
  }

  const [rows, user] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { senderId: true, body: true, kind: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  const history: Turn[] = rows
    .reverse()
    .map((m) => ({
      role: m.senderId === NIDOKEY_BOT_ID ? ("model" as const) : ("user" as const),
      text: m.body ?? (m.kind === "TEXT" ? "" : "(adjunto)"),
    }))
    .filter((t) => t.text);
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.text ?? null;
  const token = await mintUserToken(userId, user?.email ?? "");
  const toolRunner: ToolRunner = withBotWriteToolAudit(
    (name, argsJson) => runTool(name, argsJson, token),
    { userId, conversationId },
  );
  const result = await runAgent(history, toolRunner);
  await replyAsBot(conversationId, result.text ?? echoReply(lastUser));
}
