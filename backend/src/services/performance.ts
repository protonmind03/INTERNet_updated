/*
|--------------------------------------------------------------------------
| A STUDENT'S PERFORMANCE, IN FIGURES AND ONE SENTENCE
|--------------------------------------------------------------------------
|
| For each student: the counts a coordinator would otherwise collect from
| six pages, a status word, and a sentence that reads them out. Every
| figure is counted from records. Nothing is estimated except the
| projected finish, which is the same estimate Monitoring shows.
|
| There is NO SINGLE SCORE. The figures are not weighted or added up, and
| the status word comes from the few fixed rules in PERFORMANCE_RULES
| below, which the pages show beside the word. The rules are the only
| place the words are decided.
|
| "At risk" means here exactly what it means on Monitoring and in the
| alerts: the projection (services/insights.ts).
|
| The arithmetic is in plain functions so it can be tested with made-up
| records.
|
*/

import type { Pool } from "pg";
import type { Projection } from "./insights";
import { released } from "./taskRelease";
import { appliesTo, oneOff } from "./deliverables";

/** A time-in more than this many minutes after the shift starts is late. */
export const LATE_AFTER_MINUTES = 15;
/** Attendance on scheduled days under this share makes a student "Behind". */
export const BEHIND_ATTENDANCE_PERCENT = 80;
/** ...once this many scheduled days have passed, so one missed first day is not a verdict. */
export const BEHIND_AFTER_SCHEDULED_DAYS = 5;
/** This many late tasks makes a student "Behind". */
export const BEHIND_LATE_TASKS = 2;

export type PerformanceStatus = "Completed" | "On track" | "Behind" | "At risk";

/** The rules, in the order they are tried. The first that fits gives the word. */
export const PERFORMANCE_RULES: { status: PerformanceStatus; rule: string }[] = [
  { status: "Completed", rule: "All the required hours are verified." },
  {
    status: "At risk",
    rule: "At the scheduled hours the student would finish after the term ends, or hours remain and no working days are scheduled. The same rule as Monitoring.",
  },
  {
    status: "Behind",
    rule: `Timed in on fewer than ${BEHIND_ATTENDANCE_PERCENT}% of scheduled days (once ${BEHIND_AFTER_SCHEDULED_DAYS} scheduled days have passed), or ${BEHIND_LATE_TASKS} or more tasks are late.`,
  },
  { status: "On track", rule: "None of the above." },
];

export type PerformanceFigures = {
  /** Scheduled days so far (holidays and today left out), and how many had a time-in. */
  attendance: { scheduled_days: number; attended_days: number; rate: number | null };
  late_time_ins: number;
  logs_rejected: number;
  logs_corrected: number;
  /** `late` is submitted after the due date, or not submitted and past it. */
  tasks: { assigned: number; on_time: number; late: number; average_rating: number | null };
  weekly_reports: { submitted: number; weeks_worked: number };
  requirements: { approved: number; required: number };
  /** The average of the supervisor's star ratings, 1 to 5. */
  supervisor_rating: number | null;
  final_evaluation: { average: number; scale: number } | null;
  /** Concerns that name this student. */
  concerns: number;
};

export type Performance = PerformanceFigures & { status: PerformanceStatus; summary: string };

type Hours = Pick<Projection, "remaining_hours" | "projected_finish" | "at_risk"> & {
  required_hours: number;
  verified_hours: number;
};

