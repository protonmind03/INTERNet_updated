import type express from "express";
import { staleDecision } from "../services/versions";
import type { Pool, PoolClient } from "pg";
import { syncLivenessStrict } from "../services/liveness";
import { removeMissedRedoAbsence } from "../services/photoRedo";

/*
|--------------------------------------------------------------------------
| APPEALS TO THE COORDINATOR
|--------------------------------------------------------------------------
|
| Within APPEAL_DAYS of a supervisor's time correction, a rejected time-in
| photo or a rejected day, the student may ask the OJT coordinator to look
| at it, with their reason. One open appeal per log. The coordinator
| upholds the decision or overturns it, with a note the student and the
| supervisor are told. Overturning undoes the decision:
|
|   time_correction       the times before the correction come back, and
|                         the hours with them;
|   time_in_rejection     a photo still to be retaken is no longer needed;
|                         a day already closed as absent is opened again
|                         (Pending) and the absence the system added goes;
|                         the rejection no longer counts toward the strict
|                         camera check;
|   attendance_rejection  the day is verified by the coordinator (or back to
|                         Pending if it has no time-out yet).
|
| Filing, withdrawing and deciding are in the audit log (services/audit.ts).
| A conversation about each appeal arrives with messages (Iteration 6):
| thread_id stays empty until then.
|
*/

export const APPEAL_DAYS = 7;
export const APPEAL_KINDS = ["time_correction", "time_in_rejection", "attendance_rejection"] as const;
type AppealKind = (typeof APPEAL_KINDS)[number];

type Authed = express.Request & { auth?: { role: string; id: string } };

type Notification = {
  studentId?: string;
  supervisorId?: string;
  title: string;
  message: string;
  type: string;
  entity?: { type: string; id: string | number };
};

type Dependencies = {
  pool: Pool;
  requireRole: (roles: "student" | "coordinator") => express.RequestHandler;
  createNotification: (notification: Notification) => Promise<void>;
  notifyCoordinators: (notification: Omit<Notification, "studentId" | "supervisorId">) => Promise<void>;
  syncCompletion: (studentId: string) => Promise<void>;
};

const KIND_NAME: Record<AppealKind, string> = {
  time_correction: "the time correction",
  time_in_rejection: "the rejected time-in photo",
  attendance_rejection: "the rejected attendance",
};

/** When the decision being appealed was made, or null when this log has none of that kind. */
const EVENT_AT: Record<AppealKind, string> = {
  time_correction: "a.time_corrected_at",
  time_in_rejection: "a.photo_rejected_at",
  attendance_rejection: "CASE WHEN a.status = 'Rejected' THEN a.verified_at END",
};

const quietly = async (label: string, work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (error) {
    console.error(`${label}:`, error);
  }
};

