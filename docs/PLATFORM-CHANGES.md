# Platform changes, by phase

Everything that has to be done on Vercel, Railway, Postgres or GitHub for
the work in `docs/IMPLEMENTATION-PLAN.md`. These are applied by the project
owner; the code is written so that nothing breaks if a step is late, except
where "before the push" is stated.

Each entry gives the platform, the exact setting or variable **name**, what
to set it to, why, and when. No real secret values appear in this file.

Status: drafted in Phase 0 from the repository. Entries are refined as each
phase is built. Nothing here has been applied.

## Current setup

Confirmed from the owner's dashboard screenshots on 2026-10-10, except the
two rows marked "not checked".

| Platform | Setting | Value | Confirmed? |
|---|---|---|---|
| Vercel | Root Directory | `my-pwa` (expected) | not checked |
| Vercel | Build Command | default (`npm run build`), **not** overridden to `vite build` (expected) | not checked |
| Vercel | Production Branch (Branch Tracking) | `main` | yes |
| Vercel | `VITE_API_URL` | `https://internetupdated-production.up.railway.app`, Production only (not Preview) | yes |
| Vercel | Domains | `internet-psu.vercel.app`, `inter-net-updated.vercel.app` | yes |
| Vercel | Plan | Hobby | yes |
| Railway | Source repo and Root Directory | `protonmind03/INTERNet_updated`, `/backend` | yes |
| Railway | Branch connected to production | `main`, auto-deploy on | yes |
| Railway | Wait for CI | available, off | yes |
| Railway | Volumes | `internet_updated-volume` on the backend, `postgres-volume` on Postgres | yes |
| Railway | Variables | `CORS_ORIGINS`, `DATABASE_PUBLIC_URL`, `FRONTEND_URL`, `JWT_SECRET`, `NODE_ENV`, `PRIVATE_UPLOAD_DIR` (six, no others) | yes |
| Railway | `SMTP_*` (5), `WEB_PUSH_*` (3), `AZURE_*` | not set: recovery email, reminder email and push are off | yes |
| Railway | Backups | **not available on this plan** (Pro only); no backups exist | yes |
| Railway | Plan | trial, "23 days or $4.43 left" on 2026-10-10 | yes |

## Phase 1

No migrations. Backend and frontend can be pushed together.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway (run by you) | Take a manual database backup with the command in `DEPLOY.md` > Backups > Database (PowerShell: add the PostgreSQL `bin` folder to `Path`, then `railway run cmd /c "pg_dump %DATABASE_PUBLIC_URL% --format=custom --no-owner --no-privileges --file internet-prod.dump"` from the `backend` folder). Keep the file off the laptop too. Railway's own backups need the Pro plan, so this is the only database backup there is. Phase 1 has no migration, so this is a precaution, not a condition of the push. | A restore point before any further change. |
| When convenient | Railway → backend service → Volume (run by you) | Copy `/data/private-uploads` out with the three steps in `DEPLOY.md` > Backups > Uploaded files. They come from Railway's CLI reference and have **not** been tried on the hosted volume; tell me what happens the first time. | Photos and documents are not in the database dump. |
| If the plan becomes Pro | Railway → each volume → Backups | Set a daily schedule. | Replaces the two manual steps above. |
| Before the push | Vercel → Settings → Environment Variables | Confirm `VITE_API_URL` is set for Production. | The CSP `connect-src` in `vercel.json` must name the same origin. |
| After the deploy | Browser devtools → Network → the page's response headers | Check `Permissions-Policy` includes `camera=(self)` and `Content-Security-Policy-Report-Only` is present; check the Console for report-only violations while signing in and running the camera check. | The headers ship in `vercel.json`; this confirms they arrived and break nothing. |
| Optional | GitHub → Settings → Branches → rule for `main` | Require the `CI` status check to pass. | CI needs no secrets (the test database runs in a container). |
| After the first green CI run on `main` (decision D3: yes) | Railway → backend service → Settings → Source | Turn on **Wait for CI**. On Vercel, look in Settings → Git for an option to wait for GitHub checks; I could not confirm it exists on the Hobby plan. | Direct commits to `main` have no other gate. Do not turn it on before the workflow exists on `main`, or there is nothing to wait for. |
| Later, by you | Postgres (run by you, after a backup) | From the `backend` folder: `railway run npm run db:fk-orphans` (read-only report), then `railway run npm run db:fk-validate` (dry run), then `railway run npm run db:fk-validate -- --confirm`. | Validates the 15 foreign keys from migration 006 for existing rows. Never part of the deploy. |

New variables this phase: none.

