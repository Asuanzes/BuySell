import { Prisma } from "@prisma/client";
import type { RecordType } from "@nidokey/shared";

import { prisma } from "@/lib/db";

const RETENTION_PER_USER = 500;

export type RecordEventPayload = Record<string, unknown> & {
  recordTitle: string;
  recordStatus: string | null;
  href: string;
};

export type CreateRecordEventInput = {
  userId: string | null | undefined;
  recordType: RecordType;
  recordId: string;
  eventType: string;
  source: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  observedAt?: Date;
};

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function valueTransitionKey(prefix: string, id: string, observedAt: Date, prevCents: number | null, newCents: number | null): string {
  return `${prefix}:${id}:${utcDay(observedAt)}:${prevCents ?? "null"}->${newCents ?? "null"}`;
}

export function alertEventKey(alertId: string, now: Date): string {
  return `alert:${alertId}:${utcDay(now)}`;
}

export function visitPreparedEventKey(recordId: string, now: Date): string {
  return `visit-prep:${recordId}:${utcDay(now)}`;
}

export function tripPreparedEventKey(recordId: string, now: Date): string {
  return `trip-prep:${recordId}:${utcDay(now)}`;
}

export function recheckEventKey(listingId: string, observedAt: Date, prevCents: number | null, newCents: number | null): string {
  return `recheck:${listingId}:${observedAt.toISOString()}:${prevCents ?? "null"}->${newCents ?? "null"}`;
}

export function manualImportEventKey(recordType: RecordType, recordId: string, prevCents: number | null, newCents: number | null): string {
  return `import:${recordType}:${recordId}:${prevCents ?? "null"}->${newCents ?? "null"}`;
}

export function shareEventKey(recordType: RecordType, recordId: string, to: string): string {
  return `share:${recordType}:${recordId}:${to}`;
}

export function recordHref(recordType: RecordType, recordId: string): string {
  return `/records/${encodeURIComponent(recordId)}?type=${encodeURIComponent(recordType)}`;
}

export function denormalizeRecordEventPayload(
  recordType: RecordType,
  recordId: string,
  record: { title?: string | null; status?: string | null } | null,
  payload: Record<string, unknown> = {}
): RecordEventPayload {
  const out = {
    ...payload,
    recordTitle: record?.title || "Registro",
    recordStatus: record?.status ?? null,
    href: recordHref(recordType, recordId),
  };
  return JSON.parse(JSON.stringify(out)) as RecordEventPayload;
}

async function loadRecordSummary(recordType: RecordType, recordId: string): Promise<{ title: string | null; status: string | null } | null> {
  const select = { title: true, status: true };
  if (recordType === "crypto") return prisma.cryptoHolding.findUnique({ where: { id: recordId }, select });
  if (recordType === "market") return prisma.marketInstrument.findUnique({ where: { id: recordId }, select });
  if (recordType === "job") return prisma.jobListing.findUnique({ where: { id: recordId }, select });
  if (recordType === "book") return prisma.bookRecord.findUnique({ where: { id: recordId }, select });
  if (recordType === "holiday") return prisma.holiday.findUnique({ where: { id: recordId }, select });
  return prisma.property.findUnique({ where: { id: recordId }, select });
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function trimRecordEvents(userId: string): Promise<void> {
  try {
    const stale = await prisma.recordEvent.findMany({
      where: { userId },
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      skip: RETENTION_PER_USER,
      take: 100,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.recordEvent.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
    }
  } catch (err) {
    console.error("[record-events] retention failed:", err);
  }
}

export async function createRecordEvent(input: CreateRecordEventInput): Promise<void> {
  if (!input.userId) return;
  try {
    const observedAt = input.observedAt ?? new Date();
    const record = await loadRecordSummary(input.recordType, input.recordId);
    await prisma.recordEvent.create({
      data: {
        userId: input.userId,
        recordType: input.recordType,
        recordId: input.recordId,
        eventType: input.eventType,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        payload: denormalizeRecordEventPayload(input.recordType, input.recordId, record, input.payload) as Prisma.InputJsonValue,
        observedAt,
      },
    });
    await trimRecordEvents(input.userId);
  } catch (err) {
    if (isUniqueConflict(err)) return;
    console.error("[record-events] create failed:", err);
  }
}
