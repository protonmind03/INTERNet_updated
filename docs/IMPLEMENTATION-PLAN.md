# Implementation plan and tracker

The single tracker for the multi-phase work. Items are ticked as they are
finished. Findings behind each adjustment are in `docs/AUDIT-2026-10.md`;
platform steps are in `docs/PLATFORM-CHANGES.md`.

Status: **Phases 1 and 2 are pushed and live (2026-10-10).** Phase 2 went
out in two pushes, backend first, after a production backup that was
restored and tested locally. Still owed for Phase 2: the phone checks in
`DEPLOY.md`, on a real Android phone and a real iPhone.

**Phases 3, 4 and 5 went live on 2026-10-11** in one push, after a
production backup that was restored and tested locally with all seventeen
migrations. Every item is built except the three optional ones (decision
D12) and the switch to an enforcing content security policy, which waits
for the owner's word. The notes under each phase say where the work falls
short of the list. What is still open is at the end, under "Still open".

## Rules

**Git**
1. **Work is on `ui-redesign`; `main` is production** (changed by the owner
   on 2026-10-11; until then all work was on `main`). Pushing `ui-redesign`
   updates the test site only. `main` moves only when the owner says "make
   it live": it is fast-forwarded to `ui-redesign` and pushed, which deploys
   Vercel and Railway. No other branches. Neither branch is ever deleted.
2. Each session starts with `git checkout ui-redesign` and
   `git pull --ff-only origin ui-redesign`. If the fast-forward fails, stop.
3. One item = one local commit, with a conventional message
   (`fix(student): ...`).
4. **Review on localhost first** (added 2026-10-10). Work is built and
   committed locally. At each gate the owner is told how to see it on
   localhost, and it goes live only after they have looked and said so.
4a. **Never push unless told "push"** (for `ui-redesign`) **or "make it
   live"** (for `main`). Each phase gate gives a push plan:
   the commits, the platform changes to apply first, whether a backup is
   needed, and the order (variables, backend, frontend). When backend and
   frontend must go separately, backend first, then wait for a healthy
   `/api/health`.
5. Forbidden: `git push --force`; rebasing or amending pushed commits;
   `--no-verify`; committing `.env` files, secrets, uploads,
   `node_modules`, `dist`, or `my-pwa/public/mediapipe`.

**Platforms and database**
6. No access to Vercel, Railway or the production database. Every platform
   change is written to `docs/PLATFORM-CHANGES.md` for the owner to apply.
7. New environment variables are safe when missing: unset means today's
   behaviour. Each is added to the right `.env.example` and to `DEPLOY.md`.
   `VITE_*` variables need a Vercel redeploy to take effect.
8. Migrations are additive, idempotent, in new numbered files. No edits to
   applied migrations, no `DROP`, no renames. New foreign keys are
   `NOT VALID`. Each is applied to a fresh local `internet_ojt` (and to a
   production-shaped restore if one is provided) with the tests run on
   both. A fresh production backup comes before any push with a migration.
   Old frontend code must keep working on the new schema.
9. Data scripts (backfills, FK validation, purges) are not migrations. They
   live in `backend/src/scripts/`, default to read-only or dry-run, need
   `--confirm` to write, and are run on production only by the owner.

**Engineering**
10. Read before changing: the file, and what imports it. Grep to confirm a
    route, column or helper exists.
11. The backend is the source of truth for routes, auth and shapes.
12. Do not break existing behaviour: add fields, do not rename; a new
    parameter that is not sent changes nothing; the service worker stays at
    `/service-worker.js`.
13. Tests gate every change: `backend` `npm test`, then `my-pwa`
    `npm run build && npm run lint`, after every item. A backend test for
    each new or changed endpoint. No existing test is weakened or deleted.
14. Ask on every **[DECISION]** and whenever the code contradicts the plan.
15. Docs stay current: a dated `CHANGES.md` section per phase;
    `PAPER-CORRECTIONS.md` where the paper is affected; `DEPLOY.md` in step
    with `PLATFORM-CHANGES.md`. The `.docx` is never edited.
16. Reuse `components/ui.tsx`, `lib/toast.ts`, `lib/api.ts`,
    `lib/session.ts`, `usePagination`/`Pagination`, `DtrSheet`,
    `NotificationFeed` and `src/brand/`. Plain, specific wording. Respect
    `prefers-reduced-motion`.
17. Verify external facts against `node_modules` or official docs.
18. Stop at every phase gate: report, push plan, wait.

## Already implemented: do not rebuild

All confirmed in Phase 0 (audit, "Already implemented").

- Service worker: `push` handler with `setAppBadge`; `notificationclick`
  using `data.url`; `offline.html` fallback for navigations.
- `offline.html` is self-contained. The manifest has maskable icons.
- Push permission is asked only when signed in, on a button tap.
- MediaPipe and `jspdf` load dynamically.
- Client-side photo compression (runs twice on two paths; fixed in 1.11).
- Supervisor bulk verify; the supervisor's intern schedule view.
- Coordinator verify / reject / return / acknowledge of flagged logs.
- Printable DTR. Complaint reply threads.
- Migrations run on Railway deploy.
- **Also already true (found in Phase 0):** push payloads carry a `url`
  per notification type, so item 2.12 needs no work; lint is clean, so the
  lint part of 1.19 needs no work.

## Phase 1: Safety, hygiene and quick wins (no new tables)

