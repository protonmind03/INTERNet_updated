import type express from "express";
import type { Pool } from "pg";
import { sameId } from "../services/ids";
import { phToday } from "../services/phTime";
import {
  FEEDBACK_CRITERIA,
  FEEDBACK_SCALE,
  NARRATIVE_PARTS,
  calendarDay,
  isNarrativePart,
  mondayOfDay,
  monthStart,
  readDaySummary,
  readEntry,
  readFeedbackForm,
  readMonth,
  readNarrativeText,
} from "../services/traineeRecord";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S OJT RECORD: THE ROUTES (revisions, November 2026)
|--------------------------------------------------------------------------
|
| What the trainee writes towards the PSU narrative report (migration 073;
| the rules are in services/traineeRecord.ts):
|
|   the Student-Intern's Feedback Form (FM-AA-INT-20)
|       GET/PUT  /api/students/:studentId/feedback-form
|
|   progress reports: a report for each day, with events and their
|   pictures (attachments, owner 'report_entry'), and the trainee's words
|   for each month. The weekly report stays where it was (/api/journals).
|       GET      /api/students/:studentId/daily-reports?from=&to=
|       PUT      /api/students/:studentId/daily-reports/:date
|       POST     /api/students/:studentId/daily-reports/:date/entries
|       PUT      /api/students/:studentId/report-entries/:entryId
|       DELETE   /api/students/:studentId/report-entries/:entryId
|       GET      /api/students/:studentId/monthly-reports
|       PUT      /api/students/:studentId/monthly-reports/:month
|
|   the parts of the narrative report the trainee writes
|       GET      /api/students/:studentId/narrative
|       PUT      /api/students/:studentId/narrative/:part
|
| WHO: the trainee writes their own and nobody else's. Their supervisor and
| coordinators may read. A day can be changed until its week's weekly
| report has been reviewed, and never ahead of today.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
};

const ENTRY_COLUMNS = `e.id::int AS id, e.report_id::int AS report_id, TO_CHAR(e.happened_at, 'HH24:MI') AS happened_at,
  e.title, e.details, e.created_at, e.updated_at,
  (SELECT COUNT(*)::int FROM attachments px WHERE px.owner_type = 'report_entry' AND px.owner_id = e.id AND px.removed_at IS NULL) AS pictures`;

const REPORT_COLUMNS = `r.id::int AS id, TO_CHAR(r.report_date, 'YYYY-MM-DD') AS report_date, r.summary, r.created_at, r.updated_at`;

