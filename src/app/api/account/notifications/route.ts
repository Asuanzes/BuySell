import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Preferencias de notificación. La AUSENCIA de fila = todo activado y sin
 * horario silencioso, así que el GET devuelve esos valores por defecto sin
 * escribir nada en BBDD.
 *
 * Requisito de tiendas (Apple/Google): el usuario debe poder desactivar las
 * notificaciones desde dentro de la app.
 */
const DEFAULTS = { chatPush: true, alertsPush: true, quietStartHour: null, quietEndHour: null };

export async function GET() {
  const userId = await requireUserId();
  const prefs = await prisma.notificationPrefs.findUnique({
    where: { userId },
    select: { chatPush: true, alertsPush: true, quietStartHour: true, quietEndHour: true },
  });
  return NextResponse.json(prefs ?? DEFAULTS);
}

const Body = z
  .object({
    chatPush: z.boolean().optional(),
    alertsPush: z.boolean().optional(),
    /** Hora local 0-23; null quita la franja. */
    quietStartHour: z.number().int().min(0).max(23).nullable().optional(),
    quietEndHour: z.number().int().min(0).max(23).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "sin cambios" });

export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // La franja se guarda entera o no se guarda: media franja no significa nada.
  if ((data.quietStartHour == null) !== (data.quietEndHour == null)) {
    if (data.quietStartHour !== undefined && data.quietEndHour !== undefined) {
      return NextResponse.json(
        { error: "Indica las dos horas de la franja, o ninguna." },
        { status: 400 }
      );
    }
  }

  const prefs = await prisma.notificationPrefs.upsert({
    where: { userId },
    create: { userId, ...DEFAULTS, ...data },
    update: data,
    select: { chatPush: true, alertsPush: true, quietStartHour: true, quietEndHour: true },
  });
  return NextResponse.json(prefs);
}
