import { API_URL, getAuthHeaders, TOKEN_KEY } from "./api";
import {
  buildCommercialRedirectUrl,
  resolveCommercialRedirectUrl,
  type CommercialRedirectResolution,
  type CommercialRedirectParams,
} from "./commercial-redirect-url";
import { getItem } from "./secure-store";

export { buildCommercialRedirectUrl, resolveCommercialRedirectUrl };

export async function resolveCommercialRedirect(
  params: Omit<CommercialRedirectParams, "apiBaseUrl">
): Promise<CommercialRedirectResolution> {
  const token = await getItem(TOKEN_KEY).catch(() => null);

  // WebBrowser.openBrowserAsync cannot attach Authorization headers, so the app
  // resolves the authenticated /api/go 302 first and opens only the partner URL.
  return resolveCommercialRedirectUrl({
    apiBaseUrl: API_URL,
    ...params,
    headers: getAuthHeaders(token),
  });
}
