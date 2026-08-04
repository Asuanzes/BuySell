import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth-helpers";

/**
 * GET /api/listings/status?url=…  →  { propertyId: string | null }
 *
 * ¿Este anuncio ya es un registro MÍO? Lo usa el detalle de resultado de
 * búsqueda para enseñar "Ya en tus registros" ANTES de que el usuario pulse,
 * en vez de descubrirlo pulsando.
 *
 * Se filtra por dueño, no sólo por URL. La diferencia no es cosmética: la misma
 * URL puede estar guardada por varios usuarios (`Listing` es único por
 * `[url, ownerId]`), así que buscar sólo por URL respondería "ya lo tienes" por
 * el anuncio de otra cuenta — una fuga de que ese anuncio existe en el sistema.
 * Para un anuncio ajeno esta ruta devuelve `null`, que es lo correcto: para
 * este usuario no está guardado.
 *
 * Sólo lectura y sin efectos: no crea nada, no toca el anuncio y no cuenta
 * contra ninguna cuota.
 */
export async function GET(req: NextRequest) {
  const ownerId = await getUserId();
  if (!ownerId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "Falta url" }, { status: 400 });
  }

  // Por la columna `ownerId` del propio anuncio, que es la que forma el índice
  // único `[url, ownerId]`: filtrar por la relación funcionaba pero obligaba a
  // un join que este índice ya resuelve.
  const listing = await prisma.listing.findFirst({
    where: { url, ownerId },
    select: { propertyId: true },
  });

  return NextResponse.json({ propertyId: listing?.propertyId ?? null });
}
