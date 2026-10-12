import type express from "express";
import type { Pool } from "pg";
import { programmeReport, studentPerformance } from "../services/insights";
import {
  BEHIND_AFTER_SCHEDULED_DAYS,
  BEHIND_ATTENDANCE_PERCENT,
  BEHIND_LATE_TASKS,
  LATE_AFTER_MINUTES,
  PERFORMANCE_RULES,
} from "../services/performance";
import { readStudentFilters } from "../services/studentScope";
import { BLOCK_NAME_SQL } from "../services/academics";
import { KPI_DEFINITIONS, readTarget, type KpiDefinition } from "../services/kpiDefinitions";
import { loadKpiTargets } from "../services/kpis";
import { compareSchedule, readSchedule, scheduleKey, type ScheduleDay } from "../services/schedules";
import { termSetup } from "../services/termSetup";

/*
|--------------------------------------------------------------------------
| THE PROGRAMME, FOR THE COORDINATOR (Round 2, Phase 5)
|--------------------------------------------------------------------------
|
|   performance   each student's figures, status word and sentence
|   kpi targets   the six key figures' targets, changed from the dashboard
|   filter views  a coordinator's saved choices of the filter bar
|   term setup    what a term still needs, counted
|   block schedule  one weekly schedule for every student of a block
|
| Every route here is the coordinator's.
|
*/

type Role = "student" | "supervisor" | "coordinator";
export type Authed = express.Request & { auth?: { role: Role; id: string } };

export type ProgrammeDependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  createNotification: (notification: {
    studentId?: string | null;
    supervisorId?: string | null;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) => Promise<void>;
};

