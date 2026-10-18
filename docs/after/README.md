# After the roadmap (Iteration 17)

Both runs of the baseline (`../baseline/README.md`, 16 October 2026),
repeated on 19 October 2026 with the same tools, versions and settings on
branch `iter-17-phase-4`, which is `ui-redesign` at `a31a0bc` (Iterations
1 to 16) plus this iteration's documents, one test fix, and one fix to
the app: the baseline's only violation was still there (see below), so a
dialog whose body scrolls now takes a Tab stop (`components/ui.tsx`,
`Modal`). A first after-sweep without that fix found the same single
issue on the Time in dialog, now on the 12 student pages that offer Time
in (it was 1 at the baseline, when only the Daily log did).

## What changed for each person

- **Student:** time-in, lunch and time-out work with no signal, with a camera check that still runs offline, a "Waiting to send" list that says what has not reached the school yet, and pictures that wait with them; a rejected photo can be redone within a set window or appealed, and the portal opens straight to the day's page in its own shape instead of a launch screen.
- **Supervisor:** each intern has one page with everything to review, "Verify all" leaves out only what needs a closer look and says why, a decision on something changed by someone else is refused instead of overwriting it, a photo rejection can be undone for 15 minutes, and the Review page no longer jumps while it loads.
- **Coordinator:** the menu is grouped into hubs with one Resolution Center for concerns and appeals, every rejection, appeal and message is in the audit log, the documents ZIP can include pictures, the status card shows last night's backup and asks for a monthly restore drill, and the filter bar fits one line on a phone.

## Accessibility (axe-core, WCAG 2.1 A and AA)

| | Before (16 Oct) | After (19 Oct) |
|---|---|---|
| Page loads, the same list of pages | 100 | 100 |
| States checked on those pages | 546 | 542 |
| Violations on those pages | 1 (`scrollable-region-focusable`) | 0 (none) |
| Pages added since, checked too | - | 8 loads, 29 states, 0 violations |
| Time taken | 14 minutes | 15 minutes |

Pages where the count changed:

| Width | Page | Before | After |
|---|---|---|---|
| 390 | `/daily-log` | 1 | 0 |

## Lighthouse (mobile defaults, median of 3 runs)

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
|---|---|---|---|---|---|---|---|---|---|
| Sign-in | 100 | 100 | 96 | 91 → **100** | 0.8 s → **0.7 s** | 1.0 s → **1.2 s** | 0 ms → **60 ms** | 0.002 | 0.8 s → **0.7 s** |
| Student: Today | 98 → **99** | 100 | 96 | 91 → **100** | 0.7 s | 1.5 s → **2.0 s** | 170 ms → **50 ms** | 0 → **0.004** | 0.9 s → **0.8 s** |
| Supervisor: Review | 78 → **98** | 100 | 96 | 91 → **100** | 0.7 s | 1.8 s → **2.1 s** | 0 ms → **110 ms** | 0.521 → **0** | 0.7 s → **0.9 s** |
| Coordinator: Dashboard | 97 → **99** | 100 | 96 | 91 → **100** | 0.7 s | 1.5 s | 40 ms → **90 ms** | 0.102 → **0.011** | 0.7 s |

Before: 2026-10-16T14:23:59.693Z. After: 2026-10-18T23:01:10.693Z. Lighthouse 12.8.2.

## Reading the numbers

- **The one accessibility issue is gone**, and nothing new appeared on 108
  page loads and every menu, tab and dialog the sweep could open.
