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
| Railway | Wait for CI | on since 2026-10-10 (a failing CI run now blocks the backend deploy) | yes |
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

Four additive migrations: 018 (notification links), 019 (audit log), 020
(companies, with a trigger), 021 (terms, with a trigger). One push.

Why one push is enough this time: nothing the new frontend sends is
misread by the old backend. The only effect of the two hosts finishing at
different times is that the three new pages (Audit log, Companies, Terms)
answer "route not found" for the few minutes between Vercel finishing and
Railway finishing, which now waits for CI. Everything that existed before
keeps working throughout.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway (run by you) | A fresh database backup: open the tunnel (`railway connect Postgres --tunnel-only`), then `railway run --service Postgres npm run db:backup-production <tunnel port>`. Tell me it is done, and I will restore it locally and run the four migrations and the tests against it before pushing. | The push runs four migrations. |
| After the push | GitHub → Actions | The run is green. Railway deploys only after it is (Wait for CI is on). | A failing test now blocks the backend. |
| After the push | Railway → backend → Deployments → Deploy Logs | `Applied 018`, `019`, `020` and `021`, then `Backend running`. | Confirms the migrations ran. |
| After the push | The live site, as coordinator | Audit log, Companies and Terms open from the menu. | The new pages. |
| When you choose | Postgres | The company backfill script (`npm run db:backfill-companies`) cannot yet be run against the hosted database from a laptop. See the note below; the Companies page does the same job. | Turns the company names already typed into company records. |
| When you choose | The live site | Companies page: add the companies by hand from the "names with no record yet" list. | Does the same as the backfill, one company at a time, with no command. |
| When you choose | The live site | Terms page: add the current term, then use its menu to add the students that have no term. | Existing students have no term until this is done. |
| | Vercel | No setting changes. | |

