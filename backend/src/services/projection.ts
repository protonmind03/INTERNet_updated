import type { Pool } from "pg";
import { loadStudents, projectLoaded, type StudentProjection } from "./insights";
import { phClock, phSql } from "./phTime";
import type { StudentFilters } from "./studentScope";

/*
|--------------------------------------------------------------------------
| THE EXPECTED END DATE, KEPT
|--------------------------------------------------------------------------
|
| Iteration 11 (migration 061). The server works out when each student is
| expected to finish (services/insights.ts, projectFinish: the hours left,
| walked through their one- or two-week pattern from the next day, skipping
| holidays and approved absences) and keeps it in student_projections, with
| how it was worked out. Every view reads that one value.
|
| It is worked out again when what it depends on changes: a log decision
| (through syncCompletion in server.ts), a schedule saved for a student or a
| block, a holiday added, changed or removed, an absence decided; and
| nightly, by the minute loop, for anyone whose value is from an earlier
| day (so a missed night catches up). Each time, that day's snapshot in
| student_projection_snapshots is written (one per student per day).
|
*/

/** What caused a recompute, kept with the value. */
export type ProjectionCause = "log" | "schedule" | "holiday" | "absence" | "nightly" | "read";

/** How many students one nightly round recomputes at most (the next minute takes the rest). */
const NIGHTLY_BATCH = 200;

export type StoredProjection = {
  student_id: string;
  projected_end_date: string | null;
  required_hours: number;
  verified_hours: number;
  remaining_hours: number;
  weekly_hours: number;
  pattern_weeks: number;
  walk_start: string | null;
  working_days: number;
  holidays_skipped: string[];
  absences_skipped: string[];
  at_risk: boolean;
  risk_reason: string | null;
  cause: string | null;
  computed_at: string;
};

async function store(pool: Pool, rows: StudentProjection[], cause: ProjectionCause, today: string): Promise<void> {
  for (const row of rows) {
    const walk = row.walk;
    await pool.query(
      `INSERT INTO student_projections
         (student_id, projected_end_date, required_hours, verified_hours, remaining_hours, weekly_hours,
          pattern_weeks, walk_start, working_days, holidays_skipped, absences_skipped, at_risk, risk_reason, cause, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (student_id) DO UPDATE SET
         projected_end_date = EXCLUDED.projected_end_date, required_hours = EXCLUDED.required_hours,
         verified_hours = EXCLUDED.verified_hours, remaining_hours = EXCLUDED.remaining_hours,
         weekly_hours = EXCLUDED.weekly_hours, pattern_weeks = EXCLUDED.pattern_weeks, walk_start = EXCLUDED.walk_start,
         working_days = EXCLUDED.working_days, holidays_skipped = EXCLUDED.holidays_skipped,
         absences_skipped = EXCLUDED.absences_skipped, at_risk = EXCLUDED.at_risk, risk_reason = EXCLUDED.risk_reason,
         cause = EXCLUDED.cause, computed_at = NOW()`,
      [
        row.student_id,
        row.projected_finish,
        row.required_hours,
        row.verified_hours,
        row.remaining_hours,
        row.weekly_hours,
        walk?.pattern_weeks ?? 1,
        walk?.start ?? null,
        walk?.working_days ?? 0,
        walk?.holidays_skipped ?? [],
        walk?.absences_skipped ?? [],
        row.at_risk,
        row.risk_reason || null,
        cause,
      ]
    );
    // Today's snapshot: the last value of the day is the one kept.
    await pool.query(
      `INSERT INTO student_projection_snapshots (student_id, snapshot_date, projected_end_date, remaining_hours, computed_at)
       VALUES ($1, $2::date, $3, $4, NOW())
       ON CONFLICT (student_id, snapshot_date) DO UPDATE SET
         projected_end_date = EXCLUDED.projected_end_date, remaining_hours = EXCLUDED.remaining_hours, computed_at = NOW()`,
      [row.student_id, today, row.projected_finish, row.remaining_hours]
    );
  }
}

/** Works out and keeps the projection of each student named (active ones; others are left). */
export async function recomputeProjections(
  pool: Pool,
  studentIds: string[],
  cause: ProjectionCause,
  now: Date = new Date()
): Promise<StudentProjection[]> {
  const today = phClock(now).date;
  const done: StudentProjection[] = [];
  for (const studentId of new Set(studentIds.map(String))) {
    const rows = projectLoaded(await loadStudents(pool, { studentId }), today);
    await store(pool, rows, cause, today);
    done.push(...rows);
  }
  return done;
}

/** Every active student's, worked out again (a holiday changes everyone's). */
export async function recomputeAll(pool: Pool, cause: ProjectionCause, now: Date = new Date()): Promise<number> {
  const today = phClock(now).date;
  const rows = projectLoaded(await loadStudents(pool, {}), today);
  await store(pool, rows, cause, today);
  return rows.length;
}

