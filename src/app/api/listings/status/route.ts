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
 * Se filtra por `property.ownerId`, no sólo por `Listing.url`. La diferencia no
 * es cosmética: `Listing.url` es `@unique` GLOBAL, así que filtrar sólo por URL
 * respondería "ya lo tienes" por el anuncio de otra cuenta — una fuga de que
 * ese anuncio existe en el sistema, y además un botón que luego devolvería 403.
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

  const listing = await prisma.listing.findFirst({
    where: { url, property: { ownerId } },
    select: { propertyId: true },
  });

  return NextResponse.json({ propertyId: listing?.propertyId ?? null });
}
