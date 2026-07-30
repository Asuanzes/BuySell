import type { ImportLogKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Log de eventos de background (geocode, matching, merge…).
 * Pensado para visibilidad en UI (/activity) y debug operativo.
 *
 * Nunca lanza: si falla la escritura del log, dejamos rastro en consola
 * pero no rompemos el flujo de import.
 */
export async function logImportEvent(
  kind: ImportLogKind,
  opts: {
    propertyId?: string | null;
    ok?: boolean;
    message?: string | null;
    meta?: Prisma.InputJsonValue;
  } = {}
): Promise<void> {
  try {
    await prisma.importLog.create({
      data: {
        kind,
        propertyId: opts.propertyId ?? null,
        ok: opts.ok ?? true,
        message: opts.message ?? null,
        meta: opts.meta ?? undefined,
      },
    });
  } catch (e) {
    console.error("[import-log] write failed:", e, { kind, opts });
  }
}
