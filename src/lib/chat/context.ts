import { isRentOperation, type RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { sharedAccess } from "@/lib/records/access";

/**
 * Registro vinculado a una conversación (banner de contexto). Tres reglas de
 * seguridad, todas obligatorias porque el contextId llega del cliente:
 *
 *  1. CREAR: solo puedes vincular un registro TUYO (recordOwnerId === creador).
 *  2. LEER: la tarjeta solo se sirve si el dueño del registro es participante
 *     de la conversación — sin esto, cualquiera con un contextId ajeno leería
 *     título/ciudad/precio/foto de registros de otros usuarios (IDOR, P1 de la
 *     auditoría 2026-07-26).
 *  3. LEER una TARJETA de mensaje: quien mira debe seguir teniendo acceso al
 *     registro (o ser su dueño). Sin esto, retirar el acceso desde "Mis
 *     compartidos" cerraba la ficha pero la tarjeta seguía sirviendo el precio
 *     actualizado para siempre.
 *
 * Si mañana se quiere "chatear sobre un registro que me compartieron", ampliar
 * la regla 1 a RecordShare — no relajarla sin más.
 */

export type ContextCard = {
  title: string;
  imageUrl: string | null;
  subtitle: string | null;
  /** Segunda línea rica por categoría ("3 hab · 2 baños", "ahora 64.230 €"…). */
  meta?: string | null;
  statusShown?: boolean;
};

export type ContextHeaderEvent = {
  recordType: string;
  recordId: string;
  eventType: string;
  observedAt: string;
  payload: unknown;
};

export type ConversationContextHeader = ContextCard & {
  /**
   * Registro que el header ELIGIÓ (la conversación puede no tener contexto
   * propio y derivarlo del último mensaje compartido): sin esto el cliente no
   * sabía a qué ficha navegar y el toque en el banner era un no-op silencioso
   * (fallo real reportado el 2026-08-13 en el DM del bot).
   */
  recordType?: string;
  recordId?: string;
  viewerOwnsRecord?: boolean;
  relatedRecordCount?: number;
  changedSinceMyLastMessage?: {
    total: number;
    since: string;
    events: ContextHeaderEvent[];
  } | null;
};

type CardWithOwner = (ContextCard & { ownerId: string | null }) | null;

type ContextMessageLite = {
  senderId: string | null;
  contextType: string | null;
  contextId: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
};

type ContextParticipantLite = {
  userId: string;
  joinedAt?: Date | null;
  leftAt?: Date | null;
};

type ContextConversationLite = {
  id: string;
  kind?: string;
  contextType: string | null;
  contextId: string | null;
  participants: ContextParticipantLite[];
  messages?: ContextMessageLite[];
};

type RecordPair = { contextType: string; contextId: string };

type RecordEventLite = {
  recordType: string;
  recordId: string;
  eventType: string;
  payload: unknown;
  observedAt: Date;
};

type ContextHeaderDeps = {
  fetchCard?: (contextType: string, contextId: string) => Promise<CardWithOwner>;
  findContextMessages?: (conversationId: string) => Promise<ContextMessageLite[]>;
  findRecordEvents?: (viewerId: string, pairs: RecordPair[], baseline: Date) => Promise<RecordEventLite[]>;
  countRecordEvents?: (viewerId: string, pairs: RecordPair[], baseline: Date) => Promise<number>;
};

const fmtPrice = (cents: number | null | undefined, currency = "EUR"): string | null =>
  cents == null
    ? null
    : (cents / 100).toLocaleString("es-ES", { style: "currency", currency, maximumFractionDigits: 2 });

export function propertyStatusLabel(status: string | null | undefined): string | null {
  switch (status) {
    case "RESERVED":
      return "Reservado";
    case "SOLD":
      return "Vendido";
    case "WITHDRAWN":
      return "Retirado";
    case "RENTED":
      return "Alquilado";
    default:
      return null;
  }
}

async function fetchCard(contextType: string, contextId: string): Promise<CardWithOwner> {
  if (contextType === "property") {
    const p = await prisma.property.findUnique({
      where: { id: contextId },
      select: {
        ownerId: true,
        title: true,
        city: true,
        currentPrice: true,
        monthlyRent: true,
        operationType: true,
        status: true,
        rooms: true,
        bathrooms: true,
        media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" }, select: { url: true } },
      },
    });
    if (!p) return null;
    const price =
      isRentOperation(p.operationType)
        ? p.monthlyRent != null
          ? `${Math.round(p.monthlyRent / 100).toLocaleString("es-ES")} €/mes`
          : null
        : p.currentPrice != null
          ? `${Math.round(p.currentPrice / 100).toLocaleString("es-ES")} €`
          : null;
    const feats = [p.rooms != null ? `${p.rooms} hab` : null, p.bathrooms != null ? `${p.bathrooms} baños` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      ownerId: p.ownerId,
      title: p.title,
      imageUrl: p.media[0]?.url ?? null,
      subtitle: [p.city, price].filter(Boolean).join(" · ") || null,
      meta: [propertyStatusLabel(p.status), feats || null].filter(Boolean).join(" · ") || null,
      ...(propertyStatusLabel(p.status) ? { statusShown: true } : {}),
    };
  }
  if (contextType === "crypto") {
    const c = await prisma.cryptoHolding.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, symbol: true, currentValue: true, currency: true, imageUrl: true },
    });
    if (!c) return null;
    const price = fmtPrice(c.currentValue, c.currency ?? "EUR");
    return {
      ownerId: c.ownerId,
      title: c.title,
      imageUrl: c.imageUrl,
      subtitle: c.subtitle ?? c.symbol,
      meta: price ? `ahora ${price}` : null,
    };
  }
  if (contextType === "market") {
    const m = await prisma.marketInstrument.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, symbol: true, exchange: true, currentValue: true, currency: true, imageUrl: true },
    });
    if (!m) return null;
    const price = fmtPrice(m.currentValue, m.currency ?? "USD");
    return {
      ownerId: m.ownerId,
      title: m.title,
      imageUrl: m.imageUrl,
      subtitle: m.subtitle ?? [m.symbol, m.exchange].filter(Boolean).join(" · "),
      meta: price ? `ahora ${price}` : null,
    };
  }
  if (contextType === "book") {
    const b = await prisma.bookRecord.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, authors: true, imageUrl: true, status: true },
    });
    if (!b) return null;
    const statusLabel =
      b.status === "READ" ? "Leído" : b.status === "READING" ? "Leyéndolo" : b.status === "WISHLIST" ? "En la lista de deseos" : null;
    return { ownerId: b.ownerId, title: b.title, imageUrl: b.imageUrl, subtitle: b.authors, meta: statusLabel };
  }
  if (contextType === "holiday") {
    const h = await prisma.holiday.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, imageUrl: true, status: true, meta: true },
    });
    if (!h) return null;
    // C8: un PLANNING con meta.planning es un viaje EN ORGANIZACIÓN — la misma
    // etiqueta que su ficha («Organizando»), no «En planificación» (Codex 5d0e03e9).
    const organizing = Boolean((h.meta as { planning?: unknown } | null)?.planning);
    const statusLabel =
      h.status === "BOOKED"
        ? "Reservado ✔"
        : h.status === "PLANNING"
          ? organizing
            ? "Organizando"
            : "En planificación"
          : h.status === "DONE"
            ? "Hecho"
            : null;
    return { ownerId: h.ownerId, title: h.title, imageUrl: h.imageUrl, subtitle: h.subtitle, meta: statusLabel };
  }
  if (contextType === "job") {
    const j = await prisma.jobListing.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, imageUrl: true, status: true },
    });
    if (!j) return null;
    return {
      ownerId: j.ownerId,
      title: j.title,
      imageUrl: j.imageUrl,
      subtitle: j.subtitle,
      meta: j.status === "CLOSED" ? "Oferta cerrada" : j.status === "OPEN" ? "Oferta abierta" : null,
    };
  }
  return null;
}

