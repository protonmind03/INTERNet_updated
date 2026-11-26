import type express from "express";
import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| THE OJT DIRECTOR'S PORTAL: ITS OWN ROUTES (Phase 1.6)
|--------------------------------------------------------------------------
|
| Director only. The Director also reads and changes what the office
| shares with the coordinators (the programs, the OJT rules, coordinator
| accounts), through those routes (requireStaff and requireOffice in
| server.ts); what is here exists for the Director alone:
|
|   the campus at a glance, by college
|   which colleges or programs each coordinator looks after (their scope)
|   the agencies, with what approving one needs
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = { pool: Pool; requireDirector: express.RequestHandler };

const ids = (value: unknown): number[] | null => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  if (value.some((item) => !Number.isSafeInteger(item) || (item as number) < 1)) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
};

export function registerDirectorRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireDirector } = deps;

  /*
  | The campus at a glance: for each college, its active interns, how many
  | are cleared for deployment, on track, at risk (the projection says they
  | finish after the term, student_projections), and the agreements of
  | their companies ending within 30 days. Plus the same for the campus.
  */
  app.get("/api/director/overview", requireDirector, async (_req, res) => {
    try {
      const rows = (
        await pool.query<{
          college_id: number | null;
          college: string | null;
          short_name: string | null;
          mark_key: string | null;
          interns: number;
          cleared: number;
          at_risk: number;
          agreements_ending: number;
        }>(
          `WITH interns AS (
             SELECT s.student_id, s.company_id, s.cleared_for_deployment_at, p.college_id,
                    COALESCE(sp.at_risk, FALSE) AS at_risk
             FROM students s
             LEFT JOIN programs p ON p.id = s.program_id
             LEFT JOIN student_projections sp ON sp.student_id = s.student_id
             WHERE s.is_active = TRUE
           )
           SELECT c.id AS college_id, c.name AS college, c.short_name, c.mark_key,
                  COUNT(i.student_id)::int AS interns,
                  COUNT(i.student_id) FILTER (WHERE i.cleared_for_deployment_at IS NOT NULL)::int AS cleared,
                  COUNT(i.student_id) FILTER (WHERE i.at_risk)::int AS at_risk,
                  (SELECT COUNT(DISTINCT co.id)::int FROM companies co
                   WHERE co.moa_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
                     AND co.id IN (SELECT company_id FROM interns WHERE college_id = c.id)) AS agreements_ending
           FROM colleges c
           LEFT JOIN interns i ON i.college_id = c.id
           WHERE c.is_active = TRUE
           GROUP BY c.id
           UNION ALL
           -- Students with no program are in no college: shown on their own line when there are any.
           SELECT NULL, NULL, NULL, NULL,
                  COUNT(*)::int,
                  COUNT(*) FILTER (WHERE cleared_for_deployment_at IS NOT NULL)::int,
                  COUNT(*) FILTER (WHERE at_risk)::int,
                  0
           FROM interns WHERE college_id IS NULL
           HAVING COUNT(*) > 0
           ORDER BY 2 NULLS LAST`
        )
      ).rows;
      const campus = await pool.query<{ interns: number; cleared: number; at_risk: number; agreements_ending: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM students WHERE is_active) AS interns,
           (SELECT COUNT(*)::int FROM students WHERE is_active AND cleared_for_deployment_at IS NOT NULL) AS cleared,
           (SELECT COUNT(*)::int FROM students s JOIN student_projections sp ON sp.student_id = s.student_id
             WHERE s.is_active AND sp.at_risk) AS at_risk,
           (SELECT COUNT(*)::int FROM companies WHERE is_active AND moa_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS agreements_ending`
      );
      const colleges = rows.map((row) => ({ ...row, on_track: row.interns - row.at_risk }));
      const total = campus.rows[0];
      return res.json({ campus: { ...total, on_track: total.interns - total.at_risk }, colleges });
    } catch (error) {
      console.error("DIRECTOR OVERVIEW ERROR:", error);
      return res.status(500).json({ message: "Failed to load the campus overview." });
    }
  });

  // Every coordinator with the colleges and programs they look after (none: every student).
  app.get("/api/director/coordinators", requireDirector, async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT c.coordinator_id, c.name, c.email, c.is_active,
                COALESCE(ARRAY_AGG(cs.college_id) FILTER (WHERE cs.college_id IS NOT NULL), '{}') AS college_ids,
                COALESCE(ARRAY_AGG(cs.program_id) FILTER (WHERE cs.program_id IS NOT NULL), '{}') AS program_ids
         FROM coordinators c
         LEFT JOIN coordinator_scopes cs ON cs.coordinator_id = c.coordinator_id
         GROUP BY c.coordinator_id, c.name, c.email, c.is_active
         ORDER BY c.is_active DESC, c.name`
      );
      return res.json({ coordinators: result.rows });
    } catch (error) {
      console.error("DIRECTOR COORDINATORS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the coordinators." });
    }
  });

  /*
  | The agencies the Director approves or suspends (Phase 1.3): each
  | company's kind, status and the version it was read at (the change goes
  | through PUT /api/coordinator/company-records/:id/hte-status), its MOA,
  | its slots against its active students, its latest screening, and the
  | colleges it serves (its programs, or its students' programs) for the
  | college marks. Waiting ones first.
  */
  app.get("/api/director/htes", requireDirector, async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT c.id, c.name, c.address, c.hte_type, c.status, c.version, c.is_active, c.slots,
                c.moa_notarized, TO_CHAR(c.moa_expiry, 'YYYY-MM-DD') AS moa_expiry,
                (c.moa_document_name IS NOT NULL) AS moa_on_file,
                (SELECT COUNT(*)::int FROM students s WHERE s.company_id = c.id AND s.is_active = TRUE) AS active_students,
                EXISTS (SELECT 1 FROM company_screenings cs WHERE cs.company_id = c.id AND cs.decision IN ('pass', 'conditional')) AS screening_passed,
                (SELECT JSON_BUILD_OBJECT('screened_on', TO_CHAR(cs.screened_on, 'YYYY-MM-DD'), 'decision', cs.decision, 'notes', cs.notes)
                   FROM company_screenings cs WHERE cs.company_id = c.id
                   ORDER BY cs.screened_on DESC, cs.id DESC LIMIT 1) AS last_screening,
                COALESCE((SELECT ARRAY_AGG(DISTINCT p.college_id) FROM programs p
                   WHERE p.college_id IS NOT NULL
                     AND (p.id IN (SELECT program_id FROM company_programs WHERE company_id = c.id)
                          OR p.id IN (SELECT program_id FROM students WHERE company_id = c.id AND is_active = TRUE))), '{}') AS college_ids
         FROM companies c
         ORDER BY c.is_active DESC,
                  CASE c.status WHEN 'screening' THEN 0 WHEN 'applied' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END,
                  LOWER(c.name)`
      );
      return res.json({ companies: result.rows });
    } catch (error) {
      console.error("DIRECTOR HTES ERROR:", error);
      return res.status(500).json({ message: "Failed to load the agencies." });
    }
  });

  // Replaces a coordinator's scope. Empty lists: every student again.
  app.put("/api/director/coordinators/:coordinatorId/scopes", requireDirector, async (req, res) => {
    const colleges = ids(req.body?.college_ids);
    const programs = ids(req.body?.program_ids);
    if (!colleges || !programs) return res.status(400).json({ message: "Choose colleges and programs from the lists." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const coordinator = await client.query(`SELECT name FROM coordinators WHERE coordinator_id = $1 FOR UPDATE`, [
        req.params.coordinatorId,
      ]);
      if (coordinator.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Coordinator not found." });
      }
      const known = await client.query<{ colleges: number; programs: number }>(
        `SELECT (SELECT COUNT(*)::int FROM colleges WHERE id = ANY($1::int[])) AS colleges,
                (SELECT COUNT(*)::int FROM programs WHERE id = ANY($2::int[])) AS programs`,
        [colleges, programs]
      );
      if (known.rows[0].colleges !== colleges.length || known.rows[0].programs !== programs.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "One of those colleges or programs does not exist." });
      }
      const before = await client.query<{ college_id: number | null; program_id: number | null }>(
        `DELETE FROM coordinator_scopes WHERE coordinator_id = $1 RETURNING college_id, program_id`,
        [req.params.coordinatorId]
      );
      for (const college of colleges) {
        await client.query(`INSERT INTO coordinator_scopes (coordinator_id, college_id) VALUES ($1, $2)`, [req.params.coordinatorId, college]);
      }
      for (const program of programs) {
        await client.query(`INSERT INTO coordinator_scopes (coordinator_id, program_id) VALUES ($1, $2)`, [req.params.coordinatorId, program]);
      }
      await client.query("COMMIT");
      const name = coordinator.rows[0].name;
      const every = colleges.length + programs.length === 0;
      return res.json({
        message: every ? `${name} now sees every student.` : `${name}'s colleges and programs saved.`,
        // For the audit log: the old and the new value.
        old: {
          college_ids: before.rows.flatMap((row) => (row.college_id ? [row.college_id] : [])),
          program_ids: before.rows.flatMap((row) => (row.program_id ? [row.program_id] : [])),
        },
        value: { college_ids: colleges, program_ids: programs },
        by: (req as Authed).auth?.id,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("SAVE COORDINATOR SCOPES ERROR:", error);
      return res.status(500).json({ message: "Failed to save the coordinator's colleges and programs." });
    } finally {
      client.release();
    }
  });
}