export function registerTraineeRecordRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole } = deps;
  const anyone = requireRole(["student", "supervisor", "coordinator"]);
  const trainee = requireRole("student");

  /** Whether this signed-in person may read this student's record. */
  async function mayRead(req: express.Request, studentId: string): Promise<boolean> {
    const auth = (req as Authed).auth!;
    if (auth.role === "coordinator") return true;
    if (auth.role === "student") return sameId(auth.id, studentId);
    const found = await pool.query<{ supervisor_id: string | null }>(`SELECT supervisor_id FROM students WHERE student_id = $1`, [studentId]);
    return found.rows.length > 0 && sameId(found.rows[0].supervisor_id, auth.id);
  }

  /** The trainee themself, or a 403 already sent. */
  function ownRecord(req: express.Request, res: express.Response): string | null {
    const auth = (req as Authed).auth!;
    if (!sameId(auth.id, req.params.studentId)) {
      res.status(403).json({ message: "You can only change your own record." });
      return null;
    }
    return auth.id;
  }

  /** Why a day's report cannot be changed now, or null when it can. */
  async function dayClosed(studentId: string, day: string): Promise<string | null> {
    if (day > phToday()) return "A report can't be written for a day that hasn't come yet.";
    const reviewed = await pool.query(
      `SELECT 1 FROM journals WHERE student_id = $1 AND week_start = $2 AND status = 'Reviewed'`,
      [studentId, mondayOfDay(day)]
    );
    return reviewed.rows.length > 0 ? "That week's weekly report has been reviewed, so its days can no longer change." : null;
  }

  /* ---------- The Student-Intern's Feedback Form ---------- */

  app.get("/api/students/:studentId/feedback-form", anyone, async (req, res) => {
    try {
      if (!(await mayRead(req, String(req.params.studentId)))) return res.status(403).json({ message: "You can't read this student's feedback form." });
      const found = await pool.query(
        `SELECT ratings, problems_met, other_concerns, submitted_at, updated_at FROM student_feedback_forms WHERE student_id = $1`,
        [req.params.studentId]
      );
      return res.json({ form: found.rows[0] ?? null, criteria: FEEDBACK_CRITERIA, scale: FEEDBACK_SCALE });
    } catch (error) {
      console.error("GET FEEDBACK FORM ERROR:", error);
      return res.status(500).json({ message: "Failed to load the feedback form." });
    }
  });

  app.put("/api/students/:studentId/feedback-form", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const form = readFeedbackForm(req.body);
      if ("problem" in form) return res.status(400).json({ message: form.problem });
      const saved = await pool.query(
        `INSERT INTO student_feedback_forms AS f (student_id, ratings, problems_met, other_concerns, submitted_at)
         VALUES ($1, $2::jsonb, $3, $4, CASE WHEN $5 THEN NOW() END)
         ON CONFLICT (student_id) DO UPDATE SET
           ratings = EXCLUDED.ratings,
           problems_met = EXCLUDED.problems_met,
           other_concerns = EXCLUDED.other_concerns,
           submitted_at = COALESCE(f.submitted_at, EXCLUDED.submitted_at),
           updated_at = NOW()
         RETURNING ratings, problems_met, other_concerns, submitted_at, updated_at`,
        [studentId, JSON.stringify(form.ratings), form.problems_met, form.other_concerns, form.submit]
      );
      return res.json({ message: form.submit ? "Feedback form submitted." : "Draft saved.", form: saved.rows[0] });
    } catch (error) {
      console.error("SAVE FEEDBACK FORM ERROR:", error);
      return res.status(500).json({ message: "Failed to save the feedback form." });
    }
  });

  /* ---------- Daily reports and their events ---------- */

  app.get("/api/students/:studentId/daily-reports", anyone, async (req, res) => {
    try {
      if (!(await mayRead(req, String(req.params.studentId)))) return res.status(403).json({ message: "You can't read this student's reports." });
      const today = phToday();
      const to = calendarDay(req.query.to) ?? today;
      const fallbackFrom = new Date(`${to}T00:00:00Z`);
      fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - 62);
      const from = calendarDay(req.query.from) ?? fallbackFrom.toISOString().slice(0, 10);
      if (from > to) return res.status(400).json({ message: "The start of the range is after its end." });
      const reports = await pool.query(
        `SELECT ${REPORT_COLUMNS} FROM daily_reports r
         WHERE r.student_id = $1 AND r.report_date BETWEEN $2 AND $3 ORDER BY r.report_date DESC`,
        [req.params.studentId, from, to]
      );
      const ids = reports.rows.map((row) => row.id);
      const entries = ids.length
        ? await pool.query(
            `SELECT ${ENTRY_COLUMNS} FROM daily_report_entries e
             WHERE e.report_id = ANY($1::int[]) AND e.removed_at IS NULL
             ORDER BY e.happened_at NULLS LAST, e.id`,
            [ids]
          )
        : { rows: [] as Array<{ report_id: number }> };
      const reviewed = await pool.query<{ week_start: string }>(
        `SELECT TO_CHAR(week_start, 'YYYY-MM-DD') AS week_start FROM journals
         WHERE student_id = $1 AND status = 'Reviewed' AND week_start BETWEEN $2::date - 6 AND $3`,
        [req.params.studentId, from, to]
      );
      return res.json({
        from,
        to,
        today,
        reports: reports.rows.map((report) => ({ ...report, entries: entries.rows.filter((entry) => entry.report_id === report.id) })),
        // Weeks whose days can no longer change.
        closed_weeks: reviewed.rows.map((row) => row.week_start),
      });
    } catch (error) {
      console.error("GET DAILY REPORTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the daily reports." });
    }
  });

  /** The day's report row, made if it is not there yet. */
  async function dayReport(studentId: string, day: string): Promise<{ id: number }> {
    const made = await pool.query<{ id: number }>(
      `INSERT INTO daily_reports (student_id, report_date) VALUES ($1, $2)
       ON CONFLICT (student_id, report_date) DO UPDATE SET updated_at = daily_reports.updated_at
       RETURNING id::int AS id`,
      [studentId, day]
    );
    return made.rows[0];
  }

  app.put("/api/students/:studentId/daily-reports/:date", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const day = calendarDay(req.params.date);
      if (!day) return res.status(400).json({ message: "Give the day as YYYY-MM-DD." });
      const closed = await dayClosed(studentId, day);
      if (closed) return res.status(409).json({ message: closed });
      const input = readDaySummary(req.body);
      if ("problem" in input) return res.status(400).json({ message: input.problem });
      const saved = await pool.query(
        `INSERT INTO daily_reports AS r (student_id, report_date, summary) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, report_date) DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()
         RETURNING ${REPORT_COLUMNS}`,
        [studentId, day, input.summary]
      );
      return res.json({ message: "Saved.", report: saved.rows[0] });
    } catch (error) {
      console.error("SAVE DAILY REPORT ERROR:", error);
      return res.status(500).json({ message: "Failed to save the day's report." });
    }
  });

  app.post("/api/students/:studentId/daily-reports/:date/entries", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const day = calendarDay(req.params.date);
      if (!day) return res.status(400).json({ message: "Give the day as YYYY-MM-DD." });
      const closed = await dayClosed(studentId, day);
      if (closed) return res.status(409).json({ message: closed });
      const input = readEntry(req.body);
      if ("problem" in input) return res.status(400).json({ message: input.problem });
      const report = await dayReport(studentId, day);
      const added = await pool.query(
        `WITH e AS (
           INSERT INTO daily_report_entries (report_id, student_id, happened_at, title, details)
           VALUES ($1, $2, $3::time, $4, $5) RETURNING *
         )
         SELECT ${ENTRY_COLUMNS} FROM e`,
        [report.id, studentId, input.happened_at, input.title, input.details]
      );
      return res.status(201).json({ message: "Event added.", entry: added.rows[0] });
    } catch (error) {
      console.error("ADD REPORT ENTRY ERROR:", error);
      return res.status(500).json({ message: "Failed to add the event." });
    }
  });

  /** The event, if it is this trainee's and still there; with its day. */
  async function ownEntry(studentId: string, entryId: string): Promise<{ id: number; day: string } | null> {
    if (!/^[0-9]{1,9}$/.test(entryId)) return null;
    const found = await pool.query<{ id: number; day: string }>(
      `SELECT e.id::int AS id, TO_CHAR(r.report_date, 'YYYY-MM-DD') AS day
       FROM daily_report_entries e JOIN daily_reports r ON r.id = e.report_id
       WHERE e.id = $1 AND e.student_id = $2 AND e.removed_at IS NULL`,
      [entryId, studentId]
    );
    return found.rows[0] ?? null;
  }

  app.put("/api/students/:studentId/report-entries/:entryId", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const entry = await ownEntry(studentId, String(req.params.entryId));
      if (!entry) return res.status(404).json({ message: "That event was not found." });
      const closed = await dayClosed(studentId, entry.day);
      if (closed) return res.status(409).json({ message: closed });
      const input = readEntry(req.body);
      if ("problem" in input) return res.status(400).json({ message: input.problem });
      const saved = await pool.query(
        `WITH e AS (
           UPDATE daily_report_entries SET happened_at = $2::time, title = $3, details = $4, updated_at = NOW()
           WHERE id = $1 RETURNING *
         )
         SELECT ${ENTRY_COLUMNS} FROM e`,
        [entry.id, input.happened_at, input.title, input.details]
      );
      return res.json({ message: "Saved.", entry: saved.rows[0] });
    } catch (error) {
      console.error("SAVE REPORT ENTRY ERROR:", error);
      return res.status(500).json({ message: "Failed to save the event." });
    }
  });

  app.delete("/api/students/:studentId/report-entries/:entryId", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const entry = await ownEntry(studentId, String(req.params.entryId));
      if (!entry) return res.status(404).json({ message: "That event was not found." });
      const closed = await dayClosed(studentId, entry.day);
      if (closed) return res.status(409).json({ message: closed });
      // The row and its pictures stay; the event is only taken off the day.
      await pool.query(`UPDATE daily_report_entries SET removed_at = NOW(), updated_at = NOW() WHERE id = $1`, [entry.id]);
      return res.json({ message: "Event removed." });
    } catch (error) {
      console.error("REMOVE REPORT ENTRY ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the event." });
    }
  });

  /* ---------- Monthly reports ---------- */

  app.get("/api/students/:studentId/monthly-reports", anyone, async (req, res) => {
    try {
      if (!(await mayRead(req, String(req.params.studentId)))) return res.status(403).json({ message: "You can't read this student's reports." });
      const found = await pool.query(
        `SELECT id::int AS id, TO_CHAR(month_start, 'YYYY-MM') AS month, summary, highlights, updated_at
         FROM monthly_reports WHERE student_id = $1 ORDER BY month_start DESC LIMIT 36`,
        [req.params.studentId]
      );
      return res.json({ months: found.rows });
    } catch (error) {
      console.error("GET MONTHLY REPORTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the monthly reports." });
    }
  });

  app.put("/api/students/:studentId/monthly-reports/:month", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      const start = monthStart(req.params.month);
      if (!start) return res.status(400).json({ message: "Give the month as YYYY-MM." });
      if (start > phToday()) return res.status(409).json({ message: "A month that hasn't started can't have a report yet." });
      const input = readMonth(req.body);
      if ("problem" in input) return res.status(400).json({ message: input.problem });
      const saved = await pool.query(
        `INSERT INTO monthly_reports AS m (student_id, month_start, summary, highlights) VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, month_start) DO UPDATE SET summary = EXCLUDED.summary, highlights = EXCLUDED.highlights, updated_at = NOW()
         RETURNING id::int AS id, TO_CHAR(month_start, 'YYYY-MM') AS month, summary, highlights, updated_at`,
        [studentId, start, input.summary, input.highlights]
      );
      return res.json({ message: "Saved.", month: saved.rows[0] });
    } catch (error) {
      console.error("SAVE MONTHLY REPORT ERROR:", error);
      return res.status(500).json({ message: "Failed to save the month's report." });
    }
  });

  /* ---------- The narrative report's written parts ---------- */

  app.get("/api/students/:studentId/narrative", anyone, async (req, res) => {
    try {
      if (!(await mayRead(req, String(req.params.studentId)))) return res.status(403).json({ message: "You can't read this student's narrative report." });
      const found = await pool.query(`SELECT parts, updated_at FROM narrative_reports WHERE student_id = $1`, [req.params.studentId]);
      return res.json({ parts: found.rows[0]?.parts ?? {}, updated_at: found.rows[0]?.updated_at ?? null, keys: NARRATIVE_PARTS });
    } catch (error) {
      console.error("GET NARRATIVE ERROR:", error);
      return res.status(500).json({ message: "Failed to load the narrative report." });
    }
  });

  app.put("/api/students/:studentId/narrative/:part", trainee, async (req, res) => {
    try {
      const studentId = ownRecord(req, res);
      if (!studentId) return;
      if (!isNarrativePart(req.params.part)) return res.status(404).json({ message: "That part is not in the narrative report." });
      const input = readNarrativeText(req.body);
      if ("problem" in input) return res.status(400).json({ message: input.problem });
      const value = JSON.stringify({ text: input.text, updated_at: new Date().toISOString() });
      const saved = await pool.query(
        `INSERT INTO narrative_reports AS n (student_id, parts) VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
         ON CONFLICT (student_id) DO UPDATE SET parts = n.parts || jsonb_build_object($2::text, $3::jsonb), updated_at = NOW()
         RETURNING parts -> $2::text AS part, updated_at`,
        [studentId, req.params.part, value]
      );
      return res.json({ message: "Saved.", part: saved.rows[0].part, updated_at: saved.rows[0].updated_at });
    } catch (error) {
      console.error("SAVE NARRATIVE ERROR:", error);
      return res.status(500).json({ message: "Failed to save that part." });
    }
  });
}
