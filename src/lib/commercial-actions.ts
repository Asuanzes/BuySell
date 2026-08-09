import type { RecordType } from "@nidokey/shared";

export const COMMERCIAL_ACTION_EVENTS = {
  view: "commercial_action_view",
  click: "commercial_action_click",
  redirect: "partner_redirect",
  leadSubmitted: "lead_submitted",
  conversionConfirmed: "conversion_confirmed",
  commissionConfirmed: "commission_confirmed",
} as const;

export const TRAVEL_PARTNER_HOSTS = [
  "www.aviasales.com",
  "aviasales.com",
  "nuitee.link",
  "alejandro-suances-isz5h.nuitee.link",
] as const;

export const COMMERCIAL_RECORD_TYPES: RecordType[] = ["holiday"];

export type CommercialActionInput = {
  target: string;
  recordType: RecordType;
  recordId: string;
  attributionId: string;
};

export type CommercialRedirect = {
  attributionId: string;
  targetUrl: string;
  host: string;
  recordType: RecordType;
  recordId: string;
};

export type CommercialEventProps = {
  attributionId: string;
  recordType: RecordType;
  recordId: string;
  host: string;
};

export function isAllowedTravelPartnerHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "www.aviasales.com" ||
    host === "aviasales.com" ||
    host === "nuitee.link" ||
    host.endsWith(".nuitee.link")
  );
}

export function buildCommercialRedirect(input: CommercialActionInput): CommercialRedirect | null {
  if (!COMMERCIAL_RECORD_TYPES.includes(input.recordType)) return null;
  if (!input.recordId.trim()) return null;

  let url: URL;
  try {
    url = new URL(input.target);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !isAllowedTravelPartnerHost(url.hostname)) return null;

  // MODELO-NEGOCIO.md §8 does not define partner-specific subid formats yet.
  // v1 uses a generic attribution parameter and keeps provider revenue truth in postbacks.
  url.searchParams.set("sub_id", input.attributionId);

  return {
    attributionId: input.attributionId,
    targetUrl: url.toString(),
    host: url.hostname.toLowerCase(),
    recordType: input.recordType,
    recordId: input.recordId,
  };
}

export function partnerRedirectEventKey(recordType: RecordType, recordId: string, attributionId: string): string {
  return `commercial:partner_redirect:${recordType}:${recordId}:${attributionId}`;
}

export function commercialRedirectAnalyticsEvents(props: CommercialEventProps) {
  return [
    { name: COMMERCIAL_ACTION_EVENTS.click, props },
    { name: COMMERCIAL_ACTION_EVENTS.redirect, props },
  ] as const;
}
