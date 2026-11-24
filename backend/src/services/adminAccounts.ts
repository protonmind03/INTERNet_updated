import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import type { AccountRole } from "./accountRoles";
import type { Email } from "./mailer";
import { BCRYPT_ROUNDS } from "./passwordHash";
import { STAFF_KINDS, StaffAccountError, createStaffAccount, temporaryPassword, type StaffKind } from "./staffAccounts";

/*
|--------------------------------------------------------------------------
| WHAT THE IT ADMINISTRATOR DOES TO ACCOUNTS (Phase 1.7)
|--------------------------------------------------------------------------
|
| Find any account by name, email or ID, and: lift a login lockout, send
| the owner a temporary password, end every session, deactivate or
| reactivate, and make OJT Director and administrator accounts.
|
| A temporary password goes to the owner's email and nowhere else: the
| administrator never sees it. That keeps the person who runs the system
| from signing in as anyone, which is the point of keeping the duties
| apart. Without email set up the action is refused.
|
| The administrator sees who an account is (kind, ID, name, email, active,
| locked) and nothing of what is in it.
|
*/

export const ACCOUNT_TABLES: Record<AccountRole, { table: string; idColumn: string; label: string }> = {
  student: { table: "students", idColumn: "student_id", label: "student" },
  supervisor: { table: "supervisors", idColumn: "supervisor_id", label: "supervisor" },
  coordinator: { table: "coordinators", idColumn: "coordinator_id", label: "coordinator" },
  director: { table: STAFF_KINDS.director.table, idColumn: STAFF_KINDS.director.idColumn, label: STAFF_KINDS.director.label },
  admin: { table: STAFF_KINDS.admin.table, idColumn: STAFF_KINDS.admin.idColumn, label: STAFF_KINDS.admin.label },
};

export const isAccountRole = (value: unknown): value is AccountRole =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_TABLES, value);

export type AccountRow = {
  role: AccountRole;
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  locked: boolean;
  must_change_password: boolean;
};

export type AccountDeps = {
  pool: Pool;
  /** sha256 of "role:identifier", as the sign-in counts failures (server.ts). */
  loginAttemptKey: (role: string, identifier: unknown) => string;
  /** Sends one email; the tests pass a mock. */
  send: (email: Email) => Promise<void>;
  emailConfigured: () => boolean;
  /** Ends the live notification streams of an account whose sessions end. */
  closeStreams: (account: { role: AccountRole; id: string }) => void;
  siteAddress: () => string | null;
};

/** A refusal the route answers as it is. */
export class AccountActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

const SEARCH_LIMIT = 25;

/** Accounts of every kind (or one) whose name, email or ID holds the words. */
export async function searchAccounts(
  deps: Pick<AccountDeps, "pool" | "loginAttemptKey">,
  words: string,
  role: AccountRole | null
): Promise<AccountRow[]> {
  const kinds = role ? [role] : (Object.keys(ACCOUNT_TABLES) as AccountRole[]);
  const text = words.trim().slice(0, 100);
  const parts = kinds.map((kind, at) => {
    const { table, idColumn } = ACCOUNT_TABLES[kind];
    return `SELECT '${kind}'::text AS role, ${at} AS rank, TRIM(${idColumn}::text) AS id, name, email,
                   COALESCE(is_active, TRUE) AS is_active, COALESCE(must_change_password, FALSE) AS must_change_password
            FROM ${table}
            WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%' OR TRIM(${idColumn}::text) ILIKE $1`;
  });
  const rows = (
    await deps.pool.query<Omit<AccountRow, "locked">>(
      `SELECT role, id, name, email, is_active, must_change_password FROM (${parts.join(" UNION ALL ")}) found
       ORDER BY rank, LOWER(name), id LIMIT ${SEARCH_LIMIT}`,
      [text]
    )
  ).rows;
  if (rows.length === 0) return [];
  const keys = rows.map((row) => [deps.loginAttemptKey(row.role, row.email), deps.loginAttemptKey(row.role, row.id)]);
  const locked = new Set(
    (
      await deps.pool.query<{ key_hash: string }>(
        `SELECT key_hash FROM login_attempts WHERE locked_until > NOW() AND key_hash = ANY($1::text[])`,
        [keys.flat()]
      )
    ).rows.map((row) => row.key_hash)
  );
  return rows.map((row, at) => ({ ...row, locked: keys[at].some((key) => locked.has(key)) }));
}

