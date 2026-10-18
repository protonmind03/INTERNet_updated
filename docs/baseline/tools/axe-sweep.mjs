// Iteration 0 baseline: axe-core (WCAG 2.1 A and AA rules only) on every page of every portal,
// at 390 px and 1280 px, and again with each menu, tab and dialog the page opens without
// changing anything. Run against a LOCAL build and API only.
//
//   SITE=http://localhost:5176 API=http://127.0.0.1:5002 OUT=axe-before.json node axe-sweep.mjs
//
// Needs puppeteer-core and axe-core installed where it is run from (NODE_PATH works), and
// Chrome at the usual Windows place, or CHROME=<path>.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.TOOLS_DIR ? `${process.env.TOOLS_DIR}/` : import.meta.url);
const puppeteer = require("puppeteer-core");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const SITE = (process.env.SITE || "http://localhost:5176").replace(/\/+$/, "");
const API = (process.env.API || "http://127.0.0.1:5002").replace(/\/+$/, "");
for (const address of [SITE, API]) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(address)) throw new Error("The sweep runs only against this computer.");
}
const OUT = process.env.OUT || "axe-before.json";
const MAX_STATES = Number(process.env.MAX_STATES || 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ACCOUNTS = {
  student: { email: "student.demo@internet.test", password: "StudentDemo123!" },
  supervisor: { email: "supervisor.demo@internet.test", password: "SupervisorDemo123!" },
  coordinator: { email: "coordinator@internet.psu.edu.ph", password: "Coordinator123!" },
};
// Every route in App.tsx, by who can open it. Two routes take an id: the first demo student's.
const PAGES = {
  public: ["/", "/forgot-password", "/reset-password"],
  student: ["/student/dashboard", "/daily-log", "/task", "/schedule", "/documents", "/student/resolution", "/report", "/notifications", "/student/feedback", "/time-record", "/announcements", "/journal", "/student/completion", "/profile"],
  supervisor: ["/supervisor/dashboard", "/supervisor/interns", "/supervisor/interns/DEMO-STU-0001", "/supervisor/attendance", "/supervisor/tasks", "/supervisor/documents", "/supervisor/journals", "/supervisor/notifications", "/supervisor/time-record", "/supervisor/announcements", "/supervisor/evaluation", "/supervisor/complaints", "/supervisor/profile"],
  coordinator: ["/coordinator/dashboard", "/coordinator/students", "/coordinator/students/DEMO-STU-0001", "/coordinator/supervisors", "/coordinator/monitoring", "/coordinator/complaints", "/coordinator/evaluations", "/coordinator/analytics", "/coordinator/profile", "/coordinator/requirements", "/coordinator/documents", "/coordinator/announcements", "/coordinator/notifications", "/coordinator/audit", "/coordinator/companies", "/coordinator/terms", "/coordinator/programs", "/coordinator/holidays", "/coordinator/coordinators", "/coordinator/site-visits"],
};
// Iteration 17: pages added since the baseline, checked on top of the list above (the list itself
// is unchanged, so before and after cover the same pages). EXTRA_PAGES='{"public":["/help"]}'
for (const [role, extra] of Object.entries(JSON.parse(process.env.EXTRA_PAGES || "{}"))) PAGES[role] = [...(PAGES[role] ?? []), ...extra];
// Buttons that open something without changing anything. Anything that decides, sends or removes is left alone.
const OPENS = /^(add|new|edit|write|record|time in|time out|out for lunch|back from lunch|sign out|filter|more|import|set |change|due date|correct|assign|create|upload|file |report|request|open|view|details|show|reply|what|how|why|help|account menu|notifications)/i;
const NEVER = /(delete|remove|verify|approve|reject|cancel|send|save|mark|undo|download|export|print|discard|resolve|dismiss|deactivate|reactivate|reset|withdraw|turn on|turn off|check file|test|sign in|submit|confirm|log ?out|install)/i;

const login = async (role) => {
  const response = await fetch(`${API}/api/login/${role}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ACCOUNTS[role]) });
  if (!response.ok) throw new Error(`Could not sign in as the demo ${role}.`);
  return response.json();
};

async function signInPage(page, role, session) {
  await page.goto(`${SITE}/forgot-password`, { waitUntil: "domcontentloaded" });
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
  }, role, session);
}

async function runAxe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 200) })),
      count: v.nodes.length,
    }));
  });
}

const openSomething = () => document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[aria-expanded="true"]') !== null;

async function closeAll(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await page.evaluate(openSomething))) return;
    await page.keyboard.press("Escape");
    await sleep(250);
  }
  // Still open: a Cancel or Close button inside it.
  await page.evaluate(() => {
    const box = document.querySelector('[role="dialog"],[role="alertdialog"]');
    const button = box && [...box.querySelectorAll("button")].find((b) => /^(cancel|close|stay signed in|keep working|not now|×)$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()));
    button?.click();
  });
  await sleep(250);
}

/** The things on the page that can be opened, by a label that finds them again. */
async function openers(page) {
  return page.evaluate((opens, never) => {
    const found = [];
    const seen = new Set();
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    const nameOf = (el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    for (const el of document.querySelectorAll('[role="tab"][aria-selected="false"], button[aria-haspopup], button[aria-expanded="false"], button, a[role="button"]')) {
      if (!visible(el) || el.disabled) continue;
      const name = nameOf(el);
      if (!name || seen.has(name)) continue;
      const kind = el.getAttribute("role") === "tab" ? "tab" : el.hasAttribute("aria-haspopup") || el.getAttribute("aria-expanded") === "false" ? "menu" : "button";
      if (kind === "button" && (!new RegExp(opens, "i").test(name) || new RegExp(never, "i").test(name))) continue;
      if (kind !== "tab" && new RegExp(never, "i").test(name)) continue;
      seen.add(name);
      found.push({ kind, name });
    }
    return found;
  }, OPENS.source, NEVER.source);
}

async function clickByName(page, name) {
  return page.evaluate((name) => {
    const el = [...document.querySelectorAll('[role="tab"], button, a[role="button"]')].find((candidate) => (candidate.getAttribute("aria-label") || candidate.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) === name);
    if (!el) return false;
    el.click();
    return true;
  }, name);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const results = [];
const started = Date.now();
try {
  const sessions = {};
  for (const role of ["student", "supervisor", "coordinator"]) sessions[role] = await login(role);
  for (const width of [390, 1280]) {
    for (const [role, paths] of Object.entries(PAGES)) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 900, isMobile: width < 768, hasTouch: width < 768 });
      page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
      const portal = role === "public" ? null : role;
      await signInPage(page, portal, portal ? sessions[portal] : null);
      for (const path of paths) {
        const record = { role, width, path, landed: null, states: [] };
        try {
          await page.goto(SITE + path, { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => undefined);
          await sleep(1200);
          record.landed = new URL(page.url()).pathname + new URL(page.url()).search;
          record.states.push({ state: "page", violations: await runAxe(page) });
          let opened = 0;
          for (const opener of await openers(page)) {
            if (opened >= MAX_STATES) break;
            const before = page.url();
            if (!(await clickByName(page, opener.name))) continue;
            await sleep(700);
            const somethingOpen = await page.evaluate(openSomething);
            if (opener.kind === "tab" || somethingOpen) {
              opened += 1;
              record.states.push({ state: `${opener.kind}: ${opener.name}`, violations: await runAxe(page) });
            }
            await closeAll(page);
            // A button that went somewhere else: come back to the page under test.
            if (page.url() !== before && opener.kind !== "tab") {
              await page.goto(SITE + path, { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => undefined);
              await sleep(800);
            }
            // Signed out by accident: put the session back.
            if (portal && new URL(page.url()).pathname === "/") {
              await signInPage(page, portal, sessions[portal]);
              await page.goto(SITE + path, { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => undefined);
              await sleep(800);
            }
          }
        } catch (error) {
          record.error = String(error).slice(0, 200);
        }
        results.push(record);
        const count = record.states.reduce((sum, state) => sum + state.violations.length, 0);
        console.log(`${width} ${role.padEnd(11)} ${path.padEnd(40)} states ${String(record.states.length).padStart(2)}  violations ${count}${record.error ? "  ERROR " + record.error : ""}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), site: SITE, rules: "WCAG 2.1 A and AA (axe-core tags wcag2a, wcag2aa, wcag21a, wcag21aa)", minutes: Math.round((Date.now() - started) / 60000), results }, null, 1));
console.log(`written ${OUT}`);