**About the company backfill.** For a handful of companies, the Companies
page does the job: each typed name with no record is shown as a button, and
adding it links everyone who carries that name. The script is for when
there are too many to click through. Since 2026-10-12 it reaches the hosted database through the same tunnel
as the backup (`DEPLOY.md`, "Running a data script on the hosted
database"). It has been tried that way against a local database only.

New variables this phase: none.

## Phase 4

### Student part (live since 2026-10-11)

Seven additive migrations: 022 (accomplishment note), 023 (student
contact), 024 (time-out reminders), 025 (holidays), 026 (journals), 027
(completion request), 028 (privacy consent). One push. If Phase 3 has not
gone out yet, the same push carries its four as well: 018 to 028.

Why one push is enough: nothing the new frontend sends is misread by the
old backend, and nothing the new backend requires is missing from the old
frontend. A time-out with no accomplishment note is still accepted, and
the server does not insist on privacy consent unless told to. For the few
minutes between Vercel finishing and Railway finishing, the new pages
(Weekly journal, Completion, Holidays, the Privacy card) answer "route not
found"; everything that existed before keeps working.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway (run by you) | A fresh database backup: open the tunnel (`railway connect Postgres --tunnel-only`), then `railway run --service Postgres npm run db:backup-production <tunnel port>`. Tell me it is done, and I will restore it locally and run the migrations and the tests against it before pushing. | The push runs migrations. |
| After the push | GitHub → Actions | The run is green. Railway deploys only after it is. | A failing test blocks the backend. |
| After the push | Railway → backend → Deployments → Deploy Logs | `Applied 022` to `Applied 028` (from `018` if Phase 3 goes with it), then `Backend running`. | Confirms the migrations ran. |
| After the push | The live site, as coordinator | Programme > Holidays: add the holidays for the term. | The list starts empty. |
| Before real use by students | A code change, by me, when you send the text | Replace the draft privacy notice in `backend/src/services/privacy.ts` with the wording the university approves, fill in the retention period and the Data Protection Officer's contact, and change its version. Every student is then asked to agree again. | The notice on screen is marked as a draft. |
| Optional, later | Railway → Variables | `PRIVACY_CONSENT_REQUIRED`: `true`. **Unset means the server does not insist.** Set it only once everyone is on the current app, or a phone still holding the old app cannot time in. | Makes the server refuse a time-in without consent. |
| Optional, only after the retention period is approved | Railway → Variables | `PHOTO_RETENTION_DAYS`: a whole number of days, at least 30. **Unset means the purge is off.** | How old a decided log's photo may be. |
| Later, by you | Railway backend shell (run by you) | The photo purge: `npm run privacy:purge-photos` lists what it would remove; add `-- --confirm` to remove it. It must run on the server, where the photos are (`railway ssh`). Take a backup of the uploads first. Not yet run on the host. | Deletes old photos; never automatic. |
| | Vercel | No setting changes. | |

New variables in this part: `PRIVACY_CONSENT_REQUIRED` and
`PHOTO_RETENTION_DAYS` (Railway, both optional, both off when unset).

Not added: `TIMEOUT_REMINDER_HOURS`. The reminder is fixed at one hour
after the scheduled end (decision D11).

### Supervisor, coordinator and cross-cutting parts (live since 2026-10-11)

Six more additive migrations: 029 (time correction), 030 (time record
certifications), 031 (final evaluations, with a sample form), 032
(notification preferences), 033 (summary email log), 034 (site visits).

## Phase 5

No migrations. Adds an end-to-end test job to CI.

## The one push for Phases 3, 4 and 5 (done 2026-10-11)

This went out on 2026-10-11 and all three checks passed. Kept as the
record of what was done. Phases 3, 4 and 5 went out as **one push**:
migrations 018 to 034, seventeen in all, each additive. Nothing the new
frontend sends is misread by the old backend, and nothing the new backend
requires is missing from the old frontend, so the order the two hosts
finish in does not matter; for those few minutes the new pages answer
"route not found" and everything that existed keeps working.

| When | Platform | Change | Why |
|---|---|---|---|
| Before the push | Railway (run by you) | A fresh database backup: open the tunnel (`railway connect Postgres --tunnel-only`), then `railway run --service Postgres npm run db:backup-production <tunnel port>`. Tell me it is done, and I will restore it locally, run the seventeen migrations and the tests against it, and only then push. | The push runs migrations. |
| After the push | GitHub → Actions | All three jobs are green: API tests, frontend build, and the new end-to-end tests. Railway deploys only after they are. **This is the first time the end-to-end job runs on GitHub**; if it fails there for a reason that is about GitHub and not the app, the backend deploy waits until it is fixed. | A failing check blocks the backend. |
| After the push | Railway → backend → Deploy Logs | `Applied 018` through `Applied 034`, then `Backend running`. | Confirms the migrations ran. |
| After the push | The live site, as coordinator | Add the term and the holidays; add the companies; open Evaluations > Final evaluation form and enter the university's criteria. | These start empty, or as a sample. |
| Before real use by students | A code change, by me, when you send the text | The approved privacy notice (see the Student part above). | The notice on screen is a draft. |
| Optional | Railway → Variables | All five of `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without all five no email is sent: not password recovery, not deadline reminders, not the summaries. | Email delivery. |
| Optional, needs SMTP | Railway → Variables | `SUPERVISOR_DIGEST_TIME`: `HH:MM`, Philippine time. Unset means `07:30`. | When the supervisors' daily summary goes out. |
| Optional, needs SMTP | Railway → Variables | `COORDINATOR_DIGEST_DAY` (`SUN` to `SAT`; unset means `MON`) and `COORDINATOR_DIGEST_TIME` (`HH:MM`; unset means `07:30`). | When the coordinators' weekly summary goes out. |
| On your word, later | Vercel (a commit to `vercel.json`, by me) | Switch `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Done on `ui-redesign` on 2026-10-12, after every page loaded with no violations with it enforced locally. It is live on the test site from the next push and on the live site when `main` next moves. If a page ever fails to load because of it, changing the header's name back to the report-only form undoes it. | The stricter security header. |
| | Vercel | No setting changes. | |

New variables in these parts: `SUPERVISOR_DIGEST_TIME`,
`COORDINATOR_DIGEST_DAY` and `COORDINATOR_DIGEST_TIME` (Railway, all
optional, all doing nothing without SMTP).

## The test site and its own backend (set up 2026-10-11)

Two complete copies of the system now run side by side. Work goes to the
test copy on "push" and to the live copy on "make it live".

| | Test | Live |
|---|---|---|
| Site | `inter-net-updated.vercel.app` | `internet-psu.vercel.app` |
| Git branch | `ui-redesign` | `main` |
| Vercel environment | Preview | Production |
| Railway environment | `staging` | `production` |
| Backend | `internetupdated-staging.up.railway.app` | `internetupdated-production.up.railway.app` |
| Database | its own, test data only | the real records |

What was changed, all by the owner in the dashboards:

| Platform | Change | Why |
|---|---|---|
| Vercel → Domains | `inter-net-updated.vercel.app` connected to Preview, branch `ui-redesign`. | The test address. |
| Vercel → Environment Variables | `VITE_API_URL` has two values: Production (the production backend) and Preview (the staging backend). | Each site calls its own backend. It is read at build time. |
| Vercel → Deployment Protection | Vercel Authentication turned off. | So groupmates can open the test site without a Vercel account. Every preview address of the project is now open to anyone with its link; the app's own sign-in still applies. |
| Railway | A `staging` environment duplicated from `production`: its own backend (branch `ui-redesign`) and its own empty Postgres. | A backend and database the test site cannot harm. |
| Railway → staging backend → Variables | `FRONTEND_URL` is the test address; `JWT_SECRET` is its own new value; `CORS_ORIGINS` removed; `DATABASE_PUBLIC_URL` is the reference `${{Postgres.DATABASE_URL}}`, which in this environment is the staging database. | Separate sign-ins, and only the test site may call it. |

Things to know:
- The staging database started empty: it has the default coordinator from
  the migration (credentials in `CHANGES.md`, changed at first sign-in)
  and nothing else. Accounts for testing are made there.
- A push to `ui-redesign` runs any new migration on the staging database.
  The backup rule applies to the live database only.
- Two backends and two databases use the Railway credit about twice as
  fast.
- The site's security header lists both backends, since one `vercel.json`
  serves both sites.

## Round 2

From here on work reaches the test site first ("push") and the live site
second ("make it live"). Each step below says which Railway environment it
is for: **staging** is the test site's backend, **production** the live
one. A variable is set in each environment separately.

### Phase 0: operations (built 2026-10-12, on localhost)

One additive migration: 036 (`liveness_ticket_uses`). Old and new
frontends both work on it: the time-in request is unchanged.

| When | Platform | Change | Why |
|---|---|---|---|
| Before "make it live" | Railway production (run by you) | A fresh database backup through the tunnel, as in `DEPLOY.md`. Tell me it is done. | The release has a migration. |
| When you want email | Your DNS host | Add the DKIM, SPF (with its MX) and DMARC records your email provider shows for your sending domain, and wait until it says verified. `DEPLOY.md` > "Email" has the steps. **Needs a domain you own**; a `vercel.app` address cannot send. | Lets the provider send as your domain, and keeps the mail out of spam. |
| When you want email | Railway → Variables (staging first, then production) | `EMAIL_PROVIDER` = `resend`; `EMAIL_API_KEY` = the provider's key (a secret: keep the value hidden); `SMTP_FROM` = the sender on the verified domain. Unset means no email, as today. | Email through the provider's HTTPS API. Railway closes the SMTP ports on Hobby, so the five `SMTP_*` cannot work there. |
| After setting them | The site | "Forgot password" > ask for a reset to an inbox you can read > open the link. On staging first. | The real test that email leaves the server. |
| When you want push | Any terminal | `npx web-push generate-vapid-keys` prints a public and a private key. | The key pair for browser push. |
| When you want push | Railway → Variables (each environment its own pair) | `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` (a secret) and `WEB_PUSH_SUBJECT` = `mailto:` an address you read. Set all three or none. | Browser push notifications. Unset means push stays off. |
| After setting them | A phone, on the site | Sign in, allow notifications when asked, then have another account cause one (a supervisor verifying a log). `DEPLOY.md` > "Phone checks" has the list. | The real test of push. |
| Once, while nothing depends on it | Railway backend shell, then your machine (run by you) | The upload backup: `npm run uploads:backup` in `railway ssh`, download the one archive it names, check it, delete it from the server. `DEPLOY.md` > "Uploaded files". **Never tried on the host**: tell me what each step printed. | Photos and documents have no other backup. |
| Once | Your machine, through the tunnel (run by you) | `railway connect Postgres --tunnel-only`, then in `backend`: `railway run --service Postgres npm run db:fk-orphans PORT`. It only reads. Send me the table it prints. Do not run `db:fk-validate` yet. | Shows whether any old rows point at records that no longer exist, before the foreign keys are validated. |
| | Vercel | No setting changes. No new backend address, so `vercel.json` is unchanged. | |

New variables this phase: `EMAIL_PROVIDER` and `EMAIL_API_KEY` (Railway,
both optional; unset means today's behaviour).

### Phase 1A: student portal reorganisation (built 2026-10-12, on localhost)

No migration, no new variable, no new backend address (so `vercel.json`
is unchanged). Nothing to set on Vercel or Railway.

| When | Platform | Change | Why |
|---|---|---|---|
| On "push" | Railway staging, Vercel Preview | Nothing to do by hand: both deploy from `ui-redesign`. Either may finish first. | The backend change (paged notification lists) is additive and the old bell works on it. If the frontend finishes first, the new bell shows every notification at once, with no "load more" and an Unread chip that does not narrow the list, until the backend catches up, a matter of minutes. |
| On "make it live" | Railway production (run by you) | A fresh database backup first, as for Phase 0: the same release carries migrations 035 and 036. | This phase adds no migration, but it ships together with those. |

### Phase 1B: supervisor portal reorganisation (built 2026-10-12, on localhost)

No migration, no new variable, no new backend address (so `vercel.json`
is unchanged). Nothing to set on Vercel or Railway.

| When | Platform | Change | Why |
|---|---|---|---|
| On "push" | Railway staging, Vercel Preview | Nothing to do by hand. Either may finish first. | Two additive backend changes: `GET /api/supervisor/final-evaluations`, and a `coordinator` field on the supervisor's own profile. Until the backend has them, the new frontend simply shows no "Final evaluation due" item and no coordinator line. New notifications say "concern"; the older frontend still links them correctly, because their links are stored by the server. |
| On "make it live" | Railway production (run by you) | The same backup as for Phase 0 and 1A; this phase adds no migration of its own. | The release still carries 035 and 036. |

### Phase 1C: coordinator console (built 2026-10-12, on localhost)

No migration, no new variable, no new backend address (so `vercel.json`
is unchanged). Nothing to set on Vercel or Railway.

| When | Platform | Change | Why |
|---|---|---|---|
| On "push" | Railway staging, Vercel Preview | Nothing by hand. **The backend should finish first this time**: wait for Railway's deploy to go green before opening the test site's dashboard. | The new dashboard and the Analytics cards ask for `/api/coordinator/actions` and `/api/coordinator/kpis`. Against an older backend the dashboard shows "Could not load the dashboard" and the cards say they could not be worked out, until the backend is up. Nothing is damaged; it clears by itself. |
| On "make it live" | Railway production, Vercel Production | The same order: the merge deploys both; open the live dashboard only after Railway is green. | As above. |
| After either | The site, as coordinator | Audit log > Export CSV. Open the file in a spreadsheet and check the times are Philippine time and names with "ñ" read correctly. | The export was checked only by a test and in a browser here. |

### Phases 0 to 1C together: everything to do on a platform

One list for the release that carries Phase 0, 1A, 1B and 1C. Only the
first block is required; the rest switch on things that are off today and
can wait.

**Required**

| When | Platform | Change |
|---|---|---|
| On "push" | Railway staging | Nothing by hand. Migration 036 runs by itself. Wait for the deploy to go green before testing the site. |
| On "push" | Vercel Preview | Nothing by hand. |
| Before "make it live" | Railway production (run by you) | A fresh database backup through the tunnel, as in `DEPLOY.md`, and tell me it is done. The release carries migrations 035 and 036. |
| On "make it live" | Railway production, Vercel Production | Nothing by hand. Wait for Railway to go green before opening the live dashboard. |

**Optional: each is off until you do it, and safe to leave off**

| What it switches on | Platform | Change |
|---|---|---|
| Email (password recovery, reminders, the two summary emails) | Your DNS host, then Railway (staging first) | The provider's DKIM, SPF and DMARC records on a domain you own; then `EMAIL_PROVIDER` = `resend`, `EMAIL_API_KEY` (a secret) and `SMTP_FROM`. Steps in `DEPLOY.md` > "Email". |
| Browser push | Any terminal, then Railway (each environment its own pair) | `npx web-push generate-vapid-keys`; then `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` (a secret) and `WEB_PUSH_SUBJECT`. All three or none. |

**Asked of you once, nothing depends on it yet**

| What | Where | Change |
|---|---|---|
| A backup of the uploaded files | Railway backend shell, then your machine | `npm run uploads:backup` in `railway ssh`; download the archive it names; delete it from the server. Never tried on the host: tell me what each step printed. |
| The read-only orphan report | Your machine, through the tunnel | `railway run --service Postgres npm run db:fk-orphans PORT`. Send me the table. Do not run `db:fk-validate` yet. |

No setting changes on Vercel in any of these phases, and `vercel.json` is
unchanged since the enforced policy: no new backend address was added.

## Variables introduced by this plan

All optional; unset means today's behaviour.

| Variable | Platform | Phase | Default when unset |
|---|---|---|---|
| `OFFLINE_ACTION_MAX_AGE_HOURS` | Railway | 2 | 12 |
| `SW_KILLSWITCH` | Vercel | 2 | off (emergency only) |
| `SUPERVISOR_DIGEST_TIME` | Railway | 4 | `07:30` |
| `PRIVACY_CONSENT_REQUIRED` | Railway | 4 | off: the app asks, the server does not insist |
| `PHOTO_RETENTION_DAYS` | Railway | 4 | purge off |
| `COORDINATOR_DIGEST_DAY`, `COORDINATOR_DIGEST_TIME` | Railway | 5 | `MON`, `07:30` |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY` | Railway | Round 2, 0 | email through SMTP if the five `SMTP_*` are set, otherwise no email |

No new `VITE_*` variables are planned. If one is added, changing it on
Vercel needs a redeploy, because it is read when the site is built.
