import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RecordType } from "@nidokey/shared";
import { normalizeUsername } from "@nidokey/shared";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { anyBlockBetween } from "@/lib/chat/guard";
import { deliverRecordCard } from "@/lib/chat/context-events";
import { ownsRecord, recordTitle } from "@/lib/records/access";

type Ctx = { params: Promise<{ id: string }> };

const RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;

const Body = z.object({
  type: z.enum(RECORD_TYPES),
  username: z.string().min(1),
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
  const { type, username } = parsed.data;

  if (!(await ownsRecord(type, id, fromUserId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
  const conversationId = await deliverRecordCard(fromUserId, target.id, type, id, await recordTitle(type, id));

  return NextResponse.json({
    ok: true,
    sharedWith: { username: target.username, name: target.name },
    conversationId,
  });
}
