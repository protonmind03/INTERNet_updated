import type express from "express";
import type { Pool } from "pg";
import { scopeCondition } from "../services/coordinatorScope";
import { isSemester, SEMESTER_WORDS, type Semester } from "../services/semesters";

/*
|--------------------------------------------------------------------------
| SEMESTERS AND PROGRAMS WHOSE OJT SPANS TWO TERMS (Phase 2.6, migration 090)
|--------------------------------------------------------------------------
|
|   PUT  /api/coordinator/programs/:id/ojt-semesters   { semesters: [] }
|        the semester(s) a program's OJT runs in, in order (0 to 2)
|   GET  /api/coordinator/terms/:id/semester-check
|        students in the term whose program's OJT is in another semester,
|        and those whose OJT continues into a next term
|   POST /api/coordinator/terms/:id/carry-over          { to_term_id }
|        moves the continuing students into the next term; their hours and
|        records come with them (hours are summed over all their logs)
|
*/

type Dependencies = { pool: Pool; requireCoordinator: express.RequestHandler };

const idParam = (value: unknown): number | null => (/^\d{1,9}$/.test(String(value)) ? Number(value) : null);

export function registerSemesterRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator } = deps;

  // Each program's OJT semesters, in order, for the Programs page.
  app.get("/api/coordinator/program-semesters", requireCoordinator, async (_req, res) => {
    try {
      const rows = await pool.query<{ program_id: number; semesters: string[] }>(
        `SELECT program_id, ARRAY_AGG(semester ORDER BY part) AS semesters FROM program_terms GROUP BY program_id`
      );
      return res.json({ semesters: Object.fromEntries(rows.rows.map((row) => [row.program_id, row.semesters])) });
    } catch (error) {
      console.error("GET PROGRAM SEMESTERS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the OJT semesters." });
    }
  });

  app.put("/api/coordinator/programs/:id/ojt-semesters", requireCoordinator, async (req, res) => {
    const id = idParam(req.params.id);
    if (id === null) return res.status(404).json({ message: "Program not found." });
    const given: unknown = req.body?.semesters;
    if (!Array.isArray(given) || given.length > 2 || given.some((item) => !isSemester(item))) {
      return res.status(400).json({ message: "Choose up to two semesters, in order." });
    }
    if (new Set(given).size !== given.length) return res.status(400).json({ message: "Choose each semester once." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(`SELECT 1 FROM programs WHERE id = $1 FOR UPDATE`, [id]);
      if (found.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Program not found." });
      }
      await client.query(`DELETE FROM program_terms WHERE program_id = $1`, [id]);
      for (const [index, semester] of (given as string[]).entries()) {
        await client.query(`INSERT INTO program_terms (program_id, part, semester) VALUES ($1, $2, $3)`, [id, index + 1, semester]);
      }
      await client.query("COMMIT");
      const words = (given as Semester[]).map((item) => SEMESTER_WORDS[item]);
      return res.json({
        message: words.length === 0 ? "OJT semesters cleared." : words.length === 1 ? `OJT runs in the ${words[0]}.` : `OJT runs in the ${words[0]}, then continues in the ${words[1]}.`,
        semesters: given,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("SAVE OJT SEMESTERS ERROR:", error);
      return res.status(500).json({ message: "Failed to save the OJT semesters." });
    } finally {
      client.release();
    }
  });

  app.get("/api/coordinator/terms/:id/semester-check", requireCoordinator, async (req, res) => {
    try {
      const id = idParam(req.params.id);
      if (id === null) return res.status(404).json({ message: "Term not found." });
      const term = await pool.query<{ semester: string | null }>(`SELECT semester FROM terms WHERE id = $1`, [id]);
      if (term.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      const semester = term.rows[0].semester;
      if (!semester) return res.json({ semester: null, elsewhere: [], continuing: [] });
      // Students whose program has said its semesters, and this is not one of them (within the coordinator's scope).
      const scope = scopeCondition("s.student_id", 2);
      const [elsewhere, continuing] = await Promise.all([
        pool.query(
          `SELECT TRIM(s.student_id::text) AS student_id, s.name, p.short_code AS program,
                  ARRAY(SELECT pt.semester FROM program_terms pt WHERE pt.program_id = s.program_id ORDER BY pt.part) AS program_semesters
           FROM students s JOIN programs p ON p.id = s.program_id
           WHERE s.term_id = $1 AND s.is_active = TRUE
             AND EXISTS (SELECT 1 FROM program_terms pt WHERE pt.program_id = s.program_id)
             AND NOT EXISTS (SELECT 1 FROM program_terms pt WHERE pt.program_id = s.program_id AND pt.semester = $2)${scope.sql}
           ORDER BY s.name`,
          [id, semester, ...scope.values]
        ),
        // Students in part 1 of a two-term program: their OJT goes on next term.
        pool.query(
          `SELECT TRIM(s.student_id::text) AS student_id, s.name, p.short_code AS program, next.semester AS next_semester
           FROM students s JOIN programs p ON p.id = s.program_id
           JOIN program_terms here ON here.program_id = s.program_id AND here.part = 1 AND here.semester = $2
           JOIN program_terms next ON next.program_id = s.program_id AND next.part = 2
           WHERE s.term_id = $1 AND s.is_active = TRUE${scope.sql}
           ORDER BY s.name`,
          [id, semester, ...scope.values]
        ),
      ]);
      return res.json({ semester, elsewhere: elsewhere.rows, continuing: continuing.rows });
    } catch (error) {
      console.error("SEMESTER CHECK ERROR:", error);
      return res.status(500).json({ message: "Failed to check the term's semesters." });
    }
  });

  app.post("/api/coordinator/terms/:id/carry-over", requireCoordinator, async (req, res) => {
    try {
      const from = idParam(req.params.id);
      const to = idParam(req.body?.to_term_id);
      if (from === null) return res.status(404).json({ message: "Term not found." });
      if (to === null || to === from) return res.status(400).json({ message: "Choose the term they continue in." });
      const terms = await pool.query<{ id: number; semester: string | null; is_closed: boolean; start_date: string }>(
        `SELECT id, semester, is_closed, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date FROM terms WHERE id = ANY($1::int[])`,
        [[from, to]]
      );
      const source = terms.rows.find((row) => row.id === from);
      const target = terms.rows.find((row) => row.id === to);
      if (!source || !target) return res.status(404).json({ message: "Term not found." });
      if (!source.semester || !target.semester) return res.status(409).json({ message: "Give both terms a semester first." });
      if (target.is_closed) return res.status(409).json({ message: "That term is closed. Reopen it first." });
      const scope = scopeCondition("s.student_id", 4);
      const continuing = `s.term_id = $1 AND s.is_active = TRUE
           AND EXISTS (SELECT 1 FROM program_terms here WHERE here.program_id = s.program_id AND here.part = 1 AND here.semester = $3)
           AND EXISTS (SELECT 1 FROM program_terms next WHERE next.program_id = s.program_id AND next.part = 2 AND next.semester = $4)${scope.sql}`;
      const values = [from, to, source.semester, target.semester, ...scope.values];
      const client = await pool.connect();
      let moved: { student_id: string }[];
      try {
        await client.query("BEGIN");
        // Slots are counted per term: the companies of the students moving are locked, and
        // the move is refused if it would put more students at one than it has slots.
        const over = await client.query<{ name: string; slots: number; would_be: number }>(
          `WITH moving AS (SELECT s.company_id FROM students s WHERE ${continuing} AND s.company_id IS NOT NULL),
                locked AS (SELECT c.id, c.name, c.slots FROM companies c WHERE c.id IN (SELECT company_id FROM moving) FOR UPDATE)
           SELECT l.name, l.slots,
                  (SELECT COUNT(*)::int FROM students p WHERE p.company_id = l.id AND p.is_active = TRUE AND p.term_id = $2)
                  + (SELECT COUNT(*)::int FROM moving m WHERE m.company_id = l.id) AS would_be
           FROM locked l WHERE l.slots IS NOT NULL`,
          values
        );
        const full = over.rows.filter((row) => row.would_be > row.slots);
        if (full.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            code: "NO_SLOTS",
            message: `Not carried over: ${full.map((row) => `${row.name} would have ${row.would_be} students for ${row.slots} slots`).join("; ")}. Raise its slots or place them elsewhere first.`,
          });
        }
        // A block belongs to its term, and closes with it: the moved students leave theirs.
        moved = (
          await client.query<{ student_id: string }>(
            `UPDATE students s SET term_id = $2, block_id = NULL
             WHERE ${continuing}
             RETURNING TRIM(s.student_id::text) AS student_id`,
            values
          )
        ).rows;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      const n = moved.length;
      return res.json({
        message: n === 0 ? "No student continues into that term." : `${n} student${n === 1 ? "" : "s"} carried over, with their hours and records.`,
        moved: moved.map((row) => row.student_id),
      });
    } catch (error) {
      console.error("CARRY OVER ERROR:", error);
      return res.status(500).json({ message: "Failed to carry the students over." });
    }
  });
}