### Safety net
- [x] **1.1 CI on `main`.** `.github/workflows/ci.yml`: Postgres service
  container; `backend`: `npm ci`, `db:migrate`, `db:seed-demo`, start the
  API, `npm test`; `my-pwa`: `npm ci`, `npm run build`, `npm run lint`.
  Runs on push and pull request.
  *Accept:* a green run on the first push; a deliberately broken test turns
  it red (checked on a throwaway commit that is not pushed to `main`).
  *Note:* `seed-demo.ts` refuses any database not named `internet_ojt` on a
  loopback host, so the container must be reached as `localhost` with that
  database name. **[DECISION D3]**
- [x] **1.2 Backups.** `backend/src/scripts/backup-local.ts` (refuses
  non-loopback hosts, like `seed-demo.ts`); `DEPLOY.md` section on Railway
  Postgres backups and on backing up the `/data` volume; a local restore
  drill (dump, restore to a scratch database, run the tests), written up.
  *Accept:* the drill passes locally and its steps are reproducible from
  the doc.
- [x] **1.3 Foreign-key scripts.** `scripts/fk-orphans.ts` (read-only
  report, the query in audit item 8) and `scripts/fk-validate.ts`
  (`VALIDATE CONSTRAINT` only where orphans = 0; needs `--confirm`).
  *Accept:* on the local database, the report runs; without `--confirm`
  the validator changes nothing; with it, only zero-orphan constraints
  become validated. Not wired into the deploy.

### Security
- [x] **1.4 JWT sweep.** Phase 0 found no unprotected route, so this item
  is tests only: for each role-scoped route family, an anonymous request
  returns 401 and another user's request returns 403 (or 404 where the
  route hides existence). Any gap the tests expose is fixed in the same
  commit.
  *Files:* `backend/test/api.test.cjs`.
- [x] **1.5 Cache-Control.** Middleware setting
  `Cache-Control: private, no-store` on authenticated `/api` responses,
  excluding `/api/health`, `/api/push/vapid-public-key` and the event
  stream (which sets its own).
  *Accept:* test asserts the header on an authenticated response and its
  absence on the two public ones.
- [x] **1.6 Upload signature check.** A magic-byte check (JPEG, PNG, PDF,
  DOC, DOCX) shared by all nine multer routes, run before
  `savePrivateFile`. Files are in memory, so there is nothing to delete on
  failure.
  *Accept:* a test uploads text renamed `.jpg` with an image MIME type and
  gets 400; a real small JPEG still passes validation.
- [x] **1.7 Headers in `vercel.json`.** Add `camera=(self)` to
  `Permissions-Policy`; add `Content-Security-Policy-Report-Only` as listed
  in the brief; `Cache-Control: no-cache` for `/service-worker.js` and
  `/manifest.json`.
  *Accept:* with `npm run build && npm run preview`, the camera check
  starts and no report-only violation comes from the app's own code.
  **[DECISION D4]** *Depends on 1.18* (self-hosted fonts), or `font-src`
  and `style-src` must list Google's origins.
- [x] **1.8 Remove the account-wipe tool.** Delete
  `pages/coordinator/AccountWipe.tsx`, its use in `Profile.tsx`, and the
  `/api/coordinator/accounts/wipe` route. **[DECISION D5]** on its test.

### Bugs and UX
- [x] **1.9 Login redirect.** `Login.tsx`: with `active_role` and its token
  present, render `<Navigate to={HOME[role]} replace />`. The
  session-expired notice still shows when the guard sends someone back.
- [x] **1.10 Splash.** Dispatch `inb:ready` after the first data load on
  the student dashboard, supervisor review and coordinator dashboard;
  lower the `LaunchGate` fallback to about 1200 ms (a local edit to
  `brand/SplashScreen.tsx`, to be recorded with the other kit edits).
- [x] **1.11 One photo compressor.** Merge `lib/files.ts#shrinkPhoto` and
  `lib/image.ts#compressPhoto` into one helper that keeps
  `imageOrientation: "from-image"`; each upload path compresses once.
- [x] **1.12 Overlaps.** One stacking order that clears the tab bar and the
  safe area (audit item 14). Live notifications go through `lib/toast.ts`
  with a "View" action; the bridge's own popup is removed.
- [x] **1.13 Coordinator notifications page.** `/coordinator/notifications`
  using `NotificationFeed`; the bell's "view all" and the coordinator push
  fallback point to it.
- [x] **1.14 Shuffle.** Fisher-Yates in `LivenessCamera.tsx` in place of
  `sort(() => Math.random() - 0.5)`.
- [x] **1.15 Duplicates.** `sessionGuard.ts` uses
  `lib/session.ts#clearSession`. Note in `CHANGES.md` that the kit's toast
  files are used only by `BrandPreview`.
- [x] **1.16 Code splitting.** `React.lazy` for the portal pages with a
  `BrandLoader` fallback; Login and the password pages stay eager.
  *Accept:* the main chunk is clearly below today's 745 kB; before and
  after sizes recorded in `CHANGES.md`.
- [x] **1.17 Error boundary.** A branded error screen (Reload, Sign out)
  around the app; `POST /api/client-errors`, rate-limited and size-capped,
  logging only message, stack, route and app version.
  *Accept:* tests for the size cap, the rate limit and that no body field
  beyond the four is logged.
- [x] **1.18 Fonts.** Self-host Bricolage Grotesque and IBM Plex Mono
  through `@fontsource`; remove the Google Fonts links from `index.html`.
- [x] **1.19 Hygiene.** Delete the root `package.json` and
  `package-lock.json` (nothing references them: no root `node_modules`, no
  config points at the root). Align the API port to 5000 in
  `my-pwa/.env.example` and the docs. Lint is already clean.
- [x] **1.20 Monitoring date range.** Optional `from` and `to` on
  `GET /api/coordinator/monitoring`; without them the output is unchanged.
  The page's date range then also filters per-student progress.
  *Accept:* test for unchanged output without parameters and for a narrowed
  total with them.
