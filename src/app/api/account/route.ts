import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { avatarUrl } from "@/lib/chat/serialize";
import { deleteObject, listObjects } from "@/lib/chat/r2";
import { NIDOKEY_BOT_ID } from "@/lib/chat/bot";
import { isProtectedName, normalizeUsername, usernameError } from "@nidokey/shared";

/** En BBDD `image` es una key de R2; hacia el cliente siempre va como URL. */
function profileDto(user: {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  image: string | null;
  onboardingCompletedAt: Date | null;
}) {
  return { ...user, image: avatarUrl(user) };
}

/** GET /api/account — mi perfil (incluye username y email). */
export async function GET() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, username: true, image: true, onboardingCompletedAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profileDto(user));
}

const PatchInput = z.object({
  name: z.string().trim().min(1).max(60).optional().nullable(),
  username: z.string().optional().nullable(),
  onboardingCompleted: z.boolean().optional(),
  /** Key de R2 devuelta por POST /api/account/avatar; null = quitar foto. */
  image: z.string().max(300).optional().nullable(),
});

/**
 * PATCH /api/account — actualizar nombre visible y/o @username. El alias se
 * normaliza y valida (formato + reservados); unicidad en BBDD (409 si tomado).
 */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = PatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data: {
    name?: string | null;
    username?: string | null;
    image?: string | null;
    onboardingCompletedAt?: Date;
  } = {};
  if (parsed.data.name !== undefined) {
    // El @alias ya filtra reservados; el nombre visible es texto libre → mismo
    // filtro anti-suplantación (que nadie se ponga "NIDOKEY" et al.).
    if (parsed.data.name && isProtectedName(parsed.data.name)) {
      return NextResponse.json({ error: "name_reserved" }, { status: 400 });
    }
    data.name = parsed.data.name;
  }
  if (parsed.data.onboardingCompleted === true) data.onboardingCompletedAt = new Date();

  if (parsed.data.image !== undefined) {
    if (parsed.data.image === null || parsed.data.image === "") {
      data.image = null; // quitar foto (vuelve a iniciales)
    } else if (parsed.data.image.startsWith(`avatars/${userId}/`)) {
      data.image = parsed.data.image; // solo keys PROPIAS (presignadas por /avatar)
    } else {
      return NextResponse.json({ error: "Imagen no válida" }, { status: 400 });
    }
  }

  if (parsed.data.username !== undefined) {
    if (parsed.data.username === null || parsed.data.username === "") {
      data.username = null; // quitar alias
    } else {
      const err = usernameError(parsed.data.username);
      if (err) return NextResponse.json({ error: "username_" + err }, { status: 400 });
      data.username = normalizeUsername(parsed.data.username);
    }
  }

  // Si se cambia/quita la foto, el avatar ANTERIOR se borra de R2 tras
  // responder (after, fire-and-forget) — si no, cada cambio dejaba un objeto
  // huérfano para siempre (el cron de limpieza es solo la red de seguridad).
  let oldImage: string | null = null;
  if (data.image !== undefined) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
    oldImage = current?.image ?? null;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, username: true, image: true, onboardingCompletedAt: true },
    });
    if (oldImage && oldImage.startsWith(`avatars/${userId}/`) && oldImage !== user.image) {
      const stale = oldImage;
      after(async () => {
        const ok = await deleteObject(stale);
        if (!ok) console.error(`[account] no se pudo borrar el avatar anterior de R2: ${stale}`);
      });
    }
    return NextResponse.json(profileDto(user));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    throw e;
  }
}

