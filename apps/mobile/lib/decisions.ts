import type { BaseRecord, RecordType } from "@nidokey/shared";

import { api } from "@/lib/api";
import {
  decisionPath,
  normalizeDecisionTitle,
  isValidDecisionTitle,
  formatDecisionBadge,
} from "@/lib/decisions-helpers";

export { decisionPath, normalizeDecisionTitle, isValidDecisionTitle, formatDecisionBadge };

export type DecisionStatus = "open" | "archived";

export type DecisionSummary = {
  id: string;
  title: string;
  status: DecisionStatus;
  itemCount: number;
  changedCount: number;
  lastVisitedAt: string | null;
  updatedAt: string;
};

export type DecisionItem = {
  id?: string;
  recordType: RecordType;
  recordId: string;
  addedAt: string;
  record: BaseRecord | null;
};

export type DecisionDetail = {
  decision: DecisionSummary;
  items: DecisionItem[];
  changedCount: number;
};

export type DecisionListResponse = { items: DecisionSummary[] };

export type DecisionMutationResponse = {
  decision: DecisionSummary;
};

export const ACTIVE_DECISION_RECORD_TYPES = ["property", "crypto", "market", "job", "book", "holiday"] as const;
export type ActiveDecisionRecordType = (typeof ACTIVE_DECISION_RECORD_TYPES)[number];

export function isActiveDecisionRecordType(type: string): type is ActiveDecisionRecordType {
  return (ACTIVE_DECISION_RECORD_TYPES as readonly string[]).includes(type);
}

export async function listDecisions(): Promise<DecisionListResponse> {
  return api<DecisionListResponse>(decisionPath());
}

export async function createDecision(title: string): Promise<DecisionMutationResponse> {
  return api<DecisionMutationResponse>(decisionPath(), {
    method: "POST",
    body: JSON.stringify({ title: normalizeDecisionTitle(title) }),
  });
}

export async function getDecision(id: string): Promise<DecisionDetail> {
  return api<DecisionDetail>(decisionPath(id));
}

export async function updateDecision(
  id: string,
  input: { title?: string; status?: DecisionStatus }
): Promise<DecisionMutationResponse> {
  return api<DecisionMutationResponse>(decisionPath(id), {
    method: "PATCH",
    body: JSON.stringify({
      ...input,
      title: input.title == null ? undefined : normalizeDecisionTitle(input.title),
    }),
  });
}

export async function deleteDecision(id: string): Promise<void> {
  await api(decisionPath(id), { method: "DELETE" });
}

export async function addDecisionItem(
  decisionId: string,
  recordType: ActiveDecisionRecordType,
  recordId: string
): Promise<void> {
  await api(decisionPath(decisionId, "/items"), {
    method: "POST",
    body: JSON.stringify({ recordType, recordId }),
  });
}

export async function removeDecisionItem(
  decisionId: string,
  recordType: RecordType,
  recordId: string
): Promise<void> {
  await api(decisionPath(decisionId, "/items"), {
    method: "DELETE",
    body: JSON.stringify({ recordType, recordId }),
  });
}
