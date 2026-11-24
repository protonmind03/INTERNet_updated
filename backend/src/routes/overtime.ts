import path from "node:path";
import type express from "express";
import type { Pool } from "pg";
import { storedLogHoursSql } from "../services/creditedHours";
import { sameId } from "../services/ids";
import { ojtSetting } from "../services/ojtSettings";
import { phToday } from "../services/phTime";
import { uploadQuota } from "../services/uploadQuota";
import { expectedVersion } from "../services/versions";

/*
|--------------------------------------------------------------------------
| OVERTIME (Phase 1.4, migration 084)
|--------------------------------------------------------------------------
|
| A trainee asks before or on the day, with the planned end and why, and
| the signed Overtime Form if they have it. Their supervisor approves or
| rejects it; approvals for one trainee in an ISO week (Monday to Sunday,
| Philippine time) stop at the OJT rule overtime_max_per_week (2). An
| approved request lets that day's hours run to its planned end instead of
| the scheduled end (services/creditedHours.ts): a log already finished
| and not yet verified is worked out again at once; a verified one never
| changes.
|
*/

type Role = "student" | "supervisor" | "coordinator" | "director";
type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  upload: { single: (field: string) => express.RequestHandler };
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
  readPrivateFile: (fileName: string) => Promise<{ buffer: Buffer; contentType?: string }>;
  createNotification: (options: { studentId?: string | null; supervisorId?: string | null; title: string; message: string; type?: string; link?: string; entity?: { type: string; id: string | number } }) => Promise<unknown>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORM_TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

const COLUMNS = `o.id, o.student_id, TO_CHAR(o.work_date, 'YYYY-MM-DD') AS work_date,
  TO_CHAR(o.planned_start, 'HH24:MI') AS planned_start, TO_CHAR(o.planned_end, 'HH24:MI') AS planned_end,
  o.reason, o.form_name, o.status, o.decided_by, o.decided_at, o.decision_note, o.version, o.created_at`;

