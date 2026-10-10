import fs from "node:fs";
import path from "node:path";

// Shared by the backup scripts.

export function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Where pg_dump is: --pg-bin if given, PostgreSQL's usual Windows folder, or PATH. */
export function findPgDump(): string {
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

/** "20261010-170530": the moment a backup was taken, for its file name. */
export function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}