function pairKey(pair: RecordPair): string {
  return `${pair.contextType}\0${pair.contextId}`;
}

function recordPairsFrom(conversation: ContextConversationLite, messages: ContextMessageLite[]): RecordPair[] {
  const pairs = new Map<string, RecordPair>();
  const add = (contextType: string | null, contextId: string | null) => {
    if (!contextType || !contextId) return;
    const pair = { contextType, contextId };
    pairs.set(pairKey(pair), pair);
  };

  add(conversation.contextType, conversation.contextId);
  for (const message of messages) {
    if (!message.deletedAt) add(message.contextType, message.contextId);
  }
  return [...pairs.values()];
}

function selectHeaderPair(conversation: ContextConversationLite, messages: ContextMessageLite[]): RecordPair | null {
  if (conversation.contextType && conversation.contextId) {
    return { contextType: conversation.contextType, contextId: conversation.contextId };
  }
  const latest = messages.find((message) => !message.deletedAt && message.contextType && message.contextId);
  return latest?.contextType && latest.contextId ? { contextType: latest.contextType, contextId: latest.contextId } : null;
}

function activeParticipantIds(conversation: ContextConversationLite): string[] {
  return conversation.participants
    .filter((p) => conversation.kind !== "GROUP" || !p.leftAt)
    .map((p) => p.userId);
}

