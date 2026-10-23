/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S KEY FIGURES: THE ARITHMETIC
|--------------------------------------------------------------------------
|
| Each figure is worked out "as of" a date, by a plain function, from rows
| already read from the database. Today's value is the figure as of today;
| the small chart on a card is the same function run for each of the seven
| weeks before. So a card's history and its value can never disagree, and
| the functions can be tested with made-up rows and dates.
|
| What the history cannot know: a schedule, a term's end date and an
| agreement's end date are kept only as they are now, not as they were. A
| past week is therefore worked out from today's schedule and dates. The
| attendance, decisions, documents and concerns are dated, and are right
| for the week they are counted in.
|
| Nothing here writes to the database.
|
*/

import type { Pool } from "pg";
import { phClock } from "./phTime";
import { loadStudents, projectFinish } from "./insights";
import { onDate, type SchedulePattern } from "./schedulePattern";
import { bindFilters, filterConditions, hasFilters, type StudentFilters } from "./studentScope";
import {
  AGREEMENT_WITHIN_DAYS,
  CONCERN_OLD_AFTER_DAYS,
  KPI_DEFINITIONS,
  KPI_WINDOW_DAYS,
  REQUIREMENTS_DUE_AT,
  type KpiDefinition,
  type KpiKey,
} from "./kpiDefinitions";


export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const percent = (part: number, whole: number) => round1((part / whole) * 100);

/** A figure, and how many things it was worked out from ("12 of 14 students"). */
export type Figure = { value: number | null; basis: string };

const NOTHING = (basis: string): Figure => ({ value: null, basis });

/** One student, with what the figures need. Dates are "YYYY-MM-DD". */
export type KpiStudent = {
  required_hours: number;
  /** Hours per weekday name, as scheduled now. */
  /** A one- or two-week pattern (or the old weekday map). */
  schedule: SchedulePattern<number> | Record<string, number>;
  term_end: string | null;
  /** Nothing is expected before this: the first log, or the term's start. */
  since: string | null;
  /** Verified hours, by the date of the log. */
  verified: { date: string; hours: number }[];
  /** Dates with an attendance log, whatever its status. */
  logged: Set<string>;
  /** Required document name to the date it was approved. */
  approved: Map<string, string>;
};

const verifiedBy = (student: KpiStudent, asOf: string) =>
  student.verified.reduce((sum, log) => (log.date <= asOf ? sum + log.hours : sum), 0);

/** The share of students whose remaining hours fit before their term ends. */
export function onTrackAt(asOf: string, students: KpiStudent[], holidays: Set<string>): Figure {
  if (students.length === 0) return NOTHING("No active students");
  const onTrack = students.filter(
    (student) =>
      !projectFinish({
        today: asOf,
        requiredHours: student.required_hours,
        verifiedHours: verifiedBy(student, asOf),
        schedule: student.schedule,
        holidays,
        termEnd: student.term_end,
      }).at_risk
  ).length;
  return {
    value: percent(onTrack, students.length),
    basis: `${onTrack} of ${students.length} ${students.length === 1 ? "student" : "students"}`,
  };
}

/** Of the scheduled days in the window before `asOf`, the share with a log. */
export function attendanceRateAt(asOf: string, students: KpiStudent[], holidays: Set<string>): Figure {
  let scheduled = 0;
  let attended = 0;
  for (const student of students) {
    if (!student.since) continue;
    for (let back = 1; back <= KPI_WINDOW_DAYS; back += 1) {
      const day = addDays(asOf, -back);
      if (day < student.since) break;
      if (holidays.has(day) || !((onDate(student.schedule, day) || 0) > 0)) continue;
      scheduled += 1;
      if (student.logged.has(day)) attended += 1;
    }
  }
  if (scheduled === 0) return NOTHING("No scheduled days in the last 4 weeks");
  return { value: percent(attended, scheduled), basis: `${attended} of ${scheduled} scheduled days` };
}

/** A supervisor's decision on a log: the day it was made, and how long after time-out. */
export type Decision = { decided_on: string; days: number };

