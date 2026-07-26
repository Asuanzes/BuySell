import { prisma } from "@/lib/db";
import { CHAT_FLAGS } from "@/lib/chat/config";
import { displayName } from "@/lib/chat/serialize";
import { messagePreview } from "@/lib/chat/util";
import { deliverPush, pushableTokens, type PushMessage } from "@/lib/notifications/push";
import type { ChatMessage } from "@prisma/client";

/**
 * Notificaciones push del chat vía Expo Push API. Se llama tras persistir un
 * mensaje. Sin gateway de presencia (F1/F2) no sabemos quién está conectado, así
 * que notificamos a TODOS los participantes activos salvo el remitente y los que
 * tengan la conversación silenciada; el cliente suprime el aviso si está mirando
 * esa conversación en primer plano.
 *
 * El filtrado por preferencias del usuario y horario silencioso vive en
 * @/lib/notifications/push (compartido con las alertas de precio). Silenciar la
 * conversación (muteUntil) sigue siendo un filtro aparte y más específico.
 *
 * Privacidad: si CHAT_PUSH_PREVIEW=false, no se envía el texto (solo "Nuevo
 * mensaje") — útil mientras no haya E2E.
 */

export async function sendChatPush(message: ChatMessage): Promise<void> {
  if (!message.senderId) return;

  const conversation = await prisma.conversation.findUnique({
    where: { id: message.conversationId },
    select: {
      kind: true,
      title: true,
      participants: {
        where: {
          leftAt: null,
          userId: { not: message.senderId },
          OR: [{ muteUntil: null }, { muteUntil: { lt: new Date() } }],
        },
        select: { user: { select: { id: true, name: true, username: true, email: true, image: true } } },
      },
    },
  });
  if (!conversation || conversation.participants.length === 0) return;

  let recipientIds = conversation.participants.map((p) => p.user.id);

  // Bloqueos: en DIRECT el envío ya está vetado antes, pero en GRUPOS el
  // mensaje sí se persiste — lo que NO debe pasar es que el bloqueado haga
  // sonar el móvil del bloqueador (ni al revés).
  if (recipientIds.length > 0) {
    const blocks = await prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: { in: recipientIds }, blockedId: message.senderId },
          { blockerId: message.senderId, blockedId: { in: recipientIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    if (blocks.length > 0) {
      const excluded = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
      recipientIds = recipientIds.filter((uid) => !excluded.has(uid));
    }
  }
  if (recipientIds.length === 0) return;

  const tokens = await pushableTokens(recipientIds, "chat");
  if (tokens.length === 0) return;

  const sender = await prisma.user.findUnique({
    where: { id: message.senderId },
    select: { name: true, username: true, email: true },
  });
  const senderName = sender ? displayName(sender) : "Alguien";

  // Título y cuerpo. En grupo el título es el grupo y el cuerpo "Remitente: …".
  const preview = CHAT_FLAGS.pushPreview ? messagePreview(message.kind, message.body) : "Nuevo mensaje";
  const isGroup = conversation.kind === "GROUP";
  const title = isGroup ? conversation.title ?? "Grupo" : senderName;
  const body = isGroup ? `${senderName}: ${preview}` : preview;

  const payloads: PushMessage[] = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    data: { type: "chat", conversationId: message.conversationId },
    channelId: "chat",
  }));

  await deliverPush(payloads, "chat-push");
}
