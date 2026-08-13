import { api } from "@/lib/api";
import type { RecordEventPayload } from "@/lib/events-format";

/**
 * Cliente del chat: tipos DTO (espejo de src/lib/chat/serialize.ts) y fetchers.
 * Todo pasa por el helper api() (JWT automático).
 */

/** `email` solo viaja para uno mismo, contactos guardados y búsqueda exacta (privacidad). */
export type ChatUser = { id: string; name: string | null; username: string | null; email: string | null; image: string | null };

/** Tarjeta de un registro (banner de conversación y mensajes-tarjeta). */
export type ContextHeaderEventDto = {
  recordType: string;
  recordId: string;
  eventType: string;
  observedAt: string;
  payload: RecordEventPayload;
};

export type RecordCardDto = {
  title: string;
  subtitle: string | null;
  /** Segunda línea rica por categoría ("3 hab · 2 baños", "ahora 64.230 €"…). */
  meta?: string | null;
  statusShown?: boolean;
  imageUrl: string | null;
  /** Registro que el header ELIGIÓ (puede venir del último mensaje compartido,
   *  no solo del contexto propio de la conversación): destino del toque. */
  recordType?: string;
  recordId?: string;
  /** Los tres campos de abajo solo llegan al DUEÑO del registro: el servidor los
   *  omite para quien lo tiene compartido (no se filtra actividad ajena). */
  viewerOwnsRecord?: boolean;
  relatedRecordCount?: number;
  changedSinceMyLastMessage?: { total: number; since: string; events: ContextHeaderEventDto[] } | null;
};

export type ChatParticipant = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastReadAt: string | null;
  lastDeliveredAt: string | null;
  user: ChatUser;
};

export type ConversationDto = {
  id: string;
  kind: "DIRECT" | "GROUP";
  title: string;
  imageUrl: string | null;
  contextType: string | null;
  contextId: string | null;
  context: RecordCardDto | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  muteUntil: string | null;
  pinnedAt: string | null;
  myRole: "OWNER" | "ADMIN" | "MEMBER";
  participants: ChatParticipant[];
  createdAt: string;
};

export type ReactionChip = { emoji: string; count: number; mine: boolean };

export type AttachmentDto = {
  id: string;
  kind: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blurhash: string | null;
};

/** Snippet del mensaje citado, resuelto en el servidor (puede no estar en la página cargada). */
export type ReplyToDto = {
  id: string;
  senderId: string | null;
  kind: string;
  body: string | null;
  deleted: boolean;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "SYSTEM";
  body: string | null;
  replyToId: string | null;
  replyTo: ReplyToDto | null;
  /** Tarjeta de registro compartido: si viene, se pinta EN VEZ del body
   *  (el body lleva "📌 Título" de respaldo para clientes viejos). */
  contextType: string | null;
  contextId: string | null;
  context: RecordCardDto | null;
  clientId: string | null;
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
  reactions: ReactionChip[];
  attachments: AttachmentDto[];
  /** SOLO cliente: envío optimista que falló; se ofrece reintentar/descartar. */
  failed?: boolean;
};

export type ChatBootstrap = {
  flags: {
    enabled: boolean;
    groups: boolean;
    attachments: boolean;
    voice: boolean;
    typing: boolean;
    contextLinks: boolean;
  };
  limits: { maxMessageChars: number; maxGroupParticipants: number; editWindowMin: number };
  unreadTotal: number;
};

export const chatBootstrap = () => api<ChatBootstrap>("/api/chat/bootstrap");

/**
 * Ticket para conectar al gateway WS de tiempo real (F3). { ticket: null } si el
 * servidor no tiene el gateway configurado → el cliente sigue con polling.
 */
export const getWsTicket = () => api<{ ticket: string | null; url: string | null }>("/api/chat/ws-ticket");

export const listConversations = () =>
  api<{ conversations: ConversationDto[] }>("/api/chat/conversations").then((d) => d.conversations);

export const getConversation = (id: string) => api<ConversationDto>(`/api/chat/conversations/${id}`);

export const createConversation = (input: {
  kind?: "DIRECT" | "GROUP";
  participantIds: string[];
  title?: string;
  contextType?: string | null;
  contextId?: string | null;
}) =>
  api<ConversationDto>("/api/chat/conversations", { method: "POST", body: JSON.stringify(input) });

export const listMessages = (conversationId: string, cursor?: string | null) =>
  api<{ messages: MessageDto[]; nextCursor: string | null }>(
    `/api/chat/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
  );

export const sendMessage = (conversationId: string, input: { clientId: string; body: string; replyToId?: string | null }) =>
  api<MessageDto>(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ ...input, kind: "TEXT" }),
  });

export const sendMediaMessage = (
  conversationId: string,
  input: {
    clientId: string;
    kind: "IMAGE" | "FILE" | "AUDIO";
    attachments: {
      key: string;
      mime: string;
      sizeBytes: number;
      fileName?: string | null;
      width?: number | null;
      height?: number | null;
      durationMs?: number | null;
    }[];
    body?: string | null;
  }
) =>
  api<MessageDto>(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });

/**
 * Las URLs de adjuntos van FIRMADAS y cambian en cada respuesta (rompería la
 * caché de expo-image y haría parpadear las fotos en cada poll). Fijamos la
 * primera URL vista por attachment.id (la firma dura 7 días).
 */
const attachmentUrlCache = new Map<string, string>();
export function stableAttachmentUrl(a: { id: string; url: string }): string {
  const cached = attachmentUrlCache.get(a.id);
  if (cached) return cached;
  if (attachmentUrlCache.size > 500) attachmentUrlCache.clear();
  attachmentUrlCache.set(a.id, a.url);
  return a.url;
}

export type MessageSearchResult = { id: string; senderId: string | null; snippet: string; createdAt: string };

/** Búsqueda de texto dentro de una conversación (20 más recientes). */
export const searchInConversation = (conversationId: string, q: string) =>
  api<{ results: MessageSearchResult[] }>(
    `/api/chat/conversations/${conversationId}/messages/search?q=${encodeURIComponent(q)}`
  ).then((d) => d.results);

export const markRead = (conversationId: string) =>
  api<{ ok: true; lastReadAt: string }>(`/api/chat/conversations/${conversationId}/read`, { method: "POST" });

export const deleteMessage = (messageId: string) =>
  api<MessageDto>(`/api/chat/messages/${messageId}`, { method: "DELETE" });

/** Editar mensaje propio (ventana de 15 min server-side). */
export const editMessage = (messageId: string, body: string) =>
  api<MessageDto>(`/api/chat/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });

