import type express from "express";
import type { Pool } from "pg";
import { currentScope, scopeCondition, studentInScope } from "../services/coordinatorScope";
import { CHECK_IN_KINDS, weekOf, type CheckInKind } from "../services/monitoringPlan";
import { phToday } from "../services/phTime";

/*
|--------------------------------------------------------------------------
| THE MONITORING PLAN (Phase 2.3, migration 087)
|--------------------------------------------------------------------------
|
|   GET  /api/coordinator/monitoring-plan            overdue, this week, later,
|                                                    and the companies to plan for
|   POST /api/coordinator/monitoring-plan            plan a check-in
|   PUT  /api/coordinator/monitoring-plan/:id        move or change a planned one
|   POST /api/coordinator/monitoring-plan/:id/done   mark it done, with findings
|
| A planned check-in is removed with DELETE /api/coordinator/site-visits/:id,
| like a visit. A check-in about a student outside a scoped coordinator's
| students is neither shown nor accepted (SCOPED_RECORDS covers the :id routes).
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = { pool: Pool; requireCoordinator: express.RequestHandler };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const PLAN_COLUMNS = `
  v.id, v.kind, TO_CHAR(v.planned_on, 'YYYY-MM-DD') AS planned_on, v.plan_note,
  v.company_id, c.name AS company, TRIM(v.student_id::text) AS student_id, s.name AS student,
  v.visited_by_name AS planned_by`;
const PLAN_FROM = `site_visits v JOIN companies c ON c.id = v.company_id LEFT JOIN students s ON s.student_id = v.student_id`;

/** The plan's fields, checked. */
function readPlan(body: unknown, today: string): { plan: { kind: CheckInKind; plannedOn: string; note: string | null } } | { problem: string } {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const kind = text(input.kind) as CheckInKind;
  const plannedOn = text(input.planned_on);
  const note = text(input.note);
  if (!CHECK_IN_KINDS.includes(kind)) return { problem: "Choose a visit, a call or a message check-in." };
  if (!validDate(plannedOn)) return { problem: "Give the day, written as YYYY-MM-DD." };
  if (plannedOn < today) return { problem: "Plan it for today or later." };
  if (plannedOn > addDays(today, 366)) return { problem: "Plan it within the next year." };
  if (note.length > 500) return { problem: "Keep the note to 500 characters." };
  return { plan: { kind, plannedOn, note: note || null } };
}

