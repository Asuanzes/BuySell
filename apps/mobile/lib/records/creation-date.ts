const MISSING_DATE_PLACEHOLDERS = new Set(["--/--/----", "--", "-"]);

export function formatRecordCreationDate(value: string | null | undefined, locale: string): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || MISSING_DATE_PLACEHOLDERS.has(raw)) return null;

  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return null;

  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(ts));
}

export function hasRecordCreationDate(value: string | null | undefined): boolean {
  return formatRecordCreationDate(value, "es") !== null;
}
