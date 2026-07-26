import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { allowedMimesFor, CHAT_FLAGS, CHAT_LIMITS, maxAttachmentBytes } from "@/lib/chat/config";
import { anyBlockBetween, getParticipantOrNull, withinMessageRate } from "@/lib/chat/guard";
import { messagePreview, sanitizeMessageBody, sniffImageMime } from "@/lib/chat/util";
import { messageDto, replySnippet, type ReplyToDto } from "@/lib/chat/serialize";
import { headObject, readObjectRange, signMessageAttachments } from "@/lib/chat/r2";
import { sendChatPush } from "@/lib/chat/push";
import { notifyMessage } from "@/lib/chat/gateway";
import { NIDOKEY_BOT_ID, isBotDirect, respondAsBot } from "@/lib/chat/bot";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/chat/conversations/[id]/messages?cursor=<messageId>&limit=50
 * Paginación keyset hacia atrás (los `limit` anteriores al cursor; sin cursor,
 * los más recientes). Devuelve en orden cronológico ASC dentro de la página.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!(await getParticipantOrNull(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor");
  // Clamp a [1,100]: un limit negativo se convertiría en `take` negativo de
  // Prisma, que INVIERTE la paginación.
  const limit = Math.max(
    1,
    Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10) || CHAT_LIMITS.messagesPageSize, 100)
  );

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
    include: { attachments: true, reactions: { select: { emoji: true, userId: true } } },
  });

  const hasMore = rows.length === limit;
  const nextCursor = hasMore ? rows[rows.length - 1].id : null;

  // Citas: los mensajes citados pueden no estar en esta página → resolver sus
  // snippets en UNA query (filtrada por conversación: nunca se sirve contenido
  // de otra conversación aunque el replyToId apunte fuera).
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const replyMap = new Map<string, ReplyToDto>();
  if (replyIds.length > 0) {
    const quoted = await prisma.chatMessage.findMany({
      where: { id: { in: replyIds }, conversationId: id },
      select: { id: true, senderId: true, kind: true, body: true, deletedAt: true },
    });
    for (const q of quoted) replyMap.set(q.id, replySnippet(q));
  }

  // ASC para que el cliente pinte de arriba (viejo) a abajo (nuevo). Las URLs
  // de adjuntos se firman al servir (R2 privado; firmar es crypto local).
  const messages = await Promise.all(
    rows
      .reverse()
      .map((m) => signMessageAttachments(messageDto(m, userId, m.replyToId ? replyMap.get(m.replyToId) ?? null : null)))
  );

  // Recibo de ENTREGA: si mi dispositivo ha descargado los mensajes, están
  // entregados (✓✓ gris del emisor) aunque aún no los haya leído. Con
  // throttle de 60 s para no escribir en cada poll.
  after(async () => {
    const cutoff = new Date(Date.now() - 60_000);
    await prisma.conversationParticipant
      .updateMany({
        where: {
          conversationId: id,
          userId,
          OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: cutoff } }],
        },
        data: { lastDeliveredAt: new Date() },
      })
      .catch(() => {});
  });

  return NextResponse.json({ messages, nextCursor });
}

const AttachmentInput = z.object({
  /** Key devuelta por /api/chat/uploads (verificada: prefijo del remitente). */
  key: z.string().min(8).max(300),
  mime: z.string().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive(),
  fileName: z.string().trim().max(180).optional().nullable(),
  width: z.coerce.number().int().positive().optional().nullable(),
  height: z.coerce.number().int().positive().optional().nullable(),
  durationMs: z.coerce.number().int().positive().optional().nullable(),
});

const SendInput = z.object({
  clientId: z.string().min(1).max(64).optional(),
  kind: z.enum(["TEXT", "IMAGE", "FILE", "AUDIO"]).default("TEXT"),
  // TEXT: obligatorio. Media: opcional (pie de foto).
  body: z.string().optional().nullable(),
  replyToId: z.string().optional().nullable(),
  attachments: z.array(AttachmentInput).max(CHAT_LIMITS.maxAttachmentsPerMessage).default([]),
});

