# Baseline before the roadmap (Iteration 0)

Recorded 16 October 2026 on branch `iter-0-baseline`, which is
`ui-redesign` at `91ecbcd` with nothing changed in the app. Iteration 17
repeats both runs with the same tools and settings and compares.

The three "Inferred" findings of the roadmap are checked in
`inferred-findings.md`.

## How it was recorded

- **Where:** the production build of `my-pwa` (`npm run build`), served on
  this computer the way Vercel serves it (`vercel.json`'s headers, every
  unknown path answered with `index.html`). The API ran on this computer
  against a throwaway database. Nothing hosted was touched.
- **Data:** a new database, all 50 migrations, `npm run db:seed-demo`, then
  `tools/populate.mjs`, which adds two tasks, one intern's day recorded
  offline and timed out, a weekly report, an absence notice, a concern and
  a document, so lists have rows to check. Push and email were off, as on
  the test site today.
- **Accessibility:** `tools/axe-sweep.mjs`: axe-core with only the WCAG 2.1
  A and AA rules, at 390 px (as a phone, with touch) and 1280 px. On every
  route the page was checked, then each tab not yet selected, each menu,
  and each button that opens a dialog without changing anything, up to 10
  per page. Buttons that decide, send, save or remove were never pressed.
  The routes are every one in `App.tsx` (the two that take an id use the
  first demo student); routes that redirect were checked where they land.
- **Lighthouse:** `tools/lighthouse-run.mjs`: Lighthouse's own mobile
  settings (an emulated mid-range phone, simulated slow 4G, a 4x slower
  processor), three runs per page, the run with the middle performance
  score shown. The site was sent compressed (Brotli), as Vercel sends it.
- **Raw results:** `axe-before.json`, `lighthouse-before.json`, and
  `axe-sweep.log`, the sweep's running log.

**Limits.** A computer is not a phone: the Lighthouse numbers are
simulated over a local network. Two Lighthouse remarks come from this
computer's server rather than the app, and should be looked at on the
test site before anything is done about them: "Serve static assets with an
efficient cache policy" and "Use efficient cache lifetimes" (the local
server sends no cache headers). "Browser errors were logged to the
console" on every page is the push key check answering 503 because push
is switched off (`/api/push/vapid-public-key`). The sweep cannot reach a
dialog opened from inside a row's menu, or one that appears only after
something is changed.

## Accessibility (axe-core, WCAG 2.1 A and AA (axe-core tags wcag2a, wcag2aa, wcag21a, wcag21aa))

100 page loads (every route, at 390 px and 1280 px), 546 states checked in all (the page itself plus each menu, tab and dialog it opened), 14 minutes. Run 2026-10-16T14:14:06.636Z.

| Rule | Impact | What it means | Where (width, page, state) | Elements |
|---|---|---|---|---|
| `scrollable-region-focusable` | serious | Scrollable region must have keyboard access | 390 px /daily-log (button: Time in) | `.min-h-0` |

States per page:

