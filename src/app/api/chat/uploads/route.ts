import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helpers";
import { allowedMimesFor, CHAT_FLAGS, maxAttachmentBytes } from "@/lib/chat/config";
import { presignPut, r2Enabled } from "@/lib/chat/r2";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/chat/uploads — presigned PUT a R2 para un adjunto del chat.
 * El móvil sube DIRECTO a R2 (el fichero nunca pasa por Vercel) y luego envía
 * el mensaje con la `key`. Bucket privado: la key queda namespaced por usuario
 * (`chat/u/<userId>/…`) y el endpoint de mensajes verifica ese prefijo.
 */

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/3gpp": "3gp",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

const Input = z.object({
  kind: z.enum(["IMAGE", "FILE", "AUDIO"]),
  mime: z.string().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive(),
  fileName: z.string().trim().max(180).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const userId = await requireUserId();

  if (!r2Enabled()) {
    return NextResponse.json({ error: "Adjuntos no disponibles (R2 sin configurar)" }, { status: 503 });
  }

  // Cuota: cada presign puede acabar en un objeto que vive días en R2 (coste).
  const limit = await rateLimit("chat-upload", userId, { limit: 120, windowMs: 3600_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiadas subidas, espera un rato" }, { status: 429 });
  }
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { kind, mime, sizeBytes, fileName } = parsed.data;

  if (kind === "AUDIO" && !CHAT_FLAGS.voice) {
    return NextResponse.json({ error: "Notas de voz desactivadas" }, { status: 403 });
  }
  if (!CHAT_FLAGS.attachments) {
    return NextResponse.json({ error: "Adjuntos desactivados" }, { status: 403 });
  }
  const mimeLc = mime.toLowerCase();
  if (!allowedMimesFor(kind).includes(mimeLc)) {
    return NextResponse.json({ error: `Tipo no admitido (${mimeLc})` }, { status: 400 });
  }
  if (sizeBytes > maxAttachmentBytes(kind)) {
    return NextResponse.json({ error: "Archivo demasiado grande" }, { status: 413 });
  }

  // Extensión por MIME; si no, por el nombre original SANEADA (solo [a-z0-9]:
  // un fileName "x.a/b" no debe crear pseudo-directorios en la key); si no, "bin".
  const fromName = fileName?.includes(".")
    ? fileName.split(".").pop()!.toLowerCase().slice(0, 8).replace(/[^a-z0-9]/g, "")
    : "";
  const ext = EXT_BY_MIME[mimeLc] ?? (fromName || "bin");
  const key = `chat/u/${userId}/${Date.now().toString(36)}${randomBytes(8).toString("hex")}.${ext}`;

  const uploadUrl = await presignPut(key, mimeLc);
  return NextResponse.json({ key, uploadUrl, maxBytes: maxAttachmentBytes(kind) }, { status: 201 });
}
