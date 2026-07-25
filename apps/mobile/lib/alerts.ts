import { api } from "./api";

/**
 * Cliente de alertas de precio. El servidor manda: valida la pertenencia del
 * registro, aplica la cuota del plan y rechaza condiciones que ya se cumplen.
 */

export type AlertKind = "PRICE_BELOW" | "PRICE_ABOVE" | "PRICE_DROP_PCT" | "STATUS_CHANGE";

export type PriceAlert = {
  id: string;
  recordType: string;
  recordId: string;
  kind: AlertKind;
  field: "price" | "rent" | string;
  threshold: number | null;
  baselineCents: number | null;
  active: boolean;
  oneShot: boolean;
  lastFiredAt: string | null;
  createdAt: string;
};

export type AlertsResponse = { alerts: PriceAlert[]; limit: number; activeCount: number };

export const listAlerts = (recordType?: string, recordId?: string) => {
  const qs = new URLSearchParams();
  if (recordType) qs.set("recordType", recordType);
  if (recordId) qs.set("recordId", recordId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AlertsResponse>(`/api/alerts${suffix}`);
};

export const createAlert = (input: {
  recordType: string;
  recordId: string;
  kind: AlertKind;
  field?: "price" | "rent";
  threshold?: number;
}) => api<{ alert: PriceAlert }>("/api/alerts", { method: "POST", body: JSON.stringify(input) });

/** Rearmar (active=true, refresca la referencia) o desactivar. */
export const setAlertActive = (id: string, active: boolean) =>
  api<{ alert: PriceAlert }>(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });

export const deleteAlert = (id: string) => api<{ ok: true }>(`/api/alerts/${id}`, { method: "DELETE" });