export function registerAppealRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, createNotification, notifyCoordinators, syncCompletion } = deps;

  /*
  |--------------------------------------------------------------------------
  | THE STUDENT
  |--------------------------------------------------------------------------
  */

  app.post("/api/appeals", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const attendanceId = Number(req.body?.attendance_id);
      const kind = req.body?.kind as AppealKind;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!Number.isInteger(attendanceId) || attendanceId <= 0) return res.status(404).json({ message: "Attendance record not found." });
      if (!APPEAL_KINDS.includes(kind)) return res.status(400).json({ message: "Choose what you are appealing." });
      if (reason.length < 10 || reason.length > 1000) {
        return res.status(400).json({ message: "Explain why, in 10 to 1000 characters. The coordinator reads this." });
      }
      const log = await pool.query<{ date: string; event_at: Date | null; within: boolean; supervisor_id: string | null; name: string }>(
        `SELECT TO_CHAR(a.date, 'YYYY-MM-DD') AS date, ${EVENT_AT[kind]} AS event_at,
                (${EVENT_AT[kind]} > NOW() - make_interval(days => $3)) AS within,
                s.supervisor_id, s.name
         FROM attendance a JOIN students s ON s.student_id = a.student_id
         WHERE a.id = $1 AND a.student_id = $2`,
        [attendanceId, auth.id, APPEAL_DAYS]
      );
      const row = log.rows[0];
      if (!row) return res.status(404).json({ message: "Attendance record not found." });
      if (!row.event_at) {
        return res.status(409).json({ code: "NOTHING_TO_APPEAL", message: `There is no ${KIND_NAME[kind].replace(/^the /, "")} on this log to appeal.` });
      }
      if (!row.within) {
        return res.status(409).json({ code: "APPEAL_TOO_LATE", message: `An appeal can be made within ${APPEAL_DAYS} days of the decision. This one is older.` });
      }
      let appeal;
      try {
        appeal = await pool.query<{ id: number }>(
          `INSERT INTO attendance_appeals (attendance_id, student_id, kind, reason) VALUES ($1, $2, $3, $4) RETURNING id`,
          [attendanceId, auth.id, kind, reason]
        );
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") {
          return res.status(409).json({ code: "APPEAL_OPEN", message: "This log already has an appeal waiting for the coordinator." });
        }
        throw error;
      }
      await quietly("APPEAL FILED NOTIFICATION ERROR", async () => {
        await notifyCoordinators({
          entity: { type: "attendance", id: attendanceId },
          title: "New appeal",
          message: `${row.name} appealed ${KIND_NAME[kind]} on their log for ${row.date}.`,
          type: "warning",
        });
        if (row.supervisor_id) {
          await createNotification({
            supervisorId: row.supervisor_id,
            entity: { type: "attendance", id: attendanceId },
            title: "Intern appealed to the coordinator",
            message: `${row.name} appealed ${KIND_NAME[kind]} on their log for ${row.date}. The OJT coordinator will decide.`,
            type: "info",
          });
        }
      });
      return res.status(201).json({ message: "Appeal sent to the OJT coordinator.", appeal: { id: appeal.rows[0].id, kind, status: "open", attendance_id: attendanceId } });
    } catch (error) {
      console.error("FILE APPEAL ERROR:", error);
      return res.status(500).json({ message: "Failed to send the appeal." });
    }
  });

  app.post("/api/appeals/:id/withdraw", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Appeal not found." });
      const result = await pool.query(
        `UPDATE attendance_appeals SET status = 'withdrawn', withdrawn_at = NOW()
         WHERE id = $1 AND student_id = $2 AND status = 'open' RETURNING id, attendance_id`,
        [req.params.id, auth.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Only an appeal still waiting can be withdrawn." });
      return res.json({ message: "Appeal withdrawn.", appeal: result.rows[0] });
    } catch (error) {
      console.error("WITHDRAW APPEAL ERROR:", error);
      return res.status(500).json({ message: "Failed to withdraw the appeal." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | THE COORDINATOR
  |--------------------------------------------------------------------------
  */

  app.get("/api/coordinator/appeals", requireRole("coordinator"), async (req, res) => {
    try {
      const status = String(req.query.status ?? "open");
      if (!["open", "decided", "all"].includes(status)) return res.status(400).json({ message: "Show open, decided or all appeals." });
      const result = await pool.query(
        `SELECT p.id, p.kind, p.reason, p.status, p.decision_note, p.created_at, p.decided_at, p.withdrawn_at, p.version,
                p.attendance_id, p.student_id, s.name AS student_name, sup.name AS supervisor_name,
                TO_CHAR(a.date, 'YYYY-MM-DD') AS date, a.status AS log_status, a.time_in, a.break_time,
                a.break_end_time, a.time_out, a.hours, a.review_notes, a.photo_rejection_reason,
                a.photo_redo_status, a.time_correction_reason, a.times_before_correction, a.image_url,
                a.rejected_photo_path
         FROM attendance_appeals p
         JOIN attendance a ON a.id = p.attendance_id
         JOIN students s ON s.student_id = p.student_id
         LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
         WHERE ($1 = 'all' OR ($1 = 'open' AND p.status = 'open') OR ($1 = 'decided' AND p.status <> 'open'))
         ORDER BY (p.status = 'open') DESC, p.created_at ASC
         LIMIT 500`,
        [status]
      );
      return res.json({ appeals: result.rows });
    } catch (error) {
      console.error("LIST APPEALS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the appeals." });
    }
  });

  app.put("/api/coordinator/appeals/:id", requireRole("coordinator"), async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const auth = (req as Authed).auth!;
      if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Appeal not found." });
      // Iteration 12: decided by someone else since it was opened? Say so, with how it is now.
      const stale = await staleDecision(pool, "appeal", String(req.params.id), req.body, auth);
      if (stale) return res.status(409).json(stale);
      const decision = req.body?.decision;
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (decision !== "upheld" && decision !== "overturned") return res.status(400).json({ message: "Uphold or overturn the decision." });
      if (note.length < 5 || note.length > 1000) {
        return res.status(400).json({ message: "Write a note for the student and the supervisor (5 to 1000 characters)." });
      }

      client = await pool.connect();
      await client.query("BEGIN");
      const found = await client.query<{
        id: number;
        kind: AppealKind;
        attendance_id: number;
        student_id: string;
        date: string;
        log_status: string;
        has_time_out: boolean;
        photo_redo_status: string | null;
        times_before_correction: Record<string, string | null> | null;
        supervisor_id: string | null;
        name: string;
      }>(
        `SELECT p.id, p.kind, p.attendance_id, p.student_id, TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
                a.status AS log_status, (a.time_out IS NOT NULL) AS has_time_out, a.photo_redo_status,
                a.times_before_correction, s.supervisor_id, s.name
         FROM attendance_appeals p
         JOIN attendance a ON a.id = p.attendance_id
         JOIN students s ON s.student_id = p.student_id
         WHERE p.id = $1 AND p.status = 'open'
         FOR UPDATE OF p, a`,
        [req.params.id]
      );
      const appeal = found.rows[0];
      if (!appeal) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "This appeal is no longer waiting for a decision." });
      }
      const changed = async (message: string) => {
        await client!.query("ROLLBACK");
        return res.status(409).json({ code: "LOG_CHANGED", message });
      };

      let outcome = "The decision stands.";
      if (decision === "overturned") {
        if (appeal.kind === "time_correction") {
          const before = appeal.times_before_correction;
          if (!before) {
            return changed("The times before this correction were not kept (it was made before appeals existed). Uphold the appeal, or ask the supervisor to correct the times.");
          }
          await client.query(
            `UPDATE attendance a
             SET time_in = a.date + ($2::jsonb->>'time_in')::time,
                 break_time = a.date + ($2::jsonb->>'break_time')::time,
                 break_end_time = a.date + ($2::jsonb->>'break_end_time')::time,
                 time_out = a.date + ($2::jsonb->>'time_out')::time,
                 hours = CASE WHEN $2::jsonb->>'time_out' IS NULL THEN NULL ELSE GREATEST(ROUND((
                   (EXTRACT(EPOCH FROM (($2::jsonb->>'time_out')::time - ($2::jsonb->>'time_in')::time))
                    - COALESCE(EXTRACT(EPOCH FROM (($2::jsonb->>'break_end_time')::time - ($2::jsonb->>'break_time')::time)), 0)
                   ) / 3600.0)::numeric, 2), 0) END,
                 time_corrected_at = NOW(),
                 time_corrected_by = $3,
                 time_correction_reason = $4,
                 times_before_correction = NULL
             WHERE a.id = $1`,
            [appeal.attendance_id, JSON.stringify(before), auth.id, `Original times restored by the OJT coordinator after an appeal: ${note}`]
          );
          outcome = "The times before the correction were restored.";
        } else if (appeal.kind === "time_in_rejection") {
          if (appeal.photo_redo_status === "missed") {
            if (appeal.log_status !== "Rejected") {
              return changed(`The log is now ${appeal.log_status.toLowerCase()}, so there is nothing to undo. Uphold the appeal to close it.`);
            }
            await client.query(
              `UPDATE attendance SET status = 'Pending', review_notes = NULL, verified_by = NULL, verifier_role = NULL,
                      verified_at = NULL, photo_redo_status = NULL, photo_redo_due_at = NULL
               WHERE id = $1`,
              [appeal.attendance_id]
            );
            await removeMissedRedoAbsence(client, appeal.student_id, appeal.date);
            outcome = "The day is open for review again and is no longer marked absent.";
          } else {
            await client.query(
              `UPDATE attendance SET photo_redo_status = CASE WHEN photo_redo_status = 'required' THEN NULL ELSE photo_redo_status END,
                      photo_redo_due_at = NULL
               WHERE id = $1`,
              [appeal.attendance_id]
            );
            outcome = "The photo rejection was withdrawn; no new photo is needed.";
          }
        } else {
          if (appeal.log_status !== "Rejected") {
            return changed(`The log is now ${appeal.log_status.toLowerCase()}, so there is nothing to undo. Uphold the appeal to close it.`);
          }
          await client.query(
            `UPDATE attendance
             SET status = CASE WHEN time_out IS NULL THEN 'Pending' ELSE 'Verified' END,
                 review_notes = $2,
                 verified_by = CASE WHEN time_out IS NULL THEN NULL ELSE $3 END,
                 verifier_role = CASE WHEN time_out IS NULL THEN NULL ELSE 'coordinator' END,
                 verified_at = CASE WHEN time_out IS NULL THEN NULL ELSE NOW() END,
                 flag_acknowledged_at = NULL
             WHERE id = $1`,
            [appeal.attendance_id, `Rejection overturned by the OJT coordinator: ${note}`, auth.id]
          );
          if (appeal.photo_redo_status === "missed") await removeMissedRedoAbsence(client, appeal.student_id, appeal.date);
          outcome = appeal.has_time_out ? "The day is verified." : "The day is back to awaiting review.";
        }
      }
      await client.query(
        `UPDATE attendance_appeals SET status = $2, decided_by = $3, decision_note = $4, decided_at = NOW() WHERE id = $1`,
        [appeal.id, decision, auth.id, note]
      );
      await client.query("COMMIT");

      await quietly("APPEAL FOLLOW-UP ERROR", async () => {
        await syncCompletion(appeal.student_id);
        await syncLivenessStrict(pool, appeal.student_id);
      });
      const verdict = decision === "overturned" ? "overturned" : "upheld";
      await quietly("APPEAL DECIDED NOTIFICATION ERROR", async () => {
        await createNotification({
          studentId: appeal.student_id,
          entity: { type: "attendance", id: appeal.attendance_id },
          title: decision === "overturned" ? "Appeal accepted" : "Appeal not accepted",
          message: `The OJT coordinator ${verdict} ${KIND_NAME[appeal.kind]} on your log for ${appeal.date}. ${outcome} Note: ${note}`,
          type: "attendance",
        });
        if (appeal.supervisor_id) {
          await createNotification({
            supervisorId: appeal.supervisor_id,
            entity: { type: "attendance", id: appeal.attendance_id },
            title: "Appeal decided",
            message: `The OJT coordinator ${verdict} ${KIND_NAME[appeal.kind]} on ${appeal.name}'s log for ${appeal.date}. ${outcome} Note: ${note}`,
            type: "info",
          });
        }
      });
      return res.json({ message: `Appeal ${verdict}. ${outcome}`, appeal: { id: appeal.id, kind: appeal.kind, status: decision, attendance_id: appeal.attendance_id } });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      console.error("DECIDE APPEAL ERROR:", error);
      return res.status(500).json({ message: "Failed to decide the appeal." });
    } finally {
      client?.release();
    }
  });
}
