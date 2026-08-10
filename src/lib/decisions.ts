import { Prisma, type Decision, type DecisionItem } from "@prisma/client";
import type { BaseRecord } from "@nidokey/shared";

import {
  bookToBaseRecord,
  cryptoToBaseRecord,
  holidayToBaseRecord,
  jobToBaseRecord,
  marketToBaseRecord,
  propertyToBaseRecord,
} from "@/lib/records/mapper";

export const MAX_OPEN_DECISIONS = 10;
export const MAX_DECISION_ITEMS = 20;
export const DECISION_STATUSES = ["open", "archived"] as const;
export const DECISION_RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type DecisionRecordType = (typeof DECISION_RECORD_TYPES)[number];

export class DecisionApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
  }
}

export function normalizeDecisionTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new DecisionApiError(400, "El titulo es obligatorio");
  }
  const title = value.trim();
  if (title.length < 1 || title.length > 80) {
    throw new DecisionApiError(400, "El titulo debe tener entre 1 y 80 caracteres");
  }
  return title;
}

export function normalizeDecisionStatus(value: unknown, fallback: DecisionStatus = "open"): DecisionStatus {
  const status = value == null ? fallback : value;
  if (status === "open" || status === "archived") return status;
  throw new DecisionApiError(400, "Status invalido: usa open o archived");
}

export function normalizeDecisionRecordType(value: unknown): DecisionRecordType {
  if (typeof value === "string" && (DECISION_RECORD_TYPES as readonly string[]).includes(value)) {
    return value as DecisionRecordType;
  }
  throw new DecisionApiError(400, "Tipo de registro no soportado para decisiones");
}

export function assertCanCreateDecision(status: DecisionStatus, openCount: number) {
  if (status === "open" && openCount >= MAX_OPEN_DECISIONS) {
    throw new DecisionApiError(409, "Ya tienes 10 decisiones abiertas; archiva una antes de crear otra");
  }
}

export function assertCanAddDecisionItem(itemCount: number) {
  if (itemCount >= MAX_DECISION_ITEMS) {
    throw new DecisionApiError(400, "Una decision puede tener como maximo 20 items");
  }
}

export function assertOwnedDecision<T extends { userId: string } | null>(decision: T, userId: string): NonNullable<T> {
  if (!decision || decision.userId !== userId) {
    throw new DecisionApiError(404, "Not found");
  }
  return decision;
}

export function isPrismaUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function changedCountFromEvents(
  items: Pick<DecisionItem, "recordType" | "recordId">[],
  events: { recordType: string; recordId: string; observedAt: Date }[],
  baseline: Date
) {
  const keys = new Set(items.map((item) => `${item.recordType}\0${item.recordId}`));
  return events.filter((event) => event.observedAt > baseline && keys.has(`${event.recordType}\0${event.recordId}`)).length;
}

export type DecisionListItem = {
  id: string;
  title: string;
  status: string;
  itemCount: number;
  changedCount: number;
  lastVisitedAt: Date | null;
  updatedAt: Date;
};

type ChangedRow = { decisionId: string; changedCount: bigint | number };

export function applyChangedCounts(
  decisions: (Decision & { _count: { items: number } })[],
  rows: ChangedRow[]
): DecisionListItem[] {
  const counts = new Map(rows.map((row) => [row.decisionId, Number(row.changedCount)]));
  return decisions.map((decision) => ({
    id: decision.id,
    title: decision.title,
    status: decision.status,
    itemCount: decision._count.items,
    changedCount: counts.get(decision.id) ?? 0,
    lastVisitedAt: decision.lastVisitedAt,
    updatedAt: decision.updatedAt,
  }));
}

export async function loadBaseRecordsForItems(
  db: {
    property: { findMany(args: unknown): Promise<unknown[]> };
    cryptoHolding: { findMany(args: unknown): Promise<unknown[]> };
    marketInstrument: { findMany(args: unknown): Promise<unknown[]> };
    jobListing: { findMany(args: unknown): Promise<unknown[]> };
    bookRecord: { findMany(args: unknown): Promise<unknown[]> };
    holiday: { findMany(args: unknown): Promise<unknown[]> };
  },
  userId: string,
  items: Pick<DecisionItem, "recordType" | "recordId">[]
): Promise<Map<string, BaseRecord>> {
  const idsByType = new Map<DecisionRecordType, string[]>();
  for (const item of items) {
    const type = normalizeDecisionRecordType(item.recordType);
    idsByType.set(type, [...(idsByType.get(type) ?? []), item.recordId]);
  }

  const recordMap = new Map<string, BaseRecord>();
  const remember = (type: DecisionRecordType, records: BaseRecord[]) => {
    for (const record of records) recordMap.set(`${type}\0${record.id}`, record);
  };

  const propertyIds = idsByType.get("property");
  if (propertyIds?.length) {
    const rows = await db.property.findMany({
      where: { id: { in: propertyIds }, ownerId: userId },
      include: { media: { take: 1, where: { kind: "PHOTO" }, orderBy: { order: "asc" } } },
    });
    remember("property", rows.map((row) => propertyToBaseRecord(row as Parameters<typeof propertyToBaseRecord>[0])));
  }

  const cryptoIds = idsByType.get("crypto");
  if (cryptoIds?.length) {
    const rows = await db.cryptoHolding.findMany({ where: { id: { in: cryptoIds }, ownerId: userId } });
    remember("crypto", rows.map((row) => cryptoToBaseRecord(row as Parameters<typeof cryptoToBaseRecord>[0])));
  }

  const marketIds = idsByType.get("market");
  if (marketIds?.length) {
    const rows = await db.marketInstrument.findMany({ where: { id: { in: marketIds }, ownerId: userId } });
    remember("market", rows.map((row) => marketToBaseRecord(row as Parameters<typeof marketToBaseRecord>[0])));
  }

  const jobIds = idsByType.get("job");
  if (jobIds?.length) {
    const rows = await db.jobListing.findMany({ where: { id: { in: jobIds }, ownerId: userId } });
    remember("job", rows.map((row) => jobToBaseRecord(row as Parameters<typeof jobToBaseRecord>[0])));
  }

  const bookIds = idsByType.get("book");
  if (bookIds?.length) {
    const rows = await db.bookRecord.findMany({ where: { id: { in: bookIds }, ownerId: userId } });
    remember("book", rows.map((row) => bookToBaseRecord(row as Parameters<typeof bookToBaseRecord>[0])));
  }

  const holidayIds = idsByType.get("holiday");
  if (holidayIds?.length) {
    const rows = await db.holiday.findMany({ where: { id: { in: holidayIds }, ownerId: userId } });
    remember("holiday", rows.map((row) => holidayToBaseRecord(row as Parameters<typeof holidayToBaseRecord>[0])));
  }

  return recordMap;
}