function degradedCard(): ContextCard {
  return { title: "Registro eliminado", imageUrl: null, subtitle: null, meta: null };
}

function lastOwnMessageBaseline(messages: ContextMessageLite[], viewerId: string): Date | null {
  const own = messages
    .filter((message) => message.senderId === viewerId && !message.deletedAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return own?.createdAt ?? null;
}

function joinedAtBaseline(conversation: ContextConversationLite, viewerId: string): Date | null {
  return conversation.participants.find((p) => p.userId === viewerId)?.joinedAt ?? null;
}

async function defaultFindContextMessages(conversationId: string): Promise<ContextMessageLite[]> {
  return prisma.chatMessage.findMany({
    where: { conversationId, contextType: { not: null }, contextId: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { senderId: true, contextType: true, contextId: true, deletedAt: true, createdAt: true },
  });
}

function recordEventWhere(viewerId: string, pairs: RecordPair[], baseline: Date) {
  return {
    userId: viewerId,
    observedAt: { gt: baseline },
    OR: pairs.map((pair) => ({ recordType: pair.contextType, recordId: pair.contextId })),
  };
}

async function defaultFindRecordEvents(viewerId: string, pairs: RecordPair[], baseline: Date): Promise<RecordEventLite[]> {
  if (pairs.length === 0) return [];
  return prisma.recordEvent.findMany({
    where: recordEventWhere(viewerId, pairs, baseline),
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    take: 3,
    select: { recordType: true, recordId: true, eventType: true, payload: true, observedAt: true },
  });
}

async function defaultCountRecordEvents(viewerId: string, pairs: RecordPair[], baseline: Date): Promise<number> {
  if (pairs.length === 0) return 0;
  return prisma.recordEvent.count({ where: recordEventWhere(viewerId, pairs, baseline) });
}

export async function buildConversationContextHeader(
  conversation: ContextConversationLite,
  viewerId: string,
  deps: ContextHeaderDeps = {}
): Promise<ConversationContextHeader | null> {
  const messages = conversation.messages ?? (await (deps.findContextMessages ?? defaultFindContextMessages)(conversation.id));
  const selected = selectHeaderPair(conversation, messages);
  if (!selected) return null;

  const allPairs = recordPairsFrom(conversation, messages);
  const selectedKey = pairKey(selected);
  const relatedRecordCount = allPairs.filter((pair) => pairKey(pair) !== selectedKey).length;
  const participantIds = activeParticipantIds(conversation);

  let ownerId: string | null = null;
  let card: ContextCard | null = null;
  try {
    const fetched = await (deps.fetchCard ?? fetchCard)(selected.contextType, selected.contextId);
    ownerId = fetched?.ownerId ?? null;
    if (fetched && ownerId && participantIds.includes(ownerId)) {
      card = {
        title: fetched.title,
        imageUrl: fetched.imageUrl,
        subtitle: fetched.subtitle,
        meta: fetched.meta ?? null,
        ...(fetched.statusShown ? { statusShown: true } : {}),
      };
    }
  } catch {
    card = null;
  }

  const viewerOwnsRecord = ownerId === viewerId;
  const header: ConversationContextHeader = card ?? degradedCard();
  if (card) {
    // Solo con tarjeta real: en la degradada («registro eliminado») navegar
    // llevaría a un 404, así que el cliente no recibe destino y no navega.
    header.recordType = selected.contextType;
    header.recordId = selected.contextId;
  }

  if (!viewerOwnsRecord) return header;

  header.viewerOwnsRecord = true;
  if (relatedRecordCount > 0) header.relatedRecordCount = relatedRecordCount;

  const baseline = lastOwnMessageBaseline(messages, viewerId) ?? joinedAtBaseline(conversation, viewerId);
  if (!baseline) return header;

  const [total, events] = await Promise.all([
    (deps.countRecordEvents ?? defaultCountRecordEvents)(viewerId, allPairs, baseline),
    (deps.findRecordEvents ?? defaultFindRecordEvents)(viewerId, allPairs, baseline),
  ]);
  header.changedSinceMyLastMessage =
    total > 0
      ? {
          total,
          since: baseline.toISOString(),
          events: events.slice(0, 3).map((event) => ({
            recordType: event.recordType,
            recordId: event.recordId,
            eventType: event.eventType,
            payload: event.payload,
            observedAt: event.observedAt.toISOString(),
          })),
        }
      : null;

  return header;
}

/** Dueño del registro, o null si el registro/tipo no existe. Para la regla 1. */
export async function recordOwnerId(contextType: string, contextId: string): Promise<string | null> {
  try {
    const card = await fetchCard(contextType, contextId);
    return card?.ownerId ?? null;
  } catch {
    return null;
  }
}

/**
 * Proyección PÚBLICA MÍNIMA del registro vinculado (banner del chat): título,
 * imagen y subtítulo — nunca el detalle completo. null si el registro no
 * existe ("registro eliminado") o si su dueño no está en la conversación.
 *
 * `viewerId` (regla 3, solo para tarjetas de mensaje): si se pasa, además hay
 * que SEGUIR teniendo acceso al registro. Sin esto, retirar el acceso quitaba
 * la ficha pero la tarjeta del chat seguía refrescando título, foto y PRECIO
 * ACTUAL en cada poll — justo el dato que se creía cortado. El banner de
 * conversación vinculada no lo pasa: ahí nunca hubo RecordShare.
 */
export async function contextCard(
  contextType: string | null,
  contextId: string | null,
  participantIds: string[],
  viewerId?: string
): Promise<ContextCard | null> {
  if (!contextType || !contextId) return null;
  try {
    const card = await fetchCard(contextType, contextId);
    if (!card) return null;
    // Regla 2: el dueño debe seguir siendo participante.
    if (!card.ownerId || !participantIds.includes(card.ownerId)) return null;
    // Regla 3: quien mira sigue teniendo acceso (o es el dueño).
    if (viewerId && card.ownerId !== viewerId) {
      if (!(await sharedAccess(contextType as RecordType, contextId, viewerId))) return null;
    }
    return {
      title: card.title,
      imageUrl: card.imageUrl,
      subtitle: card.subtitle,
      meta: card.meta ?? null,
      ...(card.statusShown ? { statusShown: true } : {}),
    };
  } catch {
    // El banner es decorativo: nunca rompe el detalle del chat.
    return null;
  }
}
