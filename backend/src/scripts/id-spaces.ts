import { connect } from "./fk-shared";

// Counts stored ids with a space at either end. Reads only.
//
//   npm run db:id-spaces
//   railway run --service Postgres npm run db:id-spaces <tunnel port>
//
// New ids are trimmed when saved (services/ids.ts). An older one with a
// stray space would match on screens that compare with sqlSameId and not on
// those that compare plainly, so this says whether any exist. It lists the
// table, the column and how many rows; never the ids themselves.

async function main() {
  const client = await connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const columns = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('character varying', 'text', 'character')
         AND (column_name IN ('student_id', 'supervisor_id', 'coordinator_id', 'account_id', 'actor_id')
              OR column_name LIKE '%\\_student\\_id' OR column_name LIKE '%\\_supervisor\\_id')
       ORDER BY table_name, column_name`
    );
    let found = 0;
    for (const { table_name: table, column_name: column } of columns.rows) {
      const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;
      const result = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ${quoted(table)} WHERE ${quoted(column)} <> BTRIM(${quoted(column)})`
      );
      const n = result.rows[0].n;
      if (n > 0) {
        found += n;
        console.log(`${table}.${column}: ${n} row${n === 1 ? "" : "s"}`);
      }
    }
    console.log(
      found === 0
        ? `No stored id has a space at either end (${columns.rows.length} columns checked).`
        : `${found} stored id${found === 1 ? "" : "s"} with a space at either end.`
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Id check failed:", error);
  process.exitCode = 1;
});
