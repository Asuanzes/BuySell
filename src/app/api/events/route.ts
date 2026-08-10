import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { RECORD_TYPES, type BotRecordType } from "@/lib/chat/tool-defs";

export type EventsCursor = { observedAt: Date; id: string };
export type EventsRecordFilter = { recordType: BotRecordType; recordId: string };

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export function clampEventsLimit(raw: string | null): number {
  const n = raw == null ? DEFAULT_LIMIT : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

export function encodeEventsCursor(item: { observedAt: Date; id: string }): string {
  return `${item.observedAt.toISOString()}_${item.id}`;
}

export function parseEventsCursor(raw: string | null): EventsCursor | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf("_");
  if (idx <= 0 || idx === raw.length - 1) return null;
  const observedAt = new Date(raw.slice(0, idx));
  if (Number.isNaN(observedAt.getTime())) return null;
  return { observedAt, id: raw.slice(idx + 1) };
}

export function parseEventsRecordFilter(params: URLSearchParams):
  | { ok: true; filter: EventsRecordFilter | null }
  | { ok: false; error: string } {
  const recordType = params.get("recordType");
  const recordId = params.get("recordId");

  if (!recordType && !recordId) return { ok: true, filter: null };
  if (!recordType || !recordId) {
    return { ok: false, error: "recordType y recordId deben enviarse juntos" };
  }
  if (!(RECORD_TYPES as readonly string[]).includes(recordType)) {
    return { ok: false, error: "recordType no soportado" };
  }
  return { ok: true, filter: { recordType: recordType as BotRecordType, recordId } };
}

export function buildEventsWhere(userId: string, cursor: EventsCursor | null, filter: EventsRecordFilter | null) {
  return {
    userId,
    ...(filter ? { recordType: filter.recordType, recordId: filter.recordId } : {}),
    ...(cursor
      ? {
          OR: [
            { observedAt: { lt: cursor.observedAt } },
            { observedAt: cursor.observedAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
}

export function serializeRecordEvent(e: {
  id: string;
  recordType: string;
  recordId: string;
  eventType: string;
  source: string;
  payload: unknown;
  observedAt: Date;
}) {
  return {
    id: e.id,
    recordType: e.recordType,
    recordId: e.recordId,
    eventType: e.eventType,
    source: e.source,
    payload: e.payload,
    observedAt: e.observedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const limit = clampEventsLimit(req.nextUrl.searchParams.get("limit"));
  const cursor = parseEventsCursor(req.nextUrl.searchParams.get("cursor"));
  const recordFilter = parseEventsRecordFilter(req.nextUrl.searchParams);

  if (!recordFilter.ok) {
    return NextResponse.json({ error: recordFilter.error }, { status: 400 });
  }

  const rows = await prisma.recordEvent.findMany({
    where: buildEventsWhere(userId, cursor, recordFilter.filter),
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      recordType: true,
      recordId: true,
      eventType: true,
      source: true,
      payload: true,
      observedAt: true,
    },
  });

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeEventsCursor(page[page.length - 1]) : null;
  return NextResponse.json({ items: page.map(serializeRecordEvent), nextCursor });
}