Removed this phase: the coordinator's account-wipe tool. No platform step.

New public route this phase: `POST /api/client-errors` (crash reports from
the browser). Its lines appear in the Railway backend's log as
`CLIENT ERROR: {...}`. No setting is needed.

If the backend URL ever changes: update `connect-src` in
`my-pwa/vercel.json` as well as `VITE_API_URL` on Vercel.

## Phase 2

One additive migration. Backend first, then frontend.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway | Fresh Postgres backup. | The push contains a migration. |
| Optional | Railway → Variables | `OFFLINE_ACTION_MAX_AGE_HOURS`: a number of hours. Unset means 12. | How old a queued break or time-out may be when it syncs. |
| Only if decision D7 is yes | Railway → Variables | `OFFLINE_TIME_IN`: `true` to allow offline time-in. Unset or `false` means off. | Feature flag. |
| Before the frontend push | Railway | Wait for the backend deploy and check `https://<backend>/api/health`. | The old frontend keeps working on the new schema; the new frontend needs the new backend. |
| Before the push | Vercel → Settings → General | Confirm the Build Command is still the default (so `prebuild` copies the face-tracking files) and the Node.js version is 20 or newer. | The service worker build runs inside `npm run build`. |
| After the deploy | Browser devtools → Application | Manifest shows no errors; a service worker is active at `/service-worker.js`; Cache Storage holds nothing from the API origin. | Installability and the data-safety rule. |
| If something goes wrong | Vercel (a commit you ask for) | Deploy `public/service-worker-killswitch.js` in place of the worker (procedure documented in item 2.1). | Unregisters the worker and clears caches on every device. |

## Phase 3

Additive migrations. Backend and frontend can go together unless a phase
report says otherwise.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway | Fresh Postgres backup. | Migrations. |
| After the deploy | Postgres (run by you) | `railway run npm run backfill:companies` (dry run). Review the proposed mapping together, then rerun with `-- --confirm`. | Links existing free-text company names to company rows. |
| | Vercel | No setting changes. | |

New variables this phase: none.

## Phase 4

Additive migrations in each of the three parts (student, supervisor,
coordinator and cross-cutting). A backup before each push.

| When | Platform | Change | Why |
|---|---|---|---|
| Before each push | Railway | Fresh Postgres backup. | Migrations. |
| Optional | Railway → Variables | `SUPERVISOR_DIGEST_TIME`: `HH:MM`, Asia/Manila. Unset means `07:30`. | When the daily supervisor email goes out. |
| Optional | Railway → Variables | `TIMEOUT_REMINDER_HOURS`: hours after the scheduled end. Unset means the default agreed in decision D11. | The forgot-to-time-out reminder. |
| Optional, only after the consent text is approved | Railway → Variables | `PHOTO_RETENTION_DAYS`: a number of days. **Unset means the purge is off.** | Retention of attendance photos. |
| Needed for the digests | Railway → Variables | All five of `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without all five the digests stay off (as password-recovery email is today). | Email delivery. |
| Later, by you | Postgres (run by you) | The retention purge: dry run first, then `--confirm`. | Deletes old photos; never automatic. |
| | Vercel | No setting changes. | |

## Phase 5

| When | Platform | Change | Why |
|---|---|---|---|
| Optional | Railway → Variables | `COORDINATOR_DIGEST_DAY` (for example `MON`) and `COORDINATOR_DIGEST_TIME` (`HH:MM`). Unset means the documented defaults. | The weekly coordinator email. |
| With the CI change | GitHub Actions | CI also runs Playwright; its browsers are cached between runs. No secrets. | End-to-end tests. |
| On your word | Vercel (a commit to `vercel.json`) | Switch `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. | Only after the report-only header has shown no real violations. |

## Variables introduced by this plan

All optional; unset means today's behaviour.

| Variable | Platform | Phase | Default when unset |
|---|---|---|---|
| `OFFLINE_ACTION_MAX_AGE_HOURS` | Railway | 2 | 12 |
| `OFFLINE_TIME_IN` | Railway | 2 (if approved) | off |
| `SUPERVISOR_DIGEST_TIME` | Railway | 4 | `07:30` |
| `TIMEOUT_REMINDER_HOURS` | Railway | 4 | per decision D11 |
| `PHOTO_RETENTION_DAYS` | Railway | 4 | purge off |
| `COORDINATOR_DIGEST_DAY`, `COORDINATOR_DIGEST_TIME` | Railway | 5 | documented defaults |

No new `VITE_*` variables are planned. If one is added, changing it on
Vercel needs a redeploy, because it is read when the site is built.
