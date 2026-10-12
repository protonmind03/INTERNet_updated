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
   - Second student, same supervisor: `student2.demo@internet.test` / `StudentDemo123!`
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

## 18. Phase 3: structured records (10 October 2026)

The third phase of `docs/IMPLEMENTATION-PLAN.md`. Four additive migrations
(018 to 021). Built and reviewed on localhost before being pushed; the
steps for going live are in `docs/PLATFORM-CHANGES.md`.

**Notifications open what they are about**
- The server stores, with each notification, the page it opens (`link`)
  and, where it is known, the record (`entity_type`, `entity_id`). One rule
  on the server decides the page, so every one of the 58 places that write
  a notification gets one. Fourteen also name the record: attendance logs,
  tasks, documents, complaints, and the student for a coordinator, whose
  link opens that student's record.
- The bell, the notifications pages, the pop-up toast and push
  notifications all open the stored page. The portals keep their old
  title-matching only for notifications written before this.
- Not done: opening one particular log or task on its page. The link goes
  to the right page; the record's id is stored for when the pages can use
  it.

**Audit log**
- `audit_log` gets a row whenever one of 31 listed routes succeeds:
  attendance decisions and their undos, a time-in recorded in person, task,
  document and absence decisions, accounts created, edited, imported,
  activated, deactivated or given a new password, reassignments, complaint
  status changes, announcements, requirement and schedule changes, and
  changes to companies and terms.
- One piece of middleware does it from a table of rules
  (`backend/src/services/audit.ts`). A route cannot forget to log, and a
  failure to log never fails the request. Only fields named in the rules
  are kept, so a password or a file cannot reach the log. The caller's
  address is kept only as a one-way hash and is never sent to the browser.
- `/coordinator/audit` (menu: Records > Audit log) lists entries newest
  first, a page at a time, with filters. Nothing can edit or remove one.

**Companies**
- A `companies` table: name, address, contact, the agreement's dates, and
  how many interns the company takes. Students, supervisors and complaints
  are linked by a nullable `company_id`.
- The company text typed on each account stays and is still what every
  screen shows. A database trigger sets `company_id` whenever that text is
  written, matching names without regard to capitals or outer spaces, so
  creating, editing and importing accounts all link themselves.
- `/coordinator/companies` lists companies with their contact, agreement
  standing (in force, ending within 30 days, expired) and places taken,
  shows typed names that have no record yet, and adds, edits and marks
  companies active or inactive. A company is never deleted. Renaming one
  rewrites the name on its people.
- The company field on the student and supervisor forms suggests recorded
  companies; any name can still be typed.
- `npm run db:backfill-companies` prints the company records it would
  create from the names already typed, and writes only with `--confirm`.
- The API for this is `/api/coordinator/company-records`. The older
  `GET /api/coordinator/companies` (a plain list of names, used by the
  announcements page) is unchanged.

**Terms** (decision D8, built as recommended)
- A term has a name, a start date and an end date; a student belongs to at
  most one. A student registered while a term is running joins it.
- Closing a term deactivates its active students together and remembers
  which ones. Every record is kept. Reopening reactivates exactly those
  students. A term is never deleted.
- `/coordinator/terms` manages them; the Students page has a term filter.
- **The filter covers the Students page only.** The dashboard, Monitoring
  and Analytics still count every active student, whatever their term.
  This is less than the plan asked for ("filtering the coordinator
  console").

**Paging**
- Six list routes take optional `limit`, `offset`, `q`, `status`, `from`
  and `to`: the coordinator's students, supervisors, complaints, documents
  and flagged logs, and a supervisor's attendance list. With `limit` the
  answer also carries `total`. Without any of them a route answers exactly
  as before.
- **The pages have not moved to it yet.** They still load their whole list
  and page it in the browser; only the audit log pages on the server. This
  is less than the plan asked for, and matters once a list passes a few
  hundred rows.

**What was checked**
- 77 API tests (71 before this phase). Four of them write real records and
  run only with `ALLOW_TEST_WRITES=true`, which CI sets: the offline steps,
  an audited action, linking and renaming a company, and closing and
  reopening a term.
- In a browser against the production build, at desktop and phone widths:
  the audit log, the Companies page and the company field, the Terms page
  including closing and reopening, and the term filter. All 38 pages load
  with no errors.
- Migrations 017 to 021 were applied in order to a fresh database. They
  have not yet been tried on a copy of production; that happens before the
  push, with a fresh backup.

**Not checked**
- Push notifications opening the stored page, because push is not set up
  in production.
- The triggers on a database with many rows. They run once per account
  written and do one indexed lookup, so no problem is expected.

## 19. Phase 4, student part (10 and 11 October 2026)

The student items of Phase 4 in `docs/IMPLEMENTATION-PLAN.md`. Seven
additive migrations (022 to 028). Live since 11 October 2026. The steps for going live are in
`docs/PLATFORM-CHANGES.md`.

**What was accomplished, at time-out**
- Timing out asks what the student did that day (15 to 1000 characters,
  kept as a draft until sent). It is shown to the supervisor reviewing the
  log and printed under the day on the Daily Time Record.
- The server accepts a time-out with no note, so a copy of the app from
  before this keeps working. When a note is sent, it is checked.

**Contact details and "my coordinator"**
- A student can add a mobile number and an emergency contact on their
  Profile. Their supervisor and the coordinator can see them; nobody else.
- Profile and Schedule show the coordinator's name and email.

**Announcements page**
- Students and supervisors have a page listing the announcements sent to
  them, newest first. An announcement's notification opens it.

**Forgot-to-time-out reminder**
- One notification, an hour after the scheduled end of the shift, when
  today's log is still open. At most one a day per student
  (`time_out_reminders`). Checked every five minutes.
- Only on a day the student is scheduled: a day with no shift has no end
  to measure from. It is an in-app notification (and a push notification
  where push is set up); no email.

**Holidays**
- The coordinator keeps a list of holidays, one per date (Programme >
  Holidays). Everyone signed in can read it.
- A student's Schedule names a holiday on its day this week, says so on
  the Today card, and lists the next five. Every copy of the Daily Time
  Record (student, supervisor, coordinator) names it on its row.
- A holiday does not stop anyone timing in: a company may work through it,
  and those hours count. Adding, editing and removing are in the audit log.

**Weekly journal**
- A student writes once a week what they did, what they learned and,
  optionally, what was difficult (More > Weekly journal). One entry per
  week, kept under the week's Monday. The last four weeks can still be
  filled in when one was missed. What is typed is kept as a draft.
- The entry joins the supervisor's review queue as a new kind, with its
  own filter. They mark it reviewed, or return it with a note; a returned
  entry can be edited and sent again, a reviewed one is closed. A decision
  can be withdrawn, as with the other kinds.
- Both sides are notified, the decisions are in the audit log, the Review
  badge counts waiting journals, and the coordinator reads them on a new
  Journals tab of the student's record.

**Completion page**
- More > Completion lists six things, counted on the server: required
  hours verified, no log still open or waiting, every required document
  approved, no unfinished task, the supervisor's evaluation, and the
  student's own feedback about the company. A line that is not done links
  to where it is finished.
- When all six are done the student can ask the coordinator, once, to
  review their record. The coordinators are notified and the student's
  record shows when they asked. Asking changes nothing else.

**Privacy notice, consent and "Download my data"**
- A student who has not agreed to the current notice is shown it when they
  tap Time in, before the camera opens. When they agreed, and to which
  version, is recorded; a changed version asks again.
- **The wording is a draft and says so on screen.** It lives in
  `backend/src/services/privacy.ts`. It must be replaced with the text the
  university approves, and two parts are left as bracketed gaps: how long
  records are kept, and the Data Protection Officer's contact.
- Profile has a Privacy card: when they agreed, the notice to read again,
  and "Download my data", one file with everything the system holds that
  is theirs. It never contains the password.
- Two switches, both off unless set. `PRIVACY_CONSENT_REQUIRED=true` makes
  the server itself refuse a time-in without consent. `PHOTO_RETENTION_DAYS`
  sets how old a decided log's photo may be before
  `npm run privacy:purge-photos` removes it; that script only lists what it
  would remove unless run with `--confirm`, and nothing is ever removed
  automatically.

**Where this falls short of the plan**
- The plan said holidays would be skipped by "projections". The app has no
  projection of a finishing date, so there was nothing to change.
- The reminder delay is fixed at one hour. The `TIMEOUT_REMINDER_HOURS`
  variable the plan mentioned was not added.
- A supervisor sees a journal while it waits for them. There is no page
  yet where they can read back the ones they have already reviewed.
- A time-in a supervisor records in person does not ask the student for
  consent.
- The `.ics` calendar export was skipped (decision D12).

**What was checked**
- 95 API tests (83 before these five items). Seven more of them write real
  records and run only with `ALLOW_TEST_WRITES=true`, which CI sets.
- In a browser against the production build, at phone and desktop widths:
  the holiday list and where it shows, the journal from writing to review,
  the completion page for an unfinished and a finished student, and the
  consent step, the Privacy card and the downloaded file. All 43 pages
  load with no errors.
- The consent switch, with the server started both ways: off, a time-in is
  not held up; on, it is refused until the student agrees.
- Migrations 001 to 028 on a fresh database, and 017 to 028 on a local
  restore of the production backup of 10 October: all applied, and the row
  counts were unchanged.

**Not checked**
- The reminder against a real clock. The test drives it with chosen times.
- The photo purge with `--confirm`, and running it on the hosting platform.
- The API tests against the production copy: it has no demo accounts. This
  is done before the push, with a fresh backup.
- Anything on a real phone.

## 20. Phase 4, supervisor, coordinator and cross-cutting parts (11 October 2026)

The rest of Phase 4 in `docs/IMPLEMENTATION-PLAN.md`. Six additive
migrations (029 to 034). Live since 11 October 2026.

**Supervisor**
- **Correct the times on a log.** From a log's review, the supervisor can
  set time in, break and time out, with a reason. The hours are worked out
  again and the status is left as it was. The intern is notified and sees
  the reason on the log; the times before and after are in the audit log.
  Refused once the coordinator has acknowledged a rejected log.
- **Decide several at once.** Beside "Verify N completed logs" there is now
  "Approve N documents" and "Excuse N absences". Each lists what it will
  decide first, stops at the first refusal and says how far it got.
- **Certify a month of the time record.** When every log in a month is
  settled, the supervisor certifies it from the intern's time record. The
  line (who, when, verified hours) is printed on every copy, and says so if
  the hours changed afterwards. It can be withdrawn.
- **Final evaluation.** Once per intern, on the Evaluations page: a rating
  on every criterion of the coordinator's form, and remarks. It can be
  changed later. The student sees it on Feedback, the coordinator on the
  student's record, and the completion checklist now counts it (an
  ordinary evaluation no longer does).
- **Daily summary email.** One a morning (07:30 Philippine time, or
  `SUPERVISOR_DIGEST_TIME`) listing what waits for the supervisor. Not sent
  when nothing waits, when they turned it off, or without SMTP settings.

**Coordinator**
- **The final evaluation form.** Evaluations > "Final evaluation form":
  the form's name, the top of the scale (3 to 10) and the criteria. A
  changed form is a new one, so a submitted evaluation keeps the criteria
  it was written on. **The form the system starts with is a sample**, and
  every screen that shows it says so, until the coordinator saves the
  university's own.
- **Coordinator accounts.** People > Coordinators: add one (own password at
  first sign-in), deactivate or reactivate one, give one a temporary
  password. Nobody can deactivate or reset their own account here, so one
  coordinator can always sign in. Accounts are never deleted.
- **Supervisor import.** Supervisors can be imported from a CSV, like
  students.
- **Check before importing.** Both imports now check the file first: every
  rule runs, including whether an ID or email is taken or repeated in the
  file, and nothing is created. The dialog shows that result and imports on
  a second press.
- **Site visits.** Programme > Site visits logs each visit to a company:
  the date, what was found, what to follow up. A company's menu opens its
  visits, and the Companies page shows when each was last visited.

**For everyone**
- **Notification choices.** Each Profile has a Notifications card: per kind
  (attendance, tasks, documents, evaluations, announcements, everything
  else), whether it is also pushed to the person's devices; and, where an
  email of that kind exists, whether it is sent. Notifications in the app
  are always kept.

**Where this falls short of the plan**
- The final evaluation's criteria and scale are a sample, not the
  university's (decision D13 is still open). Entering them is a few minutes
  on the form editor.
- The plan's "cannot deactivate the last active coordinator" is met by the
  rule that nobody can deactivate themselves: since only an active
  coordinator can deactivate another, one always remains.
- The per-intern summary PDF and announcement read receipts were skipped
  (decision D12).
- Only two kinds of email exist to switch off: task deadline reminders and
  the summary emails. Other kinds have a push switch only.

**What was checked**
- 111 API tests at the end of this part. In a browser against the
  production build: bulk decisions, correcting times, certifying a month,
  the final evaluation as supervisor, student and coordinator, the form
  editor, both imports with their check step, coordinator accounts, site
  visits and the notification switches.

**Not checked**
- Any email actually arriving: production has no SMTP settings, and the
  tests use a stand-in sender.
- Push respecting the switches on a real device: push is not set up in
  production.

## 21. Phase 5: projections, alerts, reports and polish (11 October 2026)

No migrations. Live since 11 October 2026.

**Projected finish and "at risk"**
- A student's remaining hours are counted off against their weekly
  schedule, day by day from tomorrow, skipping holidays. That gives a
  projected finish date. A student is at risk when it falls after their
  term ends, or when hours remain and nothing is scheduled.
- Shown on Monitoring (with an "At risk" filter), on the student's
  dashboard, and in the supervisor's intern dialog.
- It is an estimate from the schedule. It does not look at how many hours
  the student has actually been rendering each week.

**Alerts**
- The coordinator's dashboard has an Alerts card, shown only when there is
  something in it: supervisors with reviews waiting more than 3 days,
  agreements that have ended or end within 30 days, students with 5 or more
  scheduled days in a row without attendance or a filed absence, and
  students at risk.
- The same alerts go out as a weekly email (Monday 07:30 unless
  `COORDINATOR_DIGEST_DAY` and `COORDINATOR_DIGEST_TIME` say otherwise),
  only when there is something to report.

**Exports**
- Monitoring has an Export button: every active student with hours,
  completion and projected finish, and a summary per company with its
  agreement end and last visit. It follows the term filter.
- The Analytics CSV carries both tables; the PDF carries the company
  summary.

**Accessibility**
- axe (WCAG 2.1 A and AA) was run on all 45 pages at phone and desktop
  width. It found six kinds of problem; all are fixed and the run is clean:
  grey text too faint to read, menu buttons read out without the text they
  show, progress bars with no name, two lists marked up as something they
  were not, and a table that could not be scrolled from the keyboard.

**End-to-end tests**
- A new `e2e` folder holds nine Playwright tests that drive the built site
  in a real browser: signing in as each role, a refused password, a
  signed-out visitor, the privacy notice and the camera check starting, the
  weekly journal across two accounts, a holiday reaching the student, and
  the completion checklist. CI runs them as a third job.

**Content security policy**
- The offline page's script moved into its own file. Every page now loads
  with no violations of the report-only policy. **The policy is still
  report-only**: switching it to enforcing is a one-line change to
  `my-pwa/vercel.json`, left for the owner's word.

**Where this falls short of the plan**
- The projection is not on the coordinator dashboard as a figure of its
  own; at-risk students are in the Alerts card there.
- The accessibility run covers each page as it first loads. Dialogs and
  open menus were not run through it.
- The fake camera has no face, so the end-to-end time-in test stops at the
  camera check starting. A full time-in cannot be automated.

**What was checked**
- 115 API tests, all passing, including one that checks the report against
  Monitoring, each company row against its students, and each term's
  report against that term's students.
- The nine end-to-end tests locally, against the production build.
- All 45 pages load with no errors and no policy violations.
- Migrations 001 to 034 on a fresh database, and 017 to 034 on a local
  restore of the production backup of 10 October: all applied, row counts
  unchanged.

**Not checked**
- The end-to-end job on GitHub: it has only been run on this machine. Its
  first run happens on the next push.
- Anything on a real phone.

## 22. After Phase 5: two gaps closed (11 October 2026)

On `ui-redesign`. No migrations.

- **The term filter covers the dashboard and Analytics.** Both pages have
  the term picker that Students and Monitoring have, and the choice
  carries between all four. With a term chosen, every figure counts only
  that term's active students: today's attendance, hours, tasks, the
  progress spread, companies and ratings. Complaints and evaluations are
  the ones of that term's students, so a complaint a supervisor filed is
  left out of a term's figures. The Analytics exports say which term they
  are for. Supervisor counts and "complaints to review" on the dashboard
  stay programme-wide.
- **Supervisors can read journals back.** A new Journals page lists every
  journal their interns have written, newest week first, with filters for
  waiting, reviewed and returned, and by intern. Deciding a journal still
  happens in the Review queue.

- **Students and Complaints are paged by the server.** Each page asks for
  one page of rows instead of loading the whole list. On Students the
  server also does the ordering (name, least progress, supervisor) and the
  "No supervisor" filter. The other long lists are unchanged; the plan's
  "Still open" says which and why.
- **A notification opens the record it is about.** When the writer of a
  notification names the record, its link now carries it
  (`?focus=task-12`): a student lands on that task or that day's log,
  outlined for a few seconds, with the list turned to its page; a
  supervisor's queue opens on that item; a coordinator's complaint opens.
  A record that has since gone just shows the page.

**What was checked:** 118 API tests, including ones that check each term's
dashboard and Analytics figures against Monitoring and that the terms add
up to the whole, that every order of the student list holds across pages
with nobody lost or repeated, and which links name a record. In a browser:
the term picker and its carrying between pages, the Journals page on a
phone, the Students page turning pages with 46 students in the test
database, and record links landing on a task, on a log on the second page
of the list, and on a queue item.

## 23. The optional items, the enforced security policy, and the tunnel for data scripts (12 October 2026)

On `ui-redesign`. One additive migration (035).

- **Add the schedule to a calendar.** The student's Schedule page saves an
  `.ics` file: one repeating event per working day in Philippine time, up
  to the projected finish (or half a year when that is not known), skipping
  holidays, with each holiday as an all-day entry. It is a copy made at
  that moment.
- **A summary PDF for each intern.** In the supervisor's intern dialog:
  hours and projected finish, attendance counts and every log with what was
  done, tasks with ratings and feedback, documents, and the final
  evaluation when there is one.
- **Who has seen an announcement.** The coordinator's list shows "seen by
  N" beside how many people each announcement went to. A person is counted
  the first time the announcement is on their Announcements page; the
  notification alone does not count. Migration 035.
- **The content security policy is enforced.** `vercel.json` now sends
  `Content-Security-Policy`, not the report-only form. Checked locally with
  it enforced: all 46 pages load with no violations, the camera check
  starts, and the calendar, PDF and data downloads still save.
- **Data scripts reach the hosted database.** `db:backfill-companies` and
  the other data scripts take a tunnel port, as the backup does, and the
  bare word `confirm` in place of `--confirm`. Steps are in `DEPLOY.md`.

**What was checked:** 119 API tests. The calendar file's rules on the
function itself (first weekday, repeat end, skipped holiday, escaping, line
length) and the real download on a phone-sized page. The PDF as a real
file with its tables. Read receipts counting each reader once. The tunnel
form against a local database standing in for the tunnel.

**Not checked:** the calendar file opened in a real phone calendar app;
the enforced policy on the hosted site (it gets there on the next push);
the tunnel form against the host.

## 24. Round 2, Phase 0: operations (12 October 2026)

On `ui-redesign`, on localhost. One additive migration (036).

- **Email through an HTTPS API (0.1).** The server can now send email
  through an email provider's HTTPS API as well as SMTP. With
  `EMAIL_PROVIDER` and `EMAIL_API_KEY` set (sender: `SMTP_FROM`) the API is
  used; otherwise SMTP if its five settings are there; otherwise email is
  not configured and everything behaves as before. Resend is built in; a
  second provider is one small entry. Password recovery, deadline
  reminders and both summary emails all go through the same check and the
  same sender. The key and the recipient never appear in a log or an error.
- **Push keys (0.2).** No code. The steps are in the Round 2 platform list.
- **Upload backup (0.3).** `npm run uploads:backup`, run on the server,
  packs every uploaded file into one archive and prints the file count and
  the archive's name and size.
- **Foreign keys (0.4).** No code and nothing run. The platform list asks
  for the read-only orphan report.
- **Single-use camera check (0.5).** The ticket a camera check is issued
  now has an id, and the first time-in that passes with it spends it. A
  second time-in with the same ticket is refused (409). Migration 036
  holds the spent ids; they are removed after a day.

