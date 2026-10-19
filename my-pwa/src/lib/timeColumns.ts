/*
|--------------------------------------------------------------------------
| A DAY'S TIMES IN THE TIME RECORD'S FOUR COLUMNS
|--------------------------------------------------------------------------
|
| The time record is printed the Civil Service way: AM In, AM Out, PM In,
| PM Out. A log has up to four times, kept under the names they were given
| first:
|
|   time_in         "Time in"           AM In
|   break_time      "Lunch break"       AM Out
|   break_end_time  "End break"         PM In
|   time_out        "Time out"          PM Out
|
| The one rule above the others: never print a time that did not happen.
| A day worked straight through has no AM Out and no PM In, so none is
| made up for it.
|
|   Lunch taken        the four times, as recorded. A break taken at ten
|                      in the morning is still printed at ten.
|   No lunch           AM In is the time in, PM Out the time out, and the
|                      two cells between them are one cell: "No break".
|   One session only   a day that starts at 12:00 noon or later goes in the
|                      PM columns; a day that ends by 12:59 PM goes in the
|                      AM columns. The other two cells stay empty.
|   Still open         only the times recorded so far.
|
| This file imports nothing, so the same function can be checked by the
| tests without a browser.
|
*/

import { PH_TIME_ZONE } from "./phTime";

export type LogTimes = {
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
};

export type TimeColumns = {
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
  /** True when AM Out and PM In are one cell reading "No break". */
  noBreak: boolean;
};

const NOON = 12 * 60;
/** The last minute a session may end and still be a morning's work: 12:59 PM. */
const MORNING_ENDS = 12 * 60 + 59;

/** The day and the minute of the day a moment falls on, in a time zone (the Philippines' when none is given). */
function clockOf(value: string, timeZone: string = PH_TIME_ZONE): { day: string; minutes: number } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/**
 * Which column each of a log's times goes in. `timeZone` is for tests; the
 * pages leave it out, so the columns agree with the times as they are
 * shown everywhere else.
 */
export function timeColumns(log: LogTimes, timeZone?: string): TimeColumns {
  const empty: TimeColumns = { amIn: null, amOut: null, pmIn: null, pmOut: null, noBreak: false };
  const start = log.time_in ? clockOf(log.time_in, timeZone) : null;
  if (!log.time_in || !start) return empty;

  // Lunch taken: the four times as they were recorded, whenever that was.
  if (log.break_time) {
    return {
      amIn: log.time_in,
      amOut: log.break_time,
      pmIn: log.break_end_time,
      pmOut: log.time_out,
      noBreak: false,
    };
  }

  const afternoon = start.minutes >= NOON;
  const end = log.time_out ? clockOf(log.time_out, timeZone) : null;
  // Still open: the time in, where it belongs, and nothing else yet.
  if (!log.time_out || !end) {
    return afternoon ? { ...empty, pmIn: log.time_in } : { ...empty, amIn: log.time_in };
  }

  // One session, in the afternoon.
  if (afternoon) return { ...empty, pmIn: log.time_in, pmOut: log.time_out };
  // One session, in the morning: over by 12:59 PM the same day.
  if (end.day === start.day && end.minutes <= MORNING_ENDS) {
    return { ...empty, amIn: log.time_in, amOut: log.time_out };
  }
  // Worked through from the morning into the afternoon with no lunch.
  return { amIn: log.time_in, amOut: null, pmIn: null, pmOut: log.time_out, noBreak: true };
}

/** What each of the four steps is called on screen, in order. */
export const STEP_LABELS = {
  time_in: "Time in",
  break_time: "Lunch break",
  break_end_time: "End break",
  time_out: "Time out",
} as const;
