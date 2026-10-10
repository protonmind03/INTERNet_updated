// Must stay first: the service modules below read process.env when imported.
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Pool } from "pg";
import multer from "multer";
import { createHash, randomBytes, randomInt } from "node:crypto";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import webpush from "web-push";
import {
  deletePrivateFile,
  isAzureBlobStorageConfigured,
  readPrivateFile,
  savePrivateFile,
} from "./services/privateFileStore";
import { isSmtpConfigured, sendEmail } from "./services/mailer";
import {
  publishNotification,
  closeNotificationStreams,
  registerNotificationStream,
  startPostgresNotificationListener,
} from "./services/liveNotifications";
import { startDeadlineReminderScheduler } from "./services/deadlineReminders";
import { clientErrorRecord, createRateLimiter } from "./services/clientErrors";
import {
  readOfflineStamp,
  type LogTimes,
  type OfflineAction,
} from "./services/offlineActions";
import { registerExtensionRoutes } from "./routes/extensions";

// Attendance timestamps are stored as Philippine wall-clock time. Node must
// read them in the same zone, or a host running on UTC shifts every
// displayed time by eight hours.
// Set unconditionally: a host that presets TZ (for example to UTC) would
// otherwise shift them just the same.
process.env.TZ = "Asia/Manila";

const app = express();

// Hosting platforms put the API behind one reverse proxy. Without this,
// req.ip is the proxy's address and every user shares one rate limit.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

// In production only the deployed frontend (FRONTEND_URL, plus any extra
// comma-separated origins in CORS_ORIGINS) may call the API from a browser.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
]
  .map((origin) => (origin || "").trim().replace(/\/+$/, ""))
  .filter(Boolean);

// Standard security headers. The frontend lives on another origin and
// downloads files from this API, so cross-origin reads stay allowed here
// and are restricted by CORS and per-record authorization instead.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  process.env.NODE_ENV === "production" && allowedOrigins.length > 0
    ? cors({ origin: allowedOrigins })
    : cors()
);

// Crash reports from the browser. Registered before the general body parser
// so it can have a much smaller size limit of its own. See
// services/clientErrors.ts for what is kept.
const clientErrorBody = express.json({ limit: "8kb" });
const clientErrorAllowed = createRateLimiter(10, 60_000);
app.post("/api/client-errors", (req, res) => {
  clientErrorBody(req, res, (parseError?: unknown) => {
    if (parseError) {
      const tooLarge =
        (parseError as { type?: string }).type === "entity.too.large";
      return res
        .status(tooLarge ? 413 : 400)
        .json({ message: tooLarge ? "Report too large." : "Report not readable." });
    }
    if (!clientErrorAllowed(req.ip || "unknown")) {
      return res.status(429).json({ message: "Too many reports. Try again later." });
    }
    const record = clientErrorRecord(req.body);
    if (!record) {
      return res.status(400).json({ message: "A report needs a message." });
    }
    console.error("CLIENT ERROR:", JSON.stringify(record));
    return res.status(204).end();
  });
});

app.use(express.json());

// Unauthenticated liveness probe for the hosting platform's health check.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API answers carry personal records, so neither the browser nor anything
// between it and this server may keep a copy. The two public, non-personal
// routes are left alone, and the event stream sets its own header.
const CACHEABLE_PATHS = new Set(["/api/health", "/api/push/vapid-public-key"]);
app.use("/api", (req, res, next) => {
  if (!CACHEABLE_PATHS.has(req.originalUrl.split("?")[0])) {
    res.setHeader("Cache-Control", "private, no-store");
  }
  next();
});

// In production, never send raw server/database error text to clients.
// Handlers include `error: error.message` in 500 responses for local
// debugging; this strips it before the response leaves the server.
if (process.env.NODE_ENV === "production") {
  app.use((_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body?: unknown) => {
      if (
        res.statusCode >= 500 &&
        body &&
        typeof body === "object" &&
        "error" in body
      ) {
        const { error: _hidden, ...safeBody } = body as Record<string, unknown>;
        return originalJson(safeBody);
      }
      return originalJson(body);
    };
    next();
  });
}

/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

console.log(
  "DATABASE_PUBLIC_URL exists:",
  !!process.env.DATABASE_PUBLIC_URL
);

const databaseUrl = process.env.DATABASE_PUBLIC_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_PUBLIC_URL must be configured before starting the API.");
}
if (/USER:PASSWORD@HOST:PORT\/DATABASE/i.test(databaseUrl)) {
  throw new Error(
    "DATABASE_PUBLIC_URL still contains template values; configure backend/.env."
  );
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error(
    "DATABASE_PUBLIC_URL must be a valid PostgreSQL URL. Keep credentials in backend/.env."
  );
}
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
  !parsedDatabaseUrl.hostname ||
  parsedDatabaseUrl.pathname.length < 2
) {
  throw new Error(
    "DATABASE_PUBLIC_URL must include a PostgreSQL scheme, host, and database name."
  );
}

const databaseHost = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, "");
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(
  databaseHost
);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  options: "-c timezone=Asia/Manila",
});

const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
const vapidSubject = process.env.WEB_PUSH_SUBJECT;
if ([vapidPublicKey, vapidPrivateKey, vapidSubject].some(Boolean)) {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error(
      "WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT must all be configured together."
    );
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function isWebPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);
}

// The page a tapped push notification opens, by recipient and subject, so
// the tap lands on the thing the notification is about.
const pushTargets: Record<
  "coordinator" | "student" | "supervisor",
  { fallback: string; byType: Record<string, string> }
> = {
  student: {
    fallback: "/notifications",
    byType: {
      attendance: "/daily-log",
      task: "/task",
      document: "/documents",
      schedule: "/schedule",
    },
  },
  supervisor: {
    fallback: "/supervisor/notifications",
    byType: {
      attendance: "/supervisor/attendance",
      task: "/supervisor/tasks",
      document: "/supervisor/documents",
      complaint: "/supervisor/complaints",
    },
  },
  coordinator: {
    fallback: "/coordinator/notifications",
    byType: {
      attendance: "/coordinator/monitoring",
      document: "/coordinator/documents",
      complaint: "/coordinator/complaints",
    },
  },
};

async function sendWebPush(
  recipient: { role: "coordinator" | "student" | "supervisor"; id: string },
  notification: {
    title: string;
    message: string;
    id: number;
    type?: string;
  }
): Promise<void> {
  const result = await pool.query<{ id: number; subscription: webpush.PushSubscription }>(
    `SELECT id, subscription FROM web_push_subscriptions WHERE role = $1 AND account_id = $2`,
    [recipient.role, recipient.id]
  );
  await Promise.all(
    result.rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          row.subscription,
          JSON.stringify({
            title: notification.title,
            body: notification.message,
            notificationId: notification.id,
            url:
              pushTargets[recipient.role].byType[notification.type || ""] ||
              pushTargets[recipient.role].fallback,
          }),
          { TTL: 86400 }
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await pool.query(
            "DELETE FROM web_push_subscriptions WHERE id = $1",
            [row.id]
          );
        } else {
          console.error("WEB PUSH DELIVERY ERROR:", error);
        }
      }
    })
  );
}

pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error
  );
});

/*
|--------------------------------------------------------------------------
| AUTH HELPERS (JWT + PASSWORD HASHING)
|--------------------------------------------------------------------------
|
| Student/supervisor accounts were created with plain-text passwords
| before this migration, so `verifyPassword` accepts either a bcrypt
| hash (new accounts, and anything created through the coordinator's
| User Management screens) or a legacy plain-text match, so existing
| logins keep working. New accounts should always be hashed going
| forward — `hashPassword` is used everywhere a password is written.
|
*/

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  if (/replace-this/i.test(secret)) {
    throw new Error(
      "JWT_SECRET still contains the .env.example placeholder; set a random value."
    );
  }
  return secret;
}

const JWT_SECRET = requireJwtSecret();
const accountTables = {
  student: { table: "students", idColumn: "student_id" },
  supervisor: { table: "supervisors", idColumn: "supervisor_id" },
  coordinator: { table: "coordinators", idColumn: "coordinator_id" },
} as const;

const genericResetMessage =
  "If an active account matches that email, password-reset instructions will be sent.";

