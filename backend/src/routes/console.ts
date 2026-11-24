import type express from "express";
import type { Pool } from "pg";
import { coordinatorActions } from "../services/coordinatorActions";
import { coordinatorHome } from "../services/coordinatorHome";
import { coordinatorKpis } from "../services/kpis";
import { readStudentFilters } from "../services/studentScope";
import { emailRoute, sendEmail } from "../services/mailer";
import { EmailLimitError } from "../services/emailBudget";
import { checkFileStore, fileStoreKind } from "../services/privateFileStore";
import { recentProblems } from "../services/problems";
import { uploadUsage } from "../services/uploadQuota";
import { privacyWarnings, systemStatus, somethingWrong } from "../services/systemStatus";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S CONSOLE
|--------------------------------------------------------------------------
|
| What the coordinator's dashboard and Analytics show at the top, counted
| on the server: the action list (who has to do what) and the six key
| figures with their targets. Both read only, both for the coordinator
| only, and both take the same optional filters the other coordinator
| pages take (services/studentScope.ts): term, college, program, block,
| company and supervisor.
|
*/

type Dependencies = {
  pool: Pool;
  requireCoordinator: express.RequestHandler;
  /** Phase 1.7: the IT administrator, who has the system pages once their account exists. */
  requireAdmin: express.RequestHandler;
  requireRole: (roles: ("coordinator" | "director" | "admin")[]) => express.RequestHandler;
  /** The server's rule for a flagged attendance log, as SQL on an alias. */
  flaggedLogCondition: (alias: string) => string;
  /** Whether the push keys are set. */
  pushConfigured: () => boolean;
  createRateLimiter: (max: number, windowMs: number) => (key: string) => boolean;
};