| Width | Portal | Page | Landed on | States | Violations |
|---|---|---|---|---|---|
| 390 | public | `/` | `/` | 1 | 0 |
| 390 | public | `/forgot-password` | `/forgot-password` | 1 | 0 |
| 390 | public | `/reset-password` | `/reset-password` | 1 | 0 |
| 390 | student | `/student/dashboard` | `/student/dashboard` | 4 | 0 |
| 390 | student | `/daily-log` | `/daily-log` | 10 | 1 |
| 390 | student | `/task` | `/task` | 8 | 0 |
| 390 | student | `/schedule` | `/schedule` | 7 | 0 |
| 390 | student | `/documents` | `/documents` | 5 | 0 |
| 390 | student | `/student/resolution` | `/student/resolution` | 6 | 0 |
| 390 | student | `/report` | `/student/resolution?tab=concerns` | 6 | 0 |
| 390 | student | `/notifications` | `/notifications` | 6 | 0 |
| 390 | student | `/student/feedback` | `/student/resolution?tab=evaluations` | 6 | 0 |
| 390 | student | `/time-record` | `/time-record` | 4 | 0 |
| 390 | student | `/announcements` | `/announcements` | 4 | 0 |
| 390 | student | `/journal` | `/journal` | 6 | 0 |
| 390 | student | `/student/completion` | `/student/completion` | 4 | 0 |
| 390 | student | `/profile` | `/profile` | 5 | 0 |
| 390 | supervisor | `/supervisor/dashboard` | `/supervisor/dashboard` | 10 | 0 |
| 390 | supervisor | `/supervisor/interns` | `/supervisor/interns` | 3 | 0 |
| 390 | supervisor | `/supervisor/interns/DEMO-STU-0001` | `/supervisor/interns/DEMO-STU-0001` | 11 | 0 |
| 390 | supervisor | `/supervisor/attendance` | `/supervisor/attendance` | 8 | 0 |
| 390 | supervisor | `/supervisor/tasks` | `/supervisor/tasks` | 6 | 0 |
| 390 | supervisor | `/supervisor/documents` | `/supervisor/documents` | 7 | 0 |
| 390 | supervisor | `/supervisor/journals` | `/supervisor/journals` | 7 | 0 |
| 390 | supervisor | `/supervisor/notifications` | `/supervisor/notifications` | 5 | 0 |
| 390 | supervisor | `/supervisor/time-record` | `/supervisor/time-record` | 3 | 0 |
| 390 | supervisor | `/supervisor/announcements` | `/supervisor/announcements` | 3 | 0 |
| 390 | supervisor | `/supervisor/evaluation` | `/supervisor/interns` | 3 | 0 |
| 390 | supervisor | `/supervisor/complaints` | `/supervisor/complaints` | 4 | 0 |
| 390 | supervisor | `/supervisor/profile` | `/supervisor/profile` | 3 | 0 |
| 390 | coordinator | `/coordinator/dashboard` | `/coordinator/dashboard` | 8 | 0 |
| 390 | coordinator | `/coordinator/students` | `/coordinator/students` | 7 | 0 |
| 390 | coordinator | `/coordinator/students/DEMO-STU-0001` | `/coordinator/students/DEMO-STU-0001` | 7 | 0 |
| 390 | coordinator | `/coordinator/supervisors` | `/coordinator/supervisors` | 5 | 0 |
| 390 | coordinator | `/coordinator/monitoring` | `/coordinator/monitoring` | 5 | 0 |
| 390 | coordinator | `/coordinator/complaints` | `/coordinator/complaints` | 7 | 0 |
| 390 | coordinator | `/coordinator/evaluations` | `/coordinator/evaluations` | 6 | 0 |
| 390 | coordinator | `/coordinator/analytics` | `/coordinator/analytics` | 11 | 0 |
| 390 | coordinator | `/coordinator/profile` | `/coordinator/profile` | 2 | 0 |
| 390 | coordinator | `/coordinator/requirements` | `/coordinator/requirements` | 11 | 0 |
| 390 | coordinator | `/coordinator/documents` | `/coordinator/documents` | 10 | 0 |
| 390 | coordinator | `/coordinator/announcements` | `/coordinator/announcements` | 2 | 0 |
| 390 | coordinator | `/coordinator/notifications` | `/coordinator/notifications` | 4 | 0 |
| 390 | coordinator | `/coordinator/audit` | `/coordinator/audit` | 2 | 0 |
| 390 | coordinator | `/coordinator/companies` | `/coordinator/companies` | 6 | 0 |
| 390 | coordinator | `/coordinator/terms` | `/coordinator/terms` | 3 | 0 |
| 390 | coordinator | `/coordinator/programs` | `/coordinator/programs` | 11 | 0 |
| 390 | coordinator | `/coordinator/holidays` | `/coordinator/holidays` | 3 | 0 |
| 390 | coordinator | `/coordinator/coordinators` | `/coordinator/coordinators` | 3 | 0 |
| 390 | coordinator | `/coordinator/site-visits` | `/coordinator/site-visits` | 2 | 0 |
| 1280 | public | `/` | `/` | 1 | 0 |
| 1280 | public | `/forgot-password` | `/forgot-password` | 1 | 0 |
| 1280 | public | `/reset-password` | `/reset-password` | 1 | 0 |
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
| 1280 | supervisor | `/supervisor/attendance` | `/supervisor/attendance` | 8 | 0 |
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
| 1280 | coordinator | `/coordinator/supervisors` | `/coordinator/supervisors` | 6 | 0 |
| 1280 | coordinator | `/coordinator/monitoring` | `/coordinator/monitoring` | 6 | 0 |
| 1280 | coordinator | `/coordinator/complaints` | `/coordinator/complaints` | 8 | 0 |
| 1280 | coordinator | `/coordinator/evaluations` | `/coordinator/evaluations` | 7 | 0 |
| 1280 | coordinator | `/coordinator/analytics` | `/coordinator/analytics` | 11 | 0 |
| 1280 | coordinator | `/coordinator/profile` | `/coordinator/profile` | 3 | 0 |
| 1280 | coordinator | `/coordinator/requirements` | `/coordinator/requirements` | 11 | 0 |
| 1280 | coordinator | `/coordinator/documents` | `/coordinator/documents` | 11 | 0 |
| 1280 | coordinator | `/coordinator/announcements` | `/coordinator/announcements` | 3 | 0 |
| 1280 | coordinator | `/coordinator/notifications` | `/coordinator/notifications` | 5 | 0 |
| 1280 | coordinator | `/coordinator/audit` | `/coordinator/audit` | 3 | 0 |
| 1280 | coordinator | `/coordinator/companies` | `/coordinator/companies` | 7 | 0 |
| 1280 | coordinator | `/coordinator/terms` | `/coordinator/terms` | 4 | 0 |
| 1280 | coordinator | `/coordinator/programs` | `/coordinator/programs` | 11 | 0 |
| 1280 | coordinator | `/coordinator/holidays` | `/coordinator/holidays` | 4 | 0 |
| 1280 | coordinator | `/coordinator/coordinators` | `/coordinator/coordinators` | 4 | 0 |
| 1280 | coordinator | `/coordinator/site-visits` | `/coordinator/site-visits` | 3 | 0 |

