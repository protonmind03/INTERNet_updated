/*
|--------------------------------------------------------------------------
| A REJECTED TIME-IN PHOTO, AND THE WINDOW TO RETAKE IT
|--------------------------------------------------------------------------
|
| A supervisor may reject only the photo of today's open log ("Reject
| time-in"). The student keeps working and the log's hours keep counting;
| the next time-ins use the strict camera check (services/liveness.ts); and
| the student has a window to take a new photo
| (POST /api/attendance/:id/photo-redo).
|
| When the window closes (the default rule, roadmap decision 4):
|
|   - lunch has not ended yet (not started, or under way): when the student
|     taps "Back from lunch" (the photo is retaken at lunch);
|   - lunch already ended: 60 minutes after the rejection;
|   - in every case, never after time-out.
|
| A student who takes no lunch at all therefore has until time-out. If the
| window closes with no new photo, the job below sets the log Rejected with
| the system reason, adds an Unexcused absence for the day (so the time
| record, analytics and the projected end all count it) and tells both the
| student and the supervisor. The supervisor may still verify the day
| afterwards (the decision route; audited), which takes the absence away.
|
*/

export const REDO_MINUTES_AFTER_LUNCH = 60;
export const REDO_MISSED_REASON = "Photo not retaken in time";
/** The reason on the absence the job adds, so it can be told from one a student filed. */
export const REDO_MISSED_ABSENCE_REASON =
  "Absent: the time-in photo was rejected and a new one was not taken in time.";

/** When the window closes, worked out at the moment of the rejection. */
export function redoWindow(log: {
  break_time: unknown;
  break_end_time: unknown;
}): { closes: "back-from-lunch" } | { closes: "minutes"; minutes: number } {
  if (log.break_end_time) return { closes: "minutes", minutes: REDO_MINUTES_AFTER_LUNCH };
  return { closes: "back-from-lunch" };
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

type Notify = (notification: {
  studentId?: string;
  supervisorId?: string;
  title: string;
  message: string;
  type: string;
  entity?: { type: string; id: string | number };
}) => Promise<void>;

/**
 * Closes every window that has run out: the deadline has passed, or the
 * student timed out first. Runs every minute (services/deadlineReminders.ts).
 * Each log is taken once, so two copies of the server never close it twice.
 */
export async function closeMissedRedos(db: Queryable, notify: Notify): Promise<number> {
  const closed = await db.query(
    `WITH due AS (
       SELECT a.id FROM attendance a
       WHERE a.photo_redo_status = 'required'
         AND (a.time_out IS NOT NULL OR (a.photo_redo_due_at IS NOT NULL AND a.photo_redo_due_at <= NOW()))
       FOR UPDATE SKIP LOCKED
     )
     UPDATE attendance a
     SET photo_redo_status = 'missed',
         status = 'Rejected',
         review_notes = $1,
         verified_by = NULL,
         verifier_role = 'system',
         verified_at = NOW(),
         flag_acknowledged_at = NULL
     FROM due
     WHERE a.id = due.id
     RETURNING a.id, a.student_id, TO_CHAR(a.date, 'YYYY-MM-DD') AS date`,
    [REDO_MISSED_REASON]
  );
  for (const log of closed.rows) {
    try {
      await db.query(
        `INSERT INTO absences (student_id, date, reason, status, review_notes, reviewed_at)
         VALUES ($1, $2::date, $3, 'Unexcused', $4, NOW())
         ON CONFLICT (student_id, date) DO NOTHING`,
        [log.student_id, log.date, REDO_MISSED_ABSENCE_REASON, REDO_MISSED_REASON]
      );
      const owner = await db.query(`SELECT name, supervisor_id FROM students WHERE student_id = $1`, [log.student_id]);
      const name = String(owner.rows[0]?.name ?? "The intern");
      await notify({
        studentId: String(log.student_id),
        entity: { type: "attendance", id: Number(log.id) },
        title: "Day marked absent",
        message: `A new time-in photo was not taken in time, so your attendance for ${log.date} was rejected and the day is marked absent. Your supervisor can still verify it, and you can appeal to the OJT coordinator within 7 days.`,
        type: "attendance",
      });
      if (owner.rows[0]?.supervisor_id) {
        await notify({
          supervisorId: String(owner.rows[0].supervisor_id),
          entity: { type: "attendance", id: Number(log.id) },
          title: "Photo not retaken in time",
          message: `${name} did not retake the time-in photo for ${log.date} in time. The day is marked absent. You can still verify it if their phone failed.`,
          type: "attendance",
        });
      }
    } catch (error) {
      console.error("MISSED PHOTO REDO FOLLOW-UP ERROR:", error);
    }
  }
  return closed.rows.length;
}

/** Takes the absence the job added away again (the day was verified or the rejection overturned). */
export async function removeMissedRedoAbsence(db: Queryable, studentId: string, date: string): Promise<void> {
  await db.query(
    `DELETE FROM absences WHERE student_id = $1 AND date = $2::date AND reason = $3 AND status = 'Unexcused'`,
    [studentId, date, REDO_MISSED_ABSENCE_REASON]
  );
}