- [x] **1.21 Paper corrections.** Update A1 and B9 in
  `PAPER-CORRECTIONS.md`, and the other out-of-date lines the audit lists.

**How Phase 1 turned out differently from the list above**
- 1.4: the sweep covers every route by reading the source, and found one
  fault (a 500 on a bodiless profile update), fixed in the same commit.
- 1.7 and 1.18: IBM Plex Mono was requested from Google but never used by
  any style, so it was dropped, not self-hosted. Say if you want it wired
  in as the monospace face; that would change how monospace text looks.
- 1.10: a ready signal that arrives almost at once is held to 450 ms so
  the launch screen does not flash.
- 1.12: the offline strip stayed at the top; the page and headers move
  down by its height. The toast-above-push-prompt case could not be seen
  in a browser (the prompt needs push keys on the server).
- 1.16: a page file that fails to load triggers one fresh load of the
  address, then the crash screen.
- 1.17: `POST /api/client-errors` is open to anyone, because a crash can
  happen before sign-in. It is the ninth public route.
- 1.19: the tests now read the port from `backend/.env`, so the local
  setup on 5001 keeps working while every example says 5000.
- 1.20: the date range adds `period_hours` and `period_logs` per student.
  Overall progress and the attention counts stay whole.
- 1.1 has not run on GitHub yet; that happens on the first push.
- 1.2: the upload-volume backup steps are untested on the hosted volume.
**Gate:** report and push plan. No migrations in this phase.

## Phase 2: Full PWA capability

Data-safety rule: the service worker never caches API responses. Offline
data lives in IndexedDB, keyed by role and account, purged on sign-out.

- [x] **2.1 Adopt `vite-plugin-pwa` (`^1.3.0`).** `injectManifest`, output
  `/service-worker.js`, `injectRegister: false`, `manifest: false`. Port
  the push, `notificationclick` and badge handlers unchanged. Precache the
  build, `index.html` and `offline.html`; exclude `mediapipe/**` and
  `models/**` and serve them `CacheFirst` from versioned runtime caches.
  Network-first navigation with `offline.html` as fallback. No handling of
  API-origin requests. Commit `public/service-worker-killswitch.js` and
  document its use. *First step:* confirm the plugin's Vite 8 support in
  the installed package before relying on it (rule 17).
- [x] **2.2 Update prompt.** No `skipWaiting()` on install. A waiting
  worker shows "Update available — Reload"; the click posts
  `SKIP_WAITING` and the page reloads on `controllerchange`. Check for
  updates when the page becomes visible.
- [x] **2.3 Offline read-only data.** `lib/offlineStore.ts` (IndexedDB)
  with per-user copies of: student dashboard, attendance, schedule, tasks,
  notifications; supervisor interns and review count. Offline shows the
  copy with "Showing saved data from <time>". No files, photos or event
  data.
- [x] **2.4 Purge.** Sign-out, session-guard invalidation and the forced
  password sign-out delete that account's IndexedDB data, drafts and
  queue. A shared-device test procedure is documented.
- [x] **2.5 Draft autosave** per account for: time-in note, task
  submission notes, complaint description, absence reason (and the
  accomplishment field once 4.S1 exists).
- [x] **2.6 Offline break / back / time-out queue.** Migration:
  `attendance.recorded_offline` and a `client_request_id` ledger. Routes
  take optional `occurred_at` and `client_request_id` with the validation
  in the brief; repeats return the original success. Frontend queues in
  IndexedDB and replays on `online`, on `visibilitychange`, and through
  Background Sync where available. `ReviewDetail` shows "Recorded while
  offline". **[DECISION D6]**
- [x] **2.7 Offline time-in.** Default: online only, with an explanation
  and a pointer to the supervisor's "Record time-in". **[DECISION D7]**
- [x] **2.8 Manifest.** `id`, `lang`, `dir`, `categories`,
  `launch_handler`; remove `orientation`; `screenshots` (placeholders,
  listed for the owner to replace); `shortcuts` through a role-aware
  `/go/:target` route; `mobile-web-app-capable` meta.
