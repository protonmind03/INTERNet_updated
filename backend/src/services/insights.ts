/*
|--------------------------------------------------------------------------
| PROJECTIONS AND ALERTS
|--------------------------------------------------------------------------
|
| Two things worked out from records the system already has.
|
| A PROJECTION says when a student will finish at the pace they are
| scheduled for: the hours still to verify are counted off against their
| weekly schedule, day by day from tomorrow, skipping holidays. A student
| is AT RISK when that date falls after their term ends, or when they
| still have hours to do and nothing is scheduled. It is an estimate from
| the schedule, not a promise; a student who works more or less than
| scheduled finishes sooner or later.
|
| ALERTS are the things a coordinator should not have to go looking for:
| supervisors sitting on reviews, agreements about to run out, students
| who have stopped turning up, and students at risk.
|
| The arithmetic is in plain functions so it can be tested with made-up
| dates. Nothing here writes to the database.
|
*/

import type { Pool } from "pg";
import { isEmailConfigured, sendEmail } from "./mailer";
import { allowsChannel } from "./notificationPreferences";
import { clockSetting, sendOnce, type DigestDeps } from "./digests";
import { phClock, phSql } from "./phTime";
import { bindFilters, filterConditions, type StudentFilters } from "./studentScope";
import { performanceFigures, withStatus, type Performance } from "./performance";
import { asPattern, onDate, weeklyHours, type SchedulePattern } from "./schedulePattern";


/** Days a supervisor may leave something waiting before the coordinator is told. */
export const SLOW_REVIEW_DAYS = 3;
/** How far ahead an agreement's end is flagged. */
export const MOA_WARNING_DAYS = 30;
/** Scheduled days in a row without attendance before a student is flagged. */
export const MISSED_DAYS_ALERT = 5;

const PROJECTION_LIMIT_DAYS = 730;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** A schedule as the projection reads it: a pattern, or the old weekday map (one week). */
type Schedule = SchedulePattern<number> | Record<string, number>;

/** How an end date was worked out (Iteration 11): what the walk counted and skipped. */
export type ProjectionWalk = {
  /** The first day walked: the day after today. */
  start: string;
  pattern_weeks: 1 | 2;
  /** Scheduled days counted until the hours were covered. */
  working_days: number;
  /** Scheduled days skipped for a holiday, and for an approved (excused) absence. */
  holidays_skipped: string[];
  absences_skipped: string[];
};

export type Projection = {
  remaining_hours: number;
  weekly_hours: number;
  /** "YYYY-MM-DD", or null when it cannot be worked out. */
  projected_finish: string | null;
  at_risk: boolean;
  /** Why, in a few words; empty when not at risk. */
  risk_reason: string;
  /** How the date was worked out. Missing when nothing was walked (no hours left, or no schedule). */
  walk?: ProjectionWalk;
};

/**
 * When a student finishes at their scheduled pace: remaining = required −
 * verified, then the pattern is walked from the next day, skipping holidays
 * and approved absences still to come, until the remaining hours are
 * covered. `schedule` is a one- or two-week pattern (or hours per weekday
 * name, which is a one-week pattern); dates are "YYYY-MM-DD".
 */
