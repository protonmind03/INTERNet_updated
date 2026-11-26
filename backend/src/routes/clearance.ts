import type express from "express";
import type { Pool } from "pg";
import {
  READINESS_COLUMNS,
  readinessOf,
  studentReadiness,
  type Readiness,
} from "../services/deploymentClearance";
import { currentScope, studentInScope } from "../services/coordinatorScope";
import { sameId } from "../services/ids";
import { changeOjtSetting, isOjtSettingKey, ojtSetting, readOjtSettings } from "../services/ojtSettings";
import { bindFilters, filterConditions, readStudentFilters } from "../services/studentScope";

/*
|--------------------------------------------------------------------------
| THE CLEARANCE BOARD AND THE DEPLOYMENT GATE (Phase 1.2)
|--------------------------------------------------------------------------
|
| The coordinator records each student's academic eligibility and clears
| them for deployment (services/deploymentClearance.ts says when one is
| ready). Clearing someone who is not ready is "clear anyway" and needs a
| reason of at least 10 characters. Every decision is audited.
|
| The OJT rules (services/ojtSettings.ts) are changed here too, with the
| old and the new value in the audit log: by the OJT Director, or by the
| coordinators until a Director account exists (Phase 1.6). The Director
| reads the board too; clearing stays with the coordinators.
|
| The student reads their own readiness for the Today card.
|
*/

type Role = "student" | "supervisor" | "coordinator";
type Authed = express.Request & { auth?: { role: Role; id: string } };

type Dependencies = {
  pool: Pool;
  requireRole: (roles: Role | Role[]) => express.RequestHandler;
  requireCoordinator: express.RequestHandler;
  /** Phase 1.6: coordinators and the OJT Director read; the office decides (server.ts). */
  requireStaff: express.RequestHandler;
  requireOffice: express.RequestHandler;
  createNotification: (options: { studentId?: string | null; title: string; message: string; type?: string; link?: string }) => Promise<unknown>;
};

const MIN_OVERRIDE_REASON = 10;
const MAX_BULK = 200;

