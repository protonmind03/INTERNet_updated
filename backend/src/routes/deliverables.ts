import type express from "express";
import type { Pool } from "pg";
import { appliesTo, dueOn, dueText, oneOff, readDeliverable } from "../services/deliverables";
import { sameId } from "../services/ids";

/*
|--------------------------------------------------------------------------
| PROGRAMME DELIVERABLES: THE ROUTES
|--------------------------------------------------------------------------
|
| What the rules mean is in services/deliverables.ts. Here:
|
|   the coordinator sets a requirement's due date or rule, its reviewer
|   and who it applies to (the name, description and order are still
|   saved by the older requirement routes, untouched);
|
|   a student reads what is due of them, with dates: the one-off
|   deliverables that have a day, and each week of the weekly ones.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
};

export function registerDeliverableRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator } = deps;

  app.put("/api/coordinator/requirements/:id/deliverable", requireCoordinator, async (req, res) => {
    try {
      if (!/^[0-9]{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Requirement not found." });
      const found = await pool.query<{ name: string }>(`SELECT name FROM ojt_requirements WHERE id = $1`, [req.params.id]);
      if (found.rows.length === 0) return res.status(404).json({ message: "Requirement not found." });
      const settings = readDeliverable(req.body, found.rows[0].name);
      if ("problem" in settings) return res.status(400).json({ message: settings.problem });

      // Only programs and blocks that exist can be named.
      const known = await pool.query<{ programs: number; blocks: number }>(
        `SELECT (SELECT COUNT(*)::int FROM programs WHERE id = ANY($1::int[])) AS programs,
                (SELECT COUNT(*)::int FROM blocks WHERE id = ANY($2::int[])) AS blocks`,
        [settings.applies_to.program_ids, settings.applies_to.block_ids]
      );
      if (
        known.rows[0].programs !== settings.applies_to.program_ids.length ||
        known.rows[0].blocks !== settings.applies_to.block_ids.length
      ) {
        return res.status(400).json({ message: "One of those programs or blocks does not exist." });
      }

      const saved = await pool.query(
        `UPDATE ojt_requirements
         SET due_date = $2::date, due_rule = $3, reviewer_role = $4, applies_to = $5::jsonb, updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, description, is_active, sort_order,
                   TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, due_rule, reviewer_role, applies_to`,
        [req.params.id, settings.due_date, settings.due_rule, settings.reviewer_role, JSON.stringify(settings.applies_to)]
      );
      const everyone = settings.applies_to.program_ids.length + settings.applies_to.block_ids.length === 0;
      return res.json({
        message: "Due date and reviewer saved.",
        requirement: saved.rows[0],
        // In words, for the audit log.
        summary: [
          dueText(settings) || "No due date",
          `reviewed by the ${settings.reviewer_role}`,
          everyone
            ? "for everyone"
            : `for ${settings.applies_to.program_ids.length} program(s) and ${settings.applies_to.block_ids.length} block(s)`,
        ].join("; "),
      });
    } catch (error) {
      console.error("SAVE DELIVERABLE ERROR:", error);
      return res.status(500).json({ message: "Failed to save the due date and reviewer." });
    }
  });

  // What is due of one student, with dates, soonest first. Their own only.
  app.get("/api/students/:studentId/deliverables", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) {
        return res.status(403).json({ message: "You can only view your own requirements." });
      }
      const [once, weekly] = await Promise.all([
        pool.query(
          `SELECT r.id AS requirement_id, r.name, r.description, r.reviewer_role,
                  TO_CHAR(${dueOn("r", "t")}, 'YYYY-MM-DD') AS due_date,
                  COALESCE((
                    SELECT CASE d.status WHEN 'Pending' THEN 'Submitted' ELSE d.status END
                    FROM documents d
                    WHERE d.student_id = s.student_id AND d.doc_type = r.name
                    ORDER BY (d.status = 'Approved') DESC, d.uploaded_at DESC LIMIT 1
                  ), 'Not submitted') AS status
           FROM students s
           JOIN ojt_requirements r ON r.is_active = TRUE AND ${oneOff("r")} AND ${appliesTo("r", "s")}
           LEFT JOIN terms t ON t.id = s.term_id
           WHERE s.student_id = $1 AND ${dueOn("r", "t")} IS NOT NULL
           ORDER BY ${dueOn("r", "t")}, r.sort_order, r.name`,
          [auth.id]
        ),
        pool.query(
          `SELECT i.id AS item_id, r.id AS requirement_id, r.name, r.description, r.reviewer_role,
                  TO_CHAR(i.period_start, 'YYYY-MM-DD') AS period_start,
                  TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
                  CASE i.status WHEN 'Pending' THEN 'Not submitted' ELSE i.status END AS status,
                  d.original_filename, d.review_notes
           FROM deliverable_items i
           JOIN ojt_requirements r ON r.id = i.requirement_id AND r.is_active = TRUE AND r.due_rule = 'weekly'
           LEFT JOIN documents d ON d.id = i.document_id
           WHERE i.student_id = $1
           ORDER BY i.due_date DESC, r.sort_order, r.name`,
          [auth.id]
        ),
      ]);
      return res.json({ deliverables: once.rows, weekly: weekly.rows });
    } catch (error) {
      console.error("GET DELIVERABLES ERROR:", error);
      return res.status(500).json({ message: "Failed to load your requirements." });
    }
  });
}
