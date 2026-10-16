// Writes docs/baseline/README.md from the raw results. Run from docs/baseline:  node tools/write-readme.cjs
const fs = require("fs");
const { execFileSync } = require("child_process");
const summary = execFileSync(process.execPath, ["tools/summarise.cjs", "axe-before.json", "lighthouse-before.json"], { encoding: "utf8" });
const untested = execFileSync(process.execPath, ["tools/untested-routes.cjs"], { encoding: "utf8" }).trim();

const text = `# Baseline before the roadmap (Iteration 0)

Recorded 16 October 2026 on branch \`iter-0-baseline\`, which is
\`ui-redesign\` at \`91ecbcd\` with nothing changed in the app. Iteration 17
repeats both runs with the same tools and settings and compares.

The three "Inferred" findings of the roadmap are checked in
\`inferred-findings.md\`.

## How it was recorded

- **Where:** the production build of \`my-pwa\` (\`npm run build\`), served on
  this computer the way Vercel serves it (\`vercel.json\`'s headers, every
  unknown path answered with \`index.html\`). The API ran on this computer
  against a throwaway database. Nothing hosted was touched.
- **Data:** a new database, all 50 migrations, \`npm run db:seed-demo\`, then
  \`tools/populate.mjs\`, which adds two tasks, one intern's day recorded
  offline and timed out, a weekly report, an absence notice, a concern and
  a document, so lists have rows to check. Push and email were off, as on
  the test site today.
- **Accessibility:** \`tools/axe-sweep.mjs\`: axe-core with only the WCAG 2.1
  A and AA rules, at 390 px (as a phone, with touch) and 1280 px. On every
  route the page was checked, then each tab not yet selected, each menu,
  and each button that opens a dialog without changing anything, up to 10
  per page. Buttons that decide, send, save or remove were never pressed.
  The routes are every one in \`App.tsx\` (the two that take an id use the
  first demo student); routes that redirect were checked where they land.
- **Lighthouse:** \`tools/lighthouse-run.mjs\`: Lighthouse's own mobile
  settings (an emulated mid-range phone, simulated slow 4G, a 4x slower
  processor), three runs per page, the run with the middle performance
  score shown. The site was sent compressed (Brotli), as Vercel sends it.
- **Raw results:** \`axe-before.json\`, \`lighthouse-before.json\`, and
  \`axe-sweep.log\`, the sweep's running log.

**Limits.** A computer is not a phone: the Lighthouse numbers are
simulated over a local network. Two Lighthouse remarks come from this
computer's server rather than the app, and should be looked at on the
test site before anything is done about them: "Serve static assets with an
efficient cache policy" and "Use efficient cache lifetimes" (the local
server sends no cache headers). "Browser errors were logged to the
console" on every page is the push key check answering 503 because push
is switched off (\`/api/push/vapid-public-key\`). The sweep cannot reach a
dialog opened from inside a row's menu, or one that appears only after
something is changed.

${summary}
## Routes no test names

A route counts as tested when its path, with each \`:param\` standing for
any value, appears in \`backend/test/*.test.cjs\` or \`e2e/tests/*.ts\`. The
match is by path, not method, and is textual, so it errs towards
"untested". \`tools/untested-routes.cjs\` makes the list.

\`\`\`
${untested}
\`\`\`

Against the audit's list of 13 October: \`POST /api/logout\` is now named
(the offline-steps journey added that day calls it). \`POST /api/complaints\`
is newly listed, because this check is stricter: the audit's counted any
longer address beginning with \`/api/complaints\` as a mention. The count
is 18 either way.
`;
fs.writeFileSync("README.md", text);
console.log("README.md written, " + text.length + " characters");
