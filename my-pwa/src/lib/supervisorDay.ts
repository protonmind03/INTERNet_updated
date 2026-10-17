/*
|--------------------------------------------------------------------------
| A SUPERVISOR'S DAY, WORKED OUT ON THE DEVICE
|--------------------------------------------------------------------------
|
| Where each intern stands today, who was late and by how much, and how
| long the oldest thing has waited: all from lists the supervisor's pages
| already load. "Late" is the same rule the student's own calendar uses
| (more than LATE_AFTER_MINUTES after the shift starts).
|
| This file imports only the calendar's arithmetic, so the tests can check
| it without a browser.
|
*/

import { LATE_AFTER_MINUTES, shiftOn, type CalendarShift } from "./studentCalendar";
import { PH_TIME_ZONE } from "./phTime";

/**
 * on        timed in, not yet timed out
 * done      timed in and out
 * absent    an absence was filed for today
 * missing   scheduled, and not in 15 minutes after the shift started
 * expected  scheduled, and it is not that late yet
 * off       not scheduled today, or a holiday
 */
export type TodayState = "on" | "done" | "absent" | "missing" | "expected" | "off";

/** "08:00:00" as minutes after midnight. */
export function clockMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hour, minute = "0"] = time.split(":");
  const value = Number(hour) * 60 + Number(minute);
  return Number.isNaN(value) ? null : value;
}

/** The minute of the day a moment falls on, in a time zone (the Philippines' when none is given). */
export function minuteOfDay(value: string | Date, timeZone: string = PH_TIME_ZONE): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? "0");
  return part("hour") * 60 + part("minute");
}

export function todayState(day: {
  /** Today's shift for this intern, if today is one of their working days. */
  shift: Pick<CalendarShift, "start_time"> | null;
  holiday: boolean;
  log: { time_out: string | null } | null;
  absence: boolean;
  /** Minutes after midnight, now. */
  nowMinutes: number;
}): TodayState {
  // What happened comes before what was planned.
  if (day.log) return day.log.time_out ? "done" : "on";
  if (day.absence) return "absent";
  if (day.holiday || !day.shift) return "off";
  const start = clockMinutes(day.shift.start_time);
  if (start === null) return "expected";
  return day.nowMinutes > start + LATE_AFTER_MINUTES ? "missing" : "expected";
}

export type LateDay = { date: string; minutes: number };

/**
 * The days an intern timed in more than LATE_AFTER_MINUTES after their
 * shift started, newest first, with how many minutes after the start.
 * Measured against the schedule as it is now.
 */
export function lateDays(
  logs: { date: string; time_in: string | null }[],
  shifts: Pick<CalendarShift, "day" | "start_time" | "hours" | "week" | "pattern_weeks" | "pattern_anchor">[],
  timeZone?: string
): LateDay[] {
  const late: LateDay[] = [];
  for (const log of logs) {
    const date = String(log.date).slice(0, 10);
    // The shift of that date's week, when the schedule repeats every two weeks.
    const start = clockMinutes(shiftOn(shifts, date)?.start_time);
    const arrived = log.time_in ? minuteOfDay(log.time_in, timeZone) : null;
    if (start === null || start === undefined || arrived === null) continue;
    if (arrived - start > LATE_AFTER_MINUTES) late.push({ date, minutes: arrived - start });
  }
  return late.sort((a, b) => b.date.localeCompare(a.date));
}

/** Whole days since a moment; 0 for anything under a day, or a date that cannot be read. */
export function daysWaiting(since: string, now: Date = new Date()): number {
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** Days waited at which the oldest item is shown in amber. */
export const WAITING_TOO_LONG_DAYS = 3;

/** "45 min", "1 h 5 min", "2 h". */
export function minutesText(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const rest = whole % 60;
  return rest === 0 ? `${Math.floor(whole / 60)} h` : `${Math.floor(whole / 60)} h ${rest} min`;
}