export function registerMonitoringPlanRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator } = deps;

  const coordinatorName = async (id: string) =>
    (await pool.query<{ name: string }>(`SELECT name FROM coordinators WHERE coordinator_id = $1`, [id])).rows[0]?.name || "OJT coordinator";

  app.get("/api/coordinator/monitoring-plan", requireCoordinator, async (_req, res) => {
    try {
      const today = phToday();
      const week = weekOf(today);
      // Company-wide check-ins are for everyone; one about a student, only within the scope.
      const scope = scopeCondition("v.student_id", 0);
      const scopeSql = scope.sql ? ` AND (v.student_id IS NULL OR (TRUE${scope.sql}))` : "";
      const studentScope = scopeCondition("s.student_id", 0);
      const [planned, companies] = await Promise.all([
        pool.query(
          `SELECT ${PLAN_COLUMNS} FROM ${PLAN_FROM}
           WHERE v.status = 'planned'${scopeSql}
           ORDER BY v.planned_on, LOWER(c.name), v.id LIMIT 500`,
          scope.values
        ),
        pool.query(
          `SELECT c.id, c.name,
                  COALESCE(JSON_AGG(JSON_BUILD_OBJECT('student_id', TRIM(s.student_id::text), 'name', s.name) ORDER BY s.name)
                    FILTER (WHERE s.student_id IS NOT NULL), '[]'::json) AS students
           FROM companies c
           LEFT JOIN students s ON s.company_id = c.id AND s.is_active = TRUE${studentScope.sql}
           WHERE c.is_active = TRUE
           GROUP BY c.id, c.name
           ORDER BY LOWER(c.name)`,
          studentScope.values
        ),
      ]);
      const rows = planned.rows as { planned_on: string }[];
      return res.json({
        today,
        week,
        overdue: rows.filter((row) => row.planned_on < today),
        this_week: rows.filter((row) => row.planned_on >= today && row.planned_on <= week.end),
        later: rows.filter((row) => row.planned_on > week.end),
        companies: companies.rows,
      });
    } catch (error) {
      console.error("GET MONITORING PLAN ERROR:", error);
      return res.status(500).json({ message: "Failed to load the monitoring plan." });
    }
  });

  app.post("/api/coordinator/monitoring-plan", requireCoordinator, async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      const read = readPlan(req.body, phToday());
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const companyId = Number(req.body?.company_id);
      if (!Number.isSafeInteger(companyId) || companyId < 1) return res.status(400).json({ message: "Choose the company." });
      const company = await pool.query(`SELECT 1 FROM companies WHERE id = $1 AND is_active = TRUE`, [companyId]);
      if (company.rows.length === 0) return res.status(400).json({ message: "Choose an active company." });
      const studentId = text(req.body?.student_id) || null;
      if (studentId) {
        const there = await pool.query(`SELECT 1 FROM students WHERE TRIM(student_id::text) = TRIM($1) AND company_id = $2 AND is_active = TRUE`, [studentId, companyId]);
        const scope = currentScope();
        if (there.rows.length === 0 || (scope && !(await studentInScope(pool, scope, studentId)))) {
          return res.status(400).json({ message: "Choose a student placed at that company." });
        }
      }
      const saved = await pool.query<{ id: number }>(
        `INSERT INTO site_visits (company_id, student_id, kind, status, planned_on, plan_note, visited_by, visited_by_name)
         VALUES ($1, (SELECT student_id FROM students WHERE TRIM(student_id::text) = TRIM($2)), $3, 'planned', $4, $5, $6, $7)
         RETURNING id`,
        [companyId, studentId, read.plan.kind, read.plan.plannedOn, read.plan.note, auth.id, await coordinatorName(auth.id)]
      );
      const plan = await pool.query(`SELECT ${PLAN_COLUMNS} FROM ${PLAN_FROM} WHERE v.id = $1`, [saved.rows[0].id]);
      return res.status(201).json({ message: "Check-in planned.", plan: plan.rows[0] });
    } catch (error) {
      console.error("PLAN CHECK-IN ERROR:", error);
      return res.status(500).json({ message: "Failed to plan the check-in." });
    }
  });

  app.put("/api/coordinator/monitoring-plan/:id", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Check-in not found." });
      const read = readPlan(req.body, phToday());
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const updated = await pool.query(
        `UPDATE site_visits SET kind = $2, plan_note = $4, updated_at = NOW(),
                reminded_at = CASE WHEN planned_on = $3::date THEN reminded_at ELSE NULL END,
                planned_on = $3
         WHERE id = $1 AND status = 'planned' RETURNING id`,
        [Number(req.params.id), read.plan.kind, read.plan.plannedOn, read.plan.note]
      );
      if (updated.rows.length === 0) return res.status(404).json({ message: "Check-in not found." });
      const plan = await pool.query(`SELECT ${PLAN_COLUMNS} FROM ${PLAN_FROM} WHERE v.id = $1`, [Number(req.params.id)]);
      return res.json({ message: "Check-in changed.", plan: plan.rows[0] });
    } catch (error) {
      console.error("CHANGE CHECK-IN ERROR:", error);
      return res.status(500).json({ message: "Failed to change the check-in." });
    }
  });

  app.post("/api/coordinator/monitoring-plan/:id/done", requireCoordinator, async (req, res) => {
    try {
      if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: "Check-in not found." });
      const auth = (req as Authed).auth!;
      const today = phToday();
      const doneOn = text(req.body?.done_on) || today;
      const findings = text(req.body?.findings);
      const followUp = text(req.body?.follow_up);
      if (!validDate(doneOn)) return res.status(400).json({ message: "Give the day it was done, written as YYYY-MM-DD." });
      if (doneOn > today) return res.status(400).json({ message: "A check-in is marked done after it happens; that day has not come yet." });
      if (findings.length < 10 || findings.length > 3000) return res.status(400).json({ message: "Say what you found (10 to 3000 characters)." });
      if (followUp.length > 1000) return res.status(400).json({ message: "Keep the follow-up to 1000 characters." });
      const done = await pool.query(
        `UPDATE site_visits SET status = 'done', visit_date = $2, findings = $3, follow_up = $4,
                visited_by = $5, visited_by_name = $6, updated_at = NOW()
         WHERE id = $1 AND status = 'planned' RETURNING id`,
        [Number(req.params.id), doneOn, findings, followUp || null, auth.id, await coordinatorName(auth.id)]
      );
      if (done.rows.length === 0) return res.status(404).json({ message: "Check-in not found." });
      return res.json({ message: "Marked done. It is in the visit log.", id: done.rows[0].id });
    } catch (error) {
      console.error("CHECK-IN DONE ERROR:", error);
      return res.status(500).json({ message: "Failed to mark the check-in done." });
    }
  });
}
