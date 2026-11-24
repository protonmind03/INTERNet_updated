import type express from "express";
import type { Pool } from "pg";
import { scopeCondition } from "../services/coordinatorScope";
import {
  GRADE_COLUMNS,
  GRADE_JOINS,
  SCORE_KEYS,
  gradeOf,
  gradeSplit,
  logsSuggestion,
  punctualitySuggestion,
  readScore,
  readWeights,
  weightsOf,
  type GradeRow,
  type Scores,
} from "../services/finalGrade";
import { sameId } from "../services/ids";
import { bindFilters, filterConditions, readStudentFilters } from "../services/studentScope";

/*
|--------------------------------------------------------------------------
| THE INSTRUCTOR'S EVALUATION AND THE FINAL GRADE (Phase 1.5)
|--------------------------------------------------------------------------
|
| services/finalGrade.ts does the arithmetic. Here:
|
|   the grade sheet         every student the filters leave (a program, a
|                           block), with HTE, instructor and final
|   one student's grade     the breakdown and the two suggestions
|   the instructor's form   the coordinator's four scores
|   release / withdraw      what the student is shown, and when
|   the term's weights      the office's (the Director, or the coordinators
|                           until a Director exists), like the split
|   the student's own       their final grade, once it is released
|
| A scoped coordinator sees and releases only their students: the shared
| filters carry the scope, :studentId outside it is a 404 (server.ts), and
| a release names students only through scopeCondition.
|
*/

