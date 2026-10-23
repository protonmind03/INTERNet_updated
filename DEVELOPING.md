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
  database backup needs `pg_dump`, which is in `backend/backup.Dockerfile`,
  not in the API container.
- `backend/.env` on your computer is visible inside the API container (the
  folder is shared), but the compose file's own settings win for every name
  it sets.

## Scheduled backups

`backend/src/services/backups.ts` and `backend/src/scripts/backup-cron.ts`;
DEPLOY.md, "Scheduled backups", has the setup on Railway and Cloudflare.

- The nightly database backup is a separate Railway service
  (`backend/railway.backup.json`, `backend/backup.Dockerfile`): `pg_dump -Fc`
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