/** Toggle de reacción (mismo emoji = quitar; otro = sustituir). */
export const toggleReaction = (messageId: string, emoji: string) =>
  api<{ reactions: ReactionChip[] }>(`/api/chat/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  }).then((d) => d.reactions);

export const searchChatUsers = (q: string) =>
  api<{ users: ChatUser[] }>(`/api/chat/users/search?q=${encodeURIComponent(q)}`).then((d) => d.users);

export const blockUser = (userId: string) =>
  api("/api/chat/blocks", { method: "POST", body: JSON.stringify({ userId }) });

export const unblockUser = (userId: string) =>
  api("/api/chat/blocks", { method: "DELETE", body: JSON.stringify({ userId }) });

/** Guarda una COPIA de un registro compartido en mis registros (adopt). */
export const adoptRecord = (recordId: string, type: string) =>
  api(`/api/records/${recordId}/adopt`, { method: "POST", body: JSON.stringify({ type }) });

export type ReportCategory = "spam" | "scam" | "harassment" | "inappropriate" | "other";

/** Denunciar mensaje / conversación / usuario (moderación). */
export const reportChat = (input: {
  category: ReportCategory;
  messageId?: string | null;
  conversationId?: string | null;
  targetUserId?: string | null;
  comment?: string | null;
}) => api("/api/chat/reports", { method: "POST", body: JSON.stringify(input) });

export type BlockDto = { userId: string; user: ChatUser; createdAt: string };

export const listBlocks = () =>
  api<{ blocks: BlockDto[] }>("/api/chat/blocks").then((d) => d.blocks);

export const leaveConversation = (conversationId: string) =>
  api(`/api/chat/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ leave: true }) });

/** Renombrar un grupo (solo OWNER/ADMIN; el título pasa el filtro anti-suplantación). */
export const renameConversation = (conversationId: string, title: string) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

/**
 * Foto del grupo: presign → PUT directo a R2 → PATCH con la key (mismo flujo
 * que el avatar de persona). Solo OWNER/ADMIN.
 */
export async function setConversationImage(conversationId: string, file: { uri: string; mime: string }) {
  const blob = await (await fetch(file.uri)).blob();
  const mime = (file.mime || blob.type || "image/jpeg").toLowerCase();
  const presign = await api<{ key: string; uploadUrl: string }>(
    `/api/chat/conversations/${conversationId}/avatar`,
    { method: "POST", body: JSON.stringify({ mime, sizeBytes: blob.size }) }
  );
  const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
  if (!put.ok) throw new Error(`Subida fallida (${put.status})`);
  return api<ConversationDto>(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ image: presign.key }),
  });
}

export const removeConversationImage = (conversationId: string) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ image: null }),
  });

/** Añadir miembros a un grupo (o readmitir a quien se fue). Solo OWNER/ADMIN. */
export const addParticipants = (conversationId: string, userIds: string[]) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}/participants`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });

/** Expulsar a un miembro. Solo OWNER/ADMIN; para salirme yo, leaveConversation. */
export const removeParticipant = (conversationId: string, userId: string) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}/participants`, {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });

/** Silenciar: fecha futura, `null` quita el silencio. "Siempre" = año 9999. */
export const muteConversation = (conversationId: string, muteUntil: string | null) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ muteUntil }),
  });

/** Fijar/desfijar en mi lista (la ordenación ya pone las fijadas primero). */
export const setPinned = (conversationId: string, pinned: boolean) =>
  api<ConversationDto>(`/api/chat/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });

// ——— Contactos (agenda propia de la app; no se lee la agenda del teléfono) ———

export type ContactDto = { userId: string; alias: string | null; user: ChatUser; createdAt: string };

export const listContacts = () =>
  api<{ contacts: ContactDto[] }>("/api/chat/contacts").then((d) => d.contacts);

export const saveContact = (userId: string, alias?: string | null) =>
  api<ContactDto>("/api/chat/contacts", { method: "POST", body: JSON.stringify({ userId, alias }) });

export const deleteContact = (userId: string) =>
  api("/api/chat/contacts", { method: "DELETE", body: JSON.stringify({ userId }) });

/** Nombre a mostrar de un contacto: alias > nombre > @usuario > email local. */
export const contactDisplayName = (c: ContactDto): string =>
  c.alias?.trim() ||
  c.user.name?.trim() ||
  (c.user.username ? "@" + c.user.username : "") ||
  c.user.email?.split("@")[0] ||
  "—";
