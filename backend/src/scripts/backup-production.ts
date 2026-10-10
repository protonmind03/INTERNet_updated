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
// in and no password appears on screen. The address the backend uses,
// postgres.railway.internal, only works inside Railway, so the database is
// reached through a tunnel (preferred: add `-- --host localhost --port
// <tunnel port>`, see DEPLOY.md), or through its public address if one has
// been switched on.
//
// The file goes in backend/backups/ (git-ignored). It holds personal data:
// keep a copy somewhere other than this computer, and never share it.

function backupProduction() {
  // --host and --port point at a tunnel opened with
  // `railway connect Postgres --tunnel-only`; without them the database's
  // public address is used, if it has one.
  //
  // The port may also be given bare (`... db:backup-production 61092`), and
  // that is the form the guide uses: PowerShell and `railway run` between
  // them drop the `--` that npm needs to pass named options through, so
  // `--host`/`--port` arrive here as two bare values. A bare number is the
  // tunnel's port; a bare address beside it is the host, else 127.0.0.1.
  const bare = process.argv.slice(2).filter((value) => !value.startsWith("--"));
  const barePort = option("--port") ? undefined : bare.find((value) => /^\d{2,5}$/.test(value));
  const bareHost = bare.find((value) => /^(localhost|\d{1,3}(\.\d{1,3}){3})$/.test(value));
  const host =
    option("--host") || (barePort ? bareHost || "127.0.0.1" : process.env.RAILWAY_TCP_PROXY_DOMAIN);
  const port = option("--port") || barePort || process.env.RAILWAY_TCP_PROXY_PORT;
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
      "This database has no public address, which is the safer setting. Reach it through a tunnel instead:\n" +
        "  1. In a second terminal, in this folder:  railway connect Postgres --tunnel-only\n" +
        "     Leave it running and note the port it listens on (the number after localhost:).\n" +
        "  2. Here:  railway run --service Postgres npm run db:backup-production <that port>\n" +
        "  3. Close the tunnel with Ctrl+C when the backup is done."
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
