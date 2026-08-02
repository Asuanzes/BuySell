import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth-helpers";
import {
  buildRentalWhere,
  parseRentalFilters,
  priceColumn,
  rentalOrderBy,
} from "@/lib/rentals/filters";

/**
 * GET /api/rentals/search — buscador de inmuebles (alquiler por defecto).
 *
 * Fase 1 de `docs/BUSCADOR-ALQUILER.md`: busca SOLO entre los registros del
 * usuario (`ownerId`). No hay corpus público ni parámetro para pedirlo: esa
 * decisión es de producto y necesita `visibility`/`publicApprovedAt`/
 * `sourceConsent` en el modelo antes de existir (revisión de Codex, §8 del doc).
 *
 * Endpoint propio en vez de ampliar `/api/properties` a propósito: aquel
 * alimenta la lista del móvil y su aislamiento por dueño no se vuelve a tocar.
 *
 * Parámetros: operation, q, province, city, neighborhood, type (lista),
 * minPrice/maxPrice (EUROS), minRooms/maxRooms, minBaths, minArea/maxArea,
 * furnished, contractType, petsAllowed, utilitiesIncluded, features (lista),
 * includeUnavailable, sort, limit, cursor.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ownerId = await getUserId();
  if (!ownerId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const filters = parseRentalFilters(req.nextUrl.searchParams);
  const where = { ...buildRentalWhere(filters), ownerId };
  const priceField = priceColumn(filters.operation);

  try {
    // Se pide una fila de más: si llega, hay página siguiente. Evita el
    // `count()` por página que el cursor no necesita.
    const rows = await prisma.property.findMany({
      where,
      orderBy: rentalOrderBy(filters),
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: {
        media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" } },
        // Anuncio de origen: portal, enlace y cuándo se vio por última vez. La
        // frescura se enseña siempre; un precio sin fecha no es comparable.
        listings: {
          select: { portal: true, url: true, status: true, lastSeenAt: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;

    // El total sólo en la primera página: es lo que permite decir "3 de 41" y,
    // sobre todo, distinguir "no hay nada en esa zona" de "filtras demasiado".
    const total = filters.cursor
      ? undefined
      : await prisma.property.count({ where });

    return NextResponse.json({
      results: page.map((p) => {
        const listing = p.listings[0];
        return {
          id: p.id,
          title: p.title,
          type: p.type,
          status: p.status,
          operationType: p.operationType,
          /** Céntimos, de la columna que corresponde a la operación buscada. */
          price: p[priceField],
          city: p.city,
          province: p.province,
          neighborhood: p.neighborhood,
          rooms: p.rooms,
          bathrooms: p.bathrooms,
          builtArea: p.builtArea,
          imageUrl: p.media[0]?.url ?? null,
          portal: listing?.portal ?? null,
          listingUrl: listing?.url ?? null,
          lastSeenAt: listing?.lastSeenAt ?? null,
          /** Sin coordenadas = ubicación aproximada; no se filtra por radio. */
          approximateLocation: p.latitude == null || p.longitude == null,
        };
      }),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      total,
      // Devolver los filtros aplicados hace visible lo que el parseo descartó
      // (una provincia no reconocida sale como `province: undefined`, no como
      // cero resultados inexplicables).
      applied: filters,
    });
  } catch (e) {
    // Cursor de una ficha ya borrada: Prisma no encuentra la fila del cursor.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json(
        { error: "cursor_invalid", detail: "La página siguiente ya no existe; repite la búsqueda." },
        { status: 400 }
      );
    }
    throw e;
  }
}
