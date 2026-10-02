/*
|--------------------------------------------------------------------------
| DATE AND TIME FORMATTING
|--------------------------------------------------------------------------
|
| The API returns timestamps as ISO strings and dates as "YYYY-MM-DD".
| These helpers turn them into the same readable form on every page.
|
*/

const LOCALE = "en-PH";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // A bare date has no time zone; build it in local time so it does not
  // slip to the previous day.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "8:05 AM", or a dash when there is no time yet. */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

/** "8:05:42 AM" for live clocks. */
export function formatClock(value: Date): string {
  return value.toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "Oct 2, 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Fri, Oct 2" */
export function formatDayDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Friday, October 2, 2026" */
export function formatLongDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Oct 2, 8:05 AM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString(LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local calendar date as "YYYY-MM-DD". */
export function localDateKey(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "7.5 h" / "8 h"; hours arrive as numbers or numeric strings. */
export function formatHours(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const hours = Number(value);
  if (!Number.isFinite(hours)) return "—";
  return `${Number(hours.toFixed(2))} h`;
}

/** "2h 15m" from a number of minutes. */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/** Whole days from today until the given date (negative when past). */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** "Due today", "Due in 3 days", "2 days overdue". */
export function dueLabel(value: string | Date | null | undefined): string {
  const days = daysUntil(value);
  if (days === null) return "No due date";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}

export function getInitials(name: string | null | undefined, fallback = "?"): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
