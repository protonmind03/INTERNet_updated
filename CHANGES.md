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
   be overridden with `VITE_API_URL`. This workspace uses port 5001 because a
   different local project copy is already listening on port 5000.
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
