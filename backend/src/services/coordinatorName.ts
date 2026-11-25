import type { Pool } from "pg";

/** A coordinator's name as records show it, or "OJT coordinator" when it cannot be found. */
export async function coordinatorName(pool: Pick<Pool, "query">, coordinatorId: string): Promise<string> {
  const found = await pool.query<{ name: string }>(`SELECT name FROM coordinators WHERE coordinator_id = $1`, [coordinatorId]);
  return found.rows[0]?.name || "OJT coordinator";
}
