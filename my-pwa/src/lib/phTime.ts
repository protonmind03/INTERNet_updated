/*
|--------------------------------------------------------------------------
| PHILIPPINE TIME
|--------------------------------------------------------------------------
|
| Every OJT date and time is Philippine time, whatever zone the phone or
| laptop showing it is set to. The API sends moments as ISO strings and
| dates as "YYYY-MM-DD"; everything here reads and writes them in
| Asia/Manila, so a page shows the day the server means.
|
| Formatting a date without a time zone uses the device's zone; the lint
| rule in eslint.config.js refuses that, so dates go through formatPh or
| state their own zone.
|
| The Philippines has kept UTC+8 without daylight saving since 1990, so the
| offset below is fixed.
|
*/

export const PH_TIME_ZONE = "Asia/Manila";
export const PH_LOCALE = "en-PH";
const PH_UTC_OFFSET = "+08:00";
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The moment a Philippine calendar day begins (month is 1 to 12). */
export function phCalendarDate(year: number, month: number, day = 1): Date {
  // Built in UTC, so a month or day past its end rolls over as Date does.
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  return new Date(`${noon.toISOString().slice(0, 10)}T00:00:00${PH_UTC_OFFSET}`);
}

/** A value from the API as a moment: a bare date is that day's start in the Philippines. */
export function phDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const day = DAY.exec(value);
  const date = day ? phCalendarDate(Number(day[1]), Number(day[2]), Number(day[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a moment as it reads in the Philippines. */
export function formatPh(date: Date, options: Intl.DateTimeFormatOptions, locale = PH_LOCALE): string {
  return date.toLocaleString(locale, { ...options, timeZone: PH_TIME_ZONE });
}

/** "Oct 2, 2026, 8:05 AM": when a file or report was made. */
export function phStamp(value: Date = new Date()): string {
  return formatPh(value, { dateStyle: "medium", timeStyle: "short" });
}

/** Formats a "YYYY-MM-DD" day as it reads in the Philippines; empty when it is not a date. */
export function formatPhDay(day: string, options: Intl.DateTimeFormatOptions, locale = PH_LOCALE): string {
  const date = DAY.test(day) ? phDate(day) : null;
  return date ? formatPh(date, options, locale) : "";
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function phParts(date: Date): { key: string; hour: number } {
  const parts = Object.fromEntries(partsFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return { key: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

/** The Philippine calendar date as "YYYY-MM-DD"; a bare date comes back as it is. */
export function phDateKey(value: string | Date | null | undefined): string {
  if (typeof value === "string" && DAY.test(value)) return value;
  const date = phDate(value);
  return date ? phParts(date).key : "";
}

/** Today's date in the Philippines as "YYYY-MM-DD". */
export function phToday(now: Date = new Date()): string {
  return phParts(now).key;
}

/** The hour (0 to 23) in the Philippines. */
export function phHour(now: Date = new Date()): number {
  return phParts(now).hour;
}

/** The "YYYY-MM-DD" a number of days after (or before) another. */
export function phAddDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from one "YYYY-MM-DD" to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
