/* The rows of a weekly schedule as a form holds them, and the arithmetic on them (ScheduleDays.tsx draws them). */

export type ScheduleRow = { day: string; start_time: string; end_time: string; focus: string };

export const SCHEDULE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

export const weeklyHoursOf = (rows: ScheduleRow[]) =>
  rows.reduce((sum, row) => sum + hoursBetween(row.start_time, row.end_time), 0);

/** The first day whose end is not after its start, if any. */
export const badDayOf = (rows: ScheduleRow[]) => rows.find((row) => hoursBetween(row.start_time, row.end_time) <= 0);

/*
| Iteration 11: a schedule repeats every week, or every two weeks taking
| turns from an anchor Monday (week 1). The form holds both weeks; a
| one-week pattern uses only week 1.
*/
export type PatternForm = { weeks: 1 | 2; anchor: string; week1: ScheduleRow[]; week2: ScheduleRow[] };

/** Hours a week on average (a two-week pattern's total over two). */
export const patternHoursOf = (form: PatternForm) =>
  form.weeks === 2 ? (weeklyHoursOf(form.week1) + weeklyHoursOf(form.week2)) / 2 : weeklyHoursOf(form.week1);

/** What is wrong with the pattern before it is sent, if anything. */
export function patternProblem(form: PatternForm): string {
  const bad = badDayOf(form.week1) ?? (form.weeks === 2 ? badDayOf(form.week2) : undefined);
  if (bad) return `${bad.day}: the end time must be after the start time.`;
  if (form.weeks === 2) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.anchor)) return "Choose the Monday that week 1 starts on.";
    if (new Date(`${form.anchor}T00:00:00Z`).getUTCDay() !== 1) return "Week 1 has to start on a Monday.";
  }
  return "";
}

/** The request body: week 1 as `schedule`, as before; the pattern and week 2 when there are two. */
export const patternBody = (form: PatternForm) =>
  form.weeks === 2
    ? { schedule: form.week1, pattern: { weeks: 2, anchor: form.anchor }, schedule_week2: form.week2 }
    : { schedule: form.week1, pattern: { weeks: 1 } };
