import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { once } from "node:events";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Zip, ZipPassThrough } from "fflate";
import type { Pool } from "pg";
import { bucketSettings, fileStoreKind, localUploadDirectory } from "./privateFileStore";
import { phClock } from "./phTime";

/*
|--------------------------------------------------------------------------
| SCHEDULED BACKUPS
|--------------------------------------------------------------------------
|
| Iteration 15 (roadmap 8.6, workstream G). Two jobs, both writing an
| encrypted file to a private prefix of an R2 bucket and a row to
| backup_runs (migration 064) that the coordinator's status card shows:
|
|   database   nightly, 01:30 Philippine time, in a Railway cron service of
|              its own (scripts/backup-cron.ts): pg_dump -Fc over Railway's
|              private network.
|                <prefix>database/daily/YYYY-MM-DD.dump.age      every night
|                <prefix>database/monthly/YYYY-MM.dump.age       the 1st, a copy
|   uploads    weekly, by the backend itself while uploaded files are on its
|              volume (fileStoreKind() "disk"): every file, as one ZIP.
|                <prefix>uploads/weekly/YYYY-MM-DD.zip.age
|              Once the files are in a bucket, R2's own durability covers them
|              and this stops.
|
| ENCRYPTED before it leaves the server, with age (age-encryption, by age's
| author), to a PUBLIC key (BACKUP_AGE_RECIPIENT, "age1…"). The private half
| is kept offline by the project owner; nothing on Railway can decrypt a
| backup. Each file streams from pg_dump (or the ZIP) through the encryption
| into a multipart upload: nothing is held whole in memory or on disk.
|
| How long they are kept is the bucket's lifecycle rules, set once in
| Cloudflare (DEPLOY.md): database/daily/ 30 days, database/monthly/ 365
| days, uploads/weekly/ 35 days.
|
| SETTINGS (on the service that runs the job; none is ever shown or logged):
|   BACKUP_R2_ACCOUNT_ID, BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY,
|   BACKUP_R2_BUCKET            a bucket token of its own, for this bucket only
|   BACKUP_R2_PREFIX            default "backups/"
|   BACKUP_R2_ENDPOINT          only for another S3-compatible store (MinIO in development)
|   BACKUP_AGE_RECIPIENT        the age public key
|
*/

type Env = Record<string, string | undefined>;

export type BackupSettings = {
  bucket: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string };
  prefix: string;
  recipient: string;
};

const NAMES = ["BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_ACCESS_KEY_ID", "BACKUP_R2_SECRET_ACCESS_KEY", "BACKUP_R2_BUCKET", "BACKUP_AGE_RECIPIENT"];

/**
 * The backup settings: null when none is set (backups are not set up on this
 * service), a problem when they are set only in part or wrongly.
 */
export function backupSettings(env: Env = process.env): { settings: BackupSettings } | { problem: string } | null {
  const present = NAMES.filter((name) => (env[name] || "").trim());
  if (present.length === 0) return null;
  const missing = NAMES.filter((name) => !present.includes(name));
  if (missing.length > 0) return { problem: `Backups need all of ${NAMES.join(", ")}. Missing: ${missing.join(", ")}.` };
  const recipient = env.BACKUP_AGE_RECIPIENT!.trim();
  // An X25519 public key, or a post-quantum hybrid one ("age1pq1…").
  if (!/^age1[0-9a-z]{20,}$/.test(recipient)) {
    return { problem: "BACKUP_AGE_RECIPIENT is not an age public key (it starts with age1). Never put the private key (AGE-SECRET-KEY-…) here." };
  }
  const bucket = bucketSettings({
    R2_ACCOUNT_ID: env.BACKUP_R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.BACKUP_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.BACKUP_R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.BACKUP_R2_BUCKET,
    R2_ENDPOINT: env.BACKUP_R2_ENDPOINT,
  })!;
  let prefix = (env.BACKUP_R2_PREFIX ?? "backups/").trim().replace(/^\/+/, "");
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  if (!/^[A-Za-z0-9._\-/]*$/.test(prefix)) return { problem: "BACKUP_R2_PREFIX may only hold letters, digits, '.', '_', '-' and '/'." };
  return { settings: { bucket, prefix, recipient } };
}

