import { prisma } from "@/lib/db";
import { notifyConversation, notifyMessage } from "@/lib/chat/gateway";
import { sendChatPush } from "@/lib/chat/push";
import { directKey, sanitizeMessageBody, truncateSafe } from "@/lib/chat/util";
import { fmtCents } from "@/lib/alerts/evaluate";

/**
 * DIFERENCIAL de compraventa: una conversación VINCULADA a un registro (banner
 * de contexto) recibe un mensaje SYSTEM cuando el registro cambia — bajada o
 * subida de precio, vendido, retirado. Ambas partes lo ven dentro del hilo de
 * la negociación, sin depender de que cada una tenga su alerta configurada.
 *
 * El renderer de SYSTEM ya existía en el móvil sin productor; este es el
 * productor. Sin push a propósito: es información ambiental — las alertas
 * personales (evaluate.ts) ya cubren el aviso activo al dueño.
 *
 * Nunca lanza: un fallo aquí no debe romper el recheck de anuncios.
 */

export type ContextEvent = {
  oldCents: number | null;
  newCents: number | null;
  /** "SOLD" | "REMOVED" | otros (solo SOLD/REMOVED generan mensaje de estado). */
  status?: string | null;
  /** true si el valor es renta mensual (ficha mixta venta+alquiler). */
  isRent?: boolean;
};

/** Texto del evento, o null si el cambio no merece mensaje. PURA (testeable).
 *  `title` contextualiza en chats generales donde conviven varios registros. */
export function contextEventText(e: ContextEvent, title?: string | null): string | null {
  const prefix = title ? `«${truncateSafe(title, 48)}» — ` : "";
  if (e.status === "SOLD") return `🏷️ ${prefix}el anuncio se ha marcado como VENDIDO.`;
  if (e.status === "REMOVED") return `🏷️ ${prefix}el anuncio ha desaparecido del portal.`;
  if (e.oldCents == null || e.newCents == null || e.oldCents === e.newCents) return null;
  const what = e.isRent ? "la renta" : "el precio";
  const arrow = e.newCents < e.oldCents ? "📉" : "📈";
  const verb = e.newCents < e.oldCents ? "ha bajado" : "ha subido";
  return `${arrow} ${prefix}${what} ${verb}: ${fmtCents(e.oldCents)} → ${fmtCents(e.newCents)}.`;
}

/**
 * Entrega una TARJETA de registro en el chat DIRECTO habitual entre dos
 * usuarios (creándolo si no existe — clave "general", nunca una conversación
 * aparte por registro). El body lleva "📌 Título" de respaldo: clientes
 * viejos, preview de la lista y push funcionan sin tocar nada; los clientes
 * nuevos pintan la tarjeta rica en su lugar.
 *
 * Devuelve el conversationId (para que la UI pueda saltar al chat) o null si
 * algo falló — nunca lanza: la compartición (RecordShare) ya está hecha.
 */
export async function deliverRecordCard(
  fromUserId: string,
  toUserId: string,
  contextType: string,
  contextId: string,
  title: string,
  /** Mensaje opcional del usuario: va como SEGUNDO mensaje tras la tarjeta. */
  userMessage?: string | null
): Promise<string | null> {
  try {
    const key = directKey(fromUserId, toUserId, null);
    let conversation = await prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            kind: "DIRECT",
            createdById: fromUserId,
            directKey: key,
            participants: {
              create: [
                { userId: fromUserId, role: "MEMBER" },
                { userId: toUserId, role: "MEMBER" },
              ],
            },
          },
          select: { id: true },
        });
      } catch {
        // Carrera P2002: otro camino creó el DIRECT a la vez.
        conversation = await prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
      }
    }
    if (!conversation) return null;
    const cid = conversation.id;

    // Si alguno había "eliminado" el chat de su lista, un mensaje nuevo lo
    // hace reaparecer (lo prometido en la confirmación de borrar; además
    // arregla el P2 de la auditoría "mensajes invisibles tras salir").
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: cid, leftAt: { not: null } },
      data: { leftAt: null },
    });

    const body = truncateSafe(`📌 ${title}`, 140);
    const text = sanitizeMessageBody(userMessage, 4000);
    const now = new Date();
    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { conversationId: cid, senderId: fromUserId, kind: "TEXT", body, contextType, contextId },
      }),
      prisma.conversation.update({
        where: { id: cid },
        data: { lastMessageAt: now, lastMessagePreview: text ? truncateSafe(text, 140) : body },
      }),
      prisma.conversationParticipant.updateMany({
        where: { conversationId: cid, userId: fromUserId },
        data: { lastReadAt: now, lastDeliveredAt: now },
      }),
    ]);

    // El texto del usuario acompaña a la tarjeta como mensaje normal (patrón
    // WhatsApp). Push y tiempo real UNA vez, con el último mensaje.
    let last = message;
    if (text) {
      last = await prisma.chatMessage.create({
        data: { conversationId: cid, senderId: fromUserId, kind: "TEXT", body: text },
      });
    }
    await Promise.allSettled([sendChatPush(last), notifyMessage(last)]);
    return cid;
  } catch (err) {
    console.error("[chat-context] tarjeta de registro fallida:", err);
    return null;
  }
}

/**
 * Inserta el mensaje SYSTEM en TODAS las conversaciones vinculadas al registro
 * y avisa al gateway. Devuelve cuántas conversaciones se notificaron.
 */
export async function notifyLinkedConversations(
  contextType: string,
  contextId: string,
  event: ContextEvent
): Promise<number> {
  try {
    // Destinos: conversaciones VINCULADAS (banner de contexto, legado) ∪
    // conversaciones donde el registro se COMPARTIÓ como tarjeta.
    const [linked, shared] = await Promise.all([
      prisma.conversation.findMany({ where: { contextType, contextId }, select: { id: true }, take: 50 }),
      prisma.chatMessage.findMany({
        where: { contextType, contextId, deletedAt: null },
        select: { conversationId: true },
        distinct: ["conversationId"],
        take: 50,
      }),
    ]);
    const ids = new Set<string>([...linked.map((c) => c.id), ...shared.map((m) => m.conversationId)]);
    if (ids.size === 0) return 0;

    // El título contextualiza el evento en chats generales (varios registros
    // pueden convivir en el mismo hilo).
    let title: string | null = null;
    if (contextType === "property") {
      title = (await prisma.property.findUnique({ where: { id: contextId }, select: { title: true } }))?.title ?? null;
    }
    const text = contextEventText(event, title);
    if (!text) return 0;

    const conversations = [...ids].map((id) => ({ id }));

    const now = new Date();
    for (const c of conversations) {
      await prisma.$transaction([
        prisma.chatMessage.create({
          data: { conversationId: c.id, senderId: null, kind: "SYSTEM", body: text },
        }),
        prisma.conversation.update({
          where: { id: c.id },
          data: { lastMessageAt: now, lastMessagePreview: text.slice(0, 140) },
        }),
      ]);
      // actorId "system" no coincide con ningún participante → refetch para todos.
      await notifyConversation(c.id, "system");
    }
    return conversations.length;
  } catch (err) {
    console.error("[chat-context] evento de registro fallido:", err);
    return 0;
  }
}
