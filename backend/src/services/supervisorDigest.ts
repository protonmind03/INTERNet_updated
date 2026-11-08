/*
|--------------------------------------------------------------------------
| THE SUPERVISOR'S EVENING SUMMARY OF DAILY REPORTS (November 2026)
|--------------------------------------------------------------------------
|
| A supervisor is not told of each daily report their interns write (with
| several interns that would be a stream of pings). Instead, once each
| evening, from SUPERVISOR_REPORTS_SUMMARY_TIME (18:00 Philippine time
| unless set; not SUPERVISOR_DIGEST_TIME, which times the morning email of
| what is waiting, services/digests.ts),
| a supervisor whose interns wrote that day's report gets one notification:
| "2 of your 3 interns wrote today's report: Ana, Ben." It opens their
| Interns page, where each intern's Reports tab has the day.
|
| A report counts when it has words or at least one event. A day on which
| no intern wrote anything sends nothing. `supervisor_report_digests` holds
| one row per supervisor per day: claiming the day and counting are one
| statement, so two copies of the server, or a restart, send it once.
|
*/

import type { Pool } from "pg";
import { LOOP_LOCKS, withLoopLock } from "./loopLock";
import { phSql } from "./phTime";

type NotificationWriter = (notification: {
  supervisorId?: string;
  title: string;
  message: string;
  type: string;
  link?: string;
}) => Promise<unknown>;

/** When the summary goes out, Philippine time, "HH:MM". */
export function digestTime(): string {
  const set = (process.env.SUPERVISOR_REPORTS_SUMMARY_TIME || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(set) ? set : "18:00";
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cora", "Ana, Ben, Cora and 2 others". */
export function namesText(names: string[], total: number): string {
  const shown = names.slice(0, 3);
  const others = total - shown.length;
  if (others > 0) return `${shown.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * Sends today's summary to every supervisor due one and not sent one yet.
 * Returns the supervisors told. `now` is passed in so this can be tested.
 */
export async function sendSupervisorDigests(pool: Pool, createNotification: NotificationWriter, now: Date = new Date()): Promise<string[]> {
  const due = await pool.query<{ supervisor_id: string; digest_date: string; wrote: number; interns: number }>(
    `
    WITH clock AS (SELECT ${phSql.wallTime("$1::timestamptz")} AS local_now),
    counted AS (
      SELECT st.supervisor_id, clock.local_now::date AS day,
             COUNT(*) FILTER (WHERE r.id IS NOT NULL AND (
               NULLIF(TRIM(r.summary), '') IS NOT NULL
               OR EXISTS (SELECT 1 FROM daily_report_entries e WHERE e.report_id = r.id AND e.removed_at IS NULL)
             ))::int AS wrote,
             COUNT(*)::int AS interns
      FROM clock
      JOIN students st ON st.is_active = TRUE AND st.supervisor_id IS NOT NULL
      JOIN supervisors sv ON sv.supervisor_id = st.supervisor_id AND sv.is_active = TRUE
      LEFT JOIN daily_reports r ON r.student_id = st.student_id AND r.report_date = clock.local_now::date
      WHERE clock.local_now::time >= $2::time
      GROUP BY st.supervisor_id, clock.local_now::date
    )
    INSERT INTO supervisor_report_digests (supervisor_id, digest_date, wrote, interns)
    SELECT supervisor_id, day, wrote, interns FROM counted WHERE wrote > 0
    ON CONFLICT (supervisor_id, digest_date) DO NOTHING
    RETURNING supervisor_id, TO_CHAR(digest_date, 'YYYY-MM-DD') AS digest_date, wrote, interns
    `,
    [now.toISOString(), digestTime()]
  );

  const told: string[] = [];
  for (const row of due.rows) {
    try {
      const writers = await pool.query<{ name: string }>(
        `SELECT st.name
         FROM students st
         JOIN daily_reports r ON r.student_id = st.student_id AND r.report_date = $2::date
         WHERE st.supervisor_id = $1 AND st.is_active = TRUE
           AND (NULLIF(TRIM(r.summary), '') IS NOT NULL
                OR EXISTS (SELECT 1 FROM daily_report_entries e WHERE e.report_id = r.id AND e.removed_at IS NULL))
         ORDER BY st.name`,
        [row.supervisor_id, row.digest_date]
      );
      const first = writers.rows.map((writer) => String(writer.name).split(/\s+/)[0]);
      const who = row.interns === 1 ? "Your intern" : row.wrote === row.interns ? `All ${row.interns} of your interns` : `${row.wrote} of your ${row.interns} interns`;
      await createNotification({
        supervisorId: row.supervisor_id,
        title: "Today's daily reports",
        message: `${who} wrote today's report${row.interns > 1 ? `: ${namesText(first, row.wrote)}` : ""}. Read them on each intern's Reports tab.`,
        type: "info",
        link: "/supervisor/interns",
      });
      told.push(row.supervisor_id);
    } catch (error) {
      console.error("SUPERVISOR DIGEST NOTIFICATION ERROR:", error);
      // Not delivered: give the day back so the next round tries again.
      await pool
        .query(`DELETE FROM supervisor_report_digests WHERE supervisor_id = $1 AND digest_date = $2::date`, [row.supervisor_id, row.digest_date])
        .catch(() => undefined);
    }
  }
  return told;
}

const CHECK_EVERY_MS = 5 * 60_000;
let running = false;

export function startSupervisorDigestScheduler(pool: Pool, createNotification: NotificationWriter): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendSupervisorDigests(pool, createNotification);
    } catch (error) {
      console.error("SUPERVISOR DIGEST SCHEDULER ERROR:", error);
    } finally {
      running = false;
    }
  };
  // One server at a time (services/loopLock.ts).
  const guarded = () => withLoopLock(pool, LOOP_LOCKS.supervisorDigest, run);
  void guarded();
  setInterval(() => void guarded(), CHECK_EVERY_MS);
}
