import bcrypt from "bcryptjs";
import { confirmed as writeConfirmed, connect } from "./fk-shared";
import { BCRYPT_HASH_SQL, BCRYPT_ROUNDS } from "../services/passwordHash";

// Hashes every password still stored as plain text.
//
// The sign-in no longer accepts a plain-text password (Phase 0.1): a stored
// value that is not a bcrypt hash always fails. Run this once on the hosted
// database before going live (docs/GO-LIVE-CHECKLIST.md), so accounts made
// before passwords were hashed can still sign in with what they know.
//
// It looks at students, supervisors and coordinators, finds the rows whose
// password is not a whole bcrypt hash (services/passwordHash.ts, the same
// test the sign-in uses), and stores the bcrypt hash of that value instead,
// with the server's 12 rounds. It prints counts only, never an email, an ID
// or a password.
//
// Without --confirm it only counts and changes nothing.
//
//   npm run db:hash-legacy-passwords               (dry run)
//   npm run db:hash-legacy-passwords -- --confirm
//
// On the hosted database, through a tunnel (DEPLOY.md, "Running a data
// script on the hosted database"):
//
//   railway connect Postgres --tunnel-only
//   railway run --service Postgres npm run db:hash-legacy-passwords <port>
//   railway run --service Postgres npm run db:hash-legacy-passwords <port> confirm

const tables = [
  { table: "students", idColumn: "student_id" },
  { table: "supervisors", idColumn: "supervisor_id" },
  { table: "coordinators", idColumn: "coordinator_id" },
] as const;

async function main() {
  const confirmed = writeConfirmed();
  const client = await connect();
  let total = 0;
  try {
    if (!confirmed) await client.query("SET default_transaction_read_only = on");
    await client.query("BEGIN");
    for (const { table, idColumn } of tables) {
      const plainText = `FROM ${table} WHERE password IS NOT NULL AND password !~ $1`;
      // A dry run only counts: the passwords themselves are read only to hash them.
      const rows = confirmed
        ? (
            await client.query<{ id: string; password: string }>(
              `SELECT ${idColumn}::text AS id, password ${plainText} ORDER BY ${idColumn}`,
              [BCRYPT_HASH_SQL]
            )
          ).rows
        : [];
      const count = confirmed
        ? rows.length
        : (await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n ${plainText}`, [BCRYPT_HASH_SQL])).rows[0].n;
      let hashed = 0;
      if (confirmed) {
        for (const row of rows) {
          // Only if the value is still the one read, so a password changed
          // meanwhile is never overwritten.
          const result = await client.query(
            `UPDATE ${table} SET password = $1 WHERE ${idColumn}::text = $2 AND password = $3`,
            [await bcrypt.hash(String(row.password), BCRYPT_ROUNDS), row.id, row.password]
          );
          hashed += result.rowCount ?? 0;
        }
      }
      total += count;
      console.log(
        confirmed
          ? `${table}: ${hashed} of ${count} plain-text passwords hashed`
          : `${table}: ${count} plain-text passwords`
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  if (!confirmed) {
    console.log(
      total === 0
        ? "Nothing to do: every password is already hashed."
        : "Dry run: nothing was changed. Run again with --confirm to hash them."
    );
  } else {
    console.log("Done.");
  }
}

main().catch((error: unknown) => {
  // The message only: a database error can quote the row it failed on.
  console.error("Hashing legacy passwords failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
