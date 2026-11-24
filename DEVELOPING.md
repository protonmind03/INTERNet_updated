# Developing INTERNet

Notes for whoever changes the code. Deploying is in `DEPLOY.md`.

## Working offline

What each role can do with no connection. The same table is on the app's
Help page (`/help`, from `my-pwa/src/lib/offlineHelp.ts`); change both
together.

| Role | Works with no connection | Waits on the phone, sent later | Needs a connection |
|---|---|---|---|
| Student | Dashboard, attendance, tasks, schedule, absences, company and profile as last loaded; drafts of journals, reports, task notes, absences and messages | Time-in (with a photo when the phone is ready, otherwise without one for the supervisor to confirm), within 12 h, judged at the time it was pressed; lunch break and end break, within 12 h; time-out, within 24 h, with up to 3 pictures (about 400 kB each) sent after it | Submitting tasks, documents, journals and absences, and pictures on journals and concerns; messages and concerns; signing in |
| Supervisor | Interns, logs, tasks, documents, absences, weekly reports and schedules as last loaded; message drafts | Nothing: a decision is never kept for later | Every decision; recording an intern's time-in; giving tasks; messages; signing in |
| Coordinator | Notifications and announcements as last loaded; message drafts | Nothing | Every page's current figures; every decision, change, import and export; signing in |
| Director | The campus overview, programs and coordinators as last loaded; notifications | Nothing | Every decision and change (rules, a coordinator's colleges, a program's hours); exports; signing in |
| Administrator | The maintenance notice and their own account; nothing else is kept on the device | Nothing | Every page (accounts, status, backups, warnings, audit log); every account action and the notice; signing in |

The hours are the server's defaults. Each can be changed per deployment:
`OFFLINE_MAX_AGE_HOURS_TIME_IN`, `OFFLINE_MAX_AGE_HOURS_LUNCH`,
`OFFLINE_MAX_AGE_HOURS_TIME_OUT` (1 to 72). When one is not set the older
`OFFLINE_ACTION_MAX_AGE_HOURS` is used, and then the default
(`backend/src/services/offlineActions.ts`). Separately, the phone erases a
waiting step after 72 hours (`QUEUE_KEEP_HOURS` in `lib/offlineStore.ts`).

### How the phone decides it can send

- `navigator.onLine` is only a hint. `my-pwa/src/lib/reachability.ts` asks
  `GET /api/health` and waits at most 3 seconds. While the server cannot be
  reached it asks again after 3 s, 6 s, 12 s… up to once a minute; it asks
  again at once on `online`, `offline`, and when the app comes back to the
  front. `useReachability()` gives a component the answer.
- `my-pwa/src/lib/offlineQueue.ts` sends the waiting steps only when that
  answer is yes, in the order they were recorded. A try that does not get
  through is written on the step (`attempts`, `lastTriedAt`, `lastError`).
- `my-pwa/src/pages/student/WaitingToSend.tsx` is the "Waiting to send"
  panel on every student page: each step's age, until when the server will
  take it (`GET /api/offline/limits`), the last error, Retry, and Discard
  (after a confirmation; a time-in takes the steps after it with it).

## Two people deciding the same record

Migration 062 gives `attendance`, `tasks`, `documents`, `absences`,
`journals` and `attendance_appeals` a `version` that a trigger moves on
every change to the row. The lists reviewers decide from return it, and
every review decision sends it back as `expected_version`. If the record
has changed since, the route answers **409** with
`{ code: "STALE", message, current: { id, status, version, note } }` and
writes nothing (`backend/src/services/versions.ts`). The pages show the
message and reload.

- A request without `expected_version` is decided as before, so an older
  copy of the app still works.
- Only records the caller may see are looked at: a supervisor asking about
  another supervisor's intern gets the route's usual answer, not the 409.
- Undo routes do not check the version: they have their own time limit and
  checks.
- A new decision route should call `staleDecision(...)` right after its id
  check, and its list should select the `version` column.

## Pictures on entries

Up to three pictures on a time-out note, a weekly report or a concern
(`backend/src/routes/attachments.ts`, `my-pwa/src/lib/attachments.ts`).

