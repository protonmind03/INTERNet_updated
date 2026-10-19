import type express from "express";
import type { Pool } from "pg";
import { BLOCK_NAME_SQL, loadCatalogue } from "../services/academics";

/*
|--------------------------------------------------------------------------
| COLLEGES, PROGRAMS, MAJORS AND BLOCKS: THE COORDINATOR'S PAGE
|--------------------------------------------------------------------------
|
| Reading the whole structure, and adding to and changing it. Coordinator
| only. Nothing is ever deleted: a row that is no longer wanted is made
| inactive, which takes it out of the pickers and filters and keeps every
| student who was linked to it linked.
|
| Every change is written to the audit log (services/audit.ts).
|
*/

type Dependencies = { pool: Pool; requireCoordinator: express.RequestHandler };

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const has = (body: unknown, field: string) =>
  Object.prototype.hasOwnProperty.call((body ?? {}) as object, field);
const id = (value: unknown): number | null => (/^[0-9]{1,9}$/.test(String(value)) ? Number(value) : null);
/** An optional id in a request body: a number, null for "none", or "bad". */
const optionalId = (value: unknown): number | null | "bad" => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : "bad";
};
const isUnique = (error: unknown) => (error as { code?: string }).code === "23505";

export function registerAcademicRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator } = deps;

  // Everything, inactive rows included, with how many active students each
  // program and block has. The pickers and the filter bar read this too.
  app.get("/api/coordinator/academics", requireCoordinator, async (_req, res) => {
    try {
      const [catalogue, programCounts, blockCounts, without] = await Promise.all([
        loadCatalogue(pool),
        pool.query<{ program_id: number; students: number }>(
          `SELECT program_id, COUNT(*)::int AS students FROM students
           WHERE is_active = TRUE AND program_id IS NOT NULL GROUP BY program_id`
        ),
        pool.query<{ block_id: number; students: number }>(
          `SELECT block_id, COUNT(*)::int AS students FROM students
           WHERE is_active = TRUE AND block_id IS NOT NULL GROUP BY block_id`
        ),
        pool.query<{ no_block: number; no_program: number }>(
          `SELECT COUNT(*) FILTER (WHERE block_id IS NULL)::int AS no_block,
                  COUNT(*) FILTER (WHERE program_id IS NULL)::int AS no_program
           FROM students WHERE is_active = TRUE`
        ),
      ]);
      const inProgram = new Map(programCounts.rows.map((row) => [row.program_id, row.students]));
      const inBlock = new Map(blockCounts.rows.map((row) => [row.block_id, row.students]));
      return res.json({
        colleges: catalogue.colleges,
        programs: catalogue.programs.map((row) => ({ ...row, students: inProgram.get(row.id) ?? 0 })),
        majors: catalogue.majors,
        blocks: catalogue.blocks.map((row) => ({ ...row, students: inBlock.get(row.id) ?? 0 })),
        active_students_without_block: without.rows[0].no_block,
        active_students_without_program: without.rows[0].no_program,
      });
    } catch (error) {
      console.error("GET ACADEMICS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the programs." });
    }
  });

  /*
  | Colleges
  */

  app.post("/api/coordinator/colleges", requireCoordinator, async (req, res) => {
    const name = text(req.body?.name);
    const shortName = text(req.body?.short_name);
    if (name.length < 2 || name.length > 150) {
      return res.status(400).json({ message: "A college's name must be 2 to 150 characters." });
    }
    if (shortName.length > 20) return res.status(400).json({ message: "The short name must be 20 characters or fewer." });
    try {
      const saved = await pool.query(
        `INSERT INTO colleges (name, short_name) VALUES ($1, NULLIF($2, ''))
         RETURNING id, name, short_name, is_active`,
        [name, shortName]
      );
      return res.status(201).json({ message: "College added.", college: saved.rows[0] });
    } catch (error) {
      if (isUnique(error)) return res.status(409).json({ message: "There is already a college with that name." });
      console.error("ADD COLLEGE ERROR:", error);
      return res.status(500).json({ message: "Failed to add the college." });
    }
  });

  app.put("/api/coordinator/colleges/:id", requireCoordinator, async (req, res) => {
    const collegeId = id(req.params.id);
    if (collegeId === null) return res.status(404).json({ message: "College not found." });
    const name = text(req.body?.name);
    const shortName = text(req.body?.short_name);
    if (has(req.body, "name") && (name.length < 2 || name.length > 150)) {
      return res.status(400).json({ message: "A college's name must be 2 to 150 characters." });
    }
    if (shortName.length > 20) return res.status(400).json({ message: "The short name must be 20 characters or fewer." });
    if (has(req.body, "is_active") && typeof req.body.is_active !== "boolean") {
      return res.status(400).json({ message: "Active must be yes or no." });
    }
    try {
      const saved = await pool.query(
        `UPDATE colleges SET
           name = CASE WHEN $2::boolean THEN $3 ELSE name END,
           short_name = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE short_name END,
           is_active = COALESCE($6::boolean, is_active),
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, short_name, is_active`,
        [collegeId, has(req.body, "name"), name, has(req.body, "short_name"), shortName,
          has(req.body, "is_active") ? req.body.is_active : null]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "College not found." });
      return res.json({ message: "College saved.", college: saved.rows[0] });
    } catch (error) {
      if (isUnique(error)) return res.status(409).json({ message: "There is already a college with that name." });
      console.error("EDIT COLLEGE ERROR:", error);
      return res.status(500).json({ message: "Failed to save the college." });
    }
  });

  /*
  | Programs
  */

  const programProblem = (body: unknown, creating: boolean): string | null => {
    const entry = (body ?? {}) as Record<string, unknown>;
    const name = text(entry.name);
    const code = text(entry.short_code);
    if ((creating || has(body, "name")) && (name.length < 2 || name.length > 150)) {
      return "A program's name must be 2 to 150 characters.";
    }
    if ((creating || has(body, "short_code")) && (code.length < 2 || code.length > 20 || /\s/.test(code))) {
      return "A program's short code must be 2 to 20 characters with no spaces, such as BSIT.";
    }
    if ((creating || has(body, "college_id")) && optionalId(entry.college_id) === "bad") return "That is not a college.";
    if (creating && optionalId(entry.college_id) === null) return "Choose the program's college.";
    // The full name printed on the Time Record (migration 068); optional.
    if (has(body, "formal_name") && entry.formal_name !== null && (typeof entry.formal_name !== "string" || entry.formal_name.trim().length > 200)) {
      return "A program's formal name must be at most 200 characters.";
    }
    for (const flag of ["ojt_applies", "is_active"]) {
      if (has(body, flag) && typeof entry[flag] !== "boolean") return `${flag === "ojt_applies" ? "OJT applies" : "Active"} must be yes or no.`;
    }
    return null;
  };
  const programConflict = (error: unknown): string | null => {
    if (!isUnique(error)) return null;
    return String((error as { constraint?: string }).constraint).includes("short_code")
      ? "Another program already has that short code."
      : "There is already a program with that name.";
  };

  app.post("/api/coordinator/programs", requireCoordinator, async (req, res) => {
    const problem = programProblem(req.body, true);
    if (problem) return res.status(400).json({ message: problem });
    try {
      const college = await pool.query(`SELECT 1 FROM colleges WHERE id = $1`, [Number(req.body.college_id)]);
      if (college.rows.length === 0) return res.status(400).json({ message: "That college does not exist." });
      const saved = await pool.query(
        `INSERT INTO programs (college_id, name, short_code, ojt_applies, formal_name)
         VALUES ($1, $2, $3, COALESCE($4::boolean, TRUE), NULLIF($5, ''))
         RETURNING id, college_id, name, short_code, formal_name, ojt_applies, is_active`,
        [Number(req.body.college_id), text(req.body.name), text(req.body.short_code),
          has(req.body, "ojt_applies") ? req.body.ojt_applies : null, text(req.body.formal_name)]
      );
      return res.status(201).json({ message: "Program added.", program: saved.rows[0] });
    } catch (error) {
      const conflict = programConflict(error);
      if (conflict) return res.status(409).json({ message: conflict });
      console.error("ADD PROGRAM ERROR:", error);
      return res.status(500).json({ message: "Failed to add the program." });
    }
  });

  app.put("/api/coordinator/programs/:id", requireCoordinator, async (req, res) => {
    const programId = id(req.params.id);
    if (programId === null) return res.status(404).json({ message: "Program not found." });
    const problem = programProblem(req.body, false);
    if (problem) return res.status(400).json({ message: problem });
    try {
      if (has(req.body, "college_id")) {
        if (optionalId(req.body.college_id) === null) return res.status(400).json({ message: "A program must have a college." });
        const college = await pool.query(`SELECT 1 FROM colleges WHERE id = $1`, [Number(req.body.college_id)]);
        if (college.rows.length === 0) return res.status(400).json({ message: "That college does not exist." });
      }
      const saved = await pool.query(
        `UPDATE programs SET
           name = CASE WHEN $2::boolean THEN $3 ELSE name END,
           short_code = CASE WHEN $4::boolean THEN $5 ELSE short_code END,
           college_id = COALESCE($6::int, college_id),
           ojt_applies = COALESCE($7::boolean, ojt_applies),
           is_active = COALESCE($8::boolean, is_active),
           formal_name = CASE WHEN $9::boolean THEN NULLIF($10, '') ELSE formal_name END,
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, college_id, name, short_code, formal_name, ojt_applies, is_active`,
        [programId, has(req.body, "name"), text(req.body?.name), has(req.body, "short_code"), text(req.body?.short_code),
          has(req.body, "college_id") ? Number(req.body.college_id) : null,
          has(req.body, "ojt_applies") ? req.body.ojt_applies : null,
          has(req.body, "is_active") ? req.body.is_active : null,
          has(req.body, "formal_name"), text(req.body?.formal_name)]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Program not found." });
      return res.json({ message: "Program saved.", program: saved.rows[0] });
    } catch (error) {
      const conflict = programConflict(error);
      if (conflict) return res.status(409).json({ message: conflict });
      console.error("EDIT PROGRAM ERROR:", error);
      return res.status(500).json({ message: "Failed to save the program." });
    }
  });

  /*
  | Majors and specializations
  */

  app.post("/api/coordinator/majors", requireCoordinator, async (req, res) => {
    const name = text(req.body?.name);
    const programId = optionalId(req.body?.program_id);
    if (programId === "bad" || programId === null) return res.status(400).json({ message: "Choose the major's program." });
    if (name.length < 2 || name.length > 150) return res.status(400).json({ message: "A major's name must be 2 to 150 characters." });
    try {
      const program = await pool.query(`SELECT 1 FROM programs WHERE id = $1`, [programId]);
      if (program.rows.length === 0) return res.status(400).json({ message: "That program does not exist." });
      const saved = await pool.query(
        `INSERT INTO majors (program_id, name) VALUES ($1, $2) RETURNING id, program_id, name, is_active`,
        [programId, name]
      );
      return res.status(201).json({ message: "Major added.", major: saved.rows[0] });
    } catch (error) {
      if (isUnique(error)) return res.status(409).json({ message: "That program already has a major with that name." });
      console.error("ADD MAJOR ERROR:", error);
      return res.status(500).json({ message: "Failed to add the major." });
    }
  });

  app.put("/api/coordinator/majors/:id", requireCoordinator, async (req, res) => {
    const majorId = id(req.params.id);
    if (majorId === null) return res.status(404).json({ message: "Major not found." });
    const name = text(req.body?.name);
    if (has(req.body, "name") && (name.length < 2 || name.length > 150)) {
      return res.status(400).json({ message: "A major's name must be 2 to 150 characters." });
    }
    if (has(req.body, "is_active") && typeof req.body.is_active !== "boolean") {
      return res.status(400).json({ message: "Active must be yes or no." });
    }
    try {
      const saved = await pool.query(
        `UPDATE majors SET
           name = CASE WHEN $2::boolean THEN $3 ELSE name END,
           is_active = COALESCE($4::boolean, is_active),
           updated_at = NOW()
         WHERE id = $1 RETURNING id, program_id, name, is_active`,
        [majorId, has(req.body, "name"), name, has(req.body, "is_active") ? req.body.is_active : null]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Major not found." });
      return res.json({ message: "Major saved.", major: saved.rows[0] });
    } catch (error) {
      if (isUnique(error)) return res.status(409).json({ message: "That program already has a major with that name." });
      console.error("EDIT MAJOR ERROR:", error);
      return res.status(500).json({ message: "Failed to save the major." });
    }
  });

  /*
  | Blocks
  */

  type BlockFields = { major_id: number | null; year_level: number; section: string; term_id: number | null };

  /** Reads a block's fields, or says what is wrong. `current` fills in what an edit left out. */
  async function blockFields(
    body: unknown,
    programId: number,
    current?: BlockFields
  ): Promise<{ problem: string } | BlockFields> {
    const entry = (body ?? {}) as Record<string, unknown>;
    const majorId = has(body, "major_id") ? optionalId(entry.major_id) : (current?.major_id ?? null);
    const termId = has(body, "term_id") ? optionalId(entry.term_id) : (current?.term_id ?? null);
    const year = has(body, "year_level") ? Number(entry.year_level) : current?.year_level;
    const section = has(body, "section") ? text(entry.section).toUpperCase() : current?.section;
    if (majorId === "bad") return { problem: "That is not a major." };
    if (termId === "bad") return { problem: "That is not a term." };
    if (!Number.isInteger(year) || (year as number) < 1 || (year as number) > 6) {
      return { problem: "The year level must be a whole number from 1 to 6." };
    }
    if (!section || section.length > 10 || !/^[A-Z0-9-]+$/.test(section)) {
      return { problem: "The section must be 1 to 10 letters or digits, such as A." };
    }
    if (majorId !== null) {
      const major = await pool.query(`SELECT 1 FROM majors WHERE id = $1 AND program_id = $2`, [majorId, programId]);
      if (major.rows.length === 0) return { problem: "That major is not one of this program's." };
    }
    if (termId !== null) {
      const term = await pool.query<{ is_closed: boolean }>(`SELECT is_closed FROM terms WHERE id = $1`, [termId]);
      if (term.rows.length === 0) return { problem: "That term does not exist." };
      if (term.rows[0].is_closed && termId !== current?.term_id) {
        return { problem: "That term is closed. Reopen it before giving it a block." };
      }
    }
    return { major_id: majorId, year_level: year as number, section, term_id: termId };
  }

  const blockRow = (blockId: number) =>
    pool.query(
      `SELECT b.id, b.program_id, b.major_id, b.year_level, UPPER(TRIM(b.section)) AS section,
              b.term_id, b.is_active, ${BLOCK_NAME_SQL} AS name
       FROM blocks b JOIN programs p ON p.id = b.program_id WHERE b.id = $1`,
      [blockId]
    );

  app.post("/api/coordinator/blocks", requireCoordinator, async (req, res) => {
    const programId = optionalId(req.body?.program_id);
    if (programId === "bad" || programId === null) return res.status(400).json({ message: "Choose the block's program." });
    try {
      const program = await pool.query(`SELECT 1 FROM programs WHERE id = $1`, [programId]);
      if (program.rows.length === 0) return res.status(400).json({ message: "That program does not exist." });
      // A new block has no year or section until they are sent.
      const fields = await blockFields(
        { major_id: null, term_id: null, ...(req.body ?? {}) },
        programId
      );
      if ("problem" in fields) return res.status(400).json({ message: fields.problem });
      const saved = await pool.query<{ id: number }>(
        `INSERT INTO blocks (program_id, major_id, year_level, section, term_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [programId, fields.major_id, fields.year_level, fields.section, fields.term_id]
      );
      const block = (await blockRow(saved.rows[0].id)).rows[0];
      return res.status(201).json({ message: `Block ${block.name} added.`, block });
    } catch (error) {
      if (isUnique(error)) {
        return res.status(409).json({ message: "That program already has that block for that term." });
      }
      console.error("ADD BLOCK ERROR:", error);
      return res.status(500).json({ message: "Failed to add the block." });
    }
  });

  app.put("/api/coordinator/blocks/:id", requireCoordinator, async (req, res) => {
    const blockId = id(req.params.id);
    if (blockId === null) return res.status(404).json({ message: "Block not found." });
    if (has(req.body, "is_active") && typeof req.body.is_active !== "boolean") {
      return res.status(400).json({ message: "Active must be yes or no." });
    }
    try {
      const current = await pool.query<BlockFields & { program_id: number }>(
        `SELECT program_id, major_id, year_level, UPPER(TRIM(section)) AS section, term_id FROM blocks WHERE id = $1`,
        [blockId]
      );
      if (current.rows.length === 0) return res.status(404).json({ message: "Block not found." });
      const fields = await blockFields(req.body, current.rows[0].program_id, current.rows[0]);
      if ("problem" in fields) return res.status(400).json({ message: fields.problem });
      await pool.query(
        `UPDATE blocks SET major_id = $2, year_level = $3, section = $4, term_id = $5,
                is_active = COALESCE($6::boolean, is_active), updated_at = NOW()
         WHERE id = $1`,
        [blockId, fields.major_id, fields.year_level, fields.section, fields.term_id,
          has(req.body, "is_active") ? req.body.is_active : null]
      );
      const block = (await blockRow(blockId)).rows[0];
      return res.json({ message: `Block ${block.name} saved.`, block });
    } catch (error) {
      if (isUnique(error)) {
        return res.status(409).json({ message: "That program already has that block for that term." });
      }
      console.error("EDIT BLOCK ERROR:", error);
      return res.status(500).json({ message: "Failed to save the block." });
    }
  });

  // Who is in a block, and who could be added: active students with no
  // block who are of the block's program, or not yet linked to any program.
  app.get("/api/coordinator/blocks/:id/students", requireCoordinator, async (req, res) => {
    const blockId = id(req.params.id);
    if (blockId === null) return res.status(404).json({ message: "Block not found." });
    try {
      const block = await blockRow(blockId);
      if (block.rows.length === 0) return res.status(404).json({ message: "Block not found." });
      const [members, candidates] = await Promise.all([
        pool.query(
          `SELECT student_id, name, program, is_active FROM students WHERE block_id = $1 ORDER BY name`,
          [blockId]
        ),
        pool.query(
          `SELECT student_id, name, program, (program_id IS NULL) AS unlinked FROM students
           WHERE is_active = TRUE AND block_id IS NULL AND (program_id = $1 OR program_id IS NULL)
           ORDER BY (program_id IS NULL), name`,
          [block.rows[0].program_id]
        ),
      ]);
      return res.json({ block: block.rows[0], students: members.rows, candidates: candidates.rows });
    } catch (error) {
      console.error("GET BLOCK STUDENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the block's students." });
    }
  });

  // Puts students in a block. A student of another program is not moved:
  // their program is changed on their own form first.
  app.post("/api/coordinator/blocks/:id/students", requireCoordinator, async (req, res) => {
    const blockId = id(req.params.id);
    if (blockId === null) return res.status(404).json({ message: "Block not found." });
    const listed: unknown = req.body?.student_ids;
    if (!Array.isArray(listed) || listed.length === 0 || listed.length > 1000) {
      return res.status(400).json({ message: "Choose the students to add to the block." });
    }
    if (listed.some((value) => typeof value !== "string" || !value.trim() || value.length > 50)) {
      return res.status(400).json({ message: "That list of students is not readable." });
    }
    try {
      const block = await pool.query<{ program_id: number; major_id: number | null; is_active: boolean; program_name: string; name: string }>(
        `SELECT b.program_id, b.major_id, b.is_active, p.name AS program_name, ${BLOCK_NAME_SQL} AS name
         FROM blocks b JOIN programs p ON p.id = b.program_id WHERE b.id = $1`,
        [blockId]
      );
      if (block.rows.length === 0) return res.status(404).json({ message: "Block not found." });
      if (!block.rows[0].is_active) {
        return res.status(409).json({ message: "That block is inactive. Make it active before adding students." });
      }
      const ids = (listed as string[]).map((value) => value.trim());
      // The program is set with the block, so the student is linked to it;
      // the text on an account that had none becomes the program's name.
      const moved = await pool.query(
        `UPDATE students SET
           block_id = $1,
           program_id = $2,
           major_id = COALESCE($3::int, CASE WHEN program_id = $2 THEN major_id END),
           program = CASE WHEN program IS NULL OR TRIM(program) = '' THEN $4 ELSE program END
         WHERE student_id = ANY($5::text[]) AND (program_id IS NULL OR program_id = $2)`,
        [blockId, block.rows[0].program_id, block.rows[0].major_id, block.rows[0].program_name, ids]
      );
      const count = moved.rowCount ?? 0;
      const skipped = ids.length - count;
      return res.json({
        message:
          `${count} student${count === 1 ? "" : "s"} added to ${block.rows[0].name}.` +
          (skipped > 0
            ? ` ${skipped} ${skipped === 1 ? "was" : "were"} left out: not found, or in another program.`
            : ""),
        count,
        skipped,
      });
    } catch (error) {
      console.error("ADD BLOCK STUDENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to add the students to the block." });
    }
  });
}