export function projectFinish(input: {
  today: string;
  requiredHours: number;
  verifiedHours: number;
  schedule: Schedule;
  holidays: Set<string>;
  /** Approved (excused) absences on days still to come. */
  absences?: Set<string>;
  termEnd?: string | null;
}): Projection {
  const pattern = asPattern(input.schedule);
  const absences = input.absences ?? new Set<string>();
  const remaining = Math.max(0, Math.round((input.requiredHours - input.verifiedHours) * 100) / 100);
  const weekly = weeklyHours(pattern);
  if (remaining === 0) {
    return { remaining_hours: 0, weekly_hours: weekly, projected_finish: null, at_risk: false, risk_reason: "" };
  }
  if (weekly <= 0) {
    return {
      remaining_hours: remaining,
      weekly_hours: 0,
      projected_finish: null,
      at_risk: true,
      risk_reason: "No working days are scheduled.",
    };
  }
  let left = remaining;
  let finish: string | null = null;
  const walk: ProjectionWalk = {
    start: addDays(input.today, 1),
    pattern_weeks: pattern.weeks,
    working_days: 0,
    holidays_skipped: [],
    absences_skipped: [],
  };
  for (let offset = 1; offset <= PROJECTION_LIMIT_DAYS; offset += 1) {
    const day = addDays(input.today, offset);
    const hours = onDate(pattern, day) || 0;
    if (hours <= 0) continue;
    // A scheduled day that will not be worked: say which, and why.
    if (input.holidays.has(day)) {
      walk.holidays_skipped.push(day);
      continue;
    }
    if (absences.has(day)) {
      walk.absences_skipped.push(day);
      continue;
    }
    walk.working_days += 1;
    left -= hours;
    if (left <= 0.0001) {
      finish = day;
      break;
    }
  }
  if (!finish) {
    return {
      remaining_hours: remaining,
      weekly_hours: weekly,
      projected_finish: null,
      at_risk: true,
      risk_reason: "At the scheduled hours this would take more than two years.",
      walk,
    };
  }
  const late = Boolean(input.termEnd) && finish > String(input.termEnd);
  return {
    remaining_hours: remaining,
    weekly_hours: weekly,
    projected_finish: finish,
    at_risk: late,
    risk_reason: late ? `Projected to finish after the term ends on ${input.termEnd}.` : "",
    walk,
  };
}

/**
 * How many scheduled days in a row, counting back from yesterday, have no
 * log and no filed absence. Stops at `since` (nothing is expected before
 * a student's first day) and at 60 days.
 */
export function missedScheduledDays(input: {
  today: string;
  since: string;
  schedule: Schedule;
  holidays: Set<string>;
  /** Dates with a log or a filed absence. */
  accounted: Set<string>;
}): number {
  let missed = 0;
  for (let offset = 1; offset <= 60; offset += 1) {
    const day = addDays(input.today, -offset);
    if (day < input.since) break;
    if (input.holidays.has(day) || !((onDate(input.schedule, day) || 0) > 0)) continue;
    if (input.accounted.has(day)) break;
    missed += 1;
  }
  return missed;
}

type StudentFacts = {
  student_id: string;
  schedule_weeks: number;
  schedule_anchor: string | null;
  name: string;
  company: string | null;
  supervisor_id: string | null;
  required_hours: number;
  verified_hours: number;
  term_end: string | null;
  term_start: string | null;
  first_log: string | null;
};