type Role = "student" | "supervisor" | "coordinator" | "director";
type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  requireStaff: express.RequestHandler;
  requireOffice: express.RequestHandler;
  createNotification: (options: { studentId?: string | null; title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
};

const MAX_RELEASE = 500;

export function registerFinalGradeRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator, requireStaff, requireOffice, createNotification } = deps;

  const oneStudent = async (studentId: string) => {
    const found = await pool.query<GradeRow>(
      `SELECT ${GRADE_COLUMNS} FROM students s ${GRADE_JOINS} WHERE TRIM(s.student_id::text) = TRIM($1)`,
      [studentId]
    );
    return found.rows[0] ?? null;
  };

  // The grade sheet: the students the filters leave, with both halves and the final.
  app.get("/api/coordinator/grade-sheet", requireStaff, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const bound = bindFilters(
        `SELECT ${GRADE_COLUMNS} FROM students s ${GRADE_JOINS}
         WHERE s.is_active = TRUE${filterConditions(read.filters, "s")}
         ORDER BY p.short_code NULLS LAST, s.name, s.student_id
         LIMIT 2000`,
        [],
        read.filters
      );
      const [rows, split] = await Promise.all([pool.query<GradeRow>(bound.text, bound.values), gradeSplit(pool)]);
      const students = rows.rows.map((row) => gradeOf(row, split));
      return res.json({
        split,
        students,
        counts: {
          students: students.length,
          final: students.filter((row) => row.state === "final").length,
          released: students.filter((row) => row.released_at !== null).length,
          waiting_hte: students.filter((row) => row.state === "waiting_hte" || row.state === "waiting_both").length,
          waiting_instructor: students.filter((row) => row.state === "waiting_instructor" || row.state === "waiting_both").length,
        },
      });
    } catch (error) {
      console.error("GET GRADE SHEET ERROR:", error);
      return res.status(500).json({ message: "Failed to load the grade sheet." });
    }
  });

  // One student's grade: the breakdown, and the two suggestions for the instructor's form.
  app.get("/api/coordinator/students/:studentId/final-grade", requireStaff, async (req, res) => {
    try {
      const studentId = String(req.params.studentId);
      const row = await oneStudent(studentId);
      if (!row) return res.status(404).json({ message: "Student not found." });
      const [split, punctuality, logs] = await Promise.all([gradeSplit(pool), punctualitySuggestion(pool, studentId), logsSuggestion(pool, studentId)]);
      return res.json({ split, grade: gradeOf(row, split), suggestions: { punctuality, logs } });
    } catch (error) {
      console.error("GET FINAL GRADE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the grade." });
    }
  });

  // The instructor's evaluation: four scores out of 100 and remarks. A save names the version it was made from.
  app.put("/api/coordinator/students/:studentId/instructor-evaluation", requireCoordinator, async (req, res) => {
    try {
      const studentId = String(req.params.studentId);
      const scores = {} as Scores;
      for (const key of SCORE_KEYS) {
        const score = readScore(req.body?.[key]);
        if (score === null) return res.status(400).json({ message: `Give ${key} a score from 0 to 100, with at most 2 decimals.` });
        scores[key] = score;
      }
      const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim() : "";
      if (remarks.length > 2000) return res.status(400).json({ message: "Keep the remarks to 2000 characters." });
      const version = req.body?.version === undefined || req.body?.version === null ? null : Number(req.body.version);

      const student = await pool.query<{ student_id: string; term_id: number | null; is_active: boolean }>(
        `SELECT TRIM(student_id::text) AS student_id, term_id, is_active FROM students WHERE TRIM(student_id::text) = TRIM($1)`,
        [studentId]
      );
      if (student.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      const { student_id: id, term_id: termId } = student.rows[0];

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ version: number; logs_score: string; punctuality_score: string; preparation_score: string; conduct_score: string }>(
          `SELECT version, logs_score, punctuality_score, preparation_score, conduct_score FROM instructor_evaluations
           WHERE student_id = $1 AND COALESCE(term_id, 0) = COALESCE($2::int, 0) FOR UPDATE`,
          [id, termId]
        );
        const before = existing.rows[0] ?? null;
        if (before && version !== before.version) {
          await client.query("ROLLBACK");
          return res.status(409).json({ code: "STALE", message: "Someone saved this evaluation after you opened it. It is reloaded; check it before saving again." });
        }
        const saved = before
          ? await client.query(
              `UPDATE instructor_evaluations
               SET logs_score = $3, punctuality_score = $4, preparation_score = $5, conduct_score = $6, remarks = $7,
                   evaluator_id = $8, submitted_at = NOW(), version = version + 1
               WHERE student_id = $1 AND COALESCE(term_id, 0) = COALESCE($2::int, 0)
               RETURNING version`,
              [id, termId, scores.logs, scores.punctuality, scores.preparation, scores.conduct, remarks || null, (req as Authed).auth!.id]
            )
          : await client.query(
              `INSERT INTO instructor_evaluations (student_id, term_id, evaluator_id, logs_score, punctuality_score, preparation_score, conduct_score, remarks)
               VALUES ($1, $2, $8, $3, $4, $5, $6, $7) RETURNING version`,
              [id, termId, scores.logs, scores.punctuality, scores.preparation, scores.conduct, remarks || null, (req as Authed).auth!.id]
            );
        await client.query("COMMIT");
        const split = await gradeSplit(pool);
        const row = await oneStudent(id);
        return res.status(before ? 200 : 201).json({
          message: before ? "Instructor evaluation updated." : "Instructor evaluation saved.",
          version: saved.rows[0].version,
          old: before
            ? { logs: Number(before.logs_score), punctuality: Number(before.punctuality_score), preparation: Number(before.preparation_score), conduct: Number(before.conduct_score) }
            : null,
          value: scores,
          grade: row ? gradeOf(row, split) : null,
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("SAVE INSTRUCTOR EVALUATION ERROR:", error);
      return res.status(500).json({ message: "Failed to save the instructor evaluation." });
    }
  });

  /*
  | Release: the students named whose grade is final are given it, as it is
  | now; the rest are left and counted. Released again after a change, the
  | student is given the new grade.
  */
  app.post("/api/coordinator/grades/release", requireStaff, async (req, res) => {
    try {
      const given: unknown[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
      const ids = [...new Set(given.filter((id): id is string => typeof id === "string" && id.trim() !== "").map((id) => id.trim()))];
      if (ids.length === 0 || ids.length > MAX_RELEASE) {
        return res.status(400).json({ message: `Choose 1 to ${MAX_RELEASE} students to release grades for.` });
      }
      const scope = scopeCondition("s.student_id", 1);
      const [rows, split] = await Promise.all([
        pool.query<GradeRow>(
          `SELECT ${GRADE_COLUMNS} FROM students s ${GRADE_JOINS}
           WHERE TRIM(s.student_id::text) = ANY($1::text[])${scope.sql}`,
          [ids, ...scope.values]
        ),
        gradeSplit(pool),
      ]);
      const grades = rows.rows.map((row) => gradeOf(row, split));
      const ready = grades.filter((row) => row.state === "final" && (row.released_at === null || row.changed_since_release));
      const auth = (req as Authed).auth!;
      const done: typeof ready = [];
      for (const row of ready) {
        // Only as read: a save in between (a new version) leaves it for the next release.
        const updated = await pool.query(
          `UPDATE instructor_evaluations ie SET released_at = NOW(), released_by = $3, released_grade = $4
           FROM students s
           WHERE s.student_id = ie.student_id AND TRIM(s.student_id::text) = $1
             AND COALESCE(ie.term_id, 0) = COALESCE(s.term_id, 0) AND $2::int IS NOT DISTINCT FROM ie.version`,
          [row.student_id, row.version, auth.id, row.final]
        );
        if (!updated.rowCount) continue;
        done.push(row);
        await createNotification({
          studentId: row.student_id,
          title: "Final grade released",
          message: `Your final OJT grade is ${row.final!.toFixed(2)}.`,
          type: "evaluation",
          link: "/student/resolution?tab=evaluation",
        }).catch((error) => console.error("GRADE RELEASE NOTIFICATION ERROR:", error));
      }
      const notFound = ids.length - grades.length;
      const waiting = grades.filter((row) => row.state !== "final").length;
      const already = grades.length - waiting - ready.length;
      return res.json({
        message: `Grades released for ${done.length} ${done.length === 1 ? "student" : "students"}.`,
        released: done.map((row) => ({ student_id: row.student_id, grade: row.final })),
        left: { waiting, already_released: already, not_found: notFound, changed_meanwhile: ready.length - done.length },
      });
    } catch (error) {
      console.error("RELEASE GRADES ERROR:", error);
      return res.status(500).json({ message: "Failed to release the grades." });
    }
  });

  // Takes a released grade back: the student no longer sees it until it is released again.
  app.post("/api/coordinator/students/:studentId/grade/withdraw", requireStaff, async (req, res) => {
    try {
      const done = await pool.query(
        `UPDATE instructor_evaluations ie SET released_at = NULL, released_by = NULL, released_grade = NULL
         FROM students s
         WHERE s.student_id = ie.student_id AND TRIM(s.student_id::text) = TRIM($1)
           AND COALESCE(ie.term_id, 0) = COALESCE(s.term_id, 0) AND ie.released_at IS NOT NULL
         RETURNING ie.id`,
        [String(req.params.studentId)]
      );
      if (done.rows.length === 0) return res.status(404).json({ message: "This student has no released grade." });
      return res.json({ message: "Release withdrawn. The student no longer sees the grade." });
    } catch (error) {
      console.error("WITHDRAW GRADE ERROR:", error);
      return res.status(500).json({ message: "Failed to withdraw the release." });
    }
  });

  // The term's weights for the instructor's four scores.
  app.put("/api/coordinator/terms/:termId/grade-weights", requireOffice, async (req, res) => {
    try {
      const termId = Number(req.params.termId);
      if (!Number.isSafeInteger(termId) || termId < 1) return res.status(404).json({ message: "Term not found." });
      const weights = readWeights(req.body?.weights);
      if ("problem" in weights) return res.status(400).json({ message: weights.problem });
      const old = await pool.query<{ grade_weights: unknown; name: string }>(`SELECT grade_weights, name FROM terms WHERE id = $1`, [termId]);
      if (old.rows.length === 0) return res.status(404).json({ message: "Term not found." });
      await pool.query(`UPDATE terms SET grade_weights = $2::jsonb WHERE id = $1`, [termId, JSON.stringify(weights)]);
      return res.json({ message: `Weights saved for ${old.rows[0].name}.`, old: weightsOf(old.rows[0].grade_weights), value: weights });
    } catch (error) {
      console.error("SAVE GRADE WEIGHTS ERROR:", error);
      return res.status(500).json({ message: "Failed to save the weights." });
    }
  });

  // The student's own final grade: only once it is released, and only as released.
  app.get("/api/students/:studentId/final-grade", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own grade." });
      const found = await pool.query<{ released_at: Date; released_grade: string }>(
        `SELECT ie.released_at, ie.released_grade FROM instructor_evaluations ie
         JOIN students s ON s.student_id = ie.student_id AND COALESCE(ie.term_id, 0) = COALESCE(s.term_id, 0)
         WHERE TRIM(s.student_id::text) = TRIM($1) AND ie.released_at IS NOT NULL`,
        [auth.id]
      );
      const row = found.rows[0];
      return res.json(row ? { released: true, grade: Number(row.released_grade), released_at: row.released_at } : { released: false });
    } catch (error) {
      console.error("GET OWN FINAL GRADE ERROR:", error);
      return res.status(500).json({ message: "Failed to load your grade." });
    }
  });
}