- The phone redraws each picture (at most 1600 px, JPEG, which drops the
  camera's location data) and also makes a **480 px WebP preview**. Both are
  sent; the server keeps the preview as `preview_path` (migration 063).
  Lists show previews (`GET /api/attachments/:id/preview`); the picture
  itself (`/file`) is fetched when it is opened. A picture without a
  preview is shown from the picture itself.
- Each picture carries `client_ref`, the phone's id for it: a second
  upload with the same id onto the same entry returns the picture already
  there.
- **Offline:** pictures chosen for a time-out with no connection wait in the
  queue as a `"pictures"` row right after it (made smaller to about
  400 kB each), and are sent once the time-out is accepted, with the
  time-out's `occurred_at`; the server refuses them past
  `OFFLINE_MAX_AGE_HOURS_TIME_OUT`. Journals and concerns still need a
  connection, pictures included.
- **HEIC** is refused with guidance on what to change on the phone
  (roadmap decision 6); no converter is shipped.
- **Coordinator ZIP:** `include_pictures=1` on
  `/api/coordinator/documents/zip` adds the same students' pictures on
  time-out notes and weekly reports as `Pictures/<student>/...`, inside the
  same 500-file and 500 MB limits. Pictures on concerns are never included.

## The PWA check and Lighthouse in CI

- `npm run check:pwa` (in `my-pwa`, after `npm run build`) fails when the
  build is no longer an installable, offline-capable PWA: a manifest field
  an install needs, an icon size (192 and 512, "any" and "maskable"), an
  icon or screenshot that is missing or not the size it says, the service
  worker (or it is the kill switch, or it does not keep `index.html`,
  `app.html` and `offline.html`), `offline.html`, the Home Screen icon,
  `lang="en-PH"`, or an iPhone start-up image (`npm run startup-images` makes
  them). Since Iteration 23 it also checks the three role apps' manifests
  (`public/manifest-{role}.webmanifest`, made by
  `scripts/make-role-manifests.mjs`, icons by `scripts/make-role-icons.mjs`)
  and the landing page: rendered into `index.html`, not loading the app, and
  its script under 90 kB compressed. CI runs it in the frontend job.
- Two pages since Iteration 23: `index.html` is the public landing page at
  "/" (rendered at build from `src/landing/`), `app.html` is the app for every
  other address. `npm run dev` and `npm run preview` serve them the way
  Vercel does (`vercel.json`).
- `npm run lighthouse` (in `e2e`, with the site and API running) runs
  Lighthouse with its mobile settings on the landing page, the trainee's
  door and each portal's first page, the same pages as the Iteration 0 baseline
  (`docs/baseline/`). It writes `e2e/lighthouse-reports/` (an HTML and a JSON
  report per page, and `summary.md`). CI runs it after the end-to-end tests,
  shows the summary on the run's page and keeps the reports as the
  `lighthouse-reports` artifact for 30 days. It does not fail the build over
  a score.

## The brand preview and the loading prototypes

`/brand-preview` shows the brand kit; `/brand-preview?view=loading` shows the
three loading prototypes for after sign-in (P1 Road to today, P2 Shaped
skeleton, P3 The one thing; `my-pwa/src/brand/LoadingPrototypes.tsx`), with
the role, how long the data takes, and reduced motion to choose.

**P2 was chosen** (2026-10-18) and is what the app does after sign-in:

- Sign in fetches the role's first page file while the sign-in is checked
  (`my-pwa/src/lib/homePages.ts`) and opens the page as soon as it is
  answered; there is no launch screen of a set length after sign-in. The
  splash when the installed app is opened is unchanged.
- While that file is still coming, `components/PageSkeleton.tsx` stands in
  on the three first pages.
- Each first page draws placeholders where its figures and lists will be
  (`StatTile loading`, the coordinator's filter bar
  and figures, the student's progress card) and fills them in place.
- `e2e/tests/first-page.spec.ts` holds the data back and fails if the page
  shifts by 0.1 or more (cumulative layout shift) when it arrives. A new
  first-page element that appears only after loading needs a placeholder
  of its size.

The prototype components themselves are not used by the app. The page exists in development (`npm run dev`, or
`npm run dev:phone` to open it on a phone), or in a build made with
`VITE_BRAND_PREVIEW=true` (for a test site only; production leaves it unset).

## The PSU redesign: tokens, marks and rules

The 2026-10 redesign (`internet-revisions/REVISION_REPORT.md`) changed how
the app is styled and what the coordinator sees. What to know before
changing either:

### Brand tokens

- `my-pwa/src/brand/tokens.ts` is the source. `ROLE_PALETTES` holds each
  role's primary, accent, surface and chrome colour (trainee terracotta
  `#A84A0C`, supervisor green `#116C5C`, coordinator indigo `#4F46E5` with
  a navy `#1A237E` chrome); `ROLE_SURFACES` the hairline, dock and side
  menu colours; `ROLE_SCALES` the 50 to 950 scale each role's `psu-*`
  classes resolve to; `STATUS_COLORS` the status chips.
- `my-pwa/src/brand/brand.css` has one `[data-role]` block per role that
  sets the `--role-*` variables and redefines `--color-psu-*`, so a
  component written with `psu-600` takes the current role's colour. The
  layouts set `data-role` (`useRoleTheme`).
- Surfaces are flat. There are no gradients; depth comes from hairline
  borders (`.card-hairline`), the grain (`--inb-grain`) on the page canvas,
  and the motifs in `brand/motifs.tsx` (stamp, lane dash, punch row, hours
  road, register, route line, departures board, split facts). The only
  `linear-gradient` left is a CSS mask that fades a scrolling row's edges.
- Status colours are never a role colour, and always come with a word or
  a shape (`StatusBadge`, `.st-badge`).
- A tooltip is only ever behind an "i" (`components/InfoTip.tsx`): it opens
  after 0.6 s of hover or on keyboard focus and closes on leave.
- `brand/tokens.ts` has a test that every text pair passes 4.5:1
  (`paletteTextPairs`); add a pair there when you add a surface.

### PSU marks

- The files are in `my-pwa/public/brand/psu/` (`<key>.png` at 512 px and
  `<key>@128.png`); the service worker caches them on first use
  (`psu-marks-v1`) and precaches only the 128 px ones.
- `my-pwa/src/brand/psuMarks.ts` is the registry: one entry per file with
  its key, kind (university, college, program, major) and name.
  `getCollegeMark`, `getProgramMark` and `getMajorMark` find a mark for a
  record; when there is none, `MarkImages.tsx` draws a monogram of the
  short code instead. Never show a mark the registry does not list.
- `backend/src/services/psuMarks.ts` lists the same keys; the API accepts
  only those for `mark_key` and `seal_asset`, and a test checks the two
  lists agree and that every file is shipped. Adding a mark: add the two
  files, the registry entry, the server key, and (if it should be the
  default for a college or program) a new migration that sets it.
- The ECOSOC logo was not shipped (see `internet-revisions/MISSING_ASSETS.md`).

### Migration 071

`backend/migrations/071_psu_marks.sql` adds `mark_key` to colleges,
programs and majors and `org_name` to programs and majors, with a CHECK on
the key's form, and fills them only where they are empty. It also adds the
BSEd majors English, Filipino, Science and Social Studies if missing. It
is additive and safe to run twice. The Time Record's seal is
`institution_profile.seal_asset` (migration 068), now chosen from the PSU
set on the coordinator's Profile.

### Key figures have no targets

The KPI targets feature (the dialog, `PUT /api/coordinator/kpi-targets`,
the target and direction logic in `kpiDefinitions.ts`) was removed: the
key figures are plain counts with an "i". The `kpi_targets` table from
migration 043 is kept, as migrations are history; nothing reads or writes
it. Do not bring back scores, deltas or targets on coordinator screens.

### Navigation: one page, one entry, one name

The menu review (after Phase 7) settled how the three portals' menus work.
Keep to it when adding a page:

- **One entry per page, in one group, named as the page is titled.** The
  side menu, the dock and More list each destination once; the label is
  the page's `title`; a hub's tab label is the same word.
- **One current entry.** `lib/navMatch.ts` scores every entry against the
  whole address (path and query) and the highest wins, so
  `/coordinator/resolution?tab=appeals` marks Appeals and never Concerns
  too. The side menu opens only that entry's group; the dock lights one
  item or More, never both. Do not add broad "this group also owns that
  path" rules; give a record page's parent entry an `also` instead.
- **State that decides the entry lives in the address.** A page whose tabs
  or scope are menu entries (the supervisor's Review queue, Monitoring's
  scope) reads them from the query and writes them back with
  `replace`, so the menu, the title and Back agree.
- **No section bar twice.** When the side menu is open it lists a hub's
  pages, so the page does not draw them again: `HubNav` and
  `components/UnlessInMenu.tsx` hide them (`components/sideMenuState.ts`).
  A phone or the closed rail shows them. Underlined tabs are for sections;
  a filter inside a page is chips (`FilterChips`).
- **A hub only joins pages of one menu group** (`pages/coordinator/hubs.ts`).
  The coordinator's groups are Decide (what waits on you), Track (the
  term as it runs), People, Setup (what is set once), Talk and Reports.
  A page that leaves a hub keeps its old tab address working through
  `DEPARTED`.
