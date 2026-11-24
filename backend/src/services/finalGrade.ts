import type { Pool, PoolClient } from "pg";
import { ojtSetting } from "./ojtSettings";
import { phSql } from "./phTime";

/*
|--------------------------------------------------------------------------
| THE FINAL OJT GRADE (Phase 1.5, migration 082)
|--------------------------------------------------------------------------
|
| Two halves, each out of 100:
|
|   HTE          the supervisor's final evaluation (final_evaluations,
|                services/evaluationGrade.ts). A form without weights has
|                no grade of its own; its average is put on the same scale
|                (average / top of the scale x 50 + 50), which is what the
|                form's formula gives when every criterion weighs the same.
|   instructor   the coordinator's four scores, weighed by the term's
|                weights (25 each unless the term says otherwise).
|
|   final = (HTE x split + instructor x (100 - split)) / 100
|
| The split is the OJT rule grade_split_hte (50); it and the instructor's
| weights are pending the university's confirmation. Every percentage is
| rounded to 2 decimals, half up, as the university computes a GWA. The
| final grade is also given on the 1.00 to 5.00 scale (GRADE_SCALE below:
| the common Philippine table, to be checked against PSU's own).
|
| A grade is final only when both halves exist; until then it is waiting
| for the HTE, the instructor, or both.
|
*/

type Db = Pick<Pool | PoolClient, "query">;

export const SCORE_KEYS = ["logs", "punctuality", "preparation", "conduct"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export type Weights = Record<ScoreKey, number>;
export type Scores = Record<ScoreKey, number>;

export const DEFAULT_WEIGHTS: Weights = { logs: 25, punctuality: 25, preparation: 25, conduct: 25 };

/** Half up, to 2 decimals, without the float error of 1.005 * 100. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A score out of 100 with at most 2 decimals, or null. */
export function readScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return round2(value) === value ? value : null;
}

/** The four weights, each a whole number, adding up to 100; or the problem. */
export function readWeights(value: unknown): Weights | { problem: string } {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!input) return { problem: "Give a weight for logs, punctuality, preparation and conduct." };
  const out = {} as Weights;
  for (const key of SCORE_KEYS) {
    const weight = input[key];
    if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 0 || weight > 100) {
      return { problem: `The weight of ${key} is a whole number from 0 to 100.` };
    }
    out[key] = weight;
  }
  const total = SCORE_KEYS.reduce((sum, key) => sum + out[key], 0);
  if (total !== 100) return { problem: `The four weights add up to ${total}; they must add up to 100.` };
  return out;
}

/** A term's stored weights, or the default. */
export function weightsOf(stored: unknown): Weights {
  const read = readWeights(stored);
  return "problem" in read ? DEFAULT_WEIGHTS : read;
}

/**
 * The 1.00 to 5.00 scale: the lowest percentage that earns each grade.
 * 75 passes (3.00); below it is 5.00. The table most Philippine
 * universities use; replace it here if PSU's differs.
 */
export const GRADE_SCALE: readonly { from: number; grade: string }[] = [
  { from: 97, grade: "1.00" },
  { from: 94, grade: "1.25" },
  { from: 91, grade: "1.50" },
  { from: 88, grade: "1.75" },
  { from: 85, grade: "2.00" },
  { from: 82, grade: "2.25" },
  { from: 79, grade: "2.50" },
  { from: 76, grade: "2.75" },
  { from: 75, grade: "3.00" },
];

/** A percentage (already rounded to 2 decimals) on the 1.00 to 5.00 scale. */
export function equivalentGrade(percent: number): string {
  return GRADE_SCALE.find((step) => percent >= step.from)?.grade ?? "5.00";
}

export function instructorGrade(scores: Scores, weights: Weights): number {
  return round2(SCORE_KEYS.reduce((sum, key) => sum + scores[key] * weights[key], 0) / 100);
}

/** The HTE half from a final evaluation's grade, or its average on the form's scale. */
export function hteGrade(row: { grade: number | string | null; average: number | string | null; scale_max: number | string | null } | null): number | null {
  if (!row) return null;
  if (row.grade !== null && row.grade !== undefined) return round2(Number(row.grade));
  const average = Number(row.average);
  const scale = Number(row.scale_max);
  if (!Number.isFinite(average) || !(scale > 0)) return null;
  return round2((average / scale) * 50 + 50);
}

