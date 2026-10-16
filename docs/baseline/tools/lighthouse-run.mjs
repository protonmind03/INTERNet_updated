// Iteration 0 baseline: Lighthouse, mobile settings (its defaults: a mid-range phone, simulated
// slow 4G), on the sign-in page and each portal's first page. Three runs per page; the run with
// the middle performance score is kept. Run against a LOCAL build and API only.
//
//   SITE=http://localhost:5176 API=http://127.0.0.1:5002 OUT=lighthouse-before.json node lighthouse-run.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const tools = process.env.TOOLS_DIR || path.resolve("node_modules");
const require = createRequire(`${tools}/`);
const puppeteer = require("puppeteer-core");
const { default: lighthouse } = await import(pathToFileURL(path.join(tools, "lighthouse", "core", "index.js")).href);

const SITE = (process.env.SITE || "http://localhost:5176").replace(/\/+$/, "");
const API = (process.env.API || "http://127.0.0.1:5002").replace(/\/+$/, "");
for (const address of [SITE, API]) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(address)) throw new Error("Lighthouse is run only against this computer.");
}
const OUT = process.env.OUT || "lighthouse-before.json";
const RUNS = Number(process.env.RUNS || 3);
const PAGES = [
  { name: "Sign-in", role: null, path: "/" },
  { name: "Student: Today", role: "student", path: "/student/dashboard" },
  { name: "Supervisor: Review", role: "supervisor", path: "/supervisor/dashboard" },
  { name: "Coordinator: Dashboard", role: "coordinator", path: "/coordinator/dashboard" },
];
const ACCOUNTS = {
  student: { email: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { email: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { email: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};
const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interactive"];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const results = [];
try {
  for (const target of PAGES) {
    const runs = [];
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      // The session is put where the sign-in page leaves it; the splash and the push invitation are
      // marked as seen, as they are for anyone after their first visit.
      await page.goto(`${SITE}/forgot-password`, { waitUntil: "domcontentloaded" });
      const session = target.role
        ? await (await fetch(`${API}/api/login/${target.role}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ACCOUNTS[target.role]) })).json()
        : null;
      await page.evaluate((role, session) => {
        localStorage.clear();
        sessionStorage.setItem("inb_splash_seen", "1");
        localStorage.setItem("push_prompt_dismissed", "1");
        if (!role) return;
        const account = session[role];
        localStorage.setItem(role, JSON.stringify(account));
        localStorage.setItem(`${role}_id`, String(account[`${role}_id`]));
        localStorage.setItem(`${role}_token`, session.token);
        localStorage.setItem("active_role", role);
      }, target.role, session);
      const result = await lighthouse(
        SITE + target.path,
        { output: "json", logLevel: "error", disableStorageReset: true, onlyCategories: ["performance", "accessibility", "best-practices", "seo"] },
        undefined,
        page
      );
      const lhr = result.lhr;
      runs.push({
        landed: lhr.finalDisplayedUrl,
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, category]) => [key, Math.round((category.score ?? 0) * 100)])),
        metrics: Object.fromEntries(METRICS.map((id) => [id, lhr.audits[id]?.displayValue ?? null])),
        failing: Object.values(lhr.audits)
          .filter((audit) => audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode !== "informative" && audit.scoreDisplayMode !== "notApplicable" && audit.scoreDisplayMode !== "manual")
          .map((audit) => ({ id: audit.id, title: audit.title, score: audit.score, value: audit.displayValue ?? null })),
        lighthouse: lhr.lighthouseVersion,
      });
      await context.close();
    }
    runs.sort((a, b) => a.scores.performance - b.scores.performance);
    const middle = runs[Math.floor(runs.length / 2)];
    results.push({ name: target.name, path: target.path, performance_runs: runs.map((r) => r.scores.performance), ...middle });
    console.log(`${target.name.padEnd(24)} perf ${runs.map((r) => r.scores.performance).join("/")}  a11y ${middle.scores.accessibility}  bp ${middle.scores["best-practices"]}  seo ${middle.scores.seo}  LCP ${middle.metrics["largest-contentful-paint"]}  CLS ${middle.metrics["cumulative-layout-shift"]}  TBT ${middle.metrics["total-blocking-time"]}`);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), site: SITE, settings: "Lighthouse defaults for mobile: emulated mid-range phone, simulated slow 4G and 4x CPU slowdown; median of " + RUNS + " runs by performance score", results }, null, 1));
console.log(`written ${OUT}`);