app.post("/api/auth/password-reset/request", async (req, res) => {
  const role = req.body?.role as keyof typeof accountTables;
  const email =
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!(role in accountTables) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid role and email address." });
  }
  if (!isSmtpConfigured() || !process.env.FRONTEND_URL) {
    return res.status(503).json({
      message: "Password recovery is temporarily unavailable. Contact your OJT coordinator.",
    });
  }

  const ipHash = createHash("sha256")
    .update(String(req.ip || req.socket.remoteAddress || "unknown"))
    .digest("hex");
  const ipLimit = await pool.query<{ attempt_count: number }>(
    `
    INSERT INTO password_reset_ip_limits(ip_hash, window_started_at, attempt_count)
    VALUES ($1, NOW(), 1)
    ON CONFLICT (ip_hash) DO UPDATE
    SET attempt_count = CASE
          WHEN password_reset_ip_limits.window_started_at < NOW() - INTERVAL '15 minutes'
            THEN 1
          ELSE password_reset_ip_limits.attempt_count + 1
        END,
        window_started_at = CASE
          WHEN password_reset_ip_limits.window_started_at < NOW() - INTERVAL '15 minutes'
            THEN NOW()
          ELSE password_reset_ip_limits.window_started_at
        END
    RETURNING attempt_count
    `,
    [ipHash]
  );
  if (Number(ipLimit.rows[0]?.attempt_count) > 5) {
    return res.status(429).json({
      message: "Too many password-reset requests. Try again in 15 minutes.",
    });
  }

  let frontendUrl: URL;
  try {
    frontendUrl = new URL(process.env.FRONTEND_URL);
  } catch {
    console.error("FRONTEND_URL must be an absolute HTTP or HTTPS URL.");
    return res.status(503).json({
      message: "Password recovery is temporarily unavailable. Contact your OJT coordinator.",
    });
  }
  if (
    !["http:", "https:"].includes(frontendUrl.protocol) ||
    (frontendUrl.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(frontendUrl.hostname))
  ) {
    console.error("FRONTEND_URL must use HTTPS except for local development.");
    return res.status(503).json({
      message: "Password recovery is temporarily unavailable. Contact your OJT coordinator.",
    });
  }

  const emailHash = createHash("sha256").update(email).digest("hex");
  const throttle = await pool.query(
    `
    INSERT INTO password_reset_requests(email_hash, requested_at)
    VALUES ($1, NOW())
    ON CONFLICT (email_hash) DO UPDATE
      SET requested_at = NOW()
      WHERE password_reset_requests.requested_at < NOW() - INTERVAL '60 seconds'
    RETURNING email_hash
    `,
    [emailHash]
  );
  if (throttle.rows.length === 0) {
    return res.json({ message: genericResetMessage });
  }

  const account = accountTables[role];
  const found = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT ${account.idColumn} AS id, email, name FROM ${account.table}
     WHERE LOWER(email) = $1 AND is_active = TRUE`,
    [email]
  );
  if (found.rows.length === 0) {
    return res.json({ message: genericResetMessage });
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE role = $1 AND account_id = $2 AND used_at IS NULL`,
      [role, found.rows[0].id]
    );
    await client.query(
      `INSERT INTO password_reset_tokens(role, account_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
      [role, found.rows[0].id, tokenHash]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("CREATE PASSWORD RESET TOKEN ERROR:", error);
    return res.status(500).json({ message: "Could not start password recovery." });
  } finally {
    client.release();
  }

  const resetUrl = new URL("/reset-password", frontendUrl);
  resetUrl.searchParams.set("token", rawToken);
  // The email goes out after the reply. Waiting for the mail server here
  // made a known address answer slower than (and, on a mail failure,
  // differently from) an unknown one, which told a caller which emails exist.
  void sendEmail({
    to: found.rows[0].email,
    subject: "Reset your INTERNet account password",
    text: `Hello ${found.rows[0].name},\n\nUse this link within 30 minutes to set a new password:\n${resetUrl.href}\n\nIf you did not request this, ignore this message.`,
  }).catch(async (error) => {
    console.error("SEND PASSWORD RESET EMAIL ERROR:", error);
    await pool
      .query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1",
        [tokenHash]
      )
      .catch((cleanupError) =>
        console.error("EXPIRE UNSENT RESET TOKEN ERROR:", cleanupError)
      );
  });

  return res.json({ message: genericResetMessage });
});

app.post("/api/auth/password-reset/confirm", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return res.status(400).json({ message: "This password-reset link is invalid or expired." });
  }
  if (passwordPolicyError(password)) {
    return res.status(400).json({
      message: "Use 12–128 characters with at least one uppercase letter, one lowercase letter, and one number.",
    });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query<{
      role: keyof typeof accountTables;
      account_id: string;
    }>(
      `SELECT role, account_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    if (reset.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This password-reset link is invalid or expired.",
      });
    }

    const { role, account_id: accountId } = reset.rows[0];
    const account = accountTables[role];
    const updated = await client.query(
      `UPDATE ${account.table}
       SET password = $1, auth_version = auth_version + 1,
           must_change_password = FALSE
       WHERE ${account.idColumn} = $2 AND is_active = TRUE`,
      [await hashPassword(password), accountId]
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This password-reset link is invalid or expired.",
      });
    }
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE role = $1 AND account_id = $2 AND used_at IS NULL`,
      [role, accountId]
    );
    await client.query("COMMIT");
    closeNotificationStreams({ role, id: accountId });
    return res.json({ message: "Password updated. You can now sign in." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("CONFIRM PASSWORD RESET ERROR:", error);
    return res.status(500).json({ message: "Could not update the password." });
  } finally {
    client.release();
  }
});

const BCRYPT_ROUNDS = 12;
const PASSWORD_POLICY_MESSAGE =
  "Use 12–128 characters with at least one uppercase letter, one lowercase letter, and one number.";

/** Returns the reason a new password is unacceptable, or null if it is fine. */
function passwordPolicyError(password: unknown): string | null {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return PASSWORD_POLICY_MESSAGE;
  }
  return null;
}

// Forcing a first-login password change is enforced on the deployed system
// only, so local demo accounts and the API tests keep working unchanged.
const ENFORCE_PASSWORD_CHANGE = process.env.NODE_ENV === "production";
const PASSWORD_CHANGE_PATH =
  /^\/api\/(students|supervisors|coordinators)\/[^/]+\/password\/?$/;

function passwordChangeBlocks(
  req: express.Request,
  mustChangePassword: boolean | undefined
): boolean {
  return (
    ENFORCE_PASSWORD_CHANGE &&
    mustChangePassword === true &&
    !PASSWORD_CHANGE_PATH.test(req.path) &&
    req.path !== "/api/logout"
  );
}

// Sent with every "this login is no longer valid" response so the frontend
// can tell it apart from an ordinary 401/403 (for example a wrong current
// password) and return the user to the login page.
const SESSION_INVALID = "SESSION_INVALID";

const PASSWORD_CHANGE_REQUIRED_RESPONSE = {
  code: "PASSWORD_CHANGE_REQUIRED",
  message: "Set a new password before using the system.",
};

async function hashPassword(
  plain: string
): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function needsRehash(stored: unknown): boolean {
  if (typeof stored !== "string" || !stored.startsWith("$2")) return true;
  try {
    return bcrypt.getRounds(stored) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

/**
 * Verifies the current password, stores the new one, and ends every other
 * session for the account. Returns a fresh token for the device that made
 * the change so it stays signed in.
 */
async function changeOwnPassword(
  role: keyof typeof accountTables,
  accountId: string,
  currentPassword: unknown,
  newPassword: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    !currentPassword ||
    !newPassword
  ) {
    return {
      status: 400,
      body: { message: "Current and new password are required." },
    };
  }
  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    return { status: 400, body: { message: policyError } };
  }
  if (newPassword === currentPassword) {
    return {
      status: 400,
      body: { message: "The new password must differ from the current one." },
    };
  }

  const { table, idColumn } = accountTables[role];
  const result = await pool.query<{ password: string }>(
    `SELECT password FROM ${table} WHERE ${idColumn} = $1`,
    [accountId]
  );
  if (result.rows.length === 0) {
    return { status: 404, body: { message: "Account not found." } };
  }
  if (!(await verifyPassword(currentPassword, result.rows[0].password))) {
    return {
      status: 401,
      body: { message: "Current password is incorrect." },
    };
  }

  const updated = await pool.query<{ auth_version: number }>(
    `UPDATE ${table}
     SET password = $1,
         auth_version = auth_version + 1,
         must_change_password = FALSE
     WHERE ${idColumn} = $2
     RETURNING auth_version`,
    [await hashPassword(newPassword), accountId]
  );
  closeNotificationStreams({ role, id: accountId });
  return {
    status: 200,
    body: {
      message: "Password updated. Other devices have been signed out.",
      token: signToken(role, accountId, Number(updated.rows[0].auth_version)),
    },
  };
}

async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  const looksHashed =
    typeof stored === "string" &&
    stored.startsWith("$2");

  if (looksHashed) {
    return bcrypt.compare(plain, stored);
  }

  // Legacy plain-text row — compare directly.
  return plain === stored;
}

/**
 * Re-hashes a legacy plain-text password with bcrypt after a successful
 * login so that plain-text credentials disappear from the database over
 * time without forcing a password reset.
 */
async function upgradeLegacyPassword(
  role: keyof typeof accountTables,
  accountId: string,
  plain: string,
  stored: string
): Promise<void> {
  if (!needsRehash(stored)) return;
  const { table, idColumn } = accountTables[role];
  try {
    await pool.query(
      `UPDATE ${table} SET password = $1 WHERE ${idColumn} = $2 AND password = $3`,
      [await hashPassword(plain), accountId, stored]
    );
  } catch (error) {
    console.error("LEGACY PASSWORD UPGRADE ERROR:", error);
  }
}

/*
|--------------------------------------------------------------------------
| LOGIN THROTTLING
|--------------------------------------------------------------------------
|
| After LOGIN_MAX_FAILURES failed attempts for the same role + email within
| LOGIN_WINDOW_MINUTES, that login is locked for LOGIN_LOCK_MINUTES. State
| is stored in PostgreSQL (hashed keys only) so it survives restarts and is
| shared by every API instance.
|
*/

const LOGIN_MAX_FAILURES = Math.max(
  1,
  Number(process.env.LOGIN_MAX_FAILURES) || 5
);
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_LOCK_MINUTES = 15;

function loginAttemptKey(role: string, identifier: unknown): string {
  return createHash("sha256")
    .update(`${role}:${String(identifier ?? "").trim().toLowerCase()}`)
    .digest("hex");
}

// Failed logins per client address, across all accounts. This stops one
// address from trying a few passwords on many different accounts. The
// default is generous because a whole campus can share one address.
const LOGIN_IP_MAX_FAILURES = Math.max(
  1,
  Number(process.env.LOGIN_IP_MAX_FAILURES) || 100
);
const loginFailuresByIp = new Map<string, { count: number; resetAt: number }>();

function loginGuard(role: keyof typeof accountTables): express.RequestHandler {
  return async (req, res, next) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const ipState = loginFailuresByIp.get(ip);
    if (ipState && ipState.resetAt <= now) {
      loginFailuresByIp.delete(ip);
    } else if (ipState && ipState.count >= LOGIN_IP_MAX_FAILURES) {
      return res.status(429).json({
        message: "Too many failed login attempts from this network. Try again later.",
      });
    }
    res.on("finish", () => {
      if (res.statusCode !== 401) return;
      const current = loginFailuresByIp.get(ip);
      if (current && current.resetAt > Date.now()) {
        current.count += 1;
      } else {
        if (loginFailuresByIp.size > 10_000) loginFailuresByIp.clear();
        loginFailuresByIp.set(ip, {
          count: 1,
          resetAt: Date.now() + LOGIN_WINDOW_MINUTES * 60_000,
        });
      }
    });

    const identifier = req.body?.email;
    if (!identifier || typeof identifier !== "string") return next();
    const tooMany = (lockedUntil: Date) =>
      res.status(429).json({
        message: `Too many failed login attempts. Try again in ${Math.max(
          1,
          Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000)
        )} minute(s) or reset your password.`,
      });

    let key = loginAttemptKey(role, identifier);
    try {
      // Count against the account, not the text typed: a student's email
      // and student ID are the same login and share one allowance.
      const { table, idColumn } = accountTables[role];
      const account = await pool.query<{ id: string }>(
        `SELECT ${idColumn} AS id FROM ${table}
         WHERE LOWER(email) = LOWER(TRIM($1))
            ${role === "student" ? `OR ${idColumn}::text = TRIM($1)` : ""}
         LIMIT 1`,
        [identifier]
      );
      if (account.rows[0]) key = loginAttemptKey(role, account.rows[0].id);

      // The attempt is counted before the password is checked, so a burst
      // of parallel guesses cannot all slip in ahead of the lock.
      const state = await pool.query<{ failures: number; locked_until: Date | null }>(
        `
        INSERT INTO login_attempts (key_hash, window_start, failures)
        VALUES ($1, NOW(), 1)
        ON CONFLICT (key_hash) DO UPDATE SET
          failures = CASE
            WHEN login_attempts.locked_until > NOW() THEN login_attempts.failures
            WHEN login_attempts.window_start < NOW() - make_interval(mins => $2)
            THEN 1 ELSE login_attempts.failures + 1 END,
          window_start = CASE
            WHEN login_attempts.locked_until > NOW() THEN login_attempts.window_start
            WHEN login_attempts.window_start < NOW() - make_interval(mins => $2)
            THEN NOW() ELSE login_attempts.window_start END,
          locked_until = CASE
            WHEN login_attempts.locked_until > NOW() THEN login_attempts.locked_until
            WHEN login_attempts.window_start >= NOW() - make_interval(mins => $2)
             AND login_attempts.failures + 1 > $3
            THEN NOW() + make_interval(mins => $4) ELSE NULL END
        RETURNING failures, locked_until
        `,
        [key, LOGIN_WINDOW_MINUTES, LOGIN_MAX_FAILURES, LOGIN_LOCK_MINUTES]
      );
      const lockedUntil = state.rows[0]?.locked_until;
      if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
        return tooMany(lockedUntil);
      }
    } catch (error) {
      console.error("LOGIN THROTTLE CHECK ERROR:", error);
    }

    res.on("finish", () => {
      const query =
        res.statusCode === 401
          ? // The failure that uses up the allowance starts the lock.
            pool.query(
              `UPDATE login_attempts
               SET locked_until = NOW() + make_interval(mins => $3)
               WHERE key_hash = $1 AND failures >= $2 AND locked_until IS NULL`,
              [key, LOGIN_MAX_FAILURES, LOGIN_LOCK_MINUTES]
            )
          : res.statusCode === 200
            ? pool.query(`DELETE FROM login_attempts WHERE key_hash = $1`, [key])
            : // Not a wrong password (bad request, deactivated, server
              // error): give the counted attempt back.
              pool.query(
                `UPDATE login_attempts SET failures = GREATEST(failures - 1, 0)
                 WHERE key_hash = $1 AND locked_until IS NULL`,
                [key]
              );
      query.catch((error) => {
        console.error("LOGIN THROTTLE RECORD ERROR:", error);
      });
    });

    return next();
  };
}

type AuthedRequest = express.Request & {
  auth?: {
    role: "coordinator" | "supervisor" | "student";
    id: string;
  };
};

type AuthRole = NonNullable<AuthedRequest["auth"]>["role"];

function isAuthRole(value: unknown): value is AuthRole {
  return (
    value === "coordinator" ||
    value === "student" ||
    value === "supervisor"
  );
}

function signToken(
  role: "coordinator" | "supervisor" | "student",
  id: string,
  authVersion = 0
): string {
  return jwt.sign(
    { role, id, authVersion },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

// A token handed back at sign-out is refused from then on, even though its
// signature stays valid until it expires.
const REVOKED_TOKEN_SQL =
  "EXISTS (SELECT 1 FROM revoked_tokens WHERE token_hash = $2)";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Requires a valid Bearer token belonging to a coordinator.
 * Used to protect the coordinator's user-management, monitoring,
 * complaint-resolution, and analytics endpoints below.
 */
async function requireCoordinator(
  req: AuthedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message: "Missing authorization token.", code: SESSION_INVALID,
    });
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token.", code: SESSION_INVALID,
    });
  }

  if (
    typeof payload === "string" ||
    payload.role !== "coordinator" ||
    typeof payload.id !== "string"
  ) {
    return res.status(403).json({
      message: "Coordinator access only.",
    });
  }

  let account;
  try {
    account = await pool.query<{
      auth_version: number;
      must_change_password: boolean;
      revoked: boolean;
    }>(
      `SELECT auth_version, must_change_password, ${REVOKED_TOKEN_SQL} AS revoked
       FROM coordinators WHERE coordinator_id = $1 AND is_active = TRUE`,
      [payload.id, tokenHash(token)]
    );
  } catch (error) {
    console.error("COORDINATOR ACCOUNT CHECK ERROR:", error);
    return res.status(500).json({
      message: "Failed to validate coordinator access.",
    });
  }

  if (
    account.rows.length === 0 ||
    account.rows[0].revoked ||
    Number(payload.authVersion ?? 0) !== Number(account.rows[0].auth_version)
  ) {
    return res
      .status(401)
      .json({ message: "Invalid or expired token.", code: SESSION_INVALID });
  }
  if (passwordChangeBlocks(req, account.rows[0].must_change_password)) {
    return res.status(403).json(PASSWORD_CHANGE_REQUIRED_RESPONSE);
  }

  req.auth = {
    role: "coordinator",
    id: payload.id,
  };

  next();
}

function requireRole(
  roles: NonNullable<AuthedRequest["auth"]>["role"] | NonNullable<AuthedRequest["auth"]>["role"][]
): express.RequestHandler {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async (request, res, next) => {
    const req = request as AuthedRequest;
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        message: "Missing authorization token.", code: SESSION_INVALID,
      });
    }

    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        message: "Invalid or expired token.", code: SESSION_INVALID,
      });
    }

    const tokenRole =
      typeof payload !== "string" && isAuthRole(payload.role)
        ? payload.role
        : null;
    if (
      !tokenRole ||
      !allowedRoles.includes(tokenRole) ||
      typeof payload === "string" ||
      typeof payload.id !== "string"
    ) {
      return res.status(403).json({
        message: `${allowedRoles.join(" or ")} access only.`,
      });
    }

    const accountQueries: Record<
      AuthRole,
      string
    > = {
      student: `SELECT is_active, auth_version, must_change_password, ${REVOKED_TOKEN_SQL} AS revoked FROM students WHERE student_id = $1`,
      supervisor: `SELECT is_active, auth_version, must_change_password, ${REVOKED_TOKEN_SQL} AS revoked FROM supervisors WHERE supervisor_id = $1`,
      coordinator: `SELECT is_active, auth_version, must_change_password, ${REVOKED_TOKEN_SQL} AS revoked FROM coordinators WHERE coordinator_id = $1`,
    };
    try {
      const account = await pool.query<{
        is_active: boolean;
        auth_version: number;
        must_change_password: boolean;
        revoked: boolean;
      }>(
        accountQueries[tokenRole],
        [payload.id, tokenHash(token)]
      );
      if (
        account.rows.length === 0 ||
        account.rows[0].is_active === false ||
        account.rows[0].revoked ||
        Number(payload.authVersion ?? 0) !== Number(account.rows[0].auth_version)
      ) {
        return res.status(403).json({
          message: "This account is unavailable or its session has expired.",
          code: SESSION_INVALID,
        });
      }
      if (passwordChangeBlocks(req, account.rows[0].must_change_password)) {
        return res.status(403).json(PASSWORD_CHANGE_REQUIRED_RESPONSE);
      }
    } catch (error) {
      console.error("ROLE ACCOUNT CHECK ERROR:", error);
      return res.status(500).json({
        message: "Failed to validate account access.",
      });
    }

    req.auth = { role: tokenRole, id: payload.id };
    return next();
  };
}

/**
 * Writes one notification row. Pass exactly one of studentId,
 * supervisorId, coordinatorId as the recipient.
 */
async function createNotification(options: {
  studentId?: string | null;
  supervisorId?: string | null;
  coordinatorId?: string | null;
  title: string;
  message: string;
  type?: string;
}) {
  const recipients: {
    role: "coordinator" | "student" | "supervisor";
    id: string;
  }[] = [];
  if (options.studentId) {
    recipients.push({ role: "student", id: options.studentId });
  }
  if (options.supervisorId) {
    recipients.push({ role: "supervisor", id: options.supervisorId });
  }
  if (options.coordinatorId) {
    recipients.push({ role: "coordinator", id: options.coordinatorId });
  }

  const recipient = recipients[0];
  if (recipients.length !== 1 || !recipient) {
    throw new Error("A notification must have exactly one recipient.");
  }

  const result = await pool.query<{
    id: number;
    title: string;
    message: string;
    type: string;
    created_at: string;
  }>(
    `
    INSERT INTO notifications
    (student_id, supervisor_id, coordinator_id, title, message, type, is_read)
    VALUES ($1, $2, $3, $4, $5, $6, FALSE)
    RETURNING id, title, message, type, created_at
    `,
    [
      options.studentId || null,
      options.supervisorId || null,
      options.coordinatorId || null,
      options.title,
      options.message,
      options.type || "info",
    ]
  );
  const payload = result.rows[0];
  try {
    await pool.query(
      "SELECT pg_notify('internet_notifications', $1)",
      [JSON.stringify({ recipient, notification: payload })]
    );
  } catch (error) {
    console.error("PUBLISH POSTGRES NOTIFICATION ERROR:", error);
    publishNotification(recipient, payload);
  }

  if (isWebPushConfigured()) {
    void sendWebPush(recipient, payload).catch((error) => {
      console.error("WEB PUSH DELIVERY ERROR:", error);
    });
  }
}

/**
 * Keeps a student's completion date in step with their verified hours.
 * The first time the hours reach the requirement, the student and the
 * coordinators are told; if a later correction takes the hours back under
 * the requirement, the completion date is cleared.
 */
async function syncCompletion(studentId: string): Promise<void> {
  try {
    const result = await pool.query<{
      name: string;
      required_hours: number;
      completed_at: Date | null;
      hours: string;
    }>(
      `
      SELECT s.name, s.required_hours, s.completed_at,
             (
               SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
               WHERE a.student_id = s.student_id AND a.status = 'Verified'
             ) AS hours
      FROM students s WHERE s.student_id = $1
      `,
      [studentId]
    );
    const student = result.rows[0];
    if (!student || !(Number(student.required_hours) > 0)) return;

    const reached = Number(student.hours) >= Number(student.required_hours);
    if (reached && !student.completed_at) {
      await pool.query(
        `UPDATE students SET completed_at = NOW() WHERE student_id = $1`,
        [studentId]
      );
      await createNotification({
        studentId,
        title: "Required OJT hours completed",
        message: `You have completed your ${student.required_hours} required hours. Make sure your documents and tasks are also complete.`,
        type: "attendance",
      });
      await notifyCoordinators({
        title: "Student completed required hours",
        message: `${student.name} has completed their ${student.required_hours} required OJT hours.`,
        type: "attendance",
      });
    } else if (!reached && student.completed_at) {
      await pool.query(
        `UPDATE students SET completed_at = NULL WHERE student_id = $1`,
        [studentId]
      );
    }
  } catch (error) {
    // Bookkeeping must never undo the attendance decision that triggered it.
    console.error("SYNC COMPLETION ERROR:", error);
  }
}

/**
 * Stops a deactivated account from hearing anything further: its open live
 * streams are closed and its devices no longer receive push notifications.
 */
async function cutOffAccount(
  role: "student" | "supervisor",
  accountId: string
): Promise<void> {
  closeNotificationStreams({ role, id: accountId });
  try {
    await pool.query(
      `DELETE FROM web_push_subscriptions WHERE role = $1 AND account_id = $2`,
      [role, accountId]
    );
  } catch (error) {
    console.error("REMOVE PUSH SUBSCRIPTIONS ERROR:", error);
  }
}

/** Sends the same notification to every active coordinator. */
async function notifyCoordinators(notification: {
  title: string;
  message: string;
  type?: string;
}): Promise<void> {
  try {
    const coordinators = await pool.query<{ coordinator_id: string }>(
      `SELECT coordinator_id FROM coordinators WHERE is_active = TRUE`
    );
    await Promise.all(
      coordinators.rows.map((row) =>
        createNotification({
          coordinatorId: String(row.coordinator_id),
          ...notification,
        })
      )
    );
  } catch (error) {
    // A notification failure must never undo the action that caused it.
    console.error("NOTIFY COORDINATORS ERROR:", error);
  }
}

app.get(
  "/api/events",
  requireRole(["coordinator", "student", "supervisor"]),
  (request, response) => {
    const auth = (request as AuthedRequest).auth;
    if (!auth) {
      return response.status(401).json({ message: "Login is required." });
    }

    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    const disconnect = registerNotificationStream(auth, response);
    request.on("close", disconnect);
  }
);

/*
|--------------------------------------------------------------------------
| SIGN OUT
|--------------------------------------------------------------------------
|
| Ends this device's session on the server: the token is refused from now
| on and, when the browser sends its push endpoint, that device stops
| receiving the account's notifications. Other devices stay signed in.
|
*/

app.post(
  "/api/logout",
  requireRole(["coordinator", "student", "supervisor"]),
  async (request, response) => {
    const auth = (request as AuthedRequest).auth;
    const token = (request.headers.authorization || "").slice(7);
    const endpoint = request.body?.endpoint;
    if (!auth || !token) {
      return response.status(401).json({ message: "Login is required." });
    }

    try {
      const decoded = jwt.decode(token);
      const expiresAt =
        typeof decoded === "object" && decoded?.exp
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + 12 * 3_600_000);
      await pool.query(
        `INSERT INTO revoked_tokens(token_hash, expires_at) VALUES ($1, $2)
         ON CONFLICT (token_hash) DO NOTHING`,
        [tokenHash(token), expiresAt]
      );
      // Expired tokens are refused by their signature; their rows can go.
      await pool.query(`DELETE FROM revoked_tokens WHERE expires_at < NOW()`);
      if (typeof endpoint === "string" && endpoint) {
        await pool.query(
          `DELETE FROM web_push_subscriptions
           WHERE role = $1 AND account_id = $2 AND endpoint = $3`,
          [auth.role, auth.id, endpoint]
        );
      }
      return response.json({ message: "Signed out." });
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
      return response.status(500).json({ message: "Could not sign out." });
    }
  }
);

app.get("/api/push/vapid-public-key", (_request, response) => {
  if (!vapidPublicKey) {
    return response.status(503).json({
      message: "Browser push notifications are not configured.",
    });
  }
  return response.json({ publicKey: vapidPublicKey });
});

app.post(
  "/api/push/subscriptions",
  requireRole(["coordinator", "student", "supervisor"]),
  async (request, response) => {
    const auth = (request as AuthedRequest).auth;
    const subscription = request.body?.subscription;
    if (!auth) {
      return response.status(401).json({ message: "Login is required." });
    }
    if (!isWebPushConfigured()) {
      return response.status(503).json({
        message: "Browser push notifications are not configured.",
      });
    }
    if (
      typeof subscription?.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      typeof subscription?.keys?.p256dh !== "string" ||
      typeof subscription?.keys?.auth !== "string"
    ) {
      return response.status(400).json({ message: "Invalid browser push subscription." });
    }

    try {
      await pool.query(
        `
        INSERT INTO web_push_subscriptions(role, account_id, endpoint, subscription)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (endpoint) DO UPDATE
        SET role = EXCLUDED.role,
            account_id = EXCLUDED.account_id,
            subscription = EXCLUDED.subscription,
            updated_at = NOW()
        `,
        [auth.role, auth.id, subscription.endpoint, JSON.stringify(subscription)]
      );
      return response.status(201).json({ message: "Browser notifications enabled." });
    } catch (error) {
      console.error("SAVE WEB PUSH SUBSCRIPTION ERROR:", error);
      return response.status(500).json({ message: "Could not enable browser notifications." });
    }
  }
);

app.delete(
  "/api/push/subscriptions",
  requireRole(["coordinator", "student", "supervisor"]),
  async (request, response) => {
    const auth = (request as AuthedRequest).auth;
    const endpoint = request.body?.endpoint;
    if (!auth || typeof endpoint !== "string") {
      return response.status(400).json({ message: "A browser subscription endpoint is required." });
    }

    try {
      await pool.query(
        `DELETE FROM web_push_subscriptions
         WHERE role = $1 AND account_id = $2 AND endpoint = $3`,
        [auth.role, auth.id, endpoint]
      );
      return response.json({ message: "Browser notifications disabled." });
    } catch (error) {
      console.error("DELETE WEB PUSH SUBSCRIPTION ERROR:", error);
      return response.status(500).json({ message: "Could not disable browser notifications." });
    }
  }
);

/*
|--------------------------------------------------------------------------
| FILE / IMAGE UPLOAD
|--------------------------------------------------------------------------
*/

const rawUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    // The file is stored under its own extension, so the extension must be
    // an allowed one and agree with the declared type.
    const extension = path.extname(file.originalname).toLowerCase();

    if (documentMimeTypes[extension] === file.mimetype) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, JPEG, PNG, PDF, DOC, and DOCX files are allowed."
        )
      );
    }
  },
});

const documentMimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const rawDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (documentMimeTypes[extension] !== file.mimetype) {
      callback(
        new Error("Upload a PDF, DOC, DOCX, JPG, JPEG, or PNG file.")
      );
      return;
    }
    callback(null, true);
  },
});

// The filters above only see the file's name and the type the browser
// claims. Before any route handler runs, the first bytes of the file must
// also be what that extension really starts with, so a renamed file of
// another kind is refused. Files are held in memory, so a refused one is
// simply dropped.
const startsWith = (buffer: Buffer, bytes: number[]) =>
  buffer.length >= bytes.length &&
  bytes.every((byte, index) => buffer[index] === byte);

const fileSignatures: Record<string, (buffer: Buffer) => boolean> = {
  ".jpg": (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  ".jpeg": (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  ".png": (buffer) =>
    startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // The PDF header may be preceded by a little leading data.
  ".pdf": (buffer) => buffer.subarray(0, 1024).includes("%PDF-"),
  ".doc": (buffer) =>
    startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  // A .docx file is a zip archive.
  ".docx": (buffer) => startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]),
};

function withSignatureCheck(uploader: multer.Multer) {
  return {
    single(field: string): express.RequestHandler {
      const parse = uploader.single(field);
      return (req, res, next) => {
        parse(req, res, (error?: unknown) => {
          if (error) return next(error);
          if (!req.file) return next();

          const extension = path.extname(req.file.originalname).toLowerCase();
          const matches = fileSignatures[extension];
          if (!matches || !matches(req.file.buffer)) {
            return next(
              new Error(
                "That file is not a real " +
                  extension.slice(1).toUpperCase() +
                  " file. Choose the original file and try again."
              )
            );
          }
          next();
        });
      };
    },
  };
}

const upload = withSignatureCheck(rawUpload);
const documentUpload = withSignatureCheck(rawDocumentUpload);

/*
|--------------------------------------------------------------------------
| DATABASE TEST
|--------------------------------------------------------------------------
*/

app.get("/api/test-db", async (_req, res) => {
  // Diagnostic endpoint: unavailable in production so it cannot be used to
  // probe the database from the public internet.
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found." });
  }
  try {
    const result = await pool.query(
      "SELECT NOW() AS now"
    );

    return res.json({
      message: "Database connected!",
      timezone: "Asia/Manila",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(
      "DATABASE ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Database connection failed.",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

/*
|--------------------------------------------------------------------------
| STUDENT LOGIN
|--------------------------------------------------------------------------
*/

app.post(
  "/api/login/student",
  loginGuard("student"),
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          message:
            "Email and password are required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            email,
            password,
            name,
            program,
            company,
            supervisor_id,
            required_hours,
            is_active,
            auth_version,
            must_change_password
          FROM students
          WHERE LOWER(email) = LOWER(TRIM($1))
          OR student_id::text = TRIM($1)
          `,
          [
            email,
          ]
        );

      if (result.rows.length === 0) {
        return res.status(401).json({
          message:
            "Invalid student email or password.",
        });
      }

      const student =
        result.rows[0];

      const passwordOk = await verifyPassword(
        password,
        student.password
      );

      if (!passwordOk) {
        return res.status(401).json({
          message:
            "Invalid student email or password.",
        });
      }

      if (student.is_active === false) {
        return res.status(403).json({
          message:
            "This account has been deactivated. Please contact your OJT coordinator.",
        });
      }

      await upgradeLegacyPassword(
        "student",
        String(student.student_id),
        password,
        student.password
      );
      delete student.password;
      student.must_change_password =
        ENFORCE_PASSWORD_CHANGE && student.must_change_password === true;

      return res.json({
        message:
          "Login successful!",
        student,
        must_change_password: student.must_change_password,
        token: signToken(
          "student",
          String(student.student_id),
          Number(student.auth_version)
        ),
      });
    } catch (error) {
      console.error(
        "STUDENT LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Login failed.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUPERVISOR LOGIN
|--------------------------------------------------------------------------
*/

app.post(
  "/api/login/supervisor",
  loginGuard("supervisor"),
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          message:
            "Email and password are required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            supervisor_id,
            email,
            password,
            name,
            company,
            department,
            is_active,
            auth_version,
            must_change_password
          FROM supervisors
          WHERE LOWER(email) = LOWER(TRIM($1))
          `,
          [
            email,
          ]
        );

      if (result.rows.length === 0) {
        return res.status(401).json({
          message:
            "Invalid supervisor email or password.",
        });
      }

      const supervisor =
        result.rows[0];

      const passwordOk = await verifyPassword(
        password,
        supervisor.password
      );

      if (!passwordOk) {
        return res.status(401).json({
          message:
            "Invalid supervisor email or password.",
        });
      }

      if (supervisor.is_active === false) {
        return res.status(403).json({
          message:
            "This account has been deactivated. Please contact your OJT coordinator.",
        });
      }

      await upgradeLegacyPassword(
        "supervisor",
        String(supervisor.supervisor_id),
        password,
        supervisor.password
      );
      delete supervisor.password;
      supervisor.must_change_password =
        ENFORCE_PASSWORD_CHANGE && supervisor.must_change_password === true;

      return res.json({
        message:
          "Login successful!",
        supervisor,
        must_change_password: supervisor.must_change_password,
        token: signToken(
          "supervisor",
          String(supervisor.supervisor_id),
          Number(supervisor.auth_version)
        ),
      });
    } catch (error) {
      console.error(
        "SUPERVISOR LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Supervisor login failed.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET STUDENT INFORMATION
|--------------------------------------------------------------------------
*/

app.get(
  "/api/student/:studentId",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }
      if (auth?.role === "student" && auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own student information.",
        });
      }
      if (auth?.role === "supervisor") {
        const assignment = await pool.query(
          `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2 AND is_active = TRUE`,
          [studentId, auth.id]
        );
        if (assignment.rows.length === 0) {
          return res.status(403).json({
            message: "You can only view your assigned interns.",
          });
        }
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            email,
            name,
            program,
            company
          FROM students
          WHERE student_id = $1
          `,
          [studentId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Student not found.",
        });
      }

      return res.json({
        student:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "GET STUDENT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get student information.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET TASKS FOR STUDENT
|--------------------------------------------------------------------------
*/

app.get(
  "/api/tasks/student/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({ message: "You can only view your own tasks." });
      }
      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            title,
            status,
            description,
            assigned_by,
            assigned_by_id,
            priority,
            due_date,
            submission_notes,
            submission_file,
            submitted_at,
            review_notes,
            review_rating,
            reviewed_at,
            created_at,
            attachment_file,
            attachment_name
          FROM tasks
          WHERE student_id = $1
          ORDER BY due_date ASC
          `,
          [studentId]
        );

      return res.json(result.rows);
    } catch (error) {
      console.error(
        "GET TASKS ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get tasks.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET STUDENT ATTENDANCE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/attendance/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own attendance.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            review_notes,
            verified_by,
            verified_at,
            correction_note,
            corrected_at,
            capture_method,
            recorded_offline
          FROM attendance
          WHERE student_id = $1
          ORDER BY
            date DESC,
            id DESC
          `,
          [studentId]
        );

      return res.json({
        attendance:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET ATTENDANCE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get attendance records.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CAMERA CHECK (LIVENESS)
|--------------------------------------------------------------------------
|
| A time-in photo used to be any file the student chose. Now the app's
| camera has to see a live face follow a few prompts before it takes the
| photo itself. The prompts are picked here, at random, and handed out in a
| short-lived signed ticket, so a recording made earlier will not match
| them. The time-in below is refused without a ticket and a report saying
| every prompt in it was completed.
|
| The check itself runs on the student's device, so this is a strong
| deterrent rather than proof: the supervisor still sees the photo and
| verifies the day.
|
*/

const LIVENESS_PROMPTS = ["blink", "smile", "turn-left", "turn-right"] as const;
type LivenessPrompt = (typeof LIVENESS_PROMPTS)[number];
const LIVENESS_TICKET_MINUTES = 10;

function isLivenessPrompt(value: unknown): value is LivenessPrompt {
  return LIVENESS_PROMPTS.includes(value as LivenessPrompt);
}

/** Two different prompts, plus a spare used when the light check is unclear. */
function pickLivenessPrompts(): { prompts: LivenessPrompt[]; spare: LivenessPrompt } {
  const shuffled = [...LIVENESS_PROMPTS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return { prompts: shuffled.slice(0, 2), spare: shuffled[2] };
}

type LivenessReport = {
  completed: LivenessPrompt[];
  flash: "passed" | "inconclusive" | "skipped";
  sharpness: number | null;
  duration_ms: number | null;
  attempts: number | null;
};

/**
 * Checks a time-in's ticket and report. Returns the report to store, or the
 * reason the time-in is refused.
 */
function readLivenessReport(
  studentId: string,
  ticket: unknown,
  rawReport: unknown
): { report: LivenessReport } | { problem: string } {
  const refusal = {
    problem:
      "Finish the camera check to time in. If it will not work on your device, ask your supervisor to record your time-in.",
  };
  if (typeof ticket !== "string" || !ticket) return refusal;

  let claims: jwt.JwtPayload;
  try {
    const payload = jwt.verify(ticket, JWT_SECRET);
    if (typeof payload === "string") return refusal;
    claims = payload;
  } catch {
    return {
      problem: "The camera check expired. Run it again to time in.",
    };
  }
  if (claims.purpose !== "liveness" || claims.sub !== studentId) return refusal;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(typeof rawReport === "string" ? rawReport : "");
  } catch {
    return refusal;
  }
  if (!parsed || typeof parsed !== "object") return refusal;

  const completed = Array.isArray(parsed.completed)
    ? parsed.completed.filter(isLivenessPrompt)
    : [];
  const flash =
    parsed.flash === "passed" || parsed.flash === "skipped" ? parsed.flash : "inconclusive";

  // Every prompt on the ticket must be done; when the light check did not
  // clearly pass, the spare prompt is required as well.
  const required: unknown[] = Array.isArray(claims.prompts) ? [...claims.prompts] : [];
  if (flash !== "passed") required.push(claims.spare);
  if (required.length < 2 || !required.every((prompt) => completed.includes(prompt as LivenessPrompt))) {
    return refusal;
  }

  const number = (value: unknown, max: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.min(max, Math.round(value * 100) / 100)
      : null;

  return {
    report: {
      completed: [...new Set(completed)],
      flash,
      sharpness: number(parsed.sharpness, 100_000),
      duration_ms: number(parsed.duration_ms, 600_000),
      attempts: number(parsed.attempts, 20),
    },
  };
}

app.post(
  "/api/attendance/liveness-challenge",
  requireRole("student"),
  (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) return res.status(401).json({ message: "Sign in again." });

    const { prompts, spare } = pickLivenessPrompts();
    const ticket = jwt.sign({ purpose: "liveness", prompts, spare }, JWT_SECRET, {
      subject: auth.id,
      expiresIn: `${LIVENESS_TICKET_MINUTES}m`,
    });
    return res.json({ ticket, prompts, spare });
  }
);

/*
|--------------------------------------------------------------------------
| RECORD TIME IN
|--------------------------------------------------------------------------
*/

app.post(
  "/api/attendance",
  requireRole("student"),
  upload.single("image"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        student_id,
        note,
        notes,
      } = req.body;

      if (!student_id) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }
      if (!auth || auth.id !== String(student_id)) {
        return res.status(403).json({
          message: "You can only record your own attendance.",
        });
      }
      if (!req.file) {
        return res.status(400).json({
          message: "An attendance photo is required to record time-in.",
        });
      }
      if (!["image/jpeg", "image/jpg", "image/png"].includes(req.file.mimetype)) {
        return res.status(400).json({
          message: "Attendance photo must be a JPG or PNG image.",
        });
      }

      // The photo must come from the in-app camera check, not a chosen file.
      const liveness = readLivenessReport(
        String(student_id),
        req.body.liveness_ticket,
        req.body.liveness_report
      );
      if ("problem" in liveness) {
        return res.status(400).json({ message: liveness.problem });
      }

      /*
      |--------------------------------------------------------------------------
      | VERIFY STUDENT
      |--------------------------------------------------------------------------
      */

      const studentResult =
        await pool.query(
          `
          SELECT
            student_id,
            name,
            company
          FROM students
          WHERE student_id = $1
          `,
          [student_id]
        );

      if (
        studentResult.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Student does not exist.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | CHECK TODAY'S ATTENDANCE
      |--------------------------------------------------------------------------
      */

      const existing =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url
          FROM attendance
          WHERE student_id = $1
          AND date = CURRENT_DATE
          LIMIT 1
          `,
          [student_id]
        );

      if (
        existing.rows.length > 0
      ) {
        return res.status(409).json({
          message:
            "You already logged attendance today.",
          attendance:
            existing.rows[0],
        });
      }

      /*
      |--------------------------------------------------------------------------
      | IMAGE
      |--------------------------------------------------------------------------
      */

      uploadedFileName = await savePrivateFile(req.file);
      const imageUrl = `/uploads/${uploadedFileName}`;

      /*
      |--------------------------------------------------------------------------
      | NOTE
      |--------------------------------------------------------------------------
      */

      const submittedNote =
        typeof note === "string"
          ? note
          : typeof notes === "string"
            ? notes
            : null;

      const cleanNote =
        submittedNote &&
        submittedNote.trim() !== ""
          ? submittedNote.trim()
          : null;

      /*
      |--------------------------------------------------------------------------
      | INSERT ATTENDANCE
      |--------------------------------------------------------------------------
      |
      | NOW() uses Asia/Manila because the PostgreSQL
      | connection timezone was configured above.
      |
      */

      const result =
        await pool.query(
          `
          INSERT INTO attendance
          (
            student_id,
            date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            capture_method,
            liveness_checks
          )
          VALUES
          (
            $1,
            CURRENT_DATE,
            NOW(),
            NULL,
            NULL,
            NULL,
            NULL,
            $2,
            'Pending',
            $3,
            'liveness',
            $4::jsonb
          )
          RETURNING
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            capture_method
          `,
          [
            student_id,
            cleanNote,
            imageUrl,
            JSON.stringify(liveness.report),
          ]
        );

      // Feature 7: alert the assigned supervisor that a new log is waiting
      // for verification. A notification failure must not undo the log.
      try {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [student_id]
        );
        const supervisorId = owner.rows[0]?.supervisor_id;
        if (supervisorId) {
          await createNotification({
            supervisorId,
            title: "Attendance log awaiting verification",
            message: `${owner.rows[0].name} timed in on ${result.rows[0].date}. Review the attendance photo and confirm the log.`,
            type: "attendance",
          });
        }
      } catch (notifyError) {
        console.error("TIME-IN SUPERVISOR NOTIFICATION ERROR:", notifyError);
      }

      return res.status(201).json({
        message:
          "Attendance recorded successfully.",
        attendance:
          result.rows[0],
      });
    } catch (error) {
      if (uploadedFileName) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
          console.error("FAILED TO REMOVE UNRECORDED ATTENDANCE PHOTO:", cleanupError);
        });
      }
      // Two time-in requests raced past the "already logged" check; the
      // unique index on (student_id, date) let only the first one through.
      if ((error as { code?: string })?.code === "23505") {
        return res.status(409).json({
          message: "You already logged attendance today.",
        });
      }
      console.error(
        "TIME-IN ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to record attendance.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| STEPS RECORDED OFFLINE
|--------------------------------------------------------------------------
|
| Break, back-to-work and time-out may carry `occurred_at` (when the button
| was pressed) and `client_request_id` (the app's own id for the action),
| sent together by a phone that had no connection at the time. The rules are
| in services/offlineActions.ts. A request with neither field is a live one
| and takes this server's clock, exactly as before.
|
*/

type AttendanceStep = { at: Date | null; requestId: string | null };

/**
 * Works out the time to record for a break, back-to-work or time-out.
 * Returns null when it has already answered the request itself: with the
 * first answer again when the same action is sent twice, or with the reason
 * the offline time cannot be used.
 */
async function attendanceStepFor(
  req: express.Request,
  res: express.Response,
  action: OfflineAction
): Promise<AttendanceStep | null> {
  const auth = (req as AuthedRequest).auth;
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.occurred_at === undefined && body.client_request_id === undefined) {
    return { at: null, requestId: null };
  }

  const logId = Number(req.params.id);
  if (typeof body.client_request_id === "string" && Number.isInteger(logId)) {
    const seen = await pool.query<{
      student_id: string;
      attendance_id: number;
      action: string;
      response: unknown;
    }>(
      `SELECT student_id, attendance_id, action, response
       FROM offline_action_ledger WHERE client_request_id = $1`,
      [body.client_request_id]
    );
    if (seen.rows.length > 0) {
      const first = seen.rows[0];
      if (
        first.student_id === auth?.id &&
        first.attendance_id === logId &&
        first.action === action
      ) {
        res.json({
          message: "Already recorded.",
          attendance: first.response,
          replayed: true,
        });
      } else {
        res.status(409).json({ message: "That request id was used for something else." });
      }
      return null;
    }
  }

  const log = Number.isInteger(logId)
    ? await pool.query<LogTimes>(
        `SELECT time_in, break_time, break_end_time
         FROM attendance WHERE id = $1 AND student_id = $2`,
        [logId, auth?.id]
      )
    : { rows: [] as LogTimes[] };

  const stamp = readOfflineStamp(body, action, log.rows[0] ?? null);
  if (stamp.kind === "invalid") {
    res.status(stamp.status).json({ message: stamp.message });
    return null;
  }
  return stamp.kind === "offline"
    ? { at: stamp.occurredAt, requestId: stamp.requestId }
    : { at: null, requestId: null };
}

/** Remembers an offline action by its id, so sending it again changes nothing. */
async function rememberOfflineStep(
  step: AttendanceStep,
  action: OfflineAction,
  attendance: { id: number; student_id: string }
): Promise<void> {
  if (!step.at || !step.requestId) return;
  try {
    await pool.query(
      `INSERT INTO offline_action_ledger
         (client_request_id, student_id, attendance_id, action, occurred_at, response)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_request_id) DO NOTHING`,
      [step.requestId, attendance.student_id, attendance.id, action, step.at, JSON.stringify(attendance)]
    );
  } catch (error) {
    // The step itself is saved; only the note for a repeat is missing. A
    // repeat then gets "already recorded", which the app treats as done.
    console.error("OFFLINE LEDGER ERROR:", error);
  }
}

/*
|--------------------------------------------------------------------------
| RECORD BREAK START
|--------------------------------------------------------------------------
*/

app.put(
  "/api/attendance/:id/break",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        id,
      } = req.params;
      const step = await attendanceStepFor(req, res, "break");
      if (!step) return;

      const result =
        await pool.query(
          `
          UPDATE attendance
          SET
            break_time = COALESCE($3::timestamptz, NOW()),
            recorded_offline = recorded_offline OR $3::timestamptz IS NOT NULL
          WHERE id = $1
          AND student_id = $2
          AND break_time IS NULL
          AND time_out IS NULL
          RETURNING
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            recorded_offline
          `,
          [id, auth?.id, step.at]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Attendance record not found or break was already recorded.",
        });
      }

      await rememberOfflineStep(step, "break", result.rows[0]);

      return res.json({
        message:
          "Break recorded successfully.",
        attendance:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "BREAK ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to record break.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| RECORD BREAK END / RETURN FROM BREAK
|--------------------------------------------------------------------------
*/

app.put(
  "/api/attendance/:id/break-end",
  requireRole("student"),
  async (req, res) => {
    const {
      id,
    } = req.params;

    try {
      const auth = (req as AuthedRequest).auth;
      const step = await attendanceStepFor(req, res, "break-end");
      if (!step) return;

      const result =
        await pool.query(
          `
          UPDATE attendance
          SET
            break_end_time = COALESCE($3::timestamptz, NOW()),
            recorded_offline = recorded_offline OR $3::timestamptz IS NOT NULL
          WHERE id = $1
          AND student_id = $2
          AND break_time IS NOT NULL
          AND break_end_time IS NULL
          AND time_out IS NULL
          RETURNING
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            recorded_offline
          `,
          [id, auth?.id, step.at]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Attendance record not found or return from break was already recorded.",
        });
      }

      await rememberOfflineStep(step, "break-end", result.rows[0]);

      return res.status(200).json({
        message:
          "Returned from break successfully.",
        attendance:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "BREAK-END ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to record return from break.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| RECORD TIME OUT
|--------------------------------------------------------------------------
*/

app.put(
  "/api/attendance/:id/time-out",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        id,
      } = req.params;

      /*
      |--------------------------------------------------------------------------
      | TIME OUT
      |--------------------------------------------------------------------------
      |
      | NOW() = Philippine Time because the database
      | connection timezone is Asia/Manila.
      |
      | $4 is the time the button was pressed, for a time-out recorded while
      | the phone was offline; it is NULL for a live request.
      |
      */
      const step = await attendanceStepFor(req, res, "time-out");
      if (!step) return;

      const result =
        await pool.query(
          `
          UPDATE attendance
          SET
            time_out = COALESCE($4::timestamptz, NOW()),
            recorded_offline = recorded_offline OR $4::timestamptz IS NOT NULL,

            -- A break still open at time-out ends now.
            break_end_time = CASE
              WHEN break_time IS NOT NULL
              THEN COALESCE(break_end_time, COALESCE($4::timestamptz, NOW()))
              ELSE break_end_time
            END,

            -- Rendered hours exclude the recorded break.
            hours = GREATEST(
              ROUND(
                (
                  (
                    EXTRACT(EPOCH FROM (COALESCE($4::timestamptz, NOW()) - time_in))
                    - CASE
                        WHEN break_time IS NOT NULL
                        THEN EXTRACT(
                          EPOCH FROM (
                            COALESCE(break_end_time, COALESCE($4::timestamptz, NOW())) - break_time
                          )
                        )
                        ELSE 0
                      END
                  ) / 3600.0
                )::numeric,
                2
              ),
              0
            ),

            -- A time-in the supervisor recorded in person was approved by them
            -- on the spot, so the finished day needs no second review.
            status = CASE
              WHEN capture_method = 'supervisor' AND status = 'Pending'
              THEN 'Verified' ELSE status
            END,
            verified_by = CASE
              WHEN capture_method = 'supervisor' AND status = 'Pending'
              THEN recorded_by ELSE verified_by
            END,
            verifier_role = CASE
              WHEN capture_method = 'supervisor' AND status = 'Pending'
              THEN 'supervisor' ELSE verifier_role
            END,
            verified_at = CASE
              WHEN capture_method = 'supervisor' AND status = 'Pending'
              THEN NOW() ELSE verified_at
            END

          WHERE id = $1
          AND student_id = $2
          AND time_out IS NULL
          AND time_in IS NOT NULL
          -- A log left open from an earlier day is closed through the
          -- missed time-out route, which asks for the real time and a reason.
          AND time_in > COALESCE($4::timestamptz, NOW()) - make_interval(hours => $3)

          RETURNING
            id,
            student_id,
            TO_CHAR(
              date,
              'YYYY-MM-DD'
            ) AS date,
            time_in,
            break_time,
            break_end_time,
            time_out,
            hours,
            note,
            status,
            image_url,
            capture_method,
            recorded_offline
          `,
          [id, auth?.id, MAX_SHIFT_HOURS, step.at]
        );

      if (
        result.rows.length === 0
      ) {
        const stale = await pool.query(
          `SELECT 1 FROM attendance
           WHERE id = $1 AND student_id = $2 AND time_out IS NULL`,
          [id, auth?.id]
        );
        if (stale.rows.length > 0) {
          return res.status(409).json({
            message: `This log was left open for more than ${MAX_SHIFT_HOURS} hours. Enter the time you actually left as a missed time-out instead.`,
          });
        }
        return res.status(404).json({
          message:
            "Attendance record not found or time-out was already recorded.",
        });
      }

      await rememberOfflineStep(step, "time-out", result.rows[0]);

      // A day the supervisor recorded in person is already verified: count its
      // hours and tell the student, instead of asking the supervisor again.
      if (
        result.rows[0].capture_method === "supervisor" &&
        result.rows[0].status === "Verified"
      ) {
        try {
          await syncCompletion(String(result.rows[0].student_id));
          await createNotification({
            studentId: result.rows[0].student_id,
            title: "Attendance verified",
            message: `Your attendance for ${result.rows[0].date} was verified. Your supervisor recorded your time-in in person.`,
            type: "attendance",
          });
        } catch (notifyError) {
          console.error("TIME-OUT AUTO-VERIFY FOLLOW-UP ERROR:", notifyError);
        }
        return res.json({
          message: "Time-out recorded successfully.",
          attendance: result.rows[0],
        });
      }

      // The supervisor was told at time-in; the log only becomes verifiable
      // now, so tell them again. A failure here must not undo the time-out.
      try {
        const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
          `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
          [result.rows[0].student_id]
        );
        if (owner.rows[0]?.supervisor_id) {
          await createNotification({
            supervisorId: owner.rows[0].supervisor_id,
            title: "Attendance log ready to verify",
            message: `${owner.rows[0].name} timed out on ${result.rows[0].date} with ${result.rows[0].hours} hours.`,
            type: "attendance",
          });
        }
      } catch (notifyError) {
        console.error("TIME-OUT SUPERVISOR NOTIFICATION ERROR:", notifyError);
      }

      return res.json({
        message:
          "Time-out recorded successfully.",
        attendance:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "TIME-OUT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to record time-out.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ATTENDANCE CORRECTIONS (student)
|--------------------------------------------------------------------------
|
| Two situations used to be dead ends for a student:
|
|  - They forgot to time out. The log stays open, can never be verified,
|    and the ordinary time-out would record "now", days later.
|  - Their log was rejected. One log is allowed per day, so they could not
|    submit it again.
|
| Both routes put the log back in front of the supervisor as Pending, with
| the student's explanation attached. The supervisor still decides.
|
*/

async function notifyLogOwnerSupervisor(
  studentId: string,
  title: string,
  buildMessage: (studentName: string) => string
): Promise<void> {
  try {
    const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
      `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
      [studentId]
    );
    if (owner.rows[0]?.supervisor_id) {
      await createNotification({
        supervisorId: owner.rows[0].supervisor_id,
        title,
        message: buildMessage(owner.rows[0].name),
        type: "attendance",
      });
    }
  } catch (error) {
    console.error("ATTENDANCE CORRECTION NOTIFICATION ERROR:", error);
  }
}

const ATTENDANCE_COLUMNS = `
  id,
  student_id,
  TO_CHAR(date, 'YYYY-MM-DD') AS date,
  time_in,
  break_time,
  break_end_time,
  time_out,
  hours,
  note,
  status,
  image_url,
  review_notes,
  correction_note,
  corrected_at,
  capture_method
`;

// A shift is never longer than this, so a typo cannot record a multi-day log.
const MAX_SHIFT_HOURS = 16;

app.put(
  "/api/attendance/:id/late-time-out",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      const timeOut = new Date(String(req.body?.time_out || ""));

      if (Number.isNaN(timeOut.getTime())) {
        return res.status(400).json({
          message: "Enter the time you actually left.",
        });
      }
      if (reason.length < 5) {
        return res.status(400).json({
          message: "Explain briefly why the time-out was not recorded on the day.",
        });
      }

      const current = await pool.query<{
        time_in: Date;
        break_time: Date | null;
        break_end_time: Date | null;
        time_out: Date | null;
        is_past: boolean;
      }>(
        `SELECT time_in, break_time, break_end_time, time_out,
                (date < CURRENT_DATE) AS is_past
         FROM attendance WHERE id = $1 AND student_id = $2`,
        [req.params.id, auth?.id]
      );
      const log = current.rows[0];
      if (!log) {
        return res.status(404).json({ message: "Attendance record not found." });
      }
      if (log.time_out) {
        return res.status(409).json({
          message: "This log already has a time-out.",
        });
      }
      if (!log.is_past) {
        return res.status(409).json({
          message: "Today's log is still open. Use Time out instead.",
        });
      }

      const lastRecorded = log.break_end_time || log.break_time || log.time_in;
      if (timeOut.getTime() <= new Date(lastRecorded).getTime()) {
        return res.status(400).json({
          message: log.break_time
            ? "The time-out must be after your break."
            : "The time-out must be after your time-in.",
        });
      }
      if (timeOut.getTime() > Date.now()) {
        return res.status(400).json({
          message: "The time-out cannot be in the future.",
        });
      }
      if (
        timeOut.getTime() - new Date(log.time_in).getTime() >
        MAX_SHIFT_HOURS * 3_600_000
      ) {
        return res.status(400).json({
          message: `The time-out must be within ${MAX_SHIFT_HOURS} hours of your time-in.`,
        });
      }

      const result = await pool.query(
        `
        UPDATE attendance
        SET
          time_out = $3::timestamp,
          -- A break still open at time-out ends then.
          break_end_time = CASE
            WHEN break_time IS NOT NULL THEN COALESCE(break_end_time, $3::timestamp)
            ELSE break_end_time
          END,
          -- Rendered hours exclude the recorded break.
          hours = GREATEST(
            ROUND(
              (
                (
                  EXTRACT(EPOCH FROM ($3::timestamp - time_in))
                  - CASE
                      WHEN break_time IS NOT NULL
                      THEN EXTRACT(
                        EPOCH FROM (COALESCE(break_end_time, $3::timestamp) - break_time)
                      )
                      ELSE 0
                    END
                ) / 3600.0
              )::numeric,
              2
            ),
            0
          ),
          status = 'Pending',
          correction_note = $4,
          corrected_at = NOW()
        WHERE id = $1
        AND student_id = $2
        AND time_out IS NULL
        RETURNING ${ATTENDANCE_COLUMNS}
        `,
        [req.params.id, auth?.id, timeOut, `Time-out entered late. ${reason}`]
      );
      if (result.rows.length === 0) {
        return res.status(409).json({
          message: "This log already has a time-out.",
        });
      }

      await notifyLogOwnerSupervisor(
        String(auth?.id),
        "Late time-out to review",
        (name) =>
          `${name} entered a missed time-out for ${result.rows[0].date}. Check the time and their reason before verifying.`
      );

      return res.json({
        message: "Time-out saved. Your supervisor will review it.",
        attendance: result.rows[0],
      });
    } catch (error) {
      console.error("LATE TIME-OUT ERROR:", error);
      return res.status(500).json({
        message: "Failed to save the time-out.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.post(
  "/api/attendance/:id/resubmit",
  requireRole("student"),
  upload.single("image"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    let saved = false;
    try {
      const auth = (req as AuthedRequest).auth;
      const explanation =
        typeof req.body?.explanation === "string"
          ? req.body.explanation.trim()
          : "";
      if (explanation.length < 5) {
        return res.status(400).json({
          message: "Explain what you corrected or why the log is accurate.",
        });
      }
      if (
        req.file &&
        !["image/jpeg", "image/jpg", "image/png"].includes(req.file.mimetype)
      ) {
        return res.status(400).json({
          message: "The replacement photo must be a JPG or PNG image.",
        });
      }

      const current = await pool.query<{ status: string; image_url: string | null }>(
        `SELECT status, image_url FROM attendance WHERE id = $1 AND student_id = $2`,
        [req.params.id, auth?.id]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ message: "Attendance record not found." });
      }
      if (current.rows[0].status !== "Rejected") {
        return res.status(409).json({
          message: "Only a rejected log can be sent for another review.",
        });
      }

      let newImageUrl: string | null = null;
      if (req.file) {
        uploadedFileName = await savePrivateFile(req.file);
        newImageUrl = `/uploads/${uploadedFileName}`;
      }

      const result = await pool.query(
        `
        UPDATE attendance
        SET
          status = 'Pending',
          correction_note = $3,
          corrected_at = NOW(),
          image_url = COALESCE($4, image_url),
          -- A replacement photo is one the student chose, so the log no longer
          -- counts as camera-checked and the reviewer is told so.
          capture_method = CASE WHEN $4::text IS NULL THEN capture_method ELSE NULL END,
          liveness_checks = CASE WHEN $4::text IS NULL THEN liveness_checks ELSE NULL END
        WHERE id = $1
        AND student_id = $2
        AND status = 'Rejected'
        RETURNING ${ATTENDANCE_COLUMNS}
        `,
        [req.params.id, auth?.id, explanation, newImageUrl]
      );
      if (result.rows.length === 0) {
        throw new Error("The log changed while it was being resubmitted.");
      }
      saved = true;

      // The replaced photo is no longer referenced by anything.
      const oldFile = current.rows[0].image_url?.split("/").pop();
      if (newImageUrl && oldFile) {
        await deletePrivateFile(oldFile).catch((cleanupError) => {
          console.error("FAILED TO REMOVE REPLACED ATTENDANCE PHOTO:", cleanupError);
        });
      }

      await notifyLogOwnerSupervisor(
        String(auth?.id),
        "Attendance log awaiting verification",
        (name) =>
          `${name} asked for another review of their rejected log for ${result.rows[0].date}.`
      );

      return res.json({
        message: "Sent back to your supervisor for another review.",
        attendance: result.rows[0],
      });
    } catch (error) {
      if (uploadedFileName && !saved) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
          console.error("FAILED TO REMOVE UNUSED ATTENDANCE PHOTO:", cleanupError);
        });
      }
      console.error("RESUBMIT ATTENDANCE ERROR:", error);
      return res.status(500).json({
        message: "Failed to resubmit the log.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET SUPERVISOR'S INTERNS' ATTENDANCE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/supervisor/attendance/:supervisorId",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        supervisorId,
      } = req.params;

      if (!auth || auth.id !== supervisorId) {
        return res.status(403).json({
          message: "You can only view attendance for your own interns.",
        });
      }

      if (!supervisorId) {
        return res.status(400).json({
          message:
            "Supervisor ID is required.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | GET SUPERVISOR
      |--------------------------------------------------------------------------
      */

      const supervisorResult =
        await pool.query(
          `
          SELECT
            supervisor_id,
            name,
            company,
            department
          FROM supervisors
          WHERE supervisor_id = $1
          LIMIT 1
          `,
          [supervisorId]
        );

      if (
        supervisorResult.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Supervisor not found.",
        });
      }

      const supervisor =
        supervisorResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | GET ATTENDANCE
      |--------------------------------------------------------------------------
      */

      const result =
        await pool.query(
          `
          SELECT
            a.id,
            a.student_id,

            s.name AS student_name,
            s.email AS student_email,
            s.program,
            s.company,

            TO_CHAR(
              a.date,
              'YYYY-MM-DD'
            ) AS date,

            a.time_in,
            a.break_time,
            a.break_end_time,
            a.time_out,
            a.hours,
            a.note,
            a.status,
            a.image_url,
            a.review_notes,
            a.verified_by,
            a.verified_at,
            a.correction_note,
            a.corrected_at,
            a.capture_method,
            a.recorded_offline,
            a.liveness_checks,
            a.capture_reason

          FROM attendance a

          INNER JOIN students s
            ON TRIM(
              s.student_id::text
            ) =
            TRIM(
              a.student_id::text
            )

          WHERE
            TRIM(
              s.supervisor_id::text
            ) =
            TRIM(
              $1::text
            )
            AND s.is_active = TRUE

          ORDER BY
            a.date DESC,
            a.id DESC
          LIMIT 3000
          `,
          [supervisor.supervisor_id]
        );

      return res.json({
        attendance:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET SUPERVISOR ATTENDANCE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get intern attendance.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUPERVISOR RECORDS A TIME-IN IN PERSON
|--------------------------------------------------------------------------
|
| The way through when the camera check cannot run on an intern's device
| (no camera, a fault, a check that keeps failing). The supervisor takes
| the photo themselves, so no camera check is asked of them, and the log
| is theirs to vouch for: it is verified automatically once the intern
| times out.
|
*/

app.post(
  "/api/supervisor/attendance/record",
  requireRole("supervisor"),
  upload.single("image"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    try {
      const auth = (req as AuthedRequest).auth;
      const studentId =
        typeof req.body?.student_id === "string" ? req.body.student_id.trim() : "";
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
      const note =
        typeof req.body?.note === "string" && req.body.note.trim() !== ""
          ? req.body.note.trim().slice(0, 500)
          : null;

      if (!studentId) {
        return res.status(400).json({ message: "Choose the intern to record." });
      }
      if (reason.length < 3) {
        return res.status(400).json({
          message: "Say why the intern could not use the camera check.",
        });
      }
      if (!req.file) {
        return res.status(400).json({
          message: "A photo of the intern is required to record their time-in.",
        });
      }
      if (!["image/jpeg", "image/jpg", "image/png"].includes(req.file.mimetype)) {
        return res.status(400).json({
          message: "The photo must be a JPG or PNG image.",
        });
      }

      const intern = await pool.query<{ name: string }>(
        `
        SELECT name FROM students
        WHERE student_id = $1 AND supervisor_id = $2 AND is_active = TRUE
        `,
        [studentId, auth?.id]
      );
      if (intern.rows.length === 0) {
        return res.status(403).json({
          message: "You can only record attendance for interns assigned to you.",
        });
      }

      const existing = await pool.query(
        `SELECT 1 FROM attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
        [studentId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          message: `${intern.rows[0].name} already has an attendance log for today.`,
        });
      }

      uploadedFileName = await savePrivateFile(req.file);

      const result = await pool.query(
        `
        INSERT INTO attendance
          (student_id, date, time_in, note, status, image_url,
           capture_method, recorded_by, capture_reason)
        VALUES
          ($1, CURRENT_DATE, NOW(), $2, 'Pending', $3, 'supervisor', $4, $5)
        RETURNING ${ATTENDANCE_COLUMNS}
        `,
        [studentId, note, `/uploads/${uploadedFileName}`, auth?.id, reason]
      );

      try {
        await createNotification({
          studentId,
          title: "Time-in recorded by your supervisor",
          message: `Your supervisor recorded your time-in for ${result.rows[0].date}. Remember to time out when you finish; the day is verified automatically.`,
          type: "attendance",
        });
      } catch (notifyError) {
        console.error("SUPERVISOR TIME-IN NOTIFICATION ERROR:", notifyError);
      }

      return res.status(201).json({
        message: `Time-in recorded for ${intern.rows[0].name}.`,
        attendance: result.rows[0],
      });
    } catch (error) {
      if (uploadedFileName) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
          console.error("FAILED TO REMOVE UNRECORDED ATTENDANCE PHOTO:", cleanupError);
        });
      }
      if ((error as { code?: string })?.code === "23505") {
        return res.status(409).json({
          message: "This intern already has an attendance log for today.",
        });
      }
      console.error("SUPERVISOR RECORD TIME-IN ERROR:", error);
      return res.status(500).json({
        message: "Failed to record the time-in.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| HOW MUCH IS WAITING ON A SUPERVISOR
|--------------------------------------------------------------------------
|
| One number for the badge beside "Review", counted the same way the queue
| is built, so every page does not have to download four lists to show it.
|
*/

app.get(
  "/api/supervisor/review-count",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const result = await pool.query<{ waiting: string }>(
        `
        WITH mine AS (
          SELECT TRIM(student_id::text) AS student_id FROM students
          WHERE TRIM(supervisor_id::text) = TRIM($1::text) AND is_active = TRUE
        )
        SELECT
          (SELECT COUNT(*) FROM attendance a
            WHERE TRIM(a.student_id::text) IN (SELECT student_id FROM mine)
              AND a.status = 'Pending'
              -- A time-in the supervisor recorded in person needs no review.
              AND NOT (a.capture_method IS NOT DISTINCT FROM 'supervisor' AND a.time_out IS NULL))
          + (SELECT COUNT(*) FROM tasks t
              WHERE TRIM(t.student_id::text) IN (SELECT student_id FROM mine) AND t.status = 'Submitted')
          + (SELECT COUNT(*) FROM documents d
              WHERE TRIM(d.student_id::text) IN (SELECT student_id FROM mine) AND d.status = 'Pending')
          + (SELECT COUNT(*) FROM absences b
              WHERE TRIM(b.student_id::text) IN (SELECT student_id FROM mine) AND b.status = 'Pending')
          AS waiting
        `,
        [auth?.id]
      );
      return res.json({ waiting: Number(result.rows[0]?.waiting) || 0 });
    } catch (error) {
      console.error("SUPERVISOR REVIEW COUNT ERROR:", error);
      return res.status(500).json({ message: "Failed to count what is waiting." });
    }
  }
);

app.get(
  "/api/supervisor/dashboard/:supervisorId",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const { supervisorId } = req.params;
      if (!auth || auth.id !== supervisorId) {
        return res.status(403).json({
          message: "You can only view your own dashboard.",
        });
      }
      const supervisorResult = await pool.query(
        `SELECT supervisor_id FROM supervisors WHERE supervisor_id = $1`,
        [supervisorId]
      );

      if (supervisorResult.rows.length === 0) {
        return res.status(404).json({ message: "Supervisor not found." });
      }

      const [
        internsResult,
        pendingAttendanceCountResult,
        pendingLogsResult,
        activeTasksResult,
        deadlinesResult,
        evaluationsResult,
      ] =
        await Promise.all([
          pool.query(
            `
            SELECT
              s.student_id,
              s.name,
              s.program,
              s.required_hours AS "hoursRequired",
              COALESCE((
                SELECT SUM(a.hours)
                FROM attendance a
                WHERE a.student_id::text = s.student_id::text
                  AND a.status = 'Verified'
              ), 0) AS "hoursLogged",
              (
                SELECT COUNT(*)
                FROM tasks t
                WHERE t.student_id::text = s.student_id::text
                  AND t.status IN ('Pending', 'In Progress', 'Submitted')
              ) AS "activeTasks"
            FROM students s
            WHERE s.supervisor_id::text = $1::text
            ORDER BY s.name
            `,
            [supervisorId]
          ),
          pool.query(
            `
            SELECT COUNT(*) AS count
            FROM attendance a
            INNER JOIN students s ON s.student_id::text = a.student_id::text
            WHERE s.supervisor_id::text = $1::text
              AND a.status = 'Pending'
            `,
            [supervisorId]
          ),
          pool.query(
            `
            SELECT
              a.id,
              a.student_id,
              s.name AS student_name,
              TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
              a.time_in,
              a.time_out,
              a.hours
            FROM attendance a
            INNER JOIN students s ON s.student_id::text = a.student_id::text
            WHERE s.supervisor_id::text = $1::text
              AND a.status = 'Pending'
            ORDER BY a.date ASC, a.id ASC
            LIMIT 20
            `,
            [supervisorId]
          ),
          pool.query(
            `
            SELECT COUNT(*) AS count
            FROM tasks t
            INNER JOIN students s ON s.student_id::text = t.student_id::text
            WHERE s.supervisor_id::text = $1::text
              AND t.status IN ('Pending', 'In Progress', 'Submitted')
            `,
            [supervisorId]
          ),
          pool.query(
            `
            SELECT t.id, t.title, t.description, t.due_date
            FROM tasks t
            INNER JOIN students s ON s.student_id::text = t.student_id::text
            WHERE s.supervisor_id::text = $1::text
              AND t.status IN ('Pending', 'In Progress', 'Submitted')
              AND t.due_date >= CURRENT_DATE
            ORDER BY t.due_date ASC
            LIMIT 10
            `,
            [supervisorId]
          ),
          pool.query(
            `
            SELECT COUNT(*) AS count
            FROM students s
            WHERE s.supervisor_id::text = $1::text
              AND NOT EXISTS (
                SELECT 1
                FROM evaluations e
                WHERE e.student_id::text = s.student_id::text
                  AND e.evaluator_type = 'supervisor'
                  AND e.evaluator_id::text = $1::text
              )
            `,
            [supervisorId]
          ),
        ]);

      const interns = internsResult.rows.map((intern) => ({
        ...intern,
        hoursLogged: Number(intern.hoursLogged),
        hoursRequired: Number(intern.hoursRequired),
        activeTasks: Number(intern.activeTasks),
      }));

      return res.json({
        totalInterns: interns.length,
        pendingAttendance: Number(
          pendingAttendanceCountResult.rows[0].count
        ),
        activeTasks: Number(activeTasksResult.rows[0].count),
        pendingEvaluations: Number(evaluationsResult.rows[0].count),
        interns,
        pendingLogs: pendingLogsResult.rows,
        deadlines: deadlinesResult.rows,
      });
    } catch (error) {
      console.error("GET SUPERVISOR DASHBOARD ERROR:", error);
      return res.status(500).json({
        message: "Failed to load supervisor dashboard.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| APPROVE / REJECT ATTENDANCE
|--------------------------------------------------------------------------
*/

app.patch(
  "/api/attendance/:id/status",
  requireRole(["supervisor", "coordinator"]),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        id,
      } = req.params;

      const {
        status,
        reason,
      } = req.body;

      if (!/^\d{1,15}$/.test(String(id))) {
        return res.status(404).json({ message: "Attendance record not found." });
      }

      // The status the reviewer was looking at. When it is sent, the decision
      // is saved only if the log is still in that state, so two reviewers
      // cannot silently overwrite each other.
      const expectedStatus =
        typeof req.body?.expected_status === "string" && req.body.expected_status.trim() !== ""
          ? req.body.expected_status.trim()
          : null;

      // "Pending" reopens a log: it undoes a decision made by mistake and
      // puts the log back in the review queue.
      if (
        status !== "Verified" &&
        status !== "Rejected" &&
        status !== "Pending"
      ) {
        return res.status(400).json({
          message:
            "Status must be Verified, Rejected, or Pending.",
        });
      }

      const cleanReason =
        typeof reason === "string" &&
        reason.trim() !== ""
          ? reason.trim()
          : null;

      if (status === "Rejected" && !cleanReason) {
        return res.status(400).json({
          message: "A reason is required when rejecting an attendance log.",
        });
      }

      // A log with no time-out has no rendered hours yet, so it cannot be
      // confirmed. Rejecting an unfinished log is still allowed.
      if (status === "Verified") {
        const log = await pool.query<{ time_out: Date | null; hours: string | null }>(
          `
          SELECT a.time_out, a.hours
          FROM attendance a
          JOIN students s ON s.student_id = a.student_id
          WHERE a.id = $1
          AND ($2 = 'coordinator' OR s.supervisor_id = $3)
          `,
          [id, auth?.role, auth?.id]
        );
        if (log.rows.length > 0 && !log.rows[0].time_out) {
          return res.status(409).json({
            message:
              "This log has no time-out yet. It can be verified after the student times out.",
          });
        }
        // No single day can add more than one shift to a student's total.
        if (log.rows.length > 0 && Number(log.rows[0].hours) > MAX_SHIFT_HOURS) {
          return res.status(409).json({
            message: `This log records ${log.rows[0].hours} hours, more than the ${MAX_SHIFT_HOURS}-hour limit for one day. Reject it so the student can correct the time-out.`,
          });
        }
      }

      const result =
        await pool.query(
          `
          UPDATE attendance a

          SET
            status = $1::text,
            review_notes = $2::text,
            verified_by = CASE WHEN $1::text = 'Pending' THEN NULL ELSE $5::text END,
            verifier_role = CASE WHEN $1::text = 'Pending' THEN NULL ELSE $4::text END,
            verified_at = CASE WHEN $1::text = 'Pending' THEN NULL ELSE NOW() END,
            flag_acknowledged_at = NULL

          FROM students s
          WHERE a.id = $3
          AND s.student_id = a.student_id
          AND ($4::text = 'coordinator' OR s.supervisor_id = $5::text)
          AND ($6::text IS NULL OR a.status = $6::text)

          RETURNING
            a.id,
            a.student_id,
            s.name AS student_name,
            s.supervisor_id,
            TO_CHAR(
              a.date,
              'YYYY-MM-DD'
            ) AS date,
            a.time_in,
            a.break_time,
            a.break_end_time,
            a.time_out,
            a.hours,
            a.note,
            a.status,
            a.image_url,
            a.review_notes,
            a.verified_by,
            a.verifier_role,
            a.verified_at
          `,
          [
            status,
            cleanReason,
            id,
            auth?.role,
            auth?.id,
            expectedStatus,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        const current = await pool.query<{ status: string }>(
          `
          SELECT a.status FROM attendance a
          JOIN students s ON s.student_id = a.student_id
          WHERE a.id = $1 AND ($2::text = 'coordinator' OR s.supervisor_id = $3::text)
          `,
          [id, auth?.role, auth?.id]
        );
        if (current.rows.length > 0) {
          return res.status(409).json({
            message: `This log changed while you had it open: it is now ${current.rows[0].status.toLowerCase()}. Check it again before deciding.`,
            currentStatus: current.rows[0].status,
          });
        }
        return res.status(404).json({
          message:
            "Attendance record not found.",
        });
      }

      // The supervisor is the usual reviewer, so a decision the coordinator
      // makes on one of their interns' logs should not come as a surprise.
      if (auth?.role === "coordinator" && result.rows[0].supervisor_id) {
        const outcome =
          status === "Pending" ? "returned to pending" : status.toLowerCase();
        await createNotification({
          supervisorId: String(result.rows[0].supervisor_id),
          title: "Coordinator decided an attendance log",
          message: `${result.rows[0].student_name}'s attendance for ${result.rows[0].date} was ${outcome} by the OJT coordinator.${
            cleanReason ? ` Reason: ${cleanReason}` : ""
          }`,
          type: "attendance",
        });
      }

      // Verified hours changed, so the student may have just completed (or
      // dropped back under) their requirement.
      await syncCompletion(String(result.rows[0].student_id));

      if (status === "Pending") {
        await createNotification({
          studentId: result.rows[0].student_id,
          title: "Attendance back under review",
          message: `The decision on your attendance for ${result.rows[0].date} was withdrawn. It is waiting to be reviewed again.`,
          type: "attendance",
        });
        return res.json({
          message: "Attendance returned to pending.",
          attendance: result.rows[0],
        });
      }

      await createNotification({
        studentId: result.rows[0].student_id,
        title:
          status === "Verified"
            ? "Attendance verified"
            : "Attendance rejected",
        message:
          status === "Verified"
            ? `Your attendance for ${result.rows[0].date} was verified by your ${
                auth?.role === "coordinator" ? "OJT coordinator" : "supervisor"
              }.`
            : `Your attendance for ${result.rows[0].date} was rejected.${
                cleanReason ? ` Reason: ${cleanReason}` : ""
              } You can ask for it to be reviewed again from your Attendance page.`,
        type: "attendance",
      });

      // A rejected log is a discrepancy the coordinator is expected to follow.
      if (status === "Rejected" && auth?.role === "supervisor") {
        await notifyCoordinators({
          title: "Attendance log rejected",
          message: `A supervisor rejected a student's attendance for ${result.rows[0].date}.${
            cleanReason ? ` Reason: ${cleanReason}` : ""
          }`,
          type: "attendance",
        });
      }

      return res.json({
        message:
          `Attendance ${status.toLowerCase()} successfully.`,

        attendance:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "UPDATE ATTENDANCE STATUS ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to update attendance status.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| STUDENT DASHBOARD
|--------------------------------------------------------------------------
*/

app.get(
  "/api/dashboard/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own dashboard.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | ATTENDANCE TOTALS
      |--------------------------------------------------------------------------
      */

      const attendanceResult =
        await pool.query(
          `
          SELECT
            COALESCE(
              SUM(hours),
              0
            ) AS hours_rendered,

            COUNT(*) AS days_logged

          FROM attendance

          WHERE student_id = $1
          AND status = 'Verified'
          `,
          [studentId]
        );

      /*
      |--------------------------------------------------------------------------
      | TASK TOTALS
      |--------------------------------------------------------------------------
      */

      const taskResult =
        await pool.query(
          `
          SELECT
            COUNT(*) FILTER (
              WHERE status IN (
                'Pending',
                'In Progress'
              )
            ) AS active_tasks,

            COUNT(*) AS total_tasks,

            COUNT(*) FILTER (
              WHERE status = 'Reviewed'
            ) AS completed_tasks

          FROM tasks

          WHERE student_id = $1
          `,
          [studentId]
        );

      /*
      |--------------------------------------------------------------------------
      | WEEKLY HOURS
      |--------------------------------------------------------------------------
      */

      const weeklyResult =
        await pool.query(
          `
          SELECT
            TO_CHAR(
              date,
              'Dy'
            ) AS day,

            COALESCE(
              SUM(hours),
              0
            ) AS hours

          FROM attendance

          WHERE student_id = $1

          AND status = 'Verified'

          AND date >= CURRENT_DATE
            - INTERVAL '6 days'

          GROUP BY date

          ORDER BY date ASC
          `,
          [studentId]
        );

      /*
      |--------------------------------------------------------------------------
      | CONVERT VALUES
      |--------------------------------------------------------------------------
      */

      const hoursRendered =
        Number(
          attendanceResult
            .rows[0]
            .hours_rendered
        );

      const daysLogged =
        Number(
          attendanceResult
            .rows[0]
            .days_logged
        );

      const activeTasks =
        Number(
          taskResult
            .rows[0]
            .active_tasks
        );

      const totalTasks =
        Number(
          taskResult
            .rows[0]
            .total_tasks
        );

      const completedTasks =
        Number(
          taskResult
            .rows[0]
            .completed_tasks
        );

      /*
      |--------------------------------------------------------------------------
      | REQUIRED HOURS
      |--------------------------------------------------------------------------
      */

      const requiredHoursResult =
        await pool.query(
          `
          SELECT required_hours, completed_at
          FROM students
          WHERE student_id = $1
          `,
          [studentId]
        );

      const requiredHours =
        requiredHoursResult.rows.length > 0 &&
        requiredHoursResult.rows[0].required_hours
          ? Number(requiredHoursResult.rows[0].required_hours)
          : 180;

      const completion =
        requiredHours > 0
          ? Math.min(
              Math.round(
                (
                  hoursRendered /
                  requiredHours
                ) * 100
              ),
              100
            )
          : 0;

      return res.json({
        hoursRendered,
        requiredHours,
        daysLogged,
        activeTasks,
        completion,

        weeklyHours:
          weeklyResult.rows.map(
            (item) => ({
              day:
                item.day,

              hours:
                Number(
                  item.hours
                ),
            })
          ),

        totalTasks,
        completedTasks,
        completedAt: requiredHoursResult.rows[0]?.completed_at ?? null,
      });
    } catch (error) {
      console.error(
        "DASHBOARD ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get dashboard data.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUBMIT COMPLAINT
|--------------------------------------------------------------------------
*/

app.post(
  "/api/complaints",
  requireRole("student"),
  upload.single("evidence"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    let complaintSaved = false;
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        report_type,
        reported_student_name,
        reported_program_section,
        supervisor_name,
        company_name,
        category,
        description,
      } = req.body;

      if (!report_type) {
        return res.status(400).json({
          message:
            "Report type is required.",
        });
      }

      if (
        report_type !== "student" &&
        report_type !== "supervisor"
      ) {
        return res.status(400).json({
          message:
            "Invalid report type.",
        });
      }

      if (!category) {
        return res.status(400).json({
          message:
            "Complaint category is required.",
        });
      }

      if (
        !description ||
        description.trim() === ""
      ) {
        return res.status(400).json({
          message:
            "Complaint description is required.",
        });
      }
      if (!auth || auth.role !== "student") {
        return res.status(401).json({ message: "Student login is required." });
      }

      let evidenceUrl:
        | string
        | null = null;

      if (req.file) {
        uploadedFileName = await savePrivateFile(req.file);
        evidenceUrl = `/uploads/${uploadedFileName}`;
      }

      const cleanStudentName =
        typeof reported_student_name ===
          "string" &&
        reported_student_name.trim() !== ""
          ? reported_student_name.trim()
          : null;

      const cleanProgramSection =
        typeof reported_program_section ===
          "string" &&
        reported_program_section.trim() !== ""
          ? reported_program_section.trim()
          : null;

      const cleanSupervisorName =
        typeof supervisor_name ===
          "string" &&
        supervisor_name.trim() !== ""
          ? supervisor_name.trim()
          : null;

      const cleanCompanyName =
        typeof company_name ===
          "string" &&
        company_name.trim() !== ""
          ? company_name.trim()
          : null;

      const result =
        await pool.query(
          `
          INSERT INTO complaints
          (
            student_id,
            report_type,
            reported_student_name,
            reported_program_section,
            supervisor_name,
            company_name,
            category,
            description,
            evidence_url,
            status
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            'Pending'
          )

          RETURNING
            id,
            student_id,
            report_type,
            reported_student_name,
            reported_program_section,
            supervisor_name,
            company_name,
            category,
            description,
            evidence_url,
            status,
            resolved_by,
            resolution_notes,
            resolved_at,
            created_at,
            updated_at
          `,
          [
            auth.id,
            report_type,
            cleanStudentName,
            cleanProgramSection,
            cleanSupervisorName,
            cleanCompanyName,
            category.trim(),
            description.trim(),
            evidenceUrl,
          ]
        );
      complaintSaved = true;

      const coordinators = await pool.query(
        `SELECT coordinator_id FROM coordinators WHERE is_active = TRUE`
      );
      await Promise.all(
        coordinators.rows.map((coordinator) =>
          createNotification({
            coordinatorId: String(coordinator.coordinator_id),
            title: "New complaint filed",
            message: `A student filed a ${category.trim()} complaint for coordinator review.`,
            type: "warning",
          })
        )
      );

      return res.status(201).json({
        message:
          "Complaint submitted successfully.",

        complaint:
          result.rows[0],
      });
    } catch (error) {
      if (uploadedFileName && !complaintSaved) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
          console.error("FAILED TO REMOVE UNRECORDED COMPLAINT EVIDENCE:", cleanupError);
        });
      }
      console.error(
        "SUBMIT COMPLAINT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to submit complaint.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET COMPLAINTS FOR STUDENT
|--------------------------------------------------------------------------
*/

app.get(
  "/api/complaints/student/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own complaints.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            report_type,
            reported_student_name,
            reported_program_section,
            supervisor_name,
            company_name,
            category,
            description,
            evidence_url,
            status,
            resolved_by,
            resolution_notes,
            resolved_at,
            created_at,
            updated_at
          FROM complaints
          WHERE student_id = $1
          ORDER BY created_at DESC
          `,
          [studentId]
        );

      return res.json({
        complaints:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET COMPLAINTS ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get complaints.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET NOTIFICATIONS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/notifications/student/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own notifications.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            title,
            message,
            type,
            is_read,
            created_at
          FROM notifications
          WHERE student_id = $1
          ORDER BY created_at DESC
          `,
          [studentId]
        );

      return res.json({
        notifications:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET NOTIFICATIONS ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get notifications.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COMPATIBILITY ROUTE FOR OLD NOTIFICATION FRONTEND
|--------------------------------------------------------------------------
*/

app.get(
  "/api/notifications/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own notifications.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            title,
            message,
            type,
            is_read,
            created_at
          FROM notifications
          WHERE student_id = $1
          ORDER BY created_at DESC
          `,
          [studentId]
        );

      return res.json({
        notifications:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET NOTIFICATIONS COMPATIBILITY ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get notifications.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UNREAD NOTIFICATION COUNT
|--------------------------------------------------------------------------
*/

app.get(
  "/api/notifications/student/:studentId/unread-count",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own notification count.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            COUNT(*) AS count
          FROM notifications
          WHERE student_id = $1
          AND is_read = FALSE
          `,
          [studentId]
        );

      return res.json({
        count:
          Number(
            result.rows[0].count
          ),
      });
    } catch (error) {
      console.error(
        "GET UNREAD NOTIFICATION COUNT ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get unread notification count.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MARK NOTIFICATION AS READ
|--------------------------------------------------------------------------
*/

app.put(
  "/api/notifications/:id/read",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        id,
      } = req.params;
      if (!auth) {
        return res.status(401).json({ message: "Authentication is required." });
      }
      const recipientColumn = {
        student: "student_id",
        supervisor: "supervisor_id",
        coordinator: "coordinator_id",
      }[auth.role];

      const result =
        await pool.query(
          `
          UPDATE notifications
          SET is_read = TRUE
          WHERE id = $1
          AND ${recipientColumn} = $2

          RETURNING
            id,
            student_id,
            supervisor_id,
            coordinator_id,
            title,
            message,
            type,
            is_read,
            created_at
          `,
          [id, auth.id]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          message:
            "Notification not found.",
        });
      }

      return res.json({
        message:
          "Notification marked as read.",

        notification:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "MARK NOTIFICATION READ ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to mark notification as read.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MARK ALL NOTIFICATIONS AS READ
|--------------------------------------------------------------------------
*/

app.put(
  "/api/notifications/student/:studentId/read-all",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only mark your own notifications as read.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      await pool.query(
        `
        UPDATE notifications
        SET is_read = TRUE
        WHERE student_id = $1
        AND is_read = FALSE
        `,
        [studentId]
      );

      return res.json({
        message:
          "All notifications marked as read.",
      });
    } catch (error) {
      console.error(
        "MARK ALL NOTIFICATIONS READ ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to mark notifications as read.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// Marks every notification of the signed-in account as read, for any role.
app.put(
  "/api/notifications/read-all",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) {
      return res.status(401).json({ message: "Authentication is required." });
    }
    const recipientColumn = {
      student: "student_id",
      supervisor: "supervisor_id",
      coordinator: "coordinator_id",
    }[auth.role];

    try {
      const result = await pool.query(
        `UPDATE notifications SET is_read = TRUE
         WHERE ${recipientColumn} = $1 AND is_read = FALSE`,
        [auth.id]
      );
      return res.json({
        message: "All notifications marked as read.",
        updated: result.rowCount ?? 0,
      });
    } catch (error) {
      console.error("MARK ALL NOTIFICATIONS READ ERROR:", error);
      return res.status(500).json({
        message: "Failed to mark notifications as read.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OJT SCHEDULE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/ojt-schedule/:studentId",
  requireRole("student"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const {
        studentId,
      } = req.params;

      if (!auth || auth.id !== studentId) {
        return res.status(403).json({
          message: "You can only view your own OJT schedule.",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Student ID is required.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            student_id,
            day,
            start_time,
            end_time,
            focus,
            hours,
            is_active

          FROM ojt_schedule

          WHERE student_id = $1
          AND is_active = TRUE

          ORDER BY
            CASE day
              WHEN 'Monday' THEN 1
              WHEN 'Tuesday' THEN 2
              WHEN 'Wednesday' THEN 3
              WHEN 'Thursday' THEN 4
              WHEN 'Friday' THEN 5
              WHEN 'Saturday' THEN 6
              WHEN 'Sunday' THEN 7
              ELSE 8
            END
          `,
          [studentId]
        );

      return res.json({
        schedule:
          result.rows,
      });
    } catch (error) {
      console.error(
        "GET OJT SCHEDULE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to get OJT schedule.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.get(
  "/api/company/:studentId",
  requireRole("student"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { studentId } = req.params;
    if (!auth || auth.id !== studentId) {
      return res.status(403).json({
        message: "You can only view your own company information.",
      });
    }
    const result = await pool.query(
      `
      SELECT
        s.company AS name,
        COALESCE(sup.name, '') AS supervisor,
        COALESCE(sup.department, '') AS department,
        ''::text AS address
      FROM students s
      LEFT JOIN supervisors sup
        ON sup.supervisor_id::text = s.supervisor_id::text
      WHERE s.student_id::text = $1::text
      `,
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Student not found." });
    }

    return res.json({ company: result.rows[0] });
  } catch (error) {
    console.error("GET STUDENT COMPANY ERROR:", error);
    return res.status(500).json({
      message: "Failed to load company information.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

/*
|--------------------------------------------------------------------------
| COORDINATOR LOGIN
|--------------------------------------------------------------------------
*/

app.post("/api/login/coordinator", loginGuard("coordinator"), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const result = await pool.query(
      `
      SELECT id, coordinator_id, email, password, name, department, is_active,
             auth_version, must_change_password
      FROM coordinators
      WHERE LOWER(email) = LOWER(TRIM($1))
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid coordinator email or password.",
      });
    }

    const coordinator = result.rows[0];

    const passwordOk = await verifyPassword(
      password,
      coordinator.password
    );

    if (!passwordOk) {
      return res.status(401).json({
        message: "Invalid coordinator email or password.",
      });
    }

    if (coordinator.is_active === false) {
      return res.status(403).json({
        message: "This coordinator account has been deactivated.",
      });
    }

    await upgradeLegacyPassword(
      "coordinator",
      String(coordinator.coordinator_id),
      password,
      coordinator.password
    );
    delete coordinator.password;
    coordinator.must_change_password =
      ENFORCE_PASSWORD_CHANGE && coordinator.must_change_password === true;

    return res.json({
      message: "Login successful!",
      coordinator,
      must_change_password: coordinator.must_change_password,
      token: signToken(
        "coordinator",
        String(coordinator.coordinator_id),
        Number(coordinator.auth_version)
      ),
    });
  } catch (error) {
    console.error("COORDINATOR LOGIN ERROR:", error);

    return res.status(500).json({
      message: "Coordinator login failed.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/*
|--------------------------------------------------------------------------
| USER MANAGEMENT — STUDENTS (Coordinator only)
|--------------------------------------------------------------------------
*/

app.get(
  "/api/coordinator/students",
  requireCoordinator,
  async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? `%${req.query.q}%` : "%";
      const status = req.query.status as string | undefined;

      const result = await pool.query(
        `
        SELECT
          s.id, s.student_id, s.email, s.name, s.program, s.company,
          s.supervisor_id, sup.name AS supervisor_name,
          s.required_hours, s.is_active, s.coordinator_id,
          COALESCE((
            SELECT SUM(a.hours) FROM attendance a
            WHERE a.student_id::text = s.student_id::text AND a.status = 'Verified'
          ), 0) AS hours_rendered
        FROM students s
        LEFT JOIN supervisors sup
          ON TRIM(sup.supervisor_id::text) = TRIM(s.supervisor_id::text)
        WHERE (s.name ILIKE $1 OR s.email ILIKE $1 OR s.student_id::text ILIKE $1 OR s.company ILIKE $1 OR s.program ILIKE $1)
        AND ($2::text IS NULL
          OR ($2 = 'active' AND s.is_active = TRUE)
          OR ($2 = 'inactive' AND s.is_active = FALSE))
        ORDER BY s.name ASC
        `,
        [q, status || null]
      );

      return res.json({ students: result.rows });
    } catch (error) {
      console.error("LIST STUDENTS ERROR:", error);
      return res.status(500).json({
        message: "Failed to list students.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * Tells everyone affected when a student is given, moved to, or taken from
 * a supervisor: the student, the new supervisor, and the previous one.
 */
async function notifySupervisorAssignment(
  studentId: string,
  studentName: string,
  previousSupervisorId: string | null,
  currentSupervisorId: string | null
): Promise<void> {
  try {
    if (currentSupervisorId) {
      const supervisor = await pool.query<{ name: string; company: string | null }>(
        `SELECT name, company FROM supervisors WHERE supervisor_id = $1`,
        [currentSupervisorId]
      );
      await createNotification({
        supervisorId: currentSupervisorId,
        title: "New intern assigned",
        message: `${studentName} has been assigned to you by the OJT coordinator.`,
        type: "info",
      });
      await createNotification({
        studentId,
        title: "Supervisor assigned",
        message: `${supervisor.rows[0]?.name || "A supervisor"}${
          supervisor.rows[0]?.company ? ` of ${supervisor.rows[0].company}` : ""
        } is now your OJT supervisor.`,
        type: "info",
      });
    }
    if (previousSupervisorId && previousSupervisorId !== currentSupervisorId) {
      await createNotification({
        supervisorId: previousSupervisorId,
        title: "Intern reassigned",
        message: `${studentName} is no longer assigned to you.`,
        type: "info",
      });
    }
  } catch (error) {
    // A notification failure must never undo the assignment itself.
    console.error("SUPERVISOR ASSIGNMENT NOTIFICATION ERROR:", error);
  }
}

/**
 * Why a student cannot be given this supervisor, or null when they can.
 * A deactivated supervisor is refused, except when they are already the
 * student's supervisor (so an unrelated edit does not fail).
 */
async function supervisorProblem(
  supervisorId: unknown,
  currentStudentId?: string
): Promise<string | null> {
  if (supervisorId === undefined || supervisorId === null || supervisorId === "") {
    return null;
  }
  const result = await pool.query<{ is_active: boolean }>(
    `SELECT is_active FROM supervisors WHERE supervisor_id = $1`,
    [String(supervisorId)]
  );
  if (result.rows.length === 0) return "Selected supervisor does not exist.";
  if (result.rows[0].is_active) return null;
  if (currentStudentId) {
    const current = await pool.query(
      `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`,
      [currentStudentId, String(supervisorId)]
    );
    if (current.rows.length > 0) return null;
  }
  return "That supervisor's account is deactivated. Choose an active supervisor.";
}

/** Why a required-hours value is not acceptable, or null when it is. */
function requiredHoursProblem(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 5000) {
    return "Required hours must be a number between 1 and 5000.";
  }
  return null;
}

/** Sends the same notification to every active student and supervisor. */
async function notifyEveryone(notification: {
  title: string;
  message: string;
  type?: string;
}): Promise<void> {
  const [students, supervisors] = await Promise.all([
    pool.query<{ student_id: string }>(`SELECT student_id FROM students WHERE is_active = TRUE`),
    pool.query<{ supervisor_id: string }>(
      `SELECT supervisor_id FROM supervisors WHERE is_active = TRUE`
    ),
  ]);
  await Promise.all([
    ...students.rows.map((row) =>
      createNotification({ studentId: String(row.student_id), ...notification })
    ),
    ...supervisors.rows.map((row) =>
      createNotification({ supervisorId: String(row.supervisor_id), ...notification })
    ),
  ]);
}

app.post(
  "/api/coordinator/students",
  requireCoordinator,
  async (req, res) => {
    try {
      const {
        student_id,
        email,
        password,
        name,
        program,
        company,
        supervisor_id,
        required_hours,
      } = req.body;

      if (!student_id || !email || !password || !name) {
        return res.status(400).json({
          message: "student_id, email, password, and name are required.",
        });
      }

      const policyError = passwordPolicyError(password);
      if (policyError) {
        return res.status(400).json({ message: `Starting password: ${policyError}` });
      }

      const supervisorIssue = await supervisorProblem(supervisor_id);
      if (supervisorIssue) {
        return res.status(400).json({ message: supervisorIssue });
      }
      const hoursIssue = requiredHoursProblem(required_hours);
      if (hoursIssue) {
        return res.status(400).json({ message: hoursIssue });
      }

      const hashed = await hashPassword(password);

      // The coordinator chose this password, so the student must replace it.
      const result = await pool.query(
        `
        INSERT INTO students
          (student_id, email, password, name, program, company, supervisor_id, required_hours, is_active, coordinator_id, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, TRUE)
        RETURNING id, student_id, email, name, program, company, supervisor_id, required_hours, is_active
        `,
        [
          student_id,
          email,
          hashed,
          name,
          program || null,
          company || null,
          supervisor_id || null,
          required_hours || 180,
          (req as AuthedRequest).auth?.id || null,
        ]
      );

      await createNotification({
        studentId: String(student_id),
        title: "Welcome to INTERNet",
        message: `Your OJT account has been created. You can now log in as ${email}.`,
        type: "info",
      });

      if (supervisor_id) {
        await notifySupervisorAssignment(String(student_id), name, null, String(supervisor_id));
      }

      return res.status(201).json({
        message: "Student account created.",
        student: result.rows[0],
      });
    } catch (error: any) {
      console.error("CREATE STUDENT ERROR:", error);

      if (error?.code === "23505") {
        return res.status(409).json({
          message: "A student with that ID or email already exists.",
        });
      }

      return res.status(500).json({
        message: "Failed to create student.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.put(
  "/api/coordinator/students/:studentId",
  requireCoordinator,
  async (req, res) => {
    try {
      const { studentId } = req.params;

      const {
        name,
        email,
        program,
        company,
        supervisor_id,
        required_hours,
      } = req.body;

      const supervisorIssue = await supervisorProblem(supervisor_id, String(studentId));
      if (supervisorIssue) {
        return res.status(400).json({ message: supervisorIssue });
      }
      const hoursIssue = requiredHoursProblem(required_hours);
      if (hoursIssue) {
        return res.status(400).json({ message: hoursIssue });
      }

      const before = await pool.query<{ supervisor_id: string | null; required_hours: number }>(
        `SELECT supervisor_id, required_hours FROM students WHERE student_id = $1`,
        [studentId]
      );

      // A field named in the request is saved as sent, so an optional field
      // can be cleared; a field left out of the request keeps its value.
      const sent = (field: string) =>
        Object.prototype.hasOwnProperty.call(req.body ?? {}, field);

      const result = await pool.query(
        `
        UPDATE students SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          program = CASE WHEN $9::boolean THEN $3::text ELSE program END,
          company = CASE WHEN $10::boolean THEN $4::text ELSE company END,
          supervisor_id = CASE WHEN $8::boolean THEN $5 ELSE supervisor_id END,
          required_hours = COALESCE($6, required_hours)
        WHERE student_id = $7
        RETURNING id, student_id, email, name, program, company, supervisor_id, required_hours, is_active
        `,
        [
          name || null,
          email || null,
          program || null,
          company || null,
          supervisor_id || null,
          required_hours ? Math.round(Number(required_hours)) : null,
          studentId,
          // Only reassign (or unassign) when the request names a supervisor
          // field; an edit that omits it keeps the current supervisor.
          sent("supervisor_id"),
          sent("program"),
          sent("company"),
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Student not found." });
      }

      const previousHours = Number(before.rows[0]?.required_hours);
      const currentHours = Number(result.rows[0].required_hours);
      if (previousHours !== currentHours) {
        await createNotification({
          studentId: String(result.rows[0].student_id),
          title: "Required hours changed",
          message: `Your required OJT hours were changed from ${previousHours} to ${currentHours} by the OJT coordinator.`,
          type: "info",
        }).catch((error) => console.error("REQUIRED HOURS NOTIFICATION ERROR:", error));
      }

      const previousSupervisor = before.rows[0]?.supervisor_id ?? null;
      const currentSupervisor = result.rows[0].supervisor_id ?? null;
      if (previousSupervisor !== currentSupervisor) {
        await notifySupervisorAssignment(
          String(result.rows[0].student_id),
          result.rows[0].name,
          previousSupervisor,
          currentSupervisor
        );
      }

      // Changing the requirement can complete, or un-complete, the student.
      await syncCompletion(String(result.rows[0].student_id));

      return res.json({
        message: "Student updated.",
        student: result.rows[0],
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({
          message: "That email address is already used by another student.",
        });
      }
      console.error("UPDATE STUDENT ERROR:", error);
      return res.status(500).json({
        message: "Failed to update student.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.patch(
  "/api/coordinator/students/:studentId/status",
  requireCoordinator,
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const { is_active } = req.body;

      const result = await pool.query(
        `
        UPDATE students SET is_active = $1
        WHERE student_id = $2
        RETURNING student_id, name, is_active, supervisor_id
        `,
        [Boolean(is_active), studentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Student not found." });
      }
      if (!is_active) await cutOffAccount("student", String(result.rows[0].student_id));

      if (result.rows[0].supervisor_id) {
        await createNotification({
          supervisorId: String(result.rows[0].supervisor_id),
          title: is_active ? "Intern account reactivated" : "Intern account deactivated",
          message: is_active
            ? `${result.rows[0].name}'s account is active again. Their records are back in your lists.`
            : `${result.rows[0].name}'s account was deactivated by the OJT coordinator. Their records no longer appear in your lists.`,
          type: "info",
        }).catch((error) => console.error("STUDENT STATUS NOTIFICATION ERROR:", error));
      }
      if (is_active) {
        await createNotification({
          studentId: String(result.rows[0].student_id),
          title: "Account reactivated",
          message: "Your OJT account is active again. Your records were kept while it was off.",
          type: "info",
        }).catch((error) => console.error("STUDENT STATUS NOTIFICATION ERROR:", error));
      }

      return res.json({
        message: `Student ${is_active ? "activated" : "deactivated"}.`,
        student: result.rows[0],
      });
    } catch (error) {
      console.error("TOGGLE STUDENT STATUS ERROR:", error);
      return res.status(500).json({
        message: "Failed to update student status.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| USER MANAGEMENT — SUPERVISORS (Coordinator only)
|--------------------------------------------------------------------------
*/

app.get(
  "/api/coordinator/supervisors",
  requireCoordinator,
  async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? `%${req.query.q}%` : "%";

      const result = await pool.query(
        `
        SELECT
          sup.id, sup.supervisor_id, sup.email, sup.name, sup.company,
          sup.department, sup.is_active,
          (SELECT COUNT(*) FROM students s
            WHERE TRIM(s.supervisor_id::text) = TRIM(sup.supervisor_id::text)
              AND s.is_active = TRUE
          ) AS intern_count
        FROM supervisors sup
        WHERE (sup.name ILIKE $1 OR sup.email ILIKE $1 OR sup.company ILIKE $1 OR sup.department ILIKE $1)
        ORDER BY sup.name ASC
        `,
        [q]
      );

      return res.json({ supervisors: result.rows });
    } catch (error) {
      console.error("LIST SUPERVISORS ERROR:", error);
      return res.status(500).json({
        message: "Failed to list supervisors.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/coordinator/search",
  requireCoordinator,
  async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (query.length > 100) {
      return res.status(400).json({
        message: "Search query must be 100 characters or fewer.",
      });
    }

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    try {
      const pattern = `%${query}%`;
      const [students, supervisors, complaints] = await Promise.all([
        pool.query(
          `SELECT student_id, name, company, program
           FROM students
           WHERE name ILIKE $1
             OR email ILIKE $1
             OR student_id::text ILIKE $1
             OR company ILIKE $1
             OR program ILIKE $1
           ORDER BY name ASC
           LIMIT 5`,
          [pattern]
        ),
        pool.query(
          `SELECT supervisor_id, name, company, department
           FROM supervisors
           WHERE name ILIKE $1
             OR email ILIKE $1
             OR supervisor_id::text ILIKE $1
             OR company ILIKE $1
             OR department ILIKE $1
           ORDER BY name ASC
           LIMIT 5`,
          [pattern]
        ),
        pool.query(
          `SELECT id, category, description, reported_student_name,
                  company_name, status, created_at
           FROM complaints
           WHERE category ILIKE $1
             OR description ILIKE $1
             OR student_id::text ILIKE $1
             OR reported_student_name ILIKE $1
             OR company_name ILIKE $1
             OR supervisor_name ILIKE $1
             OR created_at::text ILIKE $1
           ORDER BY created_at DESC
           LIMIT 5`,
          [pattern]
        ),
      ]);
      const destination = `?q=${encodeURIComponent(query)}`;
      const results = [
        ...students.rows.map((row) => ({
          type: "student",
          id: String(row.student_id),
          title: row.name,
          detail: `${row.student_id} · ${row.company || row.program || "Student"}`,
          href: `/coordinator/students${destination}`,
        })),
        ...supervisors.rows.map((row) => ({
          type: "supervisor",
          id: String(row.supervisor_id),
          title: row.name,
          detail: `${row.company || row.department || "Supervisor"} · ${row.supervisor_id}`,
          href: `/coordinator/supervisors${destination}`,
        })),
        ...complaints.rows.map((row) => ({
          type: "complaint",
          id: String(row.id),
          title: row.category || "Complaint",
          detail: `${row.status} · ${row.reported_student_name || row.company_name || row.description}`,
          href: `/coordinator/complaints${destination}`,
        })),
      ];

      return res.json({ results });
    } catch (error) {
      console.error("COORDINATOR SEARCH ERROR:", error);
      return res.status(500).json({
        message: "Failed to search coordinator records.",
      });
    }
  }
);

app.post(
  "/api/coordinator/supervisors",
  requireCoordinator,
  async (req, res) => {
    try {
      const { supervisor_id, email, password, name, company, department } =
        req.body;

      if (!supervisor_id || !email || !password || !name) {
        return res.status(400).json({
          message:
            "supervisor_id, email, password, and name are required.",
        });
      }

      const policyError = passwordPolicyError(password);
      if (policyError) {
        return res.status(400).json({ message: `Starting password: ${policyError}` });
      }

      const hashed = await hashPassword(password);

      // The coordinator chose this password, so the supervisor must replace it.
      const result = await pool.query(
        `
        INSERT INTO supervisors
          (supervisor_id, email, password, name, company, department, is_active, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
        RETURNING id, supervisor_id, email, name, company, department, is_active
        `,
        [
          supervisor_id,
          email,
          hashed,
          name,
          company || null,
          department || null,
        ]
      );

      return res.status(201).json({
        message: "Supervisor account created.",
        supervisor: result.rows[0],
      });
    } catch (error: any) {
      console.error("CREATE SUPERVISOR ERROR:", error);

      if (error?.code === "23505") {
        return res.status(409).json({
          message: "A supervisor with that ID or email already exists.",
        });
      }

      return res.status(500).json({
        message: "Failed to create supervisor.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.put(
  "/api/coordinator/supervisors/:supervisorId",
  requireCoordinator,
  async (req, res) => {
    try {
      const { supervisorId } = req.params;
      const { name, email, company, department } = req.body;
      // A field named in the request is saved as sent, so it can be cleared.
      const sent = (field: string) =>
        Object.prototype.hasOwnProperty.call(req.body ?? {}, field);

      const result = await pool.query(
        `
        UPDATE supervisors SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          company = CASE WHEN $6::boolean THEN $3::text ELSE company END,
          department = CASE WHEN $7::boolean THEN $4::text ELSE department END
        WHERE supervisor_id = $5
        RETURNING id, supervisor_id, email, name, company, department, is_active
        `,
        [
          name || null,
          email || null,
          company || null,
          department || null,
          supervisorId,
          sent("company"),
          sent("department"),
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Supervisor not found." });
      }

      return res.json({
        message: "Supervisor updated.",
        supervisor: result.rows[0],
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({
          message: "That email address is already used by another supervisor.",
        });
      }
      console.error("UPDATE SUPERVISOR ERROR:", error);
      return res.status(500).json({
        message: "Failed to update supervisor.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.patch(
  "/api/coordinator/supervisors/:supervisorId/status",
  requireCoordinator,
  async (req, res) => {
    try {
      const { supervisorId } = req.params;
      const { is_active } = req.body;

      if (!is_active) {
        const assigned = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM students
           WHERE supervisor_id = $1 AND is_active = TRUE`,
          [supervisorId]
        );
        const interns = Number(assigned.rows[0]?.count || 0);
        if (interns > 0) {
          return res.status(409).json({
            message: `This supervisor still has ${interns} active ${
              interns === 1 ? "intern" : "interns"
            }. Assign ${interns === 1 ? "that intern" : "them"} to another supervisor first, so their work is not left without a reviewer.`,
          });
        }
      }

      const result = await pool.query(
        `
        UPDATE supervisors SET is_active = $1
        WHERE supervisor_id = $2
        RETURNING supervisor_id, name, is_active
        `,
        [Boolean(is_active), supervisorId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Supervisor not found." });
      }
      if (!is_active) await cutOffAccount("supervisor", String(result.rows[0].supervisor_id));

      return res.json({
        message: `Supervisor ${is_active ? "activated" : "deactivated"}.`,
        supervisor: result.rows[0],
      });
    } catch (error) {
      console.error("TOGGLE SUPERVISOR STATUS ERROR:", error);
      return res.status(500).json({
        message: "Failed to update supervisor status.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COORDINATOR DASHBOARD
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| ATTENDANCE DISCREPANCY RULES (Feature 4: flagged discrepancies)
|--------------------------------------------------------------------------
|
| A log is flagged when any of these is true:
|  - Rejected:        the supervisor rejected the log.
|  - Missing time-out: the log is from an earlier day and was never closed.
|  - Stale pending:   the log has waited more than STALE_PENDING_DAYS days
|                     for supervisor verification.
|
*/

const STALE_PENDING_DAYS = 2;

// A rejected log stays flagged until the coordinator settles it.
function openRejectionCondition(alias: string): string {
  return `(${alias}.status = 'Rejected' AND ${alias}.flag_acknowledged_at IS NULL)`;
}

function missingTimeoutCondition(alias: string): string {
  return `(${alias}.time_out IS NULL AND ${alias}.date < CURRENT_DATE)`;
}

function stalePendingCondition(alias: string): string {
  return `(${alias}.status = 'Pending' AND ${alias}.date < CURRENT_DATE - ${STALE_PENDING_DAYS})`;
}

function flaggedLogCondition(alias: string): string {
  return `(${openRejectionCondition(alias)} OR ${missingTimeoutCondition(alias)} OR ${stalePendingCondition(alias)})`;
}

app.get(
  "/api/coordinator/discrepancies",
  requireCoordinator,
  async (req, res) => {
    try {
      const studentId =
        typeof req.query.student_id === "string" && req.query.student_id.trim()
          ? req.query.student_id.trim()
          : null;
      const result = await pool.query(
        `
        SELECT
          a.id,
          a.student_id,
          s.name AS student_name,
          s.company,
          sup.name AS supervisor_name,
          TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
          a.time_in,
          a.break_time,
          a.break_end_time,
          a.time_out,
          a.hours,
          a.note,
          a.status,
          a.image_url,
          a.review_notes,
          a.correction_note,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN ${openRejectionCondition("a")} THEN 'Rejected by supervisor' END,
            CASE WHEN ${missingTimeoutCondition("a")} THEN 'No time-out recorded' END,
            CASE WHEN ${stalePendingCondition("a")}
              THEN 'Unverified for more than ${STALE_PENDING_DAYS} days' END
          ], NULL) AS reasons
        FROM attendance a
        INNER JOIN students s ON s.student_id = a.student_id
        LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
        WHERE ${flaggedLogCondition("a")}
          AND s.is_active = TRUE
          AND ($1::text IS NULL OR a.student_id = $1)
        ORDER BY a.date DESC, a.id DESC
        LIMIT 300
        `,
        [studentId]
      );
      return res.json({ discrepancies: result.rows });
    } catch (error) {
      console.error("COORDINATOR DISCREPANCIES ERROR:", error);
      return res.status(500).json({ message: "Failed to load flagged logs." });
    }
  }
);

app.get(
  "/api/coordinator/dashboard",
  requireCoordinator,
  async (_req, res) => {
    try {
      const [
        studentCount,
        supervisorCount,
        pendingAttendance,
        flagged,
        pendingComplaints,
        taskStats,
        hoursStats,
        todayStats,
        hoursTrend,
      ] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total FROM students`
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total FROM supervisors`
        ),
        pool.query(
          `SELECT COUNT(*) AS count FROM attendance a
           JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
           WHERE a.status = 'Pending'`
        ),
        pool.query(
          `SELECT COUNT(*) AS count FROM attendance a
           JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
           WHERE ${flaggedLogCondition("a")}`
        ),
        pool.query(
          `SELECT COUNT(*) AS count FROM complaints WHERE status = 'Pending'`
        ),
        pool.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE status = 'Submitted') AS awaiting_review,
            COUNT(*) FILTER (WHERE status = 'Reviewed') AS completed,
            COUNT(*) AS total
          FROM tasks t
          JOIN students s ON s.student_id = t.student_id AND s.is_active = TRUE
          `
        ),
        pool.query(
          `SELECT COALESCE(SUM(a.hours), 0) AS total_hours FROM attendance a
           JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
           WHERE a.status = 'Verified'`
        ),
        // Today at a glance: who has timed in, who is still on the clock,
        // who filed an absence, and the hours verified over the past week.
        pool.query(
          `
          SELECT
            (SELECT COUNT(DISTINCT a.student_id) FROM attendance a
              JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
              WHERE a.date = CURRENT_DATE) AS timed_in,
            (SELECT COUNT(*) FROM attendance a
              JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
              WHERE a.date = CURRENT_DATE AND a.time_out IS NULL) AS on_the_clock,
            (SELECT COUNT(*) FROM absences b
              JOIN students s ON s.student_id = b.student_id AND s.is_active = TRUE
              WHERE b.date = CURRENT_DATE) AS absent,
            (SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
              JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
              WHERE a.status = 'Verified' AND a.date > CURRENT_DATE - 7) AS week_hours
          `
        ),
        // Verified hours for each of the last 14 days, quiet days included.
        pool.query(
          `
          SELECT
            TO_CHAR(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(a.hours) FILTER (WHERE a.status = 'Verified'), 0) AS hours,
            COUNT(a.id) AS logs
          FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d(day)
          LEFT JOIN (
            attendance a
            JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
          ) ON a.date = d.day::date
          GROUP BY d.day
          ORDER BY d.day
          `
        ),
      ]);

      return res.json({
        today: {
          timedIn: Number(todayStats.rows[0].timed_in),
          onTheClock: Number(todayStats.rows[0].on_the_clock),
          absent: Number(todayStats.rows[0].absent),
        },
        weekHours: Number(todayStats.rows[0].week_hours),
        hoursTrend: hoursTrend.rows.map((row) => ({
          day: row.day,
          hours: Number(row.hours),
          logs: Number(row.logs),
        })),
        students: {
          active: Number(studentCount.rows[0].active),
          total: Number(studentCount.rows[0].total),
        },
        supervisors: {
          active: Number(supervisorCount.rows[0].active),
          total: Number(supervisorCount.rows[0].total),
        },
        pendingAttendance: Number(pendingAttendance.rows[0].count),
        flaggedAttendance: Number(flagged.rows[0].count),
        pendingComplaints: Number(pendingComplaints.rows[0].count),
        tasks: {
          awaitingReview: Number(taskStats.rows[0].awaiting_review),
          completed: Number(taskStats.rows[0].completed),
          total: Number(taskStats.rows[0].total),
        },
        totalHoursLogged: Number(hoursStats.rows[0].total_hours),
      });
    } catch (error) {
      console.error("COORDINATOR DASHBOARD ERROR:", error);
      return res.status(500).json({
        message: "Failed to load coordinator dashboard.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COORDINATOR MONITORING (per-student progress + flagged logs)
|--------------------------------------------------------------------------
*/

app.get(
  "/api/coordinator/monitoring",
  requireCoordinator,
  async (req, res) => {
    try {
      // Optional date range. Without it the answer is exactly what it has
      // always been. With it, each student also gets the verified hours and
      // the number of logs dated inside the range; overall progress and the
      // attention counts stay whole, because a requirement is met over the
      // whole placement and a problem does not go away by narrowing dates.
      const isDate = (value: unknown): value is string =>
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
      const from = req.query.from === undefined || req.query.from === "" ? null : req.query.from;
      const to = req.query.to === undefined || req.query.to === "" ? null : req.query.to;
      if ((from !== null && !isDate(from)) || (to !== null && !isDate(to))) {
        return res.status(400).json({ message: "Dates must be written as YYYY-MM-DD." });
      }
      if (from !== null && to !== null && from > to) {
        return res.status(400).json({ message: "The start date must not be after the end date." });
      }
      const hasPeriod = from !== null || to !== null;

      // Attendance and task aggregates are computed in separate LATERAL
      // subqueries. Joining both tables in one GROUP BY multiplies rows
      // (each log x each task) and inflated hours and counts.
      const result = await pool.query(
        `
        SELECT
          s.student_id, s.name, s.program, s.company, s.required_hours,
          s.completed_at,
          sup.name AS supervisor_name,
          att.hours_rendered,
          att.pending_logs,
          att.rejected_logs,
          att.missing_timeout_logs,
          att.stale_pending_logs,
          att.flagged_logs,
          att.last_log_date,
          att.period_hours,
          att.period_logs,
          tk.active_tasks,
          tk.tasks_awaiting_review,
          tk.overdue_tasks
        FROM students s
        LEFT JOIN supervisors sup
          ON TRIM(sup.supervisor_id::text) = TRIM(s.supervisor_id::text)
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(a.hours) FILTER (WHERE a.status = 'Verified'), 0) AS hours_rendered,
            COUNT(*) FILTER (WHERE a.status = 'Pending') AS pending_logs,
            COUNT(*) FILTER (WHERE ${openRejectionCondition("a")}) AS rejected_logs,
            COUNT(*) FILTER (WHERE ${missingTimeoutCondition("a")}) AS missing_timeout_logs,
            COUNT(*) FILTER (WHERE ${stalePendingCondition("a")}) AS stale_pending_logs,
            COUNT(*) FILTER (WHERE ${flaggedLogCondition("a")}) AS flagged_logs,
            TO_CHAR(MAX(a.date), 'YYYY-MM-DD') AS last_log_date,
            COALESCE(SUM(a.hours) FILTER (
              WHERE a.status = 'Verified'
                AND ($1::date IS NULL OR a.date >= $1::date)
                AND ($2::date IS NULL OR a.date <= $2::date)
            ), 0) AS period_hours,
            COUNT(*) FILTER (
              WHERE ($1::date IS NULL OR a.date >= $1::date)
                AND ($2::date IS NULL OR a.date <= $2::date)
            ) AS period_logs
          FROM attendance a
          WHERE TRIM(a.student_id::text) = TRIM(s.student_id::text)
        ) att ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE t.status IN ('Pending', 'In Progress')) AS active_tasks,
            COUNT(*) FILTER (WHERE t.status = 'Submitted') AS tasks_awaiting_review,
            COUNT(*) FILTER (
              WHERE t.status IN ('Pending', 'In Progress') AND t.due_date < CURRENT_DATE
            ) AS overdue_tasks
          FROM tasks t
          WHERE TRIM(t.student_id::text) = TRIM(s.student_id::text)
        ) tk ON TRUE
        WHERE s.is_active = TRUE
        ORDER BY s.name ASC
        `,
        [from, to]
      );

      const students = result.rows.map(({ period_hours, period_logs, ...row }) => ({
        ...row,
        ...(hasPeriod
          ? { period_hours: Number(period_hours), period_logs: Number(period_logs) }
          : {}),
        hours_rendered: Number(row.hours_rendered),
        pending_logs: Number(row.pending_logs),
        rejected_logs: Number(row.rejected_logs),
        missing_timeout_logs: Number(row.missing_timeout_logs),
        stale_pending_logs: Number(row.stale_pending_logs),
        flagged_logs: Number(row.flagged_logs),
        active_tasks: Number(row.active_tasks),
        tasks_awaiting_review: Number(row.tasks_awaiting_review),
        overdue_tasks: Number(row.overdue_tasks),
        completion: row.required_hours
          ? Math.min(
              100,
              Math.round(
                (Number(row.hours_rendered) / Number(row.required_hours)) *
                  100
              )
            )
          : 0,
      }));

      return res.json(hasPeriod ? { students, period: { from, to } } : { students });
    } catch (error) {
      console.error("COORDINATOR MONITORING ERROR:", error);
      return res.status(500).json({
        message: "Failed to load monitoring data.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COORDINATOR COMPLAINT OVERSIGHT
|--------------------------------------------------------------------------
*/

app.get(
  "/api/coordinator/complaints",
  requireCoordinator,
  async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

      if (query.length > 100) {
        return res.status(400).json({
          message: "Search query must be 100 characters or fewer.",
        });
      }

      const result = await pool.query(
        `
        SELECT
          c.id, c.student_id, c.filed_by_supervisor_id,
          COALESCE(s.name, sup.name) AS filed_by_name,
          CASE WHEN c.filed_by_supervisor_id IS NOT NULL THEN 'supervisor' ELSE 'student' END AS filed_by_role,
          c.report_type, c.reported_student_name, c.reported_student_id, c.reported_program_section,
          c.supervisor_name, c.company_name, c.category, c.description,
          c.evidence_url, c.status, c.resolved_by, c.resolution_notes,
          c.resolved_at, c.created_at, c.updated_at
        FROM complaints c
        LEFT JOIN students s ON s.student_id::text = c.student_id::text
        LEFT JOIN supervisors sup ON sup.supervisor_id::text = c.filed_by_supervisor_id::text
        WHERE ($1::text IS NULL OR c.status = $1)
          AND ($2::text IS NULL
            OR c.id::text ILIKE $2
            OR c.student_id::text ILIKE $2
            OR c.category ILIKE $2
            OR c.description ILIKE $2
            OR COALESCE(c.reported_student_name, '') ILIKE $2
            OR COALESCE(c.company_name, '') ILIKE $2
            OR COALESCE(c.supervisor_name, '') ILIKE $2
            OR COALESCE(s.name, sup.name, '') ILIKE $2
            OR c.created_at::text ILIKE $2)
        ORDER BY c.created_at DESC
        `,
        [status || null, query ? `%${query}%` : null]
      );

      return res.json({ complaints: result.rows });
    } catch (error) {
      console.error("COORDINATOR COMPLAINTS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load complaints.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.patch(
  "/api/coordinator/complaints/:id/resolve",
  requireCoordinator,
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const { status, resolution_notes } = req.body;

      if (!["In Review", "Resolved", "Dismissed"].includes(status)) {
        return res.status(400).json({
          message:
            "Status must be 'In Review', 'Resolved', or 'Dismissed'.",
        });
      }

      // Re-saving a closed complaint replaces its note; keep the old one in
      // the conversation so the record of what was decided is not lost.
      const earlier = await pool.query<{ status: string; resolution_notes: string | null }>(
        `SELECT status, resolution_notes FROM complaints WHERE id = $1`,
        [id]
      );
      const previousNote = earlier.rows[0]?.resolution_notes?.trim();
      if (
        previousNote &&
        ["Resolved", "Dismissed"].includes(earlier.rows[0].status) &&
        typeof resolution_notes === "string" &&
        resolution_notes.trim() &&
        resolution_notes.trim() !== previousNote
      ) {
        await pool
          .query(
            `INSERT INTO complaint_messages (complaint_id, author_role, author_id, author_name, message)
             VALUES ($1, 'coordinator', $2, 'OJT Coordinator', $3)`,
            [id, req.auth?.id || "coordinator", `Earlier note (${earlier.rows[0].status.toLowerCase()}): ${previousNote}`]
          )
          .catch((error) => console.error("KEEP RESOLUTION NOTE ERROR:", error));
      }

      const result = await pool.query(
        `
        UPDATE complaints SET
          status = $1::text,
          resolution_notes = COALESCE($2::text, resolution_notes),
          resolved_by = $3,
          resolved_at = CASE WHEN $1::text IN ('Resolved', 'Dismissed') THEN NOW() ELSE resolved_at END
        WHERE id = $4
        RETURNING *
        `,
        [
          status,
          resolution_notes || null,
          req.auth?.id || "OJT Coordinator",
          id,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Complaint not found." });
      }

      const complaint = result.rows[0];

      if (complaint.student_id) {
        await createNotification({
          studentId: complaint.student_id,
          title: `Complaint ${status.toLowerCase()}`,
          message: `Your filed complaint (${complaint.category}) is now ${status.toLowerCase()}.`,
          type: status === "Resolved" ? "success" : "info",
        });
      }

      if (complaint.filed_by_supervisor_id) {
        await createNotification({
          supervisorId: complaint.filed_by_supervisor_id,
          title: `Complaint ${status.toLowerCase()}`,
          message: `Your filed complaint (${complaint.category}) is now ${status.toLowerCase()}.`,
          type: status === "Resolved" ? "success" : "info",
        });
      }

      return res.json({
        message: "Complaint updated.",
        complaint,
      });
    } catch (error) {
      console.error("RESOLVE COMPLAINT ERROR:", error);
      return res.status(500).json({
        message: "Failed to update complaint.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COORDINATOR ANALYTICS
|--------------------------------------------------------------------------
|
| Every figure here counts active students only, the same rule the
| dashboard and Monitoring use, so the three pages never disagree.
|
| `?days=14|30|90` sets the period for the attendance figures. Progress,
| tasks, companies, complaints and evaluations are totals to date.
|
*/

const ANALYTICS_PERIODS = [14, 30, 90];

// Each active student's verified hours and how far that is toward their
// requirement (0 to 100).
const STUDENT_PROGRESS_CTE = `
  progress AS (
    SELECT
      s.student_id,
      NULLIF(TRIM(s.company), '') AS company,
      hrs.hours,
      CASE
        WHEN COALESCE(s.required_hours, 0) > 0
        THEN LEAST(100, hrs.hours / s.required_hours * 100)
        ELSE 0
      END AS percent
    FROM students s
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(a.hours), 0)::numeric AS hours
      FROM attendance a
      WHERE a.student_id = s.student_id AND a.status = 'Verified'
    ) hrs
    WHERE s.is_active = TRUE
  )
`;

app.get(
  "/api/coordinator/analytics",
  requireCoordinator,
  async (req, res) => {
    try {
      const requested = Number(req.query.days);
      const days = ANALYTICS_PERIODS.includes(requested) ? requested : 14;

      const [
        trend,
        period,
        progress,
        companies,
        companyRatings,
        companyComplaints,
        complaintsByCategory,
        taskFunnel,
        evaluationSummary,
      ] = await Promise.all([
        // One row for every day of the period, including days with no logs,
        // so the chart's spacing is true to the calendar.
        pool.query(
          `
          SELECT
            TO_CHAR(d.day, 'YYYY-MM-DD') AS day,
            COUNT(a.id) AS logs,
            COALESCE(SUM(a.hours) FILTER (WHERE a.status = 'Verified'), 0) AS hours,
            COUNT(DISTINCT a.student_id) AS students
          FROM generate_series(
            CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day'
          ) AS d(day)
          LEFT JOIN (
            attendance a
            JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
          ) ON a.date = d.day::date
          GROUP BY d.day
          ORDER BY d.day
          `,
          [days]
        ),
        // This period beside the one before it, for the change figures.
        pool.query(
          `
          SELECT
            COALESCE(SUM(a.hours) FILTER (WHERE a.status = 'Verified' AND a.date > CURRENT_DATE - $1::int), 0) AS hours,
            COALESCE(SUM(a.hours) FILTER (WHERE a.status = 'Verified' AND a.date <= CURRENT_DATE - $1::int), 0) AS previous_hours,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int) AS logs,
            COUNT(*) FILTER (WHERE a.date <= CURRENT_DATE - $1::int) AS previous_logs,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.status = 'Verified') AS verified,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.status = 'Pending') AS pending,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.status IN ('Rejected', 'Flagged')) AS rejected,
            COUNT(DISTINCT a.student_id) FILTER (WHERE a.date > CURRENT_DATE - $1::int) AS students_logged,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.capture_method = 'liveness') AS camera_checked,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.capture_method = 'supervisor') AS by_supervisor,
            COUNT(*) FILTER (WHERE a.date > CURRENT_DATE - $1::int AND a.capture_method IS NULL) AS unchecked
          FROM attendance a
          JOIN students s ON s.student_id = a.student_id AND s.is_active = TRUE
          WHERE a.date > CURRENT_DATE - ($1::int * 2)
          `,
          [days]
        ),
        pool.query(
          `
          WITH ${STUDENT_PROGRESS_CTE}
          SELECT
            COUNT(*) AS students,
            COALESCE(AVG(percent), 0) AS average,
            COALESCE(SUM(hours), 0) AS hours,
            COUNT(*) FILTER (WHERE percent <= 0) AS not_started,
            COUNT(*) FILTER (WHERE percent > 0 AND percent < 25) AS under_25,
            COUNT(*) FILTER (WHERE percent >= 25 AND percent < 50) AS under_50,
            COUNT(*) FILTER (WHERE percent >= 50 AND percent < 75) AS under_75,
            COUNT(*) FILTER (WHERE percent >= 75 AND percent < 100) AS under_100,
            COUNT(*) FILTER (WHERE percent >= 100) AS completed
          FROM progress
          `
        ),
        pool.query(
          `
          WITH ${STUDENT_PROGRESS_CTE}
          SELECT
            company,
            COUNT(*) AS students,
            COALESCE(SUM(hours), 0) AS hours,
            COALESCE(AVG(percent), 0) AS average
          FROM progress
          GROUP BY company
          ORDER BY COUNT(*) DESC, company ASC NULLS LAST
          `
        ),
        // What students said about the company they trained at.
        pool.query(
          `
          SELECT
            LOWER(TRIM(s.company)) AS company_key,
            COUNT(*) AS ratings,
            ROUND(AVG(e.rating)::numeric, 2) AS average_rating
          FROM evaluations e
          JOIN students s ON s.student_id = e.student_id
          WHERE e.evaluator_type = 'student' AND NULLIF(TRIM(s.company), '') IS NOT NULL
          GROUP BY LOWER(TRIM(s.company))
          `
        ),
        pool.query(
          `
          SELECT LOWER(TRIM(company_name)) AS company_key, COUNT(*) AS complaints
          FROM complaints
          WHERE NULLIF(TRIM(company_name), '') IS NOT NULL
          GROUP BY LOWER(TRIM(company_name))
          `
        ),
        pool.query(
          `
          SELECT
            category,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE status NOT IN ('Resolved', 'Dismissed')) AS open
          FROM complaints
          GROUP BY category
          ORDER BY COUNT(*) DESC, category ASC
          `
        ),
        pool.query(
          `
          SELECT
            t.status,
            COUNT(*) AS count,
            COUNT(*) FILTER (
              WHERE t.status IN ('Pending', 'In Progress') AND t.due_date < CURRENT_DATE
            ) AS overdue
          FROM tasks t
          JOIN students s ON s.student_id = t.student_id AND s.is_active = TRUE
          GROUP BY t.status
          `
        ),
        pool.query(
          `
          SELECT
            e.evaluator_type,
            e.category,
            COUNT(*) AS count,
            ROUND(AVG(e.rating)::numeric, 2) AS average_rating
          FROM evaluations e
          GROUP BY e.evaluator_type, e.category
          ORDER BY e.evaluator_type, e.category
          `
        ),
      ]);

      const ratingByCompany = new Map(
        companyRatings.rows.map((row) => [String(row.company_key), row])
      );
      const complaintsByCompany = new Map(
        companyComplaints.rows.map((row) => [String(row.company_key), Number(row.complaints)])
      );
      const companyRows = companies.rows.map((row) => {
        const key = row.company ? String(row.company).trim().toLowerCase() : "";
        const rating = ratingByCompany.get(key);
        return {
          company: row.company as string | null,
          students: Number(row.students),
          hours: Number(row.hours),
          averageCompletion: Math.round(Number(row.average)),
          ratings: rating ? Number(rating.ratings) : 0,
          averageRating: rating ? Number(rating.average_rating) : null,
          complaints: complaintsByCompany.get(key) ?? 0,
        };
      });

      // The four task stages, always all four and always in working order.
      const taskCounts = new Map(taskFunnel.rows.map((row) => [String(row.status), row]));
      const taskStages = ["Pending", "In Progress", "Submitted", "Reviewed"].map((status) => ({
        status,
        count: Number(taskCounts.get(status)?.count ?? 0),
        overdue: Number(taskCounts.get(status)?.overdue ?? 0),
      }));

      const totals = period.rows[0];
      const spread = progress.rows[0];

      return res.json({
        days,
        attendanceTrend: trend.rows.map((row) => ({
          day: row.day,
          logs: Number(row.logs),
          hours: Number(row.hours),
          students: Number(row.students),
        })),
        period: {
          hours: Number(totals.hours),
          previousHours: Number(totals.previous_hours),
          logs: Number(totals.logs),
          previousLogs: Number(totals.previous_logs),
          verified: Number(totals.verified),
          pending: Number(totals.pending),
          rejected: Number(totals.rejected),
          studentsLogged: Number(totals.students_logged),
          capture: {
            cameraChecked: Number(totals.camera_checked),
            bySupervisor: Number(totals.by_supervisor),
            unchecked: Number(totals.unchecked),
          },
        },
        progress: {
          students: Number(spread.students),
          averageCompletion: Math.round(Number(spread.average)),
          hours: Number(spread.hours),
          bands: [
            { label: "Not started", count: Number(spread.not_started) },
            { label: "Under 25%", count: Number(spread.under_25) },
            { label: "25 to 49%", count: Number(spread.under_50) },
            { label: "50 to 74%", count: Number(spread.under_75) },
            { label: "75 to 99%", count: Number(spread.under_100) },
            { label: "Completed", count: Number(spread.completed) },
          ],
        },
        companies: companyRows,
        // Kept for the exports and older clients: companies that have a name.
        studentsByCompany: companyRows
          .filter((row) => row.company)
          .map((row) => ({ company: row.company, student_count: String(row.students) })),
        complaintsByCategory: complaintsByCategory.rows.map((row) => ({
          category: row.category,
          count: Number(row.count),
          open: Number(row.open),
        })),
        taskFunnel: taskStages,
        evaluationSummary: evaluationSummary.rows.map((r) => ({
          evaluatorType: r.evaluator_type === "teacher" ? "coordinator" : r.evaluator_type,
          category: r.category,
          count: Number(r.count),
          averageRating: Number(r.average_rating),
        })),
      });
    } catch (error) {
      console.error("COORDINATOR ANALYTICS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load analytics.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TASK ASSIGNMENT (Supervisor assigns a task to their intern)
|--------------------------------------------------------------------------
*/

app.post("/api/tasks", requireRole("supervisor"), upload.single("attachment"), async (req, res) => {
  let attachmentFileName: string | undefined;
  let taskSaved = false;
  try {
    const auth = (req as AuthedRequest).auth;
    if (!auth || auth.role !== "supervisor") {
      return res.status(401).json({ message: "Supervisor login is required." });
    }
    const {
      student_id,
      title,
      description,
      priority,
      due_date,
    } = req.body;

    if (!student_id || !title || !due_date) {
      return res.status(400).json({
        message: "student_id, title, and due_date are required.",
      });
    }

    // Dates are compared as text in Philippine time, the zone deadlines use.
    const todayInManila = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());
    if (
      typeof due_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
      Number.isNaN(Date.parse(due_date))
    ) {
      return res.status(400).json({
        message: "Due date must be a valid date (YYYY-MM-DD).",
      });
    }
    if (due_date < todayInManila) {
      return res.status(400).json({
        message: "The due date cannot be in the past.",
      });
    }

    const intern = await pool.query(
      `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2 AND is_active = TRUE`,
      [student_id, auth.id]
    );
    if (intern.rows.length === 0) {
      return res.status(403).json({
        message: "Tasks can only be assigned to your active interns.",
      });
    }
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "A task title is required." });
    }

    const supervisor = await pool.query(
      `SELECT name FROM supervisors WHERE supervisor_id = $1`,
      [auth.id]
    );
    if (req.file) {
      attachmentFileName = await savePrivateFile(req.file);
    }
    const result = await pool.query(
      `
      INSERT INTO tasks
        (student_id, title, description, assigned_by, assigned_by_id, priority, status, due_date, created_at,
         attachment_file, attachment_name)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7, NOW(), $8, $9)
      RETURNING *
      `,
      [
        student_id,
        title.trim(),
        description || null,
        supervisor.rows[0].name,
        auth.id,
        priority || "Medium",
        due_date,
        attachmentFileName ? `/uploads/${attachmentFileName}` : null,
        req.file ? req.file.originalname.slice(0, 200) : null,
      ]
    );
    taskSaved = true;

    await createNotification({
      studentId: String(student_id),
      title: "New task assigned",
      message: `"${title.trim()}" was assigned to you, due ${due_date}.`,
      type: "info",
    });

    return res.status(201).json({
      message: "Task assigned.",
      task: result.rows[0],
    });
  } catch (error) {
    if (attachmentFileName && !taskSaved) {
      await deletePrivateFile(attachmentFileName).catch((cleanupError) => {
        console.error("FAILED TO REMOVE UNRECORDED TASK ATTACHMENT:", cleanupError);
      });
    }
    console.error("ASSIGN TASK ERROR:", error);
    return res.status(500).json({
      message: "Failed to assign task.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET TASKS FOR A SUPERVISOR'S INTERNS (assign + review queue)
|--------------------------------------------------------------------------
*/

app.get(
  "/api/tasks/supervisor/:supervisorId",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const { supervisorId } = req.params;
      if (!auth || auth.id !== supervisorId) {
        return res.status(403).json({ message: "You can only view your own task queue." });
      }

      const result = await pool.query(
        `
        SELECT
          t.*, s.name AS student_name
        FROM tasks t
        INNER JOIN students s
          ON TRIM(s.student_id::text) = TRIM(t.student_id::text)
        WHERE TRIM(s.supervisor_id::text) = TRIM($1::text)
          AND s.is_active = TRUE
        ORDER BY
          CASE t.status WHEN 'Submitted' THEN 0 ELSE 1 END,
          t.due_date ASC
        `,
        [supervisorId]
      );

      return res.json({ tasks: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR TASKS ERROR:", error);
      return res.status(500).json({
        message: "Failed to get tasks.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUBMIT A COMPLETED TASK (Student)
|--------------------------------------------------------------------------
*/

app.post(
  "/api/tasks/:id/submit",
  requireRole("student"),
  upload.single("attachment"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    let taskSaved = false;
    try {
      const auth = (req as AuthedRequest).auth;
      if (!auth || auth.role !== "student") {
        return res.status(401).json({ message: "Student login is required." });
      }
      const { id } = req.params;
      const { submission_notes } = req.body;

      let fileUrl: string | null = null;

      if (req.file) {
        uploadedFileName = await savePrivateFile(req.file);
        fileUrl = `/uploads/${uploadedFileName}`;
      }

      const result = await pool.query(
        `
        UPDATE tasks SET
          status = 'Submitted',
          submission_notes = $1,
          submission_file = COALESCE($2, submission_file),
          submitted_at = NOW()
        WHERE id = $3
          AND student_id = $4
          AND status IN ('Pending', 'In Progress')
        RETURNING *
        `,
        [submission_notes || null, fileUrl, id, auth.id]
      );

      if (result.rows.length === 0) {
        if (uploadedFileName) {
          await deletePrivateFile(uploadedFileName).catch((error) => {
            console.error("FAILED TO REMOVE UNOWNED TASK ATTACHMENT:", error);
          });
        }
        return res.status(404).json({ message: "Task not found." });
      }

      const task = result.rows[0];
      taskSaved = true;

      // The intern may have been reassigned since the task was given.
      const reviewer = await pool.query<{ supervisor_id: string | null }>(
        `SELECT supervisor_id FROM students WHERE student_id = $1`,
        [auth.id]
      );
      const reviewerId = reviewer.rows[0]?.supervisor_id || task.assigned_by_id;
      if (reviewerId) {
        await createNotification({
          supervisorId: String(reviewerId),
          title: "Task submitted",
          message: `A student submitted "${task.title}" for your review.`,
          type: "info",
        });
      }

      return res.json({
        message: "Task submitted for review.",
        task,
      });
    } catch (error) {
      if (uploadedFileName && !taskSaved) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
          console.error("FAILED TO REMOVE UNRECORDED TASK ATTACHMENT:", cleanupError);
        });
      }
      console.error("SUBMIT TASK ERROR:", error);
      return res.status(500).json({
        message: "Failed to submit task.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| REVIEW A SUBMITTED TASK (Supervisor)
|--------------------------------------------------------------------------
*/

app.patch(
  "/api/tasks/:id/review",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      if (!auth || auth.role !== "supervisor") {
        return res.status(401).json({ message: "Supervisor login is required." });
      }
      const { id } = req.params;
      const { status, review_notes, review_rating } = req.body;

      if (!["Reviewed", "In Progress"].includes(status)) {
        return res.status(400).json({
          message:
            "Status must be 'Reviewed' (approve) or 'In Progress' (send back for revision).",
        });
      }
      if (
        review_rating !== undefined &&
        review_rating !== null &&
        (!Number.isInteger(Number(review_rating)) ||
          Number(review_rating) < 1 ||
          Number(review_rating) > 5)
      ) {
        return res.status(400).json({
          message: "Review rating must be between 1 and 5.",
        });
      }

      const result = await pool.query(
        `
        UPDATE tasks t SET
          status = $1,
          review_notes = $2,
          review_rating = $3,
          reviewed_at = NOW()
        FROM students s
        WHERE t.id = $4
          AND s.student_id = t.student_id
          AND s.supervisor_id = $5
          AND t.status = 'Submitted'
        RETURNING t.*
        `,
        [status, review_notes || null, review_rating ?? null, id, auth.id]
      );

      if (result.rows.length === 0) {
        const current = await pool.query(
          `SELECT 1 FROM tasks t JOIN students s ON s.student_id = t.student_id
           WHERE t.id = $1 AND s.supervisor_id = $2`,
          [id, auth.id]
        );
        if (current.rows.length > 0) {
          return res.status(409).json({
            message: "This task is no longer waiting for review. It was already reviewed, or the intern's submission changed.",
          });
        }
        return res.status(404).json({ message: "Submitted task not found for your assigned interns." });
      }

      const task = result.rows[0];

      await createNotification({
        studentId: task.student_id,
        title:
          status === "Reviewed" ? "Task reviewed" : "Revisions requested",
        message:
          status === "Reviewed"
            ? `"${task.title}" has been reviewed and marked complete.`
            : `"${task.title}" needs revisions before it can be approved.${
                review_notes ? ` Note: ${review_notes}` : ""
              }`,
        type: status === "Reviewed" ? "success" : "warning",
      });

      return res.json({
        message: "Task review saved.",
        task,
      });
    } catch (error) {
      console.error("REVIEW TASK ERROR:", error);
      return res.status(500).json({
        message: "Failed to review task.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| EVALUATION & FEEDBACK
|--------------------------------------------------------------------------
*/

app.post(
  "/api/evaluations",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { student_id, category, rating, comments } = req.body;

    if (!auth || !student_id || !rating) {
      return res.status(400).json({
        message:
          "student_id and rating are required.",
      });
    }

    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5.",
      });
    }

    const evaluatorType =
      auth.role === "coordinator" ? "teacher" : auth.role;
    if (auth.role === "student" && auth.id !== String(student_id)) {
      return res.status(403).json({
        message: "Students can only submit feedback about their own placement.",
      });
    }
    if (auth.role === "supervisor") {
      const assignedStudent = await pool.query(
        `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2 AND is_active = TRUE`,
        [student_id, auth.id]
      );
      if (assignedStudent.rows.length === 0) {
        return res.status(403).json({
          message: "You can only evaluate your assigned interns.",
        });
      }
    }

    const targetStudent = await pool.query(
      `SELECT 1 FROM students WHERE student_id = $1 AND is_active = TRUE`,
      [student_id]
    );
    if (targetStudent.rows.length === 0) {
      return res.status(404).json({ message: "Student not found." });
    }
    // A student's rating of their placement feeds the company averages and
    // alerts every coordinator, so one a day is enough: a double tap or a
    // run of repeats must not flood either.
    if (auth.role === "student") {
      const sentToday = await pool.query(
        `
        SELECT 1 FROM evaluations
        WHERE evaluator_type = 'student' AND evaluator_id = $1 AND eval_date = CURRENT_DATE
        LIMIT 1
        `,
        [auth.id]
      );
      if (sentToday.rows.length > 0) {
        return res.status(409).json({
          message: "You already sent feedback today. You can send more tomorrow.",
        });
      }
    }
    const { table: evaluatorTable, idColumn: evaluatorIdColumn } =
      accountTables[auth.role];
    const evaluator = await pool.query<{ name: string }>(
      `SELECT name FROM ${evaluatorTable} WHERE ${evaluatorIdColumn} = $1`,
      [auth.id]
    );
    const result = await pool.query(
      `
      INSERT INTO evaluations
        (student_id, evaluator_type, evaluator_id, evaluator_name, category, rating, comments)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        student_id,
        evaluatorType,
        auth.id,
        evaluator.rows[0]?.name || null,
        category || "Overall Performance",
        rating,
        comments || null,
      ]
    );

    if (evaluatorType !== "student") {
      await createNotification({
        studentId: String(student_id),
        title: "New evaluation received",
        message: `You received a new ${category || "performance"} evaluation.`,
        type: "evaluation",
      });
    } else {
      await notifyCoordinators({
        title: "New company feedback",
        message: `${evaluator.rows[0]?.name || "A student"} rated their training experience ${rating} out of 5.`,
        type: "evaluation",
      });
    }

    return res.status(201).json({
      message: "Evaluation submitted.",
      evaluation: result.rows[0],
    });
  } catch (error) {
    console.error("SUBMIT EVALUATION ERROR:", error);
    return res.status(500).json({
      message: "Failed to submit evaluation.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.get(
  "/api/coordinator/evaluations",
  requireCoordinator,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT e.*, s.name AS student_name, s.company,
               (e.evaluator_type = 'teacher' AND e.evaluator_id = $1) AS mine
        FROM evaluations e
        LEFT JOIN students s ON s.student_id::text = e.student_id::text
        ORDER BY e.created_at DESC
        LIMIT 200
        `,
        [(req as AuthedRequest).auth?.id || ""]
      );

      return res.json({ evaluations: result.rows });
    } catch (error) {
      console.error("COORDINATOR EVALUATIONS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load evaluations.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/evaluations/student/:studentId",
  requireRole(["student", "supervisor"]),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { studentId } = req.params;
    if (!auth) {
      return res.status(401).json({ message: "Login is required." });
    }
    if (auth.role === "student" && auth.id !== studentId) {
      return res.status(403).json({ message: "You can only view your own evaluations." });
    }
    if (auth.role === "supervisor") {
      const assignedStudent = await pool.query(
        `SELECT 1 FROM students WHERE student_id = $1 AND supervisor_id = $2`,
        [studentId, auth.id]
      );
      if (assignedStudent.rows.length === 0) {
        return res.status(403).json({ message: "You can only view your assigned interns." });
      }
    }
    // A student's own feedback about their placement is written for the
    // coordinator, so it is not shown to the supervisor it may be about.
    const result = await pool.query(
      `
      SELECT *, (evaluator_type = $2 AND evaluator_id = $3) AS mine
      FROM evaluations
      WHERE student_id = $1
        AND ($2 = 'student' OR evaluator_type <> 'student')
      ORDER BY created_at DESC
      `,
      [studentId, auth.role, auth.id]
    );

    return res.json({ evaluations: result.rows });
  } catch (error) {
    console.error("GET EVALUATIONS ERROR:", error);
    return res.status(500).json({
      message: "Failed to get evaluations.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

/*
|--------------------------------------------------------------------------
| ROLE-BASED NOTIFICATIONS — SUPERVISOR & COORDINATOR
|--------------------------------------------------------------------------
*/

app.get(
  "/api/notifications/supervisor/:supervisorId",
  requireRole("supervisor"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const { supervisorId } = req.params;
      if (!auth || auth.id !== supervisorId) {
        return res.status(403).json({
          message: "You can only view your own notifications.",
        });
      }

      const result = await pool.query(
        `
        SELECT id, supervisor_id, title, message, type, is_read, created_at
        FROM notifications
        WHERE supervisor_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        `,
        [supervisorId]
      );

      return res.json({ notifications: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR NOTIFICATIONS ERROR:", error);
      return res.status(500).json({
        message: "Failed to get notifications.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/notifications/coordinator/:coordinatorId",
  requireRole("coordinator"),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const { coordinatorId } = req.params;
      if (!auth || auth.id !== coordinatorId) {
        return res.status(403).json({
          message: "You can only view your own notifications.",
        });
      }

      const result = await pool.query(
        `
        SELECT id, coordinator_id, title, message, type, is_read, created_at
        FROM notifications
        WHERE coordinator_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        `,
        [coordinatorId]
      );

      return res.json({ notifications: result.rows });
    } catch (error) {
      console.error("GET COORDINATOR NOTIFICATIONS ERROR:", error);
      return res.status(500).json({
        message: "Failed to get notifications.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| PROFILE MANAGEMENT (Feature 11) — self-service, any logged-in user
|--------------------------------------------------------------------------
|
| This was completely missing — every "Profile" button across the app
| pointed at a route that didn't exist. Students and supervisors can now
| view and update their own name/email, and change their password.
|
*/

app.get(
  "/api/students/:studentId/profile",
  requireRole("student"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { studentId } = req.params;
    if (!auth || auth.id !== studentId) {
      return res.status(403).json({ message: "You can only view your own profile." });
    }

    const result = await pool.query(
      `
      SELECT student_id, email, name, program, company, supervisor_id,
        required_hours, is_active
      FROM students
      WHERE student_id = $1
      `,
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Student not found." });
    }

    return res.json({ student: result.rows[0] });
  } catch (error) {
    console.error("GET STUDENT PROFILE ERROR:", error);
    return res.status(500).json({
      message: "Failed to load profile.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.put(
  "/api/students/:studentId/profile",
  requireRole("student"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { studentId } = req.params;

    if (!auth || auth.id !== studentId) {
      return res.status(403).json({ message: "You can only update your own profile." });
    }
    // A request with no body leaves req.body undefined.
    const { name, email } = req.body ?? {};
    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required.",
      });
    }

    const result = await pool.query(
      `
      UPDATE students SET name = $1, email = $2
      WHERE student_id = $3
      RETURNING student_id, email, name, program, company, supervisor_id, required_hours
      `,
      [name, email, studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Student not found." });
    }

    return res.json({
      message: "Profile updated.",
      student: result.rows[0],
    });
  } catch (error: any) {
    console.error("UPDATE STUDENT PROFILE ERROR:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        message: "That email is already in use.",
      });
    }

    return res.status(500).json({
      message: "Failed to update profile.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.put(
  "/api/students/:studentId/password",
  requireRole("student"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const accountId = String(req.params.studentId);

    if (!auth || auth.id !== accountId) {
      return res.status(403).json({
        message: "You can only change your own password.",
      });
    }

    try {
      const outcome = await changeOwnPassword(
        "student",
        accountId,
        req.body?.current_password,
        req.body?.new_password
      );
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      console.error("UPDATE STUDENT PASSWORD ERROR:", error);
      return res.status(500).json({
        message: "Failed to update password.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/supervisors/:supervisorId/profile",
  requireRole("supervisor"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { supervisorId } = req.params;
    if (!auth || auth.id !== supervisorId) {
      return res.status(403).json({ message: "You can only view your own profile." });
    }

    const result = await pool.query(
      `
      SELECT supervisor_id, email, name, company, department, is_active
      FROM supervisors
      WHERE supervisor_id = $1
      `,
      [supervisorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Supervisor not found." });
    }

    return res.json({ supervisor: result.rows[0] });
  } catch (error) {
    console.error("GET SUPERVISOR PROFILE ERROR:", error);
    return res.status(500).json({
      message: "Failed to load profile.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.put(
  "/api/supervisors/:supervisorId/profile",
  requireRole("supervisor"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { supervisorId } = req.params;
    const { name, email, department } = req.body;

    if (!auth || auth.id !== supervisorId) {
      return res.status(403).json({ message: "You can only update your own profile." });
    }
    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required.",
      });
    }

    const result = await pool.query(
      `
      UPDATE supervisors SET name = $1, email = $2, department = COALESCE($3, department)
      WHERE supervisor_id = $4
      RETURNING supervisor_id, email, name, company, department
      `,
      [name, email, department || null, supervisorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Supervisor not found." });
    }

    return res.json({
      message: "Profile updated.",
      supervisor: result.rows[0],
    });
  } catch (error: any) {
    console.error("UPDATE SUPERVISOR PROFILE ERROR:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        message: "That email is already in use.",
      });
    }

    return res.status(500).json({
      message: "Failed to update profile.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.put(
  "/api/supervisors/:supervisorId/password",
  requireRole("supervisor"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const accountId = String(req.params.supervisorId);

    if (!auth || auth.id !== accountId) {
      return res.status(403).json({
        message: "You can only change your own password.",
      });
    }

    try {
      const outcome = await changeOwnPassword(
        "supervisor",
        accountId,
        req.body?.current_password,
        req.body?.new_password
      );
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      console.error("UPDATE SUPERVISOR PASSWORD ERROR:", error);
      return res.status(500).json({
        message: "Failed to update password.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/coordinators/:coordinatorId/profile",
  requireRole("coordinator"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const { coordinatorId } = req.params;

    if (!auth || auth.id !== coordinatorId) {
      return res.status(403).json({
        message: "You can only view your own profile.",
      });
    }

    try {
      const result = await pool.query(
        `
        SELECT coordinator_id, email, name, department, is_active
        FROM coordinators
        WHERE coordinator_id = $1
        `,
        [coordinatorId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Coordinator not found." });
      }

      return res.json({ coordinator: result.rows[0] });
    } catch (error) {
      console.error("GET COORDINATOR PROFILE ERROR:", error);
      return res.status(500).json({
        message: "Failed to load profile.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.put(
  "/api/coordinators/:coordinatorId/profile",
  requireRole("coordinator"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const { coordinatorId } = req.params;
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const department =
      typeof req.body?.department === "string"
        ? req.body.department.trim()
        : null;

    if (!auth || auth.id !== coordinatorId) {
      return res.status(403).json({
        message: "You can only update your own profile.",
      });
    }

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "A valid name and email are required.",
      });
    }

    try {
      const result = await pool.query(
        `
        UPDATE coordinators
        SET name = $1, email = $2, department = $3
        WHERE coordinator_id = $4
        RETURNING coordinator_id, email, name, department, is_active
        `,
        [name, email, department || null, coordinatorId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Coordinator not found." });
      }

      return res.json({
        message: "Profile updated.",
        coordinator: result.rows[0],
      });
    } catch (error) {
      console.error("UPDATE COORDINATOR PROFILE ERROR:", error);
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return res.status(409).json({ message: "That email is already in use." });
      }

      return res.status(500).json({
        message: "Failed to update profile.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.put(
  "/api/coordinators/:coordinatorId/password",
  requireRole("coordinator"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const accountId = String(req.params.coordinatorId);

    if (!auth || auth.id !== accountId) {
      return res.status(403).json({
        message: "You can only change your own password.",
      });
    }

    try {
      const outcome = await changeOwnPassword(
        "coordinator",
        accountId,
        req.body?.current_password,
        req.body?.new_password
      );
      return res.status(outcome.status).json(outcome.body);
    } catch (error) {
      console.error("UPDATE COORDINATOR PASSWORD ERROR:", error);
      return res.status(500).json({
        message: "Failed to update password.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUPERVISOR'S OWN INTERNS (list + quick stats)
|--------------------------------------------------------------------------
|
| The supervisor dashboard already linked to "/supervisor/interns" but the
| page — and this endpoint — never existed.
|
*/

app.get(
  "/api/supervisor/:supervisorId/interns",
  requireRole("supervisor"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { supervisorId } = req.params;
    if (!auth || auth.id !== supervisorId) {
      return res.status(403).json({ message: "You can only view your own interns." });
    }

    const result = await pool.query(
      `
      SELECT
        s.student_id, s.name, s.email, s.program, s.company, s.required_hours,
        (
          SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
          WHERE TRIM(a.student_id::text) = TRIM(s.student_id::text)
            AND a.status = 'Verified'
        ) AS hours_rendered,
        (
          SELECT COUNT(*) FROM tasks t
          WHERE TRIM(t.student_id::text) = TRIM(s.student_id::text)
            AND t.status IN ('Pending', 'In Progress')
        ) AS active_tasks,
        (
          SELECT COUNT(*) FROM tasks t
          WHERE TRIM(t.student_id::text) = TRIM(s.student_id::text)
            AND t.status = 'Submitted'
        ) AS tasks_awaiting_review
      FROM students s
      WHERE TRIM(s.supervisor_id::text) = TRIM($1::text)
      AND s.is_active = TRUE
      ORDER BY s.name ASC
      `,
      [supervisorId]
    );

    const interns = result.rows.map((row) => ({
      ...row,
      hours_rendered: Number(row.hours_rendered),
      active_tasks: Number(row.active_tasks),
      tasks_awaiting_review: Number(row.tasks_awaiting_review),
      completion: row.required_hours
        ? Math.min(
            100,
            Math.round(
              (Number(row.hours_rendered) / Number(row.required_hours)) * 100
            )
          )
        : 0,
    }));

    return res.json({ interns });
  } catch (error) {
    console.error("GET SUPERVISOR INTERNS ERROR:", error);
    return res.status(500).json({
      message: "Failed to load interns.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

/*
|--------------------------------------------------------------------------
| SUPERVISOR COMPLAINT FILING & TRACKING
|--------------------------------------------------------------------------
|
| The original /api/complaints (student-facing) always wrote student_id as
| the filer, so a supervisor had no way to file one themselves even though
| the design doc lists Supervisor as one of the actors for this feature.
| filed_by_supervisor_id is nullable so the original student flow is
| untouched.
|
*/

app.post(
  "/api/complaints/supervisor",
  requireRole("supervisor"),
  upload.single("evidence"),
  async (req, res) => {
  let uploadedFileName: string | undefined;
  let complaintSaved = false;
  try {
    const auth = (req as AuthedRequest).auth;
    const {
      reported_student_name,
      category,
      description,
    } = req.body;

    if (!auth || auth.role !== "supervisor") {
      return res.status(401).json({ message: "Supervisor login is required." });
    }
    if (!category || !description) {
      return res.status(400).json({
        message: "category and description are required.",
      });
    }

    // When the report names one of the supervisor's interns, keep the link
    // to that student so the coordinator knows exactly who it is about.
    let reportedStudentId: string | null = null;
    let reportedStudentName: string | null = reported_student_name || null;
    const requestedStudentId =
      typeof req.body?.reported_student_id === "string" ? req.body.reported_student_id.trim() : "";
    if (requestedStudentId) {
      const intern = await pool.query<{ student_id: string; name: string }>(
        `SELECT student_id, name FROM students WHERE student_id = $1 AND supervisor_id = $2`,
        [requestedStudentId, auth.id]
      );
      if (intern.rows.length === 0) {
        return res.status(403).json({
          message: "You can only report an incident about one of your own interns.",
        });
      }
      reportedStudentId = intern.rows[0].student_id;
      reportedStudentName = intern.rows[0].name;
    }

    // "File Complaint" includes "Attach Evidence/File" for every actor.
    let evidenceUrl: string | null = null;
    if (req.file) {
      uploadedFileName = await savePrivateFile(req.file);
      evidenceUrl = `/uploads/${uploadedFileName}`;
    }

    const result = await pool.query(
      `
      INSERT INTO complaints
        (filed_by_supervisor_id, report_type, reported_student_name, category, description, evidence_url, status,
         reported_student_id)
      VALUES ($1, 'student', $2, $3, $4, $5, 'Pending', $6)
      RETURNING *
      `,
      [
        auth.id,
        reportedStudentName,
        String(category).trim(),
        String(description).trim(),
        evidenceUrl,
        reportedStudentId,
      ]
    );
    complaintSaved = true;
    const coordinators = await pool.query(
      `SELECT coordinator_id FROM coordinators WHERE is_active = TRUE`
    );
    await Promise.all(
      coordinators.rows.map((coordinator) =>
        createNotification({
          coordinatorId: String(coordinator.coordinator_id),
          title: "New complaint filed",
          message: `A supervisor filed a ${String(category).trim()} complaint for coordinator review.`,
          type: "warning",
        })
      )
    );

    return res.status(201).json({
      message: "Complaint filed.",
      complaint: result.rows[0],
    });
  } catch (error) {
    if (uploadedFileName && !complaintSaved) {
      await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
        console.error("FAILED TO REMOVE UNSAVED COMPLAINT EVIDENCE:", cleanupError);
      });
    }
    console.error("FILE SUPERVISOR COMPLAINT ERROR:", error);
    return res.status(500).json({
      message: "Failed to file complaint.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

app.get(
  "/api/complaints/supervisor/:supervisorId",
  requireRole("supervisor"),
  async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { supervisorId } = req.params;
    if (!auth || auth.id !== supervisorId) {
      return res.status(403).json({
        message: "You can only view your own complaints.",
      });
    }

    const result = await pool.query(
      `
      SELECT * FROM complaints
      WHERE filed_by_supervisor_id = $1
      ORDER BY created_at DESC
      `,
      [supervisorId]
    );

    return res.json({ complaints: result.rows });
  } catch (error) {
    console.error("GET SUPERVISOR COMPLAINTS ERROR:", error);
    return res.status(500).json({
      message: "Failed to load complaints.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  }
);

/*
|--------------------------------------------------------------------------
| OJT REQUIREMENTS (coordinator use case "Set OJT Requirements")
|--------------------------------------------------------------------------
|
| Required documents are stored in ojt_requirements (migration 006) so the
| coordinator can add, rename, reorder, or retire them without a code change.
|
*/

async function getActiveRequirementNames(): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT name FROM ojt_requirements WHERE is_active = TRUE ORDER BY sort_order, name`
  );
  return result.rows.map((row) => row.name);
}

app.get(
  "/api/ojt-requirements",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const includeInactive =
        auth?.role === "coordinator" && req.query.all === "1";
      const result = await pool.query(
        `
        SELECT id, name, description, is_active, sort_order
        FROM ojt_requirements
        WHERE ($1::boolean OR is_active = TRUE)
        ORDER BY sort_order, name
        `,
        [includeInactive]
      );
      return res.json({ requirements: result.rows });
    } catch (error) {
      console.error("GET OJT REQUIREMENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load OJT requirements." });
    }
  }
);

function readRequirementInput(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const sortOrder = Number.isInteger(Number(body.sort_order))
    ? Number(body.sort_order)
    : 0;
  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
  return { name, description, sortOrder, isActive };
}

app.post(
  "/api/coordinator/requirements",
  requireCoordinator,
  async (req, res) => {
    const { name, description, sortOrder, isActive } = readRequirementInput(
      req.body || {}
    );
    if (!name || name.length > 100) {
      return res
        .status(400)
        .json({ message: "Requirement name is required (max 100 characters)." });
    }
    try {
      const result = await pool.query(
        `
        INSERT INTO ojt_requirements (name, description, sort_order, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, description, is_active, sort_order
        `,
        [name, description, sortOrder, isActive]
      );
      if (isActive) {
        try {
          const students = await pool.query<{ student_id: string }>(
            `SELECT student_id FROM students WHERE is_active = TRUE`
          );
          const supervisors = await pool.query<{ supervisor_id: string }>(
            `SELECT supervisor_id FROM supervisors WHERE is_active = TRUE`
          );
          await Promise.all([
            ...students.rows.map((row) =>
              createNotification({
                studentId: String(row.student_id),
                title: "New document required",
                message: `"${name}" was added to your OJT requirements. Upload it from your Documents page.`,
                type: "document",
              })
            ),
            ...supervisors.rows.map((row) =>
              createNotification({
                supervisorId: String(row.supervisor_id),
                title: "New document required",
                message: `"${name}" was added to the OJT requirements. Your interns will upload it for you to review.`,
                type: "document",
              })
            ),
          ]);
        } catch (notifyError) {
          console.error("NEW REQUIREMENT NOTIFICATION ERROR:", notifyError);
        }
      }

      return res.status(201).json({
        message: "Requirement added.",
        requirement: result.rows[0],
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "That requirement already exists." });
      }
      console.error("CREATE OJT REQUIREMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to add requirement." });
    }
  }
);

app.put(
  "/api/coordinator/requirements/:id",
  requireCoordinator,
  async (req, res) => {
    const { name, description, sortOrder, isActive } = readRequirementInput(
      req.body || {}
    );
    if (!name || name.length > 100) {
      return res
        .status(400)
        .json({ message: "Requirement name is required (max 100 characters)." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query<{ name: string; is_active: boolean }>(
        `SELECT name, is_active FROM ojt_requirements WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (previous.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Requirement not found." });
      }
      const result = await client.query(
        `
        UPDATE ojt_requirements
        SET name = $1, description = $2, sort_order = $3, is_active = $4,
            updated_at = NOW()
        WHERE id = $5
        RETURNING id, name, description, is_active, sort_order
        `,
        [name, description, sortOrder, isActive, req.params.id]
      );
      // Keep already-uploaded documents attached to a renamed requirement.
      if (previous.rows[0].name !== name) {
        await client.query(
          `UPDATE documents SET doc_type = $1 WHERE doc_type = $2`,
          [name, previous.rows[0].name]
        );
      }
      await client.query("COMMIT");

      // A renamed, retired or restored requirement changes what everyone
      // sees on their Documents pages, so say what happened.
      const old = previous.rows[0];
      const change =
        old.is_active && !isActive
          ? {
              title: "Document requirement removed",
              message: `"${old.name}" is no longer an OJT requirement.`,
            }
          : !old.is_active && isActive
            ? {
                title: "New document required",
                message: `"${name}" is an OJT requirement again.`,
              }
            : old.name !== name && isActive
              ? {
                  title: "Document requirement renamed",
                  message: `The requirement "${old.name}" is now called "${name}". Files already uploaded were kept.`,
                }
              : null;
      if (change) {
        await notifyEveryone({ ...change, type: "document" }).catch((error) =>
          console.error("REQUIREMENT CHANGE NOTIFICATION ERROR:", error)
        );
      }

      return res.json({
        message: "Requirement updated.",
        requirement: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "That requirement already exists." });
      }
      console.error("UPDATE OJT REQUIREMENT ERROR:", error);
      return res.status(500).json({ message: "Failed to update requirement." });
    } finally {
      client.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| OJT SCHEDULE MANAGEMENT (coordinator)
|--------------------------------------------------------------------------
|
| Students could only view a schedule; nothing in the app could create one.
| The coordinator now sets each student's weekly OJT schedule.
|
*/

const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

app.get(
  "/api/coordinator/students/:studentId/schedule",
  requireCoordinator,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT id, student_id, day,
               TO_CHAR(start_time, 'HH24:MI') AS start_time,
               TO_CHAR(end_time, 'HH24:MI') AS end_time,
               focus, hours, is_active
        FROM ojt_schedule
        WHERE student_id = $1 AND is_active = TRUE
        ORDER BY array_position($2::text[], day::text), start_time
        `,
        [req.params.studentId, SCHEDULE_DAYS]
      );
      return res.json({ schedule: result.rows });
    } catch (error) {
      console.error("COORDINATOR GET SCHEDULE ERROR:", error);
      return res.status(500).json({ message: "Failed to load schedule." });
    }
  }
);

app.put(
  "/api/coordinator/students/:studentId/schedule",
  requireCoordinator,
  async (req, res) => {
    const { studentId } = req.params;
    const entries: unknown[] = Array.isArray(req.body?.schedule)
      ? req.body.schedule
      : [];
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const clean: {
      day: string;
      start: string;
      end: string;
      focus: string | null;
      hours: number;
    }[] = [];

    for (const raw of entries) {
      const entry = (raw || {}) as Record<string, unknown>;
      const day = String(entry.day || "");
      const start = String(entry.start_time || "").slice(0, 5);
      const end = String(entry.end_time || "").slice(0, 5);
      if (!SCHEDULE_DAYS.includes(day)) {
        return res.status(400).json({ message: `Invalid day: ${day || "(blank)"}.` });
      }
      if (!timePattern.test(start) || !timePattern.test(end)) {
        return res
          .status(400)
          .json({ message: `Enter start and end times (HH:MM) for ${day}.` });
      }
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);
      if (minutes <= 0) {
        return res
          .status(400)
          .json({ message: `End time must be after start time on ${day}.` });
      }
      if (clean.some((item) => item.day === day)) {
        return res.status(400).json({ message: `${day} is listed more than once.` });
      }
      clean.push({
        day,
        start,
        end,
        focus:
          typeof entry.focus === "string" && entry.focus.trim()
            ? entry.focus.trim().slice(0, 200)
            : null,
        hours: Math.round((minutes / 60) * 100) / 100,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const student = await client.query(
        `SELECT 1 FROM students WHERE student_id = $1`,
        [studentId]
      );
      if (student.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Student not found." });
      }
      await client.query(
        `UPDATE ojt_schedule SET is_active = FALSE WHERE student_id = $1 AND is_active = TRUE`,
        [studentId]
      );
      for (const item of clean) {
        await client.query(
          `
          INSERT INTO ojt_schedule (student_id, day, start_time, end_time, focus, hours, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE)
          `,
          [studentId, item.day, item.start, item.end, item.focus, item.hours]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("COORDINATOR SAVE SCHEDULE ERROR:", error);
      return res.status(500).json({ message: "Failed to save schedule." });
    } finally {
      client.release();
    }

    try {
      await createNotification({
        studentId: String(studentId),
        title: "OJT schedule updated",
        message: `Your coordinator updated your OJT schedule (${clean.length} day${clean.length === 1 ? "" : "s"} per week).`,
        type: "schedule",
      });
      const owner = await pool.query<{ name: string; supervisor_id: string | null }>(
        `SELECT name, supervisor_id FROM students WHERE student_id = $1`,
        [studentId]
      );
      if (owner.rows[0]?.supervisor_id) {
        await createNotification({
          supervisorId: String(owner.rows[0].supervisor_id),
          title: "Intern schedule updated",
          message: `The OJT coordinator updated ${owner.rows[0].name}'s weekly schedule (${clean.length} day${clean.length === 1 ? "" : "s"} per week).`,
          type: "schedule",
        });
      }
    } catch (error) {
      console.error("SCHEDULE NOTIFICATION ERROR:", error);
    }

    return res.json({
      message: "Schedule saved.",
      weeklyHours: clean.reduce((sum, item) => sum + item.hours, 0),
    });
  }
);

app.post(
  "/api/documents",
  requireRole("student"),
  documentUpload.single("file"),
  async (req, res) => {
    let uploadedFileName: string | undefined;
    let documentSaved = false;
    const auth = (req as AuthedRequest).auth;
    if (!auth || auth.role !== "student") {
      return res.status(401).json({ message: "Student login is required." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Select a document to upload." });
    }

    const docType = String(req.body.doc_type || "").trim();
    let activeRequirements: string[];
    try {
      activeRequirements = await getActiveRequirementNames();
    } catch (error) {
      console.error("LOAD OJT REQUIREMENTS ERROR:", error);
      return res.status(500).json({ message: "Failed to load OJT requirements." });
    }
    if (!activeRequirements.includes(docType)) {
      return res.status(400).json({ message: "Select a valid document type." });
    }

    try {
      const studentResult = await pool.query(
        `SELECT supervisor_id FROM students WHERE student_id = $1 AND is_active = TRUE`,
        [auth.id]
      );
      if (studentResult.rows.length === 0) {
        return res.status(403).json({ message: "Student account is unavailable." });
      }
      if (!studentResult.rows[0].supervisor_id) {
        return res.status(409).json({
          message: "No supervisor is assigned to this account yet.",
        });
      }

      uploadedFileName = await savePrivateFile(req.file);
      const result = await pool.query(
        `
        INSERT INTO documents
          (student_id, doc_type, original_filename, file_path, mime_type, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, student_id, doc_type, original_filename, mime_type,
                  size_bytes, status, review_notes, uploaded_at, reviewed_at
        `,
        [
          auth.id,
          docType,
          path.basename(req.file.originalname),
          uploadedFileName,
          req.file.mimetype,
          req.file.size,
        ]
      );
      documentSaved = true;

      await createNotification({
        supervisorId: studentResult.rows[0].supervisor_id,
        title: "Document submitted for review",
        message: `A student uploaded ${docType} (${path.basename(req.file.originalname)}) for review.`,
        type: "document",
      });

      return res.status(201).json({
        message: "Document uploaded and submitted for review.",
        document: result.rows[0],
      });
    } catch (error) {
      if (uploadedFileName && !documentSaved) {
        await deletePrivateFile(uploadedFileName).catch((cleanupError) => {
        console.error("FAILED TO REMOVE DOCUMENT AFTER UPLOAD ERROR:", cleanupError);
        });
      }
      console.error("UPLOAD STUDENT DOCUMENT ERROR:", error);
      return res.status(500).json({
        message: "Failed to upload document.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/documents/student",
  requireRole("student"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth || auth.role !== "student") {
      return res.status(401).json({ message: "Student login is required." });
    }

    try {
      const result = await pool.query(
        `
        SELECT id, student_id, doc_type, original_filename, mime_type,
               size_bytes, status, review_notes, uploaded_at, reviewed_at
        FROM documents
        WHERE student_id = $1
        ORDER BY uploaded_at DESC, id DESC
        `,
        [auth.id]
      );
      return res.json({ documents: result.rows });
    } catch (error) {
      console.error("GET STUDENT DOCUMENTS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load documents.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/documents/supervisor",
  requireRole("supervisor"),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth || auth.role !== "supervisor") {
      return res.status(401).json({ message: "Supervisor login is required." });
    }

    try {
      const result = await pool.query(
        `
        SELECT d.id, d.student_id, s.name AS student_name, d.doc_type,
               d.original_filename, d.mime_type, d.size_bytes, d.status,
               d.review_notes, d.uploaded_at, d.reviewed_at
        FROM documents d
        INNER JOIN students s ON s.student_id = d.student_id
        WHERE s.supervisor_id = $1
          AND s.is_active = TRUE
        ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END,
                 d.uploaded_at DESC, d.id DESC
        LIMIT 1000
        `,
        [auth.id]
      );
      return res.json({ documents: result.rows });
    } catch (error) {
      console.error("GET SUPERVISOR DOCUMENTS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load documents for review.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Coordinator oversight: every submitted document, plus how far each active
// student is through the active OJT requirements. Read-only; reviewing a
// document stays with the student's supervisor.
app.get(
  "/api/coordinator/documents",
  requireCoordinator,
  async (_req, res) => {
    try {
      const [documents, progress, requirements] = await Promise.all([
        pool.query(
          `
          SELECT d.id, d.student_id, s.name AS student_name, s.program,
                 s.company, sup.name AS supervisor_name, d.doc_type,
                 d.original_filename, d.mime_type, d.size_bytes, d.status,
                 d.review_notes, d.uploaded_at, d.reviewed_at
          FROM documents d
          LEFT JOIN students s ON s.student_id = d.student_id
          LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
          ORDER BY d.uploaded_at DESC, d.id DESC
          LIMIT 500
          `
        ),
        pool.query(
          `
          SELECT s.student_id, s.name, s.program, s.company,
                 sup.name AS supervisor_name,
                 COUNT(DISTINCT d.doc_type)
                   FILTER (WHERE d.status = 'Approved')::int AS approved,
                 COUNT(DISTINCT d.doc_type)
                   FILTER (WHERE d.status = 'Pending')::int AS pending,
                 COUNT(DISTINCT d.doc_type)
                   FILTER (WHERE d.status = 'Rejected')::int AS rejected,
                 COALESCE(
                   ARRAY_AGG(DISTINCT d.doc_type)
                     FILTER (WHERE d.status = 'Approved'),
                   '{}'
                 ) AS approved_types
          FROM students s
          LEFT JOIN supervisors sup ON sup.supervisor_id = s.supervisor_id
          LEFT JOIN documents d
            ON d.student_id = s.student_id
           AND d.doc_type IN (
             SELECT name FROM ojt_requirements WHERE is_active = TRUE
           )
          WHERE s.is_active = TRUE
          GROUP BY s.student_id, s.name, s.program, s.company, sup.name
          ORDER BY s.name
          `
        ),
        pool.query(
          `SELECT name FROM ojt_requirements
           WHERE is_active = TRUE ORDER BY sort_order, name`
        ),
      ]);

      const requirementNames: string[] = requirements.rows.map(
        (row) => row.name
      );
      return res.json({
        requirements: requirementNames,
        documents: documents.rows,
        students: progress.rows.map((row) => ({
          student_id: row.student_id,
          name: row.name,
          program: row.program,
          company: row.company,
          supervisor_name: row.supervisor_name,
          approved: row.approved,
          pending: row.pending,
          rejected: row.rejected,
          missing: requirementNames.filter(
            (name) => !row.approved_types.includes(name)
          ),
        })),
      });
    } catch (error) {
      console.error("GET COORDINATOR DOCUMENTS ERROR:", error);
      return res.status(500).json({
        message: "Failed to load submitted documents.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.patch(
  "/api/documents/:documentId/review",
  // The supervisor reviews their interns' documents. The coordinator may
  // review only for a student who has no active supervisor to do it.
  requireRole(["supervisor", "coordinator"]),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth || (auth.role !== "supervisor" && auth.role !== "coordinator")) {
      return res.status(401).json({ message: "Supervisor login is required." });
    }

    const documentId = Number(req.params.documentId);
    const status = req.body.status;
    const reviewNotes = String(req.body.review_notes || "").trim();
    if (
      !Number.isSafeInteger(documentId) ||
      documentId < 1 ||
      !["Approved", "Rejected"].includes(status)
    ) {
      return res.status(400).json({ message: "Invalid document review." });
    }
    if (status === "Rejected" && !reviewNotes) {
      return res.status(400).json({
        message: "A reason is required when rejecting a document.",
      });
    }

    try {
      const result = await pool.query(
        `
        UPDATE documents d
        SET status = $1,
            review_notes = $2,
            reviewed_by_supervisor_id = CASE WHEN $5::text = 'supervisor' THEN $3 ELSE NULL END,
            reviewed_at = NOW()
        FROM students s
        WHERE d.id = $4
          AND s.student_id = d.student_id
          AND d.status = 'Pending'
          AND (
            ($5::text = 'supervisor' AND s.supervisor_id = $3)
            OR (
              $5::text = 'coordinator'
              AND NOT EXISTS (
                SELECT 1 FROM supervisors sup
                WHERE sup.supervisor_id = s.supervisor_id AND sup.is_active = TRUE
              )
            )
          )
        RETURNING d.id, d.student_id, d.doc_type, d.status, d.review_notes,
                  d.reviewed_at
        `,
        [
          status,
          reviewNotes || null,
          auth.id,
          documentId,
          auth.role,
        ]
      );

      if (result.rows.length === 0) {
        const current = await pool.query<{ status: string }>(
          `SELECT d.status FROM documents d JOIN students s ON s.student_id = d.student_id
           WHERE d.id = $1 AND ($3::text = 'coordinator' OR s.supervisor_id = $2)`,
          [documentId, auth.id, auth.role]
        );
        if (current.rows.length > 0) {
          return res.status(409).json({
            message:
              current.rows[0].status !== "Pending"
                ? "This document is no longer waiting for review. It was already reviewed."
                : "This student has an active supervisor, who reviews their documents.",
          });
        }
        return res.status(404).json({
          message: "Pending document not found for your assigned interns.",
        });
      }

      const document = result.rows[0];
      await createNotification({
        studentId: document.student_id,
        title: `Document ${status.toLowerCase()}`,
        message: reviewNotes
          ? `${document.doc_type}: ${reviewNotes}`
          : `${document.doc_type} was approved.`,
        type: "document",
      });

      return res.json({ message: "Document review saved.", document });
    } catch (error) {
      console.error("REVIEW STUDENT DOCUMENT ERROR:", error);
      return res.status(500).json({
        message: "Failed to save document review.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/documents/:documentId/file",
  requireRole(["student", "supervisor", "coordinator"]),
  async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) {
      return res.status(401).json({ message: "Login is required." });
    }

    const documentId = Number(req.params.documentId);
    if (!Number.isSafeInteger(documentId) || documentId < 1) {
      return res.status(400).json({ message: "Invalid document ID." });
    }

    try {
      const result = await pool.query(
        `
        SELECT d.file_path, d.original_filename, d.mime_type
        FROM documents d
        LEFT JOIN students s ON s.student_id = d.student_id
        WHERE d.id = $1
          AND (
            ($2 = 'student' AND d.student_id = $3)
            OR ($2 = 'supervisor' AND s.supervisor_id = $3)
            OR $2 = 'coordinator'
          )
        `,
        [documentId, auth.role, auth.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Document not found." });
      }

      const fileName = path.basename(result.rows[0].file_path);
      const downloadName = String(result.rows[0].original_filename)
        .replace(/[\r\n"]/g, "_")
        .trim();
      const file = await readPrivateFile(fileName);
      return res
        .type(file.contentType || result.rows[0].mime_type)
        .attachment(downloadName)
        .send(file.buffer);
    } catch (error) {
      console.error("GET STUDENT DOCUMENT FILE ERROR:", error);
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
      return res.status(statusCode === 404 ? 404 : 500).json({
        message:
          statusCode === 404
            ? "Document file is unavailable."
            : "Failed to retrieve document.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

app.get(
  "/api/uploads/:filename",
  requireRole(["coordinator", "supervisor", "student"]),
  async (request, res) => {
    const req = request as AuthedRequest;
    const auth = req.auth;
    const filename = req.params.filename;

    if (
      !auth ||
      typeof filename !== "string" ||
      filename !== path.basename(filename) ||
      !/^(?:\d+-[a-f0-9]{12}|\d+-\d+|[a-f0-9-]{36})\.[a-z0-9]{1,10}$/i.test(filename) ||
      filename.includes("\0")
    ) {
      return res.status(400).json({ message: "Invalid uploaded file name." });
    }

    const storedPath = `/uploads/${filename}`;

    try {
      const result = await pool.query(
        `
        SELECT
          (
            EXISTS (
              SELECT 1
              FROM attendance a
              WHERE a.image_url = $2
                AND (
                  $1 = 'coordinator'
                  OR
                  ($1 = 'student' AND a.student_id = $3)
                  OR (
                    $1 = 'supervisor'
                    AND EXISTS (
                      SELECT 1
                      FROM students s
                      WHERE s.student_id = a.student_id
                        AND s.supervisor_id = $3
                    )
                  )
                )
            )
            OR EXISTS (
              SELECT 1
              FROM tasks t
              WHERE (t.submission_file = $2 OR t.attachment_file = $2)
                AND (
                  $1 = 'coordinator'
                  OR
                  ($1 = 'student' AND t.student_id = $3)
                  OR (
                    $1 = 'supervisor'
                    AND EXISTS (
                      SELECT 1 FROM students s
                      WHERE s.student_id = t.student_id AND s.supervisor_id = $3
                    )
                  )
                )
            )
            OR EXISTS (
              SELECT 1
              FROM complaints c
              WHERE c.evidence_url = $2
                AND (
                  $1 = 'coordinator'
                  OR
                  ($1 = 'student' AND c.student_id = $3)
                  OR ($1 = 'supervisor' AND c.filed_by_supervisor_id = $3)
                )
            )
          ) AS authorized
        `,
        [auth.role, storedPath, auth.id]
      );

      if (!result.rows[0]?.authorized) {
        return res.status(404).json({ message: "Uploaded file not found." });
      }

      const file = await readPrivateFile(filename);
      return res
        .type(file.contentType || "application/octet-stream")
        .attachment(filename)
        .send(file.buffer);
    } catch (error) {
      console.error("GET AUTHORIZED UPLOAD ERROR:", error);
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
      return res.status(statusCode === 404 ? 404 : 500).json({
        message:
          statusCode === 404
            ? "Uploaded file is unavailable."
            : "Failed to retrieve uploaded file.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UNKNOWN API ROUTE
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This MUST remain at the bottom of all /api routes.
|
*/

/*
|--------------------------------------------------------------------------
| EXTENSION ROUTES
|--------------------------------------------------------------------------
|
| Absences, task editing, bulk import, announcements, coordinator password
| resets and complaint replies live in routes/extensions.ts.
|
*/

registerExtensionRoutes(app, {
  pool,
  requireRole,
  requireCoordinator,
  createNotification,
  notifyCoordinators,
  hashPassword,
  passwordPolicyError,
  loginAttemptKey,
  closeNotificationStreams,
  upload,
  savePrivateFile,
  deletePrivateFile,
});

app.use(
  "/api",
  (
    req,
    res
  ) => {
    return res.status(404).json({
      message:
        `API route not found: ${req.method} ${req.originalUrl}`,
    });
  }
);

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      "SERVER ERROR:",
      error
    );

    if (
      error instanceof multer.MulterError
    ) {
      return res.status(400).json({
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "That file is too large. Choose a smaller file and try again."
            : "The file could not be uploaded. Please try again.",
        error:
          error.message,
      });
    }

    return res.status(400).json({
      message:
        error?.message ||
        "Something went wrong.",
    });
  }
);

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT || 5000;

if (!isAzureBlobStorageConfigured()) {
  console.warn(
    "Durable file storage is not configured; uploaded files currently use local disk."
  );
}

app.listen(
  PORT,
  // Express also calls this when the server could not start, with the error.
  (error?: Error) => {
    if (error) {
      const inUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
      console.error(
        inUse
          ? `Port ${PORT} is already in use, so this server did not start. Another copy of the backend is probably still running; stop it (or end its "node" process) and start again.`
          : `The backend could not start: ${error.message}`
      );
      process.exit(1);
    }

    console.log(
      `Backend running on port ${PORT}`
    );

    console.log(
      "Server timezone: Asia/Manila"
    );
    startPostgresNotificationListener(pool);
    startDeadlineReminderScheduler(pool, createNotification);
  }
);