// Checks the built app is still an installable, offline-capable PWA.
//
//   npm run build && npm run check:pwa        (CI runs this after every build)
//   node scripts/check-pwa.mjs path/to/dist   (another output folder)
//
// It fails (exit 1) when:
// - the manifest lacks a field an install needs, or an icon size (192 and
//   512, as "any" and as "maskable"), or a listed icon or screenshot is not
//   in the output or is not the size it says;
// - the service worker is missing, is the emergency kill switch, or does
//   not keep app.html, index.html and offline.html for offline use;
// - offline.html is missing;
// - app.html (the app; index.html before Iteration 23) does not link the
//   manifest, the theme colour, the Home Screen icon (180 x 180) or
//   lang="en-PH";
// - Iteration 23: one of the three role apps' manifests
//   (manifest-{student,supervisor,coordinator}.webmanifest) fails the same
//   checks, or two manifests share an id; the landing page (index.html) has
//   no lang, theme colour or Home Screen icon, loads the app's script, or
//   its script is over 90 kB compressed;
// - an iPhone start-up image it names is missing or not the size its
//   media query asks for, or a current iPhone size has none
//   (scripts/make-startup-images.mjs makes them).
//
// Iteration 14 (roadmap 8.1, workstream A). No packages: PNG sizes are read
// from the file's own header.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "..", "dist"));
const problems = [];
const passed = [];
const check = (ok, what, problem) => (ok ? passed.push(what) : problems.push(problem ?? what));

/** Width and height of a PNG, from its IHDR chunk; null when it is not a PNG. */
export function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const inDist = (url) => path.join(dist, url.replace(/^\//, "").split("?")[0]);
const exists = (url) => fs.existsSync(inDist(url));

/** Checks a PNG named by a URL is in the output and is `width` x `height`. */
function pngIs(url, width, height, what) {
  if (!exists(url)) return check(false, what, `${what}: ${url} is not in the build output.`);
  const size = pngSize(fs.readFileSync(inDist(url)));
  check(
    size !== null && size.width === width && size.height === height,
    `${what}: ${url} is ${width}x${height}`,
    `${what}: ${url} should be ${width}x${height} but is ${size ? `${size.width}x${size.height}` : "not a PNG"}.`
  );
}

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error(`No build in ${dist}. Run "npm run build" first.`);
  process.exit(1);
}

// Iteration 23: the app is app.html; index.html is the landing page.
const appPage = fs.existsSync(path.join(dist, "app.html")) ? "app.html" : "index.html";
const html = fs.readFileSync(path.join(dist, appPage), "utf8");

// THE MANIFESTS: the app's own, and each role app's (Iteration 23).
const manifestHref = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/)?.[1] ?? null;
check(Boolean(manifestHref), `${appPage} links the manifest`, `${appPage} has no <link rel="manifest">.`);
const manifestUrls = [manifestHref, ...(appPage === "app.html" ? ["/manifest-student.webmanifest", "/manifest-supervisor.webmanifest", "/manifest-coordinator.webmanifest"] : [])].filter(Boolean);
const ids = new Map();
for (const url of manifestUrls) checkManifest(url);

function checkManifest(url) {
  let manifest = null;
  if (!exists(url)) return problems.push(`The manifest ${url} is not in the build output.`);
  try {
    manifest = JSON.parse(fs.readFileSync(inDist(url), "utf8"));
  } catch (error) {
    return problems.push(`The manifest ${url} is not valid JSON: ${error.message}`);
  }
  const problemsBefore = problems.length;
  checkOneManifest(manifest, url);
  if (problems.length === problemsBefore) passed.push(`${url} is complete`);
  const id = new URL(manifest.id ?? manifest.start_url ?? "/", "https://x").pathname;
  check(!ids.has(id), `${url} has its own id`, `${url} has the id "${id}", which ${ids.get(id)} has too.`);
  ids.set(id, url);
  const scope = new URL(manifest.scope ?? "/", "https://x").pathname;
  const start = new URL(manifest.start_url ?? "/", "https://x").pathname;
  check(start.startsWith(scope), `${url} starts inside its scope`, `${url} starts at ${start}, outside its scope ${scope}.`);
}

function checkOneManifest(manifest, url) {
  for (const field of ["id", "name", "short_name", "start_url", "scope", "display", "background_color", "theme_color", "lang", "icons"]) {
    check(manifest[field] !== undefined && manifest[field] !== "", `${url} has ${field}`, `${url} has no "${field}".`);
  }
  check(["standalone", "fullscreen", "minimal-ui"].includes(manifest.display), "manifest display opens as an app", `The manifest's display "${manifest.display}" does not open as an app.`);
  check(manifest.lang === "en-PH", "manifest lang is en-PH", `The manifest's lang is "${manifest.lang}", not "en-PH".`);
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const purpose of ["any", "maskable"]) {
    for (const side of [192, 512]) {
      const icon = icons.find(
        (item) => item.sizes === `${side}x${side}` && (item.purpose ?? "any").split(/\s+/).includes(purpose) && item.type === "image/png"
      );
      if (!icon) problems.push(`${url} has no ${side}x${side} PNG icon for "${purpose}".`);
      else pngIs(icon.src, side, side, `Icon ${side}x${side} (${purpose})`);
    }
  }
  for (const icon of icons) {
    if (icon.type === "image/png" && /^\d+x\d+$/.test(icon.sizes)) {
      const [w, h] = icon.sizes.split("x").map(Number);
      pngIs(icon.src, w, h, "Manifest icon");
    } else {
      check(exists(icon.src), `Manifest icon ${icon.src} is there`, `The manifest's icon ${icon.src} is not in the build output.`);
    }
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    for (const icon of shortcut.icons ?? []) {
      check(exists(icon.src), `Shortcut icon ${icon.src} is there`, `The shortcut "${shortcut.name}" names ${icon.src}, which is not in the build output.`);
    }
  }
  for (const shot of manifest.screenshots ?? []) {
    const [w, h] = String(shot.sizes).split("x").map(Number);
    pngIs(shot.src, w, h, "Screenshot");
  }
}

// THE PAGES: the app, and (Iteration 23) the landing page.
function checkPage(page, source) {
  check(/<html[^>]+lang="en-PH"/.test(source), `${page} lang is en-PH`, `${page} is not <html lang="en-PH">.`);
  check(/<meta[^>]+name="theme-color"/.test(source), `${page} has a theme colour`, `${page} has no <meta name="theme-color">.`);
  const touchIcon = source.match(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/)?.[1];
  if (!touchIcon) problems.push(`${page} has no <link rel="apple-touch-icon">.`);
  else pngIs(touchIcon, 180, 180, `${page} Home Screen icon`);
}
checkPage(appPage, html);
if (appPage === "app.html") {
  const landing = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  checkPage("index.html", landing);
  check(landing.includes('id="doors"'), "the landing page is rendered into index.html", "index.html has no rendered landing page (no #doors): the build did not pre-render it.");
  // Its own script and what that script imports at once; later imports (the QR code) are not counted.
  const entry = landing.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  const seen = new Set();
  const walk = (url) => {
    if (seen.has(url) || !exists(url)) return;
    seen.add(url);
    const code = fs.readFileSync(inDist(url), "utf8");
    for (const [, next] of code.matchAll(/(?:^|[;\s])import\s*(?:[^"'()]*?from\s*)?["'](\.\/[^"']+)["']/g)) walk(path.posix.join(path.posix.dirname(url), next));
  };
  if (entry) walk(entry);
  for (const [, href] of landing.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) walk(href);
  const gz = [...seen].reduce((sum, url) => sum + zlib.gzipSync(fs.readFileSync(inDist(url))).length, 0);
  check(Boolean(entry) && gz < 90 * 1024, `the landing page's script is ${(gz / 1024).toFixed(1)} kB compressed (under 90)`, `The landing page's script is ${(gz / 1024).toFixed(1)} kB compressed; the budget is 90 kB.`);
  const appEntry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  check(!appEntry || !seen.has(appEntry), "the landing page does not load the app", "The landing page loads the app's own script.");
}

// THE SERVICE WORKER AND THE OFFLINE PAGE.
const workerPath = path.join(dist, "service-worker.js");
check(fs.existsSync(path.join(dist, "offline.html")), "offline.html is in the build", "offline.html is not in the build output.");
if (!fs.existsSync(workerPath)) {
  problems.push("service-worker.js is not in the build output.");
} else {
  const worker = fs.readFileSync(workerPath, "utf8");
  const killSwitch = fs.readFileSync(path.join(here, "..", "public", "service-worker-killswitch.js"), "utf8");
  check(worker.trim() !== killSwitch.trim(), "the service worker is the real one", "service-worker.js is the emergency kill switch (SW_KILLSWITCH=true).");
  check(/["'`]index\.html["'`]/.test(worker) || worker.includes('url:"index.html"'), "the service worker keeps index.html", "The service worker's list of kept files has no index.html.");
  if (appPage === "app.html") check(/["'`]app\.html["'`]/.test(worker), "the service worker keeps app.html", "The service worker's list of kept files has no app.html.");
  check(/["'`]offline\.html["'`]/.test(worker), "the service worker keeps offline.html", "The service worker's list of kept files has no offline.html.");
}

// IPHONE START-UP IMAGES: each one named is there and the size its media query asks for.
const startup = [...html.matchAll(/<link[^>]+rel="apple-touch-startup-image"[^>]*>/g)].map((match) => match[0]);
check(startup.length > 0, `${appPage} names iPhone start-up images`, `${appPage} names no apple-touch-startup-image.`);
const named = new Set();
for (const tag of startup) {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  const media = tag.match(/media="([^"]+)"/)?.[1] ?? "";
  const w = Number(media.match(/device-width:\s*(\d+)px/)?.[1]);
  const h = Number(media.match(/device-height:\s*(\d+)px/)?.[1]);
  const ratio = Number(media.match(/-webkit-device-pixel-ratio:\s*(\d+)/)?.[1]);
  if (!href || !w || !h || !ratio) {
    problems.push(`A start-up image link cannot be read: ${tag}`);
    continue;
  }
  named.add(`${w}x${h}@${ratio}`);
  pngIs(href, w * ratio, h * ratio, `Start-up image for ${w}x${h}@${ratio}x`);
}
// The iPhones in use now (points and scale); each needs its own picture or iOS shows white.
const CURRENT_IPHONES = ["440x956@3", "402x874@3", "430x932@3", "393x852@3", "428x926@3", "390x844@3", "375x812@3", "414x896@3", "414x896@2", "375x667@2"];
for (const device of CURRENT_IPHONES) {
  check(named.has(device), `a start-up image for ${device}`, `No start-up image for an iPhone of ${device.replace("@", " at ")}x (scripts/make-startup-images.mjs).`);
}

if (process.env.VERBOSE) for (const item of passed) console.log(`  ok    ${item}`);
console.log(`PWA check of ${path.relative(process.cwd(), dist) || dist}: ${passed.length} passed, ${problems.length} failed.`);
for (const problem of problems) console.log(`  FAIL  ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
