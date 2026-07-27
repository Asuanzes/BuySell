import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { CHAT_MIME_ALLOW } from "@/lib/chat/config";
import { getParticipantOrNull } from "@/lib/chat/guard";
import { presignPut, r2Enabled } from "@/lib/chat/r2";

/**
 * POST /api/chat/conversations/:id/avatar — presigned PUT a R2 para la foto del
 * GRUPO. Mismo flujo que el avatar de persona: presign → PUT directo a R2 →
 * PATCH de la conversación con la key. Solo OWNER/ADMIN, igual que renombrar.
 *
 * La lectura es pública y va por otro sitio: GET /api/avatar/group/:id.
 */

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/gif": "gif",
};

const Input = z.object({
  mime: z.string().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();

  const me = await getParticipantOrNull(id, userId);
  // 404 uniforme: no se confirma la existencia de conversaciones ajenas.
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const conversation = await prisma.conversation.findUnique({ where: { id }, select: { kind: true } });
  if (!conversation || conversation.kind !== "GROUP") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (me.role === "MEMBER") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  if (!r2Enabled()) {
    return NextResponse.json({ error: "Fotos no disponibles (R2 sin configurar)" }, { status: 503 });
  }
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Petición inválida" }, { status: 400 });

  const mime = parsed.data.mime.toLowerCase();
  if (!CHAT_MIME_ALLOW.IMAGE.includes(mime)) {
    return NextResponse.json({ error: `Tipo no admitido (${mime})` }, { status: 400 });
  }
  if (parsed.data.sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Imagen demasiado grande (máx. 5 MB)" }, { status: 413 });
  }

  // Key con parte aleatoria: el cambio de foto rompe la caché de expo-image
  // (el cliente versiona con ?v=<basename>).
  const ext = EXT_BY_MIME[mime] ?? "jpg";
  const key = `avatars/group/${id}/${Date.now().toString(36)}${randomBytes(6).toString("hex")}.${ext}`;
  const uploadUrl = await presignPut(key, mime);
  return NextResponse.json({ key, uploadUrl }, { status: 201 });
}
