# INTERNet: system brief for IT reviewers

As of 25 November 2026, branch `ui-redesign` at `c1ef679`. Every figure below is read from the code or from a test run on that commit.

## At a glance

INTERNet is a Progressive Web App (PWA) for the OJT (internship) program of PSU Lingayen. It has **five portals, one per role**: Student (trainee), Supervisor (the agency's supervisor), Coordinator (OJT instructor), OJT Director, and IT Administrator. Every portal is installable as an app.

| | |
|---|---|
| Front end | React 19, TypeScript, Vite 8, Tailwind 4, vite-plugin-pwa (Workbox, `injectManifest`) |
| Back end | Node 22, Express 5, TypeScript (run with `tsx`) |
| Database | PostgreSQL (CI uses 18), plain SQL migrations `001` to `092`, no ORM |
| Hosting | Vercel for the site; Railway for the API, the database and the `/data` volume |
| Files | Cloudflare R2 / S3, Azure Blob, or local disk, behind one interface |
| Email and push | An HTTPS mail API (Resend) or SMTP; Web Push with VAPID |
| Size | 347 API routes; 92 migrations |
| Tests | 322 API tests (all pass on a fresh database); 34 Playwright specs; Lighthouse and an axe accessibility sweep in CI |

```
 Phone / laptop browser (installed PWA)
 ├─ React app + service worker (precache, offline page)
 ├─ IndexedDB: last-loaded records, drafts, the waiting queue
 └─ Camera check (MediaPipe, on the device) + device key (WebCrypto)
        │ HTTPS, JSON, Bearer JWT          ▲ Server-Sent Events (live notifications)
        ▼                                  │ Web Push (VAPID)
 Express API (one instance, Railway)
 ├─ auth, role guards, scope filters, audit middleware
 ├─ in-process jobs: reminders, digests, auto-count, photo purge (Postgres advisory locks)
 ├─ PostgreSQL (Railway)
 ├─ private file store (R2 / S3 / Azure / disk)
 └─ email API / SMTP
 Separate Railway cron service: nightly pg_dump → age-encrypted → R2
```

---

## 1. Measures shared by every portal

### Sign-in and sessions
- **One login code path per role:** `/api/login/{student,supervisor,coordinator,director,admin}`.
- **Passwords:** bcrypt, 12 rounds. A plain-text password stored in the database is never accepted; `npm run db:hash-legacy-passwords` converts old rows.
- **Lockout:** 5 failed tries per role and email in 15 minutes, held in Postgres, locks the login for 15 minutes. There is also a per-IP limit, held in memory.
- **Tokens:**
  - JWT signed with HS256, valid for 12 hours.
  - The server refuses to start if `JWT_SECRET` is shorter than 32 characters.
  - Signing out writes the token's hash to `revoked_tokens`.
  - Every request also checks an `auth_version` number on the account, so a password change or "end every session" invalidates every token at once.
- **Forced password change:** temporary passwords (from the admin or the create-account scripts) must be changed before anything else works.
- **Passkeys:** WebAuthn through `@simplewebauthn`, platform authenticator, user verification required. They are optional and are used to confirm breaks and time-out.
- **Known trade-off:** the token is kept in `localStorage`, accepted because the CSP is enforced. "Keep me signed in" off ends the session when the browser closes.

### Access control
- **Role guards** on every route (`requireRole`, `requireCoordinator`, `requireDirector`, `requireAdmin`), plus ownership checks on each record.
- **Coordinator scope:**
  - A coordinator sees only the colleges and programs assigned by the Director (`coordinator_scopes`, one SQL helper used by every coordinator route).
  - A record outside the scope answers 404, the same as a missing record, so it does not reveal that the record exists.
- **Separation of duties:**
  - The IT admin is refused (403) on every route that holds student content.
  - Supervisors never see health or clearance documents.

### Integrity of data
- **Concurrent decisions:** reviewed records carry a `version` that a trigger moves on every change. A decision sends `expected_version`; if someone else changed the record first, the API answers **409 STALE** and writes nothing.
- **Idempotent offline sends:** each queued step has its own request id, so a retry records it once.
- **Slot limits:** checked in the same transaction as the placement, with `SELECT … FOR UPDATE` on the company. Two coordinators cannot both take the last slot.
- **SQL injection:** all SQL is parameterised. The few built strings use whitelisted columns only.
- **Time zone:** dates are kept in Asia/Manila. A lint step fails the build if a date is formatted without naming its time zone.

### Audit and observability
- **Audit log:** middleware driven by a rules table logs every change, and also sensitive reads (opening a student record, a document, a photo, or a health file). Details come from a whitelist, so no passwords or file contents are stored.
- **Problem reports:**
  - Server errors are reduced to a label and an error kind; client crashes are reported with no token and no query string.
  - Both show to the IT admin.
  - Nothing is sent to an outside monitoring service.

### Uploads and files
- **Size limits:** 5 MB, or 10 MB for documents.
- **Type checks:** the extension must match the declared type, and the file's first bytes must match the extension.
- **Pictures:**
  - The phone redraws each picture (at most 1600 px, JPEG), which drops the camera's location data, and makes a 480 px WebP preview.
  - The server also strips EXIF, XMP and IPTC data.
- **Quotas:** 300 MB per student, 200 MB per supervisor, 60 files a day. Time-in photos are exempt.
- **Storage:** files are private and served only through routes that check who is asking.

### Privacy (RA 10173)
- **Consent:** the notice is versioned (`draft-6`). Consent before time-in is required when `PRIVACY_CONSENT_REQUIRED=true`.
- **Retention:** time-in photos are purged nightly once `PHOTO_RETENTION_DAYS` (at least 30) is set. The log and its hours are kept.
- **Health and clearance files:** a restricted category. Every opening is audited, and they never appear in albums, previews or exports.
- **Location check:** keeps only the distance, rounded to 10 m, never the coordinates.
- **Data export:** students can download their own data.

### Notifications
- **In-app feed** with per-kind preferences.
- **Live updates** over Server-Sent Events.
- **Web Push (VAPID):** badge on the app icon. Clicking a push opens only same-origin pages.
- **Email:** through an HTTPS API or SMTP, with a daily email budget so a bad loop cannot flood anyone.

### Background jobs
- **What runs:** deadline reminders, time-out reminders, supervisor digests, auto-count of clean logs, the photo purge, and monitoring-plan reminders.
- **Where:** inside the API process, each behind a Postgres advisory lock, which is why the API runs as one instance.
- **Backups:** a separate Railway cron service runs `pg_dump` nightly, encrypts it with `age` to a public key, and uploads it to R2. Uploaded files are zipped weekly.

### Security headers
- **CSP is enforced** (`my-pwa/vercel.json`): `script-src 'self' 'wasm-unsafe-eval'`, `connect-src` limited to the API hosts, `frame-ancestors 'none'`.
- **Other headers:** X-Frame-Options and Permissions-Policy on the site; `helmet` on the API.
- **CORS** allows only `FRONTEND_URL`/`CORS_ORIGINS`. In production the API refuses to start without them.

### The PWA layer
- **Service worker** (`my-pwa/src/service-worker.ts`, built with Workbox `injectManifest`):
  - **Precache:** about 230 files (about 5 MB): app code, fonts, icons.
  - **Page loads:** network first with a 6-second timeout, then the cached page, then `/offline.html`.
  - **Large assets:** face-check files, model and PSU marks are cached on first use (CacheFirst).
  - **API responses are never cached by the service worker.**
  - **Updates:** a new version waits until the user taps "Reload" on the update toast. The app checks for updates when it comes back to the front, at most every 15 minutes.
  - **Killswitch:** a build flag (`SW_KILLSWITCH=true`) publishes a worker that clears every cache and unregisters itself.
- **Offline data:** IndexedDB with three stores (records, drafts, queue), keyed `role|id`.
  - Sign-out, an ended session or a forced password change erases that account's records and drafts.
  - The queue is kept for up to 72 hours, unless the phone is marked as shared.
- **Reachability:** `navigator.onLine` is treated only as a hint. The app asks `GET /api/health` (3-second timeout), backing off from 3 seconds to once a minute.
- **No Background Sync**, by design: the service worker cannot read the token. The queue sends when the app is open.
- **Install:**
  - **Manifests:** five role manifests, each with its own icons and iOS splash images.
  - **Install prompts:** the Android/desktop prompt is caught (`beforeinstallprompt`); on iPhone the app shows the Safari "Add to Home Screen" steps.

---

## 2. Student (trainee) portal: `/student`, `/daily-log`, `/task`, `/schedule`, `/documents`, `/report`, `/journal`, `/time-record`, `/profile` …

**Purpose:** record attendance and work, submit requirements and reports, and follow progress to completion.

**Features**
- **Today:**
  - what needs attention, with up-next cards and the hours strip;
  - a **Requirements card** listing what is still missing before deployment;
  - a projected finish date.
- **Attendance:**
  - time-in, lunch break, end break and time-out;
  - accomplishments written at time-out, with up to 3 pictures;
  - this week, the schedule, absences, corrections and appeals;
  - **overtime requests** (at most 2 days a week by default).
- **Documents:** requirement uploads, including restricted medical and clearance files, with Returned / Under review / Done states.
- **Pre-OJT forms:** "Fill and print" for the PSU forms (FM-AA-INT-01, 02, 03, 18 …). Each prints alone on A4, or saves as a real-text PDF or an editable Word file.
- **Reports:** daily, weekly (FM-AA-INT-19) and monthly reports, journals, and the **Narrative report builder** (DOCX export).
- **Placement:** an **agency choice window** to rank up to 3 approved agencies, and a "suggest an agency" request.
- **Completion:** completion checklist, then a completion review request (approved or returned by the coordinator), the released final grade, and the internship feedback form.
- **Account:**
  - profile, contact details, optional SSS and Pag-IBIG numbers;
  - signature, passkeys, notification settings, privacy and data download, album.

**Special measures**
- **Camera check (liveness):**
  - MediaPipe FaceLandmarker runs **on the phone**, GPU first with a CPU fallback, at about 15 readings a second.
  - The server picks the prompts (head turns, blink; a strict level after a rejected photo).
  - There is a low-light hint. After 20 seconds without a pass, the student can continue without a photo; the reason is kept and the supervisor confirms.
  - It is a deterrent against proxy attendance, **not face recognition**. No face template is stored.
- **Offline time-in:**
  - While online, the phone collects signed **vouchers** for up to 2 days ahead.
  - Offline, it signs the photo's SHA-256 and the voucher with a **non-extractable ECDSA P-256 device key** (WebCrypto).
  - The server checks the signature, the age limits (12 h for time-in and breaks, 24 h for time-out) and the phone's clock skew.
  - Without a voucher, the time-in waits for the supervisor.
- **Waiting to send:** one panel shows every queued step, how old it is, its last error, and Retry or Discard.
- **Deployment gate:** when the Director switches it on, every time-in path (online, offline, recorded by the supervisor) refuses an uncleared student, and names what is missing.
- **Location check** (optional): distance from the agency's point only, never a refusal. Outside the area, the log goes to the supervisor.
- **"Prepare for offline"** in onboarding downloads the face-check files and vouchers, ideally on Wi-Fi. The first download is about 19 MB.
- **Shared-phone sign-out** erases everything, including what is waiting to be sent.

**Works offline:**
- **Readable:** dashboard, attendance, tasks, schedule, documents list, profile and the other screens as last loaded.
- **Kept as drafts:** journals, reports, notes, absences and messages.
- **Queued:** time-in, breaks, time-out and time-out pictures.
- **Needs a connection:** submitting documents, journals and absences; signing in.

---

## 3. Supervisor portal (host agency): `/supervisor/*`

**Purpose:** confirm what the interns did, quickly, with as few steps as possible.

**Features**
- **Review:**
  - one list of everything waiting: logs, tasks, documents, weekly reports, absences, **overtime requests**, and photos flagged by the location or camera checks;
  - one Review button per row, with bulk actions where they are safe.
- **Interns:** each intern's page with progress, schedule, what waits and the finish projection. Teams.
- **Attendance:**
  - the register and the day board;
  - **record a time-in in person**, for a student without a working phone;
  - monthly DTR certification (CS Form 48).
- **Tasks:** give, release, review, with attachments.
- **Final evaluation:** the weighted FM-AA-INT-13 form, which gives the HTE half of the grade.
- **Communication:** messages, announcements, an evening digest of daily reports, and concerns about an intern.

**Special measures**
- **Health files:** supervisors never see health or clearance documents. When the gate refuses an intern, the supervisor is not told which health items are missing.
- **Stale decisions:** a decision on a record that changed since it was opened is refused (409) and the page reloads.
- **Decisions are never queued offline.** Every decision needs a connection, so none can be applied late against changed data.

---

## 4. Coordinator portal (OJT instructor): `/coordinator/*`

**Purpose:** run the term for the colleges or programs the coordinator is assigned to.

**Features**
- **Students and supervisors:**
  - accounts and CSV import, with each program's required hours as the default;
  - the full student record;
  - notes, appeals and concerns.
- **Clearance board:**
  - academic eligibility (eligible / deficient, with a note);
  - every pre-deployment requirement as a chip;
  - "Clear for deployment", or "clear anyway" with a written reason (audited);
  - bulk clearing and CSV export.
- **Requirements:** the requirement list, targeted by program, block or sex; due dates; restricted categories.
- **Agencies (HTE):**
  - type (government / private / university) and status (applied, screening, approved, suspended);
  - notarized MOA file and dates;
  - screenings (standing, environment, space, safety);
  - slots and the programs each agency takes;
  - agency suggestions;
  - the location point and radius.
- **Placement:**
  - open the agency choice window;
  - see demand against slots;
  - assign, with slot and approval checks on every path.
- **Monitoring:**
  - planned visits, calls and message check-ins, with reminders and a PDF of the plan;
  - the visit log, alerts and at-risk students.
- **Records:**
  - document review and ZIP export;
  - hard copies received (by whom and when), transmittal scans and a printable transmittal letter;
  - completion approval or return.
- **Grades:**
  - the instructor's four scores;
  - a grade sheet (HTE half plus instructor half, on the 1.00–5.00 scale), with CSV and PDF;
  - release to students.
- **Term setup:** terms with semester and academic year, carry-over of continuing students with their hours, holidays and schedules.
- **Reports:** KPIs, analytics with CSV and PDF, and the audit view.

**Special measures**
- **Scope:** every list and export is filtered to the coordinator's colleges and programs. Outside them, a record answers 404.
- **Before a Director exists:** coordinators keep the office's powers, so the deploy does not lock anyone out.
- **Offline:** only notifications and announcements can be read offline. Every figure and decision is live.

---

## 5. OJT Director portal: `/director/*`

**Purpose:** campus-wide oversight and the OJT rules.

**Features**
- **Overview:**
  - the campus **by college** (a row of PSU college marks filters every page);
  - interns, cleared for deployment, on track, at risk, agreements ending.
- **Coordinators:** create, deactivate, reset, and assign each coordinator's colleges or programs. Only the Director can do this once a Director exists.
- **Programs:**
  - required hours per program (BPA 400, BSIT 480, BSBA 600 set; the rest still to be given);
  - each program's requirement templates;
  - the semesters each program's OJT runs in.
- **Rules**, each change audited with the old and new value:
  - the deployment gate;
  - the overtime limit;
  - the grade split and instructor weights;
  - the location check (off / record / review when outside).
- **Approvals:** private agencies, final grade release, and clearance overrides with their reasons.
- **Students:** a read-only view of any student record; each opening is audited.
- **Reports:** campus exports (CSV and PDF).

**Special measures**
- **Defaults are safe:** gate off, location off. Nothing changes on deploy until the Director decides.
- **Account creation:** Director accounts are made only by the IT admin or the CLI (`npm run director:create`). The rest of the office is notified whenever one is made or reactivated.

---

## 6. IT Administrator portal: `/admin/*`

**Purpose:** keep the system running, without access to student content.

**Features**
- **Accounts:** search every role; unlock a login; email a temporary password; end every session; deactivate or reactivate. Each destructive action asks first, naming the account and the effect.
- **System status:** health and readiness, migration level, the problem log, the email budget, push status, upload usage.
- **Backups:** last database dumps and upload backups, photo-purge runs, and "back up uploaded files now". Keys are never shown.
- **Production warnings:**
  - CORS set, consent required, retention set;
  - privacy notice still a draft;
  - push keys, backups.
- **Maintenance notice:** shown in every portal.
- **Audit log:** full view and CSV export.

**Special measures**
- **No student content:** a permanent line on the home page says the portal cannot open students' records, documents, photos or grades. The server enforces this (403), and a test covers each route group.
- **First account:** made only by CLI (`npm run admin:create`), with a temporary password that must be changed. There is no sign-up page.
- **Look:** a deliberately different, light theme, so it is never mistaken for an academic portal.

---

## 7. Quality and delivery

- **CI (GitHub Actions)** runs three jobs:
  1. **Backend:** time-zone lint, "every route named by a test", the architecture-doc check, migrations, seed, then the API tests.
  2. **Frontend:** `tsc` + Vite build, PWA check, ESLint.
  3. **End-to-end:** Playwright on Chromium, then the axe sweep (fails on serious problems), then Lighthouse (report only).
- **Results on `c1ef679`:**
  - **Locally:** API tests 322 of 322; build, lint and PWA check (198 of 198) clean.
  - **CI is currently red.** The architecture doc was not regenerated; one Admin test is order-dependent; accessibility issues on the supervisor's Journals page. Each has a known one-file fix.
- **Accessibility:** axe WCAG 2.1 A/AA sweep at 390 and 1280 px. Automated only; no screen-reader test yet.
- **Rollback:**
  - Railway keeps the previous deploy if the health check fails. Migrations run before start (`preDeployCommand`), and if a migration fails, the old version keeps running.
  - Vercel can promote the previous build.

## 8. Limits to state plainly

- **One API instance:** the jobs and live notifications run in-process. This is enough for one campus; scaling out needs a job runner and a shared event bus.
- **Camera check:** a deterrent, not proof; the server trusts the phone's report, and the supervisor's photo review is the authority.
- **Offline data is not encrypted** on the phone (browser storage). Mitigated by erasing it at sign-out and on shared phones.
- **Not yet tested on real phones:** camera, offline time-in, passkeys, push.
- **Not yet independently tested:** no penetration test; reviews were code reviews plus tests.
- **Still to be given by the university:**
  - grade split and weights, PSU's grade table, HTE criteria;
  - hours for 12 programs;
  - privacy wording, DPO and retention.
- **Email and push** need their production keys.

## 9. Questions an IT reviewer may ask

| Question | Answer |
|---|---|
| Where is the data? | PostgreSQL on Railway; files in R2, S3 or Azure (or the Railway volume); nightly encrypted dumps in R2. |
| Can we self-host? | Yes in principle: plain Node and Postgres with environment variables, and the site is static files (`DEPLOY.md`). `docker-compose.yml` is for development only; a campus server setup would need to be written. |
| How do you stop proxy attendance? | Camera liveness check, signed offline vouchers, supervisor review of every log, and an optional distance check. |
| What if two people decide the same record? | Version check: the second gets 409 and the page reloads. |
| How is a compromised account handled? | The admin ends every session (bumps `auth_version`), issues a temporary password, or deactivates the account. All three are audited. |
| What leaves the campus? | Only email and push messages through their providers. There is no analytics or monitoring service. |
| How do updates reach phones? | The service worker waits; the user taps "Reload". A killswitch build exists if a worker misbehaves. |
