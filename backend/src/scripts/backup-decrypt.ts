import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { decryptStream } from "../services/backups";

// Opens a backup downloaded from the bucket, on the owner's own computer, for
// a restore or the monthly restore drill (DEPLOY.md, "Restore drill"):
//
//   npm run backup:decrypt -- <file.dump.age> <file holding the private key>
//
// The private key is read from a file (one line, AGE-SECRET-KEY-…), never
// typed on the command line, where it would stay in the shell's history.
// Writes the file beside it without ".age": a pg_restore custom-format dump,
// or a ZIP of the uploaded files. Both hold personal data: delete them when
// the restore is done.

async function main(): Promise<number> {
  const [input, keyFile] = process.argv.slice(2).filter((value) => value !== "--");
  if (!input || !keyFile) {
    console.error("Usage: npm run backup:decrypt -- <file.age> <file holding the private key>");
    return 1;
  }
  if (!input.endsWith(".age")) {
    console.error("That is not an encrypted backup (its name does not end in .age).");
    return 1;
  }
  const identity = fs
    .readFileSync(keyFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("AGE-SECRET-KEY-"));
  if (!identity) {
    console.error("No private key (a line starting AGE-SECRET-KEY-) in that file.");
    return 1;
  }
  const output = input.slice(0, -".age".length);
  if (fs.existsSync(output)) {
    console.error(`${path.basename(output)} is already there. Move it away first.`);
    return 1;
  }
  try {
    const plain = await decryptStream(fs.createReadStream(input), identity);
    await pipeline(plain, fs.createWriteStream(output));
  } catch (error) {
    fs.rmSync(output, { force: true });
    console.error(`It could not be opened: ${error instanceof Error ? error.message : String(error)}. Is it the right private key?`);
    return 1;
  }
  console.log(`Opened: ${output} (${fs.statSync(output).size} bytes).`);
  return 0;
}

void main().then((code) => process.exit(code));
