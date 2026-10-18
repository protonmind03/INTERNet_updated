// Iteration 17: writes docs/after/README.md, the before-and-after comparison, from the raw results
// of both runs. Run from docs/after:  node write-readme.cjs
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const read = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8"));
const axeBefore = read("../baseline/axe-before.json");
const axeAfter = read("axe-after.json");
const lhBefore = read("../baseline/lighthouse-before.json");
const lhAfter = read("lighthouse-after.json");

const key = (r) => `${r.width} ${r.path}`;
const violationsOf = (record) => record.states.reduce((sum, s) => sum + s.violations.length, 0);
const statesOf = (axe, keep = () => true) => axe.results.filter(keep).reduce((sum, r) => sum + r.states.length, 0);
const rulesOf = (axe, keep = () => true) => {
  const rules = new Set();
  for (const r of axe.results.filter(keep)) for (const s of r.states) for (const v of s.violations) rules.add(v.id);
  return rules;
};
const beforeKeys = new Set(axeBefore.results.map(key));
const samePages = (r) => beforeKeys.has(key(r));
const added = axeAfter.results.filter((r) => !samePages(r));
const errors = axeAfter.results.filter((r) => r.error);

// Pages whose violation count moved, on the pages both runs checked.
const beforeByKey = new Map(axeBefore.results.map((r) => [key(r), r]));
const moved = axeAfter.results.filter(samePages).map((r) => ({ r, before: violationsOf(beforeByKey.get(key(r))), after: violationsOf(r) })).filter((x) => x.before !== x.after);

const lines = [];
lines.push("| | Before (16 Oct) | After (19 Oct) |", "|---|---|---|");
lines.push(`| Page loads, the same list of pages | ${axeBefore.results.length} | ${axeAfter.results.filter(samePages).length} |`);
lines.push(`| States checked on those pages | ${statesOf(axeBefore)} | ${statesOf(axeAfter, samePages)} |`);
lines.push(`| Violations on those pages | ${axeBefore.results.reduce((s, r) => s + violationsOf(r), 0)} (${[...rulesOf(axeBefore)].map((id) => `\`${id}\``).join(", ") || "none"}) | ${axeAfter.results.filter(samePages).reduce((s, r) => s + violationsOf(r), 0)} (${[...rulesOf(axeAfter, samePages)].map((id) => `\`${id}\``).join(", ") || "none"}) |`);
lines.push(`| Pages added since, checked too | - | ${added.length} loads, ${statesOf(axeAfter, (r) => !samePages(r))} states, ${added.reduce((s, r) => s + violationsOf(r), 0)} violations |`);
lines.push(`| Time taken | ${axeBefore.minutes} minutes | ${axeAfter.minutes} minutes |`);
lines.push("");
if (moved.length) {
  lines.push("Pages where the count changed:", "", "| Width | Page | Before | After |", "|---|---|---|---|");
  for (const { r, before, after } of moved) lines.push(`| ${r.width} | \`${r.path}\` | ${before} | ${after} |`);
  lines.push("");
}
if (errors.length) lines.push(`Pages that could not be checked: ${errors.map((r) => `${r.width} px ${r.path} (${r.error})`).join("; ")}`, "");
const axeCompare = lines.join("\n");

const lh = [];
lh.push("| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |", "|---|---|---|---|---|---|---|---|---|---|");
const cell = (b, a) => (String(b) === String(a) ? `${a}` : `${b} → **${a}**`);
for (const after of lhAfter.results) {
  const before = lhBefore.results.find((r) => r.name === after.name);
  if (!before) continue;
  const m = (r, id) => r.metrics[id];
  lh.push(`| ${after.name} | ${cell(before.scores.performance, after.scores.performance)} | ${cell(before.scores.accessibility, after.scores.accessibility)} | ${cell(before.scores["best-practices"], after.scores["best-practices"])} | ${cell(before.scores.seo, after.scores.seo)} | ${cell(m(before, "first-contentful-paint"), m(after, "first-contentful-paint"))} | ${cell(m(before, "largest-contentful-paint"), m(after, "largest-contentful-paint"))} | ${cell(m(before, "total-blocking-time"), m(after, "total-blocking-time"))} | ${cell(m(before, "cumulative-layout-shift"), m(after, "cumulative-layout-shift"))} | ${cell(m(before, "speed-index"), m(after, "speed-index"))} |`);
}
const lhCompare = lh.join("\n");

const afterDetail = execFileSync(process.execPath, [path.join(__dirname, "../baseline/tools/summarise.cjs"), path.join(__dirname, "axe-after.json"), path.join(__dirname, "lighthouse-after.json")], { encoding: "utf8" });

