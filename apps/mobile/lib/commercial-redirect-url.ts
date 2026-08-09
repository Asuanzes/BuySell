export type CommercialRecordType = "holiday";

export type CommercialRedirectParams = {
  apiBaseUrl: string;
  target: string;
  recordType: CommercialRecordType;
  recordId: string;
};

export type CommercialRedirectResolution = {
  url: string;
  fallback: boolean;
};

export type CommercialRedirectResolveOptions = CommercialRedirectParams & {
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
  timeoutMs?: number;
};

const DEFAULT_REDIRECT_TIMEOUT_MS = 5_000;

export function buildCommercialRedirectUrl({
  apiBaseUrl,
  target,
  recordType,
  recordId,
}: CommercialRedirectParams): string {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL("/api/go", base);
  url.searchParams.set("target", target);
  url.searchParams.set("recordType", recordType);
  url.searchParams.set("recordId", recordId);
  return url.toString();
}

export async function resolveCommercialRedirectUrl({
  apiBaseUrl,
  target,
  recordType,
  recordId,
  fetchImpl = fetch,
  headers,
  timeoutMs = DEFAULT_REDIRECT_TIMEOUT_MS,
}: CommercialRedirectResolveOptions): Promise<CommercialRedirectResolution> {
  const goUrl = buildCommercialRedirectUrl({ apiBaseUrl, target, recordType, recordId });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(goUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (res.status >= 400) return { url: target, fallback: true };

    const location = res.headers.get("Location") ?? res.headers.get("location");
    if (location) return { url: new URL(location, apiBaseUrl).toString(), fallback: false };
    if (res.redirected && res.url) return { url: res.url, fallback: false };
  } catch {
    // Attribution is best-effort: a broken /api/go must never block booking.
  } finally {
    clearTimeout(timer);
  }

  return { url: target, fallback: true };
}