/** The middle value of the days from time-out to decision, for decisions in the window. */
export function reviewTimeAt(asOf: string, decisions: Decision[]): Figure {
  const from = addDays(asOf, -KPI_WINDOW_DAYS);
  const waits = decisions
    .filter((decision) => decision.decided_on > from && decision.decided_on <= asOf)
    .map((decision) => Math.max(0, decision.days))
    .sort((a, b) => a - b);
  if (waits.length === 0) return NOTHING("No logs decided in the last 4 weeks");
  const middle = Math.floor(waits.length / 2);
  const median = waits.length % 2 === 1 ? waits[middle] : (waits[middle - 1] + waits[middle]) / 2;
  return { value: round1(median), basis: `${waits.length} ${waits.length === 1 ? "log" : "logs"} decided` };
}

/** Of the students past half their hours, the share with every required document approved. */
export function requirementsCompleteAt(asOf: string, students: KpiStudent[], requirements: string[]): Figure {
  const due = students.filter(
    (student) =>
      student.required_hours > 0 &&
      verifiedBy(student, asOf) >= student.required_hours * REQUIREMENTS_DUE_AT
  );
  if (due.length === 0) return NOTHING("No student is past 50% of their hours");
  const complete = due.filter((student) =>
    requirements.every((name) => {
      const approvedOn = student.approved.get(name);
      return approvedOn !== undefined && approvedOn <= asOf;
    })
  ).length;
  return {
    value: percent(complete, due.length),
    basis: `${complete} of ${due.length} ${due.length === 1 ? "student" : "students"} past 50%`,
  };
}

/** A concern: the day it was reported, and the day it was resolved or dismissed. */
export type Concern = { created_on: string; closed_on: string | null };

export function oldConcernsAt(asOf: string, concerns: Concern[]): Figure {
  const before = addDays(asOf, -CONCERN_OLD_AFTER_DAYS);
  const open = concerns.filter((concern) => concern.created_on <= asOf && (!concern.closed_on || concern.closed_on > asOf));
  const old = open.filter((concern) => concern.created_on < before).length;
  return { value: old, basis: `${open.length} open in all` };
}

/** Agreements that have ended, or end within the warning period, as their dates stand now. */
export function agreementsEndingAt(asOf: string, expiries: string[]): Figure {
  const until = addDays(asOf, AGREEMENT_WITHIN_DAYS);
  const ending = expiries.filter((date) => date <= until).length;
  return {
    value: ending,
    basis: `${expiries.length} ${expiries.length === 1 ? "company has" : "companies have"} an end date`,
  };
}

export type KpiInputs = {
  students: KpiStudent[];
  holidays: Set<string>;
  decisions: Decision[];
  requirements: string[];
  concerns: Concern[];
  expiries: string[];
};

const FIGURES: Record<KpiKey, (asOf: string, inputs: KpiInputs) => Figure> = {
  on_track: (asOf, inputs) => onTrackAt(asOf, inputs.students, inputs.holidays),
  attendance_rate: (asOf, inputs) => attendanceRateAt(asOf, inputs.students, inputs.holidays),
  review_time: (asOf, inputs) => reviewTimeAt(asOf, inputs.decisions),
  requirements_complete: (asOf, inputs) => requirementsCompleteAt(asOf, inputs.students, inputs.requirements),
  old_concerns: (asOf, inputs) => oldConcernsAt(asOf, inputs.concerns),
  agreements_ending: (asOf, inputs) => agreementsEndingAt(asOf, inputs.expiries),
};

export type Kpi = KpiDefinition & {
  value: number | null;
  /** One line of context: what the figure was worked out from. */
  basis: string;
};

/** Every figure as of `today`, from rows already loaded. */
export function computeKpis(today: string, inputs: KpiInputs): Kpi[] {
  return KPI_DEFINITIONS.map((definition) => {
    const now = FIGURES[definition.key](today, inputs);
    return { ...definition, value: now.value, basis: now.basis };
  });
}