- [x] **2.9 Install experience.** `lib/useInstallPrompt.ts` (moved out of
  the kit's `LoginScreen.tsx`); an install entry on login and each Profile
  page, hidden when standalone; an iOS "Add to Home Screen" guide,
  dismissible; `PushNotificationSettings` explains the iOS install
  requirement.
- [x] **2.10 Wake lock** while `LivenessCamera` runs; re-acquired on
  visibility, released on unmount, silent where unsupported.
- [x] **2.11 Persistent storage.** `navigator.storage.persist()` once after
  install.
- [x] **2.12 Push URLs.** Already present (audit item 4). Nothing to do.

**How Phase 2 turned out differently from the list above**
- 2.1: page loads fall back to the saved app first and to `offline.html`
  only as a last resort, because offline reading (2.3) needs the app
  itself to open. The worker is registered only in a build, not in
  `npm run dev`. The kill switch is a build flag (`SW_KILLSWITCH=true`), so
  using it needs no code change.
- 2.1 and 2.2 share one file and are one commit; so are 2.3 and 2.4, and
  2.9 and 2.11.
- 2.3: also covers the student's company and absences, and the
  supervisor's notifications, because their pages showed an error offline
  without them. Nothing is kept for the coordinator.
- 2.4: testing found the erase could be cut short by the reload that
  follows an ended session. Ending a session now waits for it, and the app
  also clears leftovers at start-up.
- 2.5: the "accomplishment" field does not exist yet (item 4.S1), so it has
  no draft.
- 2.6: **Background Sync is not used.** The worker cannot read the sign-in
  token and the token was not moved to where it could. Waiting steps are
  sent the next time the app is open and online. Say if you want this
  revisited.
- 2.6: the end-to-end test writes a real log, so it runs only with
  `ALLOW_TEST_WRITES=true` (set in CI).
- 2.7: built as decision D7's recommendation (no offline time-in). There is
  no `OFFLINE_TIME_IN` variable.
- 2.8: the screenshots are real ones from a local build with the demo
  accounts, not placeholders.
- None of Phase 2 has been tried on a real phone. The checklist is in
  `DEPLOY.md`, "Phone checks after a Phase 2 deploy".
- D6 and D7 were built with the recommended answers and not explicitly
  confirmed: 12 hours (changeable with a setting), and no offline time-in.

**Gate:** report, push plan (backend first), device test checklist.

## Phase 3: Structured data foundations (additive migrations)

- [x] **3.1 Notification links.** Nullable `notifications.link`,
  `entity_type`, `entity_id`, filled at all 58 creation sites (audit item
  4); `link` in push and event payloads; navigation uses `link` first and
  title matching only for old rows.
- [x] **3.2 Audit log.** `audit_log` table; a row for each action the
  brief lists; read-only paginated `/coordinator/audit`.
- [x] **3.3 Companies.** `companies` table; nullable `company_id` keys
  (`NOT VALID`) on `students`, `supervisors`, `complaints`; the text
  columns stay. `scripts/backfill-companies.ts` (prints a proposed mapping;
  writes only with `--confirm`). CRUD at `/coordinator/companies`; a
  company picker in the forms. *Note:* `GET /api/coordinator/companies`
  already exists and returns distinct names for announcements; its
  response must stay compatible.
- [x] **3.4 Terms.** `terms` table, nullable `students.term_id`, a term
  selector filtering the coordinator console; closing a term deactivates
  its students and never deletes them. **[DECISION D8]**
- [x] **3.5 Pagination.** Optional `limit`, `offset`, `q`, `status`,
  `from`, `to` on: coordinator students, supervisors, complaints,
  documents; supervisor attendance; discrepancies. With `limit`, a `total`
  field; without it, unchanged. Heavy pages move to server paging in the
  same commit as their endpoint. Tests: first page, last page, past the
  end, role scoping.

**How Phase 3 turned out differently from the list above**
- 3.1: every notification gets a page; 14 of the 58 writers also name the
  record. Opening one particular log or task on its page is not built.
- 3.2: the log is written by one piece of middleware from a table of
  rules, not by a call in each route. It covers the brief's list plus
  company and term changes (31 routes).
- 3.3: the API lives at `/api/coordinator/company-records`, because
  `/api/coordinator/companies` was taken. Linking is done by a database
  trigger on the company text, so no account route had to change. The
  forms suggest companies but still accept any name.
- 3.4: built on D8's recommendation without an explicit answer. **The term
  filter covers the Students page only**, not the dashboard, Monitoring or
  Analytics.
- 3.5: the six routes page and filter on request, with tests. **The pages
  still load whole lists**; only the audit log pages on the server.
- The backfill prints a table: company, other spellings, how many
  students, supervisors and complaints carry the name, and whether it
  would create a record or link to an existing one.

**Gate:** report, push plan, the backfill proposal format.

## Phase 4: Role features

### Student
- [x] **4.S1 Accomplishment at time-out.** `attendance.accomplishments`;
  shown in `ReviewDetail` and on `DtrSheet`. **[DECISION D9]**
- [x] **4.S2 Weekly journal.** `journals` (unique per student per week); a
  `journal` kind in the supervisor queue; shown in the coordinator's
  student record.
- [x] **4.S3 Completion page** `/student/completion`; a one-time "Request
  completion review".
- [x] **4.S4 Contact details.** Phone and emergency contact, edited by the
  student, visible to supervisor and coordinator.
- [x] **4.S5 My coordinator** on Profile and Schedule.
- [x] **4.S6 Privacy consent.** `privacy_consent_at` and
  `privacy_consent_version`; a consent screen before the first time-in
  with clearly marked placeholder text; "Download my data"; a retention
  purge script, off unless `PHOTO_RETENTION_DAYS` is set. **[DECISION D10]**
- [x] **4.S7 Holidays.** `holidays` table managed by the coordinator; the
  schedule, DTR and projections skip them.
- [x] **4.S8 Forgot-to-time-out reminder,** at most once a day per
  student. **[DECISION D11]**
- [x] **4.S9 Announcements page** for students and supervisors.
- [x] **4.S10 Optional:** `.ics` export. **[DECISION D12]** Built 2026-10-12.

**How the student part turned out differently from the list above**
- 4.S1: the server accepts a time-out with no note, so an older copy of
  the app keeps working. A note that is sent is checked.
- 4.S2: three parts (did, learned, and optionally difficulties). The last
  four weeks can still be written. The supervisor can also withdraw a
  decision. **A supervisor has no page for re-reading journals they have
  already reviewed**; the coordinator's Journals tab shows all of them.
- 4.S3: six lines, counted on the server. A rejected log does not hold a
  student back; an open or pending one does. Journals are not on the list.
- 4.S6: the app asks for consent; **the server refuses a time-in without
  it only when `PRIVACY_CONSENT_REQUIRED=true`**, so an older copy of the
  app is not locked out. A time-in the supervisor records in person does
  not ask. The purge script has to run on the server, where the photos
  are, and has not been run there. The notice text is a draft with two
  bracketed gaps.
- 4.S7: the app has no projection of a finishing date, so there was none
  to change. A holiday is shown; it does not block a time-in.
- 4.S8: one hour, fixed; `TIMEOUT_REMINDER_HOURS` was not added. Only on a
  scheduled day. In-app (and push where set up), no email.

### Supervisor
- [x] **4.V1 Daily email digest** at `SUPERVISOR_DIGEST_TIME`; idempotent;
  skipped when nothing waits, when opted out, or without SMTP.
- [x] **4.V2 Structured final evaluation.** `evaluation_forms` and
  `final_evaluations`. **[DECISION D13]**
- [x] **4.V3 Time correction** with a required reason, recomputed hours,
  audit row, student notification; refused on logs the coordinator has
  acknowledged. Tests.
- [x] **4.V4 DTR certification.** `dtr_certifications` (unique per student
  and month); only when every log in the month is decided and closed;
  printed on `DtrSheet`.
- [x] **4.V5 Bulk decisions** for documents and absences, with the
  partial-failure report of bulk verify.
- [x] **4.V6 Optional:** per-intern summary PDF. **[DECISION D12]** Built 2026-10-12.

### Coordinator
- [x] **4.C1 Coordinator accounts.** List, create, deactivate, reset; same
  password policy and forced change; cannot deactivate self or the last
  active coordinator.
- [x] **4.C2 Supervisor CSV import,** mirroring the student import.
- [x] **4.C3 Import dry run** (`dry_run=true`) on both imports, shown in
  the dialog first.
- [x] **4.C4 Site visit log.** `site_visits` table and page; visits on the
  company page.
- [x] **4.C5 Optional:** read receipts on announcements. **[DECISION D12]** Built 2026-10-12.

### Cross-cutting
- [x] **4.X1 Notification preferences.** `notification_preferences` (push
  and email per category), managed from Profile, respected by the
  notification helper and digests. In-app notifications are always kept.

**How the supervisor, coordinator and cross-cutting parts turned out
differently from the list above**
- 4.V2: the form starts as a **sample** (seven criteria, scale of 5),
  marked as one on every screen, until the coordinator saves the
  university's. D13 is still open. The completion checklist now counts the
  final evaluation, not any evaluation.
- 4.V3: the status of a corrected log is left as it was. The latest
  correction is kept on the log; the history is in the audit log.
- 4.V4: a certification records the verified hours at that moment and can
  be withdrawn by the supervisor.
- 4.C1: "the last active coordinator" is covered by "not yourself": only
  an active coordinator can deactivate another, so one always remains.
- 4.X1: only task deadline reminders and the summary emails are emails
  that can be switched off; every other kind has a push switch only.
- The owner asked on 2026-10-11 to go on through every remaining part, so
  the gates after Supervisor and after Coordinator were not stopped at.
  Everything is still local and waiting to be looked at.

**Gates:** after Student, after Supervisor, after Coordinator and
cross-cutting.

## Phase 5: Data-driven analytics and polish

- [x] **5.1 Pace projection** per active student, shown in Monitoring
  ("Projected finish", "At risk" filter), the coordinator dashboard, the
  student dashboard and the supervisor's intern dialog.
- [x] **5.2 Alerts and weekly digest.** Dashboard alerts (slow
  supervisors, MOAs expiring in 30 days, 5+ scheduled days without
  attendance, at-risk students); a weekly coordinator email.
  **[DECISION D14]**
- [x] **5.3 Exports** gain projections, company summaries and the term
  filter.
- [x] **5.4 Consistency test** extended to the term and company filters.
- [x] **5.5 Accessibility.** axe on every page; labels and focus fixed;
  anything not fixed is reported.
- [x] **5.6 Playwright end-to-end tests** with a fake camera stream, added
  to CI.
- [x] **5.7 Enforcing CSP** in `vercel.json`, once the report-only header
  has shown no real violations. Pushed only on the owner's word.
  *Known from Phase 1:* `offline.html` has an inline script and an inline
  `onclick`; under an enforced `script-src 'self'` its "Try again" button
  would stop working. Move that script to a file (precached with the page
  in 2.1) before enforcing.

**How Phase 5 turned out differently from the list above**
- 5.1: the projection is from the weekly schedule and the holidays, not
  from the hours a student has actually been rendering. It is on
  Monitoring, the student dashboard and the supervisor's intern dialog; on
  the coordinator dashboard at-risk students are in the Alerts card.
- 5.2: built on D14's recommendation (3 days) without an explicit answer.
- 5.3: Monitoring's new Export follows the term filter. The Analytics page
  itself still has no term filter; its exports carry the all-terms tables.
- 5.5: axe on all 45 pages at two widths, clean after fixes. Dialogs and
  open menus were not run through it.
- 5.6: nine tests in a separate `e2e` folder. The fake camera has no
  face, so time-in is tested up to the camera check starting.
- 5.7: **not done, by design.** The offline page's script was moved to a
  file and every page loads with no report-only violations, so the switch
  is a one-line change waiting for the owner's word.

**Gate:** final report, complete platform checklist, field test plan.

## Round 2

A new round, sent one phase at a time. The rules for it are the owner's
brief of 2026-10-12: work on `ui-redesign`; localhost, then "push" for the
test site and staging backend, then "make it live" for production; one
item one commit; stop at the end of every phase.

### Phase 0: operations

- [x] **0.1 Email through an HTTPS API.** `EMAIL_PROVIDER` and
  `EMAIL_API_KEY`, sender `SMTP_FROM`; the provider's API first, SMTP
  second, otherwise not configured. `isEmailConfigured()` replaces
  `isSmtpConfigured()`, which stays as an alias for one round.
  **[DECISION]** provider: built on the default (Resend), awaiting
  confirmation. A second provider is one entry in `PROVIDERS`.
- [x] **0.2 Push keys.** Nothing to code; the VAPID steps are in the Round
  2 platform list.
- [x] **0.3 Upload backup.** `npm run uploads:backup`, run on the server,
  packs the uploads into one archive and prints its size and file count.
  **Run on a local folder only; never on the host.**
- [x] **0.4 Foreign keys.** Nothing run. The platform list asks the owner
  to run `db:fk-orphans` through the tunnel and send the table.
- [x] **0.5 Liveness ticket reuse.** Migration 036; a ticket carries a
  `jti` and is spent by the first time-in that passes the camera check; a
  second use answers 409.

**How Phase 0 turned out differently from the brief**
- 0.1: the brief says Railway disables SMTP "on the Hobby plan". Railway's
  own support answers say the ports are closed on Hobby and below and open
  on Pro; I did not find the statement on an official docs page. Either
  way the API route is the one to use.
- 0.1: **email needs a domain the group owns.** A provider only sends from
  a verified domain, and a `vercel.app` address is not one. Without a
  domain, Resend's test mode delivers only to the account's own address.
- 0.1: the summary-email functions take `emailReady`; the old `smtpReady`
  is still read, so nothing that calls them had to change.
- 0.5: the ticket is spent only after its report passes the check, so a
  failed camera check can be retried on the same ticket. If the server
  itself then fails to record the time-in, the ticket is given back. A
  ticket issued before this (no `jti`) is known by its own fingerprint, so
  it is single-use too.
- 0.5: clean-up runs on the time-out reminder's five-minute round, not the
  deadline reminder's one-minute round: a day-old row does not need
  checking every minute.

### Phase 1A: student portal reorganisation

No migrations. Frontend, except the notification lists' paging (1A.5).
Built 2026-10-12 on localhost, one commit per item.

Different from the description, each for a stated reason:

- 1A.1: three pages (Today, Attendance, Time record) read the attendance
  before they draw the layout, so they mount the provider themselves one
  level up and the layout uses that one. There is still only ever one.
- 1A.2 and 1A.3: the header button and the floating button are each
  rendered at their own width only (not both, with one hidden by CSS), so
  a page never has two buttons with the same name.
- 1A.5: a paged answer also carries `unread` (the count of all unread,
  not only those on the page), which the bell's badge needs. The
  Announcements tab is given to students only; supervisors keep their page
  and their "View all notifications" link.
- 1A.5: announcement links still open `/announcements`. Opening the
  bell's tab from a link was left out: it was not clean.
- 1A.7: the links the server stores in notifications still name
  `/report` and `/student/feedback`, which redirect. They were left so
  that the older frontend keeps working on the newer backend.
- Awaiting confirmation: the button and status line say "Lunch" and "On
  lunch", as described; the Attendance card and the time record still say
  "break" for the same step.

- [x] **1A.1 Shared time-in actions.** One provider holds the day's
  attendance, the privacy step, the camera dialog and the break, back and
  time-out confirmations; the Attendance card uses it. No change in
  behaviour.
- [x] **1A.2 Today page.** The attendance card leaves Today; a one-line
  status takes its place, with a next-step button in the header on desktop.
- [x] **1A.3 Floating action button** on phones: the next step, hidden on
  Attendance and Profile, while a dialog is open and once the day is done;
  a badge for steps waiting offline; its own layer.
- [x] **1A.4 Notifications out of the navigation.** `/notifications` stays.
- [x] **1A.5 Bell panel.** Paged notification lists on the server; the bell
  loads twenty at a time, has All and Unread, and an Announcements tab that
  records "seen" as the page does. Announcements leaves the navigation.
- [x] **1A.6 Completion into Profile.** `/student/completion` stays.
- [x] **1A.7 Resolution Center** at `/student/resolution`: Concerns and
  Evaluations. `/report` and `/student/feedback` redirect.
- [x] **1A.8 Navigation:** Today, Attendance, Tasks, Documents, More
  (Schedule, Weekly journal); avatar menu: Profile, Resolution Center,
  Sign out.

### Phase 1B: supervisor portal reorganisation, and one name per concept

No migrations. Built 2026-10-12 on localhost, one commit per item.

Different from the description, or decided where it left room:

- 1B.1: with the Announcements tab, the supervisor's bell loses "View all
  notifications", as the student's did. `/supervisor/notifications` still
  opens by address.
- 1B.3: the final-evaluation lookup was one request per intern, so
  `GET /api/supervisor/final-evaluations` was added. The item is listed
  after everything waiting for a decision, has its own filter chip only
  when there is one, and is not counted in the Review badge in the top
  bar (that count comes from the server and is of decisions waiting).
  Until the server has answered who has an evaluation, no one is listed.
- 1B.4: a supervisor is not assigned to a coordinator in the database, so
  "Your OJT coordinator" is the active coordinator who has been one
  longest: the person a student with no coordinator of their own is shown.
- 1B.5: the wording of the server's messages for concerns changed along
  with the notification titles, because they are shown on screen in
  toasts. "Workplace Incident" is a category stored with each concern and
  is unchanged. The student's rating of their company is called a rating.
- 1B.6: a production build was already leaving the kit's toasts out
  (tree-shaking). They are now also not exported from the kit's index.
- Awaiting confirmation: the printed sheet is still headed "Daily Time
  Record", the form's formal name. Everywhere else says "Time record".

- [x] **1B.1 Supervisor bell.** The same bell as the student's: paging,
  Unread, and an Announcements tab that records "seen". Announcements
  leaves the account menu; `/supervisor/announcements` stays.
- [x] **1B.2 Concerns in the account menu.** "Incidents" leaves the top
  bar and becomes "Concerns" beside Profile. Same address.
- [x] **1B.3 "Final evaluation due" in the Review queue,** for an intern
  within 40 hours of their required hours, or past them, with no final
  evaluation. It opens Evaluations with that intern chosen. Evaluations
  stays in the top bar until Phase 4.
- [x] **1B.4 Usability.** Capture method and "recorded offline" marks on
  attendance rows; "Correct the times" in the row menu; the supervisor's
  coordinator in the account menu.
- [x] **1B.5 One name per concept,** all three portals: "concern", "Time
  record", "Evaluations". Server notification titles change where the
  word appears; links and title guessing match old and new wording. Audit
  action names stay; their labels change. Database names stay.
- [x] **1B.6 Redundant code.** The brand kit's own toast system is out of
  the production build.

### Phase 1C: coordinator console

No migrations. The KPI targets are fixed constants this phase. Built
2026-10-12 on localhost.

Built on the default, awaiting confirmation: the six targets (90%, 95%,
2 days, 80%, 0, 0), in `backend/src/services/kpiDefinitions.ts`.

Different from the description, or decided where it left room:

- 1C.1: a new endpoint, `GET /api/coordinator/actions`, rather than more
  fields on the dashboard's. It also carries the progress bands, the
  supervisors' queues and "scheduled, not yet in", which were the other
  things the page added up from every student's row.
- 1C.1: with a term chosen, the rows about students and supervisors count
  that term's students. Concerns and agreements are not tied to a term and
  are always all counted. The weekly email calls the same function with
  no term and is unchanged.
- 1C.2: "one shared module" is on the server. The frontend and the backend
  are separate packages with no shared code, so the names, definitions and
  targets are sent with each figure and the screens keep no copy.
- 1C.2: every card is compared with the figure four weeks earlier.
- 1C.2: a past week on a card's chart is worked out from today's
  schedules, term dates and agreement dates, because those are not kept
  as they were. The dated records (attendance, decisions, documents,
  concerns) are right for the week they are counted in. The page says so.
- 1C.2: "Attendance on scheduled days" counts a filed absence as not
  attended, and leaves today out. "Median time to decision" counts logs a
  supervisor decided, not ones the coordinator decided.
- 1C.2: on Analytics the period tiles (hours, logs, students who logged,
  share verified) became one sentence above the charts, so nothing they
  showed was lost.
- 1C.3: the server already searched the joined name and already compared
  dates in Asia/Manila. Added: `person` (who did it, by name or id, and
  nothing else), `entity_type`, `entity_id`, and a refusal of a date that
  is not a real day (it used to answer 500).
- 1C.4: a repeated read by the same person of the same record within ten
  minutes is one entry. Without that, every reload of a student's record,
  and every photo on it, would be a row.
- 1C.4: an uploaded file (an attendance photo, a task attachment) is
  logged as `document.view` with record kind "upload" and the file's
  stored name; the entry does not say whose it is.

- [x] **1C.1 Dashboard: one Action list,** grouped by who acts (You,
  Supervisors, Students), counted on the server, in place of Alerts,
  "Needs attention" and "Students to check on". Top to bottom: today's
  attendance, the Action list, KPI cards, the hours trend, progress bands,
  supervisor queues. The weekly email is unchanged.
- [x] **1C.2 KPI cards** on Dashboard and Analytics: value, target, eight
  weeks as a sparkline, change, colour only when the target is missed, a
  definition, and a link to the list behind it. Six cards, computed on
  the server; definitions and targets in one module.
- [x] **1C.3 Audit log filters:** dropdowns for Category, Actor role,
  Person and Record, date presets, all in the address; "Export CSV" on
  the server; dates in Asia/Manila, with a test at 23:30.
- [x] **1C.4 Audit coverage:** privacy consent, data export, a coordinator
  opening a student's document or upload, and a coordinator opening a
  student record.
- [x] **1C.5 Schedule tab** on the coordinator's student record, using the
  editor from the Requirements page, which stays with a note.

### Phase 2: College, Program, Major, Block, and one filter bar

Two migrations (037, 038) and a backfill script. A production backup is
needed before this goes live.

- [ ] **2.1 Migration 037: academic structure.** colleges, programs,
  majors, blocks; students gain program_id, major_id, block_id (NOT VALID
  foreign keys). students.program stays the displayed text; a trigger sets
  program_id from it. Closing a term marks its blocks inactive; reopening
  restores them.
- [ ] **2.2 Migration 038: seed PSU Lingayen,** six colleges with their
  programs and majors, ON CONFLICT DO NOTHING.
- [ ] **2.3 Backfill script** `backfill-programs.ts`: a dry run by default,
  links only what a mapping file written by a person maps.
- [ ] **2.4 Coordinator page "Programs":** colleges, programs, majors and
  blocks per term, with audit rules.
- [ ] **2.5 Student form and import:** College, Program, Major, Block
  pickers; the import and its dry run take the same four columns.
- [ ] **2.6 Shared filter bar** (Term, College, Program, Block, Company,
  Supervisor, At risk) on Dashboard, Monitoring, Analytics, Students,
  Documents, Evaluations and the Audit log; the routes filter in SQL.
- [ ] **2.7 Supervisor filter:** "Program and block" where the interns
  span more than one.
- [ ] **2.8 Analytics and exports** gain program and block columns, and
  tables by program and by block.

## Still open

Not built, and noted where each was decided:
- Server paging: Students, Complaints and the audit log page on the
  server. Still loading whole lists and paging in the browser: the
  Supervisors page (its move-interns dialog needs every supervisor, and
  the list is short by nature), the coordinator's Documents page (one
  answer feeds two views), Monitoring's flagged logs, and the supervisor's
  attendance list (the review queue is built from the same full list).
