import { prisma } from "@/lib/db";
import { notifyConversation } from "@/lib/chat/gateway";
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

/** Texto del evento, o null si el cambio no merece mensaje. PURA (testeable). */
export function contextEventText(e: ContextEvent): string | null {
  if (e.status === "SOLD") return "🏷️ El anuncio se ha marcado como VENDIDO.";
  if (e.status === "REMOVED") return "🏷️ El anuncio ha desaparecido del portal.";
  if (e.oldCents == null || e.newCents == null || e.oldCents === e.newCents) return null;
  const what = e.isRent ? "La renta" : "El precio";
  const arrow = e.newCents < e.oldCents ? "📉" : "📈";
  const verb = e.newCents < e.oldCents ? "ha bajado" : "ha subido";
  return `${arrow} ${what} ${verb}: ${fmtCents(e.oldCents)} → ${fmtCents(e.newCents)}.`;
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
    const text = contextEventText(event);
    if (!text) return 0;

    const conversations = await prisma.conversation.findMany({
      where: { contextType, contextId },
      select: { id: true },
      take: 50,
    });
    if (conversations.length === 0) return 0;

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
