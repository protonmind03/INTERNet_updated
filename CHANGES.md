# What was added

## 1. Setup — run this first
1. `cd backend && npm install` (adds `bcryptjs` and `jsonwebtoken`, already in package.json)
2. Copy `backend/.env.example` to `backend/.env` and fill in your real
   `DATABASE_PUBLIC_URL`. **Variable names are case-sensitive** — your old
   `.env` had `database_public_url` (lowercase), which the code can't read
   locally; only worked before because Railway injects the uppercase
   version automatically in production.
3. For a **new local prototype database**, create an empty PostgreSQL database
   (for example, `internet_ojt`) in pgAdmin, configure its connection URL in
   `backend/.env`, then run `npm run db:migrate` from `backend`. The migration
   runner applies `001_initial_schema.sql`, `002_coordinator_and_extensions.sql`,
   `003_supervisor_complaints.sql`, `004_documents.sql`, and
   `005_recovery_reminders_push.sql` in order.
   Migrations are transactional and safe to re-run.
   The initial schema is inferred from the current API queries and is not a
   verified copy of any earlier production database schema.
   Set `DATABASE_PUBLIC_URL` to a URL such as
   `postgresql://postgres:<password>@localhost:5432/internet_ojt`.
   Keep the password local; URL-encode reserved characters in it.
   Localhost connections use PostgreSQL's local non-SSL mode; remote database
   connections retain the backend's TLS setting.
   The frontend API base URL is centralized in `my-pwa/src/lib/api.ts` and can
   be overridden with `VITE_API_URL`. The backend's default port is 5000 and
   every example uses it. If something else on your machine already uses
   5000, set `PORT` in `backend/.env` and the same port in
   `my-pwa/.env.local`; the API tests follow `backend/.env`.
4. To add repeatable local-only test users and sample OJT schedules/tasks,
   run `npm run db:seed-demo` from `backend`. The command refuses non-loopback
   hosts and any database other than `internet_ojt`.
   - Student: `student.demo@internet.test` / `StudentDemo123!`
   - Supervisor: `supervisor.demo@internet.test` / `SupervisorDemo123!`
5. Default coordinator login seeded by the migration:
   `coordinator@internet.psu.edu.ph` / `Coordinator123!` — change this
   after first login from `/coordinator/profile`.
   In Vite development, selecting a role prefills that role's local demo
   credentials; production builds do not include or prefill any demo password.
   Demo accounts are for local testing only.

## Architecture alignment decisions and paper draft
- For this prototype, PostgreSQL is the selected database. An architecture-
  aligned draft copy of the paper is in
  [CC106 GROUP 9 - architecture-aligned draft.docx](./CC106%20GROUP%209%20-%20architecture-aligned%20draft.docx);
  the source document was left unchanged.
- The React/Vite PWA is the selected client architecture for web and mobile.
  The project owner confirmed there will not be a separate Flutter client for
  this prototype. The draft updates the architecture and stack descriptions,
  schema summary, and feature/data-flow traceability to match that choice.
- The schema summary is based on the local PostgreSQL migrations. The embedded
  architecture, use-case, context, DFD, ERD, and module figures in the draft
  were redrawn against the implemented prototype; the original cover art was
  retained. The current prototype schema does not declare foreign-key
  constraints, and its initial migration is not a verified copy of any earlier
  production schema.
- The supervisor dashboard and student company-information API routes are
  implemented in the backend. Their database-backed behavior still requires
  validation against a migrated local database.
- The backend supports authenticated live notification streams over
  server-sent events, standard browser Web Push subscriptions, SMTP password
  recovery, and 24-hour/on-deadline task reminders. Live events are fanned out
  through PostgreSQL notifications. Background push requires HTTPS in
  deployment plus configured VAPID keys; mail delivery requires SMTP secrets.
- Attendance images, complaint evidence, task attachments, and student
  documents use private Azure Blob Storage when `AZURE_STORAGE_CONNECTION_STRING`
  is configured. Local development falls back to private local disk, which is
  not durable on ephemeral hosts. Blob containers are private, and downloads
  continue to require record-level API authorization.
- Task reminders use a task's due date at 23:59:59 Philippine time and are
  sent once 24 hours before and once at the deadline. In-app reminders are
  persisted; failed SMTP delivery remains queued for retry.
- Coordinator analytics can currently be exported as CSV; PDF report
  generation is not included.
- Attendance accepts an image and prompts for camera input where supported, but
  browser file inputs cannot guarantee that the image was freshly captured at
  the time of logging.

## 2. Coordinator role (was completely missing)
- New third login option on the Login screen (indigo accent, separate
  from Student/Supervisor).
- Own portal at `/coordinator/*` with its own sidebar/layout — visually
  and functionally separate from the student and supervisor apps, since
  the coordinator manages both.
- Pages: Dashboard, Students, Supervisors, Monitoring, Complaints,
  Evaluations, Analytics.

## 3. User Management (was missing)
- Coordinator can register, edit, and deactivate both student and
  supervisor accounts (`students`/`supervisors` now have `is_active`).
- New accounts get bcrypt-hashed passwords. Old accounts still log in —
  `verifyPassword` accepts either a hash or a legacy plain-text match.

## 4. Task Assignment & Submission (was half-built)
- The student `task.tsx` page already had a "Submitted" status in its
  types, but nothing ever wrote a submission — there was no way to
  actually submit. Added a "Submit completed work" button + modal (notes
  + optional file) that POSTs to `/api/tasks/:id/submit`.
