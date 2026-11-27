import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Pool } from "pg";
import {
  ACCOUNT_ACTIONS,
  AccountActionError,
  actOnAccount,
  createAccount,
  isAccountRole,
  searchAccounts,
  tellTheOffice,
  type AccountAction,
  type AccountDeps,
  type OversightDeps,
} from "../services/adminAccounts";
import { backupStatus, runUploadsPackIfDue } from "../services/backups";
import { EmailLimitError } from "../services/emailBudget";
import { fileStoreKind } from "../services/privateFileStore";
import { campusOf } from "../services/staffIds";
import { productionWarnings } from "../services/systemStatus";

/*
|--------------------------------------------------------------------------
| THE IT ADMINISTRATOR'S PORTAL (Phase 1.7)
|--------------------------------------------------------------------------
|
| Administrator only. The person who runs the system: accounts (who, never
| what is in them), whether the server is well, backups, the settings a
| live site must have, and the maintenance notice every portal shows.
| System status, the problems log, the restore drill and the two tests are
| in routes/console.ts, shared with the coordinators until this account
| exists; the audit log is in routes/extensions.ts.
|
| Nothing here returns a student's records, documents, photos, evaluations,
| grades or messages, and the administrator is refused every route that
| does (requireRole lists who may use each, and "admin" is on none of them;
| the test "the administrator is refused..." walks them all).
|
*/

type Authed = express.Request & { auth?: { role: string; id: string } };
type Dependencies = Omit<AccountDeps, "pool"> & Pick<OversightDeps, "notify"> & {
  pushConfigured: () => boolean;
  pool: Pool;
  requireAdmin: express.RequestHandler;
};

const MIGRATIONS_DIRECTORY = path.resolve(__dirname, "..", "..", "migrations");

/** The maintenance notice: 3 to 300 characters, or nothing. */
export const NOTICE_LIMITS = { min: 3, max: 300 } as const;

