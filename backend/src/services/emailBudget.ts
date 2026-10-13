import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| THE DAY'S EMAIL ALLOWANCE
|--------------------------------------------------------------------------
|
| A free email plan sends a fixed number of emails a day and refuses the
| rest. Left alone, a morning of task-deadline reminders could use the
| whole day's allowance, and a student asking for a password reset in the
| afternoon would get nothing.
|
| When EMAIL_DAILY_LIMIT is set, every email is counted before it goes
| out (migration 047). Emails are of two kinds:
|
|   account  someone is waiting for it: a password reset, a test email
|   routine  reminders and summaries, which also reach people in the app
|
| Routine email stops while a share of the allowance (a fifth, at least
| five) is still left; that share is kept for account email. With the
| variable unset, or not a whole number of at least 10, there is no limit
| and nothing is counted.
|
| The day is the day in UTC. That is an assumption about how a provider
| counts its day; if a provider counts differently the server may stop a
| little early or late, and the provider's own refusal is still handled.
|
*/

export type EmailKind = "account" | "routine";

/** Raised instead of sending when the day's allowance for that kind of email is used. */
export class EmailLimitError extends Error {
  constructor(kind: EmailKind) {
    super(
      kind === "account"
        ? "Today's email allowance has been used."
        : "Today's allowance for reminder and summary emails has been used."
    );
    this.name = "EmailLimitError";
  }
}

/** The day's allowance, or null when there is none. */
export function emailDailyLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.EMAIL_DAILY_LIMIT || "").trim();
  if (!/^[0-9]{2,6}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 10 ? value : null;
}

/** How many of the day's emails are kept back for account email. */
export function accountReserve(limit: number): number {
  return Math.max(5, Math.floor(limit / 5));
}

/** The most emails that may have been sent today before one of this kind is refused. */
export function allowanceFor(kind: EmailKind, limit: number): number {
  return kind === "account" ? limit : limit - accountReserve(limit);
}

/**
 * Counts one email of this kind against today, if there is room. True
 * when it may be sent. One statement, so two emails at once cannot both
 * take the last place.
 */
export async function claimEmail(
  pool: Pick<Pool, "query">,
  kind: EmailKind,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const limit = emailDailyLimit(env);
  if (limit === null) return true;
  const claimed = await pool.query(
    `INSERT INTO email_daily_counts AS c (day, sent)
     VALUES ((NOW() AT TIME ZONE 'UTC')::date, 1)
     ON CONFLICT (day) DO UPDATE SET sent = c.sent + 1 WHERE c.sent < $1
     RETURNING sent`,
    [allowanceFor(kind, limit)]
  );
  return claimed.rows.length > 0;
}

/** An email that was counted and then could not be sent is given back. */
export async function returnEmail(
  pool: Pick<Pool, "query">,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (emailDailyLimit(env) === null) return;
  await pool.query(
    `UPDATE email_daily_counts SET sent = GREATEST(sent - 1, 0)
     WHERE day = (NOW() AT TIME ZONE 'UTC')::date`
  );
}

/** How many emails have been counted today. Zero when nothing is counted. */
export async function emailsSentToday(pool: Pick<Pool, "query">): Promise<number> {
  const found = await pool.query<{ sent: number }>(
    `SELECT sent FROM email_daily_counts WHERE day = (NOW() AT TIME ZONE 'UTC')::date`
  );
  return found.rows[0]?.sent ?? 0;
}