- **Layout shift is the real gain.** The supervisor's Review page jumped by
  0.521 while it loaded (Lighthouse's "poor" is above 0.25); now 0. The
  coordinator's dashboard went from 0.102 to 0.011. This is Iteration 14's
  page-shaped placeholders, and the reason the supervisor's score went from
  78 to 98.
- **SEO 91 → 100 everywhere** is `robots.txt` (Iteration 14).
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
  Brotli-compressed with `vercel.json`'s headers; a new database with every
  migration (now 64), `db:seed-demo` and `../baseline/tools/populate.mjs`;
  push and email off.
- **The local server.** The baseline's own server script was not kept;
  `../baseline/tools/serve-like-vercel.mjs` does the same and is now
  committed. One difference is forced: the Content Security Policy was
  report-only at the baseline and is enforced now, so the server adds the
  local API's address to `connect-src`, or the app could not reach it.
- **Pages added since the baseline** are checked on top of the same list
  (`EXTRA_PAGES` in `../baseline/tools/axe-sweep.mjs`): `/help`, the
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
server sends no cache headers beyond `vercel.json`'s, so the remarks
about cache lifetimes say nothing about Vercel.

## The after run in full

## Accessibility (axe-core, WCAG 2.1 A and AA (axe-core tags wcag2a, wcag2aa, wcag21a, wcag21aa))

108 page loads (every route, at 390 px and 1280 px), 571 states checked in all (the page itself plus each menu, tab and dialog it opened), 15 minutes. Run 2026-10-18T22:52:11.020Z.

**No violations.**

States per page:

| Width | Portal | Page | Landed on | States | Violations |
|---|---|---|---|---|---|
| 390 | public | `/` | `/` | 1 | 0 |
| 390 | public | `/forgot-password` | `/forgot-password` | 1 | 0 |
| 390 | public | `/reset-password` | `/reset-password` | 1 | 0 |
| 390 | public | `/help` | `/help` | 1 | 0 |
| 390 | student | `/student/dashboard` | `/student/dashboard` | 4 | 0 |
| 390 | student | `/daily-log` | `/daily-log` | 9 | 0 |
| 390 | student | `/task` | `/task` | 8 | 0 |
| 390 | student | `/schedule` | `/schedule` | 7 | 0 |
| 390 | student | `/documents` | `/documents` | 4 | 0 |
| 390 | student | `/student/resolution` | `/student/resolution` | 6 | 0 |
| 390 | student | `/report` | `/student/resolution?tab=concerns` | 6 | 0 |
| 390 | student | `/notifications` | `/notifications` | 6 | 0 |
| 390 | student | `/student/feedback` | `/student/resolution?tab=evaluations` | 6 | 0 |
| 390 | student | `/time-record` | `/time-record` | 4 | 0 |
| 390 | student | `/announcements` | `/announcements` | 4 | 0 |
| 390 | student | `/journal` | `/journal` | 6 | 0 |
| 390 | student | `/student/completion` | `/student/completion` | 4 | 0 |
| 390 | student | `/profile` | `/profile` | 3 | 0 |
| 390 | supervisor | `/supervisor/dashboard` | `/supervisor/dashboard` | 10 | 0 |
| 390 | supervisor | `/supervisor/interns` | `/supervisor/interns` | 3 | 0 |
| 390 | supervisor | `/supervisor/interns/DEMO-STU-0001` | `/supervisor/interns/DEMO-STU-0001` | 11 | 0 |
| 390 | supervisor | `/supervisor/attendance` | `/supervisor/attendance` | 5 | 0 |
| 390 | supervisor | `/supervisor/tasks` | `/supervisor/tasks` | 6 | 0 |
| 390 | supervisor | `/supervisor/documents` | `/supervisor/documents` | 7 | 0 |
| 390 | supervisor | `/supervisor/journals` | `/supervisor/journals` | 7 | 0 |
| 390 | supervisor | `/supervisor/notifications` | `/supervisor/notifications` | 5 | 0 |
| 390 | supervisor | `/supervisor/time-record` | `/supervisor/time-record` | 3 | 0 |
| 390 | supervisor | `/supervisor/announcements` | `/supervisor/announcements` | 3 | 0 |
| 390 | supervisor | `/supervisor/evaluation` | `/supervisor/interns` | 3 | 0 |
| 390 | supervisor | `/supervisor/complaints` | `/supervisor/complaints` | 4 | 0 |
| 390 | supervisor | `/supervisor/profile` | `/supervisor/profile` | 3 | 0 |
| 390 | coordinator | `/coordinator/dashboard` | `/coordinator/dashboard` | 9 | 0 |
| 390 | coordinator | `/coordinator/students` | `/coordinator/students` | 8 | 0 |
| 390 | coordinator | `/coordinator/students/DEMO-STU-0001` | `/coordinator/students/DEMO-STU-0001` | 7 | 0 |
| 390 | coordinator | `/coordinator/supervisors` | `/coordinator/companies?tab=supervisors` | 5 | 0 |
| 390 | coordinator | `/coordinator/monitoring` | `/coordinator/monitoring` | 6 | 0 |
| 390 | coordinator | `/coordinator/complaints` | `/coordinator/resolution?tab=concerns` | 7 | 0 |
| 390 | coordinator | `/coordinator/evaluations` | `/coordinator/resolution?tab=evaluations` | 7 | 0 |
| 390 | coordinator | `/coordinator/analytics` | `/coordinator/analytics` | 11 | 0 |
| 390 | coordinator | `/coordinator/profile` | `/coordinator/profile` | 2 | 0 |
| 390 | coordinator | `/coordinator/requirements` | `/coordinator/documents?tab=requirements` | 11 | 0 |
| 390 | coordinator | `/coordinator/documents` | `/coordinator/documents` | 11 | 0 |
| 390 | coordinator | `/coordinator/announcements` | `/coordinator/announcements` | 2 | 0 |
| 390 | coordinator | `/coordinator/notifications` | `/coordinator/notifications` | 4 | 0 |
| 390 | coordinator | `/coordinator/audit` | `/coordinator/profile?section=audit` | 3 | 0 |
| 390 | coordinator | `/coordinator/companies` | `/coordinator/companies` | 6 | 0 |
| 390 | coordinator | `/coordinator/terms` | `/coordinator/students?tab=terms` | 3 | 0 |
| 390 | coordinator | `/coordinator/programs` | `/coordinator/programs` | 11 | 0 |
| 390 | coordinator | `/coordinator/holidays` | `/coordinator/holidays` | 3 | 0 |
| 390 | coordinator | `/coordinator/coordinators` | `/coordinator/profile?section=coordinators` | 3 | 0 |
| 390 | coordinator | `/coordinator/site-visits` | `/coordinator/companies?tab=site-visits` | 2 | 0 |
| 390 | coordinator | `/coordinator/resolution` | `/coordinator/resolution` | 7 | 0 |
| 390 | coordinator | `/coordinator/appeals` | `/coordinator/resolution?tab=appeals` | 2 | 0 |
| 390 | coordinator | `/coordinator/supervisors/DEMO-SUP-0001` | `/coordinator/supervisors/DEMO-SUP-0001` | 3 | 0 |
| 1280 | public | `/` | `/` | 1 | 0 |
| 1280 | public | `/forgot-password` | `/forgot-password` | 1 | 0 |
| 1280 | public | `/reset-password` | `/reset-password` | 1 | 0 |
| 1280 | public | `/help` | `/help` | 1 | 0 |
| 1280 | student | `/student/dashboard` | `/student/dashboard` | 4 | 0 |
| 1280 | student | `/daily-log` | `/daily-log` | 9 | 0 |
| 1280 | student | `/task` | `/task` | 7 | 0 |
| 1280 | student | `/schedule` | `/schedule` | 6 | 0 |
| 1280 | student | `/documents` | `/documents` | 3 | 0 |
| 1280 | student | `/student/resolution` | `/student/resolution` | 5 | 0 |
| 1280 | student | `/report` | `/student/resolution?tab=concerns` | 5 | 0 |
| 1280 | student | `/notifications` | `/notifications` | 5 | 0 |
| 1280 | student | `/student/feedback` | `/student/resolution?tab=evaluations` | 5 | 0 |
| 1280 | student | `/time-record` | `/time-record` | 3 | 0 |
| 1280 | student | `/announcements` | `/announcements` | 3 | 0 |
| 1280 | student | `/journal` | `/journal` | 5 | 0 |
| 1280 | student | `/student/completion` | `/student/completion` | 3 | 0 |
| 1280 | student | `/profile` | `/profile` | 3 | 0 |
| 1280 | supervisor | `/supervisor/dashboard` | `/supervisor/dashboard` | 10 | 0 |
| 1280 | supervisor | `/supervisor/interns` | `/supervisor/interns` | 3 | 0 |
| 1280 | supervisor | `/supervisor/interns/DEMO-STU-0001` | `/supervisor/interns/DEMO-STU-0001` | 11 | 0 |
| 1280 | supervisor | `/supervisor/attendance` | `/supervisor/attendance` | 5 | 0 |
| 1280 | supervisor | `/supervisor/tasks` | `/supervisor/tasks` | 6 | 0 |
| 1280 | supervisor | `/supervisor/documents` | `/supervisor/documents` | 7 | 0 |
| 1280 | supervisor | `/supervisor/journals` | `/supervisor/journals` | 7 | 0 |
| 1280 | supervisor | `/supervisor/notifications` | `/supervisor/notifications` | 5 | 0 |
| 1280 | supervisor | `/supervisor/time-record` | `/supervisor/time-record` | 3 | 0 |
| 1280 | supervisor | `/supervisor/announcements` | `/supervisor/announcements` | 3 | 0 |
| 1280 | supervisor | `/supervisor/evaluation` | `/supervisor/interns` | 3 | 0 |
| 1280 | supervisor | `/supervisor/complaints` | `/supervisor/complaints` | 4 | 0 |
| 1280 | supervisor | `/supervisor/profile` | `/supervisor/profile` | 3 | 0 |
| 1280 | coordinator | `/coordinator/dashboard` | `/coordinator/dashboard` | 9 | 0 |
| 1280 | coordinator | `/coordinator/students` | `/coordinator/students` | 8 | 0 |
| 1280 | coordinator | `/coordinator/students/DEMO-STU-0001` | `/coordinator/students/DEMO-STU-0001` | 8 | 0 |
| 1280 | coordinator | `/coordinator/supervisors` | `/coordinator/companies?tab=supervisors` | 6 | 0 |
| 1280 | coordinator | `/coordinator/monitoring` | `/coordinator/monitoring` | 6 | 0 |
| 1280 | coordinator | `/coordinator/complaints` | `/coordinator/resolution?tab=concerns` | 8 | 0 |
| 1280 | coordinator | `/coordinator/evaluations` | `/coordinator/resolution?tab=evaluations` | 7 | 0 |
| 1280 | coordinator | `/coordinator/analytics` | `/coordinator/analytics` | 11 | 0 |
| 1280 | coordinator | `/coordinator/profile` | `/coordinator/profile` | 3 | 0 |
| 1280 | coordinator | `/coordinator/requirements` | `/coordinator/documents?tab=requirements` | 11 | 0 |
| 1280 | coordinator | `/coordinator/documents` | `/coordinator/documents` | 11 | 0 |
| 1280 | coordinator | `/coordinator/announcements` | `/coordinator/announcements` | 3 | 0 |
| 1280 | coordinator | `/coordinator/notifications` | `/coordinator/notifications` | 5 | 0 |
| 1280 | coordinator | `/coordinator/audit` | `/coordinator/profile?section=audit` | 3 | 0 |
| 1280 | coordinator | `/coordinator/companies` | `/coordinator/companies` | 7 | 0 |
| 1280 | coordinator | `/coordinator/terms` | `/coordinator/students?tab=terms` | 4 | 0 |
| 1280 | coordinator | `/coordinator/programs` | `/coordinator/programs` | 11 | 0 |
| 1280 | coordinator | `/coordinator/holidays` | `/coordinator/holidays` | 4 | 0 |
| 1280 | coordinator | `/coordinator/coordinators` | `/coordinator/profile?section=coordinators` | 4 | 0 |
| 1280 | coordinator | `/coordinator/site-visits` | `/coordinator/companies?tab=site-visits` | 3 | 0 |
| 1280 | coordinator | `/coordinator/resolution` | `/coordinator/resolution` | 8 | 0 |
| 1280 | coordinator | `/coordinator/appeals` | `/coordinator/resolution?tab=appeals` | 3 | 0 |
| 1280 | coordinator | `/coordinator/supervisors/DEMO-SUP-0001` | `/coordinator/supervisors/DEMO-SUP-0001` | 4 | 0 |

## Lighthouse (Lighthouse defaults for mobile: emulated mid-range phone, simulated slow 4G and 4x CPU slowdown; median of 3 runs by performance score)

Run 2026-10-18T23:01:10.693Z, Lighthouse 12.8.2.

| Page | Performance (3 runs) | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
|---|---|---|---|---|---|---|---|---|---|
| Sign-in | **100** (100, 100, 100) | 100 | 96 | 100 | 0.7 s | 1.2 s | 60 ms | 0.002 | 0.7 s |
| Student: Today | **99** (99, 99, 99) | 100 | 96 | 100 | 0.7 s | 2.0 s | 50 ms | 0.004 | 0.8 s |
| Supervisor: Review | **98** (86, 98, 99) | 100 | 96 | 100 | 0.7 s | 2.1 s | 110 ms | 0 | 0.9 s |
| Coordinator: Dashboard | **99** (99, 99, 99) | 100 | 96 | 100 | 0.7 s | 1.5 s | 90 ms | 0.011 | 0.7 s |

What Lighthouse marked below 90, on the middle run of each page:

- **Sign-in:** Browser errors were logged to the console; Serve static assets with an efficient cache policy (6 resources found); Use efficient cache lifetimes; Network dependency tree; Render blocking requests (Est savings of 150 ms)
- **Student: Today:** Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Serve static assets with an efficient cache policy (53 resources found); Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests (Est savings of 150 ms)
- **Supervisor: Review:** Max Potential First Input Delay (170 ms); Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Serve static assets with an efficient cache policy (59 resources found); Enable text compression (Est savings of 3 KiB); Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests (Est savings of 150 ms)
- **Coordinator: Dashboard:** Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Serve static assets with an efficient cache policy (69 resources found); Enable text compression (Est savings of 6 KiB); Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests (Est savings of 160 ms)

