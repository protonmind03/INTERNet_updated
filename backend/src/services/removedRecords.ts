/*
|--------------------------------------------------------------------------
| REMOVED RECORDS
|--------------------------------------------------------------------------
|
| A record a person removes is copied, whole, into `removed_records`
| (migration 046) by the same statement that deletes it. Either both
| happen or neither does, so a removed record can always be read back.
|
| deleteKeeping() builds that statement from the DELETE a route already
| ran. What the route used to ask for with RETURNING it now selects from
| the removed rows, under the same alias, so the rest of the route is
| unchanged.
|
*/

const TABLES = new Set([
  "tasks",
  "evaluations",
  "absences",
  "announcements",
  "holidays",
  "dtr_certifications",
  "site_visits",
]);

type Removal = {
  /** The table the rows leave. */
  table: string;
  /** The alias the DELETE gives that table, and the one `select` uses. */
  alias: string;
  /** What follows "DELETE FROM <table> <alias>": USING, if any, and WHERE. */
  where: string;
  /** What the route wants back about each removed row. */
  select: string;
  /** The placeholders holding who removes it: their role, then their id. */
  actor: [role: string, id: string];
};

export function deleteKeeping({ table, alias, where, select, actor }: Removal): string {
  // The names go into the statement itself, so they are never taken from a request.
  if (!TABLES.has(table)) throw new Error(`deleteKeeping does not know the table ${table}.`);
  if (!/^[a-z]{1,8}$/.test(alias)) throw new Error("deleteKeeping needs a short alias.");
  if (!actor.every((place) => /^\$[0-9]{1,2}$/.test(place))) {
    throw new Error("deleteKeeping needs the placeholders for who removes the record.");
  }
  return `
    WITH gone AS (
      DELETE FROM ${table} ${alias}
      ${where}
      RETURNING ${alias}.*
    ), kept AS (
      INSERT INTO removed_records (table_name, record_id, student_id, data, removed_by_role, removed_by_id)
      SELECT '${table}', gone.id::text, to_jsonb(gone)->>'student_id', to_jsonb(gone), ${actor[0]}::text, ${actor[1]}::text
      FROM gone
    )
    SELECT ${select} FROM gone ${alias}
  `;
}