- Record links: a student's log and task, any item in a supervisor's
  queue, and a coordinator's complaint open from their notification. Other
  kinds (a student's document, a coordinator's attendance or document
  notice) still open the page only, and only notifications whose writer
  names the record carry one.

Closed since the list was first written (2026-10-11, on `ui-redesign`):
- The term filter now covers the dashboard and Analytics as well.
- A supervisor has a Journals page for reading back every journal.
- The Students and Complaints pages are paged by the server.
- A notification that names a record opens that record.
- The three optional items are built (2026-10-12): the calendar export,
  the per-intern summary PDF and announcement read receipts.
- The content security policy is enforced on `ui-redesign` (5.7). It
  reaches the live site when `main` next moves.
- The data scripts reach the hosted database through the tunnel.

Needed from the owner:
- The university's final evaluation criteria and scale (D13), entered on
  Evaluations > Final evaluation form.
- The approved privacy notice text, the photo retention period and the
  Data Protection Officer's contact (D10).
- SMTP settings on Railway, if any email is wanted (password recovery,
  deadline reminders, both summary emails). Without them none is sent.
- The Railway plan decision before the trial credit ends (D15).
- The phone checks in `DEPLOY.md`, on a real Android phone and iPhone.

## Decisions needed

Answers needed before Phase 1 starts are marked **(now)**.

