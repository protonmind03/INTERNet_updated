import type { Pool, PoolClient } from "pg";
import { phClock } from "./phTime";
import { photoRetentionDays } from "./privacy";
import { deletePrivateFile } from "./privateFileStore";

/*
|--------------------------------------------------------------------------
| REMOVING OLD TIME-IN PHOTOS
|--------------------------------------------------------------------------
|
| With PHOTO_RETENTION_DAYS set (a whole number, at least 30), a time-in
| photo older than that is removed: the file goes, and the log's image_url
| is cleared. The log itself, its times and hours, are kept. Only decided
| logs (Verified or Rejected) are touched; a photo someone may still need to
| look at is never removed.
|
| It runs by itself each night at 02:30 Philippine time, from the server's
| summary scheduler. Several copies of the server may be running, so a run
| takes a PostgreSQL advisory lock first and records itself in
| photo_purge_runs (migration 052), which allows one nightly run per date.
| The script scripts/purge-photos.ts still runs it by hand.
|
| With the variable unset nothing happens and nothing is recorded.
|
*/

/** The Philippine time of day the nightly run starts. */
export const PURGE_TIME = "02:30";
/** Any number the rest of the system does not use, naming this job's lock. */
const LOCK_KEY = 46_052_030;

export type PurgeRun = { removed: number; failed: number; retentionDays: number };

type Due = { id: number; image_url: string };

/** The photos due for removal, oldest first. */
export async function photosDue(db: Pick<Pool, "query">, days: number): Promise<Due[]> {
  const due = await db.query<Due>(
    `SELECT id, image_url FROM attendance
     WHERE image_url IS NOT NULL
       AND status IN ('Verified', 'Rejected')
       AND date < CURRENT_DATE - $1::int
     ORDER BY date, id`,
    [days]
  );
  return due.rows;
}

/** Removes each due photo's file and clears it from its log. */
export async function removePhotos(
  db: Pick<Pool, "query">,
  due: Due[],
  removeFile: (name: string) => Promise<void> = deletePrivateFile
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await removeFile(row.image_url.replace(/^\/uploads\//, ""));
    } catch (error) {
      // A file already gone is still a photo no longer kept; the log is cleared all the same.
      if ((error as { code?: string }).code !== "ENOENT") failed += 1;
    }
    await db.query(`UPDATE attendance SET image_url = NULL WHERE id = $1`, [row.id]);
    removed += 1;
  }
  return { removed, failed };
}

/**
 * Runs the nightly clean-up if it is due: retention is set, it is 02:30 or
 * later in the Philippines, and no nightly run is recorded for today. Safe
 * to call as often as wanted and from several servers at once. Returns the
 * run, or null when nothing was due. Never throws: a failure is logged and
 * tried again at the next check.
 */
export async function runPhotoPurgeIfDue(
  pool: Pool,
  options: { now?: Date; env?: NodeJS.ProcessEnv; removeFile?: (name: string) => Promise<void> } = {}
): Promise<PurgeRun | null> {
  const days = photoRetentionDays(options.env);
  if (days === null) return null;
  const clock = phClock(options.now ?? new Date());
  if (clock.time < PURGE_TIME) return null;

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // Held until this transaction ends; another server checking now simply moves on.
    const locked = await client.query<{ got: boolean }>(`SELECT pg_try_advisory_xact_lock($1) AS got`, [LOCK_KEY]);
    if (!locked.rows[0].got) {
      await client.query("ROLLBACK");
      return null;
    }
    const done = await client.query(
      `SELECT 1 FROM photo_purge_runs WHERE ran_on = $1::date AND by_hand = FALSE`,
      [clock.date]
    );
    if (done.rows.length > 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = await removePhotos(client, await photosDue(client, days), options.removeFile);
    await client.query(
      `INSERT INTO photo_purge_runs (ran_on, retention_days, removed, failed) VALUES ($1::date, $2, $3, $4)`,
      [clock.date, days, result.removed, result.failed]
    );
    await client.query("COMMIT");
    console.log(
      `Photo clean-up: ${result.removed} time-in photo${result.removed === 1 ? "" : "s"} older than ${days} days removed` +
        (result.failed > 0 ? `, ${result.failed} file${result.failed === 1 ? "" : "s"} could not be deleted.` : ".")
    );
    return { ...result, retentionDays: days };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("PHOTO PURGE ERROR:", error);
    return null;
  } finally {
    client?.release();
  }
}

/** The last recorded run, for the coordinator's status card. Null when there has been none. */
export async function lastPhotoPurge(db: Pick<Pool, "query">): Promise<{
  ran_at: string;
  retention_days: number;
  removed: number;
  failed: number;
  by_hand: boolean;
} | null> {
  const found = await db.query(
    `SELECT ran_at, retention_days, removed, failed, by_hand FROM photo_purge_runs ORDER BY ran_at DESC, id DESC LIMIT 1`
  );
  return found.rows[0] ?? null;
}
