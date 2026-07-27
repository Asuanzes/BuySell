import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { displayName } from "@/lib/chat/serialize";
import { recordTitle } from "@/lib/records/access";

/**
 * "Mis compartidos": lo que YO he concedido (la pantalla espejo de
 * /api/records/shared, que es lo que me han concedido a mí).
 *
 * Compartir da acceso a la ficha VIVA, no a una copia, así que el usuario
 * necesita poder ver qué ha concedido y retirarlo. Los accesos se agrupan por
 * ORIGEN: una compartición a un grupo de 25 es UNA concesión con 24
 * destinatarios, no 24 filas sueltas.
 */

const RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;

const MAX_GRANTS = 100;

export async function GET() {
  const me = await requireUserId();

  // Agrupar en BBDD, no en memoria: cortando FILAS y agrupando después, las
  // concesiones más antiguas (las que más urge retirar) desaparecían sin aviso
  // y un grupo partido por el corte enseñaba MENOS gente de la que tiene
  // acceso. El recuento sale del agregado, así que siempre es el real.
  const [byGroup, directRows] = await Promise.all([
    prisma.recordShare.groupBy({
      by: ["recordType", "recordId", "conversationId"],
      where: { fromUserId: me, conversationId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: MAX_GRANTS,
    }),
    // Las directas van una por persona: se retiran individualmente.
    prisma.recordShare.findMany({
      where: { fromUserId: me, conversationId: null },
      orderBy: { createdAt: "desc" },
      take: MAX_GRANTS,
      select: { recordType: true, recordId: true, toUserId: true, createdAt: true },
    }),
  ]);
  if (byGroup.length === 0 && directRows.length === 0) {
    return NextResponse.json({ grants: [], truncated: false });
  }

  const conversationIds = byGroup.map((g) => g.conversationId).filter((c): c is string => !!c);
  const recordKeys = [
    ...new Set([
      ...byGroup.map((g) => `${g.recordType}|${g.recordId}`),
      ...directRows.map((r) => `${r.recordType}|${r.recordId}`),
    ]),
  ];

  const [users, conversations, titles] = await Promise.all([
    directRows.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(directRows.map((r) => r.toUserId))] } },
          select: { id: true, name: true, username: true, email: true },
        })
      : Promise.resolve([]),
    conversationIds.length
      ? prisma.conversation.findMany({ where: { id: { in: conversationIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    Promise.all(
      recordKeys.map(async (k) => {
        const [type, id] = k.split("|");
        return [k, await recordTitle(type as RecordType, id)] as const;
      })
    ),
  ]);
  const userById = new Map(users.map((u) => [u.id, displayName(u)]));
  const convById = new Map(conversations.map((c) => [c.id, c.title]));
  const titleByKey = new Map(titles);

  /** "" = el registro ya no existe: fila huérfana, solo para limpiarla. */
  const decorate = (recordType: string, recordId: string) => {
    const title = titleByKey.get(`${recordType}|${recordId}`) ?? "";
    return { title, exists: title !== "" };
  };

  const grants = [
    ...byGroup.map((g) => ({
      key: `${g.recordType}|${g.recordId}|c:${g.conversationId}`,
      recordType: g.recordType,
      recordId: g.recordId,
      ...decorate(g.recordType, g.recordId),
      conversationId: g.conversationId,
      conversationTitle: g.conversationId ? convById.get(g.conversationId) ?? null : null,
      toUserId: null as string | null,
      recipientName: null as string | null,
      recipientCount: g._count._all,
      createdAt: (g._max.createdAt ?? new Date(0)).toISOString(),
    })),
    ...directRows.map((r) => ({
      key: `${r.recordType}|${r.recordId}|u:${r.toUserId}`,
      recordType: r.recordType,
      recordId: r.recordId,
      ...decorate(r.recordType, r.recordId),
      conversationId: null as string | null,
      conversationTitle: null as string | null,
      toUserId: r.toUserId,
      recipientName: userById.get(r.toUserId) ?? "—",
      recipientCount: 1,
      createdAt: r.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    grants,
    // Si se llegó al tope, decirlo: es una pantalla de control, callarlo
    // equivaldría a esconder accesos vivos.
    truncated: byGroup.length === MAX_GRANTS || directRows.length === MAX_GRANTS,
  });
}

const RevokeInput = z.object({
  recordType: z.enum(RECORD_TYPES),
  recordId: z.string().min(1),
  /** Retirar todo lo concedido en esa conversación (grupo). */
  conversationId: z.string().min(1).optional().nullable(),
  /** Retirar a una persona concreta. Si no viene ninguno de los dos: todo. */
  toUserId: z.string().min(1).optional(),
});

/**
 * DELETE /api/records/shares — retira accesos que YO concedí.
 *
 * Corta el acceso a la ficha viva. NO deshace una copia que el destinatario ya
 * se hubiera guardado con "Guardar": esa copia es suya y es independiente (la
 * UI no debe prometer lo contrario).
 */
export async function DELETE(req: NextRequest) {
  const me = await requireUserId();
  const parsed = RevokeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  const { recordType, recordId, conversationId, toUserId } = parsed.data;

  const res = await prisma.recordShare.deleteMany({
    where: {
      // Solo lo MÍO: nadie retira accesos que concedió otro.
      fromUserId: me,
      recordType,
      recordId,
      ...(toUserId ? { toUserId } : {}),
      ...(conversationId ? { conversationId } : {}),
    },
  });
  return NextResponse.json({ ok: true, revoked: res.count });
}