/** The facts both the projections and the alerts start from, for active students. */
export async function loadStudents(
  pool: Pool,
  scope: { studentId?: string; supervisorId?: string; filters?: StudentFilters }
) {
  const filters = scope.filters ?? {};
  const bound = bindFilters(
    `
    SELECT s.student_id, s.name, s.company, s.supervisor_id, s.required_hours,
      COALESCE(s.schedule_weeks, 1)::int AS schedule_weeks, TO_CHAR(s.schedule_anchor, 'YYYY-MM-DD') AS schedule_anchor,
      (SELECT COALESCE(SUM(a.hours), 0)::float FROM attendance a
        WHERE a.student_id = s.student_id AND a.status = 'Verified') AS verified_hours,
      TO_CHAR(t.end_date, 'YYYY-MM-DD') AS term_end,
      TO_CHAR(t.start_date, 'YYYY-MM-DD') AS term_start,
      (SELECT TO_CHAR(MIN(a.date), 'YYYY-MM-DD') FROM attendance a WHERE a.student_id = s.student_id) AS first_log
    FROM students s
    LEFT JOIN terms t ON t.id = s.term_id
    WHERE s.is_active = TRUE
      AND ($1::text IS NULL OR s.student_id = $1)
      AND ($2::text IS NULL OR s.supervisor_id = $2)${filterConditions(filters, "s")}
    ORDER BY s.name
    `,
    [scope.studentId ?? null, scope.supervisorId ?? null],
    filters
  );
  const students = await pool.query<StudentFacts>(bound.text, bound.values);
  const ids = students.rows.map((row) => row.student_id);
  const [schedules, holidays, absences] = await Promise.all([
    pool.query<{ student_id: string; week: number; day: string; hours: number }>(
      `SELECT student_id, COALESCE(week, 1)::int AS week, INITCAP(TRIM(day)) AS day, COALESCE(SUM(hours), 0)::float AS hours
       FROM ojt_schedule WHERE is_active = TRUE AND student_id = ANY($1::text[])
       GROUP BY student_id, COALESCE(week, 1), INITCAP(TRIM(day))`,
      [ids]
    ),
    pool.query<{ date: string }>(`SELECT TO_CHAR(holiday_date, 'YYYY-MM-DD') AS date FROM holidays`),
    // Approved absences still to come: the projection does not count those days.
    pool.query<{ student_id: string; date: string }>(
      `SELECT student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date FROM absences
       WHERE student_id = ANY($1::text[]) AND status = 'Excused' AND date > ${phSql.today}`,
      [ids]
    ),
  ]);
  // Each student's pattern: one week, or two counted from the anchor Monday.
  const scheduleOf = new Map<string, SchedulePattern<number>>();
  for (const student of students.rows) {
    const weeks = Number(student.schedule_weeks) === 2 && student.schedule_anchor ? 2 : 1;
    scheduleOf.set(student.student_id, { weeks, anchor: weeks === 2 ? student.schedule_anchor : null, byWeek: { 1: {}, ...(weeks === 2 ? { 2: {} } : {}) } });
  }
  for (const row of schedules.rows) {
    const pattern = scheduleOf.get(row.student_id);
    if (!pattern) continue;
    // A week 2 row of a student back on a one-week pattern is not part of it.
    const week = Number(row.week) === 2 ? 2 : 1;
    if (week === 2 && pattern.weeks !== 2) continue;
    const days = (pattern.byWeek[week] ??= {});
    days[row.day] = Number(row.hours);
  }
  const absencesOf = new Map<string, Set<string>>();
  for (const row of absences.rows) {
    if (!absencesOf.has(row.student_id)) absencesOf.set(row.student_id, new Set());
    absencesOf.get(row.student_id)!.add(row.date);
  }
  return {
    students: students.rows,
    scheduleOf,
    absencesOf,
    holidays: new Set(holidays.rows.map((row) => row.date)),
  };
}

export type StudentProjection = Projection & {
  student_id: string;
  name: string;
  company: string | null;
  required_hours: number;
  verified_hours: number;
};

type Loaded = Awaited<ReturnType<typeof loadStudents>>;

/** The projection of each student already loaded. */
export function projectLoaded({ students, scheduleOf, absencesOf, holidays }: Loaded, today: string): StudentProjection[] {
  return students.map((row) => ({
    student_id: row.student_id,
    name: row.name,
    company: row.company,
    required_hours: Number(row.required_hours) || 0,
    verified_hours: Math.round(Number(row.verified_hours) * 100) / 100,
    ...projectFinish({
      today,
      requiredHours: Number(row.required_hours) || 0,
      verifiedHours: Number(row.verified_hours) || 0,
      schedule: scheduleOf.get(row.student_id) || {},
      holidays,
      absences: absencesOf.get(row.student_id),
      termEnd: row.term_end,
    }),
  }));
}

export async function projectionsFor(
  pool: Pool,
  scope: { studentId?: string; supervisorId?: string; filters?: StudentFilters },
  now: Date = new Date()
): Promise<StudentProjection[]> {
  return projectLoaded(await loadStudents(pool, scope), phClock(now).date);
}

/**
 * The performance figures, status and sentence of each student loaded
 * (services/performance.ts). Scheduled days are counted from a student's
 * first log, or from the start of their term when they have none.
 */
async function performanceOf(
  pool: Pool,
  loaded: Loaded,
  projections: StudentProjection[],
  today: string
): Promise<Map<string, Performance>> {
  const figures = await performanceFigures(
    pool,
    loaded.students.map((row) => ({ student_id: row.student_id, since: row.first_log ?? row.term_start })),
    loaded.holidays,
    today
  );
  const result = new Map<string, Performance>();
  for (const row of projections) {
    const own = figures.get(row.student_id);
    if (own) result.set(row.student_id, withStatus(row, own, today));
  }
  return result;
}