- **Profile is the account**, at the foot of the side menu and at the
  bottom of More, not another entry.
- **Help stays in the portal**: `/student/help`, `/supervisor/help`,
  `/coordinator/help` (`pages/PortalHelp.tsx`); the public `/help` is
  for anyone not signed in.

The backend suite checks the coordinator menu for repeats and that menu
names match page titles; `e2e/tests/coordinator-hubs.spec.ts` and
`student-folder.spec.ts` click every entry and check exactly one is
marked.

### Showing figures and lists (the display kit)

The system pass gave every portal one way to show a figure, a section or
a summary (`components/display.tsx`, `components/tones.ts`):

- **Tones.** `brand` is the role's own colour, for plain subjects;
  `info`, `success`, `warning` and `danger` are the status colours
  (never a role colour, always with words beside them); `neutral` is for
  what needs nothing. A count of work waiting on the person is `warning`
  only while it is above zero; record statuses keep `StatusBadge`'s tones.
- **IconTile / CardHeader `icon`.** Every card names its subject with an
  icon tile; one subject, one icon (tasks, document, star, calendar …).
- **MetricCard.** A figure: subject icon, the value, a meter for a share,
  one line of context, an "i" for what is counted, and where to act.
  Analytics' key figures are always `brand`: they are never coloured as
  a score.
