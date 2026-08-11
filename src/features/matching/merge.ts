import { prisma } from "@/lib/db";
import { hamming } from "@/lib/dhash";
import { reassignRecordNotes } from "@/lib/record-notes";

/**
 * Fusiona `sourceId` dentro de `targetId`:
 *  - Mueve listings, snapshots y media de source → target.
 *  - Deduplica media por phash (Hamming ≤ 8).
 *  - Rellena campos NULL de target con los de source.
 *  - Borra source.
 *
 * Idempotente: si source ya no existe, no hace nada.
 */
export async function mergeProperties(sourceId: string, targetId: string): Promise<{
  movedListings: number;
  movedSnapshots: number;
  movedMedia: number;
  skippedDuplicateMedia: number;
}> {
  if (sourceId === targetId) {
    throw new Error("mergeProperties: source y target son la misma Property");
  }

  const [source, target] = await Promise.all([
    prisma.property.findUnique({
      where: { id: sourceId },
      include: { media: true, listings: true, priceHistory: true },
    }),
    prisma.property.findUnique({
      where: { id: targetId },
      include: { media: { where: { phash: { not: null } }, select: { phash: true } } },
    }),
  ]);
  if (!source) return { movedListings: 0, movedSnapshots: 0, movedMedia: 0, skippedDuplicateMedia: 0 };
  if (!target) throw new Error(`mergeProperties: target ${targetId} no existe`);

  // Seguridad: nunca fusionar fichas de usuarios distintos (defensa en
  // profundidad; los handlers ya validan ownership, esto cubre cualquier otro
  // llamador, p. ej. el auto-merge del pipeline de import).
  if (source.ownerId !== target.ownerId) {
    throw new Error("mergeProperties: source y target pertenecen a usuarios distintos");
  }

  // 1. Mover Listings. La unicidad es `[url, ownerId]` y la fusión ya exige
  //    mismo dueño, así que dos fichas del mismo usuario no pueden compartir
  //    URL: no debería haber colisión real.
  const movedListings = await prisma.listing.updateMany({
    where: { propertyId: sourceId },
    data: { propertyId: targetId },
  });

  // 2. Mover PriceSnapshots
  const movedSnapshots = await prisma.priceSnapshot.updateMany({
    where: { propertyId: sourceId },
    data: { propertyId: targetId },
  });

  // 3. Mover Media con dedup por phash
  const targetPhashes = target.media.map((m) => m.phash!).filter(Boolean);
  let movedMedia = 0;
  let skippedDuplicateMedia = 0;
  for (const m of source.media) {
    const isDup =
      m.phash &&
      targetPhashes.some((tp) => hamming(tp, m.phash!) <= 8);
    if (isDup) {
      // Borrar media duplicada del source (porque source se va a borrar y la imagen ya está)
      await prisma.media.delete({ where: { id: m.id } });
      skippedDuplicateMedia++;
    } else {
      await prisma.media.update({
        where: { id: m.id },
        data: { propertyId: targetId },
      });
      movedMedia++;
    }
  }

  // 4. Fusionar escalares: target gana, source rellena vacíos
  const patch: Record<string, unknown> = {};
  const fields: (keyof typeof source & keyof typeof target)[] = [
    "description", "address", "postalCode", "neighborhood", "latitude", "longitude",
    "rooms", "bathrooms", "builtArea", "usableArea", "plotArea", "floor",
    "yearBuilt", "hasElevator", "hasGarage", "hasStorage", "hasTerrace",
    "hasFireplace", "hasGarden", "hasPool", "cadastralRef", "cadastralData",
    "titleSlug",
    // Alquiler: rellenan huecos del target. Clave para la ficha MIXTA — fusionar
    // un anuncio de alquiler en una ficha de venta backfillea monthlyRent y sus
    // condiciones sin pisar currentPrice (que NO está en la lista → se conserva).
    "monthlyRent", "deposit", "minStayMonths", "maxStayMonths", "availableFrom",
    "utilitiesIncluded", "furnished", "petsAllowed", "contractType",
  ];
  const t = target as unknown as Record<string, unknown>;
  const s = source as unknown as Record<string, unknown>;
  for (const f of fields) {
    if ((t[f as string] == null || t[f as string] === "") && s[f as string] != null) {
      patch[f as string] = s[f as string];
    }
  }
  // EnergyRating: solo pisar si target es UNKNOWN
  if ((target as { energyRating?: string }).energyRating === "UNKNOWN" && (source as { energyRating?: string }).energyRating !== "UNKNOWN") {
    patch.energyRating = (source as { energyRating?: string }).energyRating;
  }
  // Tags: union
  if (source.tags?.length) {
    const merged = Array.from(new Set([...(target as { tags?: string[] }).tags ?? [], ...source.tags]));
    patch.tags = merged;
  }
  if (Object.keys(patch).length) {
    await prisma.property.update({ where: { id: targetId }, data: patch });
  }

  // 5. Reapuntar notas privadas antes de borrar la fila perdedora.
  await reassignRecordNotes(prisma, {
    userId: target.ownerId,
    recordType: "property",
    fromIds: [sourceId],
    toId: targetId,
  });

  // 6. Borrar source
  await prisma.property.delete({ where: { id: sourceId } });

  return {
    movedListings: movedListings.count,
    movedSnapshots: movedSnapshots.count,
    movedMedia,
    skippedDuplicateMedia,
  };
}
