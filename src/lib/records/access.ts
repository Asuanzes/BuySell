import type { RecordType } from "@nidokey/shared";
import { prisma } from "@/lib/db";
import { anyBlockBetween } from "@/lib/chat/guard";

/**
 * Acceso genérico a registros por tipo. Extraído de la ruta de compartir para
 * que compartir y alertas usen la MISMA comprobación de pertenencia: si un día
 * cambia el modelo de propiedad, se cambia en un sitio.
 *
 * Los registros de cada vertical viven en tablas distintas (no hay tabla única
 * de records), de ahí el switch.
 */

/** ¿El registro (type,id) es del usuario? Owner-scoped por tipo. */
export async function ownsRecord(type: RecordType, id: string, ownerId: string): Promise<boolean> {
  const where = { id, ownerId };
  switch (type) {
    case "crypto":
      return (await prisma.cryptoHolding.count({ where })) > 0;
    case "market":
      return (await prisma.marketInstrument.count({ where })) > 0;
    case "job":
      return (await prisma.jobListing.count({ where })) > 0;
    case "book":
      return (await prisma.bookRecord.count({ where })) > 0;
    case "holiday":
      return (await prisma.holiday.count({ where })) > 0;
    default:
      return (await prisma.property.count({ where })) > 0;
  }
}

/** Título del registro (para avisos en el chat). "" si ya no existe. */
export async function recordTitle(type: RecordType, id: string): Promise<string> {
  const sel = { where: { id }, select: { title: true } };
  const r =
    type === "crypto"
      ? await prisma.cryptoHolding.findUnique(sel)
      : type === "market"
        ? await prisma.marketInstrument.findUnique(sel)
        : type === "job"
          ? await prisma.jobListing.findUnique(sel)
          : type === "book"
            ? await prisma.bookRecord.findUnique(sel)
            : type === "holiday"
              ? await prisma.holiday.findUnique(sel)
              : await prisma.property.findUnique(sel);
  return r?.title ?? "";
}

/**
 * ¿Puede `userId` LEER este registro por habérselo compartido?
 *
 * Punto ÚNICO de la regla, porque estaba repetida en tres rutas y ninguna
 * miraba los bloqueos: bloquear a alguien le quitaba el registro de su lista
 * pero seguía abriendo la ficha viva (con fotos e histórico) y copiándola.
 * Devuelve la fila si el acceso sigue vigente, null si no.
 */
export async function sharedAccess(
  type: RecordType,
  id: string,
  userId: string
): Promise<{ fromUserId: string } | null> {
  const share = await prisma.recordShare.findUnique({
    where: { recordType_recordId_toUserId: { recordType: type, recordId: id, toUserId: userId } },
    select: { fromUserId: true },
  });
  if (!share) return null;
  // Bloqueo en cualquier dirección = se acabó el acceso. No se borra la fila:
  // desbloquear devuelve el acceso que el dueño concedió, que es lo esperable
  // (el bloqueo es del destinatario, la concesión es del dueño).
  if (await anyBlockBetween(share.fromUserId, userId)) return null;
  return share;
}

/**
 * Retira los accesos compartidos de un registro. Se llama al BORRARLO: sin
 * esto las filas quedaban huérfanas para siempre y se comían el tope de la
 * pantalla "Compartidos conmigo" de los destinatarios, que se quedaba
 * incompleta sin ningún error.
 */
export async function deleteRecordShares(type: RecordType, id: string): Promise<void> {
  try {
    await prisma.recordShare.deleteMany({ where: { recordType: type, recordId: id } });
  } catch (e) {
    // Nunca romper el borrado del registro por la limpieza de sus accesos.
    console.error("[records] no se pudieron borrar los accesos compartidos:", e);
  }
}

/**
 * Valor actual del campo vigilado por una alerta, en céntimos.
 * `field`: "price" → currentValue (cripto/mercado) o currentPrice (venta);
 *          "rent"  → monthlyRent (solo inmuebles).
 * Devuelve null si el registro no existe o el campo está vacío.
 */
export async function recordCurrentCents(
  type: RecordType,
  id: string,
  field: "price" | "rent"
): Promise<number | null> {
  if (type === "crypto") {
    const r = await prisma.cryptoHolding.findUnique({ where: { id }, select: { currentValue: true } });
    return r?.currentValue ?? null;
  }
  if (type === "market") {
    const r = await prisma.marketInstrument.findUnique({ where: { id }, select: { currentValue: true } });
    return r?.currentValue ?? null;
  }
  const r = await prisma.property.findUnique({
    where: { id },
    select: { currentPrice: true, monthlyRent: true },
  });
  if (!r) return null;
  return (field === "rent" ? r.monthlyRent : r.currentPrice) ?? null;
}
