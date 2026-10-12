/*
| The weekly report's four parts, and one week's accomplishment notes, as
| data. They are drawn by components/WeeklyReport.tsx.
|
| In the database and the routes the report is still the "journal":
| activities, learnings, challenges, solutions.
*/

export type ReportText = {
  activities: string;
  learnings: string;
  challenges: string | null;
  /** Missing on a report written before the field existed. */
  solutions?: string | null;
};

/** The headings of the four parts, in order. One wording for every role. */
export const REPORT_PARTS = [
  { key: "activities", label: "What I did" },
  { key: "learnings", label: "What I learned" },
  { key: "challenges", label: "Problems encountered" },
  { key: "solutions", label: "Solutions tried or identified" },
] as const;

export type DayLog = { date: string; accomplishments?: string | null };

/** "YYYY-MM-DD" a number of days after a date key. */
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The accomplishment notes of one week (Monday to Sunday), oldest first. */
export function accomplishmentsOf(weekStart: string, logs: DayLog[]): { date: string; text: string }[] {
  const weekEnd = shiftDate(weekStart, 6);
  return logs
    .map((log) => ({ date: String(log.date).slice(0, 10), text: (log.accomplishments || "").trim() }))
    .filter((day) => day.text && day.date >= weekStart && day.date <= weekEnd)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
