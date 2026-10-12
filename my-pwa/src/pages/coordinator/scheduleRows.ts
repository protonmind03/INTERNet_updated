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