**Confirmations: all answered on 2026-10-10** (from the owner's dashboard
screenshots)
- **C1. Production branch:** `main` on both. Vercel Branch Tracking is
  `main`; Railway's "Branch connected to production" is `main`.
- **C2. Variables.** Railway has exactly six: `CORS_ORIGINS`,
  `DATABASE_PUBLIC_URL`, `FRONTEND_URL`, `JWT_SECRET`, `NODE_ENV`,
  `PRIVATE_UPLOAD_DIR`. No `SMTP_*`, `WEB_PUSH_*` or `AZURE_*`, so email
  and push are off in production. Vercel has `VITE_API_URL` for Production
  only (not Preview).
- **C3. Backups: not available.** Railway backups need the Pro plan; the
  uploads volume has none. Backups are manual (item 1.2).
- **C4. URLs:** frontend `https://internet-psu.vercel.app` and
  `https://inter-net-updated.vercel.app`; backend
  `https://internetupdated-production.up.railway.app`.
- **C5. Auto-deploy:** on for both. Railway's "Wait for CI" exists and is
  off.
- **C6. Railway plan:** trial, "23 days or $4.43 left" on 2026-10-10.
  **Open:** what happens when it ends (see D15).
**Decisions**
- **D1: answered 2026-10-10, as recommended.** Production-shaped backup. Will you provide a dump of
  production for local migration testing (rule 8)? *Recommend:* yes, from
  Phase 2 on (Phase 1 has no migrations).
