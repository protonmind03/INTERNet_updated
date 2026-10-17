/*
|--------------------------------------------------------------------------
| A SCHEDULE PATTERN: ONE WEEK, OR TWO IN TURN
|--------------------------------------------------------------------------
|
| Iteration 11 (migration 061). A student's schedule repeats every week, or
| every two weeks: week 1 and week 2 take turns, counted from an anchor
| Monday (the week that is week 1). A schedule saved before patterns, or
| one with no anchor, is a one-week pattern: every week is week 1.
|
| The app's copy of backend/src/services/schedulePattern.ts: the server,
| the database (ojt_pattern_week) and this file are checked against each
| other in the tests. No imports, so the backend test can load it.
|
*/

export type PatternWeek = 1 | 2;

export type SchedulePattern<T> = {
  weeks: PatternWeek;
  /** "YYYY-MM-DD", a Monday: the start of a week 1. Null for a one-week pattern. */
  anchor: string | null;
  /** By week, by weekday name ("Monday"): what is scheduled. */
  byWeek: { 1: Record<string, T>; 2?: Record<string, T> };
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 86_400_000;

const utc = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);

/** The Monday of the week a date is in ("YYYY-MM-DD"). */
export function mondayOf(date: string): string {
  const day = new Date(utc(date));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(utc(date) - back * DAY_MS).toISOString().slice(0, 10);
}

/** Which week of the pattern a date falls in. */
export function patternWeek(anchor: string | null | undefined, weeks: number | null | undefined, date: string): PatternWeek {
  if (weeks !== 2 || !anchor) return 1;
  const apart = Math.round((utc(mondayOf(date)) - utc(mondayOf(anchor))) / (7 * DAY_MS));
  return (((apart % 2) + 2) % 2) === 0 ? 1 : 2;
}

/** A plain weekday map (the old shape) as a one-week pattern; a pattern as it is. */
export function asPattern<T>(value: SchedulePattern<T> | Record<string, T> | null | undefined): SchedulePattern<T> {
  if (value && typeof value === "object" && "byWeek" in value && "weeks" in value) return value as SchedulePattern<T>;
  return { weeks: 1, anchor: null, byWeek: { 1: (value as Record<string, T>) || {} } };
}

/** What the pattern has on a date (by its week and weekday), if anything. */
export function onDate<T>(value: SchedulePattern<T> | Record<string, T>, date: string): T | undefined {
  const pattern = asPattern(value);
  const week = patternWeek(pattern.anchor, pattern.weeks, date);
  const days = (week === 2 ? pattern.byWeek[2] : pattern.byWeek[1]) || {};
  return days[WEEKDAYS[new Date(utc(date)).getUTCDay()]];
}

/** Hours a week on average: a two-week pattern's total over two. */
export function weeklyHours(value: SchedulePattern<number> | Record<string, number>): number {
  const pattern = asPattern(value);
  const sum = (days: Record<string, number> | undefined) =>
    Object.values(days || {}).reduce((total, hours) => total + (hours > 0 ? hours : 0), 0);
  const total = pattern.weeks === 2 ? (sum(pattern.byWeek[1]) + sum(pattern.byWeek[2])) / 2 : sum(pattern.byWeek[1]);
  return Math.round(total * 100) / 100;
}
