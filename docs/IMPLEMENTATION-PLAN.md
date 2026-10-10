# Implementation plan and tracker

The single tracker for the multi-phase work. Items are ticked as they are
finished. Findings behind each adjustment are in `docs/AUDIT-2026-10.md`;
platform steps are in `docs/PLATFORM-CHANGES.md`.

Status: **Phase 1 built and pushed on 2026-10-10.** Phases 2 to 5 are not
started.

## Rules

**Git**
1. All work is on `main`. No feature branches. No commits to `ui-redesign`,
   and that branch is never deleted.
2. Each session starts with `git checkout main` and
   `git pull --ff-only origin main`. If the fast-forward fails, stop.
3. One item = one local commit, with a conventional message
   (`fix(student): ...`).
4. **Never push unless told "push".** Each phase gate gives a push plan:
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

- [ ] **2.1 Adopt `vite-plugin-pwa` (`^1.3.0`).** `injectManifest`, output
  `/service-worker.js`, `injectRegister: false`, `manifest: false`. Port
  the push, `notificationclick` and badge handlers unchanged. Precache the
  build, `index.html` and `offline.html`; exclude `mediapipe/**` and
  `models/**` and serve them `CacheFirst` from versioned runtime caches.
  Network-first navigation with `offline.html` as fallback. No handling of
  API-origin requests. Commit `public/service-worker-killswitch.js` and
  document its use. *First step:* confirm the plugin's Vite 8 support in
  the installed package before relying on it (rule 17).
- [ ] **2.2 Update prompt.** No `skipWaiting()` on install. A waiting
  worker shows "Update available — Reload"; the click posts
  `SKIP_WAITING` and the page reloads on `controllerchange`. Check for
  updates when the page becomes visible.
- [ ] **2.3 Offline read-only data.** `lib/offlineStore.ts` (IndexedDB)
  with per-user copies of: student dashboard, attendance, schedule, tasks,
  notifications; supervisor interns and review count. Offline shows the
  copy with "Showing saved data from <time>". No files, photos or event
  data.
- [ ] **2.4 Purge.** Sign-out, session-guard invalidation and the forced
  password sign-out delete that account's IndexedDB data, drafts and
  queue. A shared-device test procedure is documented.
- [ ] **2.5 Draft autosave** per account for: time-in note, task
  submission notes, complaint description, absence reason (and the
  accomplishment field once 4.S1 exists).
- [ ] **2.6 Offline break / back / time-out queue.** Migration:
  `attendance.recorded_offline` and a `client_request_id` ledger. Routes
  take optional `occurred_at` and `client_request_id` with the validation
  in the brief; repeats return the original success. Frontend queues in
  IndexedDB and replays on `online`, on `visibilitychange`, and through
  Background Sync where available. `ReviewDetail` shows "Recorded while
  offline". **[DECISION D6]**
- [ ] **2.7 Offline time-in.** Default: online only, with an explanation
  and a pointer to the supervisor's "Record time-in". **[DECISION D7]**
- [ ] **2.8 Manifest.** `id`, `lang`, `dir`, `categories`,
  `launch_handler`; remove `orientation`; `screenshots` (placeholders,
  listed for the owner to replace); `shortcuts` through a role-aware
  `/go/:target` route; `mobile-web-app-capable` meta.
