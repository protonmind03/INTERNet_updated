import type express from "express";
import type { Pool } from "pg";
import { coordinatorActions } from "../services/coordinatorActions";
import { coordinatorKpis } from "../services/kpis";
import { readStudentFilters } from "../services/studentScope";
import { emailRoute, sendEmail } from "../services/mailer";
import { EmailLimitError, accountReserve, emailDailyLimit, emailsSentToday } from "../services/emailBudget";
import { PRIVACY_NOTICE, consentRequired, photoRetentionDays } from "../services/privacy";
import { checkFileStore, fileStoreKind } from "../services/privateFileStore";
import { recentProblems } from "../services/problems";
import { PURGE_TIME, lastPhotoPurge } from "../services/photoPurge";

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
  /** The server's rule for a flagged attendance log, as SQL on an alias. */
  flaggedLogCondition: (alias: string) => string;
  /** Whether the push keys are set. */
  pushConfigured: () => boolean;
  createRateLimiter: (max: number, windowMs: number) => (key: string) => boolean;
};

export function registerConsoleRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireCoordinator, flaggedLogCondition } = deps;

  /*
  | What is switched on
  |
  | The parts of the system that depend on a setting of the host: email,
  | push, where files are kept, the privacy switches. A coordinator sees
  | which are on, so nobody has to read the host's settings page to know
  | why a reset email did not arrive. It says on or off and how; it never
  | carries a key, an address or any other value of a setting.
  */
  app.get("/api/coordinator/system-status", requireCoordinator, async (_req, res) => {
    try {
      const route = emailRoute();
      const limit = route ? emailDailyLimit() : null;
      return res.json({
        email: {
          on: route !== null,
          through: route === "api" ? "provider" : route === "smtp" ? "smtp" : null,
          // A reset link is built from the site's address.
          reset_links: route !== null && Boolean(process.env.FRONTEND_URL),
          daily_limit: limit,
          kept_for_password_resets: limit === null ? null : accountReserve(limit),
          sent_today: limit === null ? null : await emailsSentToday(pool),
        },
        push: { on: deps.pushConfigured() },
        files: { kept_in: fileStoreKind() === "disk" ? "the server's own disk" : "object storage" },
        privacy: {
          consent_asked: consentRequired(),
          notice_is_placeholder: PRIVACY_NOTICE.placeholder,
          photo_retention_days: photoRetentionDays(),
          photo_purge_time: PURGE_TIME,
          last_photo_purge: await lastPhotoPurge(pool),
        },
      });
    } catch (error) {
      console.error("SYSTEM STATUS ERROR:", error);
      return res.status(500).json({ message: "Failed to read what is switched on." });
    }
  });

  // The faults the system noticed in itself over the last week: what kind,
  // how often, when. No message text and nothing about who (services/problems.ts).
  app.get("/api/coordinator/problems", requireCoordinator, async (_req, res) => {
    try {
      const problems = await recentProblems(pool, 7, 20);
      return res.json({ days: 7, problems });
    } catch (error) {
      console.error("LIST PROBLEMS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the problems the system has noticed." });
    }
  });

  // Writes a small file where uploads are kept, reads it back and removes
  // it: the proof that the storage settings work, without uploading a real file.
  const storageCheckAllowed = deps.createRateLimiter(3, 60_000);
  app.post("/api/coordinator/storage-test", requireCoordinator, async (req, res) => {
    const auth = (req as express.Request & { auth?: { id: string } }).auth!;
    if (!storageCheckAllowed(auth.id)) {
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
  });

  // One email to the coordinator's own address, to see that email arrives.
  const testEmailAllowed = deps.createRateLimiter(3, 10 * 60_000);
  app.post("/api/coordinator/email-test", requireCoordinator, async (req, res) => {
    const auth = (req as express.Request & { auth?: { id: string } }).auth!;
    if (emailRoute() === null) {
      return res.status(503).json({ message: "Email is not set up on the server, so no test can be sent." });
    }
    if (!testEmailAllowed(auth.id)) {
      return res.status(429).json({ message: "Wait ten minutes before sending another test email." });
    }
    try {
      const account = await pool.query<{ email: string; name: string }>(
        `SELECT email, name FROM coordinators WHERE coordinator_id = $1`,
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
  });

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
