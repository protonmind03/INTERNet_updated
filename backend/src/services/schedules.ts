/*
|--------------------------------------------------------------------------
| A WEEKLY SCHEDULE, READ FROM A REQUEST
|--------------------------------------------------------------------------
|
| The same checks whether a schedule is saved for one student or for a
| whole block: a real weekday, once; a start and an end as HH:MM; the end
| after the start. The hours of a day are worked out from its times.
|
*/

export const SCHEDULE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ScheduleDay = { day: string; start: string; end: string; focus: string | null; hours: number };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The days of a schedule as sent (`schedule: [{ day, start_time, end_time, focus }]`), or what is wrong. */
export function readSchedule(value: unknown): { problem: string } | { days: ScheduleDay[] } {
  const entries: unknown[] = Array.isArray(value) ? value : [];
  const days: ScheduleDay[] = [];
  for (const raw of entries) {
    const entry = (raw || {}) as Record<string, unknown>;
    const day = String(entry.day || "");
    const start = String(entry.start_time || "").slice(0, 5);
    const end = String(entry.end_time || "").slice(0, 5);
    if (!SCHEDULE_DAYS.includes(day)) return { problem: `Invalid day: ${day || "(blank)"}.` };
    if (!TIME.test(start) || !TIME.test(end)) return { problem: `Enter start and end times (HH:MM) for ${day}.` };
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes <= 0) return { problem: `End time must be after start time on ${day}.` };
    if (days.some((item) => item.day === day)) return { problem: `${day} is listed more than once.` };
    days.push({
      day,
      start,
      end,
      focus: typeof entry.focus === "string" && entry.focus.trim() ? entry.focus.trim().slice(0, 200) : null,
      hours: Math.round((minutes / 60) * 100) / 100,
    });
  }
  return { days };
}

/** A schedule's days and times as one comparable line; the focus is not part of it. */
export function scheduleKey(days: { day: string; start: string; end: string }[]): string {
  return [...days]
    .sort((a, b) => SCHEDULE_DAYS.indexOf(a.day) - SCHEDULE_DAYS.indexOf(b.day))
    .map((item) => `${item.day} ${item.start.slice(0, 5)}-${item.end.slice(0, 5)}`)
    .join("; ");
}

/** How a student's schedule stands against one about to be applied. */
export function compareSchedule(
  current: { day: string; start: string; end: string }[],
  wanted: { day: string; start: string; end: string }[]
): "none" | "same" | "different" {
  if (current.length === 0) return "none";
  return scheduleKey(current) === scheduleKey(wanted) ? "same" : "different";
}