async function findAccount(pool: Pool, role: AccountRole, id: string) {
  const { table, idColumn } = ACCOUNT_TABLES[role];
  const found = await pool.query<{ id: string; name: string; email: string; is_active: boolean | null }>(
    `SELECT TRIM(${idColumn}::text) AS id, name, email, is_active FROM ${table} WHERE TRIM(${idColumn}::text) = TRIM($1)`,
    [id]
  );
  if (found.rows.length === 0) throw new AccountActionError(404, "Account not found.");
  return found.rows[0];
}

export type AccountAction = "unlock" | "end_sessions" | "deactivate" | "reactivate" | "temporary_password";
export const ACCOUNT_ACTIONS: readonly AccountAction[] = ["unlock", "end_sessions", "deactivate", "reactivate", "temporary_password"];

/** The lockout rows of an account, by its email and its ID (the sign-in counts either). */
const lockKeys = (deps: Pick<AccountDeps, "loginAttemptKey">, role: AccountRole, account: { id: string; email: string }) => [
  deps.loginAttemptKey(role, account.email),
  deps.loginAttemptKey(role, account.id),
];

/**
 * Does one action to one account. Returns what the page says after it.
 * The administrator's own account is changed on their Profile, never here.
 */
export async function actOnAccount(
  deps: AccountDeps,
  actor: { id: string },
  role: AccountRole,
  id: string,
  action: AccountAction
): Promise<{ message: string; account: { role: AccountRole; id: string; name: string } }> {
  const { pool } = deps;
  const account = await findAccount(pool, role, id);
  const { table, idColumn, label } = ACCOUNT_TABLES[role];
  const named = { role, id: account.id, name: account.name };
  if (role === "admin" && account.id === String(actor.id).trim() && action !== "unlock") {
    throw new AccountActionError(409, "Change your own account from your Profile.");
  }
  const where = `TRIM(${idColumn}::text) = TRIM($1)`;

  if (action === "unlock") {
    const removed = await pool.query(`DELETE FROM login_attempts WHERE key_hash = ANY($1::text[])`, [lockKeys(deps, role, account)]);
    return {
      message: removed.rowCount ? `${account.name} can sign in again.` : `${account.name} was not locked out.`,
      account: named,
    };
  }

  if (action === "end_sessions") {
    await pool.query(`UPDATE ${table} SET auth_version = auth_version + 1 WHERE ${where}`, [account.id]);
    deps.closeStreams({ role, id: account.id });
    return { message: `Every session of ${account.name} has ended. They will have to sign in again.`, account: named };
  }

  if (action === "deactivate" || action === "reactivate") {
    const active = action === "reactivate";
    if (!active && role === "coordinator") {
      // As PATCH /api/coordinator/coordinators/:id/status: never the last active coordinator.
      const others = await pool.query(
        `SELECT 1 FROM coordinators WHERE is_active = TRUE AND TRIM(coordinator_id::text) <> TRIM($1) LIMIT 1`,
        [account.id]
      );
      if (others.rows.length === 0) throw new AccountActionError(409, "This is the only active coordinator account. Have another made or reactivated first.");
    }
    if (!active && role === "admin") {
      const others = await pool.query(
        `SELECT 1 FROM system_admins WHERE is_active = TRUE AND TRIM(admin_id) <> TRIM($1) LIMIT 1`,
        [account.id]
      );
      if (others.rows.length === 0) throw new AccountActionError(409, "This is the last active administrator. Make another first.");
    }
    await pool.query(
      `UPDATE ${table} SET is_active = $2${active ? "" : ", auth_version = auth_version + 1"} WHERE ${where}`,
      [account.id, active]
    );
    if (!active) deps.closeStreams({ role, id: account.id });
    return {
      message: active ? `${account.name} can sign in again.` : `${account.name} can no longer sign in. Every session has ended.`,
      account: named,
    };
  }

  // temporary_password: emailed to the owner, never shown here.
  if (!deps.emailConfigured()) {
    throw new AccountActionError(503, "Email is not set up, so a temporary password cannot reach its owner.", "EMAIL_OFF");
  }
  if (account.is_active === false) throw new AccountActionError(409, `Reactivate ${account.name} first.`);
  const password = temporaryPassword();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE ${table} SET password = $2, must_change_password = TRUE, auth_version = auth_version + 1 WHERE ${where}`,
      [account.id, await bcrypt.hash(password, BCRYPT_ROUNDS)]
    );
    await client.query(`DELETE FROM login_attempts WHERE key_hash = ANY($1::text[])`, [lockKeys(deps, role, account)]);
    // Sent before the change is kept: if it cannot go, the old password still works.
    await deps.send(temporaryPasswordEmail(account, label, password, deps.siteAddress()));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  deps.closeStreams({ role, id: account.id });
  return { message: `A temporary password was emailed to ${account.name}. Every session of theirs has ended.`, account: named };
}

function temporaryPasswordEmail(account: { name: string; email: string }, label: string, password: string, site: string | null): Email {
  const where = site ? `Sign in at ${site} ` : "Sign in ";
  return {
    to: account.email,
    subject: "Your temporary INTERNet password",
    kind: "account",
    text: [
      `Hello ${account.name},`,
      "",
      `The system administrator set a temporary password for your INTERNet ${label} account:`,
      "",
      `    ${password}`,
      "",
      `${where}and choose your own password; the app asks you to at once.`,
      "If you did not ask for this, tell your OJT office.",
    ].join("\n"),
  };
}

/** Makes an OJT Director or administrator account; its temporary password goes to its owner by email. */
export async function createAccount(
  deps: AccountDeps,
  kind: StaffKind,
  email: string,
  name: string
): Promise<{ message: string; account: { role: StaffKind; id: string; name: string } }> {
  if (!deps.emailConfigured()) {
    throw new AccountActionError(503, "Email is not set up, so the new account's temporary password cannot reach its owner.", "EMAIL_OFF");
  }
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    let made;
    try {
      made = await createStaffAccount(client, kind, email, name);
    } catch (error) {
      if (error instanceof StaffAccountError) throw new AccountActionError(400, error.message);
      throw error;
    }
    await deps.send(temporaryPasswordEmail(made, STAFF_KINDS[kind].label, made.password, deps.siteAddress()));
    await client.query("COMMIT");
    return {
      message: `${made.name}'s ${STAFF_KINDS[kind].label} account is made. Their temporary password was emailed to them.`,
      account: { role: kind, id: made.id, name: made.name },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/*
| Telling the office (25 November 2026). A Director account can open
| students' records and health documents, and only an administrator makes
| one, so every new or reactivated Director or administrator account is
| told at once to every other active Director and administrator, in the
| app and by email when email is set up, naming who did it. Not the account
| itself, nor the administrator who acted. A failure to tell never undoes
| the change; it is in the audit log either way.
*/
export type OversightDeps = Pick<AccountDeps, "pool" | "send" | "emailConfigured" | "siteAddress"> & {
  notify: (recipient: { role: "director" | "admin"; id: string }, title: string, message: string) => Promise<unknown>;
};

export async function tellTheOffice(
  deps: OversightDeps,
  event: { what: "made" | "reactivated"; kind: StaffKind; account: { id: string; name: string }; actor: { id: string } }
): Promise<number> {
  const actor = await deps.pool.query<{ name: string }>(`SELECT name FROM system_admins WHERE admin_id = $1`, [event.actor.id]);
  const actorName = actor.rows[0]?.name ?? "An administrator";
  const label = STAFF_KINDS[event.kind].label;
  const title = event.what === "made" ? `New ${label} account` : `${label[0].toUpperCase()}${label.slice(1)} account reactivated`;
  const message = `${actorName} (administrator ${event.actor.id}) ${event.what === "made" ? "made" : "reactivated"} the ${label} account of ${event.account.name} (${event.account.id}). If you did not expect this, tell the OJT office.`;
  const everyone = await deps.pool.query<{ role: "director" | "admin"; id: string; email: string; name: string }>(
    `SELECT 'director' AS role, TRIM(director_id) AS id, email, name FROM directors WHERE is_active = TRUE
     UNION ALL
     SELECT 'admin' AS role, TRIM(admin_id) AS id, email, name FROM system_admins WHERE is_active = TRUE`
  );
  const told = everyone.rows.filter(
    (person) => !(person.role === event.kind && person.id === event.account.id) && !(person.role === "admin" && person.id === event.actor.id)
  );
  for (const person of told) {
    await deps.notify({ role: person.role, id: person.id }, title, message).catch((error) => console.error("OVERSIGHT NOTIFICATION ERROR:", error));
    if (deps.emailConfigured()) {
      await deps
        .send({ to: person.email, subject: `INTERNet: ${title.toLowerCase()}`, kind: "account", text: `Hello ${person.name},

${message}${deps.siteAddress() ? `

${deps.siteAddress()}` : ""}` })
        .catch((error) => console.error("OVERSIGHT EMAIL ERROR:", error));
    }
  }
  return told.length;
}