export function registerAdminRoutes(app: express.Express, deps: Dependencies): void {
  const { pool, requireAdmin } = deps;
  const accountDeps: AccountDeps = deps;

  const answerError = (res: express.Response, label: string, fallback: string, error: unknown) => {
    if (error instanceof AccountActionError) {
      return res.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    if (error instanceof EmailLimitError) return res.status(429).json({ message: error.message });
    console.error(`${label}:`, error);
    return res.status(500).json({ message: fallback });
  };

  // Accounts of every kind by name, email or ID: who they are, never what is in them.
  app.get("/api/admin/accounts", requireAdmin, async (req, res) => {
    try {
      const role = req.query.role === undefined || req.query.role === "" ? null : req.query.role;
      if (role !== null && !isAccountRole(role)) return res.status(400).json({ message: "Choose a kind of account." });
      const words = typeof req.query.q === "string" ? req.query.q : "";
      return res.json({ accounts: await searchAccounts(accountDeps, words, role) });
    } catch (error) {
      return answerError(res, "ADMIN ACCOUNT SEARCH ERROR", "Failed to search the accounts.", error);
    }
  });

  // One action on one account: unlock, end_sessions, deactivate, reactivate, temporary_password.
  app.post("/api/admin/accounts/:role/:id", requireAdmin, async (req, res) => {
    try {
      const { role, id } = req.params;
      const action = req.body?.action as AccountAction;
      if (!isAccountRole(role)) return res.status(404).json({ message: "Account not found." });
      if (!ACCOUNT_ACTIONS.includes(action)) return res.status(400).json({ message: "Choose what to do to the account." });
      const actor = { id: (req as Authed).auth!.id };
      const done = await actOnAccount(accountDeps, actor, role, String(id), action);
      // A Director or administrator back in use: the rest of the office is told.
      if (action === "reactivate" && (role === "director" || role === "admin")) {
        await tellTheOffice(deps, { what: "reactivated", kind: role, account: done.account, actor });
      }
      return res.json(done);
    } catch (error) {
      return answerError(res, "ADMIN ACCOUNT ACTION ERROR", "Failed to change the account.", error);
    }
  });

  // A new OJT Director or administrator; the temporary password goes to them by email.
  app.post("/api/admin/accounts", requireAdmin, async (req, res) => {
    try {
      const kind = req.body?.kind;
      if (kind !== "director" && kind !== "admin") {
        return res.status(400).json({
          message: "Only OJT Director and administrator accounts are made here. Coordinators make students and supervisors; the Director makes coordinators.",
        });
      }
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      // An administrator's ID is YY-CODE-0NN on its campus (services/staffIds.ts).
      const campus = campusOf(req.body?.campus);
      if (kind === "admin" && !campus) {
        return res.status(400).json({ message: "Choose the administrator's campus." });
      }
      const made = await createAccount(accountDeps, kind, email, name, campus);
      // A new Director or administrator: the rest of the office is told.
      await tellTheOffice(deps, { what: "made", kind, account: made.account, actor: { id: (req as Authed).auth!.id } });
      return res.status(201).json(made);
    } catch (error) {
      return answerError(res, "ADMIN CREATE ACCOUNT ERROR", "Failed to make the account.", error);
    }
  });

  /*
  | Whether the server is well: the database answers, which migrations ran
  | (and whether any on disk has not), and the uploads kept, in totals by
  | kind of account and of file; never whose.
  */
  app.get("/api/admin/health", requireAdmin, async (_req, res) => {
    try {
      const started = Date.now();
      const [ran, usage] = await Promise.all([
        pool.query<{ filename: string }>(`SELECT filename FROM schema_migrations ORDER BY filename`),
        pool.query<{ role: string; kind: string; files: string; bytes: string }>(
          `SELECT role, kind, COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes
           FROM upload_ledger GROUP BY role, kind ORDER BY role, kind`
        ),
      ]);
      const onDisk = fs.existsSync(MIGRATIONS_DIRECTORY)
        ? fs.readdirSync(MIGRATIONS_DIRECTORY).filter((name) => name.endsWith(".sql")).sort()
        : [];
      const done = new Set(ran.rows.map((row) => row.filename));
      return res.json({
        database: { ok: true, answered_in_ms: Date.now() - started },
        migrations: {
          latest: ran.rows.at(-1)?.filename ?? null,
          count: ran.rows.length,
          waiting: onDisk.filter((name) => !done.has(name)),
        },
        server: { uptime_minutes: Math.floor(process.uptime() / 60), node: process.version },
        uploads: {
          kept_in: fileStoreKind() === "disk" ? "the server's own disk" : "object storage",
          by_kind: usage.rows.map((row) => ({ role: row.role, kind: row.kind, files: Number(row.files), bytes: Number(row.bytes) })),
        },
      });
    } catch (error) {
      console.error("ADMIN HEALTH ERROR:", error);
      return res.status(503).json({ database: { ok: false }, message: "The database did not answer." });
    }
  });

  /*
  | Backups: the state card, the last runs and the last photo removals.
  | Object keys say where in the bucket a file went; the bucket's own keys
  | and the encryption key are never read here.
  */
  app.get("/api/admin/backups", requireAdmin, async (_req, res) => {
    try {
      const [status, runs, purges] = await Promise.all([
        backupStatus(pool),
        pool.query(
          `SELECT id, kind, status, started_at, finished_at, size_bytes, detail FROM backup_runs
           ORDER BY started_at DESC, id DESC LIMIT 20`
        ),
        pool.query(
          `SELECT id, ran_on, ran_at, retention_days, removed, failed, by_hand FROM photo_purge_runs
           ORDER BY ran_at DESC, id DESC LIMIT 10`
        ),
      ]);
      return res.json({
        status,
        runs: runs.rows.map((row) => ({ ...row, id: Number(row.id), size_bytes: row.size_bytes === null ? null : Number(row.size_bytes) })),
        photo_purges: purges.rows.map((row) => ({ ...row, id: Number(row.id) })),
      });
    } catch (error) {
      console.error("ADMIN BACKUPS ERROR:", error);
      return res.status(500).json({ message: "Failed to load the backups." });
    }
  });

  // "Back up uploaded files now": the weekly pack, started at once (services/backups.ts).
  app.post("/api/admin/backups/uploads", requireAdmin, async (_req, res) => {
    try {
      if (fileStoreKind() !== "disk") {
        return res.status(409).json({ message: "Uploaded files are kept in object storage, which keeps its own copies. Nothing to pack." });
      }
      const started = await runUploadsPackIfDue(pool, { force: true });
      if (started === null) {
        return res.status(409).json({
          message: "The backup could not start: backups are not set up on this server, or one is already running.",
        });
      }
      return res.status(202).json({ message: "The backup of uploaded files has started. Its result shows here when it ends." });
    } catch (error) {
      console.error("ADMIN UPLOADS BACKUP ERROR:", error);
      return res.status(500).json({ message: "Failed to start the backup." });
    }
  });

  // The settings a live site must have, each on or off.
  app.get("/api/admin/warnings", requireAdmin, async (_req, res) => {
    try {
      return res.json({ warnings: productionWarnings(deps.pushConfigured(), await backupStatus(pool)) });
    } catch (error) {
      console.error("ADMIN WARNINGS ERROR:", error);
      return res.status(500).json({ message: "Failed to read the settings." });
    }
  });

  // The maintenance notice every portal shows at the top; empty takes it down.
  app.put("/api/admin/notice", requireAdmin, async (req, res) => {
    try {
      const given = req.body?.message;
      if (given !== null && typeof given !== "string") return res.status(400).json({ message: "Write the notice, or leave it empty." });
      const message = typeof given === "string" && given.trim() ? given.trim().replace(/\s+/g, " ") : null;
      if (message !== null && (message.length < NOTICE_LIMITS.min || message.length > NOTICE_LIMITS.max)) {
        return res.status(400).json({ message: `A notice is ${NOTICE_LIMITS.min} to ${NOTICE_LIMITS.max} characters.` });
      }
      const old = await pool.query<{ message: string | null }>(`SELECT message FROM system_notice WHERE id = 1`);
      const saved = await pool.query<{ message: string | null; updated_at: Date }>(
        `INSERT INTO system_notice (id, message, updated_by, updated_at) VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING message, updated_at`,
        [message, String((req as Authed).auth!.id)]
      );
      return res.json({
        message: message ? "The notice now shows in every portal." : "The notice is taken down.",
        old: old.rows[0]?.message ?? null,
        notice: saved.rows[0],
      });
    } catch (error) {
      console.error("ADMIN NOTICE ERROR:", error);
      return res.status(500).json({ message: "Failed to save the notice." });
    }
  });

  // Anyone may read the notice, signed in or not: it holds nothing personal.
  app.get("/api/system-notice", async (_req, res) => {
    try {
      const found = await pool.query<{ message: string | null; updated_at: Date }>(
        `SELECT message, updated_at FROM system_notice WHERE id = 1`
      );
      const row = found.rows[0];
      return res.json({ notice: row?.message ? { message: row.message, updated_at: row.updated_at } : null });
    } catch (error) {
      console.error("READ SYSTEM NOTICE ERROR:", error);
      return res.status(500).json({ message: "Failed to read the notice." });
    }
  });
}
