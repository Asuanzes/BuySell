import { isRecordType } from "./records/category-prefs";
import type { RecordType } from "@nidokey/shared";

export type EventRecordFilter = {
  recordType?: RecordType | string | null;
  recordId?: string | null;
};

export function buildEventsQueryParams(
  cursor?: string | null,
  limit = 30,
  filter?: EventRecordFilter | null
): string {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  if (filter?.recordType && filter.recordId) {
    qs.set("recordType", filter.recordType);
    qs.set("recordId", filter.recordId);
  }
  return qs.toString();
}

export function validEventRecordFilter(filter: EventRecordFilter): { recordType: RecordType; recordId: string } | null {
  if (!filter.recordType || !filter.recordId || !isRecordType(filter.recordType)) return null;
  return { recordType: filter.recordType, recordId: filter.recordId };
}

export function eventScreenTitleKey(filter: EventRecordFilter): "events.title" | "events.title_record" {
  return validEventRecordFilter(filter) ? "events.title_record" : "events.title";
}