const text = `# After the roadmap (Iteration 17)

Both runs of the baseline (\`../baseline/README.md\`, 16 October 2026),
repeated on 19 October 2026 with the same tools, versions and settings on
branch \`iter-17-phase-4\`, which is \`ui-redesign\` at \`a31a0bc\` (Iterations
1 to 16) plus this iteration's documents, one test fix, and one fix to
the app: the baseline's only violation was still there (see below), so a
dialog whose body scrolls now takes a Tab stop (\`components/ui.tsx\`,
\`Modal\`). A first after-sweep without that fix found the same single
issue on the Time in dialog, now on the 12 student pages that offer Time
in (it was 1 at the baseline, when only the Daily log did).

## What changed for each person

- **Student:** time-in, lunch and time-out work with no signal, with a camera check that still runs offline, a "Waiting to send" list that says what has not reached the school yet, and pictures that wait with them; a rejected photo can be redone within a set window or appealed, and the portal opens straight to the day's page in its own shape instead of a launch screen.
- **Supervisor:** each intern has one page with everything to review, "Verify all" leaves out only what needs a closer look and says why, a decision on something changed by someone else is refused instead of overwriting it, a photo rejection can be undone for 15 minutes, and the Review page no longer jumps while it loads.
- **Coordinator:** the menu is grouped into hubs with one Resolution Center for concerns and appeals, every rejection, appeal and message is in the audit log, the documents ZIP can include pictures, the status card shows last night's backup and asks for a monthly restore drill, and the filter bar fits one line on a phone.

## Accessibility (axe-core, WCAG 2.1 A and AA)

${axeCompare}
## Lighthouse (mobile defaults, median of 3 runs)

${lhCompare}

Before: ${lhBefore.when}. After: ${lhAfter.when}. Lighthouse ${lhAfter.results[0]?.lighthouse}.

## Reading the numbers

- **The one accessibility issue is gone**, and nothing new appeared on 108
  page loads and every menu, tab and dialog the sweep could open.
- **Layout shift is the real gain.** The supervisor's Review page jumped by
  0.521 while it loaded (Lighthouse's "poor" is above 0.25); now 0. The
  coordinator's dashboard went from 0.102 to 0.011. This is Iteration 14's
  page-shaped placeholders, and the reason the supervisor's score went from
  78 to 98.
- **SEO 91 → 100 everywhere** is \`robots.txt\` (Iteration 14).
- **Largest paint is 0.2 to 0.5 s later** on sign-in, the student's Today
  and the supervisor's Review. Each still well inside Lighthouse's "good"
  (2.5 s). The pages now draw their final shape at once and fill it in, so
  the largest element is the filled-in content, which waits for the data;
  the app's code is also larger (offline sending, pictures, live catch-up).
  Worth watching, not acting on: a real phone on the test site is the
  measure that counts.
- **Blocking time** moved by tens of milliseconds either way (170 → 50 on
  the student's page, 0 → 110 on the supervisor's), within what three runs
  on one computer vary by: the supervisor's own three runs scored 86, 98
  and 99.
- **Fewer states on a few pages** is by design, not missed coverage: the
  supervisor's attendance tabs became the filter bar (Iteration 7), and the
  student's "More" sheet on phones gave way to the folder's own tabs
  (Iteration 10), so there is less to open.
- **Still marked, as at the baseline:** cache lifetimes and text
  compression (this computer's server and the local API, not Vercel or
  Railway), and the console error from push being switched off.

## How the second run differed, and why it is still a fair comparison

- **Same:** axe-core 4.10.2 with only the WCAG 2.1 A and AA rules, 390 px
  (as a phone, with touch) and 1280 px, the same rules for what is opened
  and what is never pressed; Lighthouse 12.8.2 with its mobile defaults,
  three runs per page, the middle one shown; a production build, sent
  Brotli-compressed with \`vercel.json\`'s headers; a new database with every
  migration (now 64), \`db:seed-demo\` and \`../baseline/tools/populate.mjs\`;
  push and email off.
- **The local server.** The baseline's own server script was not kept;
  \`../baseline/tools/serve-like-vercel.mjs\` does the same and is now
  committed. One difference is forced: the Content Security Policy was
  report-only at the baseline and is enforced now, so the server adds the
  local API's address to \`connect-src\`, or the app could not reach it.
- **Pages added since the baseline** are checked on top of the same list
  (\`EXTRA_PAGES\` in \`../baseline/tools/axe-sweep.mjs\`): \`/help\`, the
  coordinator's Resolution Center and appeals, and a supervisor's own page.
  They are counted apart in the table above, so "before" and "after"
  compare the same pages. A company's page was not checked: the demo data
  has no company record.
- **Pages that moved.** Several coordinator pages now open inside a hub
  (Iteration 8); the old addresses redirect and were checked where they
  land, as the baseline did for its redirects.
- **Time taken** is not a measure of the app: it depends on how many
  states each page now has and on what else the computer is doing.

**Limits** are those of the baseline: a computer is not a phone, the
Lighthouse numbers are simulated over a local network, and the local
server sends no cache headers beyond \`vercel.json\`'s, so the remarks
about cache lifetimes say nothing about Vercel.

## The after run in full

${afterDetail}`;

fs.writeFileSync(path.join(__dirname, "README.md"), text);
console.log("wrote README.md");
