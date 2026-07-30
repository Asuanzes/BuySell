import type { RecordType } from "@nidokey/shared";

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
};

type CardWithOwner = (ContextCard & { ownerId: string | null }) | null;

const fmtPrice = (cents: number | null | undefined, currency = "EUR"): string | null =>
  cents == null
    ? null
    : (cents / 100).toLocaleString("es-ES", { style: "currency", currency, maximumFractionDigits: 2 });

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
        rooms: true,
        bathrooms: true,
        media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" }, select: { url: true } },
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
    const feats = [p.rooms != null ? `${p.rooms} hab` : null, p.bathrooms != null ? `${p.bathrooms} baños` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      ownerId: p.ownerId,
      title: p.title,
      imageUrl: p.media[0]?.url ?? null,
      subtitle: [p.city, price].filter(Boolean).join(" · ") || null,
      meta: feats || null,
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
      select: { ownerId: true, title: true, subtitle: true, imageUrl: true, status: true },
    });
    if (!h) return null;
    const statusLabel =
      h.status === "BOOKED" ? "Reservado ✔" : h.status === "PLANNING" ? "En planificación" : h.status === "DONE" ? "Hecho" : null;
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
    return { title: card.title, imageUrl: card.imageUrl, subtitle: card.subtitle, meta: card.meta ?? null };
  } catch {
    // El banner es decorativo: nunca rompe el detalle del chat.
    return null;
  }
}