/** Reads what the figures need for the active students, optionally one term's. */
export async function loadKpiInputs(
  pool: Pool,
  filters: StudentFilters,
  today: string
): Promise<KpiInputs> {
  const facts = await loadStudents(pool, { filters });
  const ids = facts.students.map((row) => row.student_id);
  // With a filter chosen: the concerns filed by, or about, the chosen students.
  const concernQuery = bindFilters(
    `SELECT TO_CHAR(c.created_at, 'YYYY-MM-DD') AS created_on,
            CASE WHEN c.status IN ('Resolved', 'Dismissed')
                 THEN TO_CHAR(COALESCE(c.resolved_at, c.updated_at, c.created_at), 'YYYY-MM-DD') END AS closed_on
     FROM complaints c
     ${
       hasFilters(filters)
         ? `WHERE EXISTS (
              SELECT 1 FROM students s
              WHERE s.student_id IN (c.student_id, c.reported_student_id)${filterConditions(filters, "s")}
            )`
         : ""
     }`,
    [],
    filters
  );
  // Far enough back for the window before today.
  const historyFrom = addDays(today, -(KPI_WINDOW_DAYS + 7));

  const [logs, decisions, requirements, approvals, concerns, companies] = await Promise.all([
    pool.query<{ student_id: string; date: string; hours: number; verified: boolean }>(
      `SELECT a.student_id, TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
              COALESCE(a.hours, 0)::float AS hours, (a.status = 'Verified') AS verified
       FROM attendance a WHERE a.student_id = ANY($1::text[])`,
      [ids]
    ),
    pool.query<{ decided_on: string; days: number }>(
      `SELECT TO_CHAR(a.verified_at, 'YYYY-MM-DD') AS decided_on,
              (EXTRACT(EPOCH FROM (a.verified_at - a.time_out)) / 86400)::float AS days
       FROM attendance a
       WHERE a.student_id = ANY($1::text[])
         AND a.verified_at IS NOT NULL AND a.time_out IS NOT NULL
         AND a.status IN ('Verified', 'Rejected')
         AND COALESCE(a.verifier_role, 'supervisor') = 'supervisor'
         AND a.verified_at >= $2::date`,
      [ids, historyFrom]
    ),
    pool.query<{ name: string }>(`SELECT name FROM ojt_requirements
       WHERE is_active = TRUE AND due_rule IS DISTINCT FROM 'weekly'
         AND COALESCE(jsonb_array_length(applies_to->'program_ids'), 0) = 0
         AND COALESCE(jsonb_array_length(applies_to->'block_ids'), 0) = 0
       ORDER BY name`),
    pool.query<{ student_id: string; doc_type: string; approved_on: string }>(
      `SELECT d.student_id, d.doc_type,
              TO_CHAR(MIN(COALESCE(d.reviewed_at, d.uploaded_at)), 'YYYY-MM-DD') AS approved_on
       FROM documents d
       WHERE d.student_id = ANY($1::text[]) AND d.status = 'Approved'
       GROUP BY d.student_id, d.doc_type`,
      [ids]
    ),
    pool.query<{ created_on: string; closed_on: string | null }>(concernQuery.text, concernQuery.values),
    pool.query<{ moa_expiry: string }>(
      `SELECT TO_CHAR(moa_expiry, 'YYYY-MM-DD') AS moa_expiry FROM companies
       WHERE is_active = TRUE AND moa_expiry IS NOT NULL`
    ),
  ]);

  const byStudent = new Map<string, KpiStudent>();
  for (const row of facts.students) {
    byStudent.set(row.student_id, {
      required_hours: Number(row.required_hours) || 0,
      schedule: facts.scheduleOf.get(row.student_id) || {},
      term_end: row.term_end,
      since: row.first_log || row.term_start,
      verified: [],
      logged: new Set(),
      approved: new Map(),
    });
  }
  for (const row of logs.rows) {
    const student = byStudent.get(row.student_id);
    if (!student) continue;
    student.logged.add(row.date);
    if (row.verified) student.verified.push({ date: row.date, hours: Number(row.hours) || 0 });
  }
  for (const row of approvals.rows) {
    byStudent.get(row.student_id)?.approved.set(row.doc_type, row.approved_on);
  }

  return {
    students: [...byStudent.values()],
    holidays: facts.holidays,
    decisions: decisions.rows.map((row) => ({ decided_on: row.decided_on, days: Number(row.days) || 0 })),
    requirements: requirements.rows.map((row) => row.name),
    concerns: concerns.rows,
    expiries: companies.rows.map((row) => row.moa_expiry),
  };
}

export async function coordinatorKpis(
  pool: Pool,
  filters: StudentFilters = {},
  now: Date = new Date()
): Promise<{ as_of: string; kpis: Kpi[] }> {
  const { date: today } = phClock(now);
  const inputs = await loadKpiInputs(pool, filters, today);
  return { as_of: today, kpis: computeKpis(today, inputs) };
}
