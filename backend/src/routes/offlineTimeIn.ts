import type express from "express";
import type { Pool } from "pg";
import { readOfflineStamp } from "../services/offlineActions";
import { consentRequired, hasCurrentConsent } from "../services/privacy";

/*
|--------------------------------------------------------------------------
| TIME-IN WITH NO CONNECTION
|--------------------------------------------------------------------------
|
| A student with no signal records their time-in on the phone, with the
| time the button was pressed, and it arrives here when the connection is
| back (lib/offlineQueue.ts on the phone). The camera check needs the
| server, so this time-in has no photo and no check. What stands in for
| them is the supervisor: the log is created "Pending", is marked as
| recorded offline, and can only be verified one log at a time by someone
| who has been told there is no photo (the status route asks for
| `confirm_offline_time_in`).
|
| The time is checked the way the other offline steps are
| (services/offlineActions.ts): not in the future, not older than the
| limit (12 hours unless OFFLINE_ACTION_MAX_AGE_HOURS says otherwise).
| The log belongs to the day in the Philippines that the time falls on.
|
| A day has one log. If the day already has one, nothing is added, and
| the answer carries that log's id so the phone can attach the lunch and
| time-out steps it was holding to it. If the day's log is this very
| time-in, sent a second time, the answer is the same as the first.
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (role: "student") => express.RequestHandler;
  createNotification: (notification: {
    supervisorId?: string;
    title: string;
    message: string;
    type: string;
    entity?: { type: string; id: string | number };
  }) => Promise<void>;
};

const LOG_COLUMNS = `
  id, student_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, time_in, break_time, break_end_time,
  time_out, hours, note, status, image_url, capture_method, recorded_offline,
  (offline_time_in_request IS NOT NULL) AS offline_time_in
`;

export function registerOfflineTimeInRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, createNotification } = deps;

  app.post("/api/attendance/offline-time-in", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const stamp = readOfflineStamp(req.body, "break", null);
      if (stamp.kind === "live") {
        return res.status(400).json({
          message: "A time-in recorded offline needs the time it happened and its request id.",
        });
      }
      if (stamp.kind === "invalid") {
        return res.status(stamp.status).json({
          message:
            stamp.status === 409
              ? stamp.message.replace(/^This was recorded/, "This time-in was recorded")
              : stamp.message,
        });
      }
      // The same agreement the camera time-in asks for.
      if (consentRequired()) {
        const consent = await pool.query<{ privacy_consent_version: string | null }>(
          `SELECT privacy_consent_version FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (!hasCurrentConsent(consent.rows[0]?.privacy_consent_version)) {
          return res.status(403).json({
            code: "CONSENT_REQUIRED",
            message: "Read and agree to the privacy notice before timing in. Open the app with a connection to see it.",
          });
        }
      }
      const rawNote = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";

      const existingFor = async () =>
        pool.query<{ id: number; offline_time_in_request: string | null }>(
          `SELECT ${LOG_COLUMNS}, offline_time_in_request FROM attendance
           WHERE student_id = $1 AND date = ($2::timestamptz AT TIME ZONE 'Asia/Manila')::date
           LIMIT 1`,
          [auth.id, stamp.occurredAt.toISOString()]
        );
      const already = (rows: Array<Record<string, unknown>>) => {
        const { offline_time_in_request: request, ...log } = rows[0];
        // This very time-in, arriving again: the first answer, again.
        if (request === stamp.requestId) {
          return res.json({ message: "Time-in recorded.", attendance: log, replayed: true });
        }
        return res.status(409).json({
          code: "DAY_HAS_LOG",
          message: "A time-in for that day was already recorded, so this one was not added.",
          attendance: log,
        });
      };

      const existing = await existingFor();
      if (existing.rows.length > 0) return already(existing.rows);

      let created;
      try {
        created = await pool.query(
          `INSERT INTO attendance
             (student_id, date, time_in, note, status, image_url, capture_method, recorded_offline, offline_time_in_request)
           VALUES
             ($1,
              ($2::timestamptz AT TIME ZONE 'Asia/Manila')::date,
              $2::timestamptz AT TIME ZONE 'Asia/Manila',
              $3, 'Pending', NULL, NULL, TRUE, $4)
           RETURNING ${LOG_COLUMNS}, TO_CHAR(time_in, 'HH12:MI AM') AS at`,
          [auth.id, stamp.occurredAt.toISOString(), rawNote || null, stamp.requestId]
        );
      } catch (error) {
        // Two arrivals at once: the unique index on (student, day) let one through.
        if ((error as { code?: string })?.code !== "23505") throw error;
        const raced = await existingFor();
        if (raced.rows.length > 0) return already(raced.rows);
        throw error;
      }
      const { at, ...log } = created.rows[0] as Record<string, unknown>;

      // The supervisor is told plainly what this log lacks. A failure to
      // tell them must not undo the log.
      try {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (owner.rows[0]?.supervisor_id) {
          await createNotification({
            supervisorId: owner.rows[0].supervisor_id,
            title: "Time-in recorded without a connection",
            message: `${owner.rows[0].name} recorded a time-in for ${log.date} at ${at} on a phone with no connection. There is no photo and no camera check. Confirm it only if they were at work then.`,
            type: "attendance",
            entity: { type: "attendance", id: Number(log.id) },
          });
        }
      } catch (notifyError) {
        console.error("OFFLINE TIME-IN NOTIFICATION ERROR:", notifyError);
      }

      return res.status(201).json({ message: "Time-in recorded.", attendance: log });
    } catch (error) {
      console.error("OFFLINE TIME-IN ERROR:", error);
      return res.status(500).json({ message: "Failed to record the time-in." });
    }
  });
}