/** One active student's hours, projection and performance; null when there is no such active student. */
export async function studentPerformance(
  pool: Pool,
  studentId: string,
  now: Date = new Date()
): Promise<(StudentProjection & { performance: Performance }) | null> {
  const today = phClock(now).date;
  const loaded = await loadStudents(pool, { studentId });
  const [projection] = projectLoaded(loaded, today);
  if (!projection) return null;
  const performance = (await performanceOf(pool, loaded, [projection], today)).get(studentId);
  return performance ? { ...projection, performance } : null;
}

export type Alert = {
  key: "slow_supervisors" | "moa_expiring" | "missed_days" | "at_risk";
  title: string;
  /** Where the coordinator goes to act on it. */
  link: string;
  /** `id` is the account or record the item is about, when a button needs it. */
  items: { label: string; detail: string; link?: string; id?: string }[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything the coordinator should be told about, each kind only when it
 * has something. With `filters` (a term, college, program, block, company
 * or supervisor) the three kinds that are about students (slow reviews,
 * missed days, at risk) count only those students; agreements belong to
 * companies and are always all listed. Without any, as the weekly email
 * calls it, everything is counted.
 */
export async function coordinatorAlerts(
  pool: Pool,
  now: Date = new Date(),
  filters: StudentFilters = {}
): Promise<Alert[]> {
  const { date: today } = phClock(now);
  const inTerm = `TRUE${filterConditions(filters, "s")}`;
  const slowQuery = bindFilters(
      `
      WITH waiting AS (
        SELECT s.supervisor_id, a.time_out AS since FROM attendance a JOIN students s ON s.student_id = a.student_id
          WHERE s.is_active = TRUE AND ${inTerm} AND a.status = 'Pending' AND a.time_out IS NOT NULL
        UNION ALL
        SELECT s.supervisor_id, COALESCE(t.submitted_at, t.created_at) FROM tasks t JOIN students s ON s.student_id = t.student_id
          WHERE s.is_active = TRUE AND ${inTerm} AND t.status = 'Submitted'
        UNION ALL
        SELECT s.supervisor_id, d.uploaded_at FROM documents d JOIN students s ON s.student_id = d.student_id
          WHERE s.is_active = TRUE AND ${inTerm} AND d.status = 'Pending'
        UNION ALL
        SELECT s.supervisor_id, b.created_at FROM absences b JOIN students s ON s.student_id = b.student_id
          WHERE s.is_active = TRUE AND ${inTerm} AND b.status = 'Pending'
        UNION ALL
        SELECT s.supervisor_id, j.submitted_at FROM journals j JOIN students s ON s.student_id = j.student_id
          WHERE s.is_active = TRUE AND ${inTerm} AND j.status = 'Submitted'
      )
      SELECT sup.supervisor_id, sup.name, COUNT(*)::int AS waiting,
             FLOOR(EXTRACT(EPOCH FROM ${phSql.wallTime("$1::timestamptz")} - MIN(w.since)) / 86400)::int AS oldest_days
      FROM waiting w JOIN supervisors sup ON sup.supervisor_id = w.supervisor_id
      WHERE sup.is_active = TRUE
        AND w.since <= ${phSql.wallTime("$1::timestamptz")} - make_interval(days => $2::int)
      GROUP BY sup.supervisor_id, sup.name
      ORDER BY oldest_days DESC, sup.name
      `,
    [now.toISOString(), SLOW_REVIEW_DAYS],
    filters
  );
  const [slow, agreements, facts] = await Promise.all([
    pool.query<{ supervisor_id: string; name: string; waiting: number; oldest_days: number }>(
      slowQuery.text,
      slowQuery.values
    ),
    pool.query<{ id: number; name: string; moa_expiry: string; days: number }>(
      `SELECT c.id, c.name, TO_CHAR(c.moa_expiry, 'YYYY-MM-DD') AS moa_expiry,
              (c.moa_expiry - $1::date)::int AS days
       FROM companies c
       WHERE c.is_active = TRUE AND c.moa_expiry IS NOT NULL AND c.moa_expiry <= $1::date + $2::int
       ORDER BY c.moa_expiry, c.name`,
      [today, MOA_WARNING_DAYS]
    ),
    loadStudents(pool, { filters }),
  ]);

  const ids = facts.students.map((row) => row.student_id);
  const accounted = await pool.query<{ student_id: string; date: string }>(
    `SELECT student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date FROM attendance
       WHERE student_id = ANY($1::text[]) AND date >= $2::date - 61
     UNION
     SELECT student_id, TO_CHAR(date, 'YYYY-MM-DD') FROM absences
       WHERE student_id = ANY($1::text[]) AND date >= $2::date - 61`,
    [ids, today]
  );
  const accountedOf = new Map<string, Set<string>>();
  for (const row of accounted.rows) {
    if (!accountedOf.has(row.student_id)) accountedOf.set(row.student_id, new Set());
    accountedOf.get(row.student_id)!.add(row.date);
  }

  const missing: Alert["items"] = [];
  const risky: Alert["items"] = [];
  for (const row of facts.students) {
    const schedule = facts.scheduleOf.get(row.student_id) || {};
    const record = `/coordinator/students/${encodeURIComponent(row.student_id)}`;
    // Nothing is expected of a student before their first log or the start of their term.
    const since = row.first_log || row.term_start;
    if (since) {
      const days = missedScheduledDays({
        today,
        since,
        schedule,
        holidays: facts.holidays,
        accounted: accountedOf.get(row.student_id) || new Set(),
      });
      if (days >= MISSED_DAYS_ALERT) {
        missing.push({
          label: row.name,
          detail: `${days} scheduled days in a row with no attendance and no absence filed.`,
          link: record,
        });
      }
    }
    const projection = projectFinish({
      today,
      requiredHours: Number(row.required_hours) || 0,
      verifiedHours: Number(row.verified_hours) || 0,
      schedule,
      holidays: facts.holidays,
      absences: facts.absencesOf.get(row.student_id),
      termEnd: row.term_end,
    });
    if (projection.at_risk) risky.push({ label: row.name, detail: projection.risk_reason, link: record });
  }

  const alerts: Alert[] = [
    {
      key: "slow_supervisors",
      title: `Supervisors with reviews waiting more than ${SLOW_REVIEW_DAYS} days`,
      link: "/coordinator/supervisors",
      items: slow.rows.map((row) => ({
        id: row.supervisor_id,
        label: row.name,
        detail: `${plural(row.waiting, "item", "items")} waiting; the oldest for ${plural(row.oldest_days, "day", "days")}.`,
        link: `/coordinator/supervisors?q=${encodeURIComponent(row.supervisor_id)}`,
      })),
    },
    {
      key: "moa_expiring",
      title: `Agreements that have ended or end within ${MOA_WARNING_DAYS} days`,
      link: "/coordinator/companies",
      items: agreements.rows.map((row) => ({
        label: row.name,
        detail:
          row.days < 0
            ? `Ended on ${row.moa_expiry}.`
            : row.days === 0
              ? "Ends today."
              : `Ends on ${row.moa_expiry}, in ${plural(row.days, "day", "days")}.`,
      })),
    },
    {
      key: "missed_days",
      title: `Students with ${MISSED_DAYS_ALERT} or more scheduled days without attendance`,
      link: "/coordinator/monitoring",
      items: missing,
    },
    {
      key: "at_risk",
      title: "Students at risk of not finishing in time",
      link: "/coordinator/monitoring?risk=1",
      items: risky,
    },
  ];
  return alerts.filter((alert) => alert.items.length > 0);
}

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * The coordinators' weekly summary of the alerts: one email on the chosen
 * day (Monday unless COORDINATOR_DIGEST_DAY says otherwise), not sent when
 * there are no alerts, to anyone who turned summary emails off, or without
 * SMTP settings. Returns the coordinators emailed.
 */
export async function sendCoordinatorDigests(pool: Pool, deps: DigestDeps = {}): Promise<string[]> {
  const env = deps.env ?? process.env;
  if (!(deps.emailReady ?? deps.smtpReady ?? isEmailConfigured())) return [];
  const now = deps.now ?? new Date();
  const clock = phClock(now);
  const wanted = DAY_CODES.indexOf((env.COORDINATOR_DIGEST_DAY || "").trim().toUpperCase());
  if (clock.weekday !== (wanted >= 0 ? wanted : 1)) return [];
  if (clock.time < clockSetting(env.COORDINATOR_DIGEST_TIME, "07:30")) return [];

  const due = await pool.query<{ coordinator_id: string; name: string; email: string }>(
    `SELECT c.coordinator_id, c.name, c.email FROM coordinators c
     WHERE c.is_active = TRUE AND c.email IS NOT NULL AND c.email <> ''
       AND NOT EXISTS (
         SELECT 1 FROM digest_log g
         WHERE g.kind = 'coordinator_weekly' AND g.account_id = c.coordinator_id AND g.period_key = $1
       )`,
    [clock.date]
  );
  if (due.rows.length === 0) return [];
  const alerts = await coordinatorAlerts(pool, now);
  if (alerts.length === 0) return [];

  const send = deps.send ?? sendEmail;
  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  const body = alerts.flatMap((alert) => [
    `${alert.title} (${alert.items.length})`,
    ...alert.items.slice(0, 10).map((item) => `  - ${item.label}: ${item.detail}`),
    ...(alert.items.length > 10 ? [`  - and ${alert.items.length - 10} more`] : []),
    "",
  ]);
  const sent: string[] = [];
  for (const row of due.rows) {
    if (!(await allowsChannel(pool, "coordinator", row.coordinator_id, "digest", "email"))) continue;
    const delivered = await sendOnce(pool, "coordinator_weekly", row.coordinator_id, clock.date, () =>
      send({
        to: row.email,
        subject: `INTERNet: ${plural(alerts.length, "thing needs", "things need")} your attention this week`,
        text: [
          `Hello ${row.name},`,
          "",
          ...body,
          base ? `Open your dashboard: ${base}/coordinator/dashboard` : "Sign in to INTERNet to see them.",
          "",
          "This summary is sent once a week, only when there is something to report. You can turn it off in INTERNet under Profile > Notifications.",
        ].join("\n"),
      })
    );
    if (delivered) sent.push(row.coordinator_id);
  }
  return sent;
}

/*
|--------------------------------------------------------------------------
| THE PROGRAMME REPORT
|--------------------------------------------------------------------------
|
| One row per active student (optionally one term's) with their hours and
| projection, and one row per company summing its students. It is what the
| exports are made from, so a file and the screens can be checked against
| each other: every figure here comes from the same verified attendance
| the Monitoring page counts.
|
*/

export type ReportStudent = StudentProjection & {
  program: string | null;
  /** The college, the program's short code, the major and the block, when the student is linked to them. */
  college: string | null;
  program_code: string | null;
  major: string | null;
  block: string | null;
  supervisor: string | null;
  term: string | null;
  completion: number;
  /** Only when the report was asked for with `performance`. */
  performance?: Performance;
};

export type ReportCompany = {
  company: string;
  students: number;
  verified_hours: number;
  required_hours: number;
  average_completion: number;
  completed: number;
  at_risk: number;
  /** From the company record, when there is one of that name. */
  moa_expiry: string | null;
  last_visit: string | null;
};

/** Students summed under one heading: a program, or a block. */
export type ReportGroup = {
  name: string;
  students: number;
  verified_hours: number;
  required_hours: number;
  average_completion: number;
  completed: number;
  at_risk: number;
};

function summed(groups: Map<string, ReportStudent[]>): ReportGroup[] {
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...groups.entries()]
    .map(([name, rows]) => ({
      name,
      students: rows.length,
      verified_hours: round(rows.reduce((sum, row) => sum + row.verified_hours, 0)),
      required_hours: round(rows.reduce((sum, row) => sum + row.required_hours, 0)),
      average_completion: Math.round(rows.reduce((sum, row) => sum + row.completion, 0) / rows.length),
      completed: rows.filter((row) => row.remaining_hours === 0 && row.required_hours > 0).length,
      at_risk: rows.filter((row) => row.at_risk).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function programmeReport(
  pool: Pool,
  filters: StudentFilters = {},
  now: Date = new Date(),
  // The performance figures cost four more queries, so only the pages that show them ask.
  options: { performance?: boolean } = {}
): Promise<{
  students: ReportStudent[];
  companies: ReportCompany[];
  programs: ReportGroup[];
  blocks: ReportGroup[];
}> {
  const today = phClock(now).date;
  const loaded = await loadStudents(pool, { filters });
  const projections = projectLoaded(loaded, today);
  const performance = options.performance ? await performanceOf(pool, loaded, projections, today) : null;
  const ids = projections.map((row) => row.student_id);
  const [extra, records] = await Promise.all([
    pool.query<{
      student_id: string;
      program: string | null;
      supervisor: string | null;
      term: string | null;
      college: string | null;
      program_code: string | null;
      program_name: string | null;
      major: string | null;
      block: string | null;
    }>(
      `SELECT s.student_id, s.program, sup.name AS supervisor, t.name AS term,
              col.name AS college, p.short_code AS program_code, p.name AS program_name,
              m.name AS major,
              CASE WHEN b.id IS NULL THEN NULL
                   ELSE bp.short_code || ' ' || b.year_level || UPPER(TRIM(b.section)) END AS block
       FROM students s
       LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
       LEFT JOIN terms t ON t.id = s.term_id
       LEFT JOIN programs p ON p.id = s.program_id
       LEFT JOIN colleges col ON col.id = p.college_id
       LEFT JOIN majors m ON m.id = s.major_id
       LEFT JOIN blocks b ON b.id = s.block_id
       LEFT JOIN programs bp ON bp.id = b.program_id
       WHERE s.student_id = ANY($1::text[])`,
      [ids]
    ),
    pool.query<{ name: string; moa_expiry: string | null; last_visit: string | null }>(
      `SELECT c.name, TO_CHAR(c.moa_expiry, 'YYYY-MM-DD') AS moa_expiry,
              (SELECT TO_CHAR(MAX(v.visit_date), 'YYYY-MM-DD') FROM site_visits v WHERE v.company_id = c.id) AS last_visit
       FROM companies c`
    ),
  ]);
  const extraOf = new Map(extra.rows.map((row) => [row.student_id, row]));
  const students: ReportStudent[] = projections.map((row) => ({
    ...row,
    program: extraOf.get(row.student_id)?.program ?? null,
    supervisor: extraOf.get(row.student_id)?.supervisor ?? null,
    term: extraOf.get(row.student_id)?.term ?? null,
    college: extraOf.get(row.student_id)?.college ?? null,
    program_code: extraOf.get(row.student_id)?.program_code ?? null,
    major: extraOf.get(row.student_id)?.major ?? null,
    block: extraOf.get(row.student_id)?.block ?? null,
    completion:
      row.required_hours > 0 ? Math.min(100, Math.round((row.verified_hours / row.required_hours) * 100)) : 0,
    ...(performance?.has(row.student_id) ? { performance: performance.get(row.student_id) } : {}),
  }));

  const recordOf = new Map(records.rows.map((row) => [row.name.trim().toLowerCase(), row]));
  const groups = new Map<string, ReportStudent[]>();
  for (const row of students) {
    const name = (row.company || "").trim() || "No company";
    groups.set(name, [...(groups.get(name) || []), row]);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const companies: ReportCompany[] = [...groups.entries()]
    .map(([company, rows]) => ({
      company,
      students: rows.length,
      verified_hours: round(rows.reduce((sum, row) => sum + row.verified_hours, 0)),
      required_hours: round(rows.reduce((sum, row) => sum + row.required_hours, 0)),
      average_completion: Math.round(rows.reduce((sum, row) => sum + row.completion, 0) / rows.length),
      completed: rows.filter((row) => row.remaining_hours === 0 && row.required_hours > 0).length,
      at_risk: rows.filter((row) => row.at_risk).length,
      moa_expiry: recordOf.get(company.toLowerCase())?.moa_expiry ?? null,
      last_visit: recordOf.get(company.toLowerCase())?.last_visit ?? null,
    }))
    .sort((a, b) => a.company.localeCompare(b.company));

  // The same sums by program and by block. A student linked to a program
  // is counted under its name; one who is not, under the text on their
  // account, so nobody is left out of the table.
  const byProgram = new Map<string, ReportStudent[]>();
  const byBlock = new Map<string, ReportStudent[]>();
  for (const row of students) {
    const program =
      extraOf.get(row.student_id)?.program_name || (row.program || "").trim() || "No program";
    byProgram.set(program, [...(byProgram.get(program) || []), row]);
    const block = row.block || "No block";
    byBlock.set(block, [...(byBlock.get(block) || []), row]);
  }
  return { students, companies, programs: summed(byProgram), blocks: summed(byBlock) };
}