const cleanText = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export function registerClearanceRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireRole, requireCoordinator, requireStaff, requireOffice, createNotification } = deps;

  /** Clears one student; the caller has checked they exist and the reason, if any. */
  async function clear(studentId: string, coordinatorId: string, overrideReason: string | null) {
    const saved = await pool.query(
      `UPDATE students
       SET cleared_for_deployment_at = NOW(), cleared_by = $2, clearance_override_reason = $3
       WHERE student_id = $1 AND is_active = TRUE
       RETURNING student_id`,
      [studentId, coordinatorId, overrideReason]
    );
    if (saved.rows.length === 0) return false;
    await createNotification({
      studentId,
      title: "Cleared for deployment",
      message: "Your OJT coordinator cleared you for deployment. You can time in at your company.",
      type: "info",
    }).catch((error) => console.error("CLEARANCE NOTIFICATION ERROR:", error));
    return true;
  }

  // The board: every active student in the filters, with their readiness (at most BOARD_LIMIT).
  const BOARD_LIMIT = 2000;
  app.get("/api/coordinator/clearance", requireStaff, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      const bound = bindFilters(
        `SELECT ${READINESS_COLUMNS}
         FROM students s
         WHERE s.is_active = TRUE${filterConditions(read.filters, "s")}
         ORDER BY s.name, s.student_id
         LIMIT ${BOARD_LIMIT + 1}`,
        [],
        read.filters
      );
      const [rows, gate] = await Promise.all([pool.query(bound.text, bound.values), ojtSetting(pool, "deployment_gate_enabled")]);
      // One more than shown says the list was cut, so the page can say so.
      const truncated = rows.rows.length > BOARD_LIMIT;
      const students: Readiness[] = rows.rows.slice(0, BOARD_LIMIT).map(readinessOf);
      return res.json({
        gate_enabled: gate,
        truncated,
        students,
        counts: {
          students: students.length,
          cleared: students.filter((row) => row.cleared).length,
          ready: students.filter((row) => row.ready && !row.cleared).length,
          not_ready: students.filter((row) => !row.ready && !row.cleared).length,
          overrides: students.filter((row) => row.cleared && row.clearance_override_reason).length,
        },
      });
    } catch (error) {
      console.error("GET CLEARANCE BOARD ERROR:", error);
      return res.status(500).json({ message: "Failed to load the clearance board." });
    }
  });

  // The academic check: eligible, deficient (with what is missing), or not checked yet.
  app.put("/api/coordinator/students/:studentId/eligibility", requireCoordinator, async (req, res) => {
    try {
      const status = req.body?.status;
      if (!["unchecked", "eligible", "deficient"].includes(status)) {
        return res.status(400).json({ message: "Eligibility is eligible, deficient, or not checked yet." });
      }
      const note = cleanText(req.body?.note, 500);
      if (status === "deficient" && !note) {
        return res.status(400).json({ message: "Say what is missing, such as a failed or incomplete subject." });
      }
      const auth = (req as Authed).auth!;
      const saved = await pool.query(
        `UPDATE students
         SET eligibility_status = $2, eligibility_note = $3,
             eligibility_checked_by = CASE WHEN $2 = 'unchecked' THEN NULL ELSE $4 END,
             eligibility_checked_at = CASE WHEN $2 = 'unchecked' THEN NULL ELSE NOW() END
         WHERE student_id = $1
         RETURNING student_id, eligibility_status, eligibility_note, eligibility_checked_at`,
        [req.params.studentId, status, note, auth.id]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      return res.json({ message: "Eligibility saved.", student: saved.rows[0] });
    } catch (error) {
      console.error("SAVE ELIGIBILITY ERROR:", error);
      return res.status(500).json({ message: "Failed to save the eligibility." });
    }
  });

  // Clear for deployment. Not ready: only with a reason ("clear anyway").
  app.post("/api/coordinator/students/:studentId/clearance", requireCoordinator, async (req, res) => {
    try {
      const studentId = String(req.params.studentId);
      const readiness = await studentReadiness(pool, studentId);
      if (!readiness) return res.status(404).json({ message: "Student not found." });
      if (readiness.cleared) return res.status(409).json({ message: `${readiness.name} is already cleared for deployment.` });
      const reason = cleanText(req.body?.override_reason, 500);
      if (!readiness.ready && (!reason || reason.length < MIN_OVERRIDE_REASON)) {
        return res.status(400).json({
          code: "NOT_READY",
          missing: readiness.missing,
          message: `${readiness.name} is not ready: ${readiness.missing.join(", ")}. To clear anyway, give a reason of at least ${MIN_OVERRIDE_REASON} characters.`,
        });
      }
      const overrideReason = readiness.ready ? null : reason;
      if (!(await clear(studentId, (req as Authed).auth!.id, overrideReason))) {
        return res.status(409).json({ message: "This student's account is deactivated." });
      }
      return res.json({
        message: overrideReason ? `${readiness.name} cleared anyway.` : `${readiness.name} cleared for deployment.`,
        student_id: studentId,
        override: Boolean(overrideReason),
        // For the audit log: what was missing when it was overridden.
        missing: overrideReason ? readiness.missing : [],
      });
    } catch (error) {
      console.error("CLEAR FOR DEPLOYMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to clear the student." });
    }
  });

  // Take a clearance back (cleared by mistake).
  app.delete("/api/coordinator/students/:studentId/clearance", requireCoordinator, async (req, res) => {
    try {
      const saved = await pool.query(
        `UPDATE students SET cleared_for_deployment_at = NULL, cleared_by = NULL, clearance_override_reason = NULL
         WHERE student_id = $1 AND cleared_for_deployment_at IS NOT NULL
         RETURNING student_id`,
        [req.params.studentId]
      );
      if (saved.rows.length === 0) return res.status(404).json({ message: "No clearance to take back for that student." });
      return res.json({ message: "Clearance taken back.", student_id: saved.rows[0].student_id });
    } catch (error) {
      console.error("UNCLEAR ERROR:", error);
      return res.status(500).json({ message: "Failed to take the clearance back." });
    }
  });

  // Clear several at once: only the ready ones; the rest say why.
  app.post("/api/coordinator/clearance/bulk", requireCoordinator, async (req, res) => {
    try {
      const ids: unknown = req.body?.student_ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK || ids.some((id) => typeof id !== "string" || !id.trim())) {
        return res.status(400).json({ message: `Choose 1 to ${MAX_BULK} students.` });
      }
      const auth = (req as Authed).auth!;
      const results: { student_id: string; status: "cleared" | "already" | "not_ready" | "missing"; missing?: string[] }[] = [];
      const scope = currentScope();
      for (const id of [...new Set(ids as string[])]) {
        // Phase 1.6: outside a scoped coordinator's students is the same as not there.
        const readiness = scope && !(await studentInScope(pool, scope, id)) ? null : await studentReadiness(pool, id);
        if (!readiness) results.push({ student_id: id, status: "missing" });
        else if (readiness.cleared) results.push({ student_id: id, status: "already" });
        else if (!readiness.ready) results.push({ student_id: id, status: "not_ready", missing: readiness.missing });
        else results.push({ student_id: id, status: (await clear(id, auth.id, null)) ? "cleared" : "missing" });
      }
      const cleared = results.filter((row) => row.status === "cleared");
      return res.json({
        message: `${cleared.length} of ${results.length} cleared for deployment.`,
        results,
        cleared: cleared.map((row) => row.student_id),
      });
    } catch (error) {
      console.error("BULK CLEAR ERROR:", error);
      return res.status(500).json({ message: "Failed to clear the students." });
    }
  });

  // The OJT rules. Read by every portal that shows one; changed by the coordinator until a Director exists (1.6).
  app.get("/api/coordinator/ojt-settings", requireStaff, async (_req, res) => {
    try {
      return res.json({ settings: await readOjtSettings(pool) });
    } catch (error) {
      console.error("GET OJT SETTINGS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the OJT rules." });
    }
  });

  app.put("/api/coordinator/ojt-settings/:key", requireOffice, async (req, res) => {
    try {
      const key = String(req.params.key);
      if (!isOjtSettingKey(key)) return res.status(404).json({ message: "There is no such rule." });
      const changed = await changeOjtSetting(pool, key, req.body?.value, (req as Authed).auth!.id);
      if ("problem" in changed) return res.status(400).json({ message: changed.problem });
      return res.json({ message: `${changed.label} saved.`, key, old: changed.old, value: changed.value });
    } catch (error) {
      console.error("SAVE OJT SETTING ERROR:", error);
      return res.status(500).json({ message: "Failed to save the rule." });
    }
  });

  // The student's own readiness: the Today card (kept on the phone for offline reading).
  app.get("/api/students/:studentId/clearance", requireRole("student"), async (req, res) => {
    try {
      const auth = (req as Authed).auth!;
      if (!sameId(auth.id, req.params.studentId)) return res.status(403).json({ message: "You can only see your own clearance." });
      const [readiness, gate] = await Promise.all([studentReadiness(pool, auth.id), ojtSetting(pool, "deployment_gate_enabled")]);
      if (!readiness) return res.status(404).json({ message: "Student not found." });
      return res.json({
        gate_enabled: gate,
        cleared: readiness.cleared,
        ready: readiness.ready,
        missing: readiness.missing,
        items: readiness.items,
      });
    } catch (error) {
      console.error("GET OWN CLEARANCE ERROR:", error);
      return res.status(500).json({ message: "Failed to load your requirements." });
    }
  });
}
