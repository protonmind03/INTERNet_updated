import type { Pool } from "pg";
import { emailRoute } from "./mailer";
import { accountReserve, emailDailyLimit, emailsSentToday } from "./emailBudget";
import { PRIVACY_NOTICE, consentRequired, photoRetentionDays } from "./privacy";
import { fileStoreKind } from "./privateFileStore";
import { PURGE_TIME, lastPhotoPurge } from "./photoPurge";
import { backupStatus } from "./backups";
import { allowedOriginsFrom } from "./corsOrigins";
import { recentProblems } from "./problems";

/*
|--------------------------------------------------------------------------
| WHAT IS SWITCHED ON, AND WHAT IS WRONG
|--------------------------------------------------------------------------
|
| The parts of the system that depend on a setting of the host: email,
| push, where files are kept, the privacy switches, backups. It says on or
| off and how; it never carries a key, an address or any other value of a
| setting.
|
| Phase 1.7: the IT administrator's System status, Backups and Warnings
| pages read it. Until an administrator account exists, the coordinators
| see it on their Profile settings, as before; after that they see only
| whether something is wrong.
|
*/

type Env = NodeJS.ProcessEnv;

export async function systemStatus(pool: Pick<Pool, "query">, pushConfigured: boolean) {
  const route = emailRoute();
  const limit = route ? emailDailyLimit() : null;
  return {
    email: {
      on: route !== null,
      through: route === "api" ? "provider" : route === "smtp" ? "smtp" : null,
      // A reset link is built from the site's address.
      reset_links: route !== null && Boolean(process.env.FRONTEND_URL),
      daily_limit: limit,
      kept_for_password_resets: limit === null ? null : accountReserve(limit),
      sent_today: limit === null ? null : await emailsSentToday(pool),
    },
    push: { on: pushConfigured },
    files: { kept_in: fileStoreKind() === "disk" ? "the server's own disk" : "object storage" },
    privacy: {
      consent_asked: consentRequired(),
      notice_is_placeholder: PRIVACY_NOTICE.placeholder,
      photo_retention_days: photoRetentionDays(),
      photo_purge_time: PURGE_TIME,
      last_photo_purge: await lastPhotoPurge(pool),
    },
    // Iteration 15: the last backups and restore drill (backup_runs, migration 064).
    backups: await backupStatus(pool),
  };
}

export type Warning = { key: string; ok: boolean; title: string; detail: string };

/**
 * The settings a live site must have, each set or not (Phase 1.7). Read-only;
 * the values themselves never leave the server.
 */
export function productionWarnings(
  pushConfigured: boolean,
  backups: Awaited<ReturnType<typeof backupStatus>>,
  env: Env = process.env
): Warning[] {
  const retention = photoRetentionDays(env);
  return [
    {
      key: "cors",
      ok: allowedOriginsFrom(env).length > 0,
      title: "The site's address is set",
      detail: "FRONTEND_URL (or CORS_ORIGINS) names the site, so only it may call the server.",
    },
    {
      key: "consent",
      ok: consentRequired(env),
      title: "Students are asked to agree to the privacy notice",
      detail: "PRIVACY_CONSENT_REQUIRED is true.",
    },
    {
      key: "photo_retention",
      ok: retention !== null,
      title: "Old time-in photos are removed",
      detail: retention === null ? "PHOTO_RETENTION_DAYS is not set." : `Photos older than ${retention} days are removed each night.`,
    },
    {
      key: "privacy_notice",
      ok: !PRIVACY_NOTICE.placeholder,
      title: "The privacy notice is the approved text",
      detail: "The notice in services/privacy.ts is still the draft until the Data Protection Officer approves it.",
    },
    {
      key: "push",
      ok: pushConfigured,
      title: "Push notifications are set up",
      detail: "The three WEB_PUSH_VAPID_* settings are there.",
    },
    {
      // The nightly backup runs as its own service (DEPLOY.md, "Backups"), so
      // what counts is a good one recorded lately, not this server's settings.
      key: "backups",
      ok: !backups.database.missed,
      title: "The database is backed up every night",
      detail: backups.database.last_ok
        ? backups.database.missed
          ? "The last good backup is more than a day old."
          : "A good backup was recorded in the last day."
        : "No backup has been recorded yet.",
    },
  ];
}

/**
 * Phase 1.8: the privacy settings a live site must not go without, as the
 * coordinators, the OJT Director and the administrator are warned of them.
 * Only in production: a test or development server is expected to lack them.
 */
export function privacyWarnings(env: Env = process.env): { production: boolean; warnings: string[] } {
  const production = env.NODE_ENV === "production";
  if (!production) return { production, warnings: [] };
  const warnings: string[] = [];
  if (!consentRequired(env)) warnings.push("Students are not asked to agree to the privacy notice: set PRIVACY_CONSENT_REQUIRED to true.");
  if (photoRetentionDays(env) === null) warnings.push("Old time-in photos are kept with no limit: set PHOTO_RETENTION_DAYS (30 or more).");
  if (PRIVACY_NOTICE.placeholder) warnings.push("The privacy notice is still the draft: it needs the university's approved wording and the Data Protection Officer's contact.");
  return { production, warnings };
}

/**
 * True when a coordinator should hear that something is wrong: a fault in
 * the last day, or backups that ran before and have stopped. A site that
 * never set backups up is a warning for the administrator, not news.
 */
export async function somethingWrong(pool: Pick<Pool, "query">): Promise<boolean> {
  const [problems, backups] = await Promise.all([recentProblems(pool, 1, 1), backupStatus(pool)]);
  const stopped = (part: { last_ok: unknown; missed: boolean }) => part.last_ok !== null && part.missed;
  return problems.length > 0 || stopped(backups.database) || stopped(backups.uploads);
}