**What was checked:** 123 API tests (119 before). New: which route email
takes for each combination of settings; the provider adapter against a
stand-in for the network (success, four kinds of refusal, a timeout, a
network failure, and that none of them leak the key or the address);
password recovery still answering "unavailable" with no email settings;
and a ticket used twice. The upload script on a local folder of 11 files.

**Not checked:** a real email leaving the server (it needs a provider
account, a key and a verified domain); the upload script on the host; the
download of its archive from the volume.

## 25. Round 2, Phase 1A: the student portal, reorganised (12 October 2026)

On `ui-redesign`, on localhost. No migration. Frontend, except the
notification lists.

- **One place for the time-in actions (1A.1).** The day's attendance, the
  privacy step, the camera dialog and the break, back and time-out
  confirmations are held once and shared. Nothing a student sees changed.
- **Today (1A.2).** The attendance card is on Attendance only. Today opens
  with one line: not timed in, on the clock since when and for how long,
  on lunch since when, or done with what the supervisor decided. On a
  desktop the next step is a button in the page header.
- **A floating next-step button on phones (1A.3).** Time in, Lunch, Back,
  Time out, bottom right above the tab bar on every page except Attendance
  and Profile. It goes away while a dialog or sheet is open and when the
  day is done. With no connection before time-in it looks unavailable and
  a tap says why and what to do. Steps waiting to be sent show as a badge.
  The push prompt and toasts sit above it.
- **The bell (1A.4, 1A.5).** Notifications left the menu. The bell shows
  the newest twenty and loads twenty more when its list is scrolled to the
  end, with All and Unread; its badge is the server's count. For students
  it has a second tab, Announcements, which records them as seen exactly
  as the page does. The notification list endpoints take `limit`,
  `offset` and `status=unread` and then also answer `total` and
  `unread`; asked for plainly they answer as before.
- **Completion on Profile (1A.6).** The checklist and the request for a
  review are one card at the top of Profile.
- **Resolution Center (1A.7).** `/student/resolution`, with two tabs:
  Concerns (reporting one, and those reported) and Evaluations (those
  written about the student, and "Rate your company"). The words on screen
  are "concern" throughout.
- **The menu (1A.8).** Tabs: Today, Attendance, Tasks, Documents, More.
  More: Schedule, Weekly journal. Avatar: Profile, Resolution Center, Sign
  out. On a desktop the Resolution Center is a labelled button in the
  header.

**Addresses.** Every old address still opens: `/notifications`,
`/announcements` and `/student/completion` as pages; `/report` and
`/student/feedback` go to the right tab of the Resolution Center and keep
whatever else the address carried.

**What was checked:** 124 API tests (123 before; the new one pages each
role's list, reads past the end, filters unread, and is refused for
another account). 12 end-to-end tests (9 before): the floating button at
390 px, the menu on a phone, and the moved addresses. In a browser at
390 px and 1280 px: the status line, the button's size and place, the
bell loading 20, 40, 60, the Unread filter, the Announcements tab asking
the server once, the redirects, the Profile card. The automated
accessibility check on all 47 pages at both widths, and with the bell and
the avatar menu open: clean, after fixing the contrast of the time on an
unread notification and of a note on today's row of the schedule.