/** Where each kind of backup goes in the bucket, by the Philippine date. */
export function backupKeys(prefix: string, now: Date = new Date()) {
  const { date } = phClock(now);
  return {
    daily: `${prefix}database/daily/${date}.dump.age`,
    // Kept on the 1st of the month, for a year.
    monthly: date.endsWith("-01") ? `${prefix}database/monthly/${date.slice(0, 7)}.dump.age` : null,
    uploads: `${prefix}uploads/weekly/${date}.zip.age`,
  };
}

/**
 * A failure's reason as it may be shown on the status card: one line, no
 * connection string, no key. The full error stays in the service's log.
 */
export function safeDetail(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://…")
    .replace(/https?:\/\/[^\s"']+/gi, "(address)")
    .replace(/AGE-SECRET-KEY-[0-9A-Z]+/gi, "(key)")
    .replace(/password=\S+/gi, "password=…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// age-encryption is an ES module; this file is loaded as CommonJS, so it is imported when needed.
type AgeModule = typeof import("age-encryption");
let ageModule: Promise<AgeModule> | null = null;
const age = () => (ageModule ??= import("age-encryption"));

/** The stream, encrypted to the recipient (age format, binary). */
export async function encryptStream(source: Readable, recipient: string): Promise<Readable> {
  const { Encrypter } = await age();
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const web = Readable.toWeb(source) as unknown as ReadableStream<Uint8Array>;
  const encrypted = await encrypter.encrypt(web);
  return Readable.fromWeb(encrypted as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
}

/** Decrypts with an identity (AGE-SECRET-KEY-…): for a restore, on the owner's own computer. */
export async function decryptStream(source: Readable, identity: string): Promise<Readable> {
  const { Decrypter } = await age();
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const web = Readable.toWeb(source) as unknown as ReadableStream<Uint8Array>;
  const plain = await decrypter.decrypt(web);
  return Readable.fromWeb(plain as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
}

export function backupClient(settings: BackupSettings): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: settings.bucket.endpoint,
    credentials: { accessKeyId: settings.bucket.accessKeyId, secretAccessKey: settings.bucket.secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** R2 asks every part but the last to be the same size. 16 MiB keeps memory small and parts few. */
export const PART_SIZE = 16 * 1024 * 1024;

/**
 * Uploads a stream to the bucket in equal parts as it arrives. `beforeComplete`
 * runs once the stream has ended and before the upload is made final: a
 * throw there (pg_dump exited with an error) abandons the upload, so a broken
 * file is never left looking like a backup.
 */
export async function uploadStream(
  client: S3Client,
  bucket: string,
  key: string,
  source: Readable,
  beforeComplete: () => Promise<void> = async () => {}
): Promise<{ bytes: number; sha256: string }> {
  const created = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: "application/octet-stream" })
  );
  const uploadId = created.UploadId!;
  const parts: { ETag: string; PartNumber: number }[] = [];
  const hash = createHash("sha256");
  let bytes = 0;
  let pending: Buffer[] = [];
  let pendingSize = 0;
  const sendPart = async (body: Buffer) => {
    const partNumber = parts.length + 1;
    const sent = await client.send(
      new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body })
    );
    parts.push({ ETag: sent.ETag!, PartNumber: partNumber });
  };
  try {
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      hash.update(buffer);
      bytes += buffer.length;
      pending.push(buffer);
      pendingSize += buffer.length;
      while (pendingSize >= PART_SIZE) {
        const all = Buffer.concat(pending);
        await sendPart(all.subarray(0, PART_SIZE));
        const rest = all.subarray(PART_SIZE);
        pending = rest.length > 0 ? [rest] : [];
        pendingSize = rest.length;
      }
    }
    if (pendingSize > 0 || parts.length === 0) await sendPart(Buffer.concat(pending));
    await beforeComplete();
    await client.send(
      new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } })
    );
    return { bytes, sha256: hash.digest("hex") };
  } catch (error) {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
    throw error;
  }
}

