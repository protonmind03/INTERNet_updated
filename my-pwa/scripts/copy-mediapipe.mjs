// Copies the face-tracking runtime out of node_modules into public/, so the
// app serves it itself instead of fetching it from a third-party CDN each
// time a student times in. Runs before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe", "wasm");

if (!existsSync(source)) {
  console.error("copy-mediapipe: @mediapipe/tasks-vision is not installed. Run npm install.");
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("copy-mediapipe: face-tracking runtime copied to public/mediapipe/wasm");