**Not checked:** anything on a real phone (the floating button under a
thumb and above the home indicator; the bell's scrolling by touch). The
floating button's offline look and its waiting badge with a connection
really lost.

## 26. Round 2, Phase 1B: the supervisor portal, and one name per concept (12 October 2026)

On `ui-redesign`, on localhost. No migration.

- **Supervisor bell (1B.1).** The same bell as the student's: twenty at a
  time, All or Unread, and an Announcements tab that records them as
  seen. Announcements left the account menu.
- **Concerns in the account menu (1B.2).** "Incidents" left the top bar.
  It is "Concerns", beside Profile, at the same address.
- **Final evaluation due (1B.3).** An intern within 40 hours of their
  required hours, or past them, with no final evaluation is listed in the
  Review queue. The row opens Evaluations with that intern chosen
  (`/supervisor/evaluation?intern=...`). New endpoint:
  `GET /api/supervisor/final-evaluations`. Evaluations stays in the top
  bar.
- **Usability (1B.4).** Attendance rows carry small marks: Camera check,
  Recorded in person, Recorded offline. "Correct the times" is in each
  row's menu and opens the same dialog as the log's detail. The account
  menu shows "Your OJT coordinator" with a name and an email; the
  supervisor's profile answer has a new `coordinator` field for it.
- **One name per concept (1B.5).** "Concern" in all three portals: page
  titles, the coordinator's sidebar and search, Analytics, the dashboard,
  audit labels, toasts, server messages, and the titles of new
  notifications ("New concern filed", "Concern resolved", "Reply on your
  concern"). Stored notifications keep their old titles; the link rule on
  the server and the title rules in the three portals match both words.
  Routes, database names, audit action names and the `complaint` record
  type are unchanged.
- **Redundant code (1B.6).** The brand kit's own toast system is no longer
  exported from the kit; only the development-only brand preview imports
  it. The route progress bar, the one part the app uses, has its own file.

**What was checked:** 126 API tests (124 before): the final-evaluations
list against asking intern by intern, and who is refused; the coordinator
on the supervisor's profile and that it carries only a name, an email and
a department; the link rule for both wordings. 14 end-to-end tests (12
before): the supervisor's menu and bell, and the coordinator's Concerns
page. In a browser at 1280 px and 390 px: the queue item and where it
leads, the account menu, the bell, the row marks, the row menu and its
dialog. The automated accessibility check on all 47 pages at both
widths, and with the menus and the dialog open: clean.

**Not checked:** on a real phone. The queue item with several interns at
different hours (the test data has one intern).

## 27. Round 2, Phase 1C: the coordinator's console (12 October 2026)

On `ui-redesign`, on localhost. No migration.

- **One action list (1C.1).** The dashboard's three overlapping lists are
  one, grouped by who acts: You (concerns, flagged logs, students with no
  supervisor, agreements ending), Supervisors (slow reviews, logs and
  tasks waiting), Students (not turning up, at risk, overdue tasks). Each
  row is a count, a reason and a link to the list. The page runs today's
  attendance (now with "scheduled, not yet in"), the action list, the key
  figures, the hours trend, progress, and the supervisors' queues. It is
  all counted on the server (`GET /api/coordinator/actions`); the page no
  longer downloads every student's row. The weekly email is unchanged.
- **Key figures with targets (1C.2).** Six cards on the dashboard and on
  Analytics: on track to finish (90%), attendance on scheduled days (95%),
  median time to a supervisor's decision (2 days), requirements complete
  past half the hours (80%), concerns open more than 7 days (0),
  agreements ending within 30 days (0). A card shows the value, the
  target, eight weeks as a line, the change from four weeks earlier and
  what it was counted from; "?" states the definition; the title opens
  the list. A card is red only when its target is missed. Worked out by
  `GET /api/coordinator/kpis`; the names, definitions and targets are in
  `services/kpiDefinitions.ts`.
- **Audit filters and export (1C.3).** Dropdowns for category, who did
  it, record kind, and when (Today, This week, This term, Custom), with
  a person search and a record ID. Every filter is in the address.
  "Export CSV" downloads the filtered entries in Philippine time, at most
  10,000, and the export is itself logged.
- **Audit coverage (1C.4).** Logged now: agreeing to the privacy notice,
  downloading one's own data, and a coordinator opening a student's
  record, a document or an uploaded file. Reads are written after the
  answer is sent, and a repeat within ten minutes is one entry.
- **Schedule on the record (1C.5).** A Schedule tab on the coordinator's
  student record, with the editor from the Requirements page, which stays.

**Found on the way:** a date such as 2026-13-40 made the audit list answer
with a server error; it is now refused. The exported file had no date in
its name, because a page cannot read the name a server on another address
gives a file; the page names it now. With more than 99 unread the bell's
badge and its spoken name disagreed.

**What was checked:** 131 API tests (126 before). New: each figure on
made-up rows and dates, including what changes a week earlier; the action
list against the dashboard, Monitoring and the alerts, and term by term;
the audit rules for the new entries; a read logged once in ten minutes
and again after eleven; entries at 23:30 and 00:30 Manila time each on
their own day; the export's content and its own log entry. 17 end-to-end
tests (14 before): the dashboard and its cards, the audit filters, the
export download, the schedule tab. The automated accessibility check on
all 47 pages at both widths: clean.

**Not checked:** the figures against a real programme's data (the test
data has one student, so most cards have little to count); the exported
file opened in a spreadsheet; the dashboard's speed with hundreds of
students.

## 28. Round 2, Phase 2: college, program, major, block, and one filter bar (12 October 2026)

On `ui-redesign`, on localhost. Two additive migrations (037, 038) and a
backfill script. A production backup is needed before this goes live.

- **Academic structure (2.1, migration 037).** Colleges, programs, majors
  and blocks are records. Students gain optional links to a program, a
  major and a block. `students.program` stays the text that is shown; a
  trigger links a student whose text is a program's name or short code.
  A block is named from its program, year and section ("BSIT 4A").
  Closing a term makes its blocks inactive; reopening restores them.
- **The seeded list (2.2, migration 038).** Six colleges, fifteen
  programs with short codes, fourteen majors, for PSU Lingayen. Awaiting
  the OJT office's confirmation.
- **Backfill (2.3).** `npm run db:backfill-programs` lists every spelling
  of the program typed on students and what it would link each to. It
  links exact matches and what a person wrote in a mapping file, nothing
  else, and only with `confirm`.
- **Programs page (2.4).** Under Programme: colleges, programs (with an
  "OJT applies" switch), majors, and blocks by term, with who is in each
  block and adding students who have none. Each change is in the audit
  log.
- **Student form and import (2.5).** College, Program, Major and Block
  pickers on the form, each narrowing the next; a program not in the list
  can still be typed. The import takes the same four as columns and says
  per row what does not fit.
- **One filter bar (2.6).** Term, College, Program, Block, Company and
  Supervisor on Dashboard, Monitoring, Analytics, Students, Documents,
  Evaluations and the Audit log. Kept in the address and for the session.
  The server filters, with every value bound as a parameter.
- **Supervisors (2.7).** A "Program and block" choice on their five pages
  with an intern picker, shown only when their interns span more than one.
- **Analytics and exports (2.8).** Tables by program and by block beside
  the company table; exports gain college, program code, major and block
  columns, the two summaries, and a line saying which students they cover.

**Found on the way:** the company table's phone layout on Analytics still
said "complaint".

**What was checked:** both migrations run twice on a local database. The
backfill's dry run, a mapping to a program that does not exist (refused),
a correct mapping (two students linked, none on a second run), and that a
student linked from a non-matching spelling stays linked when saved again.
136 API tests (131 before): placing a student from pickers and from a
file; filter values bound as parameters; the seeded list; every list
refusing a malformed filter and matching nobody for an id of nothing; and
one long test that makes a college, programs, a major, a term and blocks,
imports and edits students, and checks nine routes under twelve filter
combinations, the report's sums, the audit entries, and a term's blocks
closing and reopening. 19 end-to-end tests (17 before). In a browser: the
bar narrowing, clearing and carrying between pages; the Programs page;
the student form; the supervisor's choice with interns of two groups. The
automated accessibility check on 48 pages at both widths: clean.

**Not checked:** the backfill through the tunnel; the migrations on the
hosted databases; any of it with a real class list (the test data has a
handful of students); the filter bar's speed with hundreds of students.

## 29. Round 2, Phase 3: what students write and read about their days (12 October 2026)

On `ui-redesign`, on localhost. Two additive migrations (039, 040).

- **Weekly report (3.1, migration 039).** The weekly journal under a new
  name for students, supervisors and the coordinator, with a fourth,
  optional part: What I did, What I learned, Problems encountered,
  Solutions tried or identified. Above the form, and beside the report
  where it is reviewed or read, is what the student wrote at time-out on
  each day of that week. Reviewing and returning work as before. It does
  not count toward completion.
- **Tasks worked on (3.2, migration 040).** The time-out confirmation
  lists the student's open tasks to tick, optionally; the accomplishment
  note stays required. The choice travels with a time-out kept offline.
  The titles show under the note in the supervisor's review and on the
  time record.
- **Lunch, and the time record (3.3).** The steps are "Time in", "Out for
  lunch", "Back from lunch", "Time out" everywhere. The time record
  prints Day, AM In, AM Out, PM In, PM Out, Hours, Status, and never a
  time that did not happen: a day with no lunch reads "No break" across
  the two middle cells; a morning or an afternoon alone fills only its
  two columns.
- **Schedule (3.4).** Three views. Week is the page as it was. Month is a
  calendar: working day or day off, holiday, a dot for a task due, a mark
  for an absence, the hours at the bottom, and the week of the OJT down
  the side; a tap on a day (or holding it, or Enter) opens everything
  about it, and the arrow keys move between days. My progress shows
  verified hours each week against the schedule, attendance on scheduled
  days, the average time-in against the shift's start, hours still
  needed, and the projected finish. All but the projection work offline.
- Every dialog's backdrop is now blurred.

**What was checked:** both migrations run twice locally. 141 API tests
(136 before): the report's new part, including a form that does not send
it; tasks at time-out, refused when not the student's own, read back by
all three roles, and carried by an offline time-out replayed twice; the
time record's columns in twenty cases, among them a break at 10:00 AM, a
day ending at 12:59 and at 1:00, and a session after midnight; the
calendar's weeks, week numbers, day facts and weekly figures; the term on
the student's profile. 21 end-to-end tests (19 before). In a browser at
390 px and 1280 px: the calendar, its sheet, the keyboard, holding a day,
the progress tab, the time record's merged "No break" cell, the report
form, and the time-out dialog's task list. The automated accessibility
check on 50 pages at both widths: clean, after giving each calendar day a
spoken name of its own and keeping the contrast of days outside the
month.

**Not checked:** on a real phone (the calendar's squares under a thumb,
holding a day on a touch screen). The time record printed on paper. The
calendar and progress views with a connection really lost.

## 30. Round 2, Phase 4: the supervisor's day (12 October 2026)

On `ui-redesign`, on localhost. Two additive migrations (041, 042).

- **A page for each intern (4.1).** `/supervisor/interns/:studentId`, with
  tabs: Overview (hours, projected finish, contact and emergency contact,
  program and block, what is waiting, the weekly schedule), Attendance
  (the month calendar the student has, totals, late time-ins, absences,
  logs with corrected times, logs recorded offline), Tasks, Documents,
  Weekly reports, Evaluate (star ratings and the final evaluation form),
  Time record (with the month's certification) and Notes. The Interns
  dialog is a short preview with "Open". Evaluations is out of the top
  bar; its old address leads to the intern's Evaluate tab, and so does
  "Final evaluation due" in the Review queue.
- **Today (4.2, 4.7).** At the top of Review: a chip for each intern (on
  the clock, done, not in 15 minutes after the start, not scheduled,
  absence filed), from one request for every intern's schedule. Under it:
  how long the oldest item has waited (amber from three days), tasks due
  within a week and who has not submitted, interns within 40 hours of
  finishing with no final evaluation, the newest unread announcement, and
  the date and follow-up of the coordinator's latest visit to the company.
- **Release on (4.3, migration 041).** A task can be given a day to be
  released. Until then the intern is not shown it anywhere and is told
  nothing; on the day they get "New task assigned", once. The supervisor
  sees it marked "Scheduled" and can still move the day.
- **Teams (4.4, migration 041).** A Teams tab on Tasks: create, rename,
  change members, remove. A task assigned to a team is one task for each
  member; the list shows it as one line ("1 of 2 submitted") that opens
  to each member. Editing or cancelling it changes the members who have
  not submitted and says how many it left.
- **Notes with the coordinator (4.5, migration 042).** A thread about one
  student, on the supervisor's intern page and the coordinator's student
  record. Each note tells the other side. The student never sees it.
- **Remind (4.6).** On the coordinator's action list, each supervisor who
  is slow to review has a "Remind" button: one reminder a day per
  supervisor, enforced by the server and logged.

**What was checked:** both migrations run twice locally. 152 API tests
(141 before), all passing: a release day refused when malformed, past or after the due date; a task
hidden from the intern's list, checklist, data download and submit until
its day, then announced exactly once however often the loop runs; teams
made only of the supervisor's own interns; a team task as one row each,
changed and cancelled around a member who had submitted; notes refused to
the student and to another supervisor, absent from the student's
notifications and download, logged without their words; a reminder sent
once a day and refused with nothing waiting; every schedule in one
answer; a site visit without its findings; the Today chip for each case
at 8:15 and 8:16. 25 end-to-end tests (21 before), all passing, among
them a team task given to two interns, seen by both, submitted by one,
and shown to the supervisor as 1 of 2. One existing journey gained a
setup step (the second demo intern is put in the first one's block), and
one assertion changed with the top bar (Evaluations is no longer in it). The automated accessibility check on 61 pages
(50 before) at both widths: clean.

**Not checked:** on a real phone. A release announced by the server at
midnight rather than by moving the date in a test. That a deadline
reminder is held back for an unreleased task (it is in the query; no test
waits on the minute loop).

## 31. Round 2, Phase 5: the programme, for the coordinator (12 October 2026)

On `ui-redesign`, on localhost. Three additive migrations (043, 044, 045)
and one new backend package (`fflate`).

- **Student performance (5.1).** For each active student: hours and
  projected finish, attendance on scheduled days, late time-ins, logs
  rejected and corrected, tasks on time and late with their average
  rating, weekly reports against weeks worked, requirements approved, the
  supervisor's star average, the final evaluation's average, and concerns
  that name them. A status word and one sentence read them out. No score.
  The status is the first of these that fits:
  - *Completed:* all the required hours are verified.
  - *At risk:* at the scheduled hours the student would finish after the
    term ends, or hours remain and no working days are scheduled. The same
    rule as Monitoring.
  - *Behind:* timed in on fewer than 80% of scheduled days (once 5
    scheduled days have passed), or 2 or more tasks are late.
  - *On track:* none of the above.
  It is at the top of a student's record and is a sortable table on
  Analytics with the filter bar, its own CSV and PDF, and a "?" that
  shows these rules.
- **Documents by group, and as a ZIP (5.2).** Requirement progress can be
  read by college, program, block and student, each level with its share
  approved. "Download as ZIP" takes the filter bar, a status and a
  requirement: built on the server and sent as it is built, at most 500
  files or 500 MB, each file named student, requirement, original name,
  and recorded in the audit log with the filters. Storage is unchanged.
- **Deliverables (5.3, migration 045).** A requirement can be due on a
  date, by the end of a week of the term, or every week; be reviewed by
  the coordinator; and be asked only of some programs or blocks. Students
  see the dates on Documents and as dots on their calendar, with a list
  of weeks for a weekly one, and are reminded once the day before. The
  coordinator approves or rejects their own on the Documents page. A
  weekly deliverable that repeats the weekly report is refused.
- **Chart zoom and any date range (5.4).** Analytics takes a first and
  last day and a grouping by day, week or month, beside the three quick
  periods. The hours chart scrolls sideways under a fixed value axis, with
  + and - for the column width. "View as a table" is kept.
- **Targets (5.5, migration 043).** The six key figures' targets are set
  from the Dashboard; the old values are the defaults. Audited.
- **Term setup checklist (5.6).** Seven computed lines on a term that has
  not started or just started, each with a link.
- **A schedule for a block (5.7).** From Programs or Students: fill in
  the week, see who already has a different schedule, overwrite or skip
  them. Audited. The Requirements page no longer edits schedules.
- **Saved views (5.8, migration 044).** The filter bar's choices under a
  name, per coordinator.

**What was checked:** the three migrations run twice locally. 166 API
tests (152 before), all passing: the status rules at their edges (80% is
not under 80%; four scheduled days is too few to say) and the sentence
word for word; the performance table's hours against Monitoring's for a
seeded block, student by student and in sum; a date range against the
same days asked for as "the last 14", and groups that add up to their
days; a ZIP opened and compared byte for byte, its names, a missing file,
the caps, and its audit entry; a deliverable hidden from another
program's student, a week made once however often the loop runs,
reminded once, reviewed by the coordinator and refused to the
supervisor; targets set, reset and logged; views kept from another
coordinator; the checklist following a record; a block's schedule
previewed, skipped and overwritten. 30 end-to-end tests (25 before), all
passing. The automated accessibility check on 61 pages at both widths:
clean.

**Not checked:** on a real phone. A ZIP near its cap, or built from files
on the host's volume. A weekly item made by the server on a Monday rather
than by calling the loop in a test. The PDF of the performance table
printed.
