# INTERNet system audit, 13 October 2026

Phases 0 to 2 of the "Full System Audit and Improvement Brief". Report only:
no code, migration or setting was changed. Branch `ui-redesign` at `aea952e`
(same as `origin/ui-redesign`); `main` is at `f4ebfa2`.

**How to read the evidence column.** *read* = I read the cited lines in this
pass. *ran* = I ran a command against the repository or the local build in
this pass. *earlier* = established in the Round 2 review of 2026-10-12
(`docs/AUDIT-2026-10.md`) and not repeated here. **UNVERIFIED** = I could not
check it, usually because it lives on Vercel, Railway or a real phone.

**Not done in this pass, said plainly:** Lighthouse was not run. The axe
check was not re-run (last run 2026-10-12). No finding was reproduced in a
browser; the offline findings are from reading the code. Library documents
and free-tier limits were not looked up; that belongs to the workstreams
that need them and is marked where it matters.

**Update, later the same day.** H1, H2, H3, H4, M1, M5 and L4 are fixed
(`CHANGES.md` section 32), and L2 went with H3. M5 as first written was
wrong about `site_visits`: those are about a company, not a student, and
are rightly left out of the download. The owner answered D1 to D7 "as
recommended". The tables below are the audit as it was written, before
the fixes.

---

## Phase 0. What exists

### 0.1 Inventory

| Thing | Count | Where | How counted |
|---|---|---|---|
| API routes | 198, plus 2 `app.use("/api")` middlewares | `backend/src/server.ts` (89), `routes/extensions.ts` (71), `routes/supervisorDesk.ts` (13), `routes/academics.ts` (11), `routes/programme.ts` (10), `routes/console.ts` (2), `routes/deliverables.ts` (2) | ran a script over the seven files; full table in Appendix A |
| Routes with no sign-in | 9 | `POST /api/client-errors`, `GET /api/health`, the two password-reset routes, `GET /api/push/vapid-public-key`, `GET /api/test-db`, three `POST /api/login/*` | ran; each is meant to be public. `/api/test-db` answers 404 when `NODE_ENV=production` (earlier) |
| Frontend routes | 54 `path` entries in one table | `my-pwa/src/App.tsx:180-482`; 45 lazy pages at `App.tsx:116-177` | ran |
| Migrations | 45 (`001` to `045`), next free number 046 | `backend/migrations/` | ran |
| Tables | 48 | `CREATE TABLE` across the migrations | ran |
| Audit rules | 67 | `backend/src/services/audit.ts` | ran |
| API tests | 166 in one file | `backend/test/api.test.cjs` | ran (count) |
| Browser journeys | 30 at the last run | `e2e/tests/journeys.spec.ts` | earlier |

**Background loops.** All four start inside the `app.listen` callback
(`server.ts:9558-9561`, read), so every running copy of the backend runs all
of them.

| Loop | File | Every | What it does | Safe to restart or run twice? |
|---|---|---|---|---|
| Deadline scheduler | `services/deadlineReminders.ts:20-205` | 60 s | task release, weekly deliverable items, deliverable reminders, task deadline reminders (in-app, and email when configured) | Yes. Each step claims its row in the same statement that picks it (`taskRelease.ts:52-58`, `deliverables.ts:159-166`, `ON CONFLICT DO NOTHING` at `deliverables.ts:143,180`). See finding L1 for the cost of that choice |
| Time-out reminders | `services/timeOutReminders.ts:110-128` | its own interval | reminds a student who has not timed out; clears day-old liveness tickets | Not re-read this pass (earlier: claimed through `time_out_reminders`) |
| Digests | `services/digests.ts:180-194` | its own interval | supervisor daily and coordinator weekly digest, claimed through `digest_log` | earlier |
| Notification listener | `services/liveNotifications.ts:84` | always on | PostgreSQL LISTEN, fans out to `/api/events` streams | read (start only) |

### 0.2 Diagram reconciliation

The only architecture diagram in the repository is
`.github/modernize/assessment/engines/facts/architecture-diagram.md`. It was
committed once, in the first commit (`322ec23`), and never touched since
(ran `git log`). Against the code today:

| The diagram says | The code says | Evidence |
|---|---|---|
| "no separate service or repository layer is present in the backend" | 26 service modules and 6 route modules exist beside `server.ts` | ran `ls backend/src/services backend/src/routes` |
| One "Deadline reminder worker" | Three schedulers and a listener (table above) | read `server.ts:9558-9561` |
| Mail is "SMTP" only | An HTTPS mail API route (Resend is named) or SMTP | read `services/mailer.ts:38-39,73-79` |
| Client is "React responsive PWA" and nothing more | Also a hand-written service worker, an IndexedDB store with an offline queue, and an on-device face check (MediaPipe, 19 MB of files plus 3.6 MB of models) | ran `du` on `my-pwa/dist`; read `my-pwa/src/lib/offlineQueue.ts`, `src/service-worker.ts` |
| No audit log, terms, programmes, deliverables, companies | All exist (migrations 019, 021, 037, 045, 020) | ran |
| Version numbers in the stack table | **UNVERIFIED** against `package.json` in this pass | |

The diagram is a picture of the first prototype. It should be redrawn from
the code, not edited.

### 0.3 Feature truth table

