import fs from "node:fs";
import path from "node:path";
import {
  currentRemoteStore,
  fileStoreKind,
  isStoredFileName,
  localUploadDirectory,
} from "../services/privateFileStore";

// Copies the files uploaded before object storage was switched on from the
// server's disk into the bucket.
//
// It is optional. After the switch the server still finds an older file on
// the disk, so nothing breaks if this is never run. Run it when you want
// every file in the one durable place, for example before retiring the
// volume.
//
// The older files are on the server's own disk, so this is run ON THE
// SERVER, by the project owner, in the backend service's shell:
//
//   railway ssh
//   npm run uploads:copy-to-bucket
//
// Like that, it only looks: it counts the files on the disk and how many
// are already in the bucket, and changes nothing. To copy the rest:
//
//   npm run uploads:copy-to-bucket -- --confirm
//
// A file already in the bucket is left alone. Nothing is ever deleted from
// the disk: the copies there stay until you remove the volume yourself.
// It can be run again at any time; it picks up where it stopped.

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function copyUploads() {
  const write = process.argv.includes("--confirm") || process.argv.includes("confirm");
  const store = currentRemoteStore();
  if (!store) {
    throw new Error(
      "No object storage is configured (the four R2_* settings, or Azure), so there is nowhere to copy to."
    );
  }
  const folder = localUploadDirectory();
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.log(`There is no uploads folder at ${folder}, so there is nothing to copy.`);
    return;
  }
  const names = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isStoredFileName(entry.name))
    .map((entry) => entry.name);
  console.log(`Uploads folder: ${folder}`);
  console.log(`${names.length} file${names.length === 1 ? "" : "s"} on the disk. Files go to: ${fileStoreKind()}.`);

  let already = 0;
  let copied = 0;
  let failed = 0;
  for (const name of names) {
    try {
      if (await store.read(name)) {
        already += 1;
        continue;
      }
      if (!write) continue;
      const data = fs.readFileSync(path.join(folder, name));
      await store.save(name, data, TYPES[path.extname(name).toLowerCase()] || "application/octet-stream");
      // Read back before it is counted: a copy that cannot be read is not a copy.
      const back = await store.read(name);
      if (!back || !back.buffer.equals(data)) throw new Error("the copy read back differently");
      copied += 1;
    } catch (error) {
      failed += 1;
      // The file's stored name only: it identifies nobody.
      console.error(`Could not copy ${name}: ${error instanceof Error ? error.message : "error"}`);
    }
  }

  const waiting = names.length - already - copied - failed;
  console.log(`${already} already in the bucket.`);
  if (write) {
    console.log(`${copied} copied now.${failed > 0 ? ` ${failed} could not be copied; run this again.` : ""}`);
  } else {
    console.log(
      waiting > 0
        ? `${waiting} would be copied. Nothing was changed. To copy them: npm run uploads:copy-to-bucket -- --confirm`
        : "Nothing is left to copy."
    );
  }
  if (failed > 0) process.exitCode = 1;
}

copyUploads().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
