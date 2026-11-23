import type { Pool, PoolClient } from "pg";
import { appliesTo } from "./deliverables";
import { ojtSetting } from "./ojtSettings";

/*
|--------------------------------------------------------------------------
| DEPLOYMENT CLEARANCE (Phase 1.2, migration 079)
|--------------------------------------------------------------------------
|
| A student is READY for deployment when they are academically eligible,
| every active requirement needed before deployment (migration 078) that
| applies to them has an approved file, and a company is assigned. The
| coordinator then CLEARS them; clearing someone not ready needs a reason
| (an override).
|
| With the setting deployment_gate_enabled on, a student who is not cleared
| cannot time in (the app, offline, or recorded by the supervisor) and is
| not given offline vouchers. Off, nothing changes.
|
*/

type Db = Pick<Pool | PoolClient, "query">;

export type ItemState = "missing" | "pending" | "approved" | "rejected";

export type Readiness = {
  student_id: string;
  name: string;
  program: string | null;
  program_id: number | null;
  block_id: number | null;
  company: string | null;
  eligibility_status: "unchecked" | "eligible" | "deficient";
  eligibility_note: string | null;
  cleared_for_deployment_at: string | null;
  cleared_by: string | null;
  clearance_override_reason: string | null;
  /** The projection says they finish after the term ends (student_projections). */
  at_risk: boolean;
  items: { name: string; state: ItemState }[];
  /** What still stands between the student and being ready, in words. */
  missing: string[];
  ready: boolean;
  cleared: boolean;
};

export const NOT_ELIGIBLE = "Academic eligibility";
export const NO_COMPANY = "Company assignment";

/**
 * SQL selecting each student's readiness from students `s` (an alias);
 * the caller adds FROM, WHERE and ORDER BY.
 */
export const READINESS_COLUMNS = `
  s.student_id, s.name, s.program, s.program_id, s.block_id, s.company,
  s.eligibility_status, s.eligibility_note,
  s.cleared_for_deployment_at, s.cleared_by, s.clearance_override_reason,
  (s.company_id IS NOT NULL OR NULLIF(TRIM(COALESCE(s.company, '')), '') IS NOT NULL) AS has_company,
  COALESCE((SELECT sp.at_risk FROM student_projections sp WHERE sp.student_id = s.student_id), FALSE) AS at_risk,
  COALESCE((
    SELECT json_agg(json_build_object('name', r.name, 'state', COALESCE((
      -- An approved file counts; otherwise the latest one says where it stands.
      SELECT CASE d.status WHEN 'Approved' THEN 'approved' WHEN 'Pending' THEN 'pending' ELSE 'rejected' END
      FROM documents d WHERE d.student_id = s.student_id AND d.doc_type = r.name
      ORDER BY (d.status = 'Approved') DESC, d.uploaded_at DESC, d.id DESC LIMIT 1
    ), 'missing')) ORDER BY r.sort_order, r.name)
    FROM ojt_requirements r
    WHERE r.is_active = TRUE AND r.pre_deployment = TRUE AND ${appliesTo("r", "s")}
  ), '[]'::json) AS items`;

type ReadinessRow = Omit<Readiness, "missing" | "ready" | "cleared"> & { has_company: boolean };

/** The words and flags worked out from a row of READINESS_COLUMNS. */
export function readinessOf(row: ReadinessRow): Readiness {
  const { has_company: hasCompany, ...rest } = row;
  const missing = [
    ...(row.eligibility_status === "eligible" ? [] : [NOT_ELIGIBLE]),
    ...row.items.filter((item) => item.state !== "approved").map((item) => item.name),
    ...(hasCompany ? [] : [NO_COMPANY]),
  ];
  return {
    ...rest,
    cleared_for_deployment_at: row.cleared_for_deployment_at ? new Date(row.cleared_for_deployment_at).toISOString() : null,
    missing,
    ready: missing.length === 0,
    cleared: Boolean(row.cleared_for_deployment_at),
  };
}

/** One student's readiness, or null when there is no such student. */
export async function studentReadiness(db: Db, studentId: string): Promise<Readiness | null> {
  const row = (await db.query<ReadinessRow>(`SELECT ${READINESS_COLUMNS} FROM students s WHERE s.student_id = $1`, [studentId])).rows[0];
  return row ? readinessOf(row) : null;
}

export type NotCleared = { code: "NOT_CLEARED"; missing: string[]; message: string };

/** The time-in's "not cleared" answer in words: what is missing and who clears. */
export function notClearedMessage(missing: string[]): string {
  return missing.length
    ? `Not cleared for deployment yet: ${missing.join(", ")}. Your coordinator clears you once these are approved.`
    : "Not cleared for deployment yet. Everything is in: ask your OJT coordinator to clear you.";
}

/**
 * Null when the student may time in: the gate is off, or they are cleared.
 * Otherwise the 403 answer's body (code NOT_CLEARED and what is missing).
 */
export async function deploymentBlock(db: Db, studentId: string): Promise<NotCleared | null> {
  if (!(await ojtSetting(db, "deployment_gate_enabled"))) return null;
  const readiness = await studentReadiness(db, studentId);
  if (!readiness || readiness.cleared) return null;
  return { code: "NOT_CLEARED", missing: readiness.missing, message: notClearedMessage(readiness.missing) };
}
