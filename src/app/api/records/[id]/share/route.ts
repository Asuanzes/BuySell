import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";
import { normalizeUsername } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { anyBlockBetween, getParticipantOrNull } from "@/lib/chat/guard";
import { deliverRecordCard, deliverRecordCardToConversation } from "@/lib/chat/context-events";
import { NIDOKEY_BOT_ID } from "@/lib/chat/bot";
import { ownsRecord, recordTitle } from "@/lib/records/access";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;

const Body = z
  .object({
    type: z.enum(RECORD_TYPES),
    /** Destino A: una persona por su @usuario (va a vuestro chat habitual). */
    username: z.string().min(1).optional(),
    /** Destino B: una conversación existente (típicamente un grupo). */
    conversationId: z.string().min(1).optional(),
    /** Mensaje opcional que acompaña a la tarjeta en el chat. */
    message: z.string().trim().max(4000).optional().nullable(),
  })
  .refine((b) => !!b.username !== !!b.conversationId, {
    message: "Indica un destinatario o una conversación, no ambos",
  });

// ownsRecord/recordTitle viven en @/lib/records/access — compartidos con las
// alertas de precio para no tener dos comprobaciones de pertenencia distintas.

/**
 * POST /api/records/:id/share  { type, username }
 *
 * Comparte un registro PROPIO con otro usuario (por su @username): le da acceso de
 * SOLO LECTURA al registro vivo (no es copia). Idempotente vía upsert sobre el
 * unique (recordType, recordId, toUserId). El propietario debe ser el dueño del
 * registro (si no, 404, sin filtrar existencia ajena).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const fromUserId = await requireUserId();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { type, username, conversationId, message } = parsed.data;

  if (!(await ownsRecord(type, id, fromUserId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ─── Destino B: una conversación existente (grupo o directo ya abierto) ───
  if (conversationId) {
    // Participante ACTIVO o 404: nunca se confirma que la conversación exista.
    if (!(await getParticipantOrNull(conversationId, fromUserId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        kind: true,
        title: true,
        participants: { where: { leftAt: null }, select: { userId: true } },
      },
    });
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Esta ruta ESCRIBE en el chat (tarjeta + mensaje libre de hasta 4000
    // caracteres) sin pasar por el límite de mensajes, y además hace fan-out.
    // Cuota propia, más estricta que la del chat justamente por eso.
    const quota = await rateLimit("record-share", fromUserId, { limit: 20, windowMs: 3600_000 });
    if (!quota.ok) {
      return NextResponse.json({ error: "Has compartido demasiado seguido, espera un rato" }, { status: 429 });
    }

    // El bot no es destinatario de nada (no lee registros compartidos).
    let targets = conversation.participants
      .map((p) => p.userId)
      .filter((uid) => uid !== fromUserId && uid !== NIDOKEY_BOT_ID);

    // BLOQUEOS. Sin esto, esta ruta era un camino paralelo para escribir en el
    // chat de quien te ha bloqueado: bloquear no saca a nadie de la
    // conversación, así que el 1:1 sigue vivo y `getParticipantOrNull` lo
    // aprueba. En DIRECT se veta igual que POST /messages; en grupo el mensaje
    // se publica (como cualquier otro) pero el bloqueado no recibe acceso.
    if (targets.length > 0) {
      const blocks = await prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: fromUserId, blockedId: { in: targets } },
            { blockerId: { in: targets }, blockedId: fromUserId },
          ],
        },
        select: { blockerId: true, blockedId: true },
      });
      if (blocks.length > 0) {
        if (conversation.kind === "DIRECT") {
          // 403 genérico: no revelamos quién bloqueó a quién.
          return NextResponse.json({ error: "No disponible" }, { status: 403 });
        }
        const excluded = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
        targets = targets.filter((uid) => !excluded.has(uid));
      }
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: "No hay nadie más en la conversación" }, { status: 400 });
    }

    // Acceso de lectura para CADA miembro actual: `RecordShare` es 1 fila por
    // destinatario y es lo que habilita "Guardar" y la pantalla Compartidos.
    // ⚠️ Quien entre DESPUÉS verá la tarjeta (la regla es que el dueño siga en
    // la conversación) pero no podrá guardarla: no tendrá su fila.
    // `conversationId` deja constancia de DÓNDE se concedió: es lo que permite
    // luego retirar el grupo entero de una vez en "Mis compartidos".
    // skipDuplicates no actualiza los que ya existían (p. ej. compartidos antes
    // en 1:1): conservan su origen original, que es lo correcto.
    await prisma.recordShare.createMany({
      data: targets.map((toUserId) => ({ recordType: type, recordId: id, fromUserId, toUserId, conversationId })),
      skipDuplicates: true,
    });

    const delivered = await deliverRecordCardToConversation(
      conversationId,
      fromUserId,
      type,
      id,
      await recordTitle(type, id),
      message
    );
    // Si la tarjeta no llegó a publicarse, decirlo: los accesos ya están dados
    // y devolver ok:true dejaba al usuario con la hoja cerrada y sin nada.
    if (!delivered) {
      return NextResponse.json({ error: "No se pudo publicar la tarjeta en el chat" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      sharedWith: { name: conversation.title, count: targets.length },
      conversationId: delivered,
    });
  }

  // ─── Destino A: una persona por @usuario ───
  const handle = normalizeUsername(username);
  if (!handle) return NextResponse.json({ error: "Usuario inválido" }, { status: 400 });
  const target = await prisma.user.findUnique({
    where: { username: handle },
    select: { id: true, username: true, name: true },
  });
  if (!target) return NextResponse.json({ error: `No existe el usuario @${handle}` }, { status: 404 });
  if (target.id === fromUserId) {
    return NextResponse.json({ error: "No puedes compartir contigo mismo" }, { status: 400 });
  }
  // Bloqueos: compartir abre (o revive) el chat directo → mismo veto que un
  // mensaje. 403 genérico sin revelar quién bloqueó a quién.
  if (await anyBlockBetween(fromUserId, target.id)) {
    return NextResponse.json({ error: "No disponible" }, { status: 403 });
  }

  await prisma.recordShare.upsert({
    where: { recordType_recordId_toUserId: { recordType: type, recordId: id, toUserId: target.id } },
    create: { recordType: type, recordId: id, fromUserId, toUserId: target.id },
    update: {},
  });

  // La tarjeta va al chat DIRECTO habitual con esa persona (no al DM del bot,
  // no a una conversación aparte por registro): push y tiempo real incluidos.
  const delivered = await deliverRecordCard(
    fromUserId,
    target.id,
    type,
    id,
    await recordTitle(type, id),
    message
  );

  return NextResponse.json({
    ok: true,
    sharedWith: { username: target.username, name: target.name },
    conversationId: delivered,
  });
}
