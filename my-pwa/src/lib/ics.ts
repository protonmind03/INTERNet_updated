/*
|--------------------------------------------------------------------------
| THE SCHEDULE AS A CALENDAR FILE
|--------------------------------------------------------------------------
|
| Writes a student's weekly OJT schedule as an iCalendar (.ics) file that a
| phone or computer calendar can import: one repeating event per working
| day, skipping the holidays, and each holiday as an all-day entry.
|
| The file is a copy made at that moment. It does not follow later changes
| to the schedule or the holiday list; the student exports it again.
|
| Times are Philippine time, which has no daylight saving, so the time
| zone is written out in the file and needs no outside definition.
|
*/

import { PH_TIME_ZONE } from "./phTime";

export type CalendarShift = {
  day: string;
  start_time: string | null;
  end_time: string | null;
  focus: string | null;
};

const BYDAY: Record<string, string> = {
  Sunday: "SU",
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
};
const WEEKDAYS = Object.keys(BYDAY);

const compact = (date: string) => date.replace(/-/g, "");
const clock = (time: string) => `${time.slice(0, 5).replace(":", "")}00`;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** Text as a calendar value: the four characters the format reserves are escaped. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than the format allows are continued on the next, after a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

/**
 * The calendar file's contents.
 * `today` and `until` are "YYYY-MM-DD"; the repeating events run from the
 * first working day on or after `today` to `until`.
 */
export function scheduleCalendar(input: {
  shifts: CalendarShift[];
  holidays: { date: string; name: string }[];
  company: string;
  today: string;
  until: string;
  /** When the file was made, as a calendar timestamp; passed in so the output can be checked. */
  stamp: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//INTERNet//OJT Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:OJT schedule",
    `X-WR-TIMEZONE:${PH_TIME_ZONE}`,
    "BEGIN:VTIMEZONE",
    `TZID:${PH_TIME_ZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:PST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  const place = input.company.trim();

  for (const shift of input.shifts) {
    const code = BYDAY[shift.day];
    if (!code || !shift.start_time || !shift.end_time) continue;
    // The first of that weekday from today on.
    let first = input.today;
    while (weekdayOf(first) !== shift.day) first = addDays(first, 1);
    if (first > input.until) continue;
    const skipped = input.holidays
      .filter((holiday) => holiday.date >= first && holiday.date <= input.until && weekdayOf(holiday.date) === shift.day)
      .map((holiday) => `${compact(holiday.date)}T${clock(shift.start_time!)}`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:ojt-${code.toLowerCase()}-${compact(first)}@internet-ojt`,
      `DTSTAMP:${input.stamp}`,
      `DTSTART;TZID=${PH_TIME_ZONE}:${compact(first)}T${clock(shift.start_time)}`,
      `DTEND;TZID=${PH_TIME_ZONE}:${compact(first)}T${clock(shift.end_time)}`,
      // The end of the last day in the Philippines is 15:59:59 UTC.
      `RRULE:FREQ=WEEKLY;BYDAY=${code};UNTIL=${compact(input.until)}T155959Z`,
      ...(skipped.length > 0 ? [`EXDATE;TZID=${PH_TIME_ZONE}:${skipped.join(",")}`] : []),
      `SUMMARY:${text(place ? `OJT at ${place}` : "OJT")}`,
      ...(shift.focus ? [`DESCRIPTION:${text(shift.focus)}`] : []),
      ...(place ? [`LOCATION:${text(place)}`] : []),
      "END:VEVENT"
    );
  }

  for (const holiday of input.holidays) {
    if (holiday.date < input.today || holiday.date > input.until) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:holiday-${compact(holiday.date)}@internet-ojt`,
      `DTSTAMP:${input.stamp}`,
      `DTSTART;VALUE=DATE:${compact(holiday.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(holiday.date, 1))}`,
      `SUMMARY:${text(`Holiday: ${holiday.name}`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Saves the calendar as a file the device offers to add to its calendar. */
export function downloadCalendar(fileName: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
