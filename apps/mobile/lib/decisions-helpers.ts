export function decisionPath(id?: string, suffix?: string): string {
  const base = "/api/decisions";
  if (!id) return base;
  return `${base}/${encodeURIComponent(id)}${suffix ?? ""}`;
}

export function normalizeDecisionTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function isValidDecisionTitle(title: string): boolean {
  const normalized = normalizeDecisionTitle(title);
  return normalized.length >= 1 && normalized.length <= 80;
}

export function formatDecisionBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}
