import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";

export const maxDuration = 60;

/**
 * GET /api/account/export — portabilidad de datos (RGPD art. 20).
 *
 * Devuelve en un único JSON todo lo que el usuario posee: perfil, registros de
 * cada vertical, direcciones de comida, pedidos y contactos (solo alias +
 * username del contacto; nunca emails de terceros). Los mensajes de chat NO se
 * exportan aquí (contienen datos de otros participantes); si algún usuario lo
 * pide, se resuelve como solicitud manual.
 */
export async function GET() {
  const userId = await requireUserId();

  const [user, properties, crypto, market, jobs, books, holidays, addresses, orders, contacts, shares] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, username: true, createdAt: true },
      }),
      prisma.property.findMany({ where: { ownerId: userId }, include: { listings: true, priceHistory: true } }),
      prisma.cryptoHolding.findMany({ where: { ownerId: userId } }),
      prisma.marketInstrument.findMany({ where: { ownerId: userId } }),
      prisma.jobListing.findMany({ where: { ownerId: userId } }),
      prisma.bookRecord.findMany({ where: { ownerId: userId } }),
      prisma.holiday.findMany({ where: { ownerId: userId } }),
      prisma.foodAddress.findMany({ where: { userId } }),
      prisma.foodOrder.findMany({ where: { customerId: userId }, include: { items: true } }),
      prisma.contact.findMany({
        where: { ownerId: userId },
        select: { alias: true, createdAt: true, contactUser: { select: { username: true, name: true } } },
      }),
      prisma.recordShare.findMany({ where: { fromUserId: userId } }),
    ]);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      profile: user,
      records: { properties, crypto, market, jobs, books, holidays },
      food: { addresses, orders },
      contacts,
      sharesSent: shares,
    },
    { headers: { "Content-Disposition": 'attachment; filename="nidokey-export.json"' } }
  );
}