- **SummaryTiles.** When a list's filter has counts, the counts are the
  filter (one tile pressed). Filters without counts stay `FilterChips`;
  views and periods stay tabs. **CountTiles** is the same look for counts
  that only inform.
- **SectionTitle + JumpNav.** A long page is in titled sections with an
  "On this page" bar (Analytics).
- **Server counts for paged lists**: `GET /api/coordinator/students/counts`
  and `/api/coordinator/complaints/counts` take the list's own search and
  filters, so a tile's number is what choosing it shows.

### Behind schedule

One rule, in `backend/src/services/coordinatorHome.ts`:

- **behind**: the trainee's projection (`student_projections.at_risk`)
  says they finish after the term ends, or they have nothing scheduled;
- **almost done**: within the last 10% of their required hours
  (`ALMOST_DONE_SHARE = 0.1`), or done; this wins over "behind";
- **on the way**: everyone else.

It is a constant in code, not a setting, and the coordinator Home's cohort
line, its counts and the "Behind schedule" figure all use it.

## Docker for development

`docker-compose.yml` (in the project folder) runs the whole system on
your computer: PostgreSQL 16, the API (`tsx watch`, so it restarts when a
file changes), the Vite dev server, Mailpit, which catches every email,
and an S3 stand-in for Cloudflare R2. **None of it is used by the test
site or production**: Vercel and Railway build from the folders directly,
and every password in it is a throwaway.

**First run** (needs Docker Desktop):

```
docker compose up
```

The first start downloads the images and installs the packages inside the
containers (a few minutes). Then, in a second terminal, add the demo
accounts:

```
docker compose exec api npm run db:seed-demo
```

| What | Where |
|---|---|
| The app | http://localhost:5173 (sign in with the demo accounts the seed printed) |
| The API | http://localhost:5000/api/health |
| Caught email | http://localhost:8025 (password resets, reminders, messages) |
| The database | `localhost:5433`, user `postgres`, password `postgres`, database `internet_ojt` |
| The bucket stand-in | http://localhost:9090, buckets `internet-dev-uploads` and `internet-dev-backups`, any access key |

`docker compose down` stops everything and keeps the data;
`docker compose down -v` erases it too.

Packages are installed once, into the containers' own folders, with
`npm ci`, so `package-lock.json` on your computer is never changed. After
adding or updating a package, run `docker compose exec api npm ci` (or
`web`) and restart that container.

Notes:

- **Stop any `npm run dev` of your own first.** Two dev servers on port
  5173 (or 5000) answer for each other.
- **Email** goes to Mailpit without TLS. The API allows that only when
  `SMTP_ALLOW_PLAINTEXT=true` *and* the mail server is `mailpit` or this
  computer; any real mail server still needs TLS.
- **The demo seed** refuses every database but a local `internet_ojt`. In
  the containers the database is called `db`, so the compose file sets
  `INTERNET_DOCKER_DEV=1`, which allows exactly that host.
