import { NextRequest, NextResponse } from "next/server";
import { checkAllActiveListings, checkListing } from "@/features/scraping/runner";
import { getUserId } from "@/lib/auth-helpers";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";

export const maxDuration = 300; // hasta 5 min para batch grande

/**
 * POST /api/listings/check
 *   body: { listingId?: string }  → re-check de UNO concreto
 *   body: {} (o vacío)             → re-check de TODOS los activos
 *
 * Auth: usuario autenticado (botón de recheck en la web) O cron (CRON_SECRET).
 * Antes era público; ahora exige una de las dos credenciales.
 */
export async function POST(req: NextRequest) {
  const cron = isCronAuthorized(req);
  const userId = cron ? null : await getUserId();
  if (!cron && !userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: { listingId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body vacío está OK
  }

  if (body.listingId) {
    // Re-check de UN listing: el usuario debe ser dueño del Property padre. Se
    // comprueba por la relación y no por `Listing.ownerId` a propósito: la
    // pertenencia real la manda la ficha, y así también quedan cubiertas las
    // filas heredadas que aún tienen el dueño a null.
    // El cron puede re-comprobar cualquiera; un usuario, solo los suyos → 404.
    if (!cron) {
      const owned = await prisma.listing.findFirst({
        where: { id: body.listingId, property: { ownerId: userId! } },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    const r = await checkListing(body.listingId);
    return NextResponse.json(r);
  }

  // Batch (todos los activos): operación global → reservada al cron.
  if (!cron) {
    return NextResponse.json({ error: "Solo cron" }, { status: 403 });
  }
  const summary = await checkAllActiveListings();
  return NextResponse.json(summary);
}
