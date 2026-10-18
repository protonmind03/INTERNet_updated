import { Pool } from "pg";
import { backupSettings, packUploads, startRun } from "../services/backups";
import { fileStoreKind } from "../services/privateFileStore";

// Packs the uploaded files to the backup bucket now, instead of waiting for
// the weekly run (services/backups.ts). Run in the backend service's shell
// (`railway ssh`), where the uploads volume is:
//
//   npm run backup:uploads-now
//
// The run is recorded in backup_runs like the weekly one.

async function main(): Promise<number> {
  if (fileStoreKind() !== "disk") {
    console.log("Uploaded files are kept in object storage, not on this server's disk: there is nothing to pack.");
    return 0;
  }
  const read = backupSettings();
  if (read === null) {
    console.error("Backups are not set up on this service: the BACKUP_R2_* settings and BACKUP_AGE_RECIPIENT are missing.");
    return 1;
  }
  if ("problem" in read) {
    console.error(read.problem);
    return 1;
  }
  const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || "";
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, ssl: local ? false : { rejectUnauthorized: false }, max: 2 });
  try {
    const runId = await startRun(pool, "uploads");
    await packUploads(pool, read.settings, runId);
    const row = await pool.query<{ status: string; detail: string | null }>(`SELECT status, detail FROM backup_runs WHERE id = $1`, [runId]);
    return row.rows[0]?.status === "ok" ? 0 : 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main().then((code) => process.exit(code));
