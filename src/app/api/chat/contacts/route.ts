import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { userDto } from "@/lib/chat/serialize";

const USER_SELECT = { id: true, name: true, username: true, email: true, image: true } as const;

function contactDto(c: {
  contactUserId: string;
  alias: string | null;
  createdAt: Date;
  contactUser: { id: string; name: string | null; username: string | null; email: string; image: string | null };
}) {
  return {
    userId: c.contactUserId,
    alias: c.alias,
    // withEmail: son MIS contactos guardados (los añadí conociendo su dato).
    user: userDto(c.contactUser, { withEmail: true }),
    createdAt: c.createdAt.toISOString(),
  };
}

/** GET /api/chat/contacts — mi agenda de contactos guardados. */
export async function GET() {
  const userId = await requireUserId();
  const contacts = await prisma.contact.findMany({
    where: { ownerId: userId },
    include: { contactUser: { select: USER_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ contacts: contacts.map(contactDto) });
}

const SaveInput = z.object({
  userId: z.string().min(1),
  alias: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

/** POST — guardar contacto (upsert: repetir actualiza el alias). */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = SaveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { userId: contactUserId, alias } = parsed.data;
  if (contactUserId === userId) {
    return NextResponse.json({ error: "No puedes guardarte a ti mismo" }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.upsert({
      where: { ownerId_contactUserId: { ownerId: userId, contactUserId } },
      // Solo pisar el alias al actualizar si viene en el body (permite re-guardar sin perderlo).
      create: { ownerId: userId, contactUserId, alias },
      update: alias !== null ? { alias } : {},
      include: { contactUser: { select: USER_SELECT } },
    });
    return NextResponse.json(contactDto(contact), { status: 201 });
  } catch (e) {
    // FK rota = el usuario destino no existe.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    throw e;
  }
}

const DeleteInput = z.object({ userId: z.string().min(1) });

/** DELETE — quitar de contactos. Idempotente. */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = DeleteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.contact.deleteMany({
    where: { ownerId: userId, contactUserId: parsed.data.userId },
  });
  return NextResponse.json({ ok: true });
}
