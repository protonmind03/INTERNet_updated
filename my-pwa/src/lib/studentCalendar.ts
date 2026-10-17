/*
|--------------------------------------------------------------------------
| A STUDENT'S CALENDAR AND PROGRESS, WORKED OUT ON THE DEVICE
|--------------------------------------------------------------------------
|
| The Schedule page's Month view and "My progress" tab are put together
| from lists the student's pages already load and keep for offline use:
| the weekly schedule, the holidays, the attendance logs, the absences
| filed and the tasks. Nothing here asks the server for anything, so both
| work with no connection, from the saved copies.
|
| Dates are "YYYY-MM-DD" keys throughout. This file imports only the
| Philippine time zone, so the arithmetic can be checked by the tests
| without a browser.
|
*/

import { PH_TIME_ZONE } from "./phTime";
import { patternWeek } from "./schedulePattern";

export type CalendarShift = {
  /** The weekday's name: "Monday". */
  day: string;
  start_time: string | null;
  end_time: string | null;
  hours: number | string | null;
  focus?: string | null;
  /** Which week of a two-week pattern the row is in (Iteration 11); 1 when missing. */
  week?: number | null;
  /** The pattern, when the row carries it (the supervisor's list does). */
  pattern_weeks?: number | null;
  pattern_anchor?: string | null;
};

/** How a schedule repeats: every week, or two weeks taking turns from the anchor Monday. */
export type ShiftPattern = { weeks: number; anchor: string | null };

/**
 * The shift a date has: the row for its weekday, in the week of the pattern
 * in force that day. The pattern is the one given, else the one the rows
 * carry, else one week.
 */
export function shiftOn<T extends Pick<CalendarShift, "day" | "start_time" | "hours" | "week" | "pattern_weeks" | "pattern_anchor">>(
  shifts: T[],
  date: string,
  pattern?: ShiftPattern | null
): T | undefined {
  const weeks = pattern?.weeks ?? shifts[0]?.pattern_weeks ?? 1;
  const anchor = pattern?.anchor ?? shifts[0]?.pattern_anchor ?? null;
  const week = patternWeek(anchor, weeks, date);
  const weekday = weekdayOf(date);
  return shifts.find(
    (shift) => shift.day === weekday && (Number(shift.week) || 1) === week && ((Number(shift.hours) || 0) > 0 || shift.start_time)
  );
}

/** Hours a week on average: a two-week pattern's total over two. */
export function weeklyShiftHours(shifts: Pick<CalendarShift, "hours" | "week">[], pattern?: ShiftPattern | null): number {
  const total = shifts.reduce((sum, shift) => sum + (Number(shift.hours) || 0), 0);
  const two = (pattern?.weeks ?? 1) === 2 || shifts.some((shift) => Number(shift.week) === 2);
  return Math.round((two ? total / 2 : total) * 100) / 100;
}

export type CalendarLog = {
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  status: string;
  accomplishments?: string | null;
  tasks?: { id: number; title: string }[];
};

export type CalendarAbsence = { date: string; status: string; reason?: string | null };
export type CalendarTask = { id: number; title: string; status: string; due_date: string | null };
export type CalendarHoliday = { date: string; name: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A time-in more than this many minutes after the shift starts is late. */
export const LATE_AFTER_MINUTES = 15;

const key = (value: string) => String(value).slice(0, 10);

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** The Monday of the week a date falls in. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/**
 * The weeks a month's grid shows, Monday first. The first and last weeks
 * run into the neighbouring months so every row has seven days.
 */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const [year, index] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(Date.UTC(year, index, 0)).getUTCDate()).padStart(2, "0")}`;
  const weeks: string[][] = [];
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(start, offset)));
  }
  return weeks;
}

/** "2026-11" a number of months from a month. */
export function addMonths(month: string, months: number): string {
  const [year, index] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, index - 1 + months, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Which week of the OJT a date is in, counting the week of `since` (the
 * first log, or the term's start) as week 1. Null before it, or when there
 * is nothing to count from.
 */
export function weekNumber(date: string, since: string | null): number | null {
  if (!since) return null;
  const start = mondayOf(key(since));
  const week = mondayOf(date);
  if (week < start) return null;
  const days = (Date.parse(`${week}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return Math.round(days / 7) + 1;
}

/** Where the OJT is counted from: the first log, else the start of the term. */
export function countedFrom(logs: CalendarLog[], termStart: string | null): string | null {
  const first = logs.reduce<string | null>(
    (earliest, log) => (earliest === null || key(log.date) < earliest ? key(log.date) : earliest),
    null
  );
  return first ?? (termStart ? key(termStart) : null);
}

export type CalendarSources = {
  shifts: CalendarShift[];
  /** How the schedule repeats; one week when missing. */
  pattern?: ShiftPattern | null;
  holidays: CalendarHoliday[];
  logs: CalendarLog[];
  absences: CalendarAbsence[];
  tasks: CalendarTask[];
};

