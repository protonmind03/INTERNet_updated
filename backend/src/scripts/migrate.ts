import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

async function migrate() {
  const connectionString = process.env.DATABASE_PUBLIC_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_PUBLIC_URL is required. Configure it in backend/.env."
    );
  }
  if (
    /USER:PASSWORD@HOST:PORT\/DATABASE|replace-with/i.test(
      connectionString
    )
  ) {
    throw new Error(
      "DATABASE_PUBLIC_URL still contains template values. Configure a real local database URL in backend/.env."
    );
  }
  let parsedConnectionString: URL;
  try {
    parsedConnectionString = new URL(connectionString);
  } catch {
    throw new Error(
      "DATABASE_PUBLIC_URL must be a valid PostgreSQL URL. Keep credentials in backend/.env."
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(
      parsedConnectionString.protocol
    ) ||
    !parsedConnectionString.hostname ||
    parsedConnectionString.pathname.length < 2
  ) {
    throw new Error(
      "DATABASE_PUBLIC_URL must include a PostgreSQL scheme, host, and database name."
    );
  }
  const databaseHost = parsedConnectionString.hostname.replace(
    /^\[|\]$/g,
    ""
  );
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(
    databaseHost
  );

  const migrationsDirectory = path.resolve(
    __dirname,
    "../../migrations"
  );
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}.`);
  }

  const client = new Client({
    connectionString,
    ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    // Track applied migrations so each file runs exactly once. Re-running
    // seed statements (for example the default coordinator account or the
    // initial OJT requirements) would otherwise resurrect records that an
    // administrator had deliberately changed or removed.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const appliedResult = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    for (const file of migrationFiles) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }
      const sql = await fs.readFile(
        path.join(migrationsDirectory, file),
        "utf8"
      );

      console.log(`Applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed.`, { cause: error });
      }
      console.log(`Applied ${file}.`);
    }
  } finally {
    await client.end();
  }

  console.log("Database migrations completed.");
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
