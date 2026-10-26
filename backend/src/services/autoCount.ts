/*
|--------------------------------------------------------------------------
| CLEAN DAYS COUNT ON THEIR OWN (2026-10-27)
|--------------------------------------------------------------------------
|
| Most days are ordinary: the trainee timed in with the camera check, took
| lunch and timed out. Such a day no longer waits for the supervisor to
| verify it: it counts two working days after the day (auto_count_on() in
| migration 072), unless the supervisor rejects or decides it first. A day
| with anything unusual still waits for the supervisor, as before:
|
|   - no time-out yet, or more hours than one shift;
|   - the time-in not taken with the camera check (recorded offline, or by
|     the supervisor in person, or before the camera check existed);
|   - any step recorded offline, or the phone's clock moved;
|   - a time corrected by the supervisor, or a time-out the trainee entered
|     afterwards;
|   - a photo rejected and waiting to be retaken;
|   - a trainee on the stricter camera check after a rejected photo.
|
| One SQL condition (cleanLogSql) says this everywhere: the round that
| counts, the review count, and the lists that show "counts on Thu".
|
*/

import type { Pool } from "pg";
import { LOOP_LOCKS, withLoopLock } from "./loopLock";
import { phSql } from "./phTime";

/** The most a phone's clock may be off before a log needs the supervisor (offline steps). */
const CLOCK_SKEW_LIMIT_SECONDS = 120;

/**
 * True for a pending log that counts on its own. `log` is the attendance
 * row's alias; `strict` an expression for the trainee's liveness_strict.
 */
export function cleanLogSql(log: string, strict: string, maxShiftHours: number): string {
  return `(
    ${log}.status = 'Pending'
    AND ${log}.time_in IS NOT NULL
    AND ${log}.time_out IS NOT NULL
    AND ${log}.capture_method IS NOT DISTINCT FROM 'liveness'
    AND ${log}.offline_time_in_request IS NULL
    AND ${log}.offline_attestation IS NULL
    AND COALESCE(${log}.recorded_offline, FALSE) = FALSE
    AND ABS(COALESCE(${log}.clock_skew_seconds, 0)) <= ${CLOCK_SKEW_LIMIT_SECONDS}
    AND ${log}.time_correction_reason IS NULL
    AND ${log}.correction_note IS NULL
    AND ${log}.photo_redo_status IS NULL
    AND ${log}.rejection_scope IS NULL
    AND COALESCE(${log}.hours, 0) > 0
    AND COALESCE(${log}.hours, 0) <= ${Number(maxShiftHours)}
    AND COALESCE(${strict}, FALSE) = FALSE
  )`;
}

/** The day a clean pending log counts after ("YYYY-MM-DD"), or NULL: for SELECT lists. */
export function autoCountOnSql(log: string, strict: string, maxShiftHours: number): string {
  return `CASE WHEN ${cleanLogSql(log, strict, maxShiftHours)} THEN TO_CHAR(auto_count_on(${log}.date), 'YYYY-MM-DD') END`;
}

type NotificationWriter = (notification: {
  studentId?: string;
  title: string;
  message: string;
  type: string;
  entity?: { type: string; id: string | number | null | undefined };
}) => Promise<void>;

export type AutoCountHooks = {
  createNotification: NotificationWriter;
  /** After a trainee's verified hours change: completion and the camera-check level. */
  afterCounted: (studentId: string) => Promise<void>;
};

/**
 * Verifies every clean pending log whose two working days are over. One
 * notification per trainee. Returns the logs counted. `now` is passed in so
 * this can be tested.
 */
export async function countCleanDays(pool: Pool, hooks: AutoCountHooks, maxShiftHours: number, now: Date = new Date()): Promise<{ id: number; student_id: string; date: string }[]> {
  const counted = await pool.query<{ id: number; student_id: string; date: string }>(
    `
    UPDATE attendance a
    SET status = 'Verified',
        verified_by = NULL,
        verifier_role = 'system',
        verified_at = NOW(),
        auto_counted = TRUE,
        flag_acknowledged_at = NULL
    FROM students s
    WHERE s.student_id = a.student_id
      AND ${cleanLogSql("a", "s.liveness_strict", maxShiftHours)}
      AND auto_count_on(a.date) < ${phSql.date("$1::timestamptz")}
    RETURNING a.id, a.student_id, TO_CHAR(a.date, 'YYYY-MM-DD') AS date
    `,
    [now.toISOString()]
  );

  const byStudent = new Map<string, { id: number; date: string }[]>();
  for (const row of counted.rows) {
    const id = String(row.student_id);
    byStudent.set(id, [...(byStudent.get(id) ?? []), { id: row.id, date: row.date }]);
  }
  for (const [studentId, days] of byStudent) {
    await hooks.afterCounted(studentId).catch((error) => console.error("AUTO COUNT AFTER ERROR:", error));
    const sorted = days.map((day) => day.date).sort();
    await hooks
      .createNotification({
        studentId,
        entity: { type: "attendance", id: days[days.length - 1].id },
        title: days.length === 1 ? "Your day counted" : `${days.length} days counted`,
        message:
          days.length === 1
            ? `Your attendance for ${dayWords(sorted[0])} now counts toward your hours. Your supervisor did not need to check anything on it.`
            : `Your attendance from ${dayWords(sorted[0])} to ${dayWords(sorted[sorted.length - 1])} now counts toward your hours.`,
        type: "attendance",
      })
      .catch((error) => console.error("AUTO COUNT NOTIFICATION ERROR:", error));
  }
  return counted.rows;
}

/** "Wed, Oct 28" for a "YYYY-MM-DD" day. */
function dayWords(day: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}

const CHECK_EVERY_MS = 15 * 60_000;
let running = false;

export function startAutoCountScheduler(pool: Pool, hooks: AutoCountHooks, maxShiftHours: number): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await countCleanDays(pool, hooks, maxShiftHours);
    } catch (error) {
      console.error("AUTO COUNT SCHEDULER ERROR:", error);
    } finally {
      running = false;
    }
  };
  // One server at a time (services/loopLock.ts).
  const guarded = () => withLoopLock(pool, LOOP_LOCKS.autoCount, run);
  void guarded();
  setInterval(() => void guarded(), CHECK_EVERY_MS);
}
