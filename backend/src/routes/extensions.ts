import { randomInt } from "node:crypto";
import type express from "express";
import type { Pool } from "pg";

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
      status: "created" | "error";
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
  | ANNOUNCEMENTS (coordinator)
  |--------------------------------------------------------------------------
  */

  app.get("/api/coordinator/announcements", requireCoordinator, async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, message, audience, company, recipients, created_at
         FROM announcements ORDER BY created_at DESC LIMIT 100`
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
                 s.is_active, s.completed_at, s.supervisor_id,
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

        const [attendance, tasks, documents, evaluations, absences, schedule] = await Promise.all([
          pool.query(
            `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, time_in, break_time, break_end_time,
                    time_out, hours, note, status, review_notes, correction_note
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
  };

  app.post(
    "/api/coordinator/:kind/:id/reset-password",
    requireCoordinator,
    async (req, res, next) => {
      const target = resettable[req.params.kind as keyof typeof resettable];
      if (!target) return next();
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
              title: "Reply on your complaint",
              message: `The OJT coordinator replied about your ${complaint.category} report.`,
              type: "info",
            });
          } else {
            await notifyCoordinators({
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
}