export type GradeState = "final" | "waiting_hte" | "waiting_instructor" | "waiting_both";

export function finalGrade(hte: number | null, instructor: number | null, split: number): { final: number | null; state: GradeState } {
  if (hte === null && instructor === null) return { final: null, state: "waiting_both" };
  if (hte === null) return { final: null, state: "waiting_hte" };
  if (instructor === null) return { final: null, state: "waiting_instructor" };
  return { final: round2((hte * split + instructor * (100 - split)) / 100), state: "final" };
}

/*
| The two suggestions the instructor's form starts from. Each is a share
| out of 100, or null when there is nothing to count yet. Within the
| student's term when they have one, up to yesterday.
*/

/**
 * Punctuality: of the deliverables, weekly reports and daily reports that
 * were due, the share handed in on time. A deliverable is due on its date
 * (handed in late or not at all counts against); a weekly report is on time
 * by the Monday after its week; a daily report by the next day.
 */
export async function punctualitySuggestion(db: Db, studentId: string): Promise<{ score: number | null; on_time: number; counted: number }> {
  const row = (
    await db.query<{ on_time: string; counted: string }>(
      `WITH span AS (
         SELECT COALESCE(t.start_date, DATE '1900-01-01') AS from_day,
                LEAST(COALESCE(t.end_date, ${phSql.today}), ${phSql.today} - 1) AS to_day
         FROM students s LEFT JOIN terms t ON t.id = s.term_id
         WHERE TRIM(s.student_id::text) = TRIM($1)
       ), items AS (
         SELECT (d.uploaded_at IS NOT NULL AND d.uploaded_at::date <= di.due_date) AS on_time
         FROM deliverable_items di
         LEFT JOIN documents d ON d.id = di.document_id
         CROSS JOIN span
         WHERE di.student_id = $1 AND di.due_date BETWEEN span.from_day AND span.to_day
         UNION ALL
         SELECT j.submitted_at::date <= j.week_start + 7
         FROM journals j CROSS JOIN span
         WHERE j.student_id = $1 AND j.week_start BETWEEN span.from_day AND span.to_day
         UNION ALL
         SELECT ${phSql.date("r.created_at")} <= r.report_date + 1
         FROM daily_reports r CROSS JOIN span
         WHERE r.student_id = $1 AND r.report_date BETWEEN span.from_day AND span.to_day
       )
       SELECT COUNT(*) FILTER (WHERE on_time) AS on_time, COUNT(*) AS counted FROM items`,
      [studentId]
    )
  ).rows[0];
  const counted = Number(row?.counted ?? 0);
  const onTime = Number(row?.on_time ?? 0);
  return { score: counted === 0 ? null : round2((onTime / counted) * 100), on_time: onTime, counted };
}

/**
 * Logs: of the reports expected, the share handed in. A daily report is
 * expected for each day the student timed in, a weekly report for each week
 * they did (the current week is not over, so it is left out).
 */
export async function logsSuggestion(db: Db, studentId: string): Promise<{ score: number | null; submitted: number; expected: number }> {
  const row = (
    await db.query<{ days: string; days_done: string; weeks: string; weeks_done: string }>(
      `WITH span AS (
         SELECT COALESCE(t.start_date, DATE '1900-01-01') AS from_day,
                LEAST(COALESCE(t.end_date, ${phSql.today}), ${phSql.today} - 1) AS to_day
         FROM students s LEFT JOIN terms t ON t.id = s.term_id
         WHERE TRIM(s.student_id::text) = TRIM($1)
       ), days AS (
         SELECT DISTINCT a.date AS day FROM attendance a CROSS JOIN span
         WHERE a.student_id = $1 AND a.date BETWEEN span.from_day AND span.to_day
       ), weeks AS (
         SELECT DISTINCT (day - ((EXTRACT(ISODOW FROM day)::int - 1)))::date AS week_start FROM days
       )
       SELECT
         (SELECT COUNT(*) FROM days) AS days,
         (SELECT COUNT(*) FROM days WHERE EXISTS (SELECT 1 FROM daily_reports r WHERE r.student_id = $1 AND r.report_date = days.day)) AS days_done,
         (SELECT COUNT(*) FROM weeks WHERE week_start + 6 < ${phSql.today}) AS weeks,
         (SELECT COUNT(*) FROM weeks WHERE week_start + 6 < ${phSql.today}
            AND EXISTS (SELECT 1 FROM journals j WHERE j.student_id = $1 AND j.week_start = weeks.week_start)) AS weeks_done`,
      [studentId]
    )
  ).rows[0];
  const expected = Number(row?.days ?? 0) + Number(row?.weeks ?? 0);
  const submitted = Number(row?.days_done ?? 0) + Number(row?.weeks_done ?? 0);
  return { score: expected === 0 ? null : round2((submitted / expected) * 100), submitted, expected };
}