- **What the demo seed adds** besides the demo accounts (Phase 0.5): five
  agencies like PSU Lingayen's partners (the Provincial Government, DepEd
  SDO Pangasinan I, PPA PMO Pangasinan, the Registry of Deeds Lingayen,
  and a made-up private company in Dagupan) with MOA dates relative to
  today (one ends within the week) and slots; one made-up supervisor each;
  six made-up trainees in BSIT, BPA and BSBA with their program's hours;
  last week's attendance in mixed states; one pending Endorsement and one
  submitted weekly report. Every person is fictional, every email ends in
  `@demo.invalid` and every ID starts `DEMO-`; the passwords are the demo
  accounts'. It never changes the demo accounts' own records (the demo
  supervisor keeps two interns), and a second run adds nothing.
- **The database address** ends in `?sslmode=disable`: the container has
  no TLS, and the backend otherwise uses TLS for every host that is not
  this computer.
- **Uploads** stay on the API container's disk, as on Railway today.
  Uncomment the four `R2_*` lines in the compose file to try the bucket
  stand-in instead.
- **Backups** can be tried against the stand-in: run
  `docker compose exec api npm run backup:keygen`, put the public key in
  your shell (PowerShell: `$env:BACKUP_AGE_RECIPIENT="age1…"`), run
  `docker compose up -d api`, then
  `docker compose exec api npm run backup:uploads-now`. The nightly
  database backup needs `pg_dump`, which is in `backup.Dockerfile` (repository root),
  not in the API container.
- `backend/.env` on your computer is visible inside the API container (the
  folder is shared), but the compose file's own settings win for every name
  it sets.

## Scheduled backups

`backend/src/services/backups.ts` and `backend/src/scripts/backup-cron.ts`;
DEPLOY.md, "Scheduled backups", has the setup on Railway and Cloudflare.

- The nightly database backup is a separate Railway service
  (`railway.json` and `backup.Dockerfile` at the repository root; the API
  keeps `backend/railway.json`): `pg_dump -Fc`
  streamed through age encryption (the `age-encryption` package, to a
  public key) into a multipart upload, never held whole in memory or on
  disk. A dump that fails is abandoned before the upload is made final.
- The weekly uploads pack runs in the backend's scheduler, between 02:30
  and 05:00, only while files are on its disk.
- Every run is a row in `backup_runs` (migration 064); the coordinator's
  status card reads them (`GET /api/coordinator/system-status` > `backups`).
  A restore drill is recorded with `POST /api/coordinator/backups/restore-drill`.
- `npm run backup:keygen` makes the key pair; `npm run backup:decrypt`
  opens a backup with the private key, for a restore.

## The OJT Director and coordinator scopes (Phase 1.6)

- **A fourth portal, `/director`.** Accounts are in `directors` (migration
  080); `npm run director:create email=… name="…"` makes one with a
  temporary password (`deactivate` turns one off). The sign-in is the
  coordinator's own code path (`staffLogin` in `server.ts`). The theme is
  the supervisor's night and brass (`ROLE_PALETTES.director`); the row of
  college marks (`pages/director/CollegeRail.tsx`, `?college=` in the
  address) is what sets the portal apart.
- **The office's powers.** `requireOffice` (server.ts): colleges,
  programs and their hours, majors, the OJT rules (`ojt_settings`), and
  creating, deactivating or resetting coordinators are the Director's
  once an active Director exists, and the coordinators' until then. The
  coordinator's Home can ask `GET /api/coordinator/office`. Blocks,
  requirements and students stay the coordinators'. `requireStaff` lets
  both read the shared data.
- **Coordinator scopes** (`services/coordinatorScope.ts`). A coordinator
  given colleges or programs sees only those students. The scope is kept
  for the request when a coordinator signs in, and the shared student
  filters (`services/studentScope.ts`) add it to every list built on them;
  a `:studentId` or a record found by its id outside the scope is a 404,
  like a missing one. A list with its own SQL uses `scopeCondition`. When
  you add a coordinator list that does not use the shared filters, add
  the scope to it the same way, and add a record route that names a
  student's record by id to `SCOPED_RECORDS`.
- **Tests that make a Director deactivate it afterwards**: while one is
  active, the coordinators lose the office's powers, which other tests use
  (`e2e/tests/director-portal.spec.ts` does this with the script).

## Overtime and the 8-hour day (Phase 1.4)

- **A day's hours stop at the scheduled end**, unless the supervisor
  approved overtime for it, then at its approved end; the time-out still
  ends the day, and the 16-hour limit stays. The rule is one function,
  `hoursSql` in `services/creditedHours.ts`. **Any new place that works
  out a log's hours must use it**; totals sum the stored `hours`.
