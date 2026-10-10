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
| Before the push | Railway (run by you) | Take a manual database backup through a tunnel: `railway connect Postgres --tunnel-only` in one terminal, then `railway run --service Postgres npm run db:backup-production <tunnel port>` in another (steps in `DEPLOY.md` > Backups > Database). Keep the file off the laptop too. Railway's own backups need the Pro plan, so this is the only database backup there is. Phase 1 has no migration, so this is a precaution, not a condition of the push. | A restore point before any further change. |
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

One additive migration (`017_offline_actions.sql`: one new column on
`attendance`, one new table). **Two pushes: backend first, then frontend.**
The reason: the new frontend sends the time a break or time-out was pressed
offline. A backend that does not know those fields would ignore them and
record the time the request arrived instead, with no error. The other
direction is safe: the old frontend works unchanged on the new backend.

Both live in one repository and every push rebuilds both hosts, so the
split is by commit, in the order they were made:

- **First push, up to commit `c590501`:** the CI fix, the new service
  worker, offline reading, drafts, and the backend change with its
  migration. The frontend parts in this push do not depend on the new
  backend, so they are safe to go out with it.
- **Second push, the rest:** the phone-side queue (the one commit that
  needs the new backend), the time-in message, the manifest, the wake lock,
  the install entries and the documents.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the first push | Railway (run by you) | Take a database backup (`DEPLOY.md` > Backups > Database) and keep the file. Tell me it is done. | The push runs a migration. No backup of production exists yet. |
| Before the first push | Railway → Postgres → Data, or `railway connect` (run by you) | Optional but useful: `SELECT version();` and tell me the major version. | CI and my local tests use PostgreSQL 18; this confirms production is not older in a way that matters. |
| First push | GitHub → Actions | The run for the pushed commit should be green (it now includes the CI fix). | First real CI run. |
| After the first push | Railway → backend → Deployments | The deploy log shows `Applying 017_offline_actions.sql...` then `Applied`. Then open `https://internetupdated-production.up.railway.app/api/health`. Tell me it answers. | Confirms the migration ran and the backend is up before the frontend goes out. |
| After CI is green | Railway → backend → Settings → Source | Turn on **Wait for CI** (decision D3). | From here a failing test blocks the backend deploy. |
| Second push | Vercel → Deployments | The Production deployment succeeds. | The service worker is built during `npm run build`. |
| After the second push | Browser devtools → Application | Manifest: no errors. Service Workers: `/service-worker.js` is activated. Cache Storage: every entry is from `internet-psu.vercel.app`, none from the Railway address. | Installability, and the rule that no API answer is stored. |
| After the second push | A phone | The checklist in `DEPLOY.md`, "Phone checks after a Phase 2 deploy". | None of this has run on a real device. |
| Optional | Railway → Variables | `OFFLINE_ACTION_MAX_AGE_HOURS`: a number from 1 to 72. Unset means 12. | How old a break or time-out recorded offline may be when it arrives. |
| Optional, recommended | Railway → Variables | `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Generate the pair with `npx web-push generate-vapid-keys` (run by you; the private key is a secret, paste it only into Railway). Subject: `mailto:` followed by a contact address. Set all three or none. | Push notifications are off in production without them, and the install work in this phase builds on them. |
| Emergency only | Vercel → Settings → Environment Variables | `SW_KILLSWITCH` = `true` for Production, then redeploy. Remove it and redeploy when fixed. | Removes the service worker and its caches from every device (`DEPLOY.md`). |

People who already have the site open will see "Update available" after the
second push. Until they press Reload they keep the old version, which works
with the new backend.

New variables this phase: `OFFLINE_ACTION_MAX_AGE_HOURS` (Railway, optional)
and `SW_KILLSWITCH` (Vercel, emergency only). Both do nothing when unset.

Not added: `OFFLINE_TIME_IN`. Offline time-in was not built (decision D7).

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
| `SW_KILLSWITCH` | Vercel | 2 | off (emergency only) |
| `SUPERVISOR_DIGEST_TIME` | Railway | 4 | `07:30` |
| `TIMEOUT_REMINDER_HOURS` | Railway | 4 | per decision D11 |
| `PHOTO_RETENTION_DAYS` | Railway | 4 | purge off |
| `COORDINATOR_DIGEST_DAY`, `COORDINATOR_DIGEST_TIME` | Railway | 5 | documented defaults |

No new `VITE_*` variables are planned. If one is added, changing it on
Vercel needs a redeploy, because it is read when the site is built.