/**
 * The same, never failing the request that changed something: a projection
 * that could not be worked out now is worked out the next time it is read,
 * or that night.
 */
export function projectionsChanged(pool: Pool, studentIds: string[] | "all", cause: ProjectionCause): void {
  const work = studentIds === "all" ? recomputeAll(pool, cause) : recomputeProjections(pool, studentIds, cause);
  void work.catch((error) => console.error("PROJECTION RECOMPUTE ERROR:", error));
}

/** For the minute loop: everyone whose value is from an earlier Philippine day, or who has none. */
export async function recomputeStale(pool: Pool, now: Date = new Date()): Promise<number> {
  const stale = await pool.query<{ student_id: string }>(
    `SELECT s.student_id FROM students s
     LEFT JOIN student_projections p ON p.student_id = s.student_id
     WHERE s.is_active = TRUE AND (p.student_id IS NULL OR ${phSql.date("p.computed_at")} < ${phSql.today})
     ORDER BY s.student_id
     LIMIT ${NIGHTLY_BATCH}`
  );
  if (stale.rows.length === 0) return 0;
  await recomputeProjections(pool, stale.rows.map((row) => row.student_id), "nightly", now);
  return stale.rows.length;
}

/** One student's kept projection, worked out first if there is none from today. */
export async function storedProjection(pool: Pool, studentId: string, now: Date = new Date()): Promise<StoredProjection | null> {
  const read = () =>
    pool.query<StoredProjection & { stale: boolean }>(
      `SELECT p.student_id, TO_CHAR(p.projected_end_date, 'YYYY-MM-DD') AS projected_end_date,
              p.required_hours::float, p.verified_hours::float, p.remaining_hours::float, p.weekly_hours::float,
              p.pattern_weeks, TO_CHAR(p.walk_start, 'YYYY-MM-DD') AS walk_start, p.working_days,
              p.holidays_skipped, p.absences_skipped, p.at_risk, p.risk_reason, p.cause, p.computed_at,
              ${phSql.date("p.computed_at")} < ${phSql.today} AS stale
       FROM student_projections p WHERE p.student_id = $1`,
      [studentId]
    );
  let found = (await read()).rows[0];
  if (!found || found.stale) {
    const fresh = await recomputeProjections(pool, [studentId], "read", now);
    if (fresh.length === 0) return null;
    found = (await read()).rows[0];
  }
  if (!found) return null;
  const { stale: _stale, ...rest } = found;
  void _stale;
  return rest;
}

/**
 * The kept projections for a set of students (a student's own, a
 * supervisor's interns, the coordinator's filtered list), in the shape the
 * views already read (/api/projections). Missing or older ones are worked
 * out first, so what is shown is always today's.
 */
export async function keptProjectionsFor(
  pool: Pool,
  scope: { studentId?: string; supervisorId?: string; filters?: StudentFilters },
  now: Date = new Date()
): Promise<StudentProjection[]> {
  const today = phClock(now).date;
  const loaded = await loadStudents(pool, scope);
  const ids = loaded.students.map((row) => row.student_id);
  if (ids.length === 0) return [];
  const kept = await pool.query<{ student_id: string; fresh: boolean }>(
    `SELECT student_id, ${phSql.date("computed_at")} >= ${phSql.today} AS fresh
     FROM student_projections WHERE student_id = ANY($1::text[])`,
    [ids]
  );
  const fresh = new Set(kept.rows.filter((row) => row.fresh).map((row) => row.student_id));
  // Worked out from what was just loaded, for those with nothing kept from today.
  const computed = projectLoaded(loaded, today);
  const missing = computed.filter((row) => !fresh.has(row.student_id));
  if (missing.length > 0) await store(pool, missing, "read", today);
  const stored = await pool.query<{
    student_id: string;
    projected_end_date: string | null;
    remaining_hours: number;
    weekly_hours: number;
    at_risk: boolean;
    risk_reason: string | null;
  }>(
    `SELECT student_id, TO_CHAR(projected_end_date, 'YYYY-MM-DD') AS projected_end_date, remaining_hours::float,
            weekly_hours::float, at_risk, risk_reason
     FROM student_projections WHERE student_id = ANY($1::text[])`,
    [ids]
  );
  const byId = new Map(stored.rows.map((row) => [row.student_id, row]));
  // Who each student is comes from the load; when they finish, from what is kept.
  return computed.map((row) => {
    const keptRow = byId.get(row.student_id);
    if (!keptRow) return row;
    return {
      ...row,
      projected_finish: keptRow.projected_end_date,
      remaining_hours: Number(keptRow.remaining_hours),
      weekly_hours: Number(keptRow.weekly_hours),
      at_risk: keptRow.at_risk,
      risk_reason: keptRow.risk_reason ?? "",
    };
  });
}
