import type { ChatAttachment, ChatMessage, Conversation, ConversationParticipant, User } from "@prisma/client";
import { truncateSafe } from "@/lib/chat/util";

/**
 * DTOs del chat hacia los clientes. Centralizado para que la forma del JSON
 * sea estable entre endpoints (lista, detalle, mensajes).
 */

type ParticipantWithUser = ConversationParticipant & {
  user: Pick<User, "id" | "name" | "username" | "email" | "image">;
};

export type ChatUserDto = {
  id: string;
  name: string | null;
  username: string | null;
  /**
   * Dato personal: solo se emite para UNO MISMO, para los contactos guardados
   * y para el resultado de búsqueda por dato exacto. En el resto de
   * superficies (participantes de grupos, bloqueados) va null — un co-miembro
   * de grupo no tiene por qué cosechar el email de todos.
   */
  email: string | null;
  image: string | null;
};

/**
 * `User.image` guarda una KEY de R2 (`avatars/<userId>/…`) o, legado, una URL
 * http(s). Hacia el cliente siempre sale una URL: las keys se sirven vía el
 * endpoint público cacheable GET /api/avatar/[userId] (302 a URL firmada);
 * `?v=` = nombre del fichero (cambia al actualizar → rompe caché de expo-image).
 */
export function avatarUrl(u: Pick<User, "id" | "image">): string | null {
  if (!u.image) return null;
  if (/^https?:\/\//i.test(u.image)) return u.image;
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const v = u.image.split("/").pop() ?? "";
  return `${base}/api/avatar/${u.id}?v=${encodeURIComponent(v)}`;
}

export function userDto(
  u: Pick<User, "id" | "name" | "username" | "email" | "image">,
  opts: { withEmail?: boolean } = {}
): ChatUserDto {
  return { id: u.id, name: u.name, username: u.username, email: opts.withEmail ? u.email : null, image: avatarUrl(u) };
}

/** Nombre a mostrar: name, si no @username, si no la parte local del email. */
export function displayName(u: Pick<User, "name" | "username" | "email">): string {
  return u.name?.trim() || (u.username ? "@" + u.username : null) || u.email.split("@")[0];
}

export function participantDto(p: ParticipantWithUser, meId?: string) {
  return {
    userId: p.userId,
    role: p.role,
    lastReadAt: p.lastReadAt?.toISOString() ?? null,
    lastDeliveredAt: p.lastDeliveredAt?.toISOString() ?? null,
    // El email solo viaja para uno mismo (privacidad frente a co-miembros).
    user: userDto(p.user, { withEmail: p.userId === meId }),
  };
}

export function conversationDto(
  c: Conversation & { participants: ParticipantWithUser[] },
  meId: string,
  extras: { unreadCount?: number; context?: { title: string; imageUrl: string | null; subtitle: string | null } | null } = {}
) {
  const me = c.participants.find((p) => p.userId === meId) ?? null;
  const others = c.participants.filter((p) => p.userId !== meId && !p.leftAt);
  // DIRECT: el título es el otro participante.
  const title = c.kind === "DIRECT" ? (others[0] ? displayName(others[0].user) : "—") : c.title ?? "—";
  const imageUrl = c.kind === "DIRECT" ? (others[0] ? avatarUrl(others[0].user) : null) : c.imageUrl;
  return {
    id: c.id,
    kind: c.kind,
    title,
    imageUrl,
    contextType: c.contextType,
    contextId: c.contextId,
    context: extras.context ?? null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: c.lastMessagePreview,
    unreadCount: extras.unreadCount ?? 0,
    muteUntil: me?.muteUntil?.toISOString() ?? null,
    pinnedAt: me?.pinnedAt?.toISOString() ?? null,
    myRole: me?.role ?? "MEMBER",
    participants: c.participants.filter((p) => !p.leftAt).map((p) => participantDto(p, meId)),
    createdAt: c.createdAt.toISOString(),
  };
}

export type ConversationDto = ReturnType<typeof conversationDto>;

type ReactionRow = { emoji: string; userId: string };

/** Agrega filas de reacción a chips {emoji, count, mine}, ordenados por count. */
export function aggregateReactions(rows: ReactionRow[], meId?: string) {
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of rows) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    entry.count += 1;
    if (meId && r.userId === meId) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * Snippet del mensaje citado (responder-cita). Se resuelve en el servidor
 * porque el citado puede no estar en la página cargada por el cliente.
 */
export type ReplyToDto = {
  id: string;
  senderId: string | null;
  kind: string;
  /** Truncado a 140 chars; null si el citado está borrado o es media sin pie. */
  body: string | null;
  deleted: boolean;
};

export function replySnippet(
  m: Pick<ChatMessage, "id" | "senderId" | "kind" | "body" | "deletedAt">
): ReplyToDto {
  const deleted = !!m.deletedAt;
  const body = deleted ? null : m.body;
  return {
    id: m.id,
    senderId: m.senderId,
    kind: m.kind,
    body: body ? truncateSafe(body, 140) : body,
    deleted,
  };
}

/** Tarjeta de registro embebida en un mensaje (compartir al chat). */
export type MessageContextDto = {
  title: string;
  subtitle: string | null;
  meta?: string | null;
  imageUrl: string | null;
};

export function messageDto(
  m: ChatMessage & { attachments?: ChatAttachment[]; reactions?: ReactionRow[] },
  meId?: string,
  replyTo?: ReplyToDto | null,
  context?: MessageContextDto | null
) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    kind: m.kind,
    // Borrado suave: el cuerpo desaparece, el hueco queda ("mensaje eliminado").
    body: deleted ? null : m.body,
    replyToId: m.replyToId,
    replyTo: replyTo ?? null,
    // Tarjeta de registro: los clientes nuevos la pintan EN VEZ del body (que
    // lleva "📌 Título" de respaldo para clientes viejos, lista y push).
    contextType: deleted ? null : m.contextType,
    contextId: deleted ? null : m.contextId,
    context: deleted ? null : context ?? null,
    clientId: m.clientId,
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted,
    createdAt: m.createdAt.toISOString(),
    reactions: deleted ? [] : aggregateReactions(m.reactions ?? [], meId),
    attachments: deleted
      ? []
      : (m.attachments ?? []).map((a) => ({
          id: a.id,
          kind: a.kind,
          url: a.url,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          fileName: a.fileName,
          width: a.width,
          height: a.height,
          durationMs: a.durationMs,
          blurhash: a.blurhash,
        })),
  };
}

export type MessageDto = ReturnType<typeof messageDto>;