export function registerProgrammeRoutes(app: express.Express, deps: ProgrammeDependencies): void {
  const { pool, requireCoordinator } = deps;

  /*
  | Student performance
  */

  // What the status words mean, sent with the figures so the page explains
  // them from the same place they are decided.
  const explained = {
    rules: PERFORMANCE_RULES,
    thresholds: {
      late_after_minutes: LATE_AFTER_MINUTES,
      behind_attendance_percent: BEHIND_ATTENDANCE_PERCENT,
      behind_after_scheduled_days: BEHIND_AFTER_SCHEDULED_DAYS,
      behind_late_tasks: BEHIND_LATE_TASKS,
    },
  };

  app.get("/api/coordinator/performance", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const report = await programmeReport(pool, read.filters, new Date(), { performance: true });
      return res.json({ students: report.students, ...explained });
    } catch (error) {
      console.error("GET PERFORMANCE ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the students' performance." });
    }
  });

  // One student's, for the top of their record. Null for a student who is
  // not active: there is nothing current to say about them.
  app.get("/api/coordinator/students/:studentId/performance", requireCoordinator, async (req, res) => {
    try {
      const found = await studentPerformance(pool, String(req.params.studentId));
      return res.json({ student: found, ...explained });
    } catch (error) {
      console.error("GET STUDENT PERFORMANCE ERROR:", error);
      return res.status(500).json({ message: "Failed to work out this student's performance." });
    }
  });

  /*
  | The key figures' targets. One set for the programme. Sending a number
  | sets a figure's target; sending null puts its default back.
  */

  app.put("/api/coordinator/kpi-targets", requireCoordinator, async (req, res) => {
    const auth = (req as Authed).auth!;
    const sent: unknown = req.body?.targets;
    if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
      return res.status(400).json({ message: "Send the targets to change." });
    }
    const changes: { definition: KpiDefinition; target: number | null }[] = [];
    for (const [key, value] of Object.entries(sent as Record<string, unknown>)) {
      const definition = KPI_DEFINITIONS.find((item) => item.key === key);
      if (!definition) return res.status(400).json({ message: "That is not one of the key figures." });
      if (value === null) {
        changes.push({ definition, target: null });
        continue;
      }
      const read = readTarget(definition, value);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      changes.push({ definition, target: read.target });
    }
    if (changes.length === 0) return res.status(400).json({ message: "Send the targets to change." });
    const client = await pool.connect();
    try {
      const before = await loadKpiTargets(pool);
      await client.query("BEGIN");
      for (const { definition, target } of changes) {
        // A target equal to the default is the default: no row is kept for it.
        if (target === null || target === definition.target) {
          await client.query(`DELETE FROM kpi_targets WHERE key = $1`, [definition.key]);
        } else {
          await client.query(
            `INSERT INTO kpi_targets (key, target, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT (key) DO UPDATE SET target = EXCLUDED.target, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [definition.key, target, auth.id]
          );
        }
      }
      await client.query("COMMIT");
      const after = await loadKpiTargets(pool);
      // What actually moved, in words, for the audit log.
      const changed = changes
        .map(({ definition }) => {
          const was = before[definition.key] ?? definition.target;
          const is = after[definition.key] ?? definition.target;
          return was === is ? "" : `${definition.key}: ${was} to ${is}`;
        })
        .filter(Boolean);
      return res.json({
        message: changed.length === 0 ? "The targets are as they were." : "Targets saved.",
        targets: Object.fromEntries(KPI_DEFINITIONS.map((item) => [item.key, after[item.key] ?? item.target])),
        changed: changed.join("; "),
        changed_count: changed.length,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("SAVE KPI TARGETS ERROR:", error);
      return res.status(500).json({ message: "Failed to save the targets." });
    } finally {
      client.release();
    }
  });

  /*
  | Saved views of the filter bar, each coordinator's own
  */

  const FILTER_KEYS = ["term", "college", "program", "block", "company", "supervisor"] as const;

  app.get("/api/coordinator/filter-views", requireCoordinator, async (req, res) => {
    try {
      const views = await pool.query(
        `SELECT id, name, filters FROM filter_views WHERE coordinator_id = $1 ORDER BY LOWER(name)`,
        [(req as Authed).auth!.id]
      );
      return res.json({ views: views.rows });
    } catch (error) {
      console.error("GET FILTER VIEWS ERROR:", error);
      return res.status(500).json({ message: "Failed to load your saved views." });
    }
  });

  app.post("/api/coordinator/filter-views", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 60) return res.status(400).json({ message: "Give the view a name of 60 characters or fewer." });
      const sent: unknown = req.body?.filters;
      if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
        return res.status(400).json({ message: "Choose at least one filter before saving a view." });
      }
      // Only the bar's six choices are kept, and only as the bar itself would send them.
      const asQuery: Record<string, unknown> = {};
      for (const key of FILTER_KEYS) {
        const value = (sent as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) asQuery[key] = value.trim();
      }
      const read = readStudentFilters(asQuery);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const filters = Object.fromEntries(Object.entries(read.filters).map(([key, value]) => [key, String(value)]));
      if (Object.keys(filters).length === 0) {
        return res.status(400).json({ message: "Choose at least one filter before saving a view." });
      }
      const owned = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM filter_views WHERE coordinator_id = $1`, [auth.id]);
      if (owned.rows[0].n >= MAX_VIEWS) {
        return res.status(409).json({ message: `You can keep ${MAX_VIEWS} saved views. Remove one first.` });
      }
      const saved = await pool.query(
        `INSERT INTO filter_views (coordinator_id, name, filters) VALUES ($1, $2, $3::jsonb) RETURNING id, name, filters`,
        [auth.id, name, JSON.stringify(filters)]
      );
      return res.status(201).json({ message: `View "${name}" saved.`, view: saved.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "You already have a view with that name." });
      }
      console.error("SAVE FILTER VIEW ERROR:", error);
      return res.status(500).json({ message: "Failed to save the view." });
    }
  });

  app.delete("/api/coordinator/filter-views/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^[0-9]{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "View not found." });
      const gone = await pool.query<{ name: string }>(
        `DELETE FROM filter_views WHERE id = $1 AND coordinator_id = $2 RETURNING name`,
        [req.params.id, (req as Authed).auth!.id]
      );
      if (gone.rows.length === 0) return res.status(404).json({ message: "View not found." });
      return res.json({ message: `View "${gone.rows[0].name}" removed.` });
    } catch (error) {
      console.error("REMOVE FILTER VIEW ERROR:", error);
      return res.status(500).json({ message: "Failed to remove the view." });
    }
  });

  /*
  | What a term still needs before it can run. Every line is counted from
  | records; none is a box someone ticks.
  */

  app.get("/api/coordinator/terms/:id/setup", requireCoordinator, async (req, res) => {
    try {
      if (!/^[0-9]{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Term not found." });
      const checklist = await termSetup(pool, Number(req.params.id));
      if (!checklist) return res.status(404).json({ message: "Term not found." });
      return res.json(checklist);
    } catch (error) {
      console.error("GET TERM SETUP ERROR:", error);
      return res.status(500).json({ message: "Failed to check the term's setup." });
    }
  });

  /*
  | One weekly schedule for every student of a block. The preview changes
  | nothing: it says who has no schedule, who has this one already, and who
  | has a different one. Applying it always fills in those with none; those
  | with a different one are overwritten or left, as the coordinator chose.
  */

  type Standing = { student_id: string; name: string; state: "none" | "same" | "different"; current: string };

  async function blockSchedules(blockId: number, wanted: ScheduleDay[]) {
    const block = await pool.query<{ name: string }>(
      `SELECT ${BLOCK_NAME_SQL} AS name FROM blocks b JOIN programs p ON p.id = b.program_id WHERE b.id = $1`,
      [blockId]
    );
    if (block.rows.length === 0) return null;
    const students = await pool.query<{ student_id: string; name: string }>(
      `SELECT student_id, name FROM students WHERE block_id = $1 AND is_active = TRUE ORDER BY name`,
      [blockId]
    );
    const rows = await pool.query<{ student_id: string; day: string; start: string; end: string }>(
      `SELECT student_id, INITCAP(TRIM(day)) AS day, TO_CHAR(start_time, 'HH24:MI') AS start, TO_CHAR(end_time, 'HH24:MI') AS "end"
       FROM ojt_schedule WHERE is_active = TRUE AND student_id = ANY($1::text[])`,
      [students.rows.map((row) => row.student_id)]
    );
    const standing: Standing[] = students.rows.map((student) => {
      const current = rows.rows.filter((row) => row.student_id === student.student_id);
      return { ...student, state: compareSchedule(current, wanted), current: scheduleKey(current) };
    });
    return { block: block.rows[0].name, students: standing };
  }

  const count = (rows: Standing[], state: Standing["state"]) => rows.filter((row) => row.state === state).length;

  app.post("/api/coordinator/blocks/:id/schedule/preview", requireCoordinator, async (req, res) => {
    try {
      if (!/^[0-9]{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Block not found." });
      const read = readSchedule(req.body?.schedule);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      if (read.days.length === 0) return res.status(400).json({ message: "Choose at least one working day." });
      const found = await blockSchedules(Number(req.params.id), read.days);
      if (!found) return res.status(404).json({ message: "Block not found." });
      return res.json({
        ...found,
        schedule: scheduleKey(read.days),
        none: count(found.students, "none"),
        same: count(found.students, "same"),
        different: count(found.students, "different"),
      });
    } catch (error) {
      console.error("PREVIEW BLOCK SCHEDULE ERROR:", error);
      return res.status(500).json({ message: "Failed to check the block's schedules." });
    }
  });

  app.put("/api/coordinator/blocks/:id/schedule", requireCoordinator, async (req, res) => {
    if (!/^[0-9]{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Block not found." });
    const read = readSchedule(req.body?.schedule);
    if ("problem" in read) return res.status(400).json({ message: read.problem });
    if (read.days.length === 0) return res.status(400).json({ message: "Choose at least one working day." });
    const existing = req.body?.existing;
    if (existing !== "overwrite" && existing !== "skip") {
      return res.status(400).json({ message: "Say whether students who already have a different schedule are overwritten or skipped." });
    }
    const client = await pool.connect();
    try {
      const found = await blockSchedules(Number(req.params.id), read.days);
      if (!found) return res.status(404).json({ message: "Block not found." });
      if (found.students.length === 0) {
        return res.status(409).json({ message: `${found.block} has no active students to set a schedule for.` });
      }
      const targets = found.students.filter((row) => row.state === "none" || (row.state === "different" && existing === "overwrite"));
      const ids = targets.map((row) => row.student_id);
      await client.query("BEGIN");
      if (ids.length > 0) {
        await client.query(`UPDATE ojt_schedule SET is_active = FALSE WHERE is_active = TRUE AND student_id = ANY($1::text[])`, [ids]);
        for (const day of read.days) {
          await client.query(
            `INSERT INTO ojt_schedule (student_id, day, start_time, end_time, focus, hours, is_active)
             SELECT student, $2, $3, $4, $5, $6, TRUE FROM UNNEST($1::text[]) AS student`,
            [ids, day.day, day.start, day.end, day.focus, day.hours]
          );
        }
      }
      await client.query("COMMIT");

      for (const studentId of ids) {
        try {
          await deps.createNotification({
            studentId,
            title: "OJT schedule updated",
            message: `Your coordinator updated your OJT schedule (${read.days.length} day${read.days.length === 1 ? "" : "s"} per week).`,
            type: "schedule",
          });
        } catch (error) {
          console.error("BLOCK SCHEDULE NOTIFICATION ERROR:", error);
        }
      }
      const skipped = existing === "skip" ? count(found.students, "different") : 0;
      const unchanged = count(found.students, "same");
      const people = (n: number) => `${n} student${n === 1 ? "" : "s"}`;
      return res.json({
        message:
          `Schedule set for ${people(ids.length)} of ${found.block}.` +
          (skipped > 0 ? ` ${people(skipped)} with a different schedule ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it is" : "they are"}.` : "") +
          (unchanged > 0 ? ` ${people(unchanged)} already had it.` : ""),
        block: found.block,
        applied: ids.length,
        skipped,
        unchanged,
        schedule: scheduleKey(read.days),
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("SET BLOCK SCHEDULE ERROR:", error);
      return res.status(500).json({ message: "Failed to set the schedule. Nothing was changed." });
    } finally {
      client.release();
    }
  });
}

/** The most saved views one coordinator keeps. */
const MAX_VIEWS = 30;
