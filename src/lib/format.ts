const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * "19 Nov 2026, 14:05" in the locale (a BCP 47 tag, e.g. "en-GB") and the
 * time zone (IANA, e.g. "Europe/Berlin"; default: the browser's). An unknown
 * time zone falls back to the browser's.
 */
export function formatDateTime(value: string | number | Date, locale: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

/** "5 minutes ago", "in 2 days", "just now" (under a minute) relative to `now`. */
export function formatRelative(
  value: string | number | Date,
  locale: string,
  now: number = Date.now(),
): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return String(value);
  const diff = time - now;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit);
  }
  return format.format(0, "second");
}
