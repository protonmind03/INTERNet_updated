import { randomInt } from "node:crypto";
import type express from "express";
import type { Pool, PoolClient } from "pg";
import { PRIVACY_NOTICE, hasCurrentConsent } from "../services/privacy";
import { categoriesFor } from "../services/notificationPreferences";
import { coordinatorAlerts, programmeReport, projectionsFor } from "../services/insights";

/*
|--------------------------------------------------------------------------
| EXTENSION ROUTES
|--------------------------------------------------------------------------
|
| Features added after the original build, kept out of server.ts so that
| file does not grow further:
|
|  - absence filing and review
|  - editing and cancelling tasks
|  - bulk student import
|  - announcements
|  - coordinator password resets
|  - replies on complaints
|
| server.ts passes in the pieces these routes share with the rest of the
| API (the database pool, the auth middleware, the notification writer).
|
*/

type Role = "student" | "supervisor" | "coordinator";

type AuthedRequest = express.Request & { auth?: { role: Role; id: string } };

type NotificationInput = {
  studentId?: string | null;
  supervisorId?: string | null;
  coordinatorId?: string | null;
  title: string;
  message: string;
  type?: string;
  /** The page to open; worked out by the server when left out. */
  link?: string;
  /** The record this is about, when there is one. */
  entity?: { type: string; id: string | number | null | undefined };
};

export type ExtensionDependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  createNotification: (notification: NotificationInput) => Promise<void>;
  notifyCoordinators: (notification: {
    title: string;
    message: string;
    type?: string;
    link?: string;
    entity?: { type: string; id: string | number | null | undefined };
  }) => Promise<void>;
  hashPassword: (plain: string) => Promise<string>;
  passwordPolicyError: (password: unknown) => string | null;
  loginAttemptKey: (role: string, identifier: unknown) => string;
  closeNotificationStreams: (account: { role: Role; id: string }) => void;
  upload: { single: (field: string) => express.RequestHandler };
  savePrivateFile: (file: Express.Multer.File) => Promise<string>;
  deletePrivateFile: (fileName: string) => Promise<void>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How much a weekly journal's required parts must say, and the most any part may. */
const JOURNAL_MIN = 30;
const JOURNAL_MAX = 3000;

const JOURNAL_COLUMNS = `
  j.id, j.student_id, TO_CHAR(j.week_start, 'YYYY-MM-DD') AS week_start,
  j.activities, j.learnings, j.challenges, j.status, j.review_notes,
  j.submitted_at, j.updated_at, j.reviewed_at
`;

/** Today's date in the Philippines, the zone every OJT date is kept in. */
function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** "YYYY-MM-DD" a number of days from a given date. */
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** A notification failure must never undo the action that caused it. */
async function quietly(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`${label}:`, error);
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A starting password that satisfies the password policy. */
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)];
  const characters = [pick(upper), pick(lower), pick(digits)];
  while (characters.length < 14) characters.push(pick(all));
  // Shuffle so the guaranteed characters are not always first.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [characters[index], characters[other]] = [characters[other], characters[index]];
  }
  return characters.join("");
}

