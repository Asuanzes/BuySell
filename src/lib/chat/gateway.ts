import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import type { ChatMessage } from "@prisma/client";

/**
 * Aviso al gateway WS del VPS (F3, tiempo real). Tras persistir un mensaje,
 * Vercel hace un POST firmado (HMAC) con los participantes; el gateway reenvía un
 * evento opaco {type:"message", conversationId} a sus sockets y el móvil hace
 * refetch a Neon. El CONTENIDO del mensaje no viaja por aquí (E2E-ready) y el VPS
 * no guarda nada.
 *
 * Best-effort: si el gateway no está configurado o no responde, no pasa nada —
 * el móvil sigue con polling. Nunca rompe el envío del mensaje.
 *
 * A diferencia del push (push.ts), aquí NO se filtra por mute: el tiempo real
 * debe llegar aunque tengas la conversación silenciada (solo se silencia el
 * banner de notificación, no la actualización de la pantalla abierta).
 */

const url = () => process.env.CHAT_GATEWAY_URL?.trim().replace(/\/+$/, "");
const secret = () => process.env.CHAT_GATEWAY_SECRET || "";

function gatewayEnabled(): boolean {
  return !!url() && !!secret();
}

export async function notifyMessage(message: ChatMessage): Promise<void> {
  if (!message.senderId) return;
  return notifyConversation(message.conversationId, message.senderId);
}

/**
 * Aviso genérico "algo cambió en esta conversación" (mensaje nuevo, edición,
 * borrado, reacción, recibo de lectura): los demás participantes refetchean.
 * `actorId` queda excluido (su dispositivo ya tiene el cambio en local).
 */
export async function notifyConversation(conversationId: string, actorId: string): Promise<void> {
  if (!gatewayEnabled()) return;
  const start = Date.now();
  try {
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null, userId: { not: actorId } },
      select: { userId: true },
    });
    if (participants.length === 0) return;

    const body = JSON.stringify({
      event: "message",
      conversationId,
      senderId: actorId,
      participantIds: participants.map((p) => p.userId),
    });
    const signature = "sha256=" + createHmac("sha256", secret()).update(body).digest("hex");

    const res = await fetch(`${url()}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nidokey-signature": signature },
      body,
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      console.error(`[chat-gw] notify ${res.status} en ${Date.now() - start}ms (conv ${conversationId})`);
    }
  } catch (e) {
    // Tiempo real best-effort: nunca rompe la operación que lo originó, pero
    // queda rastro en los logs de Vercel (gateway caído / timeout / DNS).
    console.error(
      `[chat-gw] notify error en ${Date.now() - start}ms: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
