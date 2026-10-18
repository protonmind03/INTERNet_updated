import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| ONE SERVER AT A TIME FOR EACH SCHEDULED LOOP
|--------------------------------------------------------------------------
|
| Iteration 16 (roadmap Chapter 9). Reminders, summaries and the nightly
| jobs run inside the API process on a timer. Today there is one API
| server; with two, both would run each loop and could send the same
| reminder twice. Each round of a loop now first takes a PostgreSQL advisory
| lock of its own (held by one connection for the length of the round): the
| server that gets it does the round, any other skips it and tries again at
| its next tick. If the server holding it dies, PostgreSQL releases the lock
| with its connection.
|
| One number per loop. The jobs inside a round that already lock for
| themselves (photo clean-up, the uploads pack) keep their own locks.
|
*/

export const LOOP_LOCKS = {
  deadlineReminders: 7_031_101,
  timeOutReminders: 7_031_102,
  digests: 7_031_103,
} as const;

/**
 * Runs `work` only if this server gets the loop's lock; null when another
 * server holds it (or the database cannot be reached: the round is skipped
 * and tried again at the next tick).
 */
export async function withLoopLock<T>(pool: Pick<Pool, "connect">, key: number, work: () => Promise<T>): Promise<T | null> {
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    console.error("SCHEDULED LOOP LOCK ERROR:", error);
    return null;
  }
  try {
    const got = await client.query<{ got: boolean }>(`SELECT pg_try_advisory_lock($1) AS got`, [key]);
    if (!got.rows[0]?.got) return null;
    try {
      return await work();
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [key]).catch(() => undefined);
    }
  } catch (error) {
    console.error("SCHEDULED LOOP LOCK ERROR:", error);
    return null;
  } finally {
    client.release();
  }
}
