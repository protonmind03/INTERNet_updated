// The PSU redesign's screenshots (internet-revisions/START_HERE.md, step 10.2): the landing
// page and each role's main screens at the four widths the brief names, for comparing with
// internet-revisions/design/screens by eye. Local only, like the end-to-end tests.
//
//   node revision-shots.mjs [outDir]
//   SHOTS_BASE=http://localhost:5173 SHOTS_WIDTHS=390,1440 SHOTS_ONLY=student node revision-shots.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.SHOTS_BASE || "http://localhost:5173").replace(/\/+$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Screenshots run only against this machine.");
const OUT = path.resolve(process.argv[2] || "../internet-revisions/after");
const WIDTHS = (process.env.SHOTS_WIDTHS || "390,820,1180,1440").split(",").map(Number);
const ONLY = process.env.SHOTS_ONLY ? process.env.SHOTS_ONLY.split(",") : null;
const FULL = process.env.SHOTS_FULL !== "0";

const ACCOUNTS = {
  student: { email: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { email: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { email: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};

const PAGES = {
  landing: [["landing", "/"]],
  doors: [
    ["sign-in-student", "/student/sign-in"],
    ["sign-in-supervisor", "/supervisor/sign-in"],
    ["sign-in-coordinator", "/coordinator/sign-in"],
  ],
  student: [
    ["student-today", "/student/dashboard"],
    ["student-attendance", "/daily-log"],
    ["student-schedule", "/schedule"],
    ["student-profile", "/profile"],
  ],
  supervisor: [
    ["supervisor-review", "/supervisor/dashboard"],
    ["supervisor-interns", "/supervisor/interns"],
    ["supervisor-attendance", "/supervisor/attendance"],
  ],
  coordinator: [
    ["coordinator-home", "/coordinator/dashboard"],
    ["coordinator-programs", "/coordinator/programs"],
    ["coordinator-students", "/coordinator/students"],
  ],
};

const heightFor = (w) => (w < 768 ? 844 : w < 1280 ? 1180 : 900);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
const report = [];

async function shoot(page, name, url, width) {
  await page.goto(BASE + url, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const file = path.join(OUT, `${name}@${width}.png`);
  await page.screenshot({ path: file, fullPage: FULL });
  report.push(`${name}@${width}${overflow > 0 ? `  HORIZONTAL SCROLL ${overflow}px` : ""}`);
}

for (const width of WIDTHS) {
  for (const group of Object.keys(PAGES)) {
    if (ONLY && !ONLY.includes(group)) continue;
    const context = await browser.newContext({
      viewport: { width, height: heightFor(width) },
      isMobile: width < 768,
      hasTouch: width < 1280,
      timezoneId: "Asia/Manila",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    if (ACCOUNTS[group]) {
      await page.goto(`${BASE}/${group}/sign-in`);
      await page.locator("#inb-login-id").fill(ACCOUNTS[group].email);
      await page.locator("#inb-login-pw").fill(ACCOUNTS[group].password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(new RegExp(`/${group}/`), { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // First-run slides and tours are dismissed by the account's own state; close any left open.
      await page.keyboard.press("Escape").catch(() => {});
    }
    for (const [name, url] of PAGES[group]) await shoot(page, name, url, width);
    await context.close();
  }
}
await browser.close();
console.log(report.join("\n"));