/**
 * POST — enviar mensaje. Idempotente por clientId (reintento devuelve 200 con
 * el ya creado). Actualiza lastMessageAt/preview de la conversación.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();

  // Validaciones SIN BBDD primero (body), y luego las 4 lecturas de guard EN
  // PARALELO (antes eran secuenciales: 4 round-trips a Neon en fila). El orden
  // de prioridad de las respuestas de error se evalúa igual tras resolver.
  const parsed = SendInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const isMedia = input.kind !== "TEXT";

  const body = sanitizeMessageBody(input.body, CHAT_LIMITS.maxMessageChars);
  if (!isMedia && !body) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  // Adjuntos: flag activo, al menos uno, MIME del tipo correcto y key propia
  // (chat/u/<userId>/… — impide referenciar subidas de otros usuarios).
  // (`!== "TEXT"` en vez de `isMedia` para que TS estreche input.kind.)
  if (input.kind !== "TEXT") {
    if (!CHAT_FLAGS.attachments || (input.kind === "AUDIO" && !CHAT_FLAGS.voice)) {
      return NextResponse.json({ error: "Adjuntos desactivados" }, { status: 403 });
    }
    if (input.attachments.length === 0) {
      return NextResponse.json({ error: "Falta el adjunto" }, { status: 400 });
    }
    const allow = allowedMimesFor(input.kind);
    for (const a of input.attachments) {
      if (!a.key.startsWith(`chat/u/${userId}/`)) {
        return NextResponse.json({ error: "Adjunto no válido" }, { status: 400 });
      }
      if (!allow.includes(a.mime.toLowerCase())) {
        return NextResponse.json({ error: `Tipo no admitido (${a.mime})` }, { status: 400 });
      }
    }

    // Verificación contra el OBJETO REAL en R2: el presigned PUT no impone
    // tamaño (solo firma key+content-type), así que el sizeBytes declarado no
    // vale nada. HEAD da el tamaño real; para imágenes, además, magic bytes
    // (un "image/jpeg" que en realidad es un binario cualquiera se rechaza).
    const maxBytes = maxAttachmentBytes(input.kind);
    const checks = await Promise.all(
      input.attachments.map(async (a) => {
        const head = await headObject(a.key);
        if (!head) return "El adjunto no se terminó de subir";
        if (head.sizeBytes <= 0 || head.sizeBytes > maxBytes) return "Archivo demasiado grande";
        a.sizeBytes = head.sizeBytes; // persistir el tamaño REAL, no el declarado
        if (input.kind === "IMAGE" || a.mime.toLowerCase().startsWith("image/")) {
          const bytes = await readObjectRange(a.key, 16);
          const sniffed = bytes ? sniffImageMime(bytes) : null;
          if (!sniffed) return "El archivo no es una imagen válida";
          a.mime = sniffed; // el MIME canónico detectado, no el declarado
        }
        return null;
      })
    );
    const failed = checks.find((c) => c !== null);
    if (failed) return NextResponse.json({ error: failed }, { status: 400 });
  }

  const [me, existing, conversation, rateOk, quoted] = await Promise.all([
    getParticipantOrNull(id, userId),
    // Idempotencia: el mismo clientId no crea duplicado.
    input.clientId
      ? prisma.chatMessage.findUnique({
          where: {
            conversationId_senderId_clientId: {
              conversationId: id,
              senderId: userId,
              clientId: input.clientId,
            },
          },
          include: { attachments: true, reactions: { select: { emoji: true, userId: true } } },
        })
      : Promise.resolve(null),
    prisma.conversation.findUnique({
      where: { id },
      select: { kind: true, participants: { where: { leftAt: null }, select: { userId: true } } },
    }),
    // Rate limit (count en BBDD: serverless-safe).
    withinMessageRate(userId, CHAT_LIMITS.rateMsgsPerMin),
    // Cita: el mensaje citado debe EXISTIR EN ESTA conversación (el filtro por
    // conversationId impide citar —y que el DTO revele— mensajes ajenos).
    input.replyToId
      ? prisma.chatMessage.findFirst({
          where: { id: input.replyToId, conversationId: id },
          select: { id: true, senderId: true, kind: true, body: true, deletedAt: true },
        })
      : Promise.resolve(null),
  ]);

  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (input.replyToId && !quoted) {
    return NextResponse.json({ error: "El mensaje citado no existe" }, { status: 400 });
  }
  if (existing) {
    // Reintento idempotente: resolver también la cita para que la respuesta
    // sea idéntica a la del primer intento.
    const exQuoted = existing.replyToId
      ? await prisma.chatMessage.findFirst({
          where: { id: existing.replyToId, conversationId: id },
          select: { id: true, senderId: true, kind: true, body: true, deletedAt: true },
        })
      : null;
    return NextResponse.json(
      await signMessageAttachments(messageDto(existing, userId, exQuoted ? replySnippet(exQuoted) : null)),
      { status: 200 }
    );
  }
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Bloqueos en DIRECT: si cualquiera bloqueó al otro, no se envía.
  if (conversation.kind === "DIRECT") {
    const other = conversation.participants.find((p) => p.userId !== userId);
    if (other && (await anyBlockBetween(userId, other.userId))) {
      return NextResponse.json({ error: "No disponible" }, { status: 403 });
    }
  }

  if (!rateOk) {
    return NextResponse.json(
      { error: "Demasiados mensajes, espera un momento" },
      { status: 429, headers: { "Retry-After": "30" } }
    );
  }

  const now = new Date();
  let message;
  try {
    [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: userId,
        kind: input.kind,
        body,
        replyToId: input.replyToId ?? null,
        clientId: input.clientId ?? null,
        attachments: isMedia
          ? {
              create: input.attachments.map((a) => ({
                kind: input.kind,
                url: a.key, // key de R2; se sirve firmada
                mimeType: a.mime.toLowerCase(),
                sizeBytes: a.sizeBytes,
                fileName: a.fileName ?? null,
                width: a.width ?? null,
                height: a.height ?? null,
                durationMs: a.durationMs ?? null,
              })),
            }
          : undefined,
      },
      include: { attachments: true },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: now, lastMessagePreview: messagePreview(input.kind, body) },
    }),
    // Enviar implica haber leído lo anterior.
    prisma.conversationParticipant.update({
      where: { id: me.id },
      data: { lastReadAt: now, lastDeliveredAt: now },
    }),
    ]);
  } catch (e) {
    // Carrera de idempotencia: dos POST simultáneos con el mismo clientId — el
    // segundo choca con el @@unique (P2002). Devolver el ya creado, no un 500
    // (que el cliente interpretaría como fallo y reintentaría con OTRO clientId
    // → duplicado real).
    if (input.clientId) {
      const raced = await prisma.chatMessage.findUnique({
        where: {
          conversationId_senderId_clientId: { conversationId: id, senderId: userId, clientId: input.clientId },
        },
        include: { attachments: true, reactions: { select: { emoji: true, userId: true } } },
      });
      if (raced) {
        return NextResponse.json(
          await signMessageAttachments(messageDto(raced, userId, quoted ? replySnippet(quoted) : null)),
          { status: 200 }
        );
      }
    }
    throw e;
  }

  // Aviso a los demás participantes DESPUÉS de responder (after() garantiza la
  // ejecución en Vercel sin retrasar el 201 → el emisor confirma antes): push
  // (Expo, respeta mute) + tiempo real (gateway WS del VPS, no respeta mute → la
  // pantalla abierta se actualiza igual). El receptor sigue recibiendo al instante
  // porque after() corre nada más enviar la respuesta.
  // Si es el DM con el asistente, Nidokey responde por el MISMO camino (eco en
  // fase 3; Gemini en fase 4). Va dentro de after() → no retrasa el 201, y el
  // bot nunca re-entra por esta ruta (no usa requireUserId) → sin bucle.
  const botDM =
    userId !== NIDOKEY_BOT_ID &&
    isBotDirect(conversation.kind, conversation.participants.map((p) => p.userId));
  after(() =>
    Promise.allSettled([
      sendChatPush(message),
      notifyMessage(message),
      ...(botDM ? [respondAsBot(id, userId)] : []),
    ])
  );

  return NextResponse.json(
    await signMessageAttachments(messageDto(message, userId, quoted ? replySnippet(quoted) : null)),
    { status: 201 }
  );
}
