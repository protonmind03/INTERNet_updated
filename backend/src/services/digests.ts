/*
|--------------------------------------------------------------------------
| SUMMARY EMAILS
|--------------------------------------------------------------------------
|
| The supervisor's daily summary: one email a morning saying how much is
| waiting for their decision. It is not sent when nothing is waiting, when
| the supervisor turned summary emails off (Profile > Notifications), or
| when the server has no email settings. `digest_log` holds one row per
| email sent, which is what keeps it to one a day.
|
| Everything that depends on the clock or on sending takes it as an
| argument, so the rules can be tested without waiting or emailing.
|
*/

import type { Pool } from "pg";
import { isEmailConfigured, sendEmail } from "./mailer";
import { EmailLimitError } from "./emailBudget";
import { allowsChannel } from "./notificationPreferences";
import { phClock } from "./phTime";

type Mailer = (email: { to: string; subject: string; text: string }) => Promise<void>;

export type DigestDeps = {
  now?: Date;
  env?: NodeJS.ProcessEnv;
  /** Whether email can be sent. Defaults to the real check. */
  emailReady?: boolean;
  /** The old name for `emailReady`, kept for one round. */
  smtpReady?: boolean;
  send?: Mailer;
};

const CHECK_EVERY_MS = 5 * 60_000;

/** "HH:MM" from a setting, or the default when it is unset or malformed. */
export function clockSetting(value: string | undefined, fallback: string): string {
  const raw = (value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lines of a supervisor's summary; empty when nothing waits. */
export function supervisorDigestLines(waiting: {
  attendance: number;
  tasks: number;
  documents: number;
  absences: number;
  journals: number;
}): string[] {
  return [
    waiting.attendance > 0 ? count(waiting.attendance, "attendance log", "attendance logs") : "",
    waiting.tasks > 0 ? count(waiting.tasks, "task submission", "task submissions") : "",
    waiting.documents > 0 ? count(waiting.documents, "document", "documents") : "",
    waiting.absences > 0 ? count(waiting.absences, "absence", "absences") : "",
    waiting.journals > 0 ? count(waiting.journals, "weekly report", "weekly reports") : "",
  ].filter(Boolean);
}

/**
 * Marks a summary as sent and sends it; gives the mark back if the email
 * fails, so the next check tries again. False when it had already gone.
 */
export async function sendOnce(
  pool: Pool,
  kind: string,
  accountId: string,
  periodKey: string,
  send: () => Promise<void>
): Promise<boolean> {
  const claimed = await pool.query<{ id: number }>(
    `INSERT INTO digest_log (kind, account_id, period_key) VALUES ($1, $2, $3)
     ON CONFLICT (kind, account_id, period_key) DO NOTHING RETURNING id`,
    [kind, accountId, periodKey]
  );
  if (claimed.rows.length === 0) return false;
  try {
    await send();
    return true;
  } catch (error) {
    // The day's allowance is used: the mark stays, so this summary is not
    // tried again every few minutes for the rest of the day.
    if (error instanceof EmailLimitError) {
      console.error(`A summary email (${kind}) was not sent: ${error.message}`);
      return false;
    }
    console.error(`SUMMARY EMAIL ERROR (${kind}):`, error);
    await pool.query(`DELETE FROM digest_log WHERE id = $1`, [claimed.rows[0].id]).catch(() => undefined);
    return false;
  }
}

/**
 * Sends today's summary to every supervisor who is due one. Returns the
 * supervisors emailed.
 */
export async function sendSupervisorDigests(pool: Pool, deps: DigestDeps = {}): Promise<string[]> {
  const env = deps.env ?? process.env;
  if (!(deps.emailReady ?? deps.smtpReady ?? isEmailConfigured())) return [];
  const clock = phClock(deps.now ?? new Date());
  if (clock.time < clockSetting(env.SUPERVISOR_DIGEST_TIME, "07:30")) return [];
  const send = deps.send ?? sendEmail;

  const due = await pool.query<{
    supervisor_id: string;
    name: string;
    email: string;
    attendance: number;
    tasks: number;
    documents: number;
    absences: number;
    journals: number;
  }>(
    `
    SELECT sup.supervisor_id, sup.name, sup.email,
      (SELECT COUNT(*)::int FROM attendance a JOIN students s ON s.student_id = a.student_id
        WHERE s.supervisor_id = sup.supervisor_id AND s.is_active = TRUE
          AND a.status = 'Pending' AND a.time_out IS NOT NULL) AS attendance,
      (SELECT COUNT(*)::int FROM tasks t JOIN students s ON s.student_id = t.student_id
        WHERE s.supervisor_id = sup.supervisor_id AND s.is_active = TRUE AND t.status = 'Submitted') AS tasks,
      (SELECT COUNT(*)::int FROM documents d JOIN students s ON s.student_id = d.student_id
        WHERE s.supervisor_id = sup.supervisor_id AND s.is_active = TRUE AND d.status = 'Pending') AS documents,
      (SELECT COUNT(*)::int FROM absences b JOIN students s ON s.student_id = b.student_id
        WHERE s.supervisor_id = sup.supervisor_id AND s.is_active = TRUE AND b.status = 'Pending') AS absences,
      (SELECT COUNT(*)::int FROM journals j JOIN students s ON s.student_id = j.student_id
        WHERE s.supervisor_id = sup.supervisor_id AND s.is_active = TRUE AND j.status = 'Submitted') AS journals
    FROM supervisors sup
    WHERE sup.is_active = TRUE AND sup.email IS NOT NULL AND sup.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM digest_log g
        WHERE g.kind = 'supervisor_daily' AND g.account_id = sup.supervisor_id AND g.period_key = $1
      )
    `,
    [clock.date]
  );

  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  const sent: string[] = [];
  for (const row of due.rows) {
    const lines = supervisorDigestLines(row);
    if (lines.length === 0) continue;
    if (!(await allowsChannel(pool, "supervisor", row.supervisor_id, "digest", "email"))) continue;
    const total = row.attendance + row.tasks + row.documents + row.absences + row.journals;
    const delivered = await sendOnce(pool, "supervisor_daily", row.supervisor_id, clock.date, () =>
      send({
        to: row.email,
        subject: `INTERNet: ${count(total, "item is", "items are")} waiting for your decision`,
        text: [
          `Hello ${row.name},`,
          "",
          "Waiting for your decision in INTERNet:",
          ...lines.map((line) => `  - ${line}`),
          "",
          base ? `Open your review queue: ${base}/supervisor/dashboard` : "Sign in to INTERNet to review them.",
          "",
          "This summary is sent once a day, only when something is waiting. You can turn it off in INTERNet under Profile > Notifications.",
        ].join("\n"),
      })
    );
    if (delivered) sent.push(row.supervisor_id);
  }
  return sent;
}

let running = false;

/** Checks every few minutes whether a summary is due. `also` adds further summaries to the same check. */
export function startDigestScheduler(pool: Pool, also: ((pool: Pool) => Promise<unknown>)[] = []): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendSupervisorDigests(pool);
      for (const extra of also) await extra(pool);
    } catch (error) {
      console.error("SUMMARY EMAIL SCHEDULER ERROR:", error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(() => void run(), CHECK_EVERY_MS);
}
