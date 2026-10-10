import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

// Shared by fk-orphans.ts and fk-validate.ts. Foreign keys added as
// NOT VALID (migration 006 onwards) are enforced for new rows only; these
// scripts look at the rows that were already there.

export type PendingForeignKey = {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  orphans: number;
};

export async function connect(): Promise<Client> {
  const connectionString = process.env.DATABASE_PUBLIC_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_PUBLIC_URL is required. Configure it in backend/.env."
    );
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_PUBLIC_URL must be a valid PostgreSQL URL.");
  }
  const host = databaseUrl.hostname.replace(/^\[|\]$/g, "");
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(host);

  const client = new Client({
    connectionString,
    ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(
    `Database: ${decodeURIComponent(databaseUrl.pathname.slice(1))} on ${host}`
  );
  return client;
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// Every foreign key in the public schema that is not yet validated, with
// the number of rows that point at a parent row that does not exist.
export async function pendingForeignKeys(
  client: Client
): Promise<PendingForeignKey[]> {
  const constraints = await client.query<{
    name: string;
    table: string;
    columns: string[];
    ref_table: string;
    ref_columns: string[];
  }>(`
    SELECT
      c.conname AS name,
      child.relname AS "table",
      ARRAY(
        SELECT a.attname::text
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, position)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ORDER BY k.position
      ) AS columns,
      parent.relname AS ref_table,
      ARRAY(
        SELECT a.attname::text
        FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, position)
        JOIN pg_attribute a
          ON a.attrelid = c.confrelid AND a.attnum = k.attnum
        ORDER BY k.position
      ) AS ref_columns
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    WHERE c.contype = 'f'
      AND NOT c.convalidated
      AND n.nspname = 'public'
    ORDER BY child.relname, c.conname
  `);

  const pending: PendingForeignKey[] = [];
  for (const row of constraints.rows) {
    // A row with a NULL in the key is not checked by the constraint
    // (MATCH SIMPLE), so it is not an orphan.
    const notNull = row.columns
      .map((column) => `child.${quote(column)} IS NOT NULL`)
      .join(" AND ");
    const match = row.columns
      .map(
        (column, index) =>
          `parent.${quote(row.ref_columns[index])} = child.${quote(column)}`
      )
      .join(" AND ");
    const count = await client.query<{ orphans: string }>(`
      SELECT COUNT(*) AS orphans
      FROM ${quote(row.table)} child
      WHERE ${notNull}
        AND NOT EXISTS (
          SELECT 1 FROM ${quote(row.ref_table)} parent WHERE ${match}
        )
    `);
    pending.push({
      name: row.name,
      table: row.table,
      columns: row.columns,
      refTable: row.ref_table,
      refColumns: row.ref_columns,
      orphans: Number(count.rows[0].orphans),
    });
  }
  return pending;
}

export function printReport(pending: PendingForeignKey[]) {
  if (pending.length === 0) {
    console.log("Every foreign key is already validated.");
    return;
  }
  console.table(
    pending.map((fk) => ({
      constraint: fk.name,
      column: `${fk.table}.${fk.columns.join(",")}`,
      references: `${fk.refTable}.${fk.refColumns.join(",")}`,
      orphans: fk.orphans,
    }))
  );
}

export function validateStatement(fk: PendingForeignKey): string {
  return `ALTER TABLE ${quote(fk.table)} VALIDATE CONSTRAINT ${quote(fk.name)}`;
}
