import type express from "express";
import type { Pool } from "pg";
import { coordinatorName } from "../services/coordinatorName";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR DECIDES A COMPLETION REQUEST (Phase 2.5, migration 089)
|--------------------------------------------------------------------------
|
|   POST /api/coordinator/students/:studentId/completion/approve
|        a requested review is approved; the student is told
|   POST /api/coordinator/students/:studentId/completion/return  { note }
|        sent back with what to fix: the request (and any approval) is
|        cleared so the student can ask again; the student is told why
|
| The routes name the student, so a scoped coordinator decides only for
| their own students.
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireCoordinator: express.RequestHandler;
  createNotification: (options: { studentId?: string | null; title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
};

export function registerCompletionDecisionRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator, createNotification } = deps;

  app.post("/api/coordinator/students/:studentId/completion/approve", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const studentId = String(req.params.studentId).trim();
      const name = await coordinatorName(pool, auth.id);
      const approved = await pool.query<{ student_id: string; completion_approved_at: string }>(
        `UPDATE students SET completion_approved_at = NOW(), completion_approved_by = $2, completion_approved_by_name = $3,
                completion_returned_at = NULL, completion_return_note = NULL
         WHERE TRIM(student_id::text) = $1 AND completion_requested_at IS NOT NULL AND completion_approved_at IS NULL
         RETURNING student_id, completion_approved_at`,
        [studentId, auth.id, name]
      );
      if (approved.rows.length === 0) {
        const exists = await pool.query<{ requested: boolean; approved: boolean }>(
          `SELECT completion_requested_at IS NOT NULL AS requested, completion_approved_at IS NOT NULL AS approved FROM students WHERE TRIM(student_id::text) = $1`,
          [studentId]
        );
        if (exists.rows.length === 0) return res.status(404).json({ message: "Student not found." });
        return res.status(409).json({
          message: exists.rows[0].approved ? "Completion is already approved." : "The student has not asked for a completion review.",
        });
      }
      await createNotification({
        studentId: approved.rows[0].student_id,
        title: "Your OJT completion is approved",
        message: `${name} approved your completion review.`,
        type: "info",
        link: "/student/completion",
      }).catch((error) => console.error("COMPLETION APPROVED NOTIFICATION ERROR:", error));
      return res.json({ message: "Completion approved. The student has been told.", approved_at: approved.rows[0].completion_approved_at });
    } catch (error) {
      console.error("APPROVE COMPLETION ERROR:", error);
      return res.status(500).json({ message: "Failed to approve the completion." });
    }
  });

  app.post("/api/coordinator/students/:studentId/completion/return", requireCoordinator, async (req, res) => {
    try {
      const studentId = String(req.params.studentId).trim();
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (note.length < 10 || note.length > 1000) return res.status(400).json({ message: "Say what the student needs to fix (10 to 1000 characters)." });
      const returned = await pool.query<{ student_id: string }>(
        `UPDATE students SET completion_requested_at = NULL, completion_approved_at = NULL, completion_approved_by = NULL,
                completion_approved_by_name = NULL, completion_returned_at = NOW(), completion_return_note = $2
         WHERE TRIM(student_id::text) = $1 AND completion_requested_at IS NOT NULL
         RETURNING student_id`,
        [studentId, note]
      );
      if (returned.rows.length === 0) {
        const exists = await pool.query(`SELECT 1 FROM students WHERE TRIM(student_id::text) = $1`, [studentId]);
        if (exists.rows.length === 0) return res.status(404).json({ message: "Student not found." });
        return res.status(409).json({ message: "The student has not asked for a completion review." });
      }
      await createNotification({
        studentId: returned.rows[0].student_id,
        title: "Your completion review was returned",
        message: `To fix before asking again: ${note}`,
        type: "info",
        link: "/student/completion",
      }).catch((error) => console.error("COMPLETION RETURNED NOTIFICATION ERROR:", error));
      return res.json({ message: "Returned to the student with your note." });
    } catch (error) {
      console.error("RETURN COMPLETION ERROR:", error);
      return res.status(500).json({ message: "Failed to return the completion review." });
    }
  });
}
