export type RecordEventPayload = Record<string, unknown> & {
  recordTitle?: string | null;
  recordStatus?: string | null;
  href?: string | null;
};

export type EventDescriptionKey =
  | "events.desc.value_up"
  | "events.desc.value_down"
  | "events.desc.value_changed"
  | "events.desc.price_up"
  | "events.desc.price_down"
  | "events.desc.price_changed"
  | "events.desc.status_changed"
  | "events.desc.alert_fired"
  | "events.desc.record_shared_direct"
  | "events.desc.record_shared_group"
  | "events.desc.record_shared"
  | "events.desc.share_received"
  | "events.desc.record_imported"
  | "events.desc.generic";

type TFn = (key: EventDescriptionKey, opts?: Record<string, string | number>) => string;

export function eventTitleFromPayload(payload: RecordEventPayload): string {
  const title = stringPayload(payload, "recordTitle");
  return title || "Registro";
}

export function formatRecordEventDescription(
  eventType: string,
  payload: RecordEventPayload,
  t: TFn,
  locale = "es"
): string {
  const previous = numberPayload(payload, "previousCents");
  const next = numberPayload(payload, "newCents");
  const delta = previous != null && next != null ? next - previous : null;
  const money = (value: number | null) => formatMoney(value, payload, locale);
  const common = {
    from: money(previous),
    to: money(next),
    delta: formatDelta(delta, payload, locale),
  };

  if (eventType === "value_changed") {
    if (delta != null && delta > 0) return t("events.desc.value_up", common);
    if (delta != null && delta < 0) return t("events.desc.value_down", common);
    return t("events.desc.value_changed", common);
  }

  if (eventType === "price_changed") {
    if (delta != null && delta > 0) return t("events.desc.price_up", common);
    if (delta != null && delta < 0) return t("events.desc.price_down", common);
    return t("events.desc.price_changed", common);
  }

  if (eventType === "status_changed") {
    return t("events.desc.status_changed", {
      from: stringPayload(payload, "previousStatus") || stringPayload(payload, "fromStatus") || "-",
      to: stringPayload(payload, "newStatus") || stringPayload(payload, "status") || stringPayload(payload, "recordStatus") || "-",
    });
  }

  if (eventType === "alert_fired") {
    const message = stringPayload(payload, "message");
    return t("events.desc.alert_fired", { message: message ? `: ${message}` : "" });
  }

  if (eventType === "record_shared") {
    const destination = stringPayload(payload, "destination");
    if (destination === "direct") return t("events.desc.record_shared_direct");
    if (destination === "conversation") {
      const count = numberPayload(payload, "targetCount");
      return t("events.desc.record_shared_group", { count: count ?? 0 });
    }
    return t("events.desc.record_shared");
  }

  if (eventType === "share_received") return t("events.desc.share_received");
  if (eventType === "record_imported") return t("events.desc.record_imported");
  return t("events.desc.generic");
}

export function eventTimeAgo(iso: string | null, t: (key: "news.ago_now" | "news.ago_min" | "news.ago_h" | "news.ago_d", opts?: { n: number }) => string): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return t("news.ago_now");
  if (mins < 60) return t("news.ago_min", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("news.ago_h", { n: hrs });
  return t("news.ago_d", { n: Math.floor(hrs / 24) });
}

function stringPayload(payload: RecordEventPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberPayload(payload: RecordEventPayload, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMoney(cents: number | null, payload: RecordEventPayload, locale: string): string {
  if (cents == null) return "-";
  const currency = stringPayload(payload, "currency") || "EUR";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toLocaleString(locale)} ${currency}`;
  }
}

function formatDelta(deltaCents: number | null, payload: RecordEventPayload, locale: string): string {
  if (deltaCents == null) return "-";
  const abs = formatMoney(Math.abs(deltaCents), payload, locale);
  if (deltaCents > 0) return `+${abs}`;
  if (deltaCents < 0) return `-${abs}`;
  return abs;
}
