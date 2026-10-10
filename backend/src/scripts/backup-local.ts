import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

// Backs up the LOCAL database and the local upload folder. It refuses any
// database that is not on this machine: production backups are taken by the
// project owner with the steps in DEPLOY.md.
//
//   npm run db:backup-local
//   npm run db:backup-local -- --out D:\backups --pg-bin "C:\Program Files\PostgreSQL\18\bin"

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function findPgDump(): string {
  const executable = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  const given = option("--pg-bin");
  if (given) {
    const candidate = path.join(given, executable);
    if (!fs.existsSync(candidate)) {
      throw new Error(`No ${executable} in ${given}.`);
    }
    return candidate;
  }

  // The Windows installer does not add PostgreSQL to PATH, so look in its
  // usual folder and take the newest version found.
  if (process.platform === "win32") {
    const root = path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "PostgreSQL"
    );
    if (fs.existsSync(root)) {
      const versions = fs
        .readdirSync(root)
        .filter((name) => /^\d+$/.test(name))
        .sort((left, right) => Number(right) - Number(left));
      for (const version of versions) {
        const candidate = path.join(root, version, "bin", executable);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return executable;
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function backupLocal() {
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
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(host)
  ) {
    throw new Error(
      "This script only backs up a database on this machine. For production, follow the backup steps in DEPLOY.md."
    );
  }

  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!database) {
    throw new Error("DATABASE_PUBLIC_URL must name a database.");
  }

  const outDirectory = path.resolve(
    option("--out") || path.join(process.cwd(), "backups")
  );
  fs.mkdirSync(outDirectory, { recursive: true });

  const label = stamp();
  const dumpFile = path.join(outDirectory, `${database}-${label}.dump`);

  // The password goes through the environment, not the command line, so it
  // does not show up in the process list.
  const result = spawnSync(
    findPgDump(),
    [
      "--host", host,
      "--port", databaseUrl.port || "5432",
      "--username", decodeURIComponent(databaseUrl.username || "postgres"),
      "--format", "custom",
      "--no-owner",
      "--no-privileges",
      "--file", dumpFile,
      database,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(databaseUrl.password),
      },
    }
  );

  if (result.error) {
    throw new Error(
      "pg_dump could not be started. Install the PostgreSQL client tools or pass --pg-bin <folder>.",
      { cause: result.error }
    );
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump failed with exit code ${result.status}.`);
  }
  console.log(`Database saved to ${dumpFile}`);

  // Same default as services/privateFileStore.ts.
  const uploadDirectory = path.resolve(
    process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "private-uploads")
  );
  if (fs.existsSync(uploadDirectory)) {
    const uploadCopy = path.join(outDirectory, `private-uploads-${label}`);
    fs.cpSync(uploadDirectory, uploadCopy, { recursive: true });
    console.log(
      `Uploads (${fs.readdirSync(uploadCopy).length} files) copied to ${uploadCopy}`
    );
  } else {
    console.log(`No upload folder at ${uploadDirectory}; nothing to copy.`);
  }
}

try {
  backupLocal();
} catch (error: unknown) {
  console.error("Local backup failed:", error);
  process.exitCode = 1;
}
