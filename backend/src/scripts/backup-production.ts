import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findPgDump, option, stamp } from "./pg-tools";

// Backs up the HOSTED database to a file on this computer. It only reads.
// Run by the project owner, through the Railway CLI, against the Postgres
// service, from the backend folder:
//
//   railway run --service Postgres npm run db:backup-production
//
// `railway run` supplies the database's own settings, so nothing is typed
// in and no password appears on screen. The database is reached through its
// public address (Railway's "TCP proxy"); the address the backend uses,
// postgres.railway.internal, only works inside Railway.
//
// The file goes in backend/backups/ (git-ignored). It holds personal data:
// keep a copy somewhere other than this computer, and never share it.

function backupProduction() {
  const host = process.env.RAILWAY_TCP_PROXY_DOMAIN;
  const port = process.env.RAILWAY_TCP_PROXY_PORT;
  const user = process.env.PGUSER;
  const database = process.env.PGDATABASE;
  const password = process.env.PGPASSWORD;

  if (!user || !database || !password) {
    throw new Error(
      "The database's settings were not supplied. Run this through the Railway CLI, against the Postgres service:\n" +
        "  railway run --service Postgres npm run db:backup-production\n" +
        "If the service has another name, `railway service` lists them."
    );
  }
  if (!host || !port) {
    throw new Error(
      "This database has no public address, so it cannot be reached from this computer.\n" +
        "In Railway: Postgres service > Settings > Networking > add a TCP proxy for port 5432, then run this again."
    );
  }

  const outDirectory = path.resolve(option("--out") || path.join(process.cwd(), "backups"));
  fs.mkdirSync(outDirectory, { recursive: true });
  const dumpFile = path.join(outDirectory, `internet-production-${stamp()}.dump`);

  console.log(`Backing up "${database}" from ${host}:${port} (read-only)...`);
  const result = spawnSync(
    findPgDump(),
    [
      "--host", host,
      "--port", port,
      "--username", user,
      "--format", "custom",
      "--no-owner",
      "--no-privileges",
      "--file", dumpFile,
      database,
    ],
    // The password travels in the environment, not on the command line.
    { stdio: "inherit", env: { ...process.env, PGPASSWORD: password, PGHOST: host, PGPORT: port } }
  );

  const size = fs.existsSync(dumpFile) ? fs.statSync(dumpFile).size : 0;
  if (result.error || result.status !== 0 || size === 0) {
    if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
    throw new Error(
      result.error
        ? "pg_dump could not be started. Install the PostgreSQL client tools, or pass -- --pg-bin <folder>."
        : "pg_dump did not finish (its message is above). No backup file was kept."
    );
  }

  console.log(`\nDone: ${dumpFile}`);
  console.log(`Size: ${(size / 1024).toFixed(0)} kB`);
  console.log("Copy this file somewhere other than this computer. It holds personal data.");
}

try {
  backupProduction();
} catch (error: unknown) {
  console.error(`\nBackup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