export function registerConsoleRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator, requireAdmin, flaggedLogCondition } = deps;

  /*
  | What is switched on, the problems, the restore drill and the two tests
  |
  | Phase 1.7: these belong to the IT administrator (/api/admin/...). Until
  | an active administrator account exists, the coordinators keep them
  | (/api/coordinator/...), as before. After that a coordinator's System
  | status says only whether something is wrong, and the rest answers 403.
  */
  const adminExists = async () =>
    (await pool.query(`SELECT 1 FROM system_admins WHERE is_active = TRUE LIMIT 1`)).rows.length > 0;

  /** Coordinators, while no administrator exists. */
  const requireCoordinatorUntilAdmin: express.RequestHandler = (req, res, next) => {
    requireCoordinator(req, res, async (error?: unknown) => {
      if (error) return next(error);
      try {
        if (!(await adminExists())) return next();
        return res.status(403).json({
          code: "ADMIN_MANAGES",
          message: "The system administrator looks after this now.",
        });
      } catch (checkError) {
        console.error("SYSTEM DESK CHECK ERROR:", checkError);
        return res.status(500).json({ message: "Failed to check who looks after the system." });
      }
    });
  };

  const readStatus: express.RequestHandler = async (_req, res) => {
    try {
      return res.json(await systemStatus(pool, deps.pushConfigured()));
    } catch (error) {
      console.error("SYSTEM STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to read what is switched on." });
    }
  };

  app.get("/api/coordinator/system-status", requireCoordinator, async (req, res, next) => {
    try {
      if (!(await adminExists())) return readStatus(req, res, next);
      // The administrator has the details; the coordinator hears only whether to worry.
      return res.json({ managed_by_admin: true, something_wrong: await somethingWrong(pool) });
    } catch (error) {
      console.error("SYSTEM STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to read what is switched on." });
    }
  });
  app.get("/api/admin/system-status", requireAdmin, readStatus);

  // Phase 1.8: the privacy settings missing on a live site, for the coordinators, the OJT Director and the administrator.
  app.get("/api/privacy/warnings", deps.requireRole(["coordinator", "director", "admin"]), (_req, res) => {
    return res.json(privacyWarnings());
  });

  // A restore drill done by a person (DEPLOY.md, "Restore drill"), recorded so the
  // status card stops asking for one until next month. What was restored, in a line.
  const recordDrill: express.RequestHandler = async (req, res) => {
    try {
      const auth = (req as express.Request & { auth?: { id: string } }).auth!;
      const detail = typeof req.body?.detail === "string" ? req.body.detail.trim() : "";
      if (detail.length < 5 || detail.length > 300) {
        return res.status(400).json({ message: "Say in a line which backup was restored and what was checked (5 to 300 characters)." });
      }
      const added = await pool.query<{ id: string; finished_at: Date }>(
        `INSERT INTO backup_runs (kind, status, finished_at, detail, recorded_by)
         VALUES ('restore_drill', 'ok', NOW(), $1, $2) RETURNING id, finished_at`,
        [detail, String(auth.id)]
      );
      return res.status(201).json({
        message: "Restore drill recorded. The status card will ask again in a month.",
        drill: { id: Number(added.rows[0].id), at: added.rows[0].finished_at, detail },
      });
    } catch (error) {
      console.error("RECORD RESTORE DRILL ERROR:", error);
      return res.status(500).json({ message: "Failed to record the restore drill." });
    }
  };
  app.post("/api/coordinator/backups/restore-drill", requireCoordinatorUntilAdmin, recordDrill);
  app.post("/api/admin/backups/restore-drill", requireAdmin, recordDrill);

  // How much of their room for uploads a student has used (services/uploadQuota.ts).
  app.get("/api/coordinator/students/:studentId/upload-usage", requireCoordinator, async (req, res) => {
    try {
      const found = await pool.query(`SELECT 1 FROM students WHERE student_id = $1`, [req.params.studentId]);
      if (found.rows.length === 0) return res.status(404).json({ message: "Student not found." });
      return res.json(await uploadUsage(pool, "student", String(req.params.studentId)));
    } catch (error) {
      console.error("UPLOAD USAGE ERROR:", error);
      return res.status(500).json({ message: "Failed to read the student's uploads." });
    }
  });

  // The faults the system noticed in itself over the last week: what kind,
  // how often, when. No message text and nothing about who (services/problems.ts).
  const listProblems: express.RequestHandler = async (_req, res) => {
    try {
      const problems = await recentProblems(pool, 7, 20);
      return res.json({ days: 7, problems });
    } catch (error) {
      console.error("LIST PROBLEMS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the problems the system has noticed." });
    }
  };
  app.get("/api/coordinator/problems", requireCoordinatorUntilAdmin, listProblems);
  app.get("/api/admin/problems", requireAdmin, listProblems);

  // Writes a small file where uploads are kept, reads it back and removes
  // it: the proof that the storage settings work, without uploading a real file.
  const storageCheckAllowed = deps.createRateLimiter(3, 60_000);
  const checkStorage: express.RequestHandler = async (req, res) => {
    const auth = (req as express.Request & { auth?: { role: string; id: string } }).auth!;
    if (!storageCheckAllowed(`${auth.role}:${auth.id}`)) {
      return res.status(429).json({ message: "Wait a minute before checking again." });
    }
    const where = fileStoreKind() === "disk" ? "the server's own disk" : "object storage";
    try {
      await checkFileStore();
      return res.json({ message: `A test file was written to ${where}, read back and removed. Uploads work.`, kept_in: where });
    } catch (error) {
      // The store's reason, in the server log only: it can name the bucket.
      console.error("STORAGE CHECK ERROR:", error);
      return res.status(502).json({
        message: `A test file could not be kept in ${where}. The reason is in the server's log, on the line starting STORAGE CHECK ERROR.`,
      });
    }
  };
  app.post("/api/coordinator/storage-test", requireCoordinatorUntilAdmin, checkStorage);
  app.post("/api/admin/storage-test", requireAdmin, checkStorage);

  // One email to the signed-in person's own address, to see that email arrives.
  const testEmailAllowed = deps.createRateLimiter(3, 10 * 60_000);
  const sendTestEmail: express.RequestHandler = async (req, res) => {
    const auth = (req as express.Request & { auth?: { role: string; id: string } }).auth!;
    if (emailRoute() === null) {
      return res.status(503).json({ message: "Email is not set up on the server, so no test can be sent." });
    }
    if (!testEmailAllowed(`${auth.role}:${auth.id}`)) {
      return res.status(429).json({ message: "Wait ten minutes before sending another test email." });
    }
    try {
      const account = await pool.query<{ email: string; name: string }>(
        auth.role === "admin"
          ? `SELECT email, name FROM system_admins WHERE admin_id = $1`
          : `SELECT email, name FROM coordinators WHERE coordinator_id = $1`,
        [auth.id]
      );
      const to = account.rows[0]?.email;
      if (!to) return res.status(409).json({ message: "Your account has no email address to send a test to." });
      await sendEmail({
        kind: "account",
        to,
        subject: "INTERNet test email",
        text: `Hello ${account.rows[0].name},\n\nThis is a test from INTERNet. Email from the system reaches this address.\n\nNothing else needs to be done.`,
      });
      return res.json({ message: `A test email was sent to ${to}. It can take a minute to arrive; check the spam folder too.` });
    } catch (error) {
      if (error instanceof EmailLimitError) return res.status(429).json({ message: error.message });
      // The provider's reason, in the server log only: it can name the sender's domain.
      console.error("TEST EMAIL ERROR:", error);
      return res.status(502).json({
        message: "The email service refused the test. The reason is in the server's log, on the line starting TEST EMAIL ERROR.",
      });
    }
  };
  app.post("/api/coordinator/email-test", requireCoordinatorUntilAdmin, sendTestEmail);
  app.post("/api/admin/email-test", requireAdmin, sendTestEmail);

  app.get("/api/coordinator/actions", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      return res.json(
        await coordinatorActions(pool, { filters: read.filters, flagged: flaggedLogCondition("a") })
      );
    } catch (error) {
      console.error("COORDINATOR ACTIONS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the action list." });
    }
  });

  /** PSU redesign: the Home page's cohort line, open appeals, this week and plain counts (services/coordinatorHome.ts). */
  app.get("/api/coordinator/home", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      return res.json(await coordinatorHome(pool, read.filters));
    } catch (error) {
      console.error("COORDINATOR HOME ERROR:", error);
      return res.status(500).json({ message: "Failed to load the home page." });
    }
  });

  app.get("/api/coordinator/kpis", requireCoordinator, async (req, res) => {
    try {
      const read = readStudentFilters(req.query as Record<string, unknown>);
      if ("problem" in read) return res.status(400).json({ message: read.problem });
      return res.json(await coordinatorKpis(pool, read.filters));
    } catch (error) {
      console.error("COORDINATOR KPIS ERROR:", error);
      return res.status(500).json({ message: "Failed to work out the key figures." });
    }
  });
}
