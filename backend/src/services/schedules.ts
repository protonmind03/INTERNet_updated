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

/*
| Iteration 11: a schedule is a pattern of one week, or of two weeks taking
| turns from an anchor Monday (services/schedulePattern.ts). A request sends
| week 1 as `schedule` (as before), and, for two weeks, `pattern: { weeks: 2,
| anchor: "YYYY-MM-DD" }` and week 2 as `schedule_week2`. A request that
| sends only `schedule` is a one-week pattern, as every schedule was.
*/

export type PatternDay = ScheduleDay & { week: 1 | 2 };
export type ReadPattern = { weeks: 1 | 2; anchor: string | null; days: PatternDay[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A one- or two-week schedule from a request body, or what is wrong with it. */
export function readPattern(body: unknown): { problem: string } | ReadPattern {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const pattern = (input.pattern && typeof input.pattern === "object" ? input.pattern : {}) as Record<string, unknown>;
  const weeks = pattern.weeks === undefined || pattern.weeks === null ? 1 : Number(pattern.weeks);
  if (weeks !== 1 && weeks !== 2) return { problem: "A schedule repeats every week or every two weeks." };
  const first = readSchedule(input.schedule);
  if ("problem" in first) return first;
  if (weeks === 1) return { weeks: 1, anchor: null, days: first.days.map((day) => ({ ...day, week: 1 as const })) };

  const anchor = typeof pattern.anchor === "string" ? pattern.anchor.slice(0, 10) : "";
  if (!DATE.test(anchor) || Number.isNaN(Date.parse(`${anchor}T00:00:00Z`))) {
    return { problem: "Choose the Monday that week 1 starts on." };
  }
  if (new Date(`${anchor}T00:00:00Z`).getUTCDay() !== 1) return { problem: "Week 1 has to start on a Monday." };
  const second = readSchedule(input.schedule_week2);
  if ("problem" in second) return { problem: `Week 2: ${second.problem}` };
  if (first.days.length + second.days.length === 0) return { problem: "Choose at least one working day." };
  return {
    weeks: 2,
    anchor,
    days: [...first.days.map((day) => ({ ...day, week: 1 as const })), ...second.days.map((day) => ({ ...day, week: 2 as const }))],
  };
}

/** A pattern as one comparable line: its weeks, its anchor, and each week's days and times. */
export function patternKey(pattern: { weeks: number; anchor: string | null; days: { week?: number; day: string; start: string; end: string }[] }): string {
  const week = (n: number) => scheduleKey(pattern.days.filter((day) => (day.week ?? 1) === n));
  return pattern.weeks === 2 ? `Every two weeks from ${pattern.anchor}. Week 1: ${week(1)}. Week 2: ${week(2)}` : week(1);
}