/** Copies one object to another key in the same bucket (the 1st of the month's dump to monthly/). */
export async function copyObject(client: S3Client, bucket: string, from: string, to: string): Promise<void> {
  await client.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${encodeURI(from)}`, Key: to }));
}

/*
| THE RECORD OF RUNS (backup_runs)
*/

export type BackupKind = "database" | "uploads" | "restore_drill";

export async function startRun(pool: Pick<Pool, "query">, kind: BackupKind): Promise<number> {
  const added = await pool.query<{ id: string }>(`INSERT INTO backup_runs (kind, status) VALUES ($1, 'running') RETURNING id`, [kind]);
  return Number(added.rows[0].id);
}

export async function finishRun(
  pool: Pick<Pool, "query">,
  id: number,
  outcome:
    | { status: "ok"; objectKey: string; sizeBytes: number; sha256: string; detail?: string }
    | { status: "failed"; detail: string }
): Promise<void> {
  if (outcome.status === "ok") {
    await pool.query(
      `UPDATE backup_runs SET status = 'ok', finished_at = NOW(), object_key = $2, size_bytes = $3, sha256 = $4, detail = $5 WHERE id = $1`,
      [id, outcome.objectKey, outcome.sizeBytes, outcome.sha256, outcome.detail ?? null]
    );
  } else {
    await pool.query(`UPDATE backup_runs SET status = 'failed', finished_at = NOW(), detail = $2 WHERE id = $1`, [id, outcome.detail]);
  }
}

/** A run still marked running after this long died without saying so. */
const STALE_RUNNING_HOURS = 3;
/** The nightly backup is missed when the last good one is older than this. */
const DATABASE_MISSED_HOURS = 26;
/** The weekly pack of uploads is missed when the last good one is older than this. */
const UPLOADS_MISSED_DAYS = 8;
/** A restore drill is due once a month. */
const DRILL_DUE_DAYS = 31;

type RunRow = {
  kind: BackupKind;
  status: "running" | "ok" | "failed";
  started_at: Date;
  finished_at: Date | null;
  object_key: string | null;
  size_bytes: string | null;
  detail: string | null;
  recorded_by: string | null;
};

/** What the status card says about backups. */
export async function backupStatus(pool: Pick<Pool, "query">, now: Date = new Date(), storeKind = fileStoreKind()) {
  const latest = await pool.query<RunRow & { rank: string; ok_rank: string }>(
    `SELECT * FROM (
       SELECT kind, status, started_at, finished_at, object_key, size_bytes, detail, recorded_by,
              ROW_NUMBER() OVER (PARTITION BY kind ORDER BY started_at DESC) AS rank,
              ROW_NUMBER() OVER (PARTITION BY kind, (status = 'ok') ORDER BY started_at DESC) AS ok_rank
       FROM backup_runs
     ) ranked
     WHERE rank = 1 OR (status = 'ok' AND ok_rank = 1)`
  );
  const lastRun = (kind: BackupKind) => latest.rows.find((row) => row.kind === kind && Number(row.rank) === 1) ?? null;
  const lastOk = (kind: BackupKind) => latest.rows.find((row) => row.kind === kind && row.status === "ok") ?? null;
  const hoursSince = (row: RunRow | null) => (row ? (now.getTime() - new Date(row.finished_at ?? row.started_at).getTime()) / 3_600_000 : Infinity);
  const describeRun = (row: RunRow | null) =>
    row && {
      started_at: row.started_at,
      finished_at: row.finished_at,
      // A run that never finished is shown as what it is.
      status: row.status === "running" && hoursSince(row) > STALE_RUNNING_HOURS ? "unfinished" : row.status,
      detail: row.detail,
    };
  const describeOk = (row: RunRow | null) =>
    row && { finished_at: row.finished_at, size_bytes: row.size_bytes === null ? null : Number(row.size_bytes), object_key: row.object_key };

  const uploadsNeeded = storeKind === "disk";
  const drill = lastOk("restore_drill");
  return {
    database: {
      last_ok: describeOk(lastOk("database")),
      last_run: describeRun(lastRun("database")),
      missed: hoursSince(lastOk("database")) > DATABASE_MISSED_HOURS,
    },
    uploads: {
      // Files in a bucket are covered by the bucket's own durability.
      needed: uploadsNeeded,
      last_ok: describeOk(lastOk("uploads")),
      last_run: describeRun(lastRun("uploads")),
      missed: uploadsNeeded && hoursSince(lastOk("uploads")) > UPLOADS_MISSED_DAYS * 24,
    },
    restore_drill: {
      last: drill && { at: drill.finished_at ?? drill.started_at, detail: drill.detail, recorded_by: drill.recorded_by },
      due: hoursSince(drill) > DRILL_DUE_DAYS * 24,
    },
  };
}

/*
| THE WEEKLY PACK OF UPLOADED FILES (in the backend, while they are on its volume)
*/

/** Between these Philippine times the pack may start: the quiet hours after the nightly database backup. */
export const UPLOADS_WINDOW = { from: "02:30", to: "05:00" } as const;
const LOCK_KEY = 7_031_015;

/** Every file under a folder, as paths relative to it, in a fixed order. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

/** The uploads folder as a ZIP stream, built file by file. */
export function zipFolder(root: string): { stream: Readable; files: number } {
  const names = listFiles(root);
  const out = new PassThrough();
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      out.destroy(error);
      return;
    }
    out.write(Buffer.from(chunk));
    if (final) out.end();
  });
  void (async () => {
    try {
      for (const name of names) {
        const entry = new ZipPassThrough(name);
        zip.add(entry);
        entry.push(await fs.promises.readFile(path.join(root, name)), true);
        if (out.writableNeedDrain) await once(out, "drain");
      }
      zip.end();
    } catch (error) {
      out.destroy(error as Error);
    }
  })();
  return { stream: out, files: names.length };
}

/** Packs the uploads folder, encrypts it and uploads it. Records the run. */
export async function packUploads(pool: Pick<Pool, "query">, settings: BackupSettings, runId: number, now: Date = new Date()): Promise<void> {
  const key = backupKeys(settings.prefix, now).uploads;
  try {
    const { stream, files } = zipFolder(localUploadDirectory());
    const encrypted = await encryptStream(stream, settings.recipient);
    const sent = await uploadStream(backupClient(settings), settings.bucket.bucket, key, encrypted);
    await finishRun(pool, runId, { status: "ok", objectKey: key, sizeBytes: sent.bytes, sha256: sent.sha256, detail: `${files} file${files === 1 ? "" : "s"}` });
    console.log(`Uploads backup: ${files} files packed to ${key} (${sent.bytes} bytes).`);
  } catch (error) {
    console.error("UPLOADS BACKUP ERROR:", error);
    await finishRun(pool, runId, { status: "failed", detail: safeDetail(error) }).catch(() => undefined);
  }
}

let packing = false;

/**
 * Starts the weekly pack when it is due: the files are on this server's
 * disk, backups are set up here, it is the quiet hours, and no good pack in
 * the last 7 days (nor one running). Safe to call as often as wanted and
 * from several servers at once. Returns at once; the pack runs on in the
 * background so the other scheduled jobs are not held up.
 */
export async function runUploadsPackIfDue(
  pool: Pool,
  options: { now?: Date; env?: Env; force?: boolean } = {}
): Promise<"started" | null> {
  const env = options.env ?? process.env;
  if (fileStoreKind() !== "disk" || packing) return null;
  const read = backupSettings(env);
  if (read === null || "problem" in read) return null;
  const now = options.now ?? new Date();
  const { time } = phClock(now);
  if (!options.force && (time < UPLOADS_WINDOW.from || time >= UPLOADS_WINDOW.to)) return null;

  const client = await pool.connect();
  let runId: number | null = null;
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ got: boolean }>(`SELECT pg_try_advisory_xact_lock($1) AS got`, [LOCK_KEY]);
    if (!locked.rows[0].got) {
      await client.query("ROLLBACK");
      return null;
    }
    const recent = await client.query(
      `SELECT 1 FROM backup_runs WHERE kind = 'uploads'
         AND ((status = 'ok' AND started_at > NOW() - INTERVAL '7 days')
           OR (status = 'running' AND started_at > NOW() - INTERVAL '${STALE_RUNNING_HOURS} hours'))
       LIMIT 1`
    );
    if (recent.rows.length > 0 && !options.force) {
      await client.query("ROLLBACK");
      return null;
    }
    runId = await startRun(client, "uploads");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("UPLOADS BACKUP ERROR:", error);
    return null;
  } finally {
    client.release();
  }
  packing = true;
  void packUploads(pool, read.settings, runId!, now).finally(() => {
    packing = false;
  });
  return "started";
}
