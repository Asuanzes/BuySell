import { prisma } from "@/lib/db";
import { notifyConversation } from "@/lib/chat/gateway";
import { sendChatPush } from "@/lib/chat/push";
import { sanitizeMessageBody, truncateSafe } from "@/lib/chat/util";

/**
 * Nombre de una persona para textos que se PERSISTEN y se difunden (evento
 * SYSTEM, preview de la lista, push a todo el grupo).
 *
 * A diferencia de `displayName` NO cae al local-part del email: el DTO de
 * participantes ya oculta el email a los co-miembros, y estos textos llegan
 * más lejos todavía (pantalla de bloqueo de N personas, histórico del hilo).
 * Además se sanea y se acorta: `User.name` es texto libre y los SYSTEM se
 * pintan como aviso de la app, sin remitente — un nombre elegido a medida
 * podría hacerse pasar por uno.
 */
export function actorName(u: { name: string | null; username: string | null }): string {
  const raw = u.name?.trim() || (u.username ? "@" + u.username : "");
  return sanitizeMessageBody(raw, 32) ?? "Alguien";
}

/**
 * Eventos de sistema del chat (creación de grupo, altas, bajas, expulsiones).
 * El renderer del móvil ya existía; esto es el productor.
 *
 * ⚠️ `senderId` es el ACTOR, nunca null: `unreadByConversation` filtra
 * `m."senderId" <> ${userId}` y en SQL `NULL <> 'x'` no es TRUE, así que un
 * evento sin autor no cuenta como no-leído para nadie (y `sendChatPush` hace
 * early-return sin remitente). Con el actor como autor cuenta para los demás y
 * no para él. El renderer ignora el remitente en los SYSTEM, y el PATCH de
 * editar los rechaza por tipo, así que darles autor no los hace suyos.
 *
 * Nunca lanza hacia arriba con datos a medias: quien llama lo hace dentro de
 * after() y registra el error.
 */
export async function systemEvent(
  conversationId: string,
  actorId: string,
  text: string,
  /** Solo entrar en un grupo merece sonar; salidas y expulsiones no despiertan
   *  el móvil de los demás (siguen contando como no-leído). */
  push = false
): Promise<void> {
  const body = truncateSafe(text, 140);
  const now = new Date();
  const [msg] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { conversationId, senderId: actorId, kind: "SYSTEM", body },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastMessagePreview: body },
    }),
  ]);
  await Promise.allSettled([
    push ? sendChatPush(msg) : Promise.resolve(),
    // actorId "system" no coincide con ningún participante → refetch para todos.
    notifyConversation(conversationId, "system"),
  ]);
}
