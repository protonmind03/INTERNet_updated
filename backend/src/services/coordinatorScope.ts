import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool } from "pg";

/*
|--------------------------------------------------------------------------
| WHICH STUDENTS A COORDINATOR LOOKS AFTER (Phase 1.6, migration 080)
|--------------------------------------------------------------------------
|
| The OJT Director gives a coordinator colleges or programs
| (coordinator_scopes). A coordinator with no row sees every student, as
| before; one with rows sees only students whose program is one of those
| programs or in one of those colleges. A student with no program is
| outside every scope.
|
| It is applied in two places, so no route has to remember it:
|
|   lists     when a coordinator is signed in (requireCoordinator, or
|             requireRole letting a coordinator through, in server.ts),
|             their scope is kept for the rest of the request. The shared
|             filters (services/studentScope.ts) add it to every query
|             built with them, as if it were one more filter.
|
|   records   the same guards look at the route: a :studentId, or a
|             record found by its id in SCOPED_RECORDS below. A student
|             outside the scope answers the same 404 as one that does not
|             exist, so the guard tells nothing about who is there.
|
*/

export type CoordinatorScope = { colleges: number[]; programs: number[] };

const current = new AsyncLocalStorage<CoordinatorScope | null>();

/** The signed-in coordinator's scope for this request, or null for every student. */
export function currentScope(): CoordinatorScope | null {
  return current.getStore() ?? null;
}

/** Runs the rest of a request under a coordinator's scope. */
export function withScope<T>(scope: CoordinatorScope | null, run: () => T): T {
  return current.run(scope, run);
}

/** A coordinator's scope, or null when they have none (every student). */
export async function loadCoordinatorScope(pool: Pool, coordinatorId: string): Promise<CoordinatorScope | null> {
  const rows = (
    await pool.query<{ college_id: number | null; program_id: number | null }>(
      `SELECT college_id, program_id FROM coordinator_scopes WHERE coordinator_id = $1`,
      [coordinatorId]
    )
  ).rows;
  if (rows.length === 0) return null;
  return {
    colleges: rows.flatMap((row) => (row.college_id === null ? [] : [Number(row.college_id)])),
    programs: rows.flatMap((row) => (row.program_id === null ? [] : [Number(row.program_id)])),
  };
}

/** SQL: a program id (an expression) is inside the scope bound as `$colleges`, `$programs`. */
export const programInScope = (programColumn: string, colleges: string, programs: string) =>
  `${programColumn} IN (SELECT id FROM programs WHERE college_id = ANY(${colleges}) OR id = ANY(${programs}))`;

/** True when the student is inside the scope. */
export async function studentInScope(pool: Pool, scope: CoordinatorScope, studentId: string): Promise<boolean> {
  const found = await pool.query(
    `SELECT 1 FROM students s WHERE TRIM(s.student_id::text) = TRIM($1) AND ${programInScope("s.program_id", "$2::int[]", "$3::int[]")}`,
    [studentId, scope.colleges, scope.programs]
  );
  return found.rows.length > 0;
}

/**
 * Routes that name a record by its id, and how to find whose it is. Only
 * records about one student are here; programme-wide records (terms,
 * holidays, requirements, colleges, announcements) have no student.
 */
/** A concern's student: its filer, or the intern a supervisor's concern is about (reported_student_id). */
const CONCERN_STUDENT = "SELECT COALESCE(student_id, reported_student_id) AS student_id FROM complaints WHERE id::text = $1";

const SCOPED_RECORDS: Record<string, { param: string; student: string }> = {
  "/api/attendance/:id/status": { param: "id", student: "SELECT student_id FROM attendance WHERE id::text = $1" },
  "/api/coordinator/attendance/:id/acknowledge": { param: "id", student: "SELECT student_id FROM attendance WHERE id::text = $1" },
  "/api/absences/:id/review": { param: "id", student: "SELECT student_id FROM absences WHERE id::text = $1" },
  "/api/coordinator/appeals/:id": { param: "id", student: "SELECT student_id FROM attendance_appeals WHERE id::text = $1" },
  "/api/coordinator/complaints/:id/resolve": { param: "id", student: CONCERN_STUDENT },
  "/api/complaints/:id/messages": { param: "id", student: CONCERN_STUDENT },
  "/api/evaluations/:id": { param: "id", student: "SELECT student_id FROM evaluations WHERE id::text = $1" },
  "/api/attachments/:id/preview": { param: "id", student: "SELECT student_id FROM attachments WHERE id::text = $1" },
  "/api/attachments/:id/file": { param: "id", student: "SELECT student_id FROM attachments WHERE id::text = $1" },
  "/api/documents/:documentId/review": { param: "documentId", student: "SELECT student_id FROM documents WHERE id::text = $1" },
  "/api/documents/:documentId/file": { param: "documentId", student: "SELECT student_id FROM documents WHERE id::text = $1" },
};

/** Routes that name a person by kind and id: only a student is scoped. */
const PERSON_ROUTES: Record<string, { kind: string; id: string; student: string }> = {
  "/api/coordinator/people/:role/:id/details": { kind: "role", id: "id", student: "student" },
  "/api/coordinator/:kind/:id/reset-password": { kind: "kind", id: "id", student: "students" },
};

type RouteRequest = { route?: unknown; params: object };

/**
 * The student a request is about, when the route names one: by :studentId,
 * by a person route naming a student, or by a record in SCOPED_RECORDS.
 * Undefined when the route is not about one student; null when the record
 * does not exist (the route answers its own 404).
 */
async function studentOf(pool: Pool, req: RouteRequest): Promise<string | null | undefined> {
  const params = req.params as Record<string, string | undefined>;
  if (params.studentId) return params.studentId;
  const route = req.route as { path?: unknown } | undefined;
  const path = typeof route?.path === "string" ? route.path : "";
  const person = PERSON_ROUTES[path];
  if (person) return params[person.kind] === person.student ? params[person.id] ?? null : undefined;
  const record = SCOPED_RECORDS[path];
  if (!record) return undefined;
  const id = params[record.param];
  if (!id) return null;
  const found = await pool.query<{ student_id: string | null }>(record.student, [id]);
  return found.rows[0]?.student_id ?? null;
}

/**
 * For a query that does not use the shared filters: " AND <student id> is
 * in the current coordinator's scope", with its values numbered after the
 * query's own. Empty (and no values) when there is no scope.
 */
export function scopeCondition(studentIdColumn: string, paramsSoFar: number): { sql: string; values: unknown[] } {
  const scope = currentScope();
  if (!scope) return { sql: "", values: [] };
  if (!/^[a-z_]+(\.[a-z_]+)?$/.test(studentIdColumn)) throw new Error(`Not a column name: ${studentIdColumn}`);
  const colleges = `$${paramsSoFar + 1}::int[]`;
  const programs = `$${paramsSoFar + 2}::int[]`;
  return {
    sql: ` AND TRIM(${studentIdColumn}::text) IN (SELECT TRIM(student_id::text) FROM students WHERE ${programInScope("program_id", colleges, programs)})`,
    values: [scope.colleges, scope.programs],
  };
}

/** True when a scoped coordinator's request names a student outside their scope. */
export async function outsideScope(pool: Pool, scope: CoordinatorScope | null, req: RouteRequest): Promise<boolean> {
  if (!scope) return false;
  const student = await studentOf(pool, req);
  if (!student) return false;
  return !(await studentInScope(pool, scope, student));
}
