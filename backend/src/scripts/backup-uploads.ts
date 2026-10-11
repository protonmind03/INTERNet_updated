import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { option, stamp } from "./pg-tools";

// Packs every uploaded file (time-in photos, documents, task files) into
// one archive, so backing them up is the download of a single file.
//
// The uploads are on the server's own disk, so this is run ON THE SERVER,
// by the project owner, in the backend service's shell:
//
//   railway ssh
//   npm run uploads:backup
//
// It only reads the uploads. The archive is written beside the uploads
// folder (on the same volume, so it survives until it is downloaded) and
// its name, size and file count are printed. Download it, then delete it
// from the server so it does not use up the volume: DEPLOY.md has the
// steps. `--out <folder>` writes it somewhere else.
//
// The archive holds personal data, photos of faces among it: keep it
// somewhere other than this computer, and never share it.

function countFiles(directory: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const inner = countFiles(full);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += fs.statSync(full).size;
    }
  }
  return { files, bytes };
}

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function backupUploads() {
  // The same folder the server stores uploads in (services/privateFileStore.ts).
  const uploads = path.resolve(
    process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "private-uploads")
  );
  if (!fs.existsSync(uploads) || !fs.statSync(uploads).isDirectory()) {
    throw new Error(
      `There is no uploads folder at ${uploads}. On the server it is the folder PRIVATE_UPLOAD_DIR names; run this in the backend service's shell.`
    );
  }

  const { files, bytes } = countFiles(uploads);
  console.log(`Uploads folder: ${uploads}`);
  console.log(`${files} file${files === 1 ? "" : "s"}, ${megabytes(bytes)}.`);
  if (files === 0) {
    console.log("Nothing has been uploaded yet, so there is nothing to back up.");
    return;
  }

  const outDirectory = path.resolve(option("--out") || path.dirname(uploads));
  fs.mkdirSync(outDirectory, { recursive: true });
  const archive = path.join(outDirectory, `internet-uploads-${stamp()}.tgz`);

  // Packed relative to the folder's parent, so the archive unpacks to one
  // folder with the same name. `--force-local` is not used: it is not
  // understood by every tar, and no path here has a colon on the server.
  const result = spawnSync(
    "tar",
    ["-czf", archive, "-C", path.dirname(uploads), path.basename(uploads)],
    { stdio: "inherit" }
  );
  if (result.error || result.status !== 0) {
    fs.rmSync(archive, { force: true });
    throw new Error(
      result.error
        ? `The archive could not be made: the "tar" program could not be run (${result.error.message}).`
        : `The archive could not be made: tar ended with status ${result.status}.`
    );
  }

  console.log(`Archive: ${archive}`);
  console.log(`Size: ${megabytes(fs.statSync(archive).size)}, holding ${files} file${files === 1 ? "" : "s"}.`);
  console.log("Download this one file, check it opens, then delete it from the server.");
}

try {
  backupUploads();
} catch (error) {
  console.error("Upload backup failed. Nothing was changed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
