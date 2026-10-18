import { spawn } from "node:child_process";
import { Pool } from "pg";
import {
  backupClient,
  backupKeys,
  backupSettings,
  copyObject,
  encryptStream,
  finishRun,
  safeDetail,
  startRun,
  uploadStream,
} from "../services/backups";
import { findPgDump } from "./pg-tools";

// THE NIGHTLY DATABASE BACKUP. Run by a Railway cron service of its own
// (backend/railway.backup.json: 01:30 Philippine time), never by the API.
// DEPLOY.md, "Scheduled backups", has the setup.
//
//   npm run backup:database
//
// pg_dump -Fc of the database over Railway's private network
// (BACKUP_DATABASE_URL, set to ${{Postgres.DATABASE_URL}}), encrypted on the
// way out to the age public key BACKUP_AGE_RECIPIENT, streamed to
// <prefix>database/daily/<date>.dump.age in the backup bucket, and on the 1st
// of the month copied to database/monthly/. The run is written to
// backup_runs (migration 064), so the coordinator's status card shows it.
// It exits 0 when the backup is safely in the bucket, 1 otherwise, so
// Railway marks a failed run.
//
// Nothing secret is printed: not the connection string, not the keys.

async function main(): Promise<number> {
  const databaseUrl = (process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("BACKUP_DATABASE_URL is not set. On Railway set it to ${{Postgres.DATABASE_URL}}.");
    return 1;
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    console.error("BACKUP_DATABASE_URL is not a PostgreSQL address.");
    return 1;
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const pool = new Pool({ connectionString: databaseUrl, ssl: local ? false : { rejectUnauthorized: false }, max: 2 });

  let runId: number | null = null;
  try {
    runId = await startRun(pool, "database");
    const read = backupSettings();
    if (read === null) throw new Error("Backups are not set up on this service: the BACKUP_R2_* settings and BACKUP_AGE_RECIPIENT are missing.");
    if ("problem" in read) throw new Error(read.problem);
    const { settings } = read;
    const keys = backupKeys(settings.prefix);

    // The connection goes to pg_dump in its environment, not on its command line.
    const dump = spawn(findPgDump(), ["--format=custom", "--no-owner", "--no-privileges", "--compress=6"], {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
        PGSSLMODE: local ? "disable" : "prefer",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    dump.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    const exited = new Promise<number>((resolve, reject) => {
      dump.on("error", reject);
      dump.on("close", (code) => resolve(code ?? 1));
    });

    const client = backupClient(settings);
    const encrypted = await encryptStream(dump.stdout, settings.recipient);
    const sent = await uploadStream(client, settings.bucket.bucket, keys.daily, encrypted, async () => {
      // Made final only when pg_dump says the dump is whole.
      const code = await exited;
      if (code !== 0) throw new Error(`pg_dump stopped with code ${code}: ${stderr.trim() || "no reason given"}`);
    });
    if (keys.monthly) await copyObject(client, settings.bucket.bucket, keys.daily, keys.monthly);

    await finishRun(pool, runId, {
      status: "ok",
      objectKey: keys.daily,
      sizeBytes: sent.bytes,
      sha256: sent.sha256,
      detail: keys.monthly ? "Also kept as this month's copy." : undefined,
    });
    console.log(`Database backup: ${keys.daily}, ${sent.bytes} bytes, sha256 ${sent.sha256}${keys.monthly ? `, and ${keys.monthly}` : ""}.`);
    return 0;
  } catch (error) {
    console.error("DATABASE BACKUP ERROR:", safeDetail(error));
    if (runId !== null) await finishRun(pool, runId, { status: "failed", detail: safeDetail(error) }).catch(() => undefined);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main().then((code) => process.exit(code));
