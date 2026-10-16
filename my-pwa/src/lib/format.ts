/*
|--------------------------------------------------------------------------
| DATE AND TIME FORMATTING
|--------------------------------------------------------------------------
|
| The API returns timestamps as ISO strings and dates as "YYYY-MM-DD".
| These helpers turn them into the same readable form on every page, in
| Philippine time whatever zone the device is set to (lib/phTime.ts).
|
*/

import { daysBetween, formatPh, phDate as toDate, phDateKey, phHour, phToday } from "./phTime";

export { phDateKey };

/** "8:05 AM", or a dash when there is no time yet. */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatPh(date, { hour: "numeric", minute: "2-digit" });
}

/** "8:05:42 AM" for live clocks. */
export function formatClock(value: Date): string {
  return formatPh(value, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "Oct 2, 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatPh(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Fri, Oct 2" */
export function formatDayDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatPh(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Friday, October 2, 2026" */
export function formatLongDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatPh(date, {
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
  return formatPh(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

/** Whole days from today until the given date (negative when past), in Philippine days. */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const target = phDateKey(value);
  if (!target) return null;
  return daysBetween(phToday(), target);
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
  const hour = phHour(date);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
