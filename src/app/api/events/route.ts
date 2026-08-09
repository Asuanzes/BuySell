import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

export type EventsCursor = { observedAt: Date; id: string };

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

  const rows = await prisma.recordEvent.findMany({
    where: {
      userId,
      ...(cursor
        ? {
            OR: [
              { observedAt: { lt: cursor.observedAt } },
              { observedAt: cursor.observedAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
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