export function registerExtensionRoutes(
  app: express.Express,
  deps: ExtensionDependencies
): void {
  const {
    pool,
    requireRole,
    requireCoordinator,
    createNotification,
    notifyCoordinators,
    hashPassword,
    passwordPolicyError,
    loginAttemptKey,
    closeNotificationStreams,
    upload,
    savePrivateFile,
    deletePrivateFile,
  } = deps;

  /** Removes a stored upload ("/uploads/name") without failing the request. */
  const discardUpload = (storedPath: string | null | undefined) =>
    storedPath
      ? quietly("REMOVE TASK ATTACHMENT ERROR", () =>
          deletePrivateFile(storedPath.replace(/^\/uploads\//, ""))
        )
      : Promise.resolve();

  /*
  |--------------------------------------------------------------------------
  | ABSENCES
  |--------------------------------------------------------------------------
  */

  const ABSENCE_COLUMNS = `
    a.id, a.student_id, TO_CHAR(a.date, 'YYYY-MM-DD') AS date, a.reason,
    a.status, a.review_notes, a.reviewed_at, a.created_at
  `;

  app.post("/api/absences", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const date = text(req.body?.date);
      const reason = text(req.body?.reason);

      if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
        return res.status(400).json({ message: "Choose the date of the absence." });
      }
      if (reason.length < 5) {
        return res.status(400).json({ message: "Give a reason for the absence." });
      }
      const today = todayInManila();
      if (date < shiftDate(today, -30) || date > shiftDate(today, 30)) {
        return res.status(400).json({
          message: "An absence can be filed up to 30 days back or 30 days ahead.",
        });
      }

      const logged = await pool.query(
        `SELECT 1 FROM attendance WHERE student_id = $1 AND date = $2::date`,
        [auth.id, date]
      );
      if (logged.rows.length > 0) {
        return res.status(409).json({
          message: "You have an attendance log for that day, so it is not an absence.",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO absences AS a (student_id, date, reason)
        VALUES ($1, $2::date, $3)
        RETURNING ${ABSENCE_COLUMNS}
        `,
        [auth.id, date, reason.slice(0, 1000)]
      );

      await quietly("ABSENCE NOTIFICATION ERROR", async () => {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (owner.rows[0]?.supervisor_id) {
          await createNotification({
            supervisorId: owner.rows[0].supervisor_id,
            title: "Absence filed for review",
            message: `${owner.rows[0].name} filed an absence for ${date}.`,
            type: "attendance",
          });
        }
      });

      return res.status(201).json({ message: "Absence filed.", absence: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({
          message: "You have already filed an absence for that day.",
        });
      }
      console.error("FILE ABSENCE ERROR:", error);
      return res.status(500).json({ message: "Failed to file the absence." });
    }
  });

  app.get(
    "/api/absences/student/:studentId",
    requireRole("student"),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        if (auth.id !== req.params.studentId) {
          return res.status(403).json({ message: "You can only view your own absences." });
        }
        const result = await pool.query(
          `SELECT ${ABSENCE_COLUMNS} FROM absences a
           WHERE a.student_id = $1 ORDER BY a.date DESC`,
          [auth.id]
        );
        return res.json({ absences: result.rows });
      } catch (error) {
        console.error("GET STUDENT ABSENCES ERROR:", error);
        return res.status(500).json({ message: "Failed to load absences." });
      }
    }
  );

  app.delete("/api/absences/:id", requireRole("student"), async (req, res) => {
    try {
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Absence not found." });
      }
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query(
        `DELETE FROM absences
         WHERE id = $1 AND student_id = $2 AND status = 'Pending'
         RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') AS date`,
        [req.params.id, auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Only an absence that has not been reviewed can be withdrawn.",
        });
      }

      // Without this the supervisor's queue would keep a request that is gone.
      await quietly("ABSENCE WITHDRAWN NOTIFICATION ERROR", async () => {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [auth.id]
        );
        if (owner.rows[0]?.supervisor_id) {
          await createNotification({
            supervisorId: owner.rows[0].supervisor_id,
            title: "Absence withdrawn",
            message: `${owner.rows[0].name} withdrew the absence filed for ${result.rows[0].date}. No decision is needed.`,
            type: "attendance",
          });
        }
      });
      return res.json({ message: "Absence withdrawn." });
    } catch (error) {
      console.error("WITHDRAW ABSENCE ERROR:", error);
      return res.status(500).json({ message: "Failed to withdraw the absence." });
    }
  });

  app.get("/api/absences/supervisor", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query(
        `
        SELECT ${ABSENCE_COLUMNS}, s.name AS student_name
        FROM absences a
        INNER JOIN students s ON s.student_id = a.student_id
        WHERE s.supervisor_id = $1
          AND s.is_active = TRUE
        ORDER BY CASE WHEN a.status = 'Pending' THEN 0 ELSE 1 END, a.date DESC
        LIMIT 500
        `,
        [auth.id]
      );
      return res.json({ absences: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR ABSENCES ERROR:", error);
      return res.status(500).json({ message: "Failed to load absences." });
    }
  });

  app.get("/api/coordinator/absences", requireCoordinator, async (_req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT ${ABSENCE_COLUMNS}, s.name AS student_name, s.company,
               sup.name AS supervisor_name
        FROM absences a
        INNER JOIN students s ON s.student_id = a.student_id
        LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
        ORDER BY a.date DESC
        LIMIT 500
        `
      );
      return res.json({ absences: result.rows });
    } catch (error) {
      console.error("GET COORDINATOR ABSENCES ERROR:", error);
      return res.status(500).json({ message: "Failed to load absences." });
    }
  });

  app.patch(
    "/api/absences/:id/review",
    requireRole(["supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const status = req.body?.status;
        const notes = text(req.body?.notes);
        if (!/^\d+$/.test(String(req.params.id))) {
          return res.status(404).json({ message: "Absence not found." });
        }

        // "Pending" withdraws a decision made by mistake.
        if (status !== "Excused" && status !== "Unexcused" && status !== "Pending") {
          return res.status(400).json({ message: "Status must be Excused, Unexcused, or Pending." });
        }
        if (status === "Unexcused" && !notes) {
          return res.status(400).json({
            message: "A reason is required when marking an absence unexcused.",
          });
        }

        const result = await pool.query(
          `
          UPDATE absences a
          SET status = $1::text,
              review_notes = CASE WHEN $1::text = 'Pending' THEN NULL ELSE $2::text END,
              reviewed_by = CASE WHEN $1::text = 'Pending' THEN NULL ELSE $4::text END,
              reviewed_at = CASE WHEN $1::text = 'Pending' THEN NULL ELSE NOW() END
          FROM students s
          WHERE a.id = $3
            AND s.student_id = a.student_id
            AND ($5::text = 'coordinator' OR s.supervisor_id = $4::text)
            -- A decision applies to a pending absence; an undo to a decided one.
            AND (($1::text = 'Pending') <> (a.status = 'Pending'))
          RETURNING ${ABSENCE_COLUMNS}
          `,
          [status, notes || null, req.params.id, auth.id, auth.role]
        );
        if (result.rows.length === 0) {
          const current = await pool.query(
            `SELECT 1 FROM absences a JOIN students s ON s.student_id = a.student_id
             WHERE a.id = $1 AND ($3::text = 'coordinator' OR s.supervisor_id = $2::text)`,
            [req.params.id, auth.id, auth.role]
          );
          if (current.rows.length > 0) {
            return res.status(409).json({
              message:
                status === "Pending"
                  ? "This absence is already waiting for review."
                  : "This absence was already reviewed.",
            });
          }
          return res.status(404).json({
            message: "Absence not found. The intern may have withdrawn it.",
          });
        }

        const absence = result.rows[0];
        await quietly("ABSENCE REVIEW NOTIFICATION ERROR", () =>
          createNotification({
            studentId: absence.student_id,
            title:
              status === "Pending" ? "Absence back under review" : `Absence ${status.toLowerCase()}`,
            message:
              status === "Pending"
                ? `The decision on your absence for ${absence.date} was withdrawn. It is waiting to be reviewed again.`
                : `Your absence on ${absence.date} was marked ${status.toLowerCase()}.${
                    notes ? ` Note: ${notes}` : ""
                  }`,
            type: "attendance",
          })
        );

        return res.json({ message: "Absence reviewed.", absence });
      } catch (error) {
        console.error("REVIEW ABSENCE ERROR:", error);
        return res.status(500).json({ message: "Failed to review the absence." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | EDIT / CANCEL A TASK (supervisor)
  |--------------------------------------------------------------------------
  |
  | Only a task the intern has not submitted yet can be changed or cancelled;
  | once work is handed in it is reviewed, not rewritten.
  |
  */

  app.put("/api/tasks/:id", requireRole("supervisor"), upload.single("attachment"), async (req, res) => {
    let newFileName: string | undefined;
    let saved = false;
    try {
      const auth = (req as AuthedRequest).auth!;
      const title = text(req.body?.title);
      const description = text(req.body?.description);
      const priority = req.body?.priority;
      const dueDate = text(req.body?.due_date);
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Task not found." });
      }

      if (!title) {
        return res.status(400).json({ message: "A task title is required." });
      }
      if (!["High", "Medium", "Low"].includes(priority)) {
        return res.status(400).json({ message: "Priority must be High, Medium, or Low." });
      }
      if (!DATE_PATTERN.test(dueDate) || Number.isNaN(Date.parse(dueDate))) {
        return res.status(400).json({ message: "Due date must be a valid date (YYYY-MM-DD)." });
      }
      if (dueDate < todayInManila()) {
        return res.status(400).json({ message: "The due date cannot be in the past." });
      }

      // A new file replaces the attachment; remove_attachment drops it.
      const removeAttachment =
        req.body?.remove_attachment === true || req.body?.remove_attachment === "true";
      const previous = await pool.query<{ attachment_file: string | null }>(
        `SELECT attachment_file FROM tasks WHERE id = $1`,
        [req.params.id]
      );
      if (req.file) {
        newFileName = await savePrivateFile(req.file);
      }
      const attachmentMode = req.file ? "replace" : removeAttachment ? "remove" : "keep";

      const result = await pool.query(
        `
        UPDATE tasks t
        SET title = $1, description = $2, priority = $3, due_date = $4::date,
            attachment_file = CASE $7::text
              WHEN 'replace' THEN $8::text WHEN 'remove' THEN NULL ELSE t.attachment_file END,
            attachment_name = CASE $7::text
              WHEN 'replace' THEN $9::text WHEN 'remove' THEN NULL ELSE t.attachment_name END
        FROM students s
        WHERE t.id = $5
          AND s.student_id = t.student_id
          AND s.supervisor_id = $6
          AND t.status IN ('Pending', 'In Progress')
        RETURNING t.*
        `,
        [
          title.slice(0, 200),
          description || null,
          priority,
          dueDate,
          req.params.id,
          auth.id,
          attachmentMode,
          newFileName ? `/uploads/${newFileName}` : null,
          req.file ? req.file.originalname.slice(0, 200) : null,
        ]
      );
      if (result.rows.length === 0) {
        if (newFileName) await discardUpload(`/uploads/${newFileName}`);
        return res.status(404).json({
          message: "Only a task your intern has not submitted yet can be edited.",
        });
      }
      saved = true;
      if (attachmentMode !== "keep") {
        await discardUpload(previous.rows[0]?.attachment_file);
      }

      const task = result.rows[0];
      await quietly("TASK UPDATE NOTIFICATION ERROR", async () => {
        // A moved deadline needs fresh reminders.
        await pool.query(`DELETE FROM task_deadline_reminders WHERE task_id = $1`, [task.id]);
        await createNotification({
          studentId: String(task.student_id),
          entity: { type: "task", id: task?.id },
          title: "Task updated",
          message: `"${task.title}" was updated by your supervisor. It is due ${dueDate}.`,
          type: "task",
        });
      });

      return res.json({ message: "Task updated.", task });
    } catch (error) {
      if (newFileName && !saved) await discardUpload(`/uploads/${newFileName}`);
      console.error("UPDATE TASK ERROR:", error);
      return res.status(500).json({ message: "Failed to update the task." });
    }
  });

  app.delete("/api/tasks/:id", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Task not found." });
      }
      const result = await pool.query(
        `
        DELETE FROM tasks t
        USING students s
        WHERE t.id = $1
          AND s.student_id = t.student_id
          AND s.supervisor_id = $2
          AND t.status IN ('Pending', 'In Progress')
        RETURNING t.id, t.student_id, t.title, t.attachment_file
        `,
        [req.params.id, auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Only a task your intern has not submitted yet can be cancelled.",
        });
      }

      const task = result.rows[0];
      await discardUpload(task.attachment_file);
      await quietly("TASK CANCEL NOTIFICATION ERROR", async () => {
        await pool.query(`DELETE FROM task_deadline_reminders WHERE task_id = $1`, [task.id]);
        await createNotification({
          studentId: String(task.student_id),
          entity: { type: "task", id: task?.id },
          title: "Task cancelled",
          message: `"${task.title}" was cancelled by your supervisor. You no longer need to submit it.`,
          type: "task",
        });
      });

      return res.json({ message: "Task cancelled." });
    } catch (error) {
      console.error("CANCEL TASK ERROR:", error);
      return res.status(500).json({ message: "Failed to cancel the task." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | UNDO A REVIEW (supervisor)
  |--------------------------------------------------------------------------
  |
  | A task or document decision made by mistake can be taken back for a
  | short while, which returns the item to the review queue. After that the
  | intern has probably acted on it, so the decision stands.
  |
  */

  const UNDO_WINDOW = "15 minutes";

  app.post("/api/tasks/:id/review/undo", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Task not found." });
      }
      const result = await pool.query(
        `
        UPDATE tasks t
        SET status = 'Submitted', review_notes = NULL, review_rating = NULL, reviewed_at = NULL
        FROM students s
        WHERE t.id = $1
          AND s.student_id = t.student_id
          AND s.supervisor_id = $2
          AND t.status IN ('Reviewed', 'In Progress')
          AND t.submitted_at IS NOT NULL
          AND t.reviewed_at > NOW() - INTERVAL '${UNDO_WINDOW}'
        RETURNING t.id, t.student_id, t.title
        `,
        [req.params.id, auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(409).json({
          message: "This review can no longer be undone.",
        });
      }
      const task = result.rows[0];
      await quietly("TASK UNDO NOTIFICATION ERROR", () =>
        createNotification({
          studentId: String(task.student_id),
          entity: { type: "task", id: task?.id },
          title: "Task back under review",
          message: `The review of "${task.title}" was withdrawn. It is waiting to be reviewed again.`,
          type: "task",
        })
      );
      return res.json({ message: "Review withdrawn." });
    } catch (error) {
      console.error("UNDO TASK REVIEW ERROR:", error);
      return res.status(500).json({ message: "Failed to undo the review." });
    }
  });

  app.post("/api/documents/:id/review/undo", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Document not found." });
      }
      const result = await pool.query(
        `
        UPDATE documents d
        SET status = 'Pending', review_notes = NULL, reviewed_by_supervisor_id = NULL, reviewed_at = NULL
        FROM students s
        WHERE d.id = $1
          AND s.student_id = d.student_id
          AND s.supervisor_id = $2
          AND d.status IN ('Approved', 'Rejected')
          AND d.reviewed_at > NOW() - INTERVAL '${UNDO_WINDOW}'
          -- Not once the intern has uploaded a replacement for it.
          AND NOT EXISTS (
            SELECT 1 FROM documents newer
            WHERE newer.student_id = d.student_id
              AND newer.doc_type = d.doc_type
              AND newer.id > d.id
          )
        RETURNING d.id, d.student_id, d.doc_type
        `,
        [req.params.id, auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(409).json({
          message: "This review can no longer be undone.",
        });
      }
      const document = result.rows[0];
      await quietly("DOCUMENT UNDO NOTIFICATION ERROR", () =>
        createNotification({
          studentId: String(document.student_id),
          entity: { type: "document", id: document?.id },
          title: "Document back under review",
          message: `The review of your ${document.doc_type} was withdrawn. It is waiting to be reviewed again.`,
          type: "document",
        })
      );
      return res.json({ message: "Review withdrawn." });
    } catch (error) {
      console.error("UNDO DOCUMENT REVIEW ERROR:", error);
      return res.status(500).json({ message: "Failed to undo the review." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | AN INTERN'S SCHEDULE (supervisor)
  |--------------------------------------------------------------------------
  */

  app.get(
    "/api/supervisor/interns/:studentId/schedule",
    requireRole("supervisor"),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const assigned = await pool.query(
          `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`,
          [req.params.studentId, auth.id]
        );
        if (assigned.rows.length === 0) {
          return res.status(403).json({ message: "You can only view your own interns." });
        }
        const result = await pool.query(
          `
          SELECT id, day, start_time, end_time, focus, hours
          FROM ojt_schedule
          WHERE student_id = $1 AND is_active = TRUE
          ORDER BY CASE day
            WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
            WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
            WHEN 'Sunday' THEN 7 ELSE 8 END
          `,
          [req.params.studentId]
        );
        return res.json({ schedule: result.rows });
      } catch (error) {
        console.error("GET INTERN SCHEDULE ERROR:", error);
        return res.status(500).json({ message: "Failed to load the schedule." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | EDIT / REMOVE AN EVALUATION (its author only)
  |--------------------------------------------------------------------------
  */

  const evaluatorTypeOf = (role: Role) => (role === "coordinator" ? "teacher" : role);

  app.put(
    "/api/evaluations/:id",
    requireRole(["supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const rating = Number(req.body?.rating);
        const category = text(req.body?.category);
        const comments = text(req.body?.comments);
        if (!/^\d+$/.test(String(req.params.id))) {
          return res.status(404).json({ message: "Evaluation not found." });
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return res.status(400).json({ message: "Rating must be between 1 and 5." });
        }
        const result = await pool.query(
          `
          UPDATE evaluations
          SET rating = $1, comments = $2, category = COALESCE(NULLIF($3, ''), category)
          WHERE id = $4 AND evaluator_id = $5 AND evaluator_type = $6
          RETURNING id, student_id, category
          `,
          [rating, comments || null, category, req.params.id, auth.id, evaluatorTypeOf(auth.role)]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ message: "You can only change an evaluation you wrote." });
        }
        await quietly("EVALUATION UPDATE NOTIFICATION ERROR", () =>
          createNotification({
            studentId: String(result.rows[0].student_id),
            title: "Evaluation updated",
            message: `Your ${result.rows[0].category} evaluation was updated.`,
            type: "evaluation",
          })
        );
        return res.json({ message: "Evaluation updated." });
      } catch (error) {
        console.error("UPDATE EVALUATION ERROR:", error);
        return res.status(500).json({ message: "Failed to update the evaluation." });
      }
    }
  );

  app.delete(
    "/api/evaluations/:id",
    requireRole(["supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        if (!/^\d+$/.test(String(req.params.id))) {
          return res.status(404).json({ message: "Evaluation not found." });
        }
        const result = await pool.query(
          `DELETE FROM evaluations
           WHERE id = $1 AND evaluator_id = $2 AND evaluator_type = $3
           RETURNING id`,
          [req.params.id, auth.id, evaluatorTypeOf(auth.role)]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ message: "You can only remove an evaluation you wrote." });
        }
        return res.json({ message: "Evaluation removed." });
      } catch (error) {
        console.error("DELETE EVALUATION ERROR:", error);
        return res.status(500).json({ message: "Failed to remove the evaluation." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | BULK STUDENT IMPORT (coordinator)
  |--------------------------------------------------------------------------
  |
  | Each row is created on its own, so one bad row does not block the rest;
  | the response says what happened to every row. A row without a password
  | is given a generated one, returned once so the coordinator can hand it
  | out. Every imported student must set their own password at first login.
  |
  | `dry_run: true` runs every check, including whether the ID or email is
  | already taken, and creates nothing: the coordinator sees what would
  | happen to each row before anything is written.
  |
  */

  const MAX_IMPORT_ROWS = 200;

  app.post("/api/coordinator/students/import", requireCoordinator, async (req, res) => {
    const rows: unknown[] = Array.isArray(req.body?.students) ? req.body.students : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: "The file has no students to import." });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        message: `Import at most ${MAX_IMPORT_ROWS} students at a time.`,
      });
    }

    const coordinatorId = (req as AuthedRequest).auth?.id || null;
    const dryRun = req.body?.dry_run === true;
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    // Only an active supervisor can be given interns.
    const supervisors = await pool.query<{ supervisor_id: string; name: string }>(
      `SELECT supervisor_id, name FROM supervisors WHERE is_active = TRUE`
    );
    const knownSupervisors = new Map(
      supervisors.rows.map((row) => [row.supervisor_id, row.name])
    );

    const results: {
      row: number;
      student_id: string;
      name: string;
      status: "created" | "ok" | "error";
      message: string;
      password?: string;
    }[] = [];

    for (const [index, raw] of rows.entries()) {
      const entry = (raw || {}) as Record<string, unknown>;
      const studentId = text(entry.student_id);
      const name = text(entry.name);
      const email = text(entry.email).toLowerCase();
      const supervisorId = text(entry.supervisor_id);
      const requiredHours = entry.required_hours === "" || entry.required_hours == null
        ? 180
        : Number(entry.required_hours);
      const fail = (message: string) =>
        results.push({ row: index + 1, student_id: studentId, name, status: "error", message });

      if (!studentId || !name || !email) {
        fail("Student ID, name and email are all required.");
        continue;
      }
      if (!EMAIL_PATTERN.test(email)) {
        fail("The email address is not valid.");
        continue;
      }
      if (!Number.isFinite(requiredHours) || requiredHours <= 0 || requiredHours > 5000) {
        fail("Required hours must be a number between 1 and 5000.");
        continue;
      }
      if (supervisorId && !knownSupervisors.has(supervisorId)) {
        fail(`No active supervisor has the ID "${supervisorId}".`);
        continue;
      }

      const supplied = typeof entry.password === "string" ? entry.password : "";
      const password = supplied || generatePassword();
      const policyError = passwordPolicyError(password);
      if (policyError) {
        fail(`Password: ${policyError}`);
        continue;
      }
      if (seenIds.has(studentId.toLowerCase()) || seenEmails.has(email)) {
        fail("This student ID or email is in the file more than once.");
        continue;
      }
      seenIds.add(studentId.toLowerCase());
      seenEmails.add(email);

      if (dryRun) {
        const taken = await pool.query(
          `SELECT 1 FROM students WHERE student_id = $1 OR LOWER(email) = $2`,
          [studentId, email]
        );
        if (taken.rows.length > 0) fail("A student with that ID or email already exists.");
        else {
          results.push({ row: index + 1, student_id: studentId, name, status: "ok", message: "Ready to import." });
        }
        continue;
      }

      try {
        await pool.query(
          `
          INSERT INTO students
            (student_id, email, password, name, program, company, supervisor_id,
             required_hours, is_active, coordinator_id, must_change_password)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, TRUE)
          `,
          [
            studentId,
            email,
            await hashPassword(password),
            name,
            text(entry.program) || null,
            text(entry.company) || null,
            supervisorId || null,
            Math.round(requiredHours),
            coordinatorId,
          ]
        );
        results.push({
          row: index + 1,
          student_id: studentId,
          name,
          status: "created",
          message: "Created.",
          password,
        });

        await quietly("IMPORT NOTIFICATION ERROR", async () => {
          await createNotification({
            studentId,
            title: "Welcome to INTERNet",
            message: `Your OJT account has been created. You can now log in as ${email}.`,
            type: "info",
          });
          if (supervisorId) {
            await createNotification({
              supervisorId,
              title: "New intern assigned",
              message: `${name} has been assigned to you by the OJT coordinator.`,
              type: "info",
            });
          }
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          fail("A student with that ID or email already exists.");
        } else {
          console.error("IMPORT STUDENT ERROR:", error);
          fail("This student could not be saved.");
        }
      }
    }

    if (dryRun) {
      const ready = results.filter((result) => result.status === "ok").length;
      return res.json({
        dry_run: true,
        message: `${ready} of ${rows.length} students can be imported.`,
        ready,
        failed: rows.length - ready,
        results,
      });
    }
    const created = results.filter((result) => result.status === "created").length;
    return res.status(created > 0 ? 201 : 400).json({
      message: `${created} of ${rows.length} students imported.`,
      created,
      failed: rows.length - created,
      results,
    });
  });


  /*
  |--------------------------------------------------------------------------
  | BULK SUPERVISOR IMPORT (coordinator)
  |--------------------------------------------------------------------------
  |
  | The same as the student import above: each row stands by itself, the
  | answer says what happened to every row, a row with no password is given
  | a generated one (returned once), and every imported supervisor must set
  | their own at first sign-in. `dry_run: true` checks the file and creates
  | nothing.
  |
  */

  app.post("/api/coordinator/supervisors/import", requireCoordinator, async (req, res) => {
    const rows: unknown[] = Array.isArray(req.body?.supervisors) ? req.body.supervisors : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: "The file has no supervisors to import." });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        message: `Import at most ${MAX_IMPORT_ROWS} supervisors at a time.`,
      });
    }
    const dryRun = req.body?.dry_run === true;
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();

    const results: {
      row: number;
      supervisor_id: string;
      name: string;
      status: "created" | "ok" | "error";
      message: string;
      password?: string;
    }[] = [];

    for (const [index, raw] of rows.entries()) {
      const entry = (raw || {}) as Record<string, unknown>;
      const supervisorId = text(entry.supervisor_id);
      const name = text(entry.name);
      const email = text(entry.email).toLowerCase();
      const fail = (message: string) =>
        results.push({ row: index + 1, supervisor_id: supervisorId, name, status: "error", message });

      if (!supervisorId || !name || !email) {
        fail("Supervisor ID, name and email are all required.");
        continue;
      }
      if (supervisorId.length > 50) {
        fail("The supervisor ID is longer than 50 characters.");
        continue;
      }
      if (!EMAIL_PATTERN.test(email)) {
        fail("The email address is not valid.");
        continue;
      }
      const supplied = typeof entry.password === "string" ? entry.password : "";
      const password = supplied || generatePassword();
      const policyError = passwordPolicyError(password);
      if (policyError) {
        fail(`Password: ${policyError}`);
        continue;
      }
      if (seenIds.has(supervisorId.toLowerCase()) || seenEmails.has(email)) {
        fail("This supervisor ID or email is in the file more than once.");
        continue;
      }
      seenIds.add(supervisorId.toLowerCase());
      seenEmails.add(email);

      if (dryRun) {
        const taken = await pool.query(
          `SELECT 1 FROM supervisors WHERE supervisor_id = $1 OR LOWER(email) = $2`,
          [supervisorId, email]
        );
        if (taken.rows.length > 0) fail("A supervisor with that ID or email already exists.");
        else {
          results.push({ row: index + 1, supervisor_id: supervisorId, name, status: "ok", message: "Ready to import." });
        }
        continue;
      }

      try {
        await pool.query(
          `
          INSERT INTO supervisors
            (supervisor_id, email, password, name, company, department, is_active, must_change_password)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
          `,
          [
            supervisorId,
            email,
            await hashPassword(password),
            name,
            text(entry.company) || null,
            text(entry.department) || null,
          ]
        );
        results.push({
          row: index + 1,
          supervisor_id: supervisorId,
          name,
          status: "created",
          message: "Created.",
          password,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          fail("A supervisor with that ID or email already exists.");
        } else {
          console.error("IMPORT SUPERVISOR ERROR:", error);
          fail("This supervisor could not be saved.");
        }
      }
    }

    if (dryRun) {
      const ready = results.filter((result) => result.status === "ok").length;
      return res.json({
        dry_run: true,
        message: `${ready} of ${rows.length} supervisors can be imported.`,
        ready,
        failed: rows.length - ready,
        results,
      });
    }
    const created = results.filter((result) => result.status === "created").length;
    return res.status(created > 0 ? 201 : 400).json({
      message: `${created} of ${rows.length} supervisors imported.`,
      created,
      failed: rows.length - created,
      results,
    });
  });
  /*
  |--------------------------------------------------------------------------
  | ANNOUNCEMENTS (coordinator)
  |--------------------------------------------------------------------------
  */

  app.get("/api/coordinator/announcements", requireCoordinator, async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT a.id, a.title, a.message, a.audience, a.company, a.recipients, a.created_at,
                (SELECT COUNT(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count
         FROM announcements a ORDER BY a.created_at DESC LIMIT 100`
      );
      return res.json({ announcements: result.rows });
    } catch (error) {
      console.error("GET ANNOUNCEMENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load announcements." });
    }
  });

  app.post("/api/coordinator/announcements", requireCoordinator, async (req, res) => {
    try {
      const title = text(req.body?.title);
      const message = text(req.body?.message);
      const audience = req.body?.audience;

      if (title.length < 3 || title.length > 120) {
        return res.status(400).json({ message: "Give the announcement a title (3 to 120 characters)." });
      }
      if (message.length < 5 || message.length > 2000) {
        return res.status(400).json({ message: "Write the announcement (5 to 2000 characters)." });
      }
      if (!["students", "supervisors", "everyone"].includes(audience)) {
        return res.status(400).json({ message: "Choose who the announcement is for." });
      }

      // An optional company narrows the audience to that host company.
      const company = text(req.body?.company) || null;

      const [students, supervisors] = await Promise.all([
        audience === "supervisors"
          ? Promise.resolve({ rows: [] as { student_id: string }[] })
          : pool.query<{ student_id: string }>(
              `SELECT student_id FROM students
               WHERE is_active = TRUE AND ($1::text IS NULL OR company = $1::text)`,
              [company]
            ),
        audience === "students"
          ? Promise.resolve({ rows: [] as { supervisor_id: string }[] })
          : pool.query<{ supervisor_id: string }>(
              `SELECT supervisor_id FROM supervisors
               WHERE is_active = TRUE AND ($1::text IS NULL OR company = $1::text)`,
              [company]
            ),
      ]);
      const recipients = students.rows.length + supervisors.rows.length;
      if (recipients === 0) {
        return res.status(409).json({
          message: "There is nobody active in that group to send it to.",
        });
      }

      const saved = await pool.query(
        `
        INSERT INTO announcements (title, message, audience, created_by, recipients, company)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, message, audience, company, recipients, created_at
        `,
        [title, message, audience, (req as AuthedRequest).auth?.id || null, recipients, company]
      );

      await quietly("ANNOUNCEMENT DELIVERY ERROR", () =>
        Promise.all([
          ...students.rows.map((row) =>
            createNotification({
              studentId: String(row.student_id),
              title: `Announcement: ${title}`,
              message,
              type: "announcement",
            })
          ),
          ...supervisors.rows.map((row) =>
            createNotification({
              supervisorId: String(row.supervisor_id),
              title: `Announcement: ${title}`,
              message,
              type: "announcement",
            })
          ),
        ])
      );

      return res.status(201).json({
        message: `Announcement sent to ${recipients} ${recipients === 1 ? "person" : "people"}.`,
        announcement: saved.rows[0],
      });
    } catch (error) {
      console.error("SEND ANNOUNCEMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to send the announcement." });
    }
  });

  app.get("/api/coordinator/companies", requireCoordinator, async (_req, res) => {
    try {
      const result = await pool.query<{ company: string }>(
        `
        SELECT company FROM students WHERE is_active = TRUE AND company IS NOT NULL AND company <> ''
        UNION
        SELECT company FROM supervisors WHERE is_active = TRUE AND company IS NOT NULL AND company <> ''
        ORDER BY company
        `
      );
      return res.json({ companies: result.rows.map((row) => row.company) });
    } catch (error) {
      console.error("GET COMPANIES ERROR:", error);
      return res.status(500).json({ message: "Failed to load companies." });
    }
  });

  // Withdrawing removes the announcement and the notification each person got.
  app.delete("/api/coordinator/announcements/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Announcement not found." });
      }
      const removed = await pool.query<{ title: string; message: string }>(
        `DELETE FROM announcements WHERE id = $1 RETURNING title, message`,
        [req.params.id]
      );
      if (removed.rows.length === 0) {
        return res.status(404).json({ message: "Announcement not found." });
      }
      await quietly("REMOVE ANNOUNCEMENT READS ERROR", () =>
        pool.query(`DELETE FROM announcement_reads WHERE announcement_id = $1`, [req.params.id])
      );
      const notices = await pool.query(
        `DELETE FROM notifications
         WHERE type = 'announcement' AND title = $1 AND message = $2`,
        [`Announcement: ${removed.rows[0].title}`, removed.rows[0].message]
      );
      return res.json({
        message: "Announcement withdrawn.",
        removedNotifications: notices.rowCount || 0,
      });
    } catch (error) {
      console.error("WITHDRAW ANNOUNCEMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to withdraw the announcement." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | SETTLE A REJECTED ATTENDANCE LOG (coordinator)
  |--------------------------------------------------------------------------
  |
  | A rejection that was correct needs no further action. Settling it keeps
  | the log rejected and takes it off the list of flagged logs.
  |
  */

  app.post(
    "/api/coordinator/attendance/:id/acknowledge",
    requireCoordinator,
    async (req, res) => {
      try {
        if (!/^\d+$/.test(String(req.params.id))) {
          return res.status(404).json({ message: "Attendance record not found." });
        }
        const result = await pool.query(
          `UPDATE attendance SET flag_acknowledged_at = NOW()
           WHERE id = $1 AND status = 'Rejected' AND flag_acknowledged_at IS NULL
           RETURNING id`,
          [req.params.id]
        );
        if (result.rows.length === 0) {
          return res.status(409).json({
            message: "Only a rejected log that is still flagged can be settled.",
          });
        }
        return res.json({ message: "Rejection kept. The log is no longer flagged." });
      } catch (error) {
        console.error("ACKNOWLEDGE REJECTION ERROR:", error);
        return res.status(500).json({ message: "Failed to settle the log." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | MOVE ALL OF A SUPERVISOR'S INTERNS (coordinator)
  |--------------------------------------------------------------------------
  */

  app.post(
    "/api/coordinator/supervisors/:supervisorId/reassign",
    requireCoordinator,
    async (req, res) => {
      try {
        const from = String(req.params.supervisorId);
        const to = text(req.body?.to);
        if (!to || to === from) {
          return res.status(400).json({ message: "Choose a different supervisor to move them to." });
        }
        const target = await pool.query<{ name: string; company: string | null; is_active: boolean }>(
          `SELECT name, company, is_active FROM supervisors WHERE supervisor_id = $1`,
          [to]
        );
        if (target.rows.length === 0 || !target.rows[0].is_active) {
          return res.status(400).json({ message: "Choose an active supervisor to move them to." });
        }
        const moved = await pool.query<{ student_id: string; name: string }>(
          `UPDATE students SET supervisor_id = $1
           WHERE supervisor_id = $2 AND is_active = TRUE
           RETURNING student_id, name`,
          [to, from]
        );
        if (moved.rows.length === 0) {
          return res.status(409).json({ message: "That supervisor has no active interns to move." });
        }

        const names = moved.rows.map((row) => row.name).join(", ");
        const count = moved.rows.length;
        await quietly("REASSIGN NOTIFICATION ERROR", () =>
          Promise.all([
            createNotification({
              supervisorId: to,
              title: count === 1 ? "New intern assigned" : "New interns assigned",
              message: `${names} ${count === 1 ? "has" : "have"} been assigned to you by the OJT coordinator.`,
              type: "info",
            }),
            createNotification({
              supervisorId: from,
              title: count === 1 ? "Intern reassigned" : "Interns reassigned",
              message: `${names} ${count === 1 ? "is" : "are"} no longer assigned to you.`,
              type: "info",
            }),
            ...moved.rows.map((row) =>
              createNotification({
                studentId: String(row.student_id),
                title: "Supervisor assigned",
                message: `${target.rows[0].name}${
                  target.rows[0].company ? ` of ${target.rows[0].company}` : ""
                } is now your OJT supervisor.`,
                type: "info",
              })
            ),
          ])
        );

        return res.json({
          message: `${count} ${count === 1 ? "intern" : "interns"} moved to ${target.rows[0].name}.`,
          moved: count,
        });
      } catch (error) {
        console.error("REASSIGN INTERNS ERROR:", error);
        return res.status(500).json({ message: "Failed to move the interns." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | ONE STUDENT'S FULL RECORD (coordinator)
  |--------------------------------------------------------------------------
  */

  app.get(
    "/api/coordinator/students/:studentId/overview",
    requireCoordinator,
    async (req, res) => {
      try {
        const id = String(req.params.studentId);
        const student = await pool.query(
          `
          SELECT s.student_id, s.name, s.email, s.program, s.company, s.required_hours,
                 s.is_active, s.completed_at, s.completion_requested_at, s.supervisor_id,
                 s.phone, s.emergency_contact_name, s.emergency_contact_phone,
                 sup.name AS supervisor_name,
                 COALESCE(sup.is_active, FALSE) AS supervisor_active,
                 COALESCE((
                   SELECT SUM(a.hours) FROM attendance a
                   WHERE a.student_id = s.student_id AND a.status = 'Verified'
                 ), 0) AS hours_rendered
          FROM students s
          LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
          WHERE s.student_id = $1
          `,
          [id]
        );
        if (student.rows.length === 0) {
          return res.status(404).json({ message: "Student not found." });
        }

        const [attendance, tasks, documents, evaluations, absences, schedule, journals] = await Promise.all([
          pool.query(
            `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, time_in, break_time, break_end_time,
                    time_out, hours, note, status, review_notes, correction_note,
                    accomplishments, recorded_offline
             FROM attendance WHERE student_id = $1
             ORDER BY date DESC, id DESC LIMIT 1000`,
            [id]
          ),
          pool.query(
            `SELECT id, title, description, priority, status, due_date, assigned_by,
                    submitted_at, review_notes, review_rating, reviewed_at
             FROM tasks WHERE student_id = $1 ORDER BY due_date DESC NULLS LAST, id DESC`,
            [id]
          ),
          pool.query(
            `SELECT id, doc_type, original_filename, size_bytes, status, review_notes,
                    uploaded_at, reviewed_at
             FROM documents WHERE student_id = $1 ORDER BY uploaded_at DESC, id DESC`,
            [id]
          ),
          pool.query(
            `SELECT id, evaluator_type, evaluator_name, category, rating, comments, created_at
             FROM evaluations WHERE student_id = $1 ORDER BY created_at DESC`,
            [id]
          ),
          pool.query(
            `SELECT ${ABSENCE_COLUMNS} FROM absences a WHERE a.student_id = $1 ORDER BY a.date DESC`,
            [id]
          ),
          pool.query(
            `SELECT id, day, TO_CHAR(start_time, 'HH24:MI') AS start_time,
                    TO_CHAR(end_time, 'HH24:MI') AS end_time, focus, hours
             FROM ojt_schedule WHERE student_id = $1 AND is_active = TRUE
             ORDER BY CASE day
               WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
               WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
               WHEN 'Sunday' THEN 7 ELSE 8 END`,
            [id]
          ),
          pool.query(
            `SELECT ${JOURNAL_COLUMNS} FROM journals j WHERE j.student_id = $1
             ORDER BY j.week_start DESC LIMIT 200`,
            [id]
          ),
        ]);

        const row = student.rows[0];
        return res.json({
          student: { ...row, hours_rendered: Number(row.hours_rendered) },
          attendance: attendance.rows,
          tasks: tasks.rows,
          documents: documents.rows,
          evaluations: evaluations.rows,
          absences: absences.rows,
          schedule: schedule.rows,
          journals: journals.rows,
        });
      } catch (error) {
        console.error("STUDENT OVERVIEW ERROR:", error);
        return res.status(500).json({ message: "Failed to load the student's record." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | PASSWORD RESET BY THE COORDINATOR
  |--------------------------------------------------------------------------
  |
  | For a user who is locked out and cannot receive the reset email. The
  | coordinator sets a temporary password; the user must replace it at their
  | next login, every existing session is ended, and any login lockout on
  | the account is lifted.
  |
  */

  const resettable = {
    students: { role: "student" as const, table: "students", idColumn: "student_id" },
    supervisors: { role: "supervisor" as const, table: "supervisors", idColumn: "supervisor_id" },
    coordinators: { role: "coordinator" as const, table: "coordinators", idColumn: "coordinator_id" },
  };

  app.post(
    "/api/coordinator/:kind/:id/reset-password",
    requireCoordinator,
    async (req, res, next) => {
      const target = resettable[req.params.kind as keyof typeof resettable];
      if (!target) return next();
      // Your own password is changed on your Profile, with the current one.
      if (target.role === "coordinator" && req.params.id === (req as AuthedRequest).auth?.id) {
        return res.status(409).json({
          message: "Change your own password from your Profile.",
        });
      }
      try {
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        const policyError = passwordPolicyError(password);
        if (policyError) {
          return res.status(400).json({ message: policyError });
        }

        const result = await pool.query<{ email: string; name: string }>(
          `
          UPDATE ${target.table}
          SET password = $1, must_change_password = TRUE, auth_version = auth_version + 1
          WHERE ${target.idColumn} = $2
          RETURNING email, name
          `,
          [await hashPassword(password), req.params.id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ message: "Account not found." });
        }

        const account = result.rows[0];
        closeNotificationStreams({ role: target.role, id: String(req.params.id) });
        await quietly("CLEAR LOGIN LOCK ERROR", () =>
          pool.query(`DELETE FROM login_attempts WHERE key_hash = ANY($1::text[])`, [
            [
              loginAttemptKey(target.role, account.email),
              loginAttemptKey(target.role, req.params.id),
            ],
          ])
        );

        return res.json({
          message: `Password reset for ${account.name}. They must set their own at next login.`,
        });
      } catch (error) {
        console.error("COORDINATOR PASSWORD RESET ERROR:", error);
        return res.status(500).json({ message: "Failed to reset the password." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | ANNOUNCEMENTS, AS THEIR READERS SEE THEM
  |--------------------------------------------------------------------------
  |
  | An announcement also arrives as a notification, but a notification list
  | is soon buried. This gives a student or supervisor the announcements
  | meant for them in one place: those sent to their kind of account (or to
  | everyone) and, when one was sent to a single company, only if it is
  | theirs. A withdrawn announcement is deleted, so it is not listed.
  |
  */

  app.get("/api/announcements", requireRole(["student", "supervisor"]), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query(
        `
        SELECT a.id, a.title, a.message, a.created_at
        FROM announcements a
        WHERE a.audience IN ($1, 'everyone')
          AND (
            a.company IS NULL OR TRIM(a.company) = ''
            OR LOWER(TRIM(a.company)) = LOWER(TRIM(COALESCE((
              SELECT company FROM ${auth.role === "student" ? "students" : "supervisors"}
              WHERE ${auth.role === "student" ? "student_id" : "supervisor_id"} = $2
            ), '')))
          )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 100
        `,
        [auth.role === "student" ? "students" : "supervisors", auth.id]
      );
      // Having the list is having seen what is on it. Recorded once each;
      // a failure to record it never keeps the list from the reader.
      if (result.rows.length > 0) {
        await quietly("RECORD ANNOUNCEMENT READS ERROR", () =>
          pool.query(
            `INSERT INTO announcement_reads (announcement_id, role, account_id)
             SELECT id, $2, $3 FROM UNNEST($1::int[]) AS id
             ON CONFLICT (announcement_id, role, account_id) DO NOTHING`,
            [result.rows.map((row) => row.id), auth.role, auth.id]
          )
        );
      }
      return res.json({ announcements: result.rows });
    } catch (error) {
      console.error("GET MY ANNOUNCEMENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load announcements." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | COMPANIES
  |--------------------------------------------------------------------------
  |
  | Host companies as records: contact details, the agreement's dates and
  | how many interns each takes. Students, supervisors and complaints are
  | linked to a company by the name typed on them (migration 020 keeps the
  | link in step), so the text everyone already sees stays as it is.
  |
  | The older GET /api/coordinator/companies, further down, still answers
  | with a plain list of names for the announcements page. These routes use
  | a different address so that answer does not change.
  |
  */

  type CompanyInput = {
    name: string;
    address: string | null;
    contact_person: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    moa_start: string | null;
    moa_expiry: string | null;
    slots: number | null;
  };

  /** Reads and checks a company from a request; returns the reason it is refused, if it is. */
  function readCompany(body: unknown): { company: CompanyInput } | { problem: string } {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const optional = (value: unknown, max: number) => text(value).slice(0, max) || null;

    const name = text(input.name);
    if (name.length < 2 || name.length > 150) {
      return { problem: "Give the company a name (2 to 150 characters)." };
    }
    const contactEmail = optional(input.contact_email, 200);
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      return { problem: "That contact email does not look right." };
    }
    const moaStart = optional(input.moa_start, 10);
    const moaExpiry = optional(input.moa_expiry, 10);
    for (const date of [moaStart, moaExpiry]) {
      if (date && (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
        return { problem: "Agreement dates must be written as YYYY-MM-DD." };
      }
    }
    if (moaStart && moaExpiry && moaExpiry < moaStart) {
      return { problem: "The agreement cannot end before it starts." };
    }
    let slots: number | null = null;
    if (input.slots !== undefined && input.slots !== null && input.slots !== "") {
      slots = Number(input.slots);
      if (!Number.isInteger(slots) || slots < 0 || slots > 10000) {
        return { problem: "Slots must be a whole number, 0 or more." };
      }
    }
    return {
      company: {
        name,
        address: optional(input.address, 300),
        contact_person: optional(input.contact_person, 150),
        contact_email: contactEmail,
        contact_phone: optional(input.contact_phone, 40),
        moa_start: moaStart,
        moa_expiry: moaExpiry,
        slots,
      },
    };
  }

  const COMPANY_COLUMNS = `
    c.id, c.name, c.address, c.contact_person, c.contact_email, c.contact_phone,
    TO_CHAR(c.moa_start, 'YYYY-MM-DD') AS moa_start,
    TO_CHAR(c.moa_expiry, 'YYYY-MM-DD') AS moa_expiry,
    c.slots, c.is_active, c.created_at, c.updated_at
  `;

  app.get("/api/coordinator/company-records", requireCoordinator, async (_req, res) => {
    try {
      const [companies, unlinked] = await Promise.all([
        pool.query(
          `
          SELECT ${COMPANY_COLUMNS},
                 (SELECT COUNT(*)::int FROM students s
                   WHERE s.company_id = c.id AND s.is_active = TRUE) AS active_students,
                 (SELECT COUNT(*)::int FROM students s WHERE s.company_id = c.id) AS students,
                 (SELECT COUNT(*)::int FROM supervisors p
                   WHERE p.company_id = c.id AND p.is_active = TRUE) AS supervisors,
                 (SELECT COUNT(*)::int FROM site_visits v WHERE v.company_id = c.id) AS visits,
                 (SELECT TO_CHAR(MAX(v.visit_date), 'YYYY-MM-DD') FROM site_visits v
                   WHERE v.company_id = c.id) AS last_visit
          FROM companies c
          ORDER BY c.is_active DESC, LOWER(c.name)
          `
        ),
        // Names typed on accounts that match no company record yet.
        pool.query<{ name: string; people: number }>(
          `
          SELECT MIN(TRIM(company)) AS name, COUNT(*)::int AS people
          FROM (
            SELECT company FROM students WHERE company_id IS NULL AND is_active = TRUE
            UNION ALL
            SELECT company FROM supervisors WHERE company_id IS NULL AND is_active = TRUE
          ) typed
          WHERE company IS NOT NULL AND TRIM(company) <> ''
          GROUP BY LOWER(TRIM(company))
          ORDER BY LOWER(MIN(TRIM(company)))
          `
        ),
      ]);
      return res.json({ companies: companies.rows, unlinked: unlinked.rows });
    } catch (error) {
      console.error("GET COMPANY RECORDS ERROR:", error);
      return res.status(500).json({ message: "Failed to load companies." });
    }
  });

  /** Links accounts and complaints whose typed company matches this record's name. */
  async function linkTypedNames(client: { query: typeof pool.query }, companyId: number, name: string) {
    for (const [table, column] of [
      ["students", "company"],
      ["supervisors", "company"],
      ["complaints", "company_name"],
    ]) {
      await client.query(
        `UPDATE ${table} SET company_id = $1
         WHERE company_id IS DISTINCT FROM $1 AND LOWER(TRIM(${column})) = LOWER(TRIM($2))`,
        [companyId, name]
      );
    }
  }

  app.post("/api/coordinator/company-records", requireCoordinator, async (req, res) => {
    const read = readCompany(req.body);
    if ("problem" in read) return res.status(400).json({ message: read.problem });
    const company = read.company;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query(
        `SELECT 1 FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [company.name]
      );
      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "There is already a company with that name." });
      }
      const saved = await client.query(
        `
        INSERT INTO companies
          (name, address, contact_person, contact_email, contact_phone, moa_start, moa_expiry, slots)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        `,
        [
          company.name, company.address, company.contact_person, company.contact_email,
          company.contact_phone, company.moa_start, company.moa_expiry, company.slots,
        ]
      );
      // Accounts that already carry this name become its people.
      await linkTypedNames(client, saved.rows[0].id, company.name);
      const result = await client.query(
        `SELECT ${COMPANY_COLUMNS} FROM companies c WHERE c.id = $1`,
        [saved.rows[0].id]
      );
      await client.query("COMMIT");
      return res.status(201).json({ message: "Company added.", company: result.rows[0] });
    } catch (error) {
      await quietly("COMPANY CREATE ROLLBACK ERROR", () => client.query("ROLLBACK"));
      console.error("CREATE COMPANY ERROR:", error);
      return res.status(500).json({ message: "Failed to add the company." });
    } finally {
      client.release();
    }
  });

  app.put("/api/coordinator/company-records/:id", requireCoordinator, async (req, res) => {
    if (!/^\d+$/.test(String(req.params.id))) {
      return res.status(404).json({ message: "Company not found." });
    }
    const read = readCompany(req.body);
    if ("problem" in read) return res.status(400).json({ message: read.problem });
    const company = read.company;
    const id = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ name: string }>(
        `SELECT name FROM companies WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Company not found." });
      }
      const duplicate = await client.query(
        `SELECT 1 FROM companies WHERE id <> $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
        [id, company.name]
      );
      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "There is already a company with that name." });
      }
      await client.query(
        `
        UPDATE companies SET
          name = $2, address = $3, contact_person = $4, contact_email = $5,
          contact_phone = $6, moa_start = $7, moa_expiry = $8, slots = $9, updated_at = NOW()
        WHERE id = $1
        `,
        [
          id, company.name, company.address, company.contact_person, company.contact_email,
          company.contact_phone, company.moa_start, company.moa_expiry, company.slots,
        ]
      );
      // A renamed company takes its people with it: the name typed on each of
      // them is rewritten, which is what every other screen shows.
      if (current.rows[0].name.trim() !== company.name) {
        await client.query(`UPDATE students SET company = $2 WHERE company_id = $1`, [id, company.name]);
        await client.query(`UPDATE supervisors SET company = $2 WHERE company_id = $1`, [id, company.name]);
        await client.query(`UPDATE complaints SET company_name = $2 WHERE company_id = $1`, [id, company.name]);
      }
      await linkTypedNames(client, id, company.name);
      const result = await client.query(
        `SELECT ${COMPANY_COLUMNS} FROM companies c WHERE c.id = $1`,
        [id]
      );
      await client.query("COMMIT");
      return res.json({ message: "Company updated.", company: result.rows[0] });
    } catch (error) {
      await quietly("COMPANY UPDATE ROLLBACK ERROR", () => client.query("ROLLBACK"));
      console.error("UPDATE COMPANY ERROR:", error);
      return res.status(500).json({ message: "Failed to update the company." });
    } finally {
      client.release();
    }
  });

  // A company is never deleted: its students' records refer to it. One that
  // no longer hosts interns is marked inactive and drops out of the pickers.
  app.patch("/api/coordinator/company-records/:id/status", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d+$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Company not found." });
      }
      if (typeof req.body?.is_active !== "boolean") {
        return res.status(400).json({ message: "Say whether the company is active." });
      }
      const result = await pool.query(
        `UPDATE companies c SET is_active = $2, updated_at = NOW() WHERE c.id = $1
         RETURNING ${COMPANY_COLUMNS}`,
        [Number(req.params.id), req.body.is_active]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Company not found." });
      }
      return res.json({
        message: req.body.is_active ? "Company marked active." : "Company marked inactive.",
        company: result.rows[0],
      });
    } catch (error) {
      console.error("COMPANY STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to update the company." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | TERMS
  |--------------------------------------------------------------------------
  |
  | A term groups one batch of interns by dates. Closing a term deactivates
  | its students together and keeps every record; reopening it reactivates
  | exactly the students that closing deactivated. See migration 021.
  |
  */

  function readTerm(body: unknown): { term: { name: string; start: string; end: string } } | { problem: string } {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const name = text(input.name);
    const start = text(input.start_date);
    const end = text(input.end_date);
    if (name.length < 2 || name.length > 80) {
      return { problem: "Give the term a name (2 to 80 characters)." };
    }
    for (const date of [start, end]) {
      if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        return { problem: "A term needs a start date and an end date, written as YYYY-MM-DD." };
      }
    }
    if (end < start) return { problem: "The term cannot end before it starts." };
    return { term: { name, start, end } };
  }

  const TERM_COLUMNS = `
    t.id, t.name,
    TO_CHAR(t.start_date, 'YYYY-MM-DD') AS start_date,
    TO_CHAR(t.end_date, 'YYYY-MM-DD') AS end_date,
    t.is_closed, t.closed_at,
    (SELECT COUNT(*)::int FROM students s WHERE s.term_id = t.id) AS students,
    (SELECT COUNT(*)::int FROM students s WHERE s.term_id = t.id AND s.is_active = TRUE) AS active_students,
    JSONB_ARRAY_LENGTH(t.closed_student_ids) AS deactivated_on_close
  `;

  const termId = (value: unknown): number | null =>
    /^\d{1,9}$/.test(String(value)) ? Number(value) : null;

  app.get("/api/coordinator/terms", requireCoordinator, async (_req, res) => {
    try {
      const [terms, unassigned] = await Promise.all([
        pool.query(`SELECT ${TERM_COLUMNS} FROM terms t ORDER BY t.start_date DESC, t.id DESC`),
        pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM students WHERE term_id IS NULL AND is_active = TRUE`
        ),
      ]);
      return res.json({ terms: terms.rows, unassigned_active_students: unassigned.rows[0].count });
    } catch (error) {
      console.error("GET TERMS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the terms." });
    }
  });

  app.post("/api/coordinator/terms", requireCoordinator, async (req, res) => {
    try {
      const read = readTerm(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const duplicate = await pool.query(
        `SELECT 1 FROM terms WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [read.term.name]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ message: "There is already a term with that name." });
      }
      const saved = await pool.query<{ id: number }>(
        `INSERT INTO terms (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING id`,
        [read.term.name, read.term.start, read.term.end]
      );
      const result = await pool.query(`SELECT ${TERM_COLUMNS} FROM terms t WHERE t.id = $1`, [
        saved.rows[0].id,
      ]);
      return res.status(201).json({ message: "Term added.", term: result.rows[0] });
    } catch (error) {
      console.error("CREATE TERM ERROR:", error);
      return res.status(500).json({ message: "Failed to add the term." });
    }
  });

  app.put("/api/coordinator/terms/:id", requireCoordinator, async (req, res) => {
    try {
      const id = termId(req.params.id);
      if (id === null) return res.status(404).json({ message: "Term not found." });
      const read = readTerm(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const duplicate = await pool.query(
        `SELECT 1 FROM terms WHERE id <> $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
        [id, read.term.name]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ message: "There is already a term with that name." });
      }
      const updated = await pool.query(
        `UPDATE terms SET name = $2, start_date = $3, end_date = $4 WHERE id = $1 RETURNING id`,
        [id, read.term.name, read.term.start, read.term.end]
      );
      if (updated.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      const result = await pool.query(`SELECT ${TERM_COLUMNS} FROM terms t WHERE t.id = $1`, [id]);
      return res.json({ message: "Term updated.", term: result.rows[0] });
    } catch (error) {
      console.error("UPDATE TERM ERROR:", error);
      return res.status(500).json({ message: "Failed to update the term." });
    }
  });

  // Puts students in a term: the listed ones, or every active student that
  // has no term yet (`unassigned: true`).
  app.post("/api/coordinator/terms/:id/students", requireCoordinator, async (req, res) => {
    try {
      const id = termId(req.params.id);
      if (id === null) return res.status(404).json({ message: "Term not found." });
      const term = await pool.query<{ is_closed: boolean }>(
        `SELECT is_closed FROM terms WHERE id = $1`,
        [id]
      );
      if (term.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      if (term.rows[0].is_closed) {
        return res.status(409).json({ message: "That term is closed. Reopen it before adding students." });
      }

      const everyoneWithout = req.body?.unassigned === true;
      const listed: unknown = req.body?.student_ids;
      if (!everyoneWithout) {
        if (!Array.isArray(listed) || listed.length === 0 || listed.length > 1000) {
          return res.status(400).json({ message: "Choose the students to add to the term." });
        }
        if (listed.some((value) => typeof value !== "string" || !value.trim() || value.length > 50)) {
          return res.status(400).json({ message: "That list of students is not readable." });
        }
      }
      const result = everyoneWithout
        ? await pool.query(
            `UPDATE students SET term_id = $1 WHERE term_id IS NULL AND is_active = TRUE`,
            [id]
          )
        : await pool.query(
            `UPDATE students SET term_id = $1 WHERE student_id = ANY($2::text[])`,
            [id, (listed as string[]).map((value) => value.trim())]
          );
      const count = result.rowCount ?? 0;
      return res.json({
        message: `${count} student${count === 1 ? "" : "s"} added to the term.`,
        count,
      });
    } catch (error) {
      console.error("ASSIGN TERM ERROR:", error);
      return res.status(500).json({ message: "Failed to add the students to the term." });
    }
  });

  app.post("/api/coordinator/terms/:id/close", requireCoordinator, async (req, res) => {
    const id = termId(req.params.id);
    if (id === null) return res.status(404).json({ message: "Term not found." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const term = await client.query<{ is_closed: boolean }>(
        `SELECT is_closed FROM terms WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (term.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Term not found." });
      }
      if (term.rows[0].is_closed) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "That term is already closed." });
      }
      // Deactivate, never delete: every record of these students stays.
      const deactivated = await client.query<{ student_id: string }>(
        `UPDATE students SET is_active = FALSE
         WHERE term_id = $1 AND is_active = TRUE
         RETURNING student_id`,
        [id]
      );
      const ids = deactivated.rows.map((row) => String(row.student_id));
      await client.query(
        `UPDATE terms SET is_closed = TRUE, closed_at = NOW(), closed_student_ids = $2::jsonb WHERE id = $1`,
        [id, JSON.stringify(ids)]
      );
      if (ids.length > 0) {
        await client.query(
          `DELETE FROM web_push_subscriptions WHERE role = 'student' AND account_id = ANY($1::text[])`,
          [ids]
        );
      }
      await client.query("COMMIT");
      // Their open pages stop receiving live updates straight away.
      for (const studentId of ids) closeNotificationStreams({ role: "student", id: studentId });
      return res.json({
        message: `Term closed. ${ids.length} student${ids.length === 1 ? " was" : "s were"} deactivated; their records are kept.`,
        deactivated: ids.length,
      });
    } catch (error) {
      await quietly("TERM CLOSE ROLLBACK ERROR", () => client.query("ROLLBACK"));
      console.error("CLOSE TERM ERROR:", error);
      return res.status(500).json({ message: "Failed to close the term. Nothing was changed." });
    } finally {
      client.release();
    }
  });

  app.post("/api/coordinator/terms/:id/reopen", requireCoordinator, async (req, res) => {
    const id = termId(req.params.id);
    if (id === null) return res.status(404).json({ message: "Term not found." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const term = await client.query<{ is_closed: boolean; closed_student_ids: string[] }>(
        `SELECT is_closed, closed_student_ids FROM terms WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (term.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Term not found." });
      }
      if (!term.rows[0].is_closed) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "That term is not closed." });
      }
      // Only the students the closing deactivated, and only if they are
      // still in this term: someone deactivated for another reason stays so.
      const ids = Array.isArray(term.rows[0].closed_student_ids)
        ? term.rows[0].closed_student_ids.map(String)
        : [];
      const reactivated = await client.query(
        `UPDATE students SET is_active = TRUE
         WHERE term_id = $1 AND is_active = FALSE AND student_id = ANY($2::text[])`,
        [id, ids]
      );
      await client.query(
        `UPDATE terms SET is_closed = FALSE, closed_at = NULL, closed_student_ids = '[]'::jsonb WHERE id = $1`,
        [id]
      );
      await client.query("COMMIT");
      const count = reactivated.rowCount ?? 0;
      return res.json({
        message: `Term reopened. ${count} student${count === 1 ? " was" : "s were"} reactivated.`,
        reactivated: count,
      });
    } catch (error) {
      await quietly("TERM REOPEN ROLLBACK ERROR", () => client.query("ROLLBACK"));
      console.error("REOPEN TERM ERROR:", error);
      return res.status(500).json({ message: "Failed to reopen the term. Nothing was changed." });
    } finally {
      client.release();
    }
  });

  /*
  |--------------------------------------------------------------------------
  | AUDIT LOG (READ-ONLY)
  |--------------------------------------------------------------------------
  |
  | The rows are written by services/audit.ts as actions happen. This is the
  | coordinator's view of them: newest first, a page at a time, filtered by
  | kind of action, who did it, or a date range. There is no route that
  | changes or removes a row.
  |
  */

  app.get("/api/coordinator/audit", requireCoordinator, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ""), 10) || 50, 1), 200);
      const offset = Math.max(Number.parseInt(String(req.query.offset ?? ""), 10) || 0, 0);
      const action = text(req.query.action).slice(0, 60);
      const actorRole = text(req.query.actor_role);
      const search = text(req.query.q).slice(0, 100);
      const from = text(req.query.from);
      const to = text(req.query.to);

      if ((from && !DATE_PATTERN.test(from)) || (to && !DATE_PATTERN.test(to))) {
        return res.status(400).json({ message: "Dates must be written as YYYY-MM-DD." });
      }
      if (from && to && from > to) {
        return res.status(400).json({ message: "The start date must not be after the end date." });
      }
      if (actorRole && !["student", "supervisor", "coordinator"].includes(actorRole)) {
        return res.status(400).json({ message: "That is not a kind of account." });
      }

      // "attendance" matches every attendance action; "attendance.verify" one.
      const filters = `
        WHERE ($1 = '' OR a.action = $1 OR a.action LIKE $1 || '.%')
          AND ($2 = '' OR a.actor_role = $2)
          AND ($3 = '' OR (a.created_at AT TIME ZONE 'Asia/Manila')::date >= $3::date)
          AND ($4 = '' OR (a.created_at AT TIME ZONE 'Asia/Manila')::date <= $4::date)
          AND ($5 = ''
            OR a.actor_id ILIKE '%' || $5 || '%'
            OR a.entity_id ILIKE '%' || $5 || '%'
            OR COALESCE(st.name, sup.name, co.name, '') ILIKE '%' || $5 || '%')
      `;
      const joins = `
        FROM audit_log a
        LEFT JOIN students st ON a.actor_role = 'student' AND st.student_id::text = a.actor_id
        LEFT JOIN supervisors sup ON a.actor_role = 'supervisor' AND sup.supervisor_id::text = a.actor_id
        LEFT JOIN coordinators co ON a.actor_role = 'coordinator' AND co.coordinator_id::text = a.actor_id
      `;
      const values = [action, actorRole, from, to, search];

      const [entries, total] = await Promise.all([
        pool.query(
          `
          SELECT a.id, a.actor_role, a.actor_id,
                 COALESCE(st.name, sup.name, co.name) AS actor_name,
                 a.action, a.entity_type, a.entity_id, a.details, a.created_at
          ${joins} ${filters}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $6 OFFSET $7
          `,
          [...values, limit, offset]
        ),
        pool.query(`SELECT COUNT(*) AS total ${joins} ${filters}`, values),
      ]);

      return res.json({
        entries: entries.rows,
        total: Number(total.rows[0].total),
        limit,
        offset,
      });
    } catch (error) {
      console.error("GET AUDIT LOG ERROR:", error);
      return res.status(500).json({ message: "Failed to load the audit log." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | COMPLAINT REPLIES
  |--------------------------------------------------------------------------
  |
  | A thread on each complaint between whoever filed it and the coordinator,
  | so a follow-up question does not need a second complaint.
  |
  */

  /** Loads a complaint if the caller is allowed to see it. */
  async function complaintFor(
    complaintId: string,
    auth: { role: Role; id: string }
  ): Promise<{
    id: number;
    student_id: string | null;
    filed_by_supervisor_id: string | null;
    category: string;
  } | null> {
    if (!/^\d+$/.test(complaintId)) return null;
    const result = await pool.query(
      `SELECT id, student_id, filed_by_supervisor_id, category
       FROM complaints WHERE id = $1`,
      [complaintId]
    );
    const complaint = result.rows[0];
    if (!complaint) return null;
    const allowed =
      auth.role === "coordinator" ||
      (auth.role === "student" && complaint.student_id === auth.id) ||
      (auth.role === "supervisor" && complaint.filed_by_supervisor_id === auth.id);
    return allowed ? complaint : null;
  }

  app.get(
    "/api/complaints/:id/messages",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const complaint = await complaintFor(String(req.params.id), auth);
        if (!complaint) {
          return res.status(404).json({ message: "Complaint not found." });
        }
        const result = await pool.query(
          `SELECT id, author_role, author_name, message, created_at
           FROM complaint_messages WHERE complaint_id = $1
           ORDER BY created_at, id`,
          [complaint.id]
        );
        return res.json({ messages: result.rows });
      } catch (error) {
        console.error("GET COMPLAINT MESSAGES ERROR:", error);
        return res.status(500).json({ message: "Failed to load the conversation." });
      }
    }
  );

  app.post(
    "/api/complaints/:id/messages",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const message = text(req.body?.message);
        if (message.length < 2 || message.length > 2000) {
          return res.status(400).json({ message: "Write a message (up to 2000 characters)." });
        }
        const complaint = await complaintFor(String(req.params.id), auth);
        if (!complaint) {
          return res.status(404).json({ message: "Complaint not found." });
        }

        const accounts = {
          student: { table: "students", idColumn: "student_id" },
          supervisor: { table: "supervisors", idColumn: "supervisor_id" },
          coordinator: { table: "coordinators", idColumn: "coordinator_id" },
        }[auth.role];
        const author = await pool.query<{ name: string }>(
          `SELECT name FROM ${accounts.table} WHERE ${accounts.idColumn} = $1`,
          [auth.id]
        );

        const result = await pool.query(
          `
          INSERT INTO complaint_messages
            (complaint_id, author_role, author_id, author_name, message)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, author_role, author_name, message, created_at
          `,
          [complaint.id, auth.role, auth.id, author.rows[0]?.name || null, message]
        );

        await quietly("COMPLAINT REPLY NOTIFICATION ERROR", async () => {
          if (auth.role === "coordinator") {
            await createNotification({
              studentId: complaint.student_id,
              supervisorId: complaint.student_id ? null : complaint.filed_by_supervisor_id,
              entity: { type: "complaint", id: complaint?.id },
              title: "Reply on your complaint",
              message: `The OJT coordinator replied about your ${complaint.category} report.`,
              type: "info",
            });
          } else {
            await notifyCoordinators({
              entity: { type: "complaint", id: complaint?.id },
              title: "Reply on a complaint",
              message: `${author.rows[0]?.name || "The filer"} replied about a ${complaint.category} report.`,
              type: "warning",
            });
          }
        });

        return res.status(201).json({ message: "Reply sent.", reply: result.rows[0] });
      } catch (error) {
        console.error("POST COMPLAINT MESSAGE ERROR:", error);
        return res.status(500).json({ message: "Failed to send the reply." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | HOLIDAYS
  |--------------------------------------------------------------------------
  |
  | Days nobody is expected to report. The coordinator keeps the list, one
  | holiday per date; everyone signed in can read it, and the schedule and
  | the Daily Time Record show it. A holiday does not stop anyone timing in:
  | some companies work through them, and those hours still count.
  |
  */

  function readHoliday(body: unknown): { holiday: { date: string; name: string } } | { problem: string } {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const date = text(input.date);
    const name = text(input.name);
    if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return { problem: "A holiday needs a date, written as YYYY-MM-DD." };
    }
    if (name.length < 2 || name.length > 100) {
      return { problem: "Give the holiday a name (2 to 100 characters)." };
    }
    return { holiday: { date, name } };
  }

  const HOLIDAY_COLUMNS = `h.id, TO_CHAR(h.holiday_date, 'YYYY-MM-DD') AS date, h.name`;

  app.get(
    "/api/holidays",
    requireRole(["student", "supervisor", "coordinator"]),
    async (_req, res) => {
      try {
        const result = await pool.query(
          `SELECT ${HOLIDAY_COLUMNS} FROM holidays h ORDER BY h.holiday_date, h.id`
        );
        return res.json({ holidays: result.rows });
      } catch (error) {
        console.error("GET HOLIDAYS ERROR:", error);
        return res.status(500).json({ message: "Failed to load the holidays." });
      }
    }
  );

  app.post("/api/coordinator/holidays", requireCoordinator, async (req, res) => {
    try {
      const read = readHoliday(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const result = await pool.query(
        `INSERT INTO holidays AS h (holiday_date, name, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (holiday_date) DO NOTHING
         RETURNING ${HOLIDAY_COLUMNS}`,
        [read.holiday.date, read.holiday.name, (req as AuthedRequest).auth!.id]
      );
      if (result.rows.length === 0) {
        return res.status(409).json({ message: "There is already a holiday on that date." });
      }
      return res.status(201).json({ message: "Holiday added.", holiday: result.rows[0] });
    } catch (error) {
      console.error("CREATE HOLIDAY ERROR:", error);
      return res.status(500).json({ message: "Failed to add the holiday." });
    }
  });

  app.put("/api/coordinator/holidays/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Holiday not found." });
      }
      const read = readHoliday(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const taken = await pool.query(
        `SELECT 1 FROM holidays WHERE holiday_date = $2 AND id <> $1`,
        [Number(req.params.id), read.holiday.date]
      );
      if (taken.rows.length > 0) {
        return res.status(409).json({ message: "There is already a holiday on that date." });
      }
      const result = await pool.query(
        `UPDATE holidays h SET holiday_date = $2, name = $3 WHERE h.id = $1
         RETURNING ${HOLIDAY_COLUMNS}`,
        [Number(req.params.id), read.holiday.date, read.holiday.name]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Holiday not found." });
      return res.json({ message: "Holiday updated.", holiday: result.rows[0] });
    } catch (error) {
      console.error("UPDATE HOLIDAY ERROR:", error);
      return res.status(500).json({ message: "Failed to update the holiday." });
    }
  });

  app.delete("/api/coordinator/holidays/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Holiday not found." });
      }
      const result = await pool.query(
        `DELETE FROM holidays h WHERE h.id = $1 RETURNING ${HOLIDAY_COLUMNS}`,
        [Number(req.params.id)]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Holiday not found." });
      return res.json({ message: "Holiday removed.", holiday: result.rows[0] });
    } catch (error) {
      console.error("DELETE HOLIDAY ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the holiday." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | WEEKLY JOURNAL
  |--------------------------------------------------------------------------
  |
  | Once a week a student writes what they did and what they learned. The
  | entry is kept under the Monday its week starts on, one per week. Their
  | supervisor marks it reviewed, or returns it with a note saying what to
  | add; a returned entry can be edited and sent again. A reviewed entry is
  | closed. The coordinator reads them on the student's record.
  |
  */

  /** The Monday of the week a date falls in. */
  function mondayOf(date: string): string {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return shiftDate(date, -((day + 6) % 7));
  }

  function readJournal(
    body: unknown
  ): { journal: { activities: string; learnings: string; challenges: string | null } } | { problem: string } {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    for (const key of ["activities", "learnings", "challenges"]) {
      if (input[key] !== undefined && input[key] !== null && typeof input[key] !== "string") {
        return { problem: "Write each part of the journal as text." };
      }
    }
    const activities = text(input.activities);
    const learnings = text(input.learnings);
    const challenges = text(input.challenges);
    if (activities.length < JOURNAL_MIN || activities.length > JOURNAL_MAX) {
      return { problem: `Say what you did this week in ${JOURNAL_MIN} to ${JOURNAL_MAX} characters.` };
    }
    if (learnings.length < JOURNAL_MIN || learnings.length > JOURNAL_MAX) {
      return { problem: `Say what you learned this week in ${JOURNAL_MIN} to ${JOURNAL_MAX} characters.` };
    }
    if (challenges.length > JOURNAL_MAX) {
      return { problem: `Keep the difficulties you met to ${JOURNAL_MAX} characters.` };
    }
    return { journal: { activities, learnings, challenges: challenges || null } };
  }

  app.get("/api/journals/student/:studentId", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (auth.id !== req.params.studentId) {
        return res.status(403).json({ message: "You can only read your own journal." });
      }
      const result = await pool.query(
        `SELECT ${JOURNAL_COLUMNS} FROM journals j WHERE j.student_id = $1
         ORDER BY j.week_start DESC LIMIT 200`,
        [auth.id]
      );
      return res.json({
        journals: result.rows,
        current_week_start: mondayOf(todayInManila()),
        limits: { min: JOURNAL_MIN, max: JOURNAL_MAX },
      });
    } catch (error) {
      console.error("GET JOURNALS ERROR:", error);
      return res.status(500).json({ message: "Failed to load your journal." });
    }
  });

  // Writes the entry for one week, or changes it while it is still open.
  app.put(
    "/api/journals/student/:studentId/:weekStart",
    requireRole("student"),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        if (auth.id !== req.params.studentId) {
          return res.status(403).json({ message: "You can only write your own journal." });
        }
        const week = String(req.params.weekStart);
        if (!DATE_PATTERN.test(week) || Number.isNaN(Date.parse(`${week}T00:00:00Z`))) {
          return res.status(400).json({ message: "Name the week by its Monday, written as YYYY-MM-DD." });
        }
        if (mondayOf(week) !== week) {
          return res.status(400).json({ message: "A journal week starts on a Monday." });
        }
        if (week > mondayOf(todayInManila())) {
          return res.status(400).json({ message: "That week has not started yet." });
        }
        const read = readJournal(req.body);
        if ("problem" in read) return res.status(400).json({ message: read.problem });

        const existing = await pool.query<{ status: string }>(
          `SELECT status FROM journals WHERE student_id = $1 AND week_start = $2`,
          [auth.id, week]
        );
        const before = existing.rows[0]?.status;
        if (before === "Reviewed") {
          return res.status(409).json({
            message: "Your supervisor has already reviewed this week's journal, so it can no longer be changed.",
          });
        }

        // The status check is repeated in the statement, in case the
        // supervisor reviews the entry at the same moment.
        const result = await pool.query(
          `
          INSERT INTO journals AS j (student_id, week_start, activities, learnings, challenges)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (student_id, week_start) DO UPDATE
            SET activities = EXCLUDED.activities,
                learnings = EXCLUDED.learnings,
                challenges = EXCLUDED.challenges,
                status = 'Submitted',
                review_notes = CASE WHEN j.status = 'Returned' THEN j.review_notes ELSE NULL END,
                reviewed_at = NULL,
                reviewed_by_supervisor_id = NULL,
                submitted_at = CASE WHEN j.status = 'Returned' THEN NOW() ELSE j.submitted_at END,
                updated_at = NOW()
            WHERE j.status <> 'Reviewed'
          RETURNING ${JOURNAL_COLUMNS}
          `,
          [auth.id, week, read.journal.activities, read.journal.learnings, read.journal.challenges]
        );
        if (result.rows.length === 0) {
          return res.status(409).json({
            message: "Your supervisor has already reviewed this week's journal, so it can no longer be changed.",
          });
        }
        const journal = result.rows[0];

        // The supervisor hears when there is something new to read: a first
        // entry, or one sent again after they returned it. Not on each edit.
        if (!before || before === "Returned") {
          await quietly("JOURNAL SUBMITTED NOTIFICATION ERROR", async () => {
            const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
              `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
              [auth.id]
            );
            if (!owner.rows[0]?.supervisor_id) return;
            await createNotification({
              supervisorId: owner.rows[0].supervisor_id,
              entity: { type: "journal", id: journal.id },
              title: before ? "Weekly journal submitted again" : "Weekly journal submitted",
              message: `${owner.rows[0].name} ${before ? "revised" : "wrote"} their journal for the week of ${week}.`,
              type: "info",
            });
          });
        }

        return res.status(before ? 200 : 201).json({
          message: before ? "Journal updated." : "Journal submitted.",
          journal,
        });
      } catch (error) {
        console.error("SAVE JOURNAL ERROR:", error);
        return res.status(500).json({ message: "Failed to save the journal." });
      }
    }
  );

  app.get("/api/journals/supervisor", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query(
        `
        SELECT ${JOURNAL_COLUMNS}, s.name AS student_name
        FROM journals j
        INNER JOIN students s ON s.student_id = j.student_id
        WHERE s.supervisor_id = $1
          AND s.is_active = TRUE
        ORDER BY CASE WHEN j.status = 'Submitted' THEN 0 ELSE 1 END, j.week_start DESC, j.id DESC
        LIMIT 500
        `,
        [auth.id]
      );
      return res.json({ journals: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR JOURNALS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the journals." });
    }
  });

  app.patch("/api/journals/:id/review", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const status = req.body?.status;
      const notes = text(req.body?.notes);
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Journal not found." });
      }
      // "Submitted" withdraws a decision made by mistake.
      if (status !== "Reviewed" && status !== "Returned" && status !== "Submitted") {
        return res.status(400).json({ message: "Status must be Reviewed, Returned, or Submitted." });
      }
      if (status === "Returned" && !notes) {
        return res.status(400).json({
          message: "Say what the intern should add or change before returning the journal.",
        });
      }
      if (notes.length > 1000) {
        return res.status(400).json({ message: "Keep the note to 1000 characters." });
      }

      const result = await pool.query(
        `
        UPDATE journals j
        SET status = $1::text,
            review_notes = CASE WHEN $1::text = 'Submitted' THEN NULL ELSE $2::text END,
            reviewed_by_supervisor_id = CASE WHEN $1::text = 'Submitted' THEN NULL ELSE $4::text END,
            reviewed_at = CASE WHEN $1::text = 'Submitted' THEN NULL ELSE NOW() END,
            updated_at = NOW()
        FROM students s
        WHERE j.id = $3
          AND s.student_id = j.student_id
          AND s.supervisor_id = $4::text
          -- A decision applies to a waiting journal; an undo to a decided one.
          AND (($1::text = 'Submitted') <> (j.status = 'Submitted'))
        RETURNING ${JOURNAL_COLUMNS}
        `,
        [status, notes || null, Number(req.params.id), auth.id]
      );
      if (result.rows.length === 0) {
        const current = await pool.query(
          `SELECT 1 FROM journals j JOIN students s ON s.student_id = j.student_id
           WHERE j.id = $1 AND s.supervisor_id = $2`,
          [Number(req.params.id), auth.id]
        );
        if (current.rows.length > 0) {
          return res.status(409).json({
            message:
              status === "Submitted"
                ? "This journal is already waiting for review."
                : "This journal was already reviewed.",
          });
        }
        return res.status(404).json({ message: "Journal not found." });
      }

      const journal = result.rows[0];
      await quietly("JOURNAL REVIEW NOTIFICATION ERROR", () =>
        createNotification({
          studentId: journal.student_id,
          entity: { type: "journal", id: journal.id },
          link: "/journal",
          title:
            status === "Reviewed"
              ? "Weekly journal reviewed"
              : status === "Returned"
                ? "Weekly journal returned"
                : "Weekly journal back under review",
          message:
            status === "Reviewed"
              ? `Your supervisor reviewed your journal for the week of ${journal.week_start}.${notes ? ` Note: ${notes}` : ""}`
              : status === "Returned"
                ? `Your supervisor returned your journal for the week of ${journal.week_start}. Note: ${notes}`
                : `The decision on your journal for the week of ${journal.week_start} was withdrawn. It is waiting to be reviewed again.`,
          type: "info",
        })
      );

      return res.json({ message: "Journal reviewed.", journal });
    } catch (error) {
      console.error("REVIEW JOURNAL ERROR:", error);
      return res.status(500).json({ message: "Failed to review the journal." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | COMPLETION CHECKLIST (student)
  |--------------------------------------------------------------------------
  |
  | What still stands between a student and the end of their OJT, worked
  | out here so the page and the request below can never disagree:
  |
  |   hours       verified hours have reached the requirement
  |   attendance  no log is still open or waiting for the supervisor
  |   documents   every active requirement has an approved file
  |   tasks       no task is unfinished or waiting for review
  |   evaluation  the supervisor has submitted the final evaluation
  |   feedback    the student has given feedback about the company
  |
  | When all six are done the student may ask the coordinator, once, to
  | review their record. Asking changes nothing else: the coordinator still
  | decides.
  |
  */

  type ChecklistItem = { key: string; done: boolean; detail: string };

  async function completionChecklist(studentId: string): Promise<{
    items: ChecklistItem[];
    ready: boolean;
    requested_at: string | null;
    name: string;
  } | null> {
    const result = await pool.query<{
      name: string;
      required_hours: number | null;
      completion_requested_at: string | null;
      hours: string;
      waiting_logs: number;
      requirements: number;
      approved: number;
      open_tasks: number;
      supervisor_evaluations: number;
      own_feedback: number;
    }>(
      `
      SELECT s.name, s.required_hours, s.completion_requested_at,
        (SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
          WHERE a.student_id = s.student_id AND a.status = 'Verified') AS hours,
        (SELECT COUNT(*)::int FROM attendance a
          WHERE a.student_id = s.student_id
            AND (a.status = 'Pending' OR a.time_out IS NULL)) AS waiting_logs,
        (SELECT COUNT(*)::int FROM ojt_requirements r WHERE r.is_active = TRUE) AS requirements,
        (SELECT COUNT(*)::int FROM ojt_requirements r
          WHERE r.is_active = TRUE AND EXISTS (
            SELECT 1 FROM documents d
            WHERE d.student_id = s.student_id AND d.doc_type = r.name AND d.status = 'Approved'
          )) AS approved,
        (SELECT COUNT(*)::int FROM tasks t
          WHERE t.student_id = s.student_id
            AND t.status IN ('Pending', 'In Progress', 'Submitted')) AS open_tasks,
        (SELECT COUNT(*)::int FROM final_evaluations e
          WHERE e.student_id = s.student_id) AS supervisor_evaluations,
        (SELECT COUNT(*)::int FROM evaluations e
          WHERE e.evaluator_type = 'student' AND e.evaluator_id = s.student_id) AS own_feedback
      FROM students s WHERE s.student_id = $1
      `,
      [studentId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const hours = Math.round(Number(row.hours) * 100) / 100;
    const required = Number(row.required_hours) || 0;
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const items: ChecklistItem[] = [
      {
        key: "hours",
        done: required > 0 && hours >= required,
        detail:
          required > 0
            ? `${hours} of ${required} required hours verified.`
            : "Your coordinator has not set your required hours yet.",
      },
      {
        key: "attendance",
        done: row.waiting_logs === 0,
        detail:
          row.waiting_logs === 0
            ? "No log is open or waiting for your supervisor."
            : `${count(row.waiting_logs, "log is", "logs are")} still open or waiting for your supervisor.`,
      },
      {
        key: "documents",
        done: row.approved >= row.requirements,
        detail:
          row.requirements === 0
            ? "No documents are required."
            : `${row.approved} of ${count(row.requirements, "required document", "required documents")} approved.`,
      },
      {
        key: "tasks",
        done: row.open_tasks === 0,
        detail:
          row.open_tasks === 0
            ? "No task is unfinished or waiting for review."
            : `${count(row.open_tasks, "task is", "tasks are")} unfinished or waiting for review.`,
      },
      {
        key: "evaluation",
        done: row.supervisor_evaluations > 0,
        detail:
          row.supervisor_evaluations > 0
            ? "Your supervisor has submitted your final evaluation."
            : "Your supervisor has not submitted your final evaluation yet.",
      },
      {
        key: "feedback",
        done: row.own_feedback > 0,
        detail:
          row.own_feedback > 0
            ? "You have given feedback about your company."
            : "You have not given feedback about your company yet.",
      },
    ];
    return {
      items,
      ready: items.every((item) => item.done),
      requested_at: row.completion_requested_at,
      name: row.name,
    };
  }

  app.get("/api/students/:studentId/completion", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (auth.id !== req.params.studentId) {
        return res.status(403).json({ message: "You can only see your own checklist." });
      }
      const checklist = await completionChecklist(auth.id);
      if (!checklist) return res.status(404).json({ message: "Student not found." });
      return res.json({
        items: checklist.items,
        ready: checklist.ready,
        requested_at: checklist.requested_at,
      });
    } catch (error) {
      console.error("COMPLETION CHECKLIST ERROR:", error);
      return res.status(500).json({ message: "Failed to load your completion checklist." });
    }
  });

  app.post(
    "/api/students/:studentId/completion/request",
    requireRole("student"),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        if (auth.id !== req.params.studentId) {
          return res.status(403).json({ message: "You can only ask for your own review." });
        }
        const checklist = await completionChecklist(auth.id);
        if (!checklist) return res.status(404).json({ message: "Student not found." });
        if (checklist.requested_at) {
          return res.status(409).json({
            message: "You have already asked for a completion review.",
            requested_at: checklist.requested_at,
          });
        }
        if (!checklist.ready) {
          const left = checklist.items.filter((item) => !item.done).length;
          return res.status(400).json({
            message: `${left} ${left === 1 ? "thing is" : "things are"} still left on your checklist. Finish ${left === 1 ? "it" : "them"} before asking for a review.`,
          });
        }
        // Only the first request sets the time, whatever arrives together.
        const saved = await pool.query<{ completion_requested_at: string }>(
          `UPDATE students SET completion_requested_at = NOW()
           WHERE student_id = $1 AND completion_requested_at IS NULL
           RETURNING completion_requested_at`,
          [auth.id]
        );
        if (saved.rows.length === 0) {
          return res.status(409).json({ message: "You have already asked for a completion review." });
        }
        await quietly("COMPLETION REQUEST NOTIFICATION ERROR", () =>
          notifyCoordinators({
            entity: { type: "student", id: auth.id },
            title: "Completion review requested",
            message: `${checklist.name} has finished everything on their completion checklist and asks you to review their record.`,
            type: "info",
          })
        );
        return res.status(201).json({
          message: "Your coordinator has been asked to review your record.",
          requested_at: saved.rows[0].completion_requested_at,
        });
      } catch (error) {
        console.error("COMPLETION REQUEST ERROR:", error);
        return res.status(500).json({ message: "Failed to send the request." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | PRIVACY: THE NOTICE, CONSENT, AND "DOWNLOAD MY DATA" (student)
  |--------------------------------------------------------------------------
  |
  | The notice and its version come from services/privacy.ts. A student
  | agrees to one version; when the notice changes they are asked again.
  | The export is everything the system holds that is theirs, as one file.
  |
  */

  app.get("/api/students/:studentId/privacy", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (auth.id !== req.params.studentId) {
        return res.status(403).json({ message: "You can only see your own privacy settings." });
      }
      const result = await pool.query<{ privacy_consent_at: string | null; privacy_consent_version: string | null }>(
        `SELECT privacy_consent_at, privacy_consent_version FROM students WHERE student_id = $1`,
        [auth.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      const row = result.rows[0];
      return res.json({
        notice: PRIVACY_NOTICE,
        consent_at: row.privacy_consent_at,
        consent_version: row.privacy_consent_version,
        // Agreed to the notice as it stands now.
        current: hasCurrentConsent(row.privacy_consent_version),
      });
    } catch (error) {
      console.error("GET PRIVACY ERROR:", error);
      return res.status(500).json({ message: "Failed to load the privacy notice." });
    }
  });

  app.post(
    "/api/students/:studentId/privacy/consent",
    requireRole("student"),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        if (auth.id !== req.params.studentId) {
          return res.status(403).json({ message: "You can only agree for yourself." });
        }
        // The version read is sent back, so nobody agrees to wording they were not shown.
        if (req.body?.version !== PRIVACY_NOTICE.version) {
          return res.status(409).json({
            message: "The privacy notice has changed. Read it again before agreeing.",
          });
        }
        // The first agreement to a version keeps its time.
        const result = await pool.query<{ privacy_consent_at: string; privacy_consent_version: string }>(
          `UPDATE students
           SET privacy_consent_at = CASE
                 WHEN privacy_consent_version IS NOT DISTINCT FROM $2 AND privacy_consent_at IS NOT NULL
                 THEN privacy_consent_at ELSE NOW() END,
               privacy_consent_version = $2
           WHERE student_id = $1
           RETURNING privacy_consent_at, privacy_consent_version`,
          [auth.id, PRIVACY_NOTICE.version]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Student not found." });
        return res.json({
          message: "Thank you. Your agreement has been recorded.",
          consent_at: result.rows[0].privacy_consent_at,
          consent_version: result.rows[0].privacy_consent_version,
          current: true,
        });
      } catch (error) {
        console.error("PRIVACY CONSENT ERROR:", error);
        return res.status(500).json({ message: "Failed to record your agreement." });
      }
    }
  );

  app.get("/api/students/:studentId/data-export", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (auth.id !== req.params.studentId) {
        return res.status(403).json({ message: "You can only download your own data." });
      }
      const mine = (sql: string) => pool.query(sql, [auth.id]).then((result) => result.rows);
      const [profile, attendance, absences, tasks, documents, journals, finalEvaluation, certifications, evaluations, complaints,
        complaintMessages, schedule, notifications] = await Promise.all([
        mine(`SELECT * FROM students WHERE student_id = $1`),
        mine(`SELECT * FROM attendance WHERE student_id = $1 ORDER BY date, id`),
        mine(`SELECT * FROM absences WHERE student_id = $1 ORDER BY date, id`),
        mine(`SELECT * FROM tasks WHERE student_id = $1 ORDER BY created_at, id`),
        mine(`SELECT * FROM documents WHERE student_id = $1 ORDER BY uploaded_at, id`),
        mine(`SELECT * FROM journals WHERE student_id = $1 ORDER BY week_start`),
        mine(`SELECT * FROM final_evaluations WHERE student_id = $1`),
        mine(`SELECT * FROM dtr_certifications WHERE student_id = $1 ORDER BY month`),
        // Evaluations of the student, and the ones the student wrote.
        mine(`SELECT * FROM evaluations
              WHERE student_id = $1 OR (evaluator_type = 'student' AND evaluator_id = $1)
              ORDER BY created_at, id`),
        // Concerns the student reported; not ones other people reported.
        mine(`SELECT * FROM complaints WHERE student_id = $1 ORDER BY created_at, id`),
        mine(`SELECT m.* FROM complaint_messages m
              JOIN complaints c ON c.id = m.complaint_id
              WHERE c.student_id = $1 ORDER BY m.created_at, m.id`),
        mine(`SELECT * FROM ojt_schedule WHERE student_id = $1 AND is_active = TRUE ORDER BY id`),
        mine(`SELECT * FROM notifications WHERE student_id = $1 ORDER BY created_at, id`),
      ]);
      if (profile.length === 0) return res.status(404).json({ message: "Student not found." });

      // Never the password, nor what only the sign-in machinery uses.
      const { password: _password, auth_version: _version, must_change_password: _must, ...account } =
        profile[0] as Record<string, unknown>;

      const today = todayInManila();
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="internet-my-data-${today}.json"`
      );
      return res.json({
        about:
          "Everything INTERNet holds that is yours, as of the date below. Photos and uploaded files are listed by name; open them in the app to see them.",
        exported_on: today,
        account,
        attendance,
        absences,
        tasks,
        documents,
        journals,
        evaluations,
        final_evaluation: finalEvaluation[0] ?? null,
        time_record_certifications: certifications,
        complaints,
        complaint_messages: complaintMessages,
        schedule,
        notifications,
      });
    } catch (error) {
      console.error("DATA EXPORT ERROR:", error);
      return res.status(500).json({ message: "Failed to prepare your data." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | TIME RECORD CERTIFICATION (supervisor)
  |--------------------------------------------------------------------------
  |
  | Once a month's logs are all settled, the supervisor certifies that
  | month of the Daily Time Record. The printed record then carries their
  | name, the date, and the hours certified. One per student per month;
  | the supervisor can withdraw it (to certify again after a correction).
  |
  | A month can be certified only when it has at least one log and none of
  | its logs is still open or waiting for a decision.
  |
  */

  const DTR_COLUMNS = `
    c.id, c.student_id, c.month, c.certified_by, c.certified_by_name,
    c.verified_hours::float AS verified_hours, c.days_logged, c.certified_at
  `;

  app.get(
    "/api/dtr-certifications/:studentId",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const id = String(req.params.studentId);
        if (auth.role === "student" && auth.id !== id) {
          return res.status(403).json({ message: "You can only see your own time record." });
        }
        if (auth.role === "supervisor") {
          const assigned = await pool.query(
            `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`,
            [id, auth.id]
          );
          if (assigned.rows.length === 0) {
            return res.status(403).json({ message: "You can only view your own interns." });
          }
        }
        const result = await pool.query(
          `SELECT ${DTR_COLUMNS} FROM dtr_certifications c WHERE c.student_id = $1 ORDER BY c.month DESC`,
          [id]
        );
        return res.json({ certifications: result.rows });
      } catch (error) {
        console.error("GET DTR CERTIFICATIONS ERROR:", error);
        return res.status(500).json({ message: "Failed to load the certifications." });
      }
    }
  );

  app.post("/api/dtr-certifications", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const studentId = text(req.body?.student_id);
      const month = text(req.body?.month);
      if (!studentId) return res.status(400).json({ message: "Choose the intern." });
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ message: "Name the month as YYYY-MM." });
      }
      if (month > todayInManila().slice(0, 7)) {
        return res.status(400).json({ message: "That month has not started yet." });
      }
      const owner = await pool.query<{ name: string; supervisor_name: string }>(
        `SELECT s.name, sup.name AS supervisor_name
         FROM students s JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
         WHERE s.student_id = $1 AND s.supervisor_id = $2`,
        [studentId, auth.id]
      );
      if (owner.rows.length === 0) {
        return res.status(403).json({ message: "You can only certify your own interns' records." });
      }

      const logs = await pool.query<{ total: number; unsettled: number; verified_hours: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'Pending' OR time_out IS NULL)::int AS unsettled,
                COALESCE(SUM(hours) FILTER (WHERE status = 'Verified'), 0)::float AS verified_hours
         FROM attendance
         WHERE student_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
        [studentId, month]
      );
      const { total, unsettled, verified_hours: verifiedHours } = logs.rows[0];
      if (total === 0) {
        return res.status(409).json({ message: "There are no logs in that month to certify." });
      }
      if (unsettled > 0) {
        return res.status(409).json({
          message: `${unsettled} ${unsettled === 1 ? "log in that month is" : "logs in that month are"} still open or waiting for your decision. Settle ${unsettled === 1 ? "it" : "them"} first.`,
        });
      }

      const result = await pool.query(
        `INSERT INTO dtr_certifications AS c
           (student_id, month, certified_by, certified_by_name, verified_hours, days_logged)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (student_id, month) DO NOTHING
         RETURNING ${DTR_COLUMNS}`,
        [studentId, month, auth.id, owner.rows[0].supervisor_name, verifiedHours, total]
      );
      if (result.rows.length === 0) {
        return res.status(409).json({ message: "That month is already certified." });
      }
      await quietly("DTR CERTIFIED NOTIFICATION ERROR", () =>
        createNotification({
          studentId,
          link: "/time-record",
          title: "Time record certified",
          message: `${owner.rows[0].supervisor_name} certified your time record for ${month}: ${verifiedHours} verified hours.`,
          type: "attendance",
        })
      );
      return res.status(201).json({ message: "Time record certified.", certification: result.rows[0] });
    } catch (error) {
      console.error("CERTIFY DTR ERROR:", error);
      return res.status(500).json({ message: "Failed to certify the time record." });
    }
  });

  // Withdrawn by the supervisor who can certify it, for example to certify
  // again after correcting a log.
  app.delete("/api/dtr-certifications/:id", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Certification not found." });
      }
      const result = await pool.query(
        `DELETE FROM dtr_certifications c
         USING students s
         WHERE c.id = $1 AND s.student_id = c.student_id AND s.supervisor_id = $2
         RETURNING ${DTR_COLUMNS}`,
        [Number(req.params.id), auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Certification not found." });
      }
      return res.json({ message: "Certification withdrawn.", certification: result.rows[0] });
    } catch (error) {
      console.error("WITHDRAW DTR CERTIFICATION ERROR:", error);
      return res.status(500).json({ message: "Failed to withdraw the certification." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | FINAL EVALUATION
  |--------------------------------------------------------------------------
  |
  | At the end of the OJT the supervisor rates the student once, on every
  | criterion of the form the coordinator keeps, and writes remarks. The
  | form in use is the active row of evaluation_forms; saving a changed
  | form adds a row, so an evaluation already submitted keeps the criteria
  | it was written on (its form_snapshot). See migration 031.
  |
  | The form the system starts with is a sample, and is marked as one.
  |
  */

  type FormCriterion = { key: string; label: string; description: string };

  const FORM_COLUMNS = `f.id, f.name, f.scale_max, f.criteria, f.is_sample, f.created_at`;
  const FINAL_COLUMNS = `
    e.id, e.student_id, e.form_snapshot, e.supervisor_name, e.ratings,
    e.average::float AS average, e.remarks, e.submitted_at, e.updated_at
  `;

  const activeForm = () =>
    pool
      .query<{ id: number; name: string; scale_max: number; criteria: FormCriterion[]; is_sample: boolean }>(
        `SELECT ${FORM_COLUMNS} FROM evaluation_forms f WHERE f.is_active = TRUE ORDER BY f.id DESC LIMIT 1`
      )
      .then((result) => result.rows[0] ?? null);

  app.get(
    "/api/evaluation-form",
    requireRole(["student", "supervisor", "coordinator"]),
    async (_req, res) => {
      try {
        return res.json({ form: await activeForm() });
      } catch (error) {
        console.error("GET EVALUATION FORM ERROR:", error);
        return res.status(500).json({ message: "Failed to load the evaluation form." });
      }
    }
  );

  app.put("/api/coordinator/evaluation-form", requireCoordinator, async (req, res) => {
    try {
      const input = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const name = text(input.name);
      const scale = Number(input.scale_max);
      if (name.length < 3 || name.length > 100) {
        return res.status(400).json({ message: "Give the form a name (3 to 100 characters)." });
      }
      if (!Number.isInteger(scale) || scale < 3 || scale > 10) {
        return res.status(400).json({ message: "The top of the rating scale must be a whole number from 3 to 10." });
      }
      if (!Array.isArray(input.criteria) || input.criteria.length < 2 || input.criteria.length > 20) {
        return res.status(400).json({ message: "A form needs 2 to 20 criteria." });
      }
      const criteria: FormCriterion[] = [];
      for (const [index, raw] of input.criteria.entries()) {
        const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const label = text(item.label);
        const description = text(item.description);
        if (label.length < 3 || label.length > 80) {
          return res.status(400).json({ message: `Criterion ${index + 1} needs a name (3 to 80 characters).` });
        }
        if (description.length > 300) {
          return res.status(400).json({ message: `Keep the description of "${label}" to 300 characters.` });
        }
        if (criteria.some((other) => other.label.toLowerCase() === label.toLowerCase())) {
          return res.status(400).json({ message: `"${label}" is on the form twice.` });
        }
        criteria.push({ key: `c${index + 1}`, label, description });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`UPDATE evaluation_forms SET is_active = FALSE WHERE is_active = TRUE`);
        const saved = await client.query(
          `INSERT INTO evaluation_forms AS f (name, scale_max, criteria, is_active, is_sample, created_by)
           VALUES ($1, $2, $3::jsonb, TRUE, FALSE, $4)
           RETURNING ${FORM_COLUMNS}`,
          [name, scale, JSON.stringify(criteria), (req as AuthedRequest).auth!.id]
        );
        await client.query("COMMIT");
        return res.json({ message: "Evaluation form saved.", form: saved.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("SAVE EVALUATION FORM ERROR:", error);
      return res.status(500).json({ message: "Failed to save the evaluation form." });
    }
  });

  // Which of the supervisor's own interns already have a final evaluation,
  // in one answer, so the Review queue does not ask once per intern.
  app.get("/api/supervisor/final-evaluations", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query<{ student_id: string }>(
        `SELECT TRIM(e.student_id::text) AS student_id
         FROM final_evaluations e
         JOIN students s ON TRIM(s.student_id::text) = TRIM(e.student_id::text)
         WHERE TRIM(s.supervisor_id::text) = TRIM($1::text)
         ORDER BY 1`,
        [auth.id]
      );
      return res.json({ student_ids: result.rows.map((row) => row.student_id) });
    } catch (error) {
      console.error("LIST FINAL EVALUATIONS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the final evaluations." });
    }
  });

  app.get(
    "/api/final-evaluations/:studentId",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const id = String(req.params.studentId);
        if (auth.role === "student" && auth.id !== id) {
          return res.status(403).json({ message: "You can only see your own evaluation." });
        }
        if (auth.role === "supervisor") {
          const assigned = await pool.query(
            `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`,
            [id, auth.id]
          );
          if (assigned.rows.length === 0) {
            return res.status(403).json({ message: "You can only view your own interns." });
          }
        }
        const result = await pool.query(
          `SELECT ${FINAL_COLUMNS} FROM final_evaluations e WHERE e.student_id = $1`,
          [id]
        );
        return res.json({ evaluation: result.rows[0] ?? null });
      } catch (error) {
        console.error("GET FINAL EVALUATION ERROR:", error);
        return res.status(500).json({ message: "Failed to load the final evaluation." });
      }
    }
  );

  // Submits the final evaluation, or changes the one already submitted.
  app.put("/api/final-evaluations/:studentId", requireRole("supervisor"), async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const id = String(req.params.studentId);
      const owner = await pool.query<{ name: string; supervisor_name: string }>(
        `SELECT s.name, sup.name AS supervisor_name
         FROM students s JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
         WHERE s.student_id = $1 AND s.supervisor_id = $2`,
        [id, auth.id]
      );
      if (owner.rows.length === 0) {
        return res.status(403).json({ message: "You can only evaluate your own interns." });
      }
      const form = await activeForm();
      if (!form) {
        return res.status(409).json({ message: "The OJT coordinator has not set up the evaluation form yet." });
      }
      // The form the supervisor filled in must be the one in use now.
      if (Number(req.body?.form_id) !== form.id) {
        return res.status(409).json({
          message: "The evaluation form has changed. Reload the page and fill in the current one.",
        });
      }
      const given = req.body?.ratings && typeof req.body.ratings === "object" ? (req.body.ratings as Record<string, unknown>) : {};
      const ratings: Record<string, number> = {};
      for (const criterion of form.criteria) {
        const value = given[criterion.key];
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > form.scale_max) {
          return res.status(400).json({
            message: `Rate "${criterion.label}" from 1 to ${form.scale_max}.`,
          });
        }
        ratings[criterion.key] = value;
      }
      const remarks = text(req.body?.remarks);
      if (remarks.length < 10 || remarks.length > 2000) {
        return res.status(400).json({ message: "Write your overall remarks (10 to 2000 characters)." });
      }
      const values = Object.values(ratings);
      const average = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
      const snapshot = { name: form.name, scale_max: form.scale_max, criteria: form.criteria };

      const result = await pool.query(
        `
        INSERT INTO final_evaluations AS e
          (student_id, form_id, form_snapshot, supervisor_id, supervisor_name, ratings, average, remarks)
        VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8)
        ON CONFLICT (student_id) DO UPDATE
          SET form_id = EXCLUDED.form_id,
              form_snapshot = EXCLUDED.form_snapshot,
              supervisor_id = EXCLUDED.supervisor_id,
              supervisor_name = EXCLUDED.supervisor_name,
              ratings = EXCLUDED.ratings,
              average = EXCLUDED.average,
              remarks = EXCLUDED.remarks,
              updated_at = NOW()
        RETURNING ${FINAL_COLUMNS}, (e.submitted_at = e.updated_at) AS is_new
        `,
        [id, form.id, JSON.stringify(snapshot), auth.id, owner.rows[0].supervisor_name, JSON.stringify(ratings), average, remarks]
      );
      const { is_new: isNew, ...evaluation } = result.rows[0];

      await quietly("FINAL EVALUATION NOTIFICATION ERROR", async () => {
        await createNotification({
          studentId: id,
          link: "/student/feedback",
          title: isNew ? "Final evaluation submitted" : "Final evaluation updated",
          message: `${owner.rows[0].supervisor_name} ${isNew ? "submitted" : "updated"} your final evaluation: ${average} out of ${form.scale_max} on average.`,
          type: "evaluation",
        });
        if (isNew) {
          await notifyCoordinators({
            entity: { type: "student", id },
            link: `/coordinator/students/${encodeURIComponent(id)}`,
            title: "Final evaluation submitted",
            message: `${owner.rows[0].supervisor_name} submitted the final evaluation of ${owner.rows[0].name}: ${average} out of ${form.scale_max} on average.`,
            type: "info",
          });
        }
      });

      return res.status(isNew ? 201 : 200).json({
        message: isNew ? "Final evaluation submitted." : "Final evaluation updated.",
        evaluation,
      });
    } catch (error) {
      console.error("SAVE FINAL EVALUATION ERROR:", error);
      return res.status(500).json({ message: "Failed to save the final evaluation." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | NOTIFICATION PREFERENCES (everyone, for themselves)
  |--------------------------------------------------------------------------
  |
  | See services/notificationPreferences.ts. In-app notifications are not
  | affected by anything here.
  |
  */

  app.get(
    "/api/notification-preferences",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const stored = await pool.query<{ category: string; push: boolean; email: boolean }>(
          `SELECT category, push, email FROM notification_preferences WHERE role = $1 AND account_id = $2`,
          [auth.role, auth.id]
        );
        const chosen = new Map(stored.rows.map((row) => [row.category, row]));
        return res.json({
          categories: categoriesFor(auth.role).map((category) => ({
            ...category,
            push: category.has_push ? (chosen.get(category.key)?.push ?? true) : false,
            email: category.has_email ? (chosen.get(category.key)?.email ?? true) : false,
          })),
        });
      } catch (error) {
        console.error("GET NOTIFICATION PREFERENCES ERROR:", error);
        return res.status(500).json({ message: "Failed to load your notification choices." });
      }
    }
  );

  app.put(
    "/api/notification-preferences",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        const category = categoriesFor(auth.role).find((item) => item.key === req.body?.category);
        if (!category) {
          return res.status(400).json({ message: "Choose one of the listed kinds of notification." });
        }
        const { push, email } = (req.body ?? {}) as { push?: unknown; email?: unknown };
        if ((push !== undefined && typeof push !== "boolean") || (email !== undefined && typeof email !== "boolean")) {
          return res.status(400).json({ message: "Each choice is on or off." });
        }
        if (push === undefined && email === undefined) {
          return res.status(400).json({ message: "Say what to change." });
        }
        if ((push !== undefined && !category.has_push) || (email !== undefined && !category.has_email)) {
          return res.status(400).json({ message: "That kind of notification is not sent that way." });
        }
        // What is not sent is left as it was.
        const result = await pool.query<{ push: boolean; email: boolean }>(
          `INSERT INTO notification_preferences AS p (role, account_id, category, push, email)
           VALUES ($1, $2, $3, COALESCE($4, TRUE), COALESCE($5, TRUE))
           ON CONFLICT (role, account_id, category) DO UPDATE
             SET push = COALESCE($4, p.push), email = COALESCE($5, p.email), updated_at = NOW()
           RETURNING push, email`,
          [auth.role, auth.id, category.key, push ?? null, email ?? null]
        );
        return res.json({
          message: "Saved.",
          category: {
            ...category,
            push: category.has_push ? result.rows[0].push : false,
            email: category.has_email ? result.rows[0].email : false,
          },
        });
      } catch (error) {
        console.error("SAVE NOTIFICATION PREFERENCE ERROR:", error);
        return res.status(500).json({ message: "Failed to save your choice." });
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | COORDINATOR ACCOUNTS
  |--------------------------------------------------------------------------
  |
  | A coordinator can list the coordinator accounts, add one, deactivate or
  | reactivate one, and give one a temporary password (the reset route
  | above). A new account, like every account a coordinator creates, must
  | set its own password at first sign-in.
  |
  | Two things are refused so the programme can never be locked out of its
  | own system: deactivating yourself, and deactivating the last active
  | coordinator. An account is never deleted.
  |
  */

  const COORDINATOR_COLUMNS = `c.coordinator_id, c.name, c.email, c.department, c.is_active, c.created_at`;

  app.get("/api/coordinator/coordinators", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const result = await pool.query(
        `SELECT ${COORDINATOR_COLUMNS}, (c.coordinator_id = $1) AS is_self
         FROM coordinators c ORDER BY c.is_active DESC, c.name, c.coordinator_id`,
        [auth.id]
      );
      return res.json({ coordinators: result.rows });
    } catch (error) {
      console.error("GET COORDINATORS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the coordinator accounts." });
    }
  });

  app.post("/api/coordinator/coordinators", requireCoordinator, async (req, res) => {
    try {
      const id = text(req.body?.coordinator_id);
      const name = text(req.body?.name);
      const email = text(req.body?.email).toLowerCase();
      const department = text(req.body?.department);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!/^[\w.-]{3,50}$/.test(id)) {
        return res.status(400).json({
          message: "Give the account an ID of 3 to 50 letters, digits, dots, dashes or underscores.",
        });
      }
      if (name.length < 2 || name.length > 150) {
        return res.status(400).json({ message: "Enter the coordinator's name." });
      }
      if (!EMAIL_PATTERN.test(email) || email.length > 150) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      if (department.length > 150) {
        return res.status(400).json({ message: "Keep the department to 150 characters." });
      }
      const policyError = passwordPolicyError(password);
      if (policyError) {
        return res.status(400).json({ message: `Starting password: ${policyError}` });
      }
      const taken = await pool.query(
        `SELECT 1 FROM coordinators WHERE coordinator_id = $1 OR LOWER(email) = $2`,
        [id, email]
      );
      if (taken.rows.length > 0) {
        return res.status(409).json({ message: "A coordinator with that ID or email already exists." });
      }
      const result = await pool.query(
        `INSERT INTO coordinators AS c
           (coordinator_id, email, password, name, department, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
         RETURNING ${COORDINATOR_COLUMNS}`,
        [id, email, await hashPassword(password), name, department || null]
      );
      return res.status(201).json({
        message: "Coordinator account created. They must set their own password at first sign-in.",
        coordinator: result.rows[0],
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "A coordinator with that ID or email already exists." });
      }
      console.error("CREATE COORDINATOR ERROR:", error);
      return res.status(500).json({ message: "Failed to create the coordinator account." });
    }
  });

  app.patch("/api/coordinator/coordinators/:id/status", requireCoordinator, async (req, res) => {
    const client = await pool.connect();
    try {
      const auth = (req as AuthedRequest).auth!;
      const target = String(req.params.id);
      if (typeof req.body?.is_active !== "boolean") {
        return res.status(400).json({ message: "Say whether the account is active." });
      }
      const active: boolean = req.body.is_active;
      if (!active && target === auth.id) {
        return res.status(409).json({
          message: "You cannot deactivate your own account. Ask another coordinator to do it.",
        });
      }

      await client.query("BEGIN");
      // Every active row is locked, so two coordinators deactivating each
      // other at the same moment cannot leave nobody.
      const actives = await client.query<{ coordinator_id: string }>(
        `SELECT coordinator_id FROM coordinators WHERE is_active = TRUE FOR UPDATE`
      );
      if (!active && actives.rows.length === 1 && actives.rows[0].coordinator_id === target) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "This is the only active coordinator account. Add or reactivate another before deactivating it.",
        });
      }
      // Deactivating also ends the account's sessions.
      const result = await client.query(
        `UPDATE coordinators c
         SET is_active = $2,
             auth_version = CASE WHEN $2 THEN c.auth_version ELSE c.auth_version + 1 END
         WHERE c.coordinator_id = $1
         RETURNING ${COORDINATOR_COLUMNS}`,
        [target, active]
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Coordinator account not found." });
      }
      await client.query("COMMIT");
      if (!active) closeNotificationStreams({ role: "coordinator", id: target });
      return res.json({
        message: active ? "Coordinator account reactivated." : "Coordinator account deactivated.",
        coordinator: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("COORDINATOR STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to update the coordinator account." });
    } finally {
      client.release();
    }
  });

  /*
  |--------------------------------------------------------------------------
  | SITE VISITS (coordinator)
  |--------------------------------------------------------------------------
  |
  | A log of the coordinator's visits to host companies: when, what was
  | found, and what needs following up. Any coordinator can read and add
  | visits; a visit can be corrected or removed afterwards.
  |
  */

  function readVisit(
    body: unknown
  ): { visit: { companyId: number; date: string; findings: string; followUp: string | null } } | { problem: string } {
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const companyId = Number(input.company_id);
    const date = text(input.visit_date);
    const findings = text(input.findings);
    const followUp = text(input.follow_up);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return { problem: "Choose the company that was visited." };
    }
    if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return { problem: "Give the date of the visit, written as YYYY-MM-DD." };
    }
    if (date > todayInManila()) {
      return { problem: "A visit is logged after it happens; that date has not come yet." };
    }
    if (findings.length < 10 || findings.length > 3000) {
      return { problem: "Say what you found on the visit (10 to 3000 characters)." };
    }
    if (followUp.length > 1000) {
      return { problem: "Keep the follow-up to 1000 characters." };
    }
    return { visit: { companyId, date, findings, followUp: followUp || null } };
  }

  const VISIT_COLUMNS = `
    v.id, v.company_id, c.name AS company, TO_CHAR(v.visit_date, 'YYYY-MM-DD') AS visit_date,
    v.visited_by_name, v.findings, v.follow_up, v.created_at
  `;
  const VISIT_FROM = `site_visits v JOIN companies c ON c.id = v.company_id`;

  app.get("/api/coordinator/site-visits", requireCoordinator, async (req, res) => {
    try {
      const company = req.query.company_id;
      if (company !== undefined && !/^\d{1,9}$/.test(String(company))) {
        return res.status(400).json({ message: "That is not a company." });
      }
      const result = await pool.query(
        `SELECT ${VISIT_COLUMNS} FROM ${VISIT_FROM}
         WHERE ($1::int IS NULL OR v.company_id = $1::int)
         ORDER BY v.visit_date DESC, v.id DESC LIMIT 500`,
        [company === undefined ? null : Number(company)]
      );
      return res.json({ visits: result.rows });
    } catch (error) {
      console.error("GET SITE VISITS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the site visits." });
    }
  });

  app.post("/api/coordinator/site-visits", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth!;
      const read = readVisit(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const [company, me] = await Promise.all([
        pool.query(`SELECT 1 FROM companies WHERE id = $1`, [read.visit.companyId]),
        pool.query<{ name: string }>(`SELECT name FROM coordinators WHERE coordinator_id = $1`, [auth.id]),
      ]);
      if (company.rows.length === 0) {
        return res.status(400).json({ message: "Choose a company from the Companies page." });
      }
      const saved = await pool.query<{ id: number }>(
        `INSERT INTO site_visits (company_id, visit_date, visited_by, visited_by_name, findings, follow_up)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [read.visit.companyId, read.visit.date, auth.id, me.rows[0]?.name || "OJT coordinator", read.visit.findings, read.visit.followUp]
      );
      const result = await pool.query(`SELECT ${VISIT_COLUMNS} FROM ${VISIT_FROM} WHERE v.id = $1`, [saved.rows[0].id]);
      return res.status(201).json({ message: "Visit logged.", visit: result.rows[0] });
    } catch (error) {
      console.error("CREATE SITE VISIT ERROR:", error);
      return res.status(500).json({ message: "Failed to log the visit." });
    }
  });

  app.put("/api/coordinator/site-visits/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Visit not found." });
      }
      const read = readVisit(req.body);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const company = await pool.query(`SELECT 1 FROM companies WHERE id = $1`, [read.visit.companyId]);
      if (company.rows.length === 0) {
        return res.status(400).json({ message: "Choose a company from the Companies page." });
      }
      const updated = await pool.query(
        `UPDATE site_visits SET company_id = $2, visit_date = $3, findings = $4, follow_up = $5, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [Number(req.params.id), read.visit.companyId, read.visit.date, read.visit.findings, read.visit.followUp]
      );
      if (updated.rows.length === 0) return res.status(404).json({ message: "Visit not found." });
      const result = await pool.query(`SELECT ${VISIT_COLUMNS} FROM ${VISIT_FROM} WHERE v.id = $1`, [Number(req.params.id)]);
      return res.json({ message: "Visit updated.", visit: result.rows[0] });
    } catch (error) {
      console.error("UPDATE SITE VISIT ERROR:", error);
      return res.status(500).json({ message: "Failed to update the visit." });
    }
  });

  app.delete("/api/coordinator/site-visits/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: "Visit not found." });
      }
      const result = await pool.query<{ company_id: number; visit_date: string }>(
        `DELETE FROM site_visits WHERE id = $1
         RETURNING company_id, TO_CHAR(visit_date, 'YYYY-MM-DD') AS visit_date`,
        [Number(req.params.id)]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Visit not found." });
      return res.json({ message: "Visit removed.", visit: result.rows[0] });
    } catch (error) {
      console.error("DELETE SITE VISIT ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the visit." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | PROJECTIONS AND ALERTS
  |--------------------------------------------------------------------------
  |
  | See services/insights.ts for how each is worked out. A student sees
  | their own projection, a supervisor their interns', the coordinator
  | every active student's (optionally one term's). Alerts are the
  | coordinator's.
  |
  */

  app.get(
    "/api/projections",
    requireRole(["student", "supervisor", "coordinator"]),
    async (req, res) => {
      try {
        const auth = (req as AuthedRequest).auth!;
        let termId: number | "none" | undefined;
        if (auth.role === "coordinator" && req.query.term !== undefined && req.query.term !== "") {
          const term = String(req.query.term);
          if (term !== "none" && !/^\d{1,9}$/.test(term)) {
            return res.status(400).json({ message: "That is not a term." });
          }
          termId = term === "none" ? "none" : Number(term);
        }
        const projections = await projectionsFor(pool, {
          studentId: auth.role === "student" ? auth.id : undefined,
          supervisorId: auth.role === "supervisor" ? auth.id : undefined,
          termId,
        });
        return res.json({ projections });
      } catch (error) {
        console.error("GET PROJECTIONS ERROR:", error);
        return res.status(500).json({ message: "Failed to work out the projections." });
      }
    }
  );

  app.get("/api/coordinator/alerts", requireCoordinator, async (_req, res) => {
    try {
      return res.json({ alerts: await coordinatorAlerts(pool) });
    } catch (error) {
      console.error("GET ALERTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the alerts." });
    }
  });

  // The figures behind the exports: students with their projection, and
  // companies summed from them, optionally for one term.
  app.get("/api/coordinator/report", requireCoordinator, async (req, res) => {
    try {
      let termId: number | "none" | undefined;
      if (req.query.term !== undefined && req.query.term !== "") {
        const term = String(req.query.term);
        if (term !== "none" && !/^\d{1,9}$/.test(term)) {
          return res.status(400).json({ message: "That is not a term." });
        }
        termId = term === "none" ? "none" : Number(term);
      }
      return res.json(await programmeReport(pool, termId));
    } catch (error) {
      console.error("GET REPORT ERROR:", error);
      return res.status(500).json({ message: "Failed to build the report." });
    }
  });
}