- New supervisor page `/supervisor/tasks` (the dashboard already linked
  to this route, but the page didn't exist) — assign tasks to interns
  and review/approve or send back submissions.
- Status now really flows: `Pending → In Progress → Submitted →
  Reviewed`, with notifications at each step.

## 5. Evaluation & Feedback (was missing)
- `evaluations` table + `POST /api/evaluations` +
  `GET /api/evaluations/student/:id` + coordinator-wide view.

## 6. Complaint Resolution (was missing)
- Complaints could be filed but never resolved. Added `resolved_by`,
  `resolution_notes`, `resolved_at` + coordinator resolve/dismiss flow
  with a notification back to the student who filed it.

## 7. Notifications (previously never written anywhere)
- Added a `createNotification()` helper and wired it into: attendance
  approve/reject, task assign/submit/review, complaint resolution,
  evaluations.
- Notifications table now supports supervisor and coordinator recipients
  too, not just students.
- Authenticated sessions receive live in-app notifications over a
  PostgreSQL-backed server-sent event stream. Users can opt a browser into
  VAPID-based background push; expired subscriptions are removed when the
  push service reports them as gone.

## 8. Password recovery and deadline reminders
- Password recovery uses single-use, hashed, 30-minute tokens, generic
  account-enumeration-safe responses, a per-account cooldown, IP rate
  limiting, and session invalidation after a successful reset.
- SMTP sends reset links and task deadline emails. SMTP credentials are
  deployment secrets and must not be committed.
- A PostgreSQL-backed reminder queue sends one in-app and email reminder
  24 hours before and at each pending task's deadline (23:59:59 Asia/Manila).
  Failed email deliveries remain queued for retry.

## 9. Security
- Passwords: bcrypt for all new accounts (see #3).
- JWT auth added for the coordinator's endpoints (`/api/coordinator/*`)
  — you need `Authorization: Bearer <token>` from the login response.
  Student/supervisor endpoints were left as-is to avoid breaking the
  existing app; consider migrating those to the same pattern next.
- `required_hours` moved from a hardcoded `180` in the dashboard route
  into a real per-student column.

## 10. Branding
- Your logo is now the favicon, apple-touch-icon, and PWA manifest icon
  (`public/icon-192.png`, `public/icon-512.png`, `public/manifest.json`).
  The app is now actually installable as a PWA, matching what the design
  doc describes.

## 10. UI refresh (coordinator portal), based on a reference dispatch-system UI
- Sidebar: switched from dark to a white theme with grouped sections
  (Overview / Management / Oversight), indigo left-accent bar on the
  active item, and a "Register Student" quick-action card at the bottom.
- Topbar: added a coordinator-only search across student, supervisor, and
  complaint records; selecting a result opens its filtered management page.
  A breadcrumb row appears under the topbar on every coordinator page.
- Dashboard: stat cards are colored (indigo/amber/red/emerald) with icons.
  The misleading "live" pulse indicator was removed because dashboard data
  is fetched on request rather than updated through live server push.
- Students & Supervisors tables: added avatar-initials chips per row,
  icon-only edit/activate buttons (amber pencil, red/green toggle)
  instead of text buttons, and a "Showing N entries" line above the
  table.
- Monitoring, Complaints, Evaluations, Analytics pages were left as they
  were — same visual pattern can be extended to them on request.

## 11. Full responsiveness + dead-button audit (this round)

I wrote a script comparing every `navigate(...)` / `href` call in the app
against every registered route, which surfaced real, pre-existing bugs:

**App-wide mobile bug (all 9 major pages):** every sidebar was a fixed
240px `<aside>` with no responsive breakpoint at all — on a phone screen
this either overflows horizontally or crushes the content into a sliver.
Fixed on: student dashboard, daily log, tasks, documents, schedule,
report, notifications, and both supervisor pages (dashboard, attendance).
Each now hides the sidebar on mobile behind a hamburger button and slides
it in as a drawer with a backdrop and close button; desktop is unchanged.

**Dead buttons found and fixed** (wrong route strings, `href="#"` with no
handler, or `onClick={() => {}}` that did nothing):
- "My Tasks", "OJT Schedule", "Report Complaint" nav items pointed at
  `/my-tasks`, `/ojt-schedule`, `/report-complaint`, `/student/tasks` —
  none of which were ever registered routes. Fixed to the real paths
  (`/task`, `/schedule`, `/report`).
- "Profile" was dead on **every single page that had it** (task, daily
  log, documents, notifications, schedule, student dashboard) — some had
  no route to go to (see Profile Management below), some had no handler
  at all.
- `sched.tsx` and `document.tsx` had **no way to sign out** — their Sign
  Out button was `href="#"` and neither file even had a logout function
  defined. Both now have the same working logout flow as every other
  page.

**Feature 11 (Profile Management) — was 100% unimplemented.** Every
Profile button in the entire app pointed at nothing. Built:
- `/profile` (student) and `/supervisor/profile` — view info, edit
  name/email, change password, both backed by new self-service endpoints
  (separate from the coordinator's admin-side edit).
- `/coordinator/profile` — coordinators can edit their own name, email, and
  department and change their password. The coordinator header links to this
  page and refreshes its cached display after a profile update.

**Supervisor pages that were linked from the dashboard but never
built** (`/supervisor/interns`, `/supervisor/evaluation`,
`/supervisor/complaints`) — all three now exist and work:
- **My Interns** — list of assigned students with hours/progress/task
  counts.
- **Evaluation** — pick a student, rate 1–5 stars with comments, view
  their evaluation history. This was the missing half of Feature 10 —
  the backend endpoint existed from the last round but nothing could
  call it.
- **Company Feedback** — students can rate their overall OJT training
  experience, optionally add comments, and review their feedback history.
  The coordinator evaluation view already shows student-submitted ratings.
- **Complaints** — supervisors can now file a complaint themselves and
  track its status. Previously only students could file (the table only
  ever recorded a student as the filer); added a new nullable
  `filed_by_supervisor_id` column rather than touching the existing
  column, so the original student complaint flow is untouched.

None of this changes any working feature's behavior — it only fixes
buttons/pages that were already broken or missing, and the new mobile
drawer only activates below the `md` breakpoint, so desktop layout is
pixel-identical to before.

## Known gaps / suggested next steps
- Most legacy student/supervisor endpoints still are not JWT-protected.
  Student/supervisor JWTs are now required for document upload, review,
  listing, and download endpoints, with supervisor access limited to
  assigned interns. Task assignment, submission, review, task queues,
  evaluation submission/history, and the supervisor intern list now also
  require role tokens and enforce self/assigned-intern access. Attendance
  reads, time-in, break, time-out, and supervisor review now require role
  tokens and enforce student/supervisor ownership. The related UI callers send
  those tokens. Notification reads/updates, complaint filing/history,
  schedule/company reads, and student/supervisor profile/password endpoints
  also now require role tokens and enforce identity ownership. Student and
  supervisor dashboards now require their own role tokens; the legacy student
  information endpoint is limited to the student themself, their assigned
  supervisor, or a coordinator. Complaint filing alerts active coordinators.
  Coordinator self-service profile and password routes now also require the
  coordinator's own role token and enforce identity ownership. Audit remaining
  legacy endpoints before deployment.
- Automated API regression tests cover authentication, student attendance/task/
  complaint/evaluation ownership, role-specific task and complaint access,
  evaluation identity/rating validation, attendance-photo enforcement,
  protected uploads, coordinator analytics, and coordinator profile/password
  authorization and validation. Continue expanding coverage for successful
  task submission/review and remaining legacy routes.
- Resolved: "Forgot password?" now opens the SMTP-based password-reset flow
  (see section 8).
- I did **not** attempt a line-by-line rewrite of the largest files
  (`dailylog.tsx` and `sched.tsx` are 2,000–2,500 lines each) — I fixed
  the specific bugs I found via a systematic route/link audit, but a
  deeper refactor of those two files for readability is still worth
  doing separately given their size.
- Documents can now be uploaded to private local backend storage, listed
  by the student, and approved/rejected by that student's assigned
  supervisor. Review notes and notifications are persisted.
- Daily time-in now requires an attendance image on both the student form
  and the API. Mobile browsers are prompted to use the rear camera where
  supported; unsupported or absent photos cannot create a log, and temporary
  uploads are removed when the log is rejected or fails.
- Attendance photos, task submissions, and complaint evidence are no longer
  served from a public static directory. Their files require a role token and
  are returned only when the requester owns the record, is its assigned
  supervisor, or has coordinator oversight access. The student/supervisor
  task pages and coordinator complaint review now retrieve attachments through
  this protected endpoint.
- Student complaint reports now load from the authenticated history endpoint;
  students can see each report's current status and coordinator resolution
  notes instead of always seeing an empty-state message.
- Coordinator analytics now includes evaluation counts and average ratings
  grouped by evaluator role and evaluation category. Coordinators can export
  the displayed analytics as a CSV report, including attendance, tasks,
  partner companies, complaints, and evaluations.
- Coordinator global search now returns bounded, authenticated results for
  students, supervisors, and complaints. Student and supervisor results open
  their existing filtered account lists; complaint search is supported in the
  complaint oversight list. Existing role-specific attendance, task, and
  account filters remain scoped to their own workflows; this is not yet a
  universal cross-role search service.
- Added a student company-feedback page to submit a 1–5 overall OJT experience
  rating with optional comments and review prior submissions. The page uses the
  existing student-authenticated evaluation endpoints.
- Replaced the backend placeholder `npm test` command with a Node.js API
  regression suite. From `backend`, start the local API and seed the documented
  demo accounts first, then run `npm test`. The suite checks authentication,
  student attendance/task/complaint/evaluation ownership, role-specific task
  and complaint access, attendance-photo enforcement, private upload access,
  evaluation identity/rating validation, coordinator complaints and analytics,
  and coordinator profile/password validation without creating database
  records or changing shared demo credentials. Tests only target loopback
  addresses by default; a non-local target requires an explicit
  `ALLOW_NONLOCAL_API_TESTS=true` override.
- Local private-disk storage remains the development fallback. Configure
  Azure Blob connection details before deploying to ephemeral or shared-disk
  hosts; the Azure integration cannot be exercised without an Azure account.
- Fixed the Documents page notification request to use the configured
  backend URL and the logged-in student's notification endpoint.
- Paper-to-system reassessment confirmed the core attendance, OJT monitoring,
  task, complaint, evaluation/feedback, profile, analytics, upload, and
  persisted in-app notification workflows are present. The code now includes
  password recovery, deadline reminders, SSE updates, VAPID browser push, and
  Azure Blob file storage, but actual delivery/persistence requires SMTP,
  VAPID, and Azure credentials in deployment secrets. Task attachments remain
  optional, the prototype database uses application-level references instead
  of foreign-key constraints, and a browser file picker cannot guarantee a
  freshly captured camera image.

## 12. Paper-alignment audit and fixes (October 2026)

Audit of the implementation against the original paper and the
architecture-aligned draft. Run `npm run db:migrate` (adds migration 006)
and `npm install` in both `backend` and `my-pwa` after pulling this round.

**Bugs fixed**
- Coordinator Monitoring and the supervisor "My Interns" page joined
  attendance and tasks in one query, so hours, pending logs, and task counts
  were multiplied (for example, 8 verified hours showed as 24 for a student
  with 3 tasks). Both now use separate aggregates; a regression test checks
  monitoring hours against the student's own attendance.
- The student Daily Log "Flagged" filter never matched anything because the
  API marks those logs `Rejected`.
- Rejecting a log overwrote the student's own note with the rejection
  reason. Review notes are now stored separately (`review_notes`).
- Coordinator ("teacher") evaluations were shown as student feedback.
- The student Documents header showed a hard-coded name ("Maria").
- The migration runner re-applied every file on each run, which recreated
  the default coordinator account after its email was changed. Applied
  migrations are now tracked in `schema_migrations` and run once.

**Paper features completed**
- Set OJT Requirements (coordinator use case): new `/coordinator/requirements`
  page. Coordinators add, rename, retire, or restore required documents
  (`ojt_requirements` table, previously hard-coded) and set each student's
  weekly OJT schedule (previously only possible through the seed script).
  Students are notified when their schedule changes.
- Evaluate OJT Performance (Feature 10): coordinators can now submit
  evaluations from the Evaluations page; evaluator names are recorded.
- Notifications for unverified logs (Feature 7): the assigned supervisor is
  notified when an intern times in.
- Attendance verification record (ERD `verified_by`): `verified_by`,
  `verifier_role`, `verified_at`, and `review_notes` are stored and shown.
- Flagged discrepancies (Feature 4): rejected logs, logs with no time-out on
  an earlier day, and logs unverified for more than 2 days. Monitoring shows
  a per-student breakdown, overdue tasks, a text filter, and a discrepancy
  list with reasons (`GET /api/coordinator/discrepancies`).
- File Complaint includes Attach Evidence: supervisors can now attach
  evidence files.
- Export/Print Report: Analytics has a Print / Save as PDF button with print
  styles.
- The supervisor Documents review page is now in the supervisor navigation.

**Security and integrity**
- Login lockout after 5 failed attempts in 15 minutes (`login_attempts`,
  hashed keys; configurable with `LOGIN_MAX_FAILURES`).
- Legacy plain-text passwords are re-hashed with bcrypt at the next login.
- Foreign keys added (migration 006, `NOT VALID`, `ON UPDATE CASCADE`):
  enforced for all new and updated rows. After cleaning any orphaned legacy
  rows, run `ALTER TABLE ... VALIDATE CONSTRAINT ...` to check existing rows.
- Student registration and edits reject unknown supervisor IDs; coordinator
  evaluations reject unknown students; new students record the registering
  coordinator.
- In production (`NODE_ENV=production`), `/api/test-db` is disabled and raw
  error text is stripped from 500 responses.
- Removed the unused `@supabase/supabase-js` dependency.

**Tests**: 6 new API tests (25 total), covering requirements and schedule
authorization and validation, monitoring accuracy, discrepancy access,
reference validation, and login lockout.

**Paper**: `CC106 GROUP 9 - architecture-aligned draft (rev 2).docx` (and
`.pdf`) redraws all six figures to match the implementation. The previous
draft's figures said live updates, push notifications, password recovery,
and cloud storage were "not implemented"; its DFD showed 5 processes while
the text described 7; and its ERD said there were no foreign keys. The text
is corrected to match (8 DFD processes with stores D1–D9, updated use cases,
module lists, ERD, and feature mapping). The earlier draft is unchanged.

## 13. Pre-deployment audit and fixes (October 2026)

Deployment steps are in [DEPLOY.md](./DEPLOY.md). After pulling these
changes, run `npm install` in `backend` and `my-pwa`, then
`npm run db:migrate` in `backend` (adds migrations 007 and 008).

**Bug fix**
- Coordinators could not resolve or dismiss a complaint: the update query
  used one parameter as two SQL types and failed every time. Fixed.

**Hosting (Vercel frontend, Railway backend + PostgreSQL + volume)**
- Backend: `npm start` script, `tsx` as a runtime dependency,
  `backend/railway.json` (migrations before each deploy, `/api/health`
  health check).
- Frontend: `my-pwa/vercel.json` (page-refresh rewrite and security
  headers), `my-pwa/.env.example`. A production build without
  `VITE_API_URL` now refuses to load instead of calling localhost. Unknown
  URLs return to the login page.
- The server clock defaults to `Asia/Manila` (`TZ`), so times are not
  shifted by eight hours on a UTC host.
- In production the API trusts the host's proxy, allows only `FRONTEND_URL`
  (plus optional `CORS_ORIGINS`) as a browser origin, and rejects the
  `.env.example` `JWT_SECRET` placeholder.
- `PRIVATE_UPLOAD_DIR` points uploaded files at a persistent volume.
- `.env` is now loaded before the service modules read it, so storage and
  mail settings placed in `backend/.env` take effect locally.
- Root `.gitignore` keeps secrets, build output and uploaded photos out of
  the repository.

**Passwords and sign-in**
- One rule everywhere: 12–128 characters with an uppercase letter, a
  lowercase letter and a number. This replaces the 6-character minimum on
  password change and the absence of any minimum on account creation.
- bcrypt cost raised from 10 to 12; older hashes are upgraded at the next
  successful login.
- Migration 007 adds `must_change_password`. In production, the seeded
  coordinator and every account a coordinator creates must set a new
  password at first login (`/change-password`); other routes are blocked
  until then. Local development and the API tests are not affected.
- Changing a password signs out every other session and returns a new
  token to the device that made the change.
- Failed logins are also limited per network address
  (`LOGIN_IP_MAX_FAILURES`, default 100 per 15 minutes).
- `helmet` security headers on the API.
- Attendance request bodies, rows, names and emails are no longer written
  to the server log.

**Notifications**
- Supervisors have a notification panel on the dashboard and attendance
  pages and a full page at `/supervisor/notifications`. Coordinators use
  the same panel. Both support mark-as-read, mark-all-as-read
  (`PUT /api/notifications/read-all`) and live refresh.

**Search and filter**
- Date-range filters on the supervisor attendance page, the student daily
  log, and the coordinator's flagged-discrepancy list. The supervisor
  attendance page also has a text search, and the two supervisor "Search"
  buttons that did nothing now lead to it.

**Coordinator documents**
- New `/coordinator/documents` page: per-student requirement progress and
  every submitted file with download. Read-only; review stays with the
  supervisor. Backed by `GET /api/coordinator/documents`.

**Attendance rules (migration 008)**
- Rendered hours exclude the recorded break; a break left open is closed
  at time-out. Past completed logs with a break were recalculated.
- A log cannot be verified before the student times out.
- Rejecting a log requires a reason.
- A unique index allows one log per student per day, so a double-tap on
  time-in cannot create two.

**Sessions and validation**
- When a login is no longer valid (expired, signed out elsewhere, or the
  account was deactivated), every page now returns to the login screen
  with a notice, through one check in `my-pwa/src/lib/sessionGuard.ts`.
- A task's due date cannot be in the past.
- Editing a student without sending `supervisor_id` keeps the current
  supervisor instead of unassigning it.

**Analytics PDF**
- "Download PDF report" on the coordinator Analytics page generates an A4
  PDF with the same five tables as the CSV export (`jspdf`,
  `jspdf-autotable`, loaded only when the button is used). Print remains.

**Tests and paper**
- 10 new API tests (35 total) cover the fixes above. They use validation
  paths and ids that do not exist, so they leave no records behind.
- [PAPER-CORRECTIONS.md](./PAPER-CORRECTIONS.md) lists the edits the rev 2
  paper needs to match the system. The paper itself is unchanged.

**Still open**
- The coordinator's date range filters flagged logs, not the per-student
  progress totals.
- List endpoints other than notifications and documents are not paginated.
- The frontend has 25 lint errors that predate this round (mostly
  `react-hooks/set-state-in-effect`); they do not affect the build.

## 14. Camera check at time-in, and this round's interface work (October 2026)

**Setup after pulling this round**
- `cd my-pwa && npm install` (adds `@mediapipe/tasks-vision` for face
  tracking and `@vitejs/plugin-basic-ssl` for phone testing).
- `cd backend && npm run dev` now applies pending database migrations
  before it starts, so migration `016_attendance_capture.sql` is picked up
  without a separate step. Railway already does this on deploy.
- If time-in answers "API route not found", an older copy of the backend
  is still running; stop it and start it again.

**Camera check (liveness)**
- A student's time-in photo is no longer a file they choose. The app opens
  the front camera, asks for two quick prompts picked at random by the
  server (blink, smile, turn the head), lights the face with three screen
  colours once, and takes the photo itself on a sharp, steady frame.
- `POST /api/attendance/liveness-challenge` hands out the prompts in a
  signed ticket valid for 10 minutes; `POST /api/attendance` refuses a
  photo without that ticket and a report covering every prompt on it.
- The rules live in `my-pwa/src/lib/liveness/engine.ts` (no browser code,
  so they can be tested alone), the face reading in `detector.ts`, and the
  screen in `my-pwa/src/components/LivenessCamera.tsx`.
- Eyes and mouth are judged against the person's own resting face, not
  fixed numbers, because faces differ. A clear head turn either way counts.
- The colour flash never refuses anyone: when it is inconclusive (bright
  rooms) one extra prompt is asked instead. It is skipped for people who
  have "reduce motion" turned on.
- The face-tracking runtime is copied from `node_modules` into
  `my-pwa/public/mediapipe` by `scripts/copy-mediapipe.mjs` before
  `npm run dev` and `npm run build` (that folder is gitignored). The model
  itself is committed at `my-pwa/public/models/face_landmarker.task`.
  Nothing is fetched from a third-party CDN at time-in.
- Limit to know: the check runs on the student's device, so it is a strong
  deterrent, not proof. The supervisor still sees the photo and verifies
  the day, and is told how each photo was taken.

**When the camera check cannot work**
- The student is told why (no camera, permission blocked, three failed
  attempts) and to ask their supervisor.
- Supervisors have "Record time-in" on Review and Attendance: pick the
  intern, take an ordinary photo, give a reason
  (`POST /api/supervisor/attendance/record`). That log skips the review
  queue and is verified automatically when the intern times out.
- A photo a student replaces while asking for another review loses its
  "camera-checked" mark, and the supervisor is warned.

**Testing on a real phone**
- A phone only allows the camera over https, and `localhost` on a phone is
  the phone. Run `npm run dev:phone` in `my-pwa` (with the backend running
  as usual), then open the `Network` address Vite prints, for example
  `https://192.168.x.x:5173`, on a phone on the same Wi-Fi. The phone shows
  a certificate warning once; choose to proceed. API calls go through the
  same address, so nothing else needs configuring.
- Windows may ask to allow Node through the firewall the first time.

**Also in this round**
- Depth and calmer motion across the login page and all three portals
  (same PSU blue and gold); see `my-pwa/src/index.css`.
- Supervisor Review has a summary row; supervisor pages load only the
  lists they show; the "Review" badge uses one count
  (`GET /api/supervisor/review-count`).
- Coordinator Students and Supervisors rows keep "Edit" and move the other
  actions into a menu.
- Login shows a Caps Lock warning and, where the browser supports it, an
  "Install INTERNet" button.
- A student can send company feedback once a day (it used to be unlimited,
  and every one alerted all coordinators).

**Tests**
- 52 API tests. The camera-check test asks for the challenge first, so it
  stops instead of recording a real time-in if it is ever run against an
  older backend.

**Still to do**
- Try the camera check on two or three real phones in different lighting.
  It has been run against recorded clips of a real person blinking and
  smiling, and against a still photo (refused), but not yet live, and the
  head-turn prompt has not been tried on a real face at all.

## 15. Coordinator analytics and dashboard, and the kit's sign-in page (October 2026)

**Analytics: data fixes**
- Every figure now counts active students only, the same rule the dashboard
  and Monitoring use, so the three pages agree. A test checks this.
- The hours chart has a column for every day of the period, quiet days
  included. Days without logs used to be dropped, which hid gaps.
- Task stages always come back as all four, in working order.
- Every partner company is listed (it used to stop at ten), with a
  "No company set" row for students without one.

**Analytics: the page**
- `GET /api/coordinator/analytics?days=14|30|90` sets the period for the
  attendance figures; everything else is to date. 90 days is drawn by week.
- New: change against the previous period, how many students logged, review
  status of the period's logs, how the time-in photos were taken, progress
  toward required hours by band, and a partner company table (interns,
  average progress, verified hours, student rating, complaints).
- Complaints are matched to a company by its typed name, so a misspelt
  company on a complaint is not counted against that company.
- Charts live in `my-pwa/src/components/charts.tsx`: one colour per series,
  exact values on hover or arrow keys, and a "View as a table" twin.
- The CSV and PDF exports carry the same tables.

**Dashboard**
- Tiles: timed in today, active students, verified hours (with the last 7
  days) and average completion. `GET /api/coordinator/dashboard` now also
  returns `today`, `weekHours` and a 14-day `hoursTrend`.
- New cards: verified hours for the last 14 days, progress by band, and
  what is waiting with each supervisor.

**Sign-in page (brand kit v4, prompt 4)**
- `my-pwa/src/pages/Login.tsx` is now the kit's `LoginScreen` with this
  app's sign-in logic passed in. Requests, stored keys, the change-password
  redirect, the session notice and the post-login splash are unchanged.
  The last role used is remembered (`localStorage.inb_last_role`).
- `my-pwa/src/brand/` and the app icons in `my-pwa/public/` are kit v4,
  which redraws the logo everywhere. The supervisor bar and the coordinator
  phone header use the kit's top-bar logo size.
- Local edits inside kit files are marked "Local edit" or "Local addition".
  Re-apply them after copying a newer kit:
  - `brand.css`: the loader plays once and holds (the kit loops it).
  - `SplashScreen.tsx`: one steady line, no percentage.
  - `PortalHeader.tsx`: the app's shared gradient on dark headers.
  - `LoginScreen.tsx`: "Coordinator email" (coordinators sign in by email
    only; students may use their ID or email), "your required total"
    instead of a fixed 480 h, a Caps Lock warning, and a `prefill` prop
    for the demo logins in development.
- The sign-in headings load Bricolage Grotesque from Google Fonts and fall
  back to the system font when offline.
- Not applied: the kit's `manifest.json` (its home-screen shortcuts are
  role-specific but would show to every role) and the rest of prompt 3.

**Tests**
- 53 API tests, including one that checks the analytics figures against
  each other and against the dashboard and Monitoring.

## 16. Phase 1: safety, hygiene and quick wins (10 October 2026)

The first phase of the plan in `docs/IMPLEMENTATION-PLAN.md`. No database
change; every item is its own commit. What was found before starting is in
`docs/AUDIT-2026-10.md`, and the steps to take on Vercel, Railway and
GitHub are in `docs/PLATFORM-CHANGES.md`.

**Safety net**
- **Checks on every push.** `.github/workflows/ci.yml` runs the API tests
  against a throwaway PostgreSQL and builds and lints the site. Rehearsed
  step by step on a fresh local database; it has not yet run on GitHub,
  which happens on the first push.
- **Backups.** Railway's own backups need the Pro plan, so `DEPLOY.md` now
  has the manual steps for the database and for the uploaded files, and a
  restore drill. `npm run db:backup-local` backs up the local database and
  upload folder and refuses anything that is not on this machine. The
  drill was run locally: dump, restore to a scratch database, all tests
  pass on the restored copy. The upload-volume steps come from Railway's
  CLI reference and have not been tried on the hosted volume.
- **Foreign keys.** `npm run db:fk-orphans` reports, read-only, the 15
  foreign keys that migration 006 added without checking existing rows,
  with the number of orphan rows for each. `npm run db:fk-validate`
  validates the ones with none, only with `--confirm`. Neither runs during
  a deploy.

**Security**
- **Route sweep.** A test reads every route out of the source and checks
  that only nine listed routes answer without a token, that every other
  route answers 401 to no token or a made-up one and 403 to the wrong
  role, and that a student's token does not work on another student's id.
  It found no unprotected route. It found one fault: a profile update sent
  with no body answered 500; it now answers 400 or 403.
- **No stored copies.** Every API answer carries
  `Cache-Control: private, no-store`, except the health check and the
  public push key.
- **Uploads checked by content.** All nine upload routes refuse a file
  whose first bytes do not match its extension (JPG, PNG, PDF, DOC, DOCX).
  Before, only the name and the type the browser claimed were checked.
- **Headers.** `vercel.json` now allows the camera by policy
  (`camera=(self)`), sends a `Content-Security-Policy-Report-Only` header
  (it reports, it does not block), and serves the service worker and the
  manifest with `Cache-Control: no-cache`. On the production build behind
  these headers, 35 pages and the camera check (with a fake camera) raised
  one report: the inline script in `offline.html`, which has to be dealt
  with before the policy is enforced.
- **The account-wipe tool is gone:** the page, its place on the
  coordinator's Profile page, and `POST /api/coordinator/accounts/wipe`.

**Fixes**
- Opening the sign-in page while signed in goes straight to that role's
  portal. An ended session still shows its notice.
- The launch screen leaves when the landing page has its data (about one
  second locally) instead of always after 2.3 seconds.
- Photos are compressed once, by one helper that keeps the camera
  orientation. Two paths compressed twice.
- **One stacking order.** Everything pinned to the screen takes its
  z-index from variables listed in `index.css` and positions itself from
  the other layers' measured heights (`lib/layers.ts`). Toasts clear the
  student tab bar and the phone's safe area; the offline strip moves the
  page down and no longer covers the header's bell and avatar; a live
  notification is a toast with a "View" action, and the separate popup
  that could cover an open dialog is removed. Not seen in a browser: the
  toast resting above the push prompt, because that prompt only appears
  when the server has push keys.
- The coordinator has a notifications page, `/coordinator/notifications`,
  reached from the bell's "View all notifications".
- The camera check's colour order is shuffled without bias.
- A crash shows a screen with Reload and Sign out, and sends one short
  report to `POST /api/client-errors` (error text, page path, build; ten a
  minute per address; 8 kB at most; nothing about the person).
- Monitoring's date range moved to the top of the page and now also shows
  each student's verified hours and logs inside the dates.
  `GET /api/coordinator/monitoring` takes optional `from` and `to`; without
  them its answer is unchanged.

**Size and loading**
- Each portal page is its own file, fetched when first opened. The main
  script went from 742 kB to 372 kB (196 kB to 111 kB gzipped). After
  sign-in the rest of that role's portal is fetched in the background. A
  page file that fails to load gets one fresh load of the address, which
  also picks up a newly published version.
- The sign-in typeface is served by the app (`@fontsource-variable`); the
  app now loads nothing from another site. IBM Plex Mono was requested
  from Google but no style used it, so it was dropped, not self-hosted.

**Housekeeping**
- The root `package.json` and lock file are removed (nothing used them).
- Every example uses port 5000. The API tests read the port from
  `backend/.env`, so a machine that runs the backend elsewhere needs no
  extra setting.
- `.gitignore` covers database dumps, the backup folder and every `.env.*`
  file except the two that hold no secret.
- `sessionGuard.ts` uses the shared `clearSession`. The brand kit's own
  toast components (`brand/feedback.tsx`) are used only by the
  development-only preview page; the app's toasts are `lib/toast.ts`.

**Brand kit files edited this round** (each marked "Local edit" in the file)
- `SplashScreen.tsx`: the launch screen waits for the page's ready signal;
  fallback 1.2 s; a signal that comes at once is held to 450 ms.
- `PortalHeader.tsx`: the header sticks below the offline strip.
- `LoginScreen.tsx`: font family name of the self-hosted typeface.

**Statements in earlier sections that no longer hold**
- Section 1: "This workspace uses port 5001" (corrected in place).
- "Architecture alignment decisions": "PDF report generation is not
  included". Analytics has a PDF export.
- The same section and "Known gaps": a time-in photo can no longer be
  chosen from the device; see section 14.
- Section 9: "Student/supervisor endpoints were left as-is". Every route
  except the nine public ones requires a token and a role.
- Section 13, "Still open": the lint errors are fixed, and the date range
  now reaches the progress list.

**Tests:** 63, all passing (53 before this phase), on a fresh database and
on one restored from a dump.
## 17. Phase 2: installable, and usable with a poor connection (10 October 2026)

The second phase of `docs/IMPLEMENTATION-PLAN.md`. One additive migration
(017). The backend has to be deployed before the frontend; the steps are in
`docs/PLATFORM-CHANGES.md`.

**The rule everything here follows:** the service worker keeps the app's
own files and nothing else. No answer from the API is ever stored by it.
What may be kept of a person's records is decided in
`my-pwa/src/lib/offlineStore.ts`, per account, in the browser's IndexedDB,
and is erased when that account's session ends.

**The service worker**
- It is now built by `vite-plugin-pwa` from `my-pwa/src/service-worker.ts`
  to the same address as before, `/service-worker.js`. It keeps the app's
  own files (77 files, about 1.5 MB) so the app opens with no connection,
  and keeps the face-tracking files after their first download.
  Notifications, the tap on a notification and the icon badge work as
  before.
- Page loads still go to the network first. With no connection the saved
  app opens; the plain "You're offline" page is now the last resort. This
  differs from the plan's wording ("offline.html as fallback") on purpose:
  offline reading needs the app itself to open.
- **Updates ask first.** A new version installs in the background and
  waits. The app shows "Update available" with a **Reload** action and
  only then switches over. It also checks for an update when brought back
  to the front.
- The worker exists only in a build. `npm run dev` has none; test it with
  `npm run build` then `npm run preview`.
- If a release ever leaves devices stuck, `SW_KILLSWITCH=true` on Vercel
  publishes a worker that removes itself and its caches everywhere
  (`DEPLOY.md`).

**Offline reading**
- When the server cannot be reached, these show their last saved copy with
  "Showing saved data from <time>": a student's dashboard, attendance,
  schedule, company, tasks, absences and notifications; a supervisor's
  intern list, review count and notifications.
- Nothing is kept for the coordinator. No photo or file is kept for anyone.
- A request the server answers with a refusal is never replaced by a copy.
- Signing out, an ended session and the forced password change erase that
  account's saved records, drafts and waiting steps. Ending a session now
  waits for the erase before reloading, and the app clears anything left
  by an account that is no longer signed in each time it starts.

**Drafts**
- Kept while typed, per account: the time-in note, a task's submission
  note (per task), an absence reason, and the description of a report
  (student and supervisor). Sending the text, or emptying the field,
  removes the draft.

**Break, back-to-work and time-out with no connection**
- The step is kept on the phone with the time the button was pressed and
  sent when the connection is back: at start-up, when the phone reports it
  is online, and when the app is brought forward. Until then the day shows
  the step as taken and says how many steps are waiting.
- The server (`PUT /api/attendance/:id/break`, `/break-end`, `/time-out`)
  accepts two optional fields, `occurred_at` and `client_request_id`. It
  refuses a time more than two minutes in the future, older than
  `OFFLINE_ACTION_MAX_AGE_HOURS` (default 12), or before a step already on
  the log. The same step sent twice is recorded once. Without the two
  fields the routes behave exactly as before.
- Such a log is marked `recorded_offline`, and the supervisor's review
  says "Recorded while offline".
- **Time-in is not accepted offline** (decision D7). With no connection the
  button is held back and the panel explains why and points to the
  supervisor's in-person time-in.
- Background Sync is not used, which differs from the plan. It would run in
  the service worker, which cannot read the sign-in token, and the token
  was not moved to where the worker could read it. The steps are sent the
  next time the app is open and online.

**Installing**
- The browser's install offer is caught at start-up, so every page can use
  it. Each Profile page has an Install card; the sign-in page keeps its
  button.
- iPhone and iPad get the Home Screen steps (a closable card on the sign-in
  page, and on Profile), and the notification prompt explains that on those
  devices notifications need the app on the Home Screen first.
- The manifest has an id, language, categories, three shortcuts
  (`/go/today`, `/go/tasks`, `/go/notifications`, each sent to the right
  page for the signed-in role) and four screenshots for the install dialog.
  The screenshots were taken from a local build with the demo accounts;
  replace the files in `my-pwa/public/screenshots/` (same sizes) if you
  want different ones. The fixed portrait orientation is removed.
- Once installed, the browser is asked to keep the app's saved data.
- The screen stays on during the camera check.

**Brand kit file edited this round**
- `LoginScreen.tsx`: its install hook moved to `lib/useInstallPrompt.ts`.

**What was checked, and how**
- 66 API tests pass (63 before), including the rules for an offline time
  and a full offline break, return and time-out. That last test writes a
  real log, so it runs only with `ALLOW_TEST_WRITES=true`, which CI sets.
- In a real browser against the production build: the worker and its
  caches (nothing from the API in any cache), offline reading on each
  covered page, erasure at the end of a session, drafts, the offline queue
  from button press to the supervisor's note, the update prompt, the kill
  switch, the manifest as Chrome reads it (no errors, installable), the
  shortcut links for each role, the install entries, and the wake lock.

**Not checked: needs real devices**
- Everything above was run in desktop Chrome with a simulated phone. None
  of it has been tried on an actual Android phone or iPhone. The checklist
  is in `DEPLOY.md`, "Phone checks after a Phase 2 deploy".
- The iPhone paths were exercised only by pretending to be an iPhone:
  Safari's own behaviour (Add to Home Screen, storage limits, notifications
  after installing) is untested.
- Push notifications cannot be tested in production until the three
  `WEB_PUSH_*` variables are set on Railway.

**Statements in earlier sections that no longer hold**
- "It works online only. The service worker ... does not cache pages for
  offline use" (`PAPER-CORRECTIONS.md`, section E; corrected there).