/** The columns the grade sheet and the breakdown read, for students aliased s. */
export const GRADE_COLUMNS = `
  TRIM(s.student_id::text) AS student_id, s.name, s.term_id,
  p.short_code AS program, CASE WHEN b.id IS NULL THEN NULL ELSE b.year_level::text || UPPER(TRIM(b.section)) END AS block,
  fe.grade::float AS hte_raw_grade, fe.average::float AS hte_average, (fe.form_snapshot->>'scale_max')::int AS hte_scale_max,
  fe.supervisor_name, fe.updated_at AS hte_at,
  ie.logs_score::float AS logs_score, ie.punctuality_score::float AS punctuality_score,
  ie.preparation_score::float AS preparation_score, ie.conduct_score::float AS conduct_score,
  ie.remarks, ie.submitted_at AS instructor_at, ie.version, ie.evaluator_id,
  ie.released_at, ie.released_grade::float AS released_grade,
  t.grade_weights`;

/** The joins GRADE_COLUMNS needs, after "FROM students s". */
export const GRADE_JOINS = `
  LEFT JOIN programs p ON p.id = s.program_id
  LEFT JOIN blocks b ON b.id = s.block_id
  LEFT JOIN terms t ON t.id = s.term_id
  LEFT JOIN final_evaluations fe ON fe.student_id = s.student_id
  LEFT JOIN instructor_evaluations ie ON ie.student_id = s.student_id AND COALESCE(ie.term_id, 0) = COALESCE(s.term_id, 0)`;

export type GradeRow = {
  student_id: string;
  name: string;
  term_id: number | null;
  program: string | null;
  block: string | null;
  hte_raw_grade: number | null;
  hte_average: number | null;
  hte_scale_max: number | null;
  supervisor_name: string | null;
  hte_at: Date | null;
  logs_score: number | null;
  punctuality_score: number | null;
  preparation_score: number | null;
  conduct_score: number | null;
  remarks: string | null;
  instructor_at: Date | null;
  version: number | null;
  evaluator_id: string | null;
  released_at: Date | null;
  released_grade: number | null;
  grade_weights: unknown;
};

/** One student's grade, both halves and the final, from a GRADE_COLUMNS row. */
export function gradeOf(row: GradeRow, split: number) {
  const weights = weightsOf(row.grade_weights);
  const hte = row.hte_raw_grade === null && row.hte_average === null ? null : hteGrade({ grade: row.hte_raw_grade, average: row.hte_average, scale_max: row.hte_scale_max });
  const scores: Scores | null =
    row.logs_score === null
      ? null
      : { logs: row.logs_score, punctuality: row.punctuality_score ?? 0, preparation: row.preparation_score ?? 0, conduct: row.conduct_score ?? 0 };
  const instructor = scores ? instructorGrade(scores, weights) : null;
  const { final, state } = finalGrade(hte, instructor, split);
  return {
    student_id: row.student_id,
    name: row.name,
    program: row.program,
    block: row.block,
    hte,
    hte_by: row.supervisor_name,
    instructor,
    scores,
    remarks: row.remarks,
    version: row.version,
    final,
    // Phase 1.5: the final grade on the 1.00 to 5.00 scale.
    equivalent: final === null ? null : equivalentGrade(final),
    state,
    released_at: row.released_at,
    released_grade: row.released_grade,
    released_equivalent: row.released_grade === null ? null : equivalentGrade(row.released_grade),
    // Released, then either half changed: what the student has is not today's grade.
    changed_since_release: row.released_at !== null && final !== row.released_grade,
    weights,
  };
}

export const gradeSplit = (db: Db) => ojtSetting(db, "grade_split_hte");