/**
 * DELETE /api/account — eliminación de cuenta (RGPD + requisito de tiendas).
 *
 * Borrado explícito de todo lo que NO cae en cascada (los registros tienen
 * owner con SetNull para no perder datos en borrados accidentales de FK; aquí
 * el borrado es intencional y debe ser total). Secuencial e idempotente: si
 * algo falla a mitad, repetir la llamada continúa donde quedó (el usuario se
 * borra en el último paso, así el JWT sigue siendo válido para reintentar).
 *
 * Se CONSERVA anonimizado: pedidos de comida (histórico contable; customerId
 * pasa a null por FK y se depura el snapshot de dirección), mensajes de chat
 * en conversaciones ajenas (senderId a null, estilo WhatsApp) y los eventos de
 * analítica (userId a null: el agregado sobrevive sin identidad).
 */
export async function DELETE() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, image: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Registros (owner SetNull → borrado explícito; los hijos caen en cascada).
  await prisma.property.deleteMany({ where: { ownerId: userId } });
  await prisma.cryptoHolding.deleteMany({ where: { ownerId: userId } });
  await prisma.marketInstrument.deleteMany({ where: { ownerId: userId } });
  await prisma.jobListing.deleteMany({ where: { ownerId: userId } });
  await prisma.bookRecord.deleteMany({ where: { ownerId: userId } });
  await prisma.holiday.deleteMany({ where: { ownerId: userId } });
  await prisma.savedSearch.deleteMany({ where: { ownerId: userId } });
  await prisma.recordDuplicateDismissal.deleteMany({ where: { ownerId: userId } });
  await prisma.recordShare.deleteMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
  });

  // Pedidos: depurar el snapshot de dirección (dato personal); el resto queda
  // como histórico anonimizado.
  await prisma.foodOrder.updateMany({
    where: { customerId: userId },
    data: { deliveryAddress: "[eliminado]", deliveryCity: null, deliveryLat: 0, deliveryLng: 0, deliveryNotes: null },
  });
  // courierId y FoodOrderEvent.actorId son String? SIN FK (no hay cascada):
  // anonimizarlos a mano o el id del usuario borrado queda en el histórico.
  await prisma.foodOrder.updateMany({ where: { courierId: userId }, data: { courierId: null } });
  await prisma.foodOrderEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });

  // Analítica: anonimizar (el embudo agregado sobrevive sin identidad).
  await prisma.analyticsEvent.updateMany({ where: { userId }, data: { userId: null } });

  await prisma.verificationToken.deleteMany({ where: { identifier: user.email } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: userId } } });

  // Chat RGPD: (1) los ADJUNTOS del usuario (fotos/notas de voz) son dato
  // personal — borrar las filas ahora (sus keys llevan el prefijo del usuario y
  // los objetos R2 se borran por prefijo fuera del camino crítico); (2) el DM
  // con el bot contiene su historial privado de consultas y ningún otro humano:
  // borrarlo entero (los DMs/grupos con otras personas se conservan
  // anonimizados, estilo WhatsApp).
  await prisma.chatAttachment.deleteMany({ where: { message: { senderId: userId } } });
  await prisma.conversation.deleteMany({
    where: {
      kind: "DIRECT",
      participants: { some: { userId } },
      AND: { participants: { every: { userId: { in: [userId, NIDOKEY_BOT_ID] } } } },
    },
  });

  // Usuario: la cascada borra sesiones, ApiToken, devices, contactos, bloqueos,
  // participaciones de chat, reacciones, direcciones, suscripción y perfiles
  // courier/staff.
  await prisma.user.delete({ where: { id: userId } });

  // R2 fuera del camino crítico: avatar + TODOS los objetos de chat del usuario
  // (prefijo chat/u/<userId>/). El cron de huérfanos es la red de seguridad.
  const image = user.image;
  after(async () => {
    if (image && image.startsWith("avatars/")) await deleteObject(image);
    const objects = await listObjects(`chat/u/${userId}/`);
    await Promise.allSettled(objects.map((o) => deleteObject(o.key)));
  });

  // Limitación documentada: el JWT móvil es stateless y no se puede revocar;
  // tras el borrado resuelve a un usuario inexistente (lecturas vacías, 4xx).
  return NextResponse.json({ ok: true });
}
