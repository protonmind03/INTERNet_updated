# Developing INTERNet

Notes for whoever changes the code. Deploying is in `DEPLOY.md`.

## Working offline

What each role can do with no connection. The same table is on the app's
Help page (`/help`, from `my-pwa/src/lib/offlineHelp.ts`); change both
together.

| Role | Works with no connection | Waits on the phone, sent later | Needs a connection |
|---|---|---|---|
| Student | Dashboard, attendance, tasks, schedule, absences, company and profile as last loaded; drafts of journals, reports, task notes, absences and messages | Time-in (with a photo when the phone is ready, otherwise without one for the supervisor to confirm), within 12 h; out for lunch and back from lunch, within 12 h; time-out, within 24 h, with up to 3 pictures (about 400 kB each) sent after it | Submitting tasks, documents, journals and absences, and pictures on journals and concerns; messages and concerns; signing in |
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
  worker (or it is the kill switch, or it does not keep `index.html` and
  `offline.html`), `offline.html`, the Home Screen icon, `lang="en-PH"`, or an
  iPhone start-up image (`npm run startup-images` makes them). CI runs it in
  the frontend job.
- `npm run lighthouse` (in `e2e`, with the site and API running) runs
  Lighthouse with its mobile settings on the sign-in page and each portal's
  first page, the same pages as the Iteration 0 baseline
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
  (`StatTile loading`, `TodayStripSkeleton`, the coordinator's filter bar
  and figures, the student's progress card) and fills them in place.
- `e2e/tests/first-page.spec.ts` holds the data back and fails if the page
  shifts by 0.1 or more (cumulative layout shift) when it arrives. A new
  first-page element that appears only after loading needs a placeholder
  of its size.

The prototype components themselves are not used by the app. The page exists in development (`npm run dev`, or
`npm run dev:phone` to open it on a phone), or in a build made with
`VITE_BRAND_PREVIEW=true` (for a test site only; production leaves it unset).

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
