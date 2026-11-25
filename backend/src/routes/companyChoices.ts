import type express from "express";
import type { Pool } from "pg";
import { scopeCondition } from "../services/coordinatorScope";
import { sameId } from "../services/ids";
import { PlacementError, withPlacement } from "../services/placement";

/*
|--------------------------------------------------------------------------
| STUDENTS CHOOSE THEIR AGENCY; THE COORDINATOR ASSIGNS (Phase 2.2, migration 086)
|--------------------------------------------------------------------------
|
|   the window     a coordinator opens a term's choice window (and closes it)
|   the programs   the programs a company takes; none listed: any
|   choosing       inside the window, a student ranks up to 3 companies that
|                  are approved, active, take their program and have a free
|                  slot in the term
|   assigning      the coordinator sees demand against slots and assigns a
|                  student to one of their choices, or to any company; the
|                  slots and the approval are checked as for every placement
|                  (services/placement.ts), and the student is told
|
*/

type Role = "student" | "supervisor" | "coordinator" | "director";
type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  createNotification: (options: { studentId?: string | null; title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
};

type Option = { id: number; name: string; address: string | null; hte_type: string; slots: number | null; placed: number };

const MAX_CHOICES = 3;

/** The companies a student may choose: approved, active, taking their program, with a free slot in their term. */
async function optionsFor(pool: Pool, programId: number | null, termId: number | null, keep: number[] = []): Promise<Option[]> {
  const rows = (
    await pool.query<Option>(
      `SELECT c.id, c.name, c.address, c.hte_type, c.slots,
              (SELECT COUNT(*)::int FROM students p WHERE p.company_id = c.id AND p.is_active = TRUE
                 AND COALESCE(p.term_id, 0) = COALESCE($2::int, 0)) AS placed
       FROM companies c
       WHERE c.is_active = TRUE AND c.status = 'approved'
         AND (NOT EXISTS (SELECT 1 FROM company_programs cp WHERE cp.company_id = c.id)
              OR EXISTS (SELECT 1 FROM company_programs cp WHERE cp.company_id = c.id AND cp.program_id = $1::int))
       ORDER BY LOWER(c.name)`,
      [programId, termId]
    )
  ).rows;
  // A choice already made stays listed even once its slots fill.
  return rows.filter((row) => row.slots === null || row.placed < row.slots || keep.includes(row.id));
}

const windowState = (opens: Date | null, closes: Date | null, now = new Date()) =>
  opens && closes ? (now < opens ? "not_yet" : now >= closes ? "closed" : "open") : "none";

export function registerCompanyChoiceRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator, createNotification } = deps;

  // The term's choice window: both times, or nulls to remove it.
  app.put("/api/coordinator/terms/:termId/choice-window", requireCoordinator, async (req, res) => {
    try {
      const termId = Number(req.params.termId);
      if (!Number.isSafeInteger(termId) || termId < 1) return res.status(404).json({ message: "Term not found." });
      const opens = req.body?.opens_at ? new Date(String(req.body.opens_at)) : null;
      const closes = req.body?.closes_at ? new Date(String(req.body.closes_at)) : null;
      if ((opens === null) !== (closes === null)) return res.status(400).json({ message: "Give when the window opens and when it closes, or neither." });
      if (opens && (Number.isNaN(opens.getTime()) || Number.isNaN(closes!.getTime()))) return res.status(400).json({ message: "Those are not dates and times." });
      if (opens && closes! <= opens) return res.status(400).json({ message: "The window must close after it opens." });
      const saved = await pool.query<{ name: string }>(
        `UPDATE terms SET choice_opens_at = $2, choice_closes_at = $3 WHERE id = $1 RETURNING name`,
        [termId, opens, closes]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      return res.json({
        message: opens ? `Choice window set for ${saved.rows[0].name}.` : `Choice window removed for ${saved.rows[0].name}.`,
        window: { opens_at: opens, closes_at: closes, state: windowState(opens, closes) },
      });
    } catch (error) {
      console.error("SET CHOICE WINDOW ERROR:", error);
      return res.status(500).json({ message: "Failed to set the choice window." });
    }
  });

  // The programs a company takes; an empty list: any program.
  app.put("/api/coordinator/company-records/:id/programs", requireCoordinator, async (req, res) => {
    const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : null;
    if (id === null) return res.status(404).json({ message: "Company not found." });
    const given: unknown = req.body?.program_ids;
    if (!Array.isArray(given) || given.length > 100 || given.some((item) => !Number.isSafeInteger(item) || (item as number) < 1)) {
      return res.status(400).json({ message: "Choose the programs as a list." });
    }
    const programIds = [...new Set(given as number[])];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(`SELECT 1 FROM companies WHERE id = $1 FOR UPDATE`, [id]);
      if (found.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Company not found." });
      }
      const known = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM programs WHERE id = ANY($1::int[])`, [programIds]);
      if (known.rows[0].n !== programIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "One of those programs does not exist." });
      }
      await client.query(`DELETE FROM company_programs WHERE company_id = $1`, [id]);
      if (programIds.length > 0) {
        await client.query(`INSERT INTO company_programs (company_id, program_id) SELECT $1, UNNEST($2::int[])`, [id, programIds]);
      }
      await client.query("COMMIT");
      return res.json({ message: programIds.length ? "Programs saved." : "This company now takes any program.", program_ids: programIds });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("SAVE COMPANY PROGRAMS ERROR:", error);
      return res.status(500).json({ message: "Failed to save the programs." });
    } finally {
      client.release();
    }
  });

  /** The student's term, program and window. */
  const studentContext = async (studentId: string) =>
    (
      await pool.query<{ term_id: number | null; program_id: number | null; term: string | null; opens: Date | null; closes: Date | null; company: string | null }>(
        `SELECT s.term_id, s.program_id, t.name AS term, t.choice_opens_at AS opens, t.choice_closes_at AS closes, s.company
         FROM students s LEFT JOIN terms t ON t.id = s.term_id WHERE s.student_id = $1`,
        [studentId]
      )
    ).rows[0];

  // The student's window, what they may choose, and what they chose.
  app.get("/api/students/:studentId/company-choices", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own choices." });
      const context = await studentContext(auth.id);
      if (!context) return res.status(404).json({ message: "Student not found." });
      const mine = context.term_id
        ? (
            await pool.query<{ rank: number; company_id: number; name: string }>(
              `SELECT ch.rank, ch.company_id, c.name FROM company_choices ch JOIN companies c ON c.id = ch.company_id
               WHERE ch.student_id = $1 AND ch.term_id = $2 ORDER BY ch.rank`,
              [auth.id, context.term_id]
            )
          ).rows
        : [];
      const state = context.term_id ? windowState(context.opens, context.closes) : "none";
      const options = state === "open" ? await optionsFor(pool, context.program_id, context.term_id, mine.map((row) => row.company_id)) : [];
      return res.json({
        window: { state, term: context.term, opens_at: context.opens, closes_at: context.closes },
        assigned: context.company,
        options: options.map(({ id, name, address, hte_type, slots, placed }) => ({ id, name, address, hte_type, free: slots === null ? null : Math.max(0, slots - placed) })),
        choices: mine,
      });
    } catch (error) {
      console.error("GET COMPANY CHOICES ERROR:", error);
      return res.status(500).json({ message: "Failed to load the choices." });
    }
  });

  // The student ranks up to three, inside the window.
  app.put("/api/students/:studentId/company-choices", requireRole("student"), async (req, res) => {
    const auth = (req as Authed).auth!;
    if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only choose for yourself." });
    const given: unknown = req.body?.company_ids;
    if (!Array.isArray(given) || given.length > MAX_CHOICES || given.some((item) => !Number.isSafeInteger(item))) {
      return res.status(400).json({ message: `Choose up to ${MAX_CHOICES} companies, in order.` });
    }
    const ids = given as number[];
    if (new Set(ids).size !== ids.length) return res.status(400).json({ message: "Choose each company once." });
    try {
      const context = await studentContext(auth.id);
      if (!context?.term_id) return res.status(409).json({ code: "NO_TERM", message: "You are not in a term yet, so there is nothing to choose for." });
      const state = windowState(context.opens, context.closes);
      if (state !== "open") {
        return res.status(409).json({ code: "WINDOW_CLOSED", message: state === "not_yet" ? "Choosing has not opened yet." : "Choosing is closed for this term." });
      }
      const previous = (await pool.query<{ company_id: number }>(`SELECT company_id FROM company_choices WHERE student_id = $1 AND term_id = $2`, [auth.id, context.term_id])).rows.map((row) => row.company_id);
      const allowed = new Set((await optionsFor(pool, context.program_id, context.term_id, previous)).map((row) => row.id));
      const refused = ids.find((id) => !allowed.has(id));
      if (refused !== undefined) {
        return res.status(409).json({ code: "NOT_AVAILABLE", message: "One of those companies cannot be chosen: it is full, not approved, or does not take your program." });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM company_choices WHERE student_id = $1 AND term_id = $2`, [auth.id, context.term_id]);
        for (const [index, companyId] of ids.entries()) {
          await client.query(`INSERT INTO company_choices (student_id, term_id, rank, company_id) VALUES ($1, $2, $3, $4)`, [auth.id, context.term_id, index + 1, companyId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return res.json({ message: ids.length ? "Your choices are saved. Your coordinator assigns you." : "Your choices are cleared.", company_ids: ids });
    } catch (error) {
      console.error("SAVE COMPANY CHOICES ERROR:", error);
      return res.status(500).json({ message: "Failed to save your choices." });
    }
  });

  // The coordinator's view of a term: demand against slots, and each student's choices.
  app.get("/api/coordinator/company-choices", requireCoordinator, async (req, res) => {
    try {
      const termId = Number(req.query.term_id);
      if (!Number.isSafeInteger(termId) || termId < 1) return res.status(400).json({ message: "Choose a term." });
      const term = await pool.query<{ name: string; opens: Date | null; closes: Date | null }>(
        `SELECT name, choice_opens_at AS opens, choice_closes_at AS closes FROM terms WHERE id = $1`,
        [termId]
      );
      if (term.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      const scope = scopeCondition("s.student_id", 1);
      const [students, companies] = await Promise.all([
        pool.query(
          `SELECT TRIM(s.student_id::text) AS student_id, s.name, s.company, s.company_id, p.short_code AS program,
                  COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('rank', ch.rank, 'company_id', ch.company_id, 'name', c.name) ORDER BY ch.rank)
                     FROM company_choices ch JOIN companies c ON c.id = ch.company_id
                     WHERE ch.student_id = s.student_id AND ch.term_id = $1), '[]'::json) AS choices
           FROM students s LEFT JOIN programs p ON p.id = s.program_id
           WHERE s.is_active = TRUE AND s.term_id = $1${scope.sql}
           ORDER BY (s.company_id IS NULL) DESC, s.name`,
          [termId, ...scope.values]
        ),
        pool.query(
          `SELECT c.id, c.name, c.slots,
                  (SELECT COUNT(*)::int FROM students p WHERE p.company_id = c.id AND p.is_active = TRUE AND p.term_id = $1) AS placed,
                  (SELECT COUNT(*)::int FROM company_choices ch WHERE ch.company_id = c.id AND ch.term_id = $1 AND ch.rank = 1) AS first_choice,
                  (SELECT COUNT(*)::int FROM company_choices ch WHERE ch.company_id = c.id AND ch.term_id = $1) AS any_choice
           FROM companies c
           WHERE c.is_active = TRUE AND c.status = 'approved'
             AND EXISTS (SELECT 1 FROM company_choices ch WHERE ch.company_id = c.id AND ch.term_id = $1)
           ORDER BY first_choice DESC, LOWER(c.name)`,
          [termId]
        ),
      ]);
      return res.json({
        term: { id: termId, name: term.rows[0].name, window: { opens_at: term.rows[0].opens, closes_at: term.rows[0].closes, state: windowState(term.rows[0].opens, term.rows[0].closes) } },
        companies: companies.rows,
        students: students.rows,
        unassigned: students.rows.filter((row) => row.company_id === null).length,
      });
    } catch (error) {
      console.error("GET CHOICE BOARD ERROR:", error);
      return res.status(500).json({ message: "Failed to load the choices." });
    }
  });

  // Assigns a student to a company (one of their choices, or any): slots and approval checked; the student is told.
  app.post("/api/coordinator/students/:studentId/assign-company", requireCoordinator, async (req, res) => {
    try {
      const studentId = String(req.params.studentId);
      const companyId = Number(req.body?.company_id);
      if (!Number.isSafeInteger(companyId) || companyId < 1) return res.status(400).json({ message: "Choose a company." });
      const company = await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]);
      if (company.rows.length === 0) return res.status(404).json({ message: "Company not found." });
      const name = company.rows[0].name;
      const done = await withPlacement(pool, name, studentId, async (db) =>
        // A supervisor of another company is not this student's any more: the coordinator assigns one there.
        (
          await db.query<{ student_id: string }>(
            `UPDATE students SET company = $2,
                    supervisor_id = CASE
                      WHEN supervisor_id IS NOT NULL
                       AND (SELECT company_id FROM supervisors WHERE supervisor_id = students.supervisor_id) IS DISTINCT FROM $3::int
                      THEN NULL ELSE supervisor_id END
             WHERE student_id = $1 RETURNING student_id`,
            [studentId, name, companyId]
          )
        ).rows[0] ?? null
      );
      if (!done) return res.status(404).json({ message: "Student not found." });
      await createNotification({
        studentId: done.student_id,
        title: "Your agency is assigned",
        message: `Your OJT coordinator assigned you to ${name}.`,
        type: "info",
        link: "/schedule",
      }).catch((error) => console.error("ASSIGN COMPANY NOTIFICATION ERROR:", error));
      return res.json({ message: `Assigned to ${name}. The student has been told.`, company: name });
    } catch (error) {
      if (error instanceof PlacementError) return res.status(409).json({ code: error.code, message: error.message });
      console.error("ASSIGN COMPANY ERROR:", error);
      return res.status(500).json({ message: "Failed to assign the company." });
    }
  });
}
