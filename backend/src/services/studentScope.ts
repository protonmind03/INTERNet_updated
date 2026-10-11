/*
|--------------------------------------------------------------------------
| WHICH STUDENTS: THE COORDINATOR'S FILTERS
|--------------------------------------------------------------------------
|
| The coordinator's pages can be narrowed to some of the students: one
| term's, one college's, one program's, one block's, one company's, one
| supervisor's. Every route behind those pages reads the same six optional
| parameters and narrows its SQL the same way, from here.
|
|   term        a term's id, or "none" for students with no term
|   college     a college's id
|   program     a program's id
|   block       a block's id, or "none" for students with no block
|   company     a company's id
|   supervisor  a supervisor's id, or "none" for students with none
|
| A request that sends none of them is answered exactly as before: no
| condition is added and no value is bound. An id that is well formed but
| belongs to nothing simply matches no student. A value that is not well
| formed is refused before any query runs.
|
| How the values reach the database. A condition is written with a named
| marker (":f_program"), never with the value itself. `bindFilters` turns
| each marker into the next numbered parameter of the query it is used in
| and adds the value to that query's parameters, so a filter value is
| always passed as a parameter and the same condition can be dropped into
| any query, whatever parameters it already has. The column names are
| fixed here; nothing from the request is ever written into the SQL.
|
*/

export type StudentFilters = {
  /** A term's id as text, or "none". */
  term?: string;
  college?: number;
  program?: number;
  block?: number | "none";
  company?: number;
  /** A supervisor's id, or "none". */
  supervisor?: string;
};

const WHOLE = /^[0-9]{1,9}$/;

function one(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads the filters from a request's query, or says which one cannot be used. */
export function readStudentFilters(
  query: Record<string, unknown>
): { problem: string } | { filters: StudentFilters } {
  const filters: StudentFilters = {};

  const term = one(query.term);
  if (term) {
    if (term !== "none" && !WHOLE.test(term)) return { problem: "That is not a term." };
    filters.term = term;
  }
  for (const [name, label] of [
    ["college", "a college"],
    ["program", "a program"],
    ["company", "a company"],
  ] as const) {
    const value = one(query[name]);
    if (!value) continue;
    if (!WHOLE.test(value)) return { problem: `That is not ${label}.` };
    filters[name] = Number(value);
  }
  const block = one(query.block);
  if (block) {
    if (block !== "none" && !WHOLE.test(block)) return { problem: "That is not a block." };
    filters.block = block === "none" ? "none" : Number(block);
  }
  const supervisor = one(query.supervisor);
  if (supervisor) {
    // Supervisor ids are text. It is only ever compared as a parameter.
    if (supervisor.length > 80) return { problem: "That is not a supervisor." };
    filters.supervisor = supervisor;
  }
  return { filters };
}

export function hasFilters(filters: StudentFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/**
 * The conditions for the chosen filters, each starting with " AND ", on
 * the students table under `alias` ("s"), or on its bare column names when
 * `alias` is "". Empty when no filter is chosen.
 */
export function filterConditions(filters: StudentFilters, alias = "s"): string {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  const parts: string[] = [];
  if (filters.term === "none") parts.push(`${column("term_id")} IS NULL`);
  else if (filters.term !== undefined) parts.push(`${column("term_id")} = :f_term`);
  if (filters.college !== undefined) {
    parts.push(`${column("program_id")} IN (SELECT id FROM programs WHERE college_id = :f_college)`);
  }
  if (filters.program !== undefined) parts.push(`${column("program_id")} = :f_program`);
  if (filters.block === "none") parts.push(`${column("block_id")} IS NULL`);
  else if (filters.block !== undefined) parts.push(`${column("block_id")} = :f_block`);
  if (filters.company !== undefined) parts.push(`${column("company_id")} = :f_company`);
  if (filters.supervisor === "none") {
    parts.push(`(${column("supervisor_id")} IS NULL OR TRIM(${column("supervisor_id")}::text) = '')`);
  } else if (filters.supervisor !== undefined) {
    parts.push(`TRIM(${column("supervisor_id")}::text) = TRIM(:f_supervisor)`);
  }
  return parts.map((part) => ` AND ${part}`).join("");
}

/** "<column> is one of the chosen students", for a table that only has a student id. */
export function filterOfStudent(filters: StudentFilters, column: string): string {
  if (!hasFilters(filters)) return "";
  if (!/^[a-z_]+(\.[a-z_]+)?$/.test(column)) throw new Error(`Not a column name: ${column}`);
  return ` AND ${column} IN (SELECT student_id FROM students WHERE TRUE${filterConditions(filters, "")})`;
}

/**
 * Makes a query that uses the conditions above runnable: every marker
 * becomes a numbered parameter after the query's own, and its value is
 * added to the parameters. A query with no marker comes back unchanged.
 */
export function bindFilters(
  sql: string,
  params: readonly unknown[],
  filters: StudentFilters
): { text: string; values: unknown[] } {
  const values = [...params];
  const placed = new Map<string, string>();
  const valueOf: Record<string, unknown> = {
    term: filters.term === undefined || filters.term === "none" ? null : Number(filters.term),
    college: filters.college ?? null,
    program: filters.program ?? null,
    block: typeof filters.block === "number" ? filters.block : null,
    company: filters.company ?? null,
    supervisor: filters.supervisor ?? null,
  };
  const text = sql.replace(/:f_(term|college|program|block|company|supervisor)\b/g, (_marker, name: string) => {
    let placeholder = placed.get(name);
    if (!placeholder) {
      values.push(valueOf[name]);
      placeholder = `$${values.length}${name === "supervisor" ? "::text" : "::int"}`;
      placed.set(name, placeholder);
    }
    return placeholder;
  });
  return { text, values };
}

/** The filters as the pages send them, to carry into a link ("&program=3"). */
export function filtersAsQuery(filters: StudentFilters): string {
  const pairs: string[] = [];
  for (const name of ["term", "college", "program", "block", "company", "supervisor"] as const) {
    const value = filters[name];
    if (value !== undefined) pairs.push(`${name}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join("&");
}