## Lighthouse (Lighthouse defaults for mobile: emulated mid-range phone, simulated slow 4G and 4x CPU slowdown; median of 3 runs by performance score)

Run 2026-10-16T14:23:59.693Z, Lighthouse 12.8.2.

| Page | Performance (3 runs) | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
|---|---|---|---|---|---|---|---|---|---|
| Sign-in | **100** (100, 100, 100) | 100 | 96 | 91 | 0.8 s | 1.0 s | 0 ms | 0.002 | 0.8 s |
| Student: Today | **98** (97, 98, 100) | 100 | 96 | 91 | 0.7 s | 1.5 s | 170 ms | 0 | 0.9 s |
| Supervisor: Review | **78** (77, 78, 79) | 100 | 96 | 91 | 0.7 s | 1.8 s | 0 ms | 0.521 | 0.7 s |
| Coordinator: Dashboard | **97** (93, 97, 100) | 100 | 96 | 91 | 0.7 s | 1.5 s | 40 ms | 0.102 | 0.7 s |

What Lighthouse marked below 90, on the middle run of each page:

- **Sign-in:** Browser errors were logged to the console; Serve static assets with an efficient cache policy (6 resources found); robots.txt is not valid (27 errors found); Use efficient cache lifetimes; Render blocking requests
- **Student: Today:** Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Serve static assets with an efficient cache policy (50 resources found); robots.txt is not valid (27 errors found); Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests (Est savings of 150 ms)
- **Supervisor: Review:** Cumulative Layout Shift (0.521); Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Avoid large layout shifts (3 layout shifts found); Serve static assets with an efficient cache policy (54 resources found); Enable text compression (Est savings of 2 KiB); robots.txt is not valid (27 errors found); Use efficient cache lifetimes; Layout shift culprits; Network dependency tree; Render blocking requests (Est savings of 150 ms)
- **Coordinator: Dashboard:** Cumulative Layout Shift (0.102); Browser errors were logged to the console; Preconnect to required origins (Est savings of 150 ms); Avoid large layout shifts (1 layout shift found); Serve static assets with an efficient cache policy (63 resources found); Enable text compression (Est savings of 6 KiB); robots.txt is not valid (27 errors found); Use efficient cache lifetimes; Layout shift culprits; Network dependency tree; Render blocking requests (Est savings of 150 ms)


## Routes no test names

A route counts as tested when its path, with each `:param` standing for
any value, appears in `backend/test/*.test.cjs` or `e2e/tests/*.ts`. The
match is by path, not method, and is textual, so it errs towards
"untested". `tools/untested-routes.cjs` makes the list.

```
PUT    /api/attendance/:id/break-end                              server.ts:2932
GET    /api/supervisor/dashboard/:supervisorId                    server.ts:3897
POST   /api/complaints                                            server.ts:4751
GET    /api/notifications/student/:studentId/unread-count         server.ts:5155
PUT    /api/notifications/student/:studentId/read-all             server.ts:5300
GET    /api/company/:studentId                                    server.ts:5474
PUT    /api/supervisors/:supervisorId/password                    server.ts:8219
GET    /api/complaints/supervisor/:supervisorId                   server.ts:8583
GET    /api/documents/student                                     server.ts:9075
PUT    /api/coordinator/colleges/:id                              routes/academics.ts:97
PUT    /api/coordinator/majors/:id                                routes/academics.ts:240
GET    /api/absences/supervisor                                   routes/extensions.ts:297
PUT    /api/coordinator/company-records/:id                       routes/extensions.ts:1839
PATCH  /api/coordinator/company-records/:id/status                routes/extensions.ts:1904
POST   /api/coordinator/terms/:id/students                        routes/extensions.ts:2039
PATCH  /api/coordinator/coordinators/:id/status                   routes/extensions.ts:3866
PUT    /api/coordinator/site-visits/:id                           routes/extensions.ts:4008
DELETE /api/coordinator/site-visits/:id                           routes/extensions.ts:4033

209 routes in 9 files; 18 named by no test.
```

Against the audit's list of 13 October: `POST /api/logout` is now named
(the offline-steps journey added that day calls it). `POST /api/complaints`
is newly listed, because this check is stricter: the audit's counted any
longer address beginning with `/api/complaints` as a mention. The count
is 18 either way.
