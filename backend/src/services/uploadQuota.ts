import type express from "express";
import type { Pool } from "pg";
import { phSql } from "./phTime";

/*
|--------------------------------------------------------------------------
| HOW MUCH ONE ACCOUNT MAY UPLOAD
|--------------------------------------------------------------------------
|
| Documents, task files, concern evidence and pictures are counted per
| account in upload_ledger (migration 053). An upload is refused with 413
| and a plain sentence when it would take the account past its room on the
| server, or past the files it may send in one Philippine day:
|
|   UPLOAD_QUOTA_MB_STUDENT     default 300
|   UPLOAD_QUOTA_MB_SUPERVISOR  default 200
|   UPLOAD_DAILY_FILES          default 60, for either
|
| A value that is not a whole number of at least 1 is ignored and the
| default used. Coordinators are not counted. Time-in photos are not
| counted: a time-in must never be refused for want of room.
|
| The check runs after the file is received and before the route stores
| it; the file is entered in the ledger once the route has answered with
| success. Two uploads finishing at the same moment can each pass the
| check, so an account can go over by one file at most.
|
*/

export type QuotaRole = "student" | "supervisor";
export type UploadKind = "document" | "task_file" | "evidence" | "picture" | "signature";

export type QuotaLimits = { bytes: number; dailyFiles: number };

const whole = (raw: string | undefined, fallback: number) => {
  const value = Number((raw || "").trim());
  return Number.isInteger(value) && value >= 1 ? value : fallback;
};

export function quotaLimits(role: QuotaRole, env: NodeJS.ProcessEnv = process.env): QuotaLimits {
  const megabytes =
    role === "student" ? whole(env.UPLOAD_QUOTA_MB_STUDENT, 300) : whole(env.UPLOAD_QUOTA_MB_SUPERVISOR, 200);
  return { bytes: megabytes * 1024 * 1024, dailyFiles: whole(env.UPLOAD_DAILY_FILES, 60) };
}

export type Usage = { used_bytes: number; files_today: number; quota_bytes: number; daily_files: number };

/** What an account has used: all its counted uploads, and its files today in the Philippines. */
export async function uploadUsage(
  db: Pick<Pool, "query">,
  role: QuotaRole,
  accountId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<Usage> {
  const found = await db.query<{ used: string; today: number }>(
    `SELECT COALESCE(SUM(bytes), 0)::bigint AS used,
            COUNT(*) FILTER (WHERE ${phSql.date("created_at")} = ${phSql.today})::int AS today
     FROM upload_ledger WHERE role = $1 AND account_id = $2`,
    [role, accountId]
  );
  const limits = quotaLimits(role, env);
  return {
    used_bytes: Number(found.rows[0]?.used ?? 0),
    files_today: found.rows[0]?.today ?? 0,
    quota_bytes: limits.bytes,
    daily_files: limits.dailyFiles,
  };
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Why this upload is refused, or null when there is room for it. */
export function quotaProblem(usage: Usage, incoming: number): string | null {
  if (usage.files_today >= usage.daily_files) {
    return `You have uploaded ${usage.daily_files} files today, the most allowed in one day. Try again tomorrow.`;
  }
  if (usage.used_bytes + incoming > usage.quota_bytes) {
    return `This file would take your uploads past the ${megabytes(usage.quota_bytes)} each account may keep. Ask your OJT coordinator for help.`;
  }
  return null;
}

/**
 * Writes one accepted upload into the ledger. A document or a picture
 * passes its own table and id (`source`), which migration 053 also uses for
 * those it copied in, so running that migration again never counts one
 * twice.
 */
export async function recordUpload(
  db: Pick<Pool, "query">,
  role: QuotaRole,
  accountId: string,
  kind: UploadKind,
  bytes: number,
  source?: { table: "documents" | "attachments"; id: number }
): Promise<void> {
  await db.query(
    `INSERT INTO upload_ledger (role, account_id, kind, bytes, source, source_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source, source_id) WHERE source IS NOT NULL DO NOTHING`,
    [role, accountId, kind, bytes, source?.table ?? null, source?.id ?? null]
  );
}

type Authed = express.Request & { auth?: { role: string; id: string } };

/**
 * Express middleware for a route that has just received one file
 * (`req.file`). Put it after the upload middleware and before the handler.
 * A request with no file, or from a coordinator, passes untouched. With
 * `record: false` it only checks, and the route writes the ledger itself
 * (a document, which has an id to name).
 */
export function uploadQuota(pool: Pool, kind: UploadKind, options: { record?: boolean } = {}): express.RequestHandler {
  return async (req, res, next) => {
    const auth = (req as Authed).auth;
    const file = req.file;
    if (!file || !auth || (auth.role !== "student" && auth.role !== "supervisor")) return next();
    const role = auth.role as QuotaRole;
    try {
      const problem = quotaProblem(await uploadUsage(pool, role, auth.id), file.size);
      if (problem) return res.status(413).json({ code: "UPLOAD_QUOTA", message: problem });
    } catch (error) {
      // The count could not be read: the upload goes ahead rather than being refused for that.
      console.error("UPLOAD QUOTA CHECK ERROR:", error);
      return next();
    }
    if (options.record === false) return next();
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      recordUpload(pool, role, auth.id, kind, file.size).catch((error) => console.error("UPLOAD LEDGER ERROR:", error));
    });
    return next();
  };
}