/** Approved requests in the ISO week of `date` (Monday to Sunday), leaving one out. */
async function approvedInWeek(db: Pick<Pool, "query">, studentId: string, date: string, except: number | null = null): Promise<number> {
  const found = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM overtime_requests
     WHERE student_id = $1 AND status = 'approved'
       AND DATE_TRUNC('week', work_date) = DATE_TRUNC('week', $2::date)
       AND ($3::int IS NULL OR id <> $3::int)`,
    [studentId, date, except]
  );
  return found.rows[0].n;
}

export function registerOvertimeRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole } = deps;

  // The trainee's requests and how many are approved this week.
  app.get("/api/students/:studentId/overtime", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own overtime." });
      const [rows, limit, used] = await Promise.all([
        pool.query(`SELECT ${COLUMNS} FROM overtime_requests o WHERE o.student_id = $1 ORDER BY o.work_date DESC, o.id DESC LIMIT 60`, [auth.id]),
        ojtSetting(pool, "overtime_max_per_week"),
        approvedInWeek(pool, auth.id, phToday()),
      ]);
      return res.json({ requests: rows.rows, week: { approved: used, limit } });
    } catch (error) {
      console.error("LIST OVERTIME ERROR:", error);
      return res.status(500).json({ message: "Failed to load your overtime." });
    }
  });

  // A request, before or on the day. The signed form is optional.
  app.post(
    "/api/students/:studentId/overtime",
    requireRole("student"),
    deps.upload.single("form"),
    uploadQuota(pool, "document"),
    async (req, res) => {
      let stored: string | null = null;
      try {
        const auth = (req as Authed).auth!;
        if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only ask for your own overtime." });
        const workDate = String(req.body?.work_date ?? "").trim();
        const start = String(req.body?.planned_start ?? "").trim().slice(0, 5);
        const end = String(req.body?.planned_end ?? "").trim().slice(0, 5);
        const reason = String(req.body?.reason ?? "").trim();
        if (!DATE.test(workDate) || Number.isNaN(Date.parse(`${workDate}T00:00:00Z`))) return res.status(400).json({ message: "Give the day as YYYY-MM-DD." });
        if (workDate < phToday()) return res.status(400).json({ message: "Overtime is asked for before or on the day, not after." });
        if (!TIME.test(start) || !TIME.test(end)) return res.status(400).json({ message: "Give the planned start and end as HH:MM." });
        if (end <= start) return res.status(400).json({ message: "The planned end must be after the planned start." });
        if (reason.length < 5 || reason.length > 1000) return res.status(400).json({ message: "Say in a line why the overtime is needed (5 to 1000 characters)." });
        const file = req.file;
        if (file && FORM_TYPES[path.extname(file.originalname).toLowerCase()] !== file.mimetype) {
          return res.status(400).json({ message: "The Overtime Form is a PDF, JPG or PNG." });
        }
        const student = await pool.query<{ supervisor_id: string | null; name: string }>(`SELECT supervisor_id, name FROM students WHERE student_id = $1`, [auth.id]);
        if (!student.rows[0]?.supervisor_id) return res.status(409).json({ message: "You have no supervisor yet to approve overtime." });
        if (file) stored = await deps.savePrivateFile(file);
        const saved = await pool.query(
          `INSERT INTO overtime_requests AS o (student_id, work_date, planned_start, planned_end, reason, form_path, form_name, form_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
          [auth.id, workDate, start, end, reason, stored, file ? file.originalname.replace(/[\r\n"]/g, "_").slice(0, 200) : null, file?.mimetype ?? null]
        );
        await deps
          .createNotification({
            supervisorId: student.rows[0].supervisor_id,
            title: "Overtime to approve",
            message: `${student.rows[0].name} asks to work until ${end} on ${workDate}.`,
            type: "overtime",
            link: "/supervisor/dashboard",
            entity: { type: "overtime", id: saved.rows[0].id },
          })
          .catch((error) => console.error("OVERTIME NOTIFICATION ERROR:", error));
        return res.status(201).json({ message: "Overtime request sent to your supervisor.", request: saved.rows[0] });
      } catch (error) {
        if (stored) await deps.deletePrivateFile(stored).catch(() => undefined);
        if ((error as { code?: string }).code === "23505") {
          return res.status(409).json({ code: "ONE_A_DAY", message: "You already have an overtime request for that day. Cancel it first to ask again." });
        }
        console.error("ADD OVERTIME ERROR:", error);
        return res.status(500).json({ message: "Failed to send the request." });
      }
    }
  );

  // Withdrawn by the trainee while it waits, or before its day once approved.
  app.post("/api/students/:studentId/overtime/:id/cancel", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only cancel your own overtime." });
      const done = await pool.query(
        `UPDATE overtime_requests o SET status = 'cancelled', version = version + 1
         WHERE o.id = $1 AND o.student_id = $2
           AND (o.status = 'pending' OR (o.status = 'approved' AND o.work_date > $3::date))
         RETURNING ${COLUMNS}`,
        [Number(req.params.id) || 0, auth.id, phToday()]
      );
      if (done.rows.length === 0) return res.status(409).json({ message: "This request can no longer be cancelled." });
      return res.json({ message: "Overtime request cancelled.", request: done.rows[0] });
    } catch (error) {
      console.error("CANCEL OVERTIME ERROR:", error);
      return res.status(500).json({ message: "Failed to cancel the request." });
    }
  });

  // The supervisor's interns' requests, waiting first.
  app.get("/api/supervisor/overtime", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const [rows, limit] = await Promise.all([
        pool.query(
          `SELECT ${COLUMNS}, s.name AS student_name,
                  (SELECT COUNT(*)::int FROM overtime_requests w WHERE w.student_id = o.student_id AND w.status = 'approved'
                     AND DATE_TRUNC('week', w.work_date) = DATE_TRUNC('week', o.work_date)) AS approved_that_week
           FROM overtime_requests o JOIN students s ON s.student_id = o.student_id
           WHERE s.supervisor_id = $1 AND s.is_active = TRUE AND o.work_date >= CURRENT_DATE - 60
           ORDER BY (o.status = 'pending') DESC, o.work_date, o.id
           LIMIT 300`,
          [auth.id]
        ),
        ojtSetting(pool, "overtime_max_per_week"),
      ]);
      return res.json({ requests: rows.rows, limit });
    } catch (error) {
      console.error("LIST SUPERVISOR OVERTIME ERROR:", error);
      return res.status(500).json({ message: "Failed to load the overtime requests." });
    }
  });

  // Approve (within the week's limit) or reject (with a note), from the version read.
  app.put("/api/supervisor/overtime/:id/decision", requireRole("supervisor"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ message: "Request not found." });
    const decision = req.body?.decision;
    if (decision !== "approve" && decision !== "reject") return res.status(400).json({ message: "Approve or reject the request." });
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    if (decision === "reject" && note.length < 3) return res.status(400).json({ message: "Say why, so the trainee knows." });
    const auth = (req as Authed).auth!;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ student_id: string; work_date: string; planned_end: string; status: string; version: number; supervisor_id: string | null }>(
        `SELECT o.student_id, TO_CHAR(o.work_date, 'YYYY-MM-DD') AS work_date, TO_CHAR(o.planned_end, 'HH24:MI') AS planned_end,
                o.status, o.version, s.supervisor_id
         FROM overtime_requests o JOIN students s ON s.student_id = o.student_id WHERE o.id = $1 FOR UPDATE OF o`,
        [id]
      );
      const request = found.rows[0];
      // Another supervisor's intern answers as if it did not exist.
      if (!request || !sameId(request.supervisor_id, auth.id)) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Request not found." });
      }
      const stale = expectedVersion(req.body) !== request.version;
      if (stale || request.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "STALE", message: request.status !== "pending" ? `This request is already ${request.status}.` : "This request changed after you opened it. It is reloaded." });
      }
      if (decision === "approve") {
        // Two approvals for one trainee wait for each other: the trainee's row is the lock.
        await client.query(`SELECT 1 FROM students WHERE student_id = $1 FOR UPDATE`, [request.student_id]);
        const limit = await ojtSetting(client, "overtime_max_per_week");
        const used = await approvedInWeek(client, request.student_id, request.work_date, id);
        if (used >= limit) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            code: "OVERTIME_LIMIT",
            message: `${limit === 0 ? "No overtime may be approved" : `Only ${limit} overtime ${limit === 1 ? "day" : "days"} a week may be approved`}, and that week already has ${used}.`,
          });
        }
      }
      const saved = await client.query(
        `UPDATE overtime_requests o SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4, version = version + 1
         WHERE o.id = $1 RETURNING ${COLUMNS}`,
        [id, decision === "approve" ? "approved" : "rejected", auth.id, note || null]
      );
      // A finished day not yet verified is worked out again with the new end; a verified one stays.
      if (decision === "approve") {
        await client.query(
          `UPDATE attendance a SET hours = ${storedLogHoursSql("a")}
           WHERE a.student_id = $1 AND a.date = $2::date AND a.time_out IS NOT NULL
             AND a.credited_until IS NOT NULL AND a.status <> 'Verified'`,
          [request.student_id, request.work_date]
        );
      }
      await client.query("COMMIT");
      await deps
        .createNotification({
          studentId: request.student_id,
          title: decision === "approve" ? "Overtime approved" : "Overtime not approved",
          message:
            decision === "approve"
              ? `Your overtime on ${request.work_date} until ${request.planned_end} is approved. Those hours count.`
              : `Your overtime on ${request.work_date} was not approved: ${note}`,
          type: "overtime",
          link: "/daily-log",
        })
        .catch((error) => console.error("OVERTIME DECISION NOTIFICATION ERROR:", error));
      return res.json({ message: decision === "approve" ? "Overtime approved." : "Overtime rejected.", request: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("DECIDE OVERTIME ERROR:", error);
      return res.status(500).json({ message: "Failed to decide the request." });
    } finally {
      client.release();
    }
  });

  // The approved overtime of one trainee, for the remarks on their Daily Time Record (CS Form 48).
  app.get("/api/overtime/student/:studentId/approved", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const studentId = String(req.params.studentId);
      if (auth.role === "student" && !sameId(auth.id, studentId)) return res.status(403).json({ message: "You can only see your own overtime." });
      if (auth.role === "supervisor") {
        const mine = await pool.query(`SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`, [studentId, auth.id]);
        if (mine.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      }
      const rows = await pool.query(
        `SELECT TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date, TO_CHAR(planned_start, 'HH24:MI') AS planned_start, TO_CHAR(planned_end, 'HH24:MI') AS planned_end
         FROM overtime_requests WHERE student_id = $1 AND status = 'approved' ORDER BY work_date`,
        [studentId]
      );
      return res.json({ overtime: rows.rows });
    } catch (error) {
      console.error("LIST APPROVED OVERTIME ERROR:", error);
      return res.status(500).json({ message: "Failed to load the overtime." });
    }
  });

  // The signed form: the trainee, their supervisor, and the coordinators.
  app.get("/api/overtime/:id/form", requireRole(["student", "supervisor", "coordinator"]), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const found = await pool.query<{ student_id: string; supervisor_id: string | null; form_path: string | null; form_name: string | null; form_type: string | null }>(
        `SELECT o.student_id, s.supervisor_id, o.form_path, o.form_name, o.form_type
         FROM overtime_requests o JOIN students s ON s.student_id = o.student_id WHERE o.id = $1`,
        [Number(req.params.id) || 0]
      );
      const row = found.rows[0];
      const allowed =
        row &&
        (auth.role === "coordinator" ||
          (auth.role === "student" && sameId(row.student_id, auth.id)) ||
          (auth.role === "supervisor" && sameId(row.supervisor_id, auth.id)));
      if (!allowed) return res.status(404).json({ message: "Form not found." });
      if (!row.form_path) return res.status(404).json({ message: "No form was attached to this request." });
      const file = await deps.readPrivateFile(path.basename(row.form_path));
      return res.type(row.form_type || file.contentType || "application/octet-stream").attachment(row.form_name || "overtime-form").send(file.buffer);
    } catch (error) {
      console.error("GET OVERTIME FORM ERROR:", error);
      return res.status(500).json({ message: "Failed to open the form." });
    }
  });
}
