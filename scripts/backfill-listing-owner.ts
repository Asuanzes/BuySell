/**
 * Rellena `Listing.ownerId` desde `Property.ownerId`.
 *
 * Contexto: `Listing.url` era `@unique` GLOBAL, así que el primer usuario que
 * guardaba un anuncio se lo quedaba y el segundo recibía un 403
 * (`CrossOwnerError`). La unicidad pasa a ser `[url, ownerId]`, y para eso el
 * anuncio necesita saber de quién es. La columna se añadió nullable, de modo
 * que hasta que corra esto todas las filas están a NULL.
 *
 * Idempotente: sólo toca las filas que aún no tienen dueño. Se puede repetir.
 *
 * Uso:  node --env-file=.env --import tsx scripts/backfill-listing-owner.ts
 *       (añade --dry para ver qué haría sin escribir)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry");

async function main() {
  const pending = await prisma.listing.findMany({
    where: { ownerId: null },
    select: { id: true, url: true, property: { select: { ownerId: true } } },
  });

  // Una ficha sin dueño deja su anuncio sin dueño: es coherente y no hay nada
  // mejor que inventarse. Son filas heredadas (existe scripts/claim-orphan-properties).
  const resolvable = pending.filter((l) => l.property?.ownerId);
  const orphans = pending.length - resolvable.length;

  console.log(
    `Anuncios sin dueño: ${pending.length} · con dueño resoluble: ${resolvable.length} · huérfanos: ${orphans}`
  );
  if (dryRun) {
    for (const l of resolvable.slice(0, 10)) {
      console.log(`  ${l.id} → ${l.property!.ownerId}  (${l.url.slice(0, 70)})`);
    }
    return;
  }

  // Una actualización por dueño en vez de una por fila: son pocas filas, pero
  // agrupar evita N viajes a Neon y deja el script servible si crecen.
  const byOwner = new Map<string, string[]>();
  for (const l of resolvable) {
    const owner = l.property!.ownerId!;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), l.id]);
  }

  let updated = 0;
  for (const [ownerId, ids] of byOwner) {
    const r = await prisma.listing.updateMany({ where: { id: { in: ids } }, data: { ownerId } });
    updated += r.count;
  }

  const left = await prisma.listing.count({ where: { ownerId: null } });
  console.log(`Actualizados: ${updated} · siguen sin dueño: ${left} (deberían ser los ${orphans} huérfanos)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
