import { api } from "@/lib/api";
import { MANAGED_RECORD_TYPES, isRecordType } from "@/lib/records/category-prefs";
import type { RecordType } from "@nidokey/shared";
import { eventTitleFromPayload, type RecordEventPayload } from "./events-format";
import { buildEventsQueryParams, type EventRecordFilter } from "./events-params";

export {
  eventTimeAgo,
  formatRecordEventDescription,
  type RecordEventPayload,
} from "./events-format";
export {
  buildEventsQueryParams,
  eventScreenTitleKey,
  validEventRecordFilter,
  type EventRecordFilter,
} from "./events-params";

export type RecordEventDto = {
  id: string;
  recordType: string;
  recordId: string;
  eventType: string;
  source: string;
  payload: RecordEventPayload;
  observedAt: string;
};

export type EventsPage = {
  items: RecordEventDto[];
  nextCursor: string | null;
};

const MANAGED_EVENT_TYPES = new Set<RecordType>([...MANAGED_RECORD_TYPES, "chat"]);

export function fetchEvents(
  cursor?: string | null,
  limit = 30,
  filter?: EventRecordFilter | null
): Promise<EventsPage> {
  const qs = buildEventsQueryParams(cursor, limit, filter);
  return api<EventsPage>(`/api/events?${qs}`);
}

export function isVisibleRecordEvent(
  event: Pick<RecordEventDto, "recordType">,
  visibleTypes: readonly RecordType[]
): event is RecordEventDto & { recordType: RecordType } {
  if (!isRecordType(event.recordType)) return false;
  return MANAGED_EVENT_TYPES.has(event.recordType) && visibleTypes.includes(event.recordType);
}

export function eventTitle(event: RecordEventDto): string {
  return eventTitleFromPayload(event.payload);
}
