// Lighthouse on the built site: the sign-in page and each portal's first page,
// with Lighthouse's own mobile settings (an emulated mid-range phone, simulated
// slow 4G, a 4x slower processor). The same pages and settings as the
// Iteration 0 baseline (docs/baseline/tools/lighthouse-run.mjs), so the
// numbers can be set side by side.
//
// Iteration 14 (roadmap 8.1). CI runs it after the end-to-end tests, against
// the site and API that job already started, and keeps the reports
// (lighthouse-reports/) as a build artifact. It reports; it does not fail the
// build over a score. It fails only when Lighthouse itself cannot run.
//
//   E2E_BASE_URL=http://localhost:4173 E2E_API_URL=http://127.0.0.1:5000 node lighthouse/run-lighthouse.mjs
//
// Only ever against this computer: the accounts are the local demo ones.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer-core";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = (process.env.E2E_BASE_URL || "http://localhost:4173").replace(/\/+$/, "");
const API = (process.env.E2E_API_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
for (const address of [SITE, API]) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(address)) throw new Error("Lighthouse is run only against this computer.");
}
const OUT = path.resolve(process.env.LIGHTHOUSE_OUT || path.join(here, "..", "lighthouse-reports"));
const RUNS = Number(process.env.LIGHTHOUSE_RUNS || 1);
const PAGES = [
  { slug: "sign-in", name: "Sign-in", role: null, path: "/" },
  { slug: "student-today", name: "Student: Today", role: "student", path: "/student/dashboard" },
  { slug: "supervisor-review", name: "Supervisor: Review", role: "supervisor", path: "/supervisor/dashboard" },
  { slug: "coordinator-dashboard", name: "Coordinator: Dashboard", role: "coordinator", path: "/coordinator/dashboard" },
];
const ACCOUNTS = {
  student: { email: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { email: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { email: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};
const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"];

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || chromium.executablePath(),
  headless: true,
  args: process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});
const results = [];
try {
  for (const target of PAGES) {
    const runs = [];
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      // The session is put where the sign-in page leaves it; the splash and the push
      // invitation are marked as seen, as they are for anyone after their first visit.
      await page.goto(`${SITE}/forgot-password`, { waitUntil: "domcontentloaded" });
      const session = target.role
        ? await (await fetch(`${API}/api/login/${target.role}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ACCOUNTS[target.role]),
          })).json()
        : null;
      await page.evaluate(
        (role, session) => {
          localStorage.clear();
          sessionStorage.setItem("inb_splash_seen", "1");
          localStorage.setItem("push_prompt_dismissed", "1");
          if (!role) return;
          const account = session[role];
          localStorage.setItem(role, JSON.stringify(account));
          localStorage.setItem(`${role}_id`, String(account[`${role}_id`]));
          localStorage.setItem(`${role}_token`, session.token);
          localStorage.setItem("active_role", role);
        },
        target.role,
        session
      );
      const result = await lighthouse(
        SITE + target.path,
        {
          output: ["html", "json"],
          logLevel: "error",
          disableStorageReset: true,
          onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        },
        undefined,
        page
      );
      const lhr = result.lhr;
      runs.push({
        reports: result.report,
        landed: lhr.finalDisplayedUrl,
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, category]) => [key, Math.round((category.score ?? 0) * 100)])),
        metrics: Object.fromEntries(METRICS.map((id) => [id, lhr.audits[id]?.displayValue ?? null])),
        failing: Object.values(lhr.audits)
          .filter(
            (audit) =>
              audit.score !== null &&
              audit.score < 0.9 &&
              !["informative", "notApplicable", "manual"].includes(audit.scoreDisplayMode)
          )
          .map((audit) => audit.title),
        lighthouse: lhr.lighthouseVersion,
      });
      await context.close();
    }
    // The run with the middle performance score is the one kept.
    runs.sort((a, b) => a.scores.performance - b.scores.performance);
    const middle = runs[Math.floor(runs.length / 2)];
    const [htmlReport, jsonReport] = middle.reports;
    fs.writeFileSync(path.join(OUT, `${target.slug}.report.html`), htmlReport);
    fs.writeFileSync(path.join(OUT, `${target.slug}.report.json`), jsonReport);
    const { reports: _reports, ...kept } = middle;
    results.push({ name: target.name, path: target.path, performance_runs: runs.map((r) => r.scores.performance), ...kept });
    console.log(
      `${target.name.padEnd(24)} perf ${runs.map((r) => r.scores.performance).join("/")}  a11y ${middle.scores.accessibility}  ` +
        `bp ${middle.scores["best-practices"]}  seo ${middle.scores.seo}  LCP ${middle.metrics["largest-contentful-paint"]}  ` +
        `CLS ${middle.metrics["cumulative-layout-shift"]}  TBT ${middle.metrics["total-blocking-time"]}`
    );
  }
} finally {
  await browser.close();
}

const when = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ when, site: SITE, runs: RUNS, results }, null, 1));
const table = [
  `## Lighthouse (mobile), ${when}`,
  "",
  `Lighthouse ${results[0]?.lighthouse ?? "?"}, its mobile settings, ${RUNS === 1 ? "one run" : `${RUNS} runs, the middle one kept`} per page. Full reports are in the lighthouse-reports artifact.`,
  "",
  "| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |",
  "|---|---|---|---|---|---|---|---|",
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores["best-practices"]} | ${r.scores.seo} | ` +
      `${r.metrics["largest-contentful-paint"]} | ${r.metrics["total-blocking-time"]} | ${r.metrics["cumulative-layout-shift"]} |`
  ),
  "",
  ...results.map((r) => `- **${r.name}** below 90: ${r.failing.length ? r.failing.join("; ") : "nothing"}`),
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "summary.md"), table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
console.log(`Reports written to ${OUT}`);