- [ ] **2.9 Install experience.** `lib/useInstallPrompt.ts` (moved out of
  the kit's `LoginScreen.tsx`); an install entry on login and each Profile
  page, hidden when standalone; an iOS "Add to Home Screen" guide,
  dismissible; `PushNotificationSettings` explains the iOS install
  requirement.
- [ ] **2.10 Wake lock** while `LivenessCamera` runs; re-acquired on
  visibility, released on unmount, silent where unsupported.
- [ ] **2.11 Persistent storage.** `navigator.storage.persist()` once after
  install.
- [x] **2.12 Push URLs.** Already present (audit item 4). Nothing to do.

**Gate:** report, push plan (backend first), device test checklist.

## Phase 3: Structured data foundations (additive migrations)

- [ ] **3.1 Notification links.** Nullable `notifications.link`,
  `entity_type`, `entity_id`, filled at all 58 creation sites (audit item
  4); `link` in push and event payloads; navigation uses `link` first and
  title matching only for old rows.
- [ ] **3.2 Audit log.** `audit_log` table; a row for each action the
  brief lists; read-only paginated `/coordinator/audit`.
- [ ] **3.3 Companies.** `companies` table; nullable `company_id` keys
  (`NOT VALID`) on `students`, `supervisors`, `complaints`; the text
  columns stay. `scripts/backfill-companies.ts` (prints a proposed mapping;
  writes only with `--confirm`). CRUD at `/coordinator/companies`; a
  company picker in the forms. *Note:* `GET /api/coordinator/companies`
  already exists and returns distinct names for announcements; its
  response must stay compatible.
- [ ] **3.4 Terms.** `terms` table, nullable `students.term_id`, a term
  selector filtering the coordinator console; closing a term deactivates
  its students and never deletes them. **[DECISION D8]**
- [ ] **3.5 Pagination.** Optional `limit`, `offset`, `q`, `status`,
  `from`, `to` on: coordinator students, supervisors, complaints,
  documents; supervisor attendance; discrepancies. With `limit`, a `total`
  field; without it, unchanged. Heavy pages move to server paging in the
  same commit as their endpoint. Tests: first page, last page, past the
  end, role scoping.

**Gate:** report, push plan, the backfill proposal format.

## Phase 4: Role features

### Student
- [ ] **4.S1 Accomplishment at time-out.** `attendance.accomplishments`;
  shown in `ReviewDetail` and on `DtrSheet`. **[DECISION D9]**
- [ ] **4.S2 Weekly journal.** `journals` (unique per student per week); a
  `journal` kind in the supervisor queue; shown in the coordinator's
  student record.
- [ ] **4.S3 Completion page** `/student/completion`; a one-time "Request
  completion review".
- [ ] **4.S4 Contact details.** Phone and emergency contact, edited by the
  student, visible to supervisor and coordinator.
- [ ] **4.S5 My coordinator** on Profile and Schedule.
- [ ] **4.S6 Privacy consent.** `privacy_consent_at` and
  `privacy_consent_version`; a consent screen before the first time-in
  with clearly marked placeholder text; "Download my data"; a retention
  purge script, off unless `PHOTO_RETENTION_DAYS` is set. **[DECISION D10]**
- [ ] **4.S7 Holidays.** `holidays` table managed by the coordinator; the
  schedule, DTR and projections skip them.
- [ ] **4.S8 Forgot-to-time-out reminder,** at most once a day per
  student. **[DECISION D11]**
- [ ] **4.S9 Announcements page** for students and supervisors.
- [ ] **4.S10 Optional:** `.ics` export. **[DECISION D12]**

### Supervisor
- [ ] **4.V1 Daily email digest** at `SUPERVISOR_DIGEST_TIME`; idempotent;
  skipped when nothing waits, when opted out, or without SMTP.
- [ ] **4.V2 Structured final evaluation.** `evaluation_forms` and
  `final_evaluations`. **[DECISION D13]**
- [ ] **4.V3 Time correction** with a required reason, recomputed hours,
  audit row, student notification; refused on logs the coordinator has
  acknowledged. Tests.
- [ ] **4.V4 DTR certification.** `dtr_certifications` (unique per student
  and month); only when every log in the month is decided and closed;
  printed on `DtrSheet`.
- [ ] **4.V5 Bulk decisions** for documents and absences, with the
  partial-failure report of bulk verify.
- [ ] **4.V6 Optional:** per-intern summary PDF. **[DECISION D12]**

### Coordinator
- [ ] **4.C1 Coordinator accounts.** List, create, deactivate, reset; same
  password policy and forced change; cannot deactivate self or the last
  active coordinator.
- [ ] **4.C2 Supervisor CSV import,** mirroring the student import.
- [ ] **4.C3 Import dry run** (`dry_run=true`) on both imports, shown in
  the dialog first.
- [ ] **4.C4 Site visit log.** `site_visits` table and page; visits on the
  company page.
- [ ] **4.C5 Optional:** read receipts on announcements. **[DECISION D12]**

### Cross-cutting
- [ ] **4.X1 Notification preferences.** `notification_preferences` (push
  and email per category), managed from Profile, respected by the
  notification helper and digests. In-app notifications are always kept.

**Gates:** after Student, after Supervisor, after Coordinator and
cross-cutting.

## Phase 5: Data-driven analytics and polish

- [ ] **5.1 Pace projection** per active student, shown in Monitoring
  ("Projected finish", "At risk" filter), the coordinator dashboard, the
  student dashboard and the supervisor's intern dialog.
- [ ] **5.2 Alerts and weekly digest.** Dashboard alerts (slow
  supervisors, MOAs expiring in 30 days, 5+ scheduled days without
  attendance, at-risk students); a weekly coordinator email.
  **[DECISION D14]**
- [ ] **5.3 Exports** gain projections, company summaries and the term
  filter.
- [ ] **5.4 Consistency test** extended to the term and company filters.
- [ ] **5.5 Accessibility.** axe on every page; labels and focus fixed;
  anything not fixed is reported.
- [ ] **5.6 Playwright end-to-end tests** with a fake camera stream, added
  to CI.
- [ ] **5.7 Enforcing CSP** in `vercel.json`, once the report-only header
  has shown no real violations. Pushed only on the owner's word.
  *Known from Phase 1:* `offline.html` has an inline script and an inline
  `onclick`; under an enforced `script-src 'self'` its "Try again" button
  would stop working. Move that script to a file (precached with the page
  in 2.1) before enforcing.

**Gate:** final report, complete platform checklist, field test plan.

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
- **D6. Offline action max age.** *Recommend:* 12 hours
  (`OFFLINE_ACTION_MAX_AGE_HOURS`, default 12).
- **D7. Offline time-in.** Build it or not; if yes, the sync window in
  hours. *Recommend:* do not build it. The camera check is the proof of
  presence, and a delayed sync weakens it.
- **D8. Terms.** Structure (for example school year + semester) and what
  "archive" means. *Recommend:* name, start date, end date; closing
  deactivates students and hides the term by default.
- **D9. Accomplishment at time-out:** required, with a 15-character
  minimum? *Recommend:* required, 15 characters, with the draft autosaved.
- **D10. Photo retention period** and who approves the consent text.
  *Recommend:* leave the purge off until the Data Protection Officer
  confirms a period.
- **D11. Time-out reminder delay.** *Recommend:* 1 hour after the
  scheduled end.
- **D12. Optional items:** `.ics` export, per-intern summary PDF,
  announcement read receipts. *Recommend:* skip all three for now.
- **D13. Final evaluation form:** the university's criteria and scale,
  to be supplied.
- **D14. Slow-supervisor alert threshold.** *Recommend:* 3 days.
- **D15: answered 2026-10-10, as recommended.** Take a full backup now
  (database and uploads, steps in `DEPLOY.md`), and move the Railway
  workspace to the paid Hobby plan before the trial credit runs out
  (about 2 November 2026), so Phase 2 has a live backend to deploy to.
  Both steps are the owner's to do. Hobby does not include Railway's
  backups, so the manual backups stay. The question was:
  After the Railway trial. Move to a paid plan, or take a full
  backup before the credit ends and decide on hosting later? Needed before
  Phase 2, which adds a migration and assumes a live backend.
