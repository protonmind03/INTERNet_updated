/*
|--------------------------------------------------------------------------
| THE DATES AN ANALYTICS REQUEST COVERS
|--------------------------------------------------------------------------
|
| The attendance figures on Analytics cover a range of days. It is asked
| for either as "the last N days" (`days`, as the page always did) or as a
| first and last day (`from`, `to`), and its chart is drawn by day, week
| or month (`group`). A request that sends none of them gets the last 14
| days by day, exactly as before.
|
*/

export type RangeGroup = "day" | "week" | "month";

export type AnalyticsRange = { from: string; to: string; days: number; group: RangeGroup };

/** The longest range a request may ask for. */
export const MAX_RANGE_DAYS = 731;
const QUICK_PERIODS = [14, 30, 90];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const realDay = (value: string) => DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Up to a month reads best by day, up to half a year by week, longer by month. */
export const defaultGroup = (days: number): RangeGroup => (days <= 31 ? "day" : days <= 184 ? "week" : "month");

export function readRange(query: Record<string, unknown>, today: string): { problem: string } | AnalyticsRange {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const from = text(query.from);
  const to = text(query.to);
  const asked = text(query.group);
  if (asked && asked !== "day" && asked !== "week" && asked !== "month") {
    return { problem: "Group the chart by day, week or month." };
  }

  let range: { from: string; to: string; days: number };
  if (from || to) {
    if (!from || !to) return { problem: "Give both a first and a last day." };
    if (!realDay(from) || !realDay(to)) return { problem: "Those are not dates (YYYY-MM-DD)." };
    if (from > to) return { problem: "The first day must not be after the last day." };
    const days = daysBetween(from, to);
    if (days > MAX_RANGE_DAYS) return { problem: "Choose a range of two years or less." };
    range = { from, to, days };
  } else {
    // As it always was: one of the three quick periods, or 14 days.
    const requested = Number(query.days);
    const days = QUICK_PERIODS.includes(requested) ? requested : 14;
    range = { from: addDays(today, -(days - 1)), to: today, days };
  }
  return { ...range, group: (asked as RangeGroup) || defaultGroup(range.days) };
}