- The scheduled end is stored on the log at time-in
  (`attendance.credited_until`, from `judgeTimeIn` in
  `services/dayRules.ts`), by every time-in path. A log without it (every
  log from before migration 084, and a day with no schedule) is worked out
  as before and never capped, so verified hours never move.
- Overtime requests (`routes/overtime.ts`): the trainee asks before or on
  the day on the Days page (online only; the reason is kept as a draft);
  the supervisor decides in Review (the Overtime chip). Approvals per ISO
  week are limited by the OJT rule `overtime_max_per_week` (2). An
  approval works out again any finished day that is not verified. Approved
  overtime shows in the Daily Time Record's remarks.

## Host Training Establishments (Phase 1.3)

- **A company's kind and status** (migration 083): government, private or
  university; applied, screening, approved or suspended. Existing
  companies stayed approved. The office changes the status
  (`routes/htes.ts`, from `expected_version`); a private company needs a
  screening that passed (or passed with conditions) first.
- **Placing a student goes through `withPlacement`**
  (`services/placement.ts`): it locks the company's row, writes, and
  refuses `409 NO_SLOTS` or `COMPANY_NOT_APPROVED` when the student is
  newly at a full, unapproved or inactive company. Slots are counted per
  term; NULL is no limit. **Any new route that writes a student's company
  must use it.** A name with no company record is still accepted.
- The MOA's signed copy is in the private file store (coordinators only);
  screenings and agency requests are in `company_screenings` and
  `company_requests`. The UI is `pages/coordinator/Hte.tsx` (company
  page, chips, suggestions), `CompanyPicker`'s `forStudents`, and the
  trainee's `SuggestAgency` on the schedule page.

## The final OJT grade (Phase 1.5)

- **Two halves** (`services/finalGrade.ts`): the HTE's is the
  supervisor's final evaluation (`final_evaluations.grade`, or an
  unweighted form's average on the same scale); the instructor's is the
  coordinator's four scores in `instructor_evaluations` (migration 082),
  weighed by `terms.grade_weights` (25 each unless set). The OJT rule
  `grade_split_hte` (50) is the HTE's share. Everything is rounded to 2
  decimals, half up (`round2`); change it there if the university rounds
  otherwise, and the tests with it.
- **Final only with both halves**; otherwise the state says which is
  missing. A release copies the grade into `released_grade`: the student
  is shown that, never a grade worked out live, so a later change waits
  for the next release (`changed_since_release` on the sheet).
- **The two suggestions** (logs, punctuality) are only where the
  instructor's form starts; nothing stores them.
- Routes in `routes/finalGrades.ts`; the UI in
  `pages/coordinator/FinalGrade.tsx` (grade sheet on Evaluations,
  breakdown on the student's record) and the student's released grade on
  the Resolution Center's evaluation tab.

## The system administrator (Phase 1.7)

- **A fifth portal, `/admin`,** for the IT/MIS person who runs the system.
  Accounts are in `system_admins` (migration 081); `npm run admin:create
  email=… name="…"` makes the first one (`deactivate` turns one off), and
  an administrator can make Director and administrator accounts from
  Accounts. No public page links to `/admin/sign-in`. The theme is "the
  machine room": mist and navy ink, no brass (`ROLE_PALETTES.admin`,
  `ROLE_CHROME_DARK.admin` false, so RoleShell draws a light header and
  side menu).
- **Separation of duties, on the server.** `requireAdmin` routes
  (`routes/admin.ts`) return who an account is, never what is in it. The
  administrator is on no other route's role list, and the test "the
  administrator ... is refused every route about students ..." walks the
  whole sweep: **never add "admin" to a route that returns a student's
  records, documents, photos, evaluations, grades, journals, reports or
  messages.** A temporary password is emailed to its owner only
  (`services/adminAccounts.ts`, which takes the send function so tests
  pass a mock); without email it is refused and nothing changes.
- **System pages move to the administrator.** System status, problems,
  the restore drill and the email and storage tests
  (`routes/console.ts`, `components/SystemStatusCard.tsx`) answer under
  `/api/admin/...` and, until an active administrator exists, under
  `/api/coordinator/...` as before; then the coordinator's System status
  says only whether something is wrong.
- **The maintenance notice** (`system_notice`, `GET /api/system-notice`
  for anyone) shows at the top of every portal (`SystemNoticeBanner` in
  RoleShell) and is kept in localStorage for offline reading.
- **Tests that make an administrator deactivate it afterwards**, for the
  same reason as a Director's (`e2e/tests/admin-portal.spec.ts`).
