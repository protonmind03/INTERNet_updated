import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| DECIDED BY SOMEONE ELSE FIRST
|--------------------------------------------------------------------------
|
| Iteration 12 (migration 062). Every review decision sends the version of
| the record the reviewer was looking at (`expected_version`). Before the
| decision is written, the record's version now is compared with it: if
| they differ, someone (another reviewer, the student, the coordinator)
| changed it in between, and the decision is refused with 409, the code
| STALE and the record as it is now, so the page can show what happened
| instead of overwriting it.
|
| A request with no expected_version is decided as before (an older copy of
| the app). The check and the write are two statements; the window between
| them is a few milliseconds, against the minutes a review takes.
|
*/

/** The records a decision is made on, and what is said about each when it changed. */
const RECORDS = {
  attendance: { table: "attendance", what: "attendance log", note: "review_notes" },
  task: { table: "tasks", what: "task", note: "review_notes" },
  document: { table: "documents", what: "document", note: "review_notes" },
  absence: { table: "absences", what: "absence", note: "review_notes" },
  journal: { table: "journals", what: "weekly report", note: "review_notes" },
  appeal: { table: "attendance_appeals", what: "appeal", note: "decision_note" },
} as const;

export type VersionedKind = keyof typeof RECORDS;

/** The version a request says it saw, or undefined when it says none (or not a whole number). */
export function expectedVersion(body: unknown): number | undefined {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).expected_version : undefined;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export type StaleAnswer = {
  code: "STALE";
  message: string;
  current: { id: number; status: string | null; version: number; note: string | null };
};

/**
 * Null when the decision may go ahead (no version sent, the record is not
 * there, or it is the version the reviewer saw); otherwise the 409 answer.
 */
export async function staleDecision(
  pool: Pick<Pool, "query">,
  kind: VersionedKind,
  id: number | string,
  body: unknown,
  /** Who is deciding. A record they cannot see is not looked at here: the route refuses it as before. */
  auth: { role: string; id: string }
): Promise<StaleAnswer | null> {
  const expected = expectedVersion(body);
  if (expected === undefined || !/^\d+$/.test(String(id))) return null;
  const { table, what, note } = RECORDS[kind];
  // A supervisor sees only their own interns' records; the coordinator, everyone's.
  const coordinator = auth.role === "coordinator";
  const found = await pool.query<{ id: number; status: string | null; version: number; note: string | null }>(
    `SELECT r.id, r.status::text AS status, r.version, r.${note} AS note
     FROM ${table} r JOIN students s ON s.student_id = r.student_id
     WHERE r.id = $1 ${coordinator ? "" : "AND s.supervisor_id::text = $2::text"}`,
    coordinator ? [Number(id)] : [Number(id), auth.id]
  );
  const row = found.rows[0];
  if (!row || Number(row.version) === expected) return null;
  return {
    code: "STALE",
    message: `This ${what} changed while you had it open${row.status ? `: it is now ${String(row.status).toLowerCase()}` : ""}. Look at it again before deciding.`,
    current: { id: Number(row.id), status: row.status, version: Number(row.version), note: row.note },
  };
}
