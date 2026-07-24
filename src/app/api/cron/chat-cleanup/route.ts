import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { CHAT_RETENTION_DAYS } from "@/lib/chat/config";
import { deleteObject, listObjects, r2Enabled } from "@/lib/chat/r2";
import { cleanupRateLimits } from "@/lib/rate-limit";

/**
 * GET /api/cron/chat-cleanup — limpieza del ciclo de vida del chat (F6).
 * Disparado semanalmente por GitHub Actions con `Authorization: Bearer
 * $CRON_SECRET` (mismo patrón que /api/cron/refresh). Idempotente y por lotes.
 *
 * Hace tres cosas:
 *  1. RETENCIÓN: si CHAT_RETENTION_DAYS está configurada, purga FÍSICAMENTE los
 *     mensajes con borrado suave (deletedAt) más viejos que la ventana,
 *     borrando ANTES sus objetos de R2 (los ChatAttachment caen en cascada).
 *     Sin la env, no purga nada (default actual: conservar para siempre).
 *  2. HUÉRFANOS R2: objetos `chat/u/` sin ChatAttachment que los referencie
 *     (subidas presignadas cuyo mensaje nunca se envió) y `avatars/` que ningún
 *     User.image usa (fotos de perfil sustituidas antes del borrado en PATCH).
 *     Solo borra objetos con más de 7 días (jamás una subida en curso).
 *  3. TOKENS: VerificationToken caducados (OTPs/magic-links nunca canjeados).
 */
export const maxDuration = 300;

const BATCH = 1000; // tope de borrados por ejecución (no estresar Neon/R2)
const ORPHAN_MIN_AGE_MS = 7 * 24 * 3600 * 1000;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const summary = {
    retention: { enabled: CHAT_RETENTION_DAYS != null, messagesPurged: 0, r2Deleted: 0 },
    orphans: { r2Enabled: r2Enabled(), chatDeleted: 0, avatarsDeleted: 0 },
    tokensDeleted: 0,
    rateLimitsDeleted: 0,
  };

  try {
    // ── 1. Retención: purga física de soft-deleted viejos ──────────────────
    if (CHAT_RETENTION_DAYS != null) {
      const cutoff = new Date(Date.now() - CHAT_RETENTION_DAYS * 86400_000);
      // `deletedAt < cutoff` solo casa con no-NULL: únicamente mensajes ya
      // borrados en suave cuya ventana de retención expiró.
      const victims = await prisma.chatMessage.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, attachments: { select: { url: true } } },
        take: BATCH,
      });
      for (const m of victims) {
        for (const a of m.attachments) {
          if (!/^https?:\/\//i.test(a.url) && (await deleteObject(a.url))) {
            summary.retention.r2Deleted++;
          }
        }
      }
      if (victims.length) {
        const del = await prisma.chatMessage.deleteMany({ where: { id: { in: victims.map((m) => m.id) } } });
        summary.retention.messagesPurged = del.count; // attachments en cascada
      }
    }

    // ── 2. Huérfanos en R2 ──────────────────────────────────────────────────
    if (r2Enabled()) {
      const cutoffTs = Date.now() - ORPHAN_MIN_AGE_MS;

      // chat/u/: subidas presignadas sin ChatAttachment (mensaje nunca enviado).
      const chatObjects = await listObjects("chat/u/");
      const oldChatKeys = chatObjects
        .filter((o) => o.lastModified && o.lastModified.getTime() < cutoffTs)
        .map((o) => o.key);
      outer: for (let i = 0; i < oldChatKeys.length; i += 200) {
        const chunk = oldChatKeys.slice(i, i + 200);
        const referenced = await prisma.chatAttachment.findMany({
          where: { url: { in: chunk } },
          select: { url: true },
        });
        const refSet = new Set(referenced.map((r) => r.url));
        for (const key of chunk) {
          if (refSet.has(key)) continue;
          if (await deleteObject(key)) summary.orphans.chatDeleted++;
          if (summary.orphans.chatDeleted >= BATCH) break outer;
        }
      }

      // avatars/: fotos de perfil que ya nadie referencia.
      const avatarObjects = await listObjects("avatars/");
      const oldAvatarKeys = avatarObjects
        .filter((o) => o.lastModified && o.lastModified.getTime() < cutoffTs)
        .map((o) => o.key);
      if (oldAvatarKeys.length) {
        const used = new Set(
          (
            await prisma.user.findMany({
              where: { image: { startsWith: "avatars/" } },
              select: { image: true },
            })
          ).map((u) => u.image)
        );
        for (const key of oldAvatarKeys) {
          if (used.has(key)) continue;
          if (await deleteObject(key)) summary.orphans.avatarsDeleted++;
          if (summary.orphans.avatarsDeleted >= BATCH) break;
        }
      }
    }

    // ── 3. VerificationToken caducados ──────────────────────────────────────
    const tokens = await prisma.verificationToken.deleteMany({
      where: { expires: { lt: new Date() } },
    });
    summary.tokensDeleted = tokens.count;

    // ── 4. Ventanas de rate limit ya cerradas ───────────────────────────────
    summary.rateLimitsDeleted = await cleanupRateLimits();

    console.log(
      `[chat-cleanup] purged=${summary.retention.messagesPurged} r2=${summary.retention.r2Deleted} ` +
        `orphans(chat=${summary.orphans.chatDeleted}, avatars=${summary.orphans.avatarsDeleted}) tokens=${summary.tokensDeleted}`
    );
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[chat-cleanup] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno", partial: summary },
      { status: 500 }
    );
  }
}
