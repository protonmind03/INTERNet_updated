// Serves a production build of my-pwa the way Vercel does, for the Lighthouse and axe runs:
// the files in dist/, the headers in my-pwa/vercel.json, every path that is not a file
// answered with index.html, and text sent Brotli-compressed when the browser asks for it.
// No cache headers beyond vercel.json's, as in the baseline.
//
//   DIST=../../../my-pwa/dist PORT=5175 API_ORIGIN=http://127.0.0.1:5002 node serve-like-vercel.mjs
//
// Iteration 17. The Iteration 0 baseline was served the same way by a script that was not
// kept; this one does the same. One difference is needed today: the content security policy
// is now enforced (it was report-only on 16 October), and it names only the hosted APIs, so
// API_ORIGIN, the local API, is added to connect-src. On Vercel the site's own API is named there.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.DIST || path.join(here, "..", "..", "..", "my-pwa", "dist"));
const port = Number(process.env.PORT || 5175);
const apiOrigin = process.env.API_ORIGIN || "http://127.0.0.1:5002";
const vercel = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "..", "my-pwa", "vercel.json"), "utf8"));
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error(`No build in ${dist}.`);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".task": "application/octet-stream", ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json|wasm)|image\/svg)/;

/** vercel.json's header rules for a path: "/(.*)" for every path, otherwise an exact path. */
function headersFor(urlPath) {
  const out = {};
  for (const rule of vercel.headers ?? []) {
    const matches = rule.source === "/(.*)" || rule.source === urlPath;
    if (!matches) continue;
    for (const { key, value } of rule.headers) out[key] = value;
  }
  if (out["Content-Security-Policy"]) {
    out["Content-Security-Policy"] = out["Content-Security-Policy"].replace(/connect-src ([^;]*)/, `connect-src $1 ${apiOrigin}`);
  }
  return out;
}

const compressed = new Map();
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, urlPath);
  // Inside dist only; a path that is not a file is the app's own route.
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  let body = fs.readFileSync(file);
  const headers = { ...headersFor(urlPath), "Content-Type": type, Vary: "Accept-Encoding" };
  if (COMPRESSIBLE.test(type) && /\bbr\b/.test(String(req.headers["accept-encoding"] || ""))) {
    if (!compressed.has(file)) compressed.set(file, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
    body = compressed.get(file);
    headers["Content-Encoding"] = "br";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
});
server.listen(port, "localhost", () => console.log(`Serving ${dist} like Vercel on http://localhost:${port} (API ${apiOrigin})`));