export type DayFacts = {
  date: string;
  weekday: string;
  /** The shift scheduled for that weekday, if it is a working day. */
  shift: CalendarShift | null;
  holiday: string | null;
  log: CalendarLog | null;
  /** An absence filed for the day. Not shown as one when there is a log. */
  absence: CalendarAbsence | null;
  /** Tasks whose deadline is this day, finished or not. */
  due: CalendarTask[];
};

/** Looks the lists up by date once, then answers for any day. */
export function calendarIndex(sources: CalendarSources): (date: string) => DayFacts {
  const holidayOn = new Map(sources.holidays.map((holiday) => [key(holiday.date), holiday.name]));
  const logOn = new Map(sources.logs.map((log) => [key(log.date), log]));
  const absenceOn = new Map(sources.absences.map((absence) => [key(absence.date), absence]));
  const dueOn = new Map<string, CalendarTask[]>();
  for (const task of sources.tasks) {
    if (!task.due_date) continue;
    const day = key(task.due_date);
    dueOn.set(day, [...(dueOn.get(day) ?? []), task]);
  }
  return (date) => {
    const log = logOn.get(date) ?? null;
    return {
      date,
      weekday: weekdayOf(date),
      shift: shiftOn(sources.shifts, date, sources.pattern) ?? null,
      holiday: holidayOn.get(date) ?? null,
      log,
      // A day that was worked is not an absence, whatever was filed.
      absence: log ? null : absenceOn.get(date) ?? null,
      due: dueOn.get(date) ?? [],
    };
  };
}

/** What a day's cell says about hours: the verified hours, "open", or nothing. */
export function hoursMark(log: CalendarLog | null): { text: string; verified: boolean } | null {
  if (!log) return null;
  if (!log.time_out) return { text: "open", verified: false };
  const hours = Math.round((Number(log.hours) || 0) * 10) / 10;
  return { text: `${hours} h`, verified: log.status === "Verified" };
}

export type WeekHours = { week_start: string; scheduled: number; verified: number };

/**
 * Hours scheduled and hours verified for each of the last `weeks` weeks,
 * oldest first, ending with the week `today` is in. A holiday takes its
 * day's hours off what was scheduled; nothing is scheduled before `since`.
 */
export function weeklyHours(
  today: string,
  since: string | null,
  sources: Pick<CalendarSources, "shifts" | "holidays" | "logs" | "pattern">,
  weeks = 8
): WeekHours[] {
  const day = calendarIndex({ ...sources, absences: [], tasks: [] });
  const thisWeek = mondayOf(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - index));
    let scheduled = 0;
    let verified = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      const facts = day(date);
      if (facts.shift && !facts.holiday && since && date >= key(since)) {
        scheduled += Number(facts.shift.hours) || 0;
      }
      if (facts.log && facts.log.status === "Verified") verified += Number(facts.log.hours) || 0;
    }
    return {
      week_start: start,
      scheduled: Math.round(scheduled * 100) / 100,
      verified: Math.round(verified * 100) / 100,
    };
  });
}

/**
 * Of the days the student was scheduled to work, from `since` to
 * yesterday (holidays left out), how many they timed in on. Today is not
 * counted, because it is not over.
 */
export function attendanceOnScheduledDays(
  today: string,
  since: string | null,
  sources: Pick<CalendarSources, "shifts" | "holidays" | "logs" | "pattern">
): { scheduled: number; attended: number } {
  if (!since) return { scheduled: 0, attended: 0 };
  const day = calendarIndex({ ...sources, absences: [], tasks: [] });
  let scheduled = 0;
  let attended = 0;
  // A year is more than any OJT; it only stops a bad date from looping.
  for (let date = key(since), guard = 0; date < today && guard < 370; date = addDays(date, 1), guard += 1) {
    const facts = day(date);
    if (!facts.shift || facts.holiday) continue;
    scheduled += 1;
    if (facts.log) attended += 1;
  }
  return { scheduled, attended };
}

/** The minute of the day a moment falls on, in a time zone (the Philippines' when none is given). */
function minuteOfDay(value: string, timeZone: string = PH_TIME_ZONE): number | null {
  const date = new Date(value);
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

/** "08:00:00" as minutes after midnight. */
function clockMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hour, minute = "0"] = time.split(":");
  const value = Number(hour) * 60 + Number(minute);
  return Number.isNaN(value) ? null : value;
}

/**
 * How the student's time-ins compare with their shift's start, over the
 * days that had a shift. `average` is in minutes: positive is after the
 * start, negative before it. `late` counts the days more than
 * LATE_AFTER_MINUTES after the start.
 */
export function punctuality(
  sources: Pick<CalendarSources, "shifts" | "logs" | "pattern">,
  timeZone?: string
): { days: number; average: number; late: number } {
  let days = 0;
  let total = 0;
  let late = 0;
  for (const log of sources.logs) {
    const start = clockMinutes(shiftOn(sources.shifts, key(log.date), sources.pattern)?.start_time ?? null);
    const arrived = log.time_in ? minuteOfDay(log.time_in, timeZone) : null;
    if (start === null || start === undefined || arrived === null) continue;
    days += 1;
    total += arrived - start;
    if (arrived - start > LATE_AFTER_MINUTES) late += 1;
  }
  return { days, average: days > 0 ? Math.round(total / days) : 0, late };
}
