import type { RecordType } from "@nidokey/shared";
import { prisma } from "@/lib/db";

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