| Feature | Roles | Status | Evidence | What is needed |
|---|---|---|---|---|
| Sign-in, 12-hour token, sign-out revokes the token, password change ends every session | all | Works end to end | read `server.ts:1017` (12h), `1021-1024` and `1445` (`revoked_tokens`), `1086,1169` (`auth_version` compared on every request) | nothing |
| Account lock after failed sign-ins | all | Works | read `server.ts:860-985` (kept in `login_attempts`, so it survives a restart) | nothing |
| Time-in with the camera check | student | Works on desktop Chrome; real phones not checked for Round 2 | earlier (journeys); **UNVERIFIED** on phones | the phone checklist in `DEPLOY.md` |
| "Out for lunch", "Back from lunch", time-out while offline | student | Partial: works, but the waiting steps can be erased before they are sent | findings H1 and H2 | fix H1, H2 |
| Time-in while offline | student | Not built, on purpose | read `offlineQueue.ts:18` | decision D1 |
| Tasks, team tasks, tasks released on a later day | supervisor, student | Works; cancelling deletes the rows | read `routes/supervisorDesk.ts:451-494`, `routes/extensions.ts:546-580` | finding H3 |
| Weekly report | student, supervisor | Works | earlier | nothing |
| Documents and deliverables, weekly items, ZIP by group | all | Works | earlier; read `services/deliverables.ts:130-199` | decision D7 on the word |
| Evaluations and the final evaluation | supervisor, coordinator | Works; the final form is still the sample one | read `routes/extensions.ts:3415` | the owner's real form |
| Concerns | all | Works | earlier | nothing |
| In-app notifications and the live stream | all | Works | read `RealtimeNotificationBridge.tsx:95` (a `fetch` with the token in a header, not in the address) | nothing |
| Push notifications | all | Built but switched off unless three `WEB_PUSH_*` values are set | ran (env list); hosted values **UNVERIFIED** | decision D4 |
| Email: password reset, deadline emails, digests | all | Built but switched off unless email is configured. Password reset then answers 503 "temporarily unavailable" | read `server.ts:487-491`, `services/mailer.ts:73-79` | decision D4 |
| Privacy consent before use | student | Built but switched off (`PRIVACY_CONSENT_REQUIRED` must be exactly `true`); the notice text is marked a placeholder | read `services/privacy.ts:28,71` | the owner's real notice, then the switch |
| Deleting old time-in photos | system | Built but switched off, and only as a script someone must run; nothing schedules it | read `scripts/purge-photos.ts:5-22` | finding M6 |
| Content Security Policy | all | **Enforced**, not report-only. The brief's note is out of date | read `my-pwa/vercel.json` (header name is `Content-Security-Policy`) | nothing; keep the list of hosts current |
| CI blocks a bad deploy | system | Partial. The workflow only tests. Railway is recorded as waiting for CI since 2026-10-10; Vercel publishes the frontend straight away | read `.github/workflows/ci.yml` (no deploy step), `docs/PLATFORM-CHANGES.md:29`; dashboard **UNVERIFIED** | finding M9 |
| Backup of uploaded files on the hosted volume | system | Script exists; whether it has ever run against the host is **UNVERIFIED** | `scripts/backup-uploads.ts` exists (ran `ls`) | decision D4 (object storage) |
| Restore drill | system | Last run 2026-10-10, when the schema was far smaller than today's 45 migrations | read `DEPLOY.md:306-323` | run it again before "make it live" |
| Download my data | student | Partial: 13 tables, four newer ones missing | finding M5 | fix M5 |
| KPI targets | coordinator | Works and is editable | earlier; migration 043 | fix the stale sentence (0.4) |
| File storage | system | Azure Blob when configured, otherwise local disk. No Cloudflare R2 driver exists | read `services/privateFileStore.ts:1-37` | decision D4 |
| Accessibility check | all | One known violation (a phone link inside a sentence on the supervisor's intern preview) | earlier (A1) | workstream H |

### 0.4 Where the documents disagree

| Subject | One place says | Another says | Which is true |
|---|---|---|---|
| KPI targets | `docs/IMPLEMENTATION-PLAN.md:631` "The KPI targets are fixed constants this phase" | `docs/IMPLEMENTATION-PLAN.md:1037` "5.5 KPI targets editable" | Editable. Line 631 was true for its phase and was never marked as replaced |
| Supervisor top bar | The brief says seven or six | `my-pwa/src/layouts/SupervisorLayout.tsx:30-35` has six: Review, Interns, Attendance, Tasks, Documents, Weekly reports. `IMPLEMENTATION-PLAN.md:862` also says six | Six. I found no "seven" in the repository's documents, so the seven is in the paper or an older note: **UNVERIFIED** where |
| Requirement or deliverable | Table `ojt_requirements`, page `/coordinator/requirements`, and most on-screen text say "requirement" | Phase 5 text and the student reminder say "deliverable" (`services/deliverables.ts:189`) | Both are on screen today. Decision D7 |
| Weekly journal or weekly report | Table `journals`, address `/journal`, API `/api/journals` | Every on-screen string says "Weekly report" (ran a search: no "weekly journal" in interface text) | Screen is consistent. Only the code and addresses keep the old word, which is allowed (addresses must keep working) |
| "Break" or "Out for lunch" | API paths `/break` and `/break-end`; `my-pwa/public/manifest.json` says "Time in, breaks and time out" and "Time in, break and time out" | Buttons say "Out for lunch" and "Back from lunch" | The manifest text is the one place a user reads "break". Small fix |
| CSP | The brief: "still report-only" | `my-pwa/vercel.json`: enforced | Enforced |
| Architecture | The diagram: no service layer, SMTP only | See 0.2 | The code |

---

## Phase 1. Findings, most serious first

Effort: S = under half a day, M = one to two days, L = more.

| # | Severity | Who is hurt | Finding | Evidence | Risk | Fix | Effort |
|---|---|---|---|---|---|---|---|
| H1 | High | Student | Steps recorded offline are erased if the session has ended by the time the phone reconnects. The queue sends through the wrapped `fetch`; a 401 or 403 carrying `SESSION_INVALID` makes the session guard clear the session, and clearing a session erases the queue. The queue's own comment says the opposite ("the steps wait for the next sign-in") | read `lib/sessionGuard.ts:48-52`, `lib/session.ts:67-72`, `lib/offlineStore.ts:111-121`, `lib/offlineQueue.ts:164`; token life `server.ts:1017`. Not reproduced in a browser | A time-out or lunch step pressed offline is lost without a word; the student sees only "Your session has ended". The day then needs a missed time-out request | Keep the queue when a session merely ends; erase it only on a deliberate sign-out. After the same account signs in again, send what waited. Add a journey that proves it | M |
| H2 | High | Student | Signing out with unsent steps gives no warning. The dialog says only "You will need your password to sign in again" and the sign-out then erases them | read `layouts/StudentLayout.tsx:380-388`, `lib/session.ts:90-92` | Same loss as H1, by the student's own hand | Count the waiting steps and say so in the dialog; offer "Send first" when online | S |
| H3 | High | Supervisor, student, coordinator | Records are deleted outright in nine places, against the "no hard deletes" rule: tasks (two routes), evaluations, absences, announcements with their notifications, holidays, DTR certifications, site visits, teams | read `routes/extensions.ts:258,554,799,1278-1288,2607,3388,3982`, `routes/supervisorDesk.ts:289,463` | No trace of what was removed or by whom where the route is also unaudited (H4). A cancelled task also disappears from the intern's history | New nullable columns (`cancelled_at`, `cancelled_by`) from migration 046 on; lists leave cancelled rows out, so the screens look the same. Decide per table: tasks and evaluations first. Deleting a student's own unsent absence notice may be justified and kept | M to L |
| H4 | High | Coordinator (oversight) | Changes to someone else's record that write no audit line: task assign, edit and cancel (single and team), evaluation create, edit and delete, team create, edit and delete | ran the route script against `services/audit.ts`: no rule for `POST /api/tasks`, `PUT`/`DELETE /api/tasks/:id`, the three `/api/tasks/team` routes, `POST`/`PUT`/`DELETE /api/evaluations`, the three `/api/supervisor/teams` routes | The audit page cannot answer "who cancelled this task" or "who changed this score" | Add rules to `AUDIT_RULES`; one test each | S |
| M1 | Medium | Coordinator | Setting a block's schedule reads who is in the block before the transaction starts and on a different connection, then writes inside it | read `routes/programme.ts:421-441` | Two coordinators at once, or a student moved in between, and a student gets two active schedules or is skipped | Read inside the transaction with the same client and lock the students' rows | S |
| M2 | Medium | All | Identifier comparison is done two ways: about 189 plain `= $n` comparisons and about 68 `TRIM(...)` ones. Example in one feature: cancelling one task uses `s.supervisor_id = $2`, cancelling a team task uses `TRIM(s.supervisor_id::text) = TRIM($2::text)` | ran two searches over `backend/src`; read `routes/extensions.ts:558`, `routes/supervisorDesk.ts:457` | If any stored ID has a stray space, some screens show the person and others do not. Whether such IDs exist is **UNVERIFIED** | A read-only script that counts IDs with spaces; trim on write; then one helper for comparisons | M |
| M3 | Medium | All | Attendance times are stored without a time zone (34 such columns) while newer tables use zoned times (42). Correctness depends on two settings staying as they are: the connection's zone and the process zone | read `migrations/001_initial_schema.sql:35,38`, `server.ts:81,230`; ran counts | Any script, report or psql session that forgets the zone reads times eight hours off. This already broke one CI test on 2026-10-12 | Do not change column types. One shared SQL helper for "this moment in Manila", used by scripts too, and a test that fails on a UTC connection | M |
| M4 | Medium | All | Rate limits for crash reports and for failed sign-ins per network live in memory, so a restart clears them and each backend copy counts on its own. Nothing limits signed-in writes or uploads | read `services/clientErrors.ts:51-68`, `server.ts:880-906` | A signed-in account can fill storage with 5 MB or 10 MB uploads | A small per-account limit on upload routes, counted in the database | S to M |
| M5 | Medium | Student | "Download my data" reads 13 tables and misses `attendance_tasks`, `deliverable_items`, `site_visits` and `notification_preferences`. `student_notes` is also absent, which the brief says is intended | ran a search of the route at `routes/extensions.ts:3197-3235` against the table list | The download is not the whole record it claims to be | Add the four; say in `PAPER-CORRECTIONS.md` why notes are excluded | S |
| M6 | Medium | Student (privacy) | Old time-in photos are only removed if someone sets `PHOTO_RETENTION_DAYS` and runs a script by hand. The privacy notice is still marked a placeholder | read `scripts/purge-photos.ts:5-22`, `services/privacy.ts:28` | Photos of faces are kept without limit; the notice cannot promise a period | The owner writes the notice and picks the days; the purge joins the daily loop (off when the variable is unset) | S, plus the owner's text |
| M7 | Medium | Student, supervisor | A step sent offline carries the phone's own clock. The server refuses a future time, one older than 12 hours, and one out of order, and marks the log "recorded offline". Nothing compares the phone's clock with the server's | read `services/offlineActions.ts:22-97`; ran a search for any clock-offset code in `my-pwa/src` (none) | A student can set the phone back and record a time-out up to 12 hours earlier. The supervisor sees the offline mark but not how far the clock was off | Record the phone's offset from the server at the last contact and show it to the reviewer. Tied to decision D1 | M |
| M8 | Medium | All | Uploads are checked by size, extension, declared type and first bytes. A `.docx` is accepted on a zip header alone, and photos uploaded as documents keep their EXIF data, which can include where they were taken | read `server.ts:1549-1640` | Location data from a student's home ends up on file. Time-in photos are safe: they are redrawn on a canvas first (`lib/image.ts:33-45`) | Redraw image documents the same way before upload; workstream D does this anyway | S |
| M9 | Medium | All | The frontend goes live on Vercel without waiting for tests; only the backend waits (and that from a settings page I cannot see) | read `ci.yml`, `docs/PLATFORM-CHANGES.md:29`, `docs/AUDIT-2026-10.md:1036` | A new frontend can be live against an old backend, as happened for about an hour on 2026-10-12 | Vercel's "ignored build step" or required checks. Owner's dashboard step | S |
| M10 | Medium | All | 18 routes have no test that names them, among them `POST /api/logout`, `PUT /api/attendance/:id/break-end`, `PUT /api/supervisors/:supervisorId/password` and both company-record edits | ran the route script against the test files (a text match, so a test that builds the address from parts would be missed) | Regressions in sign-out and "Back from lunch" would go unseen | One test each; list in Appendix A | M |
| L1 | Low | Student | The reminder loops claim before they send. That stops double sends, and it also means a crash between the two loses that one notice | read `services/taskRelease.ts:50-76`, `services/deliverables.ts:156-198` | A missed "New task assigned" notice; the task still appears in the list | Accept and write it down, or clear the claim when the send fails | S |
| L2 | Low | System | Cancelling a team task leaves its deadline-reminder rows and its attachment file behind; cancelling a single task removes both. `task_deadline_reminders` has no foreign key to `tasks` | read `routes/supervisorDesk.ts:463-469`, `routes/extensions.ts:570-573`, `migrations/005_recovery_reminders_push.sql:43-50` | Orphan rows and files | Goes away with H3 (no delete, so nothing is orphaned) | S |
| L3 | Low | All | The token is in `localStorage` | read `my-pwa/src/lib/api.ts:38` | Any script running on the page could read it. The enforced CSP (`script-src 'self'`) is the guard, and the 12-hour life, revocation and `auth_version` limit the damage | Keep, and say so in `PAPER-CORRECTIONS.md`. A cookie would need same-site hosting, which the two hosts do not have | none |
| L4 | Low | All | Copy the house rules forbid is still in the code: the fallback "Something went wrong. Please try again." | read `my-pwa/src/brand/roles.ts:300` | Shown whenever an error has no message of its own | Replace with a sentence that says what to do | S |
| L5 | Low | Coordinator | The two guards answer a dead session differently: 401 from `requireCoordinator`, 403 from `requireRole` | read `server.ts:1088-1091,1171-1175` | None for users (the client goes by the code, not the number). Confusing in logs and tests | Leave; note it | none |
| L6 | Low | Developers | `server.ts` is about 9,560 lines and holds 89 routes | ran `wc` | Slow to review, easy to break | Move routes out only when a workstream touches them | L, spread |
| P1 | Low | Student on mobile data | First time-in downloads about 19 MB of face-check files and 3.6 MB of models, kept afterwards. The app shell itself is small: 120 files, 1.84 MB precached; first screen about 100 KB of script and 19 KB of styles, compressed | ran sizes on `my-pwa/dist` built 2026-10-13 | A slow or costly first time-in | Show the size before the first download; fetch on Wi-Fi when the browser reports it. Web vitals (LCP, INP, CLS) **UNVERIFIED**: Lighthouse not run | S to M |
| P2 | Low | iPhone users | The manifest is complete (id, scope, maskable icons, three shortcuts, narrow and wide screenshots). Missing: iOS start-up images, and `<html lang="en">` while the manifest says `en-PH` | read `my-pwa/public/manifest.json`, `my-pwa/index.html` | A white flash on opening from the home screen on iOS | Workstream A | S |

### Role interaction matrix

Read at file level in this pass for the rows marked *read*; the rest come
from the Round 2 review and were not re-read.

| Trigger | Who is told | In-app, with a link | Live | Push | Email | Journey | Gap |
|---|---|---|---|---|---|---|---|
| Supervisor assigns a task (now or on its release day) | student | yes (*read* `taskRelease.ts:62-68`) | yes | when configured | deadline emails only, when configured | yes | no audit line (H4) |
| Supervisor cancels a task | student, if they had seen it | yes, no link to a record (*read* `supervisorDesk.ts:472-480`) | yes | when configured | no | yes | the task is deleted, so the notice points nowhere (H3) |
| Coordinator sets a block's schedule | each student | yes (*read* `programme.ts:443-451`) | yes | when configured | no | yes | M1 |
| Deliverable due today or tomorrow | student | yes (*read* `deliverables.ts:187-192`) | yes | when configured | no | earlier | wording (D7) |
| Student times in, out, or sends a step offline | supervisor | earlier | earlier | when configured | supervisor digest, when configured | yes | H1, H2, M7 |
| Supervisor verifies or returns a log | student | earlier | earlier | when configured | no | yes | none found |
| Student uploads a document; reviewer decides | reviewer, then student | earlier | earlier | when configured | no | yes | none found |
| Concern raised, replied to, resolved | the other party and coordinators | earlier | earlier | when configured | no | yes | none found |
| Evaluation written, changed or removed | student | earlier | earlier | when configured | no | yes | no audit line (H4); removal is a delete (H3) |

"When configured" for push and email is the whole story today: neither is
set up on a host I can see, so no one has received either outside local
tests. **UNVERIFIED** on staging and production.

---

## Phase 2. Decisions for the owner

Nothing in Phase 3 starts until these are answered.

**D1. Time-in without a connection.**
(a) online only, as now; (b) a provisional offline time-in the supervisor
must confirm; (c) a presence code shown at the workplace; (d) both b and c.
*Recommend (b).* It reuses the offline mark and the supervisor's review that
already exist. Trade-off: the camera check cannot run offline, so a
provisional time-in is weaker proof and must look different to the reviewer.
(c) is stronger but needs every supervisor to show a code each morning.
*Also:* how old may a provisional time-in be when it arrives? Today other
offline steps allow 12 hours. *Recommend 12 hours*, the same, so there is
one rule to explain.

**D2. Pictures attached to entries.**
Which entries: *recommend* the time-out accomplishment note, the weekly
report and concerns. How many: *recommend 3 per entry*, each shrunk to about
1600 px on the phone. May supervisors see pictures on documents that only
the coordinator reviews: *recommend no*, to match who can open the document
today. Trade-off: more pictures mean more storage, which leads to D4.

**D3. Sounds.**
*Recommend off by default, vibration on*, with a switch in Profile.
Trade-off: a sound at time-in in a quiet office is the kind of surprise that
gets an app silenced for good.

**D4. Outside services on free plans.** You create the accounts; keys go
into the host's variables page and are never pasted into chat.
File storage (Cloudflare R2), email (Resend), push (VAPID keys, no account
needed), error monitoring. *Recommend in this order:* push first (free, no
account), then email (password reset is unusable without it), then R2
(uploads currently sit on one disk with no confirmed backup), monitoring
last. Trade-off: each is one more thing that can be misconfigured, and I
have not yet checked this month's free limits; I will check and date each
one before building it.

**D5. Docker.** *Recommend development only.* Trade-off: using it in
production would mean changing how Railway builds a system that currently
deploys cleanly.

**D6. Language.** English only, or English and Filipino. *Recommend English
only for now*, with the text gathered so a second language can be added
later. Trade-off: a half-translated interface reads worse than a consistent
one, and every later string would need two versions.

**D7. One word: requirement or deliverable.** *Recommend "requirement"* on
every screen. It is the word on the coordinator's page, in the address and
in most of the text; "deliverable" appears in only a few Phase 5 strings.
Trade-off: Phase 5 documents and one notification title change wording. No
table or address is renamed either way.

---

## Appendix A. Every API route

Guard is what the route declares before its handler. "Audit" is whether a
rule in `services/audit.ts` names the route. "Test" is a text match of the
path in the API tests and journeys.

| Method | Path | Guard | Extra | File:line | Audit | Test |
|---|---|---|---|---|---|---|
| POST | `/api/client-errors` | NONE |  | server.ts:122 |  | yes |
| GET | `/api/health` | NONE |  | server.ts:146 |  | yes |
| USE | `/api` | NONE |  | server.ts:154 |  | yes |
| POST | `/api/auth/password-reset/request` | NONE |  | server.ts:480 |  | yes |
| POST | `/api/auth/password-reset/confirm` | NONE |  | server.ts:615 |  | yes |
| GET | `/api/events` | coordinator+student+supervisor |  | server.ts:1394 |  | yes |
| POST | `/api/logout` | coordinator+student+supervisor |  | server.ts:1427 |  | none found |
| GET | `/api/push/vapid-public-key` | NONE |  | server.ts:1466 |  | yes |
| POST | `/api/push/subscriptions` | coordinator+student+supervisor |  | server.ts:1475 |  | yes |
| DELETE | `/api/push/subscriptions` | coordinator+student+supervisor |  | server.ts:1519 |  | yes |
| GET | `/api/test-db` | NONE |  | server.ts:1656 |  | yes |
| POST | `/api/login/student` | NONE |  | server.ts:1695 |  | yes |
| POST | `/api/login/supervisor` | NONE |  | server.ts:1811 |  | yes |
| GET | `/api/student/:studentId` | student+supervisor+coordinator |  | server.ts:1924 |  | yes |
| GET | `/api/tasks/student/:studentId` | student |  | server.ts:2008 |  | yes |
| GET | `/api/attendance/:studentId` | student |  | server.ts:2085 |  | yes |
| POST | `/api/attendance/liveness-challenge` | student |  | server.ts:2285 |  | yes |
| POST | `/api/attendance` | student | upload | server.ts:2309 |  | yes |
| PUT | `/api/attendance/:id/break` | student |  | server.ts:2757 |  | yes |
| PUT | `/api/attendance/:id/break-end` | student |  | server.ts:2841 |  | none found |
| PUT | `/api/attendance/:id/time-out` | student |  | server.ts:2927 |  | yes |
| PUT | `/api/attendance/:id/late-time-out` | student |  | server.ts:3235 |  | yes |
| POST | `/api/attendance/:id/resubmit` | student | upload | server.ts:3371 |  | yes |
| GET | `/api/supervisor/attendance/:supervisorId` | supervisor |  | server.ts:3481 |  | yes |
| POST | `/api/supervisor/attendance/record` | supervisor | upload | server.ts:3647 | yes | yes |
| GET | `/api/supervisor/review-count` | supervisor |  | server.ts:3766 |  | yes |
| GET | `/api/supervisor/dashboard/:supervisorId` | supervisor |  | server.ts:3804 |  | none found |
| PATCH | `/api/attendance/:id/times` | supervisor |  | server.ts:3977 | yes | yes |
| PATCH | `/api/attendance/:id/status` | supervisor+coordinator |  | server.ts:4162 | yes | yes |
| GET | `/api/dashboard/:studentId` | student |  | server.ts:4409 |  | yes |
| POST | `/api/complaints` | student | upload | server.ts:4648 |  | yes |
| GET | `/api/complaints/student/:studentId` | student |  | server.ts:4854 |  | yes |
| GET | `/api/notifications/student/:studentId` | student |  | server.ts:4932 |  | yes |
| GET | `/api/notifications/:studentId` | student |  | server.ts:4980 |  | yes |
| GET | `/api/notifications/student/:studentId/unread-count` | student |  | server.ts:5052 |  | none found |
| PUT | `/api/notifications/:id/read` | student+supervisor+coordinator |  | server.ts:5117 |  | yes |
| PUT | `/api/notifications/student/:studentId/read-all` | student |  | server.ts:5197 |  | none found |
| PUT | `/api/notifications/read-all` | student+supervisor+coordinator |  | server.ts:5253 |  | yes |
| GET | `/api/ojt-schedule/:studentId` | student |  | server.ts:5293 |  | yes |
| GET | `/api/company/:studentId` | student |  | server.ts:5371 |  | none found |
| POST | `/api/login/coordinator` | NONE |  | server.ts:5419 |  | yes |
| GET | `/api/coordinator/students` | coordinator |  | server.ts:5500 |  | yes |
| POST | `/api/coordinator/students` | coordinator |  | server.ts:5677 | yes | yes |
| PUT | `/api/coordinator/students/:studentId` | coordinator |  | server.ts:5783 | yes | yes |
| PATCH | `/api/coordinator/students/:studentId/status` | coordinator |  | server.ts:5920 | yes | yes |
| GET | `/api/coordinator/supervisors` | coordinator |  | server.ts:5981 |  | yes |
| GET | `/api/coordinator/search` | coordinator |  | server.ts:6015 |  | yes |
| POST | `/api/coordinator/supervisors` | coordinator |  | server.ts:6109 | yes | yes |
| PUT | `/api/coordinator/supervisors/:supervisorId` | coordinator |  | server.ts:6170 | yes | yes |
| PATCH | `/api/coordinator/supervisors/:supervisorId/status` | coordinator |  | server.ts:6225 | yes | yes |
| GET | `/api/coordinator/discrepancies` | coordinator |  | server.ts:6315 |  | yes |
| GET | `/api/coordinator/dashboard` | coordinator |  | server.ts:6423 |  | yes |
| GET | `/api/coordinator/monitoring` | coordinator |  | server.ts:6559 |  | yes |
| GET | `/api/coordinator/complaints` | coordinator |  | server.ts:6697 |  | yes |
| PATCH | `/api/coordinator/complaints/:id/resolve` | coordinator |  | server.ts:6751 | yes | yes |
| GET | `/api/coordinator/analytics` | coordinator |  | server.ts:6882 |  | yes |
| POST | `/api/tasks` | supervisor | upload | server.ts:7171 |  | yes |
| GET | `/api/tasks/supervisor/:supervisorId` | supervisor |  | server.ts:7295 |  | yes |
| POST | `/api/tasks/:id/submit` | student | upload | server.ts:7342 |  | yes |
| PATCH | `/api/tasks/:id/review` | supervisor |  | server.ts:7433 | yes | yes |
| POST | `/api/evaluations` | student+supervisor+coordinator |  | server.ts:7529 |  | yes |
| GET | `/api/coordinator/evaluations` | coordinator |  | server.ts:7647 |  | yes |
| GET | `/api/evaluations/student/:studentId` | student+supervisor |  | server.ts:7678 |  | yes |
| GET | `/api/notifications/supervisor/:supervisorId` | supervisor |  | server.ts:7730 |  | yes |
| GET | `/api/notifications/coordinator/:coordinatorId` | coordinator |  | server.ts:7754 |  | yes |
| GET | `/api/students/:studentId/profile` | student |  | server.ts:7789 |  | yes |
| PUT | `/api/students/:studentId/profile` | student |  | server.ts:7857 |  | yes |
| PUT | `/api/students/:studentId/contact` | student |  | server.ts:7923 |  | yes |
| PUT | `/api/students/:studentId/password` | student |  | server.ts:7984 |  | yes |
| GET | `/api/supervisors/:supervisorId/profile` | supervisor |  | server.ts:8015 |  | yes |
| PUT | `/api/supervisors/:supervisorId/profile` | supervisor |  | server.ts:8063 |  | yes |
| PUT | `/api/supervisors/:supervisorId/password` | supervisor |  | server.ts:8115 |  | none found |
| GET | `/api/coordinators/:coordinatorId/profile` | coordinator |  | server.ts:8146 |  | yes |
| PUT | `/api/coordinators/:coordinatorId/profile` | coordinator |  | server.ts:8184 |  | yes |
| PUT | `/api/coordinators/:coordinatorId/password` | coordinator |  | server.ts:8251 |  | yes |
| GET | `/api/supervisor/:supervisorId/interns` | supervisor |  | server.ts:8292 |  | yes |
| POST | `/api/complaints/supervisor` | supervisor | upload | server.ts:8377 |  | yes |
| GET | `/api/complaints/supervisor/:supervisorId` | supervisor |  | server.ts:8479 |  | none found |
| GET | `/api/ojt-requirements` | student+supervisor+coordinator |  | server.ts:8536 |  | yes |
| POST | `/api/coordinator/requirements` | coordinator |  | server.ts:8593 | yes | yes |
| PUT | `/api/coordinator/requirements/:id` | coordinator |  | server.ts:8659 | yes | yes |
| GET | `/api/coordinator/students/:studentId/schedule` | coordinator |  | server.ts:8764 |  | yes |
| PUT | `/api/coordinator/students/:studentId/schedule` | coordinator |  | server.ts:8789 | yes | yes |
| POST | `/api/documents` | student |  | server.ts:8862 |  | yes |
| GET | `/api/documents/student` | student |  | server.ts:8971 |  | none found |
| GET | `/api/documents/supervisor` | supervisor |  | server.ts:9002 |  | yes |
| GET | `/api/coordinator/documents` | coordinator |  | server.ts:9043 |  | yes |
| PATCH | `/api/documents/:documentId/review` | supervisor+coordinator |  | server.ts:9149 | yes | yes |
| GET | `/api/documents/:documentId/file` | student+supervisor+coordinator |  | server.ts:9262 | yes | yes |
| GET | `/api/uploads/:filename` | coordinator+supervisor+student | uploads | server.ts:9326 | yes | yes |
| USE | `/api` | NONE |  | server.ts:9470 |  | yes |
| POST | `/api/absences` | student |  | routes/extensions.ts:164 |  | yes |
| GET | `/api/absences/student/:studentId` | student |  | routes/extensions.ts:229 |  | yes |
| DELETE | `/api/absences/:id` | student |  | routes/extensions.ts:251 |  | yes |
| GET | `/api/absences/supervisor` | supervisor |  | routes/extensions.ts:291 |  | none found |
| GET | `/api/coordinator/absences` | coordinator |  | routes/extensions.ts:313 |  | yes |
| PATCH | `/api/absences/:id/review` | supervisor+coordinator |  | routes/extensions.ts:333 | yes | yes |
| PUT | `/api/tasks/:id` | supervisor | upload | routes/extensions.ts:425 |  | yes |
| DELETE | `/api/tasks/:id` | supervisor |  | routes/extensions.ts:546 |  | yes |
| POST | `/api/tasks/:id/review/undo` | supervisor |  | routes/extensions.ts:605 | yes | yes |
| POST | `/api/documents/:id/review/undo` | supervisor |  | routes/extensions.ts:648 | yes | yes |
| GET | `/api/supervisor/interns/:studentId/schedule` | supervisor |  | routes/extensions.ts:705 |  | yes |
| PUT | `/api/evaluations/:id` | supervisor+coordinator |  | routes/extensions.ts:746 |  | yes |
| DELETE | `/api/evaluations/:id` | supervisor+coordinator |  | routes/extensions.ts:789 |  | yes |
| POST | `/api/coordinator/students/import` | coordinator |  | routes/extensions.ts:840 | yes | yes |
| POST | `/api/coordinator/supervisors/import` | coordinator |  | routes/extensions.ts:1031 | yes | yes |
| GET | `/api/coordinator/announcements` | coordinator |  | routes/extensions.ts:1158 |  | yes |
| POST | `/api/coordinator/announcements` | coordinator |  | routes/extensions.ts:1172 | yes | yes |
| GET | `/api/coordinator/companies` | coordinator |  | routes/extensions.ts:1254 |  | yes |
| DELETE | `/api/coordinator/announcements/:id` | coordinator |  | routes/extensions.ts:1272 | yes | yes |
| POST | `/api/coordinator/attendance/:id/acknowledge` | coordinator |  | routes/extensions.ts:1312 | yes | yes |
| POST | `/api/coordinator/supervisors/:supervisorId/reassign` | coordinator |  | routes/extensions.ts:1345 | yes | yes |
| GET | `/api/coordinator/students/:studentId/overview` | coordinator |  | routes/extensions.ts:1418 | yes | yes |
| POST | `/api/coordinator/:kind/:id/reset-password` | coordinator |  | routes/extensions.ts:1531 | yes | yes |
| GET | `/api/announcements` | student+supervisor |  | routes/extensions.ts:1597 |  | yes |
| GET | `/api/coordinator/company-records` | coordinator |  | routes/extensions.ts:1714 |  | yes |
| POST | `/api/coordinator/company-records` | coordinator |  | routes/extensions.ts:1769 | yes | yes |
| PUT | `/api/coordinator/company-records/:id` | coordinator |  | routes/extensions.ts:1814 | yes | none found |
| PATCH | `/api/coordinator/company-records/:id/status` | coordinator |  | routes/extensions.ts:1879 | yes | none found |
| GET | `/api/coordinator/terms` | coordinator |  | routes/extensions.ts:1946 |  | yes |
| POST | `/api/coordinator/terms` | coordinator |  | routes/extensions.ts:1961 | yes | yes |
| PUT | `/api/coordinator/terms/:id` | coordinator |  | routes/extensions.ts:1986 | yes | yes |
| POST | `/api/coordinator/terms/:id/students` | coordinator |  | routes/extensions.ts:2014 | yes | none found |
| POST | `/api/coordinator/terms/:id/close` | coordinator |  | routes/extensions.ts:2057 | yes | yes |
| POST | `/api/coordinator/terms/:id/reopen` | coordinator |  | routes/extensions.ts:2120 | yes | yes |
| GET | `/api/coordinator/audit/export` | coordinator |  | routes/extensions.ts:2307 | yes | yes |
| GET | `/api/coordinator/audit` | coordinator |  | routes/extensions.ts:2354 |  | yes |
| GET | `/api/complaints/:id/messages` | student+supervisor+coordinator |  | routes/extensions.ts:2424 |  | yes |
| POST | `/api/complaints/:id/messages` | student+supervisor+coordinator |  | routes/extensions.ts:2448 |  | yes |
| GET | `/api/holidays` | student+supervisor+coordinator |  | routes/extensions.ts:2538 |  | yes |
| POST | `/api/coordinator/holidays` | coordinator |  | routes/extensions.ts:2554 | yes | yes |
| PUT | `/api/coordinator/holidays/:id` | coordinator |  | routes/extensions.ts:2574 | yes | yes |
| DELETE | `/api/coordinator/holidays/:id` | coordinator |  | routes/extensions.ts:2601 | yes | yes |
| GET | `/api/journals/student/:studentId` | student |  | routes/extensions.ts:2689 |  | yes |
| PUT | `/api/journals/student/:studentId/:weekStart` | student |  | routes/extensions.ts:2712 |  | yes |
| GET | `/api/journals/supervisor` | supervisor |  | routes/extensions.ts:2812 |  | yes |
| PATCH | `/api/journals/:id/review` | supervisor |  | routes/extensions.ts:2834 | yes | yes |
| GET | `/api/students/:studentId/completion` | student |  | routes/extensions.ts:3050 |  | yes |
| POST | `/api/students/:studentId/completion/request` | student |  | routes/extensions.ts:3069 |  | yes |
| GET | `/api/students/:studentId/privacy` | student |  | routes/extensions.ts:3132 |  | yes |
| POST | `/api/students/:studentId/privacy/consent` | student |  | routes/extensions.ts:3157 | yes | yes |
| GET | `/api/students/:studentId/data-export` | student |  | routes/extensions.ts:3197 | yes | yes |
| GET | `/api/dtr-certifications/:studentId` | student+supervisor+coordinator |  | routes/extensions.ts:3281 |  | yes |
| POST | `/api/dtr-certifications` | supervisor |  | routes/extensions.ts:3312 | yes | yes |
| DELETE | `/api/dtr-certifications/:id` | supervisor |  | routes/extensions.ts:3381 | yes | yes |
| GET | `/api/evaluation-form` | student+supervisor+coordinator |  | routes/extensions.ts:3434 |  | yes |
| PUT | `/api/coordinator/evaluation-form` | coordinator |  | routes/extensions.ts:3447 | yes | yes |
| GET | `/api/supervisor/final-evaluations` | supervisor |  | routes/extensions.ts:3504 |  | yes |
| GET | `/api/final-evaluations/:studentId` | student+supervisor+coordinator |  | routes/extensions.ts:3522 |  | yes |
| PUT | `/api/final-evaluations/:studentId` | supervisor |  | routes/extensions.ts:3554 | yes | yes |
| GET | `/api/notification-preferences` | student+supervisor+coordinator |  | routes/extensions.ts:3655 |  | yes |
| PUT | `/api/notification-preferences` | student+supervisor+coordinator |  | routes/extensions.ts:3680 |  | yes |
| GET | `/api/coordinator/coordinators` | coordinator |  | routes/extensions.ts:3742 |  | yes |
| POST | `/api/coordinator/coordinators` | coordinator |  | routes/extensions.ts:3757 | yes | yes |
| PATCH | `/api/coordinator/coordinators/:id/status` | coordinator |  | routes/extensions.ts:3809 | yes | none found |
| GET | `/api/coordinator/site-visits` | coordinator |  | routes/extensions.ts:3907 |  | yes |
| POST | `/api/coordinator/site-visits` | coordinator |  | routes/extensions.ts:3926 | yes | yes |
| PUT | `/api/coordinator/site-visits/:id` | coordinator |  | routes/extensions.ts:3951 | yes | none found |
| DELETE | `/api/coordinator/site-visits/:id` | coordinator |  | routes/extensions.ts:3976 | yes | none found |
| GET | `/api/projections` | student+supervisor+coordinator |  | routes/extensions.ts:4006 |  | yes |
| GET | `/api/coordinator/alerts` | coordinator |  | routes/extensions.ts:4033 |  | yes |
| GET | `/api/coordinator/report` | coordinator |  | routes/extensions.ts:4045 |  | yes |
| GET | `/api/coordinator/actions` | coordinator |  | routes/console.ts:31 |  | yes |
| GET | `/api/coordinator/kpis` | coordinator |  | routes/console.ts:44 |  | yes |
| GET | `/api/coordinator/academics` | coordinator |  | routes/academics.ts:38 |  | yes |
| POST | `/api/coordinator/colleges` | coordinator |  | routes/academics.ts:76 | yes | yes |
| PUT | `/api/coordinator/colleges/:id` | coordinator |  | routes/academics.ts:97 | yes | none found |
| POST | `/api/coordinator/programs` | coordinator |  | routes/academics.ts:158 | yes | yes |
| PUT | `/api/coordinator/programs/:id` | coordinator |  | routes/academics.ts:180 | yes | yes |
| POST | `/api/coordinator/majors` | coordinator |  | routes/academics.ts:220 | yes | yes |
| PUT | `/api/coordinator/majors/:id` | coordinator |  | routes/academics.ts:240 | yes | none found |
| POST | `/api/coordinator/blocks` | coordinator |  | routes/academics.ts:315 | yes | yes |
| PUT | `/api/coordinator/blocks/:id` | coordinator |  | routes/academics.ts:343 | yes | yes |
| GET | `/api/coordinator/blocks/:id/students` | coordinator |  | routes/academics.ts:377 |  | yes |
| POST | `/api/coordinator/blocks/:id/students` | coordinator |  | routes/academics.ts:404 | yes | yes |
| GET | `/api/supervisor/schedules` | supervisor |  | routes/supervisorDesk.ts:79 |  | yes |
| GET | `/api/supervisor/site-visit` | supervisor |  | routes/supervisorDesk.ts:104 |  | yes |
| GET | `/api/supervisor/announcement-unread` | supervisor |  | routes/supervisorDesk.ts:130 |  | yes |
| GET | `/api/supervisor/teams` | supervisor |  | routes/supervisorDesk.ts:197 |  | yes |
| POST | `/api/supervisor/teams` | supervisor |  | routes/supervisorDesk.ts:206 |  | yes |
| PUT | `/api/supervisor/teams/:id` | supervisor |  | routes/supervisorDesk.ts:238 |  | yes |
| DELETE | `/api/supervisor/teams/:id` | supervisor |  | routes/supervisorDesk.ts:283 |  | yes |
| POST | `/api/tasks/team` | supervisor |  | routes/supervisorDesk.ts:327 |  | yes |
| PUT | `/api/tasks/team/:groupTaskId` | supervisor |  | routes/supervisorDesk.ts:400 |  | yes |
| DELETE | `/api/tasks/team/:groupTaskId` | supervisor |  | routes/supervisorDesk.ts:451 |  | yes |
| GET | `/api/student-notes/:studentId` | supervisor+coordinator |  | routes/supervisorDesk.ts:511 |  | yes |
| POST | `/api/student-notes/:studentId` | supervisor+coordinator |  | routes/supervisorDesk.ts:529 | yes | yes |
| POST | `/api/coordinator/supervisors/:supervisorId/remind` | coordinator |  | routes/supervisorDesk.ts:585 | yes | yes |
| GET | `/api/coordinator/performance` | coordinator |  | routes/programme.ts:76 |  | yes |
| GET | `/api/coordinator/students/:studentId/performance` | coordinator |  | routes/programme.ts:90 |  | yes |
| PUT | `/api/coordinator/kpi-targets` | coordinator |  | routes/programme.ts:105 | yes | yes |
| GET | `/api/coordinator/filter-views` | coordinator |  | routes/programme.ts:171 |  | yes |
| POST | `/api/coordinator/filter-views` | coordinator |  | routes/programme.ts:184 |  | yes |
| DELETE | `/api/coordinator/filter-views/:id` | coordinator |  | routes/programme.ts:223 |  | yes |
| GET | `/api/coordinator/documents/zip` | coordinator |  | routes/programme.ts:245 | yes | yes |
| GET | `/api/coordinator/terms/:id/setup` | coordinator |  | routes/programme.ts:346 |  | yes |
| POST | `/api/coordinator/blocks/:id/schedule/preview` | coordinator |  | routes/programme.ts:391 |  | yes |
| PUT | `/api/coordinator/blocks/:id/schedule` | coordinator |  | routes/programme.ts:412 | yes | yes |
| PUT | `/api/coordinator/requirements/:id/deliverable` | coordinator |  | routes/deliverables.ts:33 | yes | yes |
| GET | `/api/students/:studentId/deliverables` | student |  | routes/deliverables.ts:82 |  | yes |