- **D2: answered 2026-10-10, as recommended.** Stale local `ui-redesign`. Leave it as it is (behind by 4)?
  *Recommend:* leave it; the rules say not to touch that branch.
- **D3: answered 2026-10-10, as recommended** (switched on after the first
  green run). Should a failing CI block deploys (Vercel and Railway
  "wait for CI")? *Recommend:* yes on both. With direct commits to `main`
  it is the only check before production.
- **D4. CSP `connect-src`: settled.** `https://internetupdated-production.up.railway.app`,
  the value of `VITE_API_URL` on Vercel (C2, C4).
- **D5: answered 2026-10-10, as recommended.** The wipe route's test. Delete it with the route, or
  replace it with a test that the route now returns 404? *Recommend:*
  replace it, which keeps rule 13 intact.
- **D6: built as recommended, awaiting your confirmation.** Offline action max age. *Recommend:* 12 hours
  (`OFFLINE_ACTION_MAX_AGE_HOURS`, default 12).
- **D7: built as recommended (no offline time-in), awaiting your
  confirmation.** Offline time-in. Build it or not; if yes, the sync window in
  hours. *Recommend:* do not build it. The camera check is the proof of
  presence, and a delayed sync weakens it.
- **D8: built as recommended, awaiting your confirmation.** Terms. Structure (for example school year + semester) and what
  "archive" means. *Recommend:* name, start date, end date; closing
  deactivates students and hides the term by default.
