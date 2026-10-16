/*
|--------------------------------------------------------------------------
| "DID YOU FORGET TO TIME OUT?"
|--------------------------------------------------------------------------
|
| A student who leaves without timing out ends the day with an open log,
| which cannot be verified until they correct it. This reminds them while
| it is still the same day: once their scheduled shift has been over for an
| hour and the log is still open, they get one notification.
|
| Only a day the student is scheduled to work has an end to measure from,
| so a log on an unscheduled day is not reminded. `time_out_reminders`
| holds one row per student per day, which is what keeps it to one.
|
*/

import type { Pool } from "pg";
import { phSql } from "./phTime";

type NotificationWriter = (notification: {
  studentId?: string;
  title: string;
  message: string;
  type: string;
}) => Promise<void>;

/** How long after the scheduled end of the shift the reminder is sent. */
export const TIME_OUT_REMINDER_DELAY_MINUTES = 60;

const CHECK_EVERY_MS = 5 * 60_000;

let running = false;

/** "17:00:00" as "5:00 PM". */
export function clockText(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Reminds every student whose log for today is still open an hour after
 * their shift ended and who has not been reminded today. Returns the
 * students reminded. `now` is passed in so this can be tested.
 */
export async function sendTimeOutReminders(
  pool: Pool,
  createNotification: NotificationWriter,
  now: Date = new Date()
): Promise<string[]> {
  // Claiming the day and finding who is due are one statement, so two
  // copies of the server cannot both remind the same student.
  const due = await pool.query<{ id: number; student_id: string; scheduled_end: string }>(
    `
    WITH clock AS (SELECT ${phSql.wallTime("$1::timestamptz")} AS local_now)
    INSERT INTO time_out_reminders (student_id, reminder_date, attendance_id, scheduled_end)
    SELECT a.student_id, a.date, a.id, shift.end_time
    FROM clock
    JOIN attendance a ON a.date = clock.local_now::date
    JOIN students st ON st.student_id = a.student_id AND st.is_active = TRUE
    JOIN LATERAL (
      SELECT MAX(s.end_time) AS end_time
      FROM ojt_schedule s
      WHERE s.student_id = a.student_id
        AND s.is_active = TRUE
        AND LOWER(TRIM(s.day)) = LOWER(TRIM(TO_CHAR(a.date, 'Day')))
    ) shift ON shift.end_time IS NOT NULL
    WHERE a.time_in IS NOT NULL
      AND a.time_out IS NULL
      AND a.date + shift.end_time + make_interval(mins => $2::int) <= clock.local_now
    ON CONFLICT (student_id, reminder_date) DO NOTHING
    RETURNING id, student_id, scheduled_end::text AS scheduled_end
    `,
    [now.toISOString(), TIME_OUT_REMINDER_DELAY_MINUTES]
  );

  const reminded: string[] = [];
  for (const row of due.rows) {
    try {
      await createNotification({
        studentId: row.student_id,
        title: "Did you forget to time out?",
        message: `Your shift was scheduled to end at ${clockText(row.scheduled_end)} and today's time log is still open. Time out now if you are still at work. If you have already left, open the log and enter the time you left.`,
        type: "attendance",
      });
      reminded.push(row.student_id);
    } catch (error) {
      console.error("TIME-OUT REMINDER NOTIFICATION ERROR:", error);
      // Not delivered: give the day back so the next check tries again.
      await pool
        .query(`DELETE FROM time_out_reminders WHERE id = $1`, [row.id])
        .catch(() => undefined);
    }
  }
  return reminded;
}

/**
 * A camera-check ticket lasts ten minutes, so the record that one was
 * spent is needed no longer than that. Rows older than a day are removed
 * here, on the same round as the reminders. Returns how many went.
 */
export async function forgetSpentTickets(pool: Pool, now: Date = new Date()): Promise<number> {
  const result = await pool.query(
    `DELETE FROM liveness_ticket_uses WHERE used_at < $1::timestamptz - INTERVAL '1 day'`,
    [now.toISOString()]
  );
  return result.rowCount ?? 0;
}

export function startTimeOutReminderScheduler(
  pool: Pool,
  createNotification: NotificationWriter
): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendTimeOutReminders(pool, createNotification);
      await forgetSpentTickets(pool);
    } catch (error) {
      console.error("TIME-OUT REMINDER SCHEDULER ERROR:", error);
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => void run(), CHECK_EVERY_MS);
}
