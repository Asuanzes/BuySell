import type { BaseRecord, RecordType } from "@nidokey/shared";

export type BotRecordActionMode = "counterpoint" | "visit";

const EXCLUDED_VISIT_STATUSES = new Set(["SOLD", "RETIRED"]);

export function buildCounterpointMessage(records: Pick<BaseRecord, "title">[]): string {
  return `Compara estos ${records.length} registros: ${records.map((r) => r.title).join(", ")}`;
}

export function buildVisitMessage(record: Pick<BaseRecord, "title">): string {
  return `Prepara una visita para: ${record.title}`;
}

export function eligibleCounterpointTypes(records: Pick<BaseRecord, "type">[]): RecordType[] {
  const counts = new Map<RecordType, number>();
  for (const record of records) counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([type]) => type);
}

export function availableVisitProperties<T extends Pick<BaseRecord, "type" | "status">>(records: T[]): T[] {
  return records.filter((record) => record.type === "property" && !EXCLUDED_VISIT_STATUSES.has((record.status ?? "").toUpperCase()));
}