- **D9: answered 2026-10-10, as recommended.** Accomplishment at time-out: required, with a 15-character
  minimum? *Recommend:* required, 15 characters, with the draft autosaved.
- **D10: built as recommended, awaiting the approved text and period.**
  Photo retention period and who approves the consent text.
  *Recommend:* leave the purge off until the Data Protection Officer
  confirms a period.
- **D11: answered 2026-10-10, as recommended.** Time-out reminder delay. *Recommend:* 1 hour after the
  scheduled end.
- **D12: skipped as recommended for the student part (`.ics`); say if
  you want any.** Optional items: `.ics` export, per-intern summary PDF,
  announcement read receipts. *Recommend:* skip all three for now.
- **D13: built with a marked sample form, awaiting the real one.** Final evaluation form: the university's criteria and scale,
  to be supplied.
- **D14: built as recommended (3 days), awaiting your confirmation.** Slow-supervisor alert threshold. *Recommend:* 3 days.
- **D15: answered 2026-10-10, as recommended.** Take a full backup now
  (database and uploads, steps in `DEPLOY.md`), and move the Railway
  workspace to the paid Hobby plan before the trial credit runs out
  (about 2 November 2026), so Phase 2 has a live backend to deploy to.
  Both steps are the owner's to do. Hobby does not include Railway's
  backups, so the manual backups stay. The question was:
  After the Railway trial. Move to a paid plan, or take a full
  backup before the credit ends and decide on hosting later? Needed before
  Phase 2, which adds a migration and assumes a live backend.
