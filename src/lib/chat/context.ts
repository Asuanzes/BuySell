import { prisma } from "@/lib/db";

/**
 * Registro vinculado a una conversación (banner de contexto). Dos reglas de
 * seguridad, ambas obligatorias porque el contextId llega del cliente:
 *
 *  1. CREAR: solo puedes vincular un registro TUYO (recordOwnerId === creador).
 *  2. LEER: la tarjeta solo se sirve si el dueño del registro es participante
 *     de la conversación — sin esto, cualquiera con un contextId ajeno leería
 *     título/ciudad/precio/foto de registros de otros usuarios (IDOR, P1 de la
 *     auditoría 2026-07-26).
 *
 * Si mañana se quiere "chatear sobre un registro que me compartieron", ampliar
 * la regla 1 a RecordShare — no relajarla sin más.
 */

export type ContextCard = { title: string; imageUrl: string | null; subtitle: string | null };

type CardWithOwner = (ContextCard & { ownerId: string | null }) | null;

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
        media: { take: 1, orderBy: { order: "asc" }, select: { url: true } },
      },
    });
    if (!p) return null;
    const price =
      p.operationType === "RENT"
        ? p.monthlyRent != null
          ? `${Math.round(p.monthlyRent / 100).toLocaleString("es-ES")} €/mes`
          : null
        : p.currentPrice != null
          ? `${Math.round(p.currentPrice / 100).toLocaleString("es-ES")} €`
          : null;
    return {
      ownerId: p.ownerId,
      title: p.title,
      imageUrl: p.media[0]?.url ?? null,
      subtitle: [p.city, price].filter(Boolean).join(" · ") || null,
    };
  }
  if (contextType === "book") {
    const b = await prisma.bookRecord.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, authors: true, imageUrl: true },
    });
    return b ? { ownerId: b.ownerId, title: b.title, imageUrl: b.imageUrl, subtitle: b.authors } : null;
  }
  if (contextType === "holiday") {
    const h = await prisma.holiday.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, imageUrl: true },
    });
    return h ? { ownerId: h.ownerId, title: h.title, imageUrl: h.imageUrl, subtitle: h.subtitle } : null;
  }
  if (contextType === "job") {
    const j = await prisma.jobListing.findUnique({
      where: { id: contextId },
      select: { ownerId: true, title: true, subtitle: true, imageUrl: true },
    });
    return j ? { ownerId: j.ownerId, title: j.title, imageUrl: j.imageUrl, subtitle: j.subtitle } : null;
  }
  return null;
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
 */
export async function contextCard(
  contextType: string | null,
  contextId: string | null,
  participantIds: string[]
): Promise<ContextCard | null> {
  if (!contextType || !contextId) return null;
  try {
    const card = await fetchCard(contextType, contextId);
    if (!card) return null;
    // Regla 2: el dueño debe seguir siendo participante.
    if (!card.ownerId || !participantIds.includes(card.ownerId)) return null;
    return { title: card.title, imageUrl: card.imageUrl, subtitle: card.subtitle };
  } catch {
    // El banner es decorativo: nunca rompe el detalle del chat.
    return null;
  }
}