export function performanceStatus(hours: Hours, figures: PerformanceFigures): PerformanceStatus {
  if (hours.required_hours > 0 && hours.remaining_hours === 0) return "Completed";
  if (hours.at_risk) return "At risk";
  const { attendance, tasks } = figures;
  if (
    attendance.rate !== null &&
    attendance.scheduled_days >= BEHIND_AFTER_SCHEDULED_DAYS &&
    attendance.rate < BEHIND_ATTENDANCE_PERCENT
  ) {
    return "Behind";
  }
  if (tasks.late >= BEHIND_LATE_TASKS) return "Behind";
  return "On track";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-01-14" as "14 Jan", with the year when it is not this one. */
export function shortDay(date: string, today: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}${String(year) === today.slice(0, 4) ? "" : ` ${year}`}`;
}

const number = (value: number) => String(Math.round(value * 10) / 10);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The figures read out: "On track: 412 of 600 hours, finishes 14 Jan.
 * Attendance 96%. 2 tasks late. Final evaluation 4.4 of 5." Only what
 * there is something to say about is said.
 */
export function performanceSentence(
  status: PerformanceStatus,
  hours: Hours,
  figures: PerformanceFigures,
  today: string
): string {
  const parts: string[] = [];
  const total = `${number(hours.verified_hours)} of ${number(hours.required_hours)} hours`;
  if (status === "Completed") parts.push(`Completed: ${total}.`);
  else if (hours.projected_finish) parts.push(`${status}: ${total}, finishes ${shortDay(hours.projected_finish, today)}.`);
  else parts.push(`${status}: ${total}, no finish date (no working days scheduled).`);

  if (figures.attendance.rate !== null) parts.push(`Attendance ${figures.attendance.rate}%.`);
  if (figures.late_time_ins > 0) parts.push(`${count(figures.late_time_ins, "late time-in", "late time-ins")}.`);
  if (figures.tasks.late > 0) parts.push(`${count(figures.tasks.late, "task", "tasks")} late.`);
  if (figures.requirements.required > 0 && figures.requirements.approved < figures.requirements.required) {
    parts.push(`Requirements ${figures.requirements.approved} of ${figures.requirements.required}.`);
  }
  if (figures.final_evaluation) {
    parts.push(`Final evaluation ${number(figures.final_evaluation.average)} of ${figures.final_evaluation.scale}.`);
  } else if (figures.supervisor_rating !== null) {
    parts.push(`Supervisor rating ${number(figures.supervisor_rating)} of 5.`);
  }
  if (figures.concerns > 0) parts.push(`${count(figures.concerns, "concern", "concerns")} filed.`);
  return parts.join(" ");
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const minutes = (clock: string | null | undefined): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Attendance on scheduled days and late time-ins, from one student's logs.
 * `shifts` is the weekly schedule: hours and start ("HH:MM") by weekday
 * name. Days are counted from `since` (the first log, else the term's
 * start) to yesterday; a holiday is not a scheduled day. Lateness is
 * measured against the schedule as it is now.
 */
export function attendanceFigures(input: {
  today: string;
  since: string | null;
  shifts: Record<string, { hours: number; start: string | null }>;
  holidays: Set<string>;
  /** Each log's date and the clock time of its time-in ("HH:MM"). */
  logs: { date: string; time_in: string | null }[];
}): Pick<PerformanceFigures, "attendance" | "late_time_ins"> {
  const logged = new Set(input.logs.map((log) => log.date));
  let scheduled = 0;
  let attended = 0;
  if (input.since) {
    // A year is more than any OJT; it only stops a bad date from looping.
    for (let day = input.since, guard = 0; day < input.today && guard < 370; day = addDays(day, 1), guard += 1) {
      if (input.holidays.has(day) || !((input.shifts[weekdayOf(day)]?.hours || 0) > 0)) continue;
      scheduled += 1;
      if (logged.has(day)) attended += 1;
    }
  }
  let late = 0;
  for (const log of input.logs) {
    const start = minutes(input.shifts[weekdayOf(log.date)]?.start);
    const arrived = minutes(log.time_in);
    if (start !== null && arrived !== null && arrived - start > LATE_AFTER_MINUTES) late += 1;
  }
  return {
    attendance: {
      scheduled_days: scheduled,
      attended_days: attended,
      rate: scheduled > 0 ? Math.round((attended / scheduled) * 100) : null,
    },
    late_time_ins: late,
  };
}

type Counts = {
  student_id: string;
  logs_rejected: number;
  logs_corrected: number;
  weeks_worked: number;
  tasks_assigned: number;
  tasks_on_time: number;
  tasks_late: number;
  task_rating: number | null;
  reports: number;
  requirements_approved: number;
  requirements_required: number;
  supervisor_rating: number | null;
  final_average: number | null;
  final_scale: number | null;
  concerns: number;
};

/**
 * The figures for each of the students given, by student id. `since` is
 * where each student's scheduled days are counted from.
 */
export async function performanceFigures(
  pool: Pool,
  students: { student_id: string; since: string | null }[],
  holidays: Set<string>,
  today: string
): Promise<Map<string, PerformanceFigures>> {
  const ids = students.map((row) => row.student_id);
  if (ids.length === 0) return new Map();
  const [counts, logs, shifts] = await Promise.all([
    pool.query<Counts>(
      `SELECT s.student_id,
        (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = s.student_id AND a.status = 'Rejected') AS logs_rejected,
        (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = s.student_id AND a.time_corrected_at IS NOT NULL) AS logs_corrected,
        (SELECT COUNT(DISTINCT DATE_TRUNC('week', a.date))::int FROM attendance a WHERE a.student_id = s.student_id) AS weeks_worked,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.student_id = s.student_id AND ${released("t.")}) AS tasks_assigned,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.student_id = s.student_id AND ${released("t.")}
           AND t.status IN ('Submitted', 'Reviewed') AND t.submitted_at::date <= t.due_date) AS tasks_on_time,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.student_id = s.student_id AND ${released("t.")}
           AND ((t.status IN ('Submitted', 'Reviewed') AND t.submitted_at::date > t.due_date)
             OR (t.status IN ('Pending', 'In Progress') AND t.due_date < CURRENT_DATE))) AS tasks_late,
        (SELECT ROUND(AVG(t.review_rating), 2)::float FROM tasks t
           WHERE t.student_id = s.student_id AND t.review_rating IS NOT NULL) AS task_rating,
        (SELECT COUNT(*)::int FROM journals j WHERE j.student_id = s.student_id) AS reports,
        (SELECT COUNT(*)::int FROM ojt_requirements r
           WHERE r.is_active = TRUE AND ${oneOff("r")} AND ${appliesTo("r", "s")}) AS requirements_required,
        (SELECT COUNT(*)::int FROM ojt_requirements r WHERE r.is_active = TRUE AND ${oneOff("r")} AND ${appliesTo("r", "s")} AND EXISTS (
           SELECT 1 FROM documents d
           WHERE d.student_id = s.student_id AND d.doc_type = r.name AND d.status = 'Approved')) AS requirements_approved,
        (SELECT ROUND(AVG(e.rating), 2)::float FROM evaluations e
           WHERE e.student_id = s.student_id AND e.evaluator_type = 'supervisor') AS supervisor_rating,
        (SELECT f.average::float FROM final_evaluations f WHERE f.student_id = s.student_id) AS final_average,
        (SELECT NULLIF(f.form_snapshot->>'scale_max', '')::int FROM final_evaluations f WHERE f.student_id = s.student_id) AS final_scale,
        (SELECT COUNT(*)::int FROM complaints c WHERE c.reported_student_id = s.student_id) AS concerns
       FROM students s WHERE s.student_id = ANY($1::text[])`,
      [ids]
    ),
    pool.query<{ student_id: string; date: string; time_in: string | null }>(
      `SELECT student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, TO_CHAR(time_in, 'HH24:MI') AS time_in
       FROM attendance WHERE student_id = ANY($1::text[])`,
      [ids]
    ),
    pool.query<{ student_id: string; day: string; hours: number; start: string | null }>(
      `SELECT student_id, INITCAP(TRIM(day)) AS day, COALESCE(SUM(hours), 0)::float AS hours,
              TO_CHAR(MIN(start_time), 'HH24:MI') AS start
       FROM ojt_schedule WHERE is_active = TRUE AND student_id = ANY($1::text[])
       GROUP BY student_id, INITCAP(TRIM(day))`,
      [ids]
    ),
  ]);

  const logsOf = new Map<string, { date: string; time_in: string | null }[]>();
  for (const row of logs.rows) logsOf.set(row.student_id, [...(logsOf.get(row.student_id) ?? []), row]);
  const shiftsOf = new Map<string, Record<string, { hours: number; start: string | null }>>();
  for (const row of shifts.rows) {
    shiftsOf.set(row.student_id, { ...(shiftsOf.get(row.student_id) ?? {}), [row.day]: { hours: Number(row.hours), start: row.start } });
  }
  const countsOf = new Map(counts.rows.map((row) => [row.student_id, row]));

  const result = new Map<string, PerformanceFigures>();
  for (const student of students) {
    const row = countsOf.get(student.student_id);
    if (!row) continue;
    result.set(student.student_id, {
      ...attendanceFigures({
        today,
        since: student.since,
        shifts: shiftsOf.get(student.student_id) ?? {},
        holidays,
        logs: logsOf.get(student.student_id) ?? [],
      }),
      logs_rejected: row.logs_rejected,
      logs_corrected: row.logs_corrected,
      tasks: {
        assigned: row.tasks_assigned,
        on_time: row.tasks_on_time,
        late: row.tasks_late,
        average_rating: row.task_rating,
      },
      weekly_reports: { submitted: row.reports, weeks_worked: row.weeks_worked },
      // The documents asked of this student, not every requirement there is.
      requirements: { approved: row.requirements_approved, required: row.requirements_required },
      supervisor_rating: row.supervisor_rating,
      final_evaluation:
        row.final_average === null ? null : { average: row.final_average, scale: row.final_scale || 5 },
      concerns: row.concerns,
    });
  }
  return result;
}

/** The figures with their status word and sentence. */
export function withStatus(hours: Hours, figures: PerformanceFigures, today: string): Performance {
  const status = performanceStatus(hours, figures);
  return { ...figures, status, summary: performanceSentence(status, hours, figures, today) };
}
