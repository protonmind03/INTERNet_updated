import type { Pool, PoolClient } from "pg";

/*
|--------------------------------------------------------------------------
| PLACING A STUDENT AT A COMPANY (Phase 1.3, migration 083)
|--------------------------------------------------------------------------
|
| A student's company is the name on their record; a trigger links it to
| the company with that name (migration 020). Every route that writes it
| (create, edit, the CSV import) runs its write through withPlacement:
|
|   1. In one transaction, the company the name points to is locked
|      (SELECT ... FOR UPDATE), so two placements at the same company wait
|      for each other instead of both taking the last slot.
|   2. The write is done.
|   3. When the student is newly at that company, it must be approved
|      (409 COMPANY_NOT_APPROVED) and have room: its active students in the
|      student's term, this one included, may not be more than its slots
|      (409 NO_SLOTS). NULL slots: no limit. Otherwise the write is undone.
|
| A name that matches no company record is left as it is, as before: it
| shows on the Companies page as not yet recorded, and links itself once
| the record exists.
|
*/

export type PlacementCode = "NO_SLOTS" | "COMPANY_NOT_APPROVED";

export class PlacementError extends Error {
  constructor(
    readonly code: PlacementCode,
    message: string
  ) {
    super(message);
  }
}

type Company = { id: number; name: string; status: string; is_active: boolean; slots: number | null };

const STATUS_WORDS: Record<string, string> = {
  applied: "has applied and is not approved yet",
  screening: "is being screened and is not approved yet",
  suspended: "is suspended",
};

/** Whether a company can take this student: approved, active, with room in the term. */
export async function placementProblem(db: Pick<PoolClient, "query">, company: Company, studentId: string): Promise<PlacementError | null> {
  if (!company.is_active) return new PlacementError("COMPANY_NOT_APPROVED", `${company.name} is marked inactive. Choose another company.`);
  if (company.status !== "approved") {
    return new PlacementError("COMPANY_NOT_APPROVED", `${company.name} ${STATUS_WORDS[company.status] ?? "is not approved"}. Students are placed only at approved companies.`);
  }
  if (company.slots === null) return null;
  const counted = await db.query<{ placed: number }>(
    `SELECT COUNT(*)::int AS placed FROM students s
     WHERE s.company_id = $1 AND s.is_active = TRUE
       AND COALESCE(s.term_id, 0) = COALESCE((SELECT term_id FROM students WHERE student_id = $2), 0)`,
    [company.id, studentId]
  );
  if (counted.rows[0].placed > company.slots) {
    return new PlacementError(
      "NO_SLOTS",
      `${company.name} has no free slots: all ${company.slots} are taken this term. Choose another company or ask the office to raise its slots.`
    );
  }
  return null;
}

/**
 * Runs a write that may set a student's company, with the checks above.
 * `company` is the name being written, or undefined when the write does not
 * touch it. `write` returns the student's id, or null when nothing was
 * written (the route answers its own 404). Throws PlacementError.
 */
export async function withPlacement<T extends { student_id: string } | null>(
  pool: Pool,
  company: string | null | undefined,
  previousStudentId: string | null,
  write: (db: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const named = typeof company === "string" && company.trim() !== "";
    const locked = named
      ? (
          await client.query<Company>(
            `SELECT id, name, status, is_active, slots FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) FOR UPDATE`,
            [company]
          )
        ).rows[0] ?? null
      : null;
    const before = previousStudentId
      ? (await client.query<{ company_id: number | null }>(`SELECT company_id FROM students WHERE student_id = $1 FOR UPDATE`, [previousStudentId])).rows[0]
      : undefined;
    const result = await write(client);
    if (result && locked && before?.company_id !== locked.id) {
      const problem = await placementProblem(client, locked, result.student_id);
      if (problem) throw problem;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
