# Deploying INTERNet

Frontend on **Vercel**, backend + PostgreSQL + uploaded files on **Railway**.
Do the steps in order: the backend URL is needed to build the frontend, and
the frontend URL is needed by the backend.

## 0. Put the project on GitHub

Both hosts deploy from a GitHub repository. Create a **private** repository
and push this folder. The root `.gitignore` already keeps `.env` files,
`node_modules`, build output and uploaded photos out of it.

## 1. Railway: database

1. New Project > **Deploy PostgreSQL**.

## 2. Railway: backend

1. In the same project: New > **GitHub Repo** > select the repository.
2. Service Settings > **Root Directory**: `backend`.
   `backend/railway.json` then supplies the rest: it runs the database
   migrations before each deploy, starts the server with `npm start`, and
   uses `/api/health` as the health check.
3. Service > **Volumes** > add a volume mounted at `/data`.
4. Service > **Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_URL}}` (type it exactly; see the note under the table) |
   | `JWT_SECRET` | a new random value (command below) |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | the Vercel URL from step 3 (fill in after step 3) |
   | `PRIVATE_UPLOAD_DIR` | `/data/private-uploads` |

   Generate the secret with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

   Do not set `PORT`; Railway provides it.

   `DATABASE_PUBLIC_URL` must be the **reference** `${{Postgres.DATABASE_URL}}`,
   not a copy of the address. A reference follows the database: when its
   password changes, the backend gets the new one at its next deploy. A
   pasted copy keeps the old password, and the backend stops connecting.
   Despite the variable's name, this is the database's private address,
   reachable only inside Railway, which is what the backend should use. The
   eye icon always shows the resolved address; use Edit to see whether the
   value is the reference.
5. Settings > Networking > **Generate Domain**. This is the backend URL.
6. Keep the service on **one instance** and on a plan that does not sleep.
   Deadline reminders and live notifications run inside the server process.

Optional, each can be added later:

- `CORS_ORIGINS`: extra browser addresses allowed to call the API,
  comma-separated, each starting with `https://` and with no trailing
  slash. Needed when the site answers on more than one address (for
  example an old Vercel address kept beside a new one); `FRONTEND_URL` is
  always allowed and is the address used in password-reset links.
- `OFFLINE_MAX_AGE_HOURS_TIME_IN` (default 12), `OFFLINE_MAX_AGE_HOURS_LUNCH`
  (default 12, out for lunch and back from lunch) and
  `OFFLINE_MAX_AGE_HOURS_TIME_OUT` (default 24), each allowed 1 to 72: how old
  a step recorded while a phone was offline may be when it arrives. Older
  ones are refused. The phone shows the same limits in its "Waiting to
  send" panel (GET /api/offline/limits).
- `OFFLINE_ACTION_MAX_AGE_HOURS` (older, allowed 1 to 72): used for any of
  the three above that is not set. Leave it unset to get the defaults.
- `SUPERVISOR_DIGEST_TIME` (default `07:30`, Philippine time): when the
  supervisors' daily summary email goes out. Needs the email settings.
- `COORDINATOR_DIGEST_DAY` (default `MON`) and `COORDINATOR_DIGEST_TIME`
  (default `07:30`): when the coordinators' weekly summary of alerts goes
  out. Needs the email settings.
- `PRIVACY_CONSENT_REQUIRED` (off unless `true`): the server refuses a
  time-in from a student who has not agreed to the current privacy notice.
  The app asks either way. See "Privacy notice and photo retention" below
  before setting it.
- `PHOTO_RETENTION_DAYS` (off unless a whole number, at least 30): how old
  a decided log's time-in photo may be before the purge script removes
  it. Setting it removes nothing by itself.
- `LOGIN_MAX_FAILURES` (default 5): wrong passwords allowed on one account
  before a 15-minute lockout.
- `LOGIN_IP_MAX_FAILURES` (default 100): wrong passwords allowed from one
  network address, across all accounts, per 15 minutes. Keep it high if
  many users share one campus connection.
- Email (password recovery, deadline reminders, the summary emails), by
  one of two routes; see "Email" below. On Railway use the first.
  - Through a provider's HTTPS API: `EMAIL_PROVIDER` (`resend`),
    `EMAIL_API_KEY` (a secret) and `SMTP_FROM` (the sender).
  - Through SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
    `SMTP_FROM`.
  With neither, "Forgot password" reports that email is not configured.
- Browser push notifications: `WEB_PUSH_VAPID_PUBLIC_KEY`,
  `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Generate the key pair
  with `npx web-push generate-vapid-keys`. Set all three or none.
- Object storage instead of the volume, one of:
  - a bucket on Cloudflare R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
    `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (see "Keeping uploaded files in
    a bucket" below);
  - Azure Blob Storage: `AZURE_STORAGE_CONNECTION_STRING`,
    `AZURE_STORAGE_CONTAINER`.

### Email

Railway closes the SMTP ports (25, 465, 587, 2525) to outbound traffic on
the Hobby plan and below, so the SMTP route cannot send from the hosted
backend there. The server therefore also sends through an email
provider's HTTPS API, which works on every plan. Resend is the provider
built in.

What it needs, in this order:

1. **A domain you own.** A provider only sends from a domain whose DNS you
   can edit. `internet-psu.vercel.app` is Vercel's, so it cannot be used.
   Without a domain of your own, a provider's test mode will only deliver
   to the address you signed up with, which is enough to try it and not
   enough for students.
2. **The domain verified with the provider.** In Resend: Domains > Add
   Domain. It shows the exact DNS records to add at your DNS host; copy
   them from there, do not type them from memory. They are:
   - **DKIM**: a TXT record the provider generates (a long key).
   - **SPF**: a TXT record on the sending subdomain that names the provider
     as allowed to send, with the MX record that goes with it.
   - **DMARC**: one TXT record at `_dmarc.<your domain>`. To start:
     `v=DMARC1; p=none;` (report only). Tighten it later.
   Wait until the provider shows the domain as verified.
3. **An API key** from the provider, with permission to send only.
4. **Three variables on the backend service**: `EMAIL_PROVIDER` = `resend`,
   `EMAIL_API_KEY` = the key (keep it hidden; never paste it into a chat or
   a screenshot), and `SMTP_FROM` = the sender, on the verified domain, for
   example `INTERNet <no-reply@your-domain>`.
5. **`FRONTEND_URL`** must already be the site's address: the reset link in
   the email is built from it.
6. Redeploy, then test: on the sign-in page choose "Forgot password", ask
   for a reset to an address you can read, and open the link in the email.
   If nothing arrives, the backend's Deploy Logs have a line starting
   `SEND PASSWORD RESET EMAIL ERROR` with the provider's reason. The log
   never contains the key or the address it was sent to.
7. **The daily number.** Also set `EMAIL_DAILY_LIMIT` to what your plan
   allows in a day. On Resend's free plan that is `100` (3,000 a month,
   100 a day, up to 3 domains; read from resend.com/pricing on 14 October
   2026, so check it again when you sign up). With it set, the server
   counts each email, stops reminders and summaries at four fifths of the
   number, and keeps the rest for password resets. Without it, a busy
   morning of deadline reminders can use the whole day and a student's
   reset email is then refused by the provider.
8. **See that it is on, without reading logs.** Sign in as a coordinator
   and open Profile. "What is switched on" says whether email is on, how
   many were sent today, and has **Send me a test email**, which sends
   one to your own account's address.

**Without a domain of your own** email cannot reach students, on any
provider. That is not a fault to fix here: leave email off. Nothing else
depends on it. A coordinator resets a student's or supervisor's password
from that person's row, and every reminder still appears in the app (and
on phones, once push is on).

If both this and the five `SMTP_*` are set, the provider's API is used.

## 3. Vercel: frontend

1. Add New > Project > import the same repository.
2. **Root Directory**: `my-pwa`. Framework preset: Vite.
3. Environment Variables: `VITE_API_URL` = the Railway backend URL from
   step 2.5, starting with `https://` and with no trailing slash.
4. Deploy. Copy the resulting URL into `FRONTEND_URL` on Railway (step 2.4)
   and redeploy the backend.

`VITE_API_URL` is read when the site is built. After changing it, redeploy.

`my-pwa/vercel.json` sets the site's security headers. Its
`Content-Security-Policy-Report-Only` header names the backend address the
site may call (`connect-src`). **If the backend URL ever changes, change it
there as well as in `VITE_API_URL`.** While the header is report-only a
mismatch only shows as a browser console warning; once it is enforced, a
mismatch would stop the site reaching the API.

## Which branch deploys

Both hosts deploy the `main` branch, automatically, on every push (Vercel:
Settings > Environments > Production > Branch Tracking; Railway: service >
Settings > Source). A push to `main` therefore rebuilds the site, rebuilds
the backend, and runs any new database migration. Take a backup first when
the push contains a migration (see Backups).

## Checks on every push (GitHub Actions)

`.github/workflows/ci.yml` runs on every push: it starts a throwaway
PostgreSQL, applies the migrations, seeds the demo accounts, starts the API
and runs the API tests; separately it builds and lints the site; and a
third job drives the built site in a real browser (the tests in `e2e/`).
It needs no secrets. The result shows on the repository's Actions tab and as a tick
or cross beside each commit.

By default a failing run does **not** stop a deploy. To make it stop one:

- Railway: service > Settings > Source > turn on **Wait for CI**.
- Vercel: Settings > Git; look for the option to wait for GitHub checks
  before a production deployment. (Not confirmed on the Hobby plan. If it
  is not offered, Railway's switch still protects the backend and its
  migrations, and a red cross on GitHub is the signal not to trust the
  site build.)

Turn these on only after the workflow has passed once on `main`.

### Running the end-to-end tests yourself

They need the API and the built site running on this machine, with the
demo accounts (`npm run db:seed-demo` in `backend`; run it again after
pulling, since it now also makes a second demo intern for the team-task
journey). They write records (a journal, a holiday, a team and its task)
and clear them afterwards, and refuse to run against anything that is not
this machine. Two things cannot be cleared through the site and stay in
the local database: a task once it has been submitted, and notes between
a supervisor and the coordinator.

1. In `backend`: `npm run dev`
2. In `my-pwa`: `npm run build`, then `npm run preview` (the site on port 4173)
3. In `e2e`: `npm install` once, then `npm test`

If the API is not on port 5000, say where it is first:
`$env:E2E_API_URL = "http://127.0.0.1:5001"` (PowerShell). The site must
have been built to call that same address.

## 4. First login

1. Open the Vercel URL and log in as the coordinator created by the
   migration (credentials are in `CHANGES.md`).
2. The system immediately asks for a new password and blocks everything
   else until it is set, because the default one is published in this
   repository. Do this before sharing the URL with anyone.
3. Create supervisor and student accounts from the coordinator screens.
   Each starting password must have at least 12 characters with an
   uppercase letter, a lowercase letter and a number. Every new account is
   asked to replace its starting password at first login.

Changing a password signs that account out on all other devices.

The demo accounts from `npm run db:seed-demo` are for local testing only;
the script refuses to run against a hosted database.

## Backups

There are two things to back up: the **database**, and the **uploaded
files** (attendance photos, evidence, documents), which live on the `/data`
volume and are not in a database dump.

Railway's own backups (volume > **Backups** tab: manual, scheduled,
point-in-time) need the Pro plan. On Pro, set a daily schedule on both the
Postgres volume and the backend volume and skip the manual steps below. On
the trial or Hobby plan the manual steps are the only backup there is.

Take a backup **before every deploy that contains a migration**, and keep
the files somewhere other than one laptop. Both contain personal data:
never commit them (`*.dump` and `backend/backups/` are git-ignored) and
never share them in a chat.

### Database (run by you)

You need the Railway CLI and the PostgreSQL client tools (the same major
version as the hosted database, or newer). Once only, in the `backend`
folder:

```
npm i -g @railway/cli
railway login
railway link
```

`railway link` asks which project, environment and service: choose the
project, `production`, and the backend service.

Then, each time you want a backup, use two terminals in the `backend`
folder. The database has no public address (the safer setting), so the
first terminal opens an encrypted tunnel to it:

```
railway connect Postgres --tunnel-only
```

Leave it running. It says which local port it is listening on. Its output
may include a connection string with the password in it: read the port
number, and do not copy or screenshot the rest. In the second terminal,
with that port number in place of 12345:

```
railway run --service Postgres npm run db:backup-production 12345
```

When it finishes, press Ctrl+C in the first terminal to close the tunnel.
The port is the only thing to fill in. It writes
`backend/backups/internet-production-<date>-<time>.dump` and prints its
size. It only reads, and takes seconds.

How it works, and why not a plain `pg_dump` of `DATABASE_PUBLIC_URL`: the
backend reaches the database at `postgres.railway.internal`, an address
that exists only inside Railway, so a dump aimed at it from a laptop fails
with "could not translate host name". The script goes through the tunnel
instead and takes the user, database name and password from the Postgres
service itself, so none of them is typed or shown. **Never paste the connection string into a command or a chat: it
contains the database password.**

Railway can also give the database a public address (Postgres service >
Settings > Networking > Add Public Access), after which the command works
without `--host` and `--port`. Avoid it: anyone with the connection string
can then reach the database from anywhere.

### Uploaded files (run by you)

**Not yet tried against the hosted volume.** The packing script has been
run on a local folder only, and the download command is from Railway's CLI
reference. Do it once while nothing depends on it, and tell me what each
step printed.

1. Open a shell in the backend service (`railway ssh`, or right-click the
   service in the dashboard > Copy SSH Command) and pack the uploads:
   `npm run uploads:backup`
   It only reads the uploads. It prints how many files there are, and the
   name and size of one archive written beside the uploads folder, for
   example `/data/internet-uploads-20261012-093000.tgz`.
2. Back on your machine, download that one file from the volume, using the
   name the script printed:
   `railway volume files download /internet-uploads-20261012-093000.tgz ./internet-uploads-20261012-093000.tgz`
   (`railway volume browse /` shows what is on the volume if the path is
   not found.)
3. Check it opens: `tar -tzf internet-uploads-20261012-093000.tgz` lists the
   files, and the count should match what step 1 printed (plus one line
   for the folder itself).
4. In the service shell again, remove the archive so it does not use up the
   volume: `rm /data/internet-uploads-*.tgz`

The archive holds photos of faces and submitted documents. Keep it
somewhere other than your laptop, and never share it.

### Restore drill

A backup that has never been restored is not yet a backup. To check a dump,
restore it into a scratch database on your own machine and run the tests
against it:

```powershell
$bin = "C:\Program Files\PostgreSQL\18\bin"
& "$bin\createdb.exe" -U postgres internet_restore
& "$bin\pg_restore.exe" -U postgres -d internet_restore --no-owner --no-privileges --exit-on-error .\internet-prod-XXXX.dump
```

Then start the API against it on a spare port
(`DATABASE_PUBLIC_URL=...localhost.../internet_restore`, `PORT=5002`) and
compare a few row counts with production. Drop the scratch database when
done: it holds real personal data.

This drill was run on 2026-10-10 with a local dump (made by
`npm run db:backup-local`): restore succeeded, row counts and the 16 applied
migrations matched, and all API tests passed against the restored copy.

### Local backup

`npm run db:backup-local` (in `backend`) dumps the local database and copies
the local upload folder into `backend/backups/`. It refuses any database
that is not on this machine. Options: `-- --out <folder>` and
`-- --pg-bin <folder with pg_dump>`.

## Changing the database password

Do this if the password may have been seen by someone who should not have
it. It is part of the connection address, so a screenshot of that address
is enough. Expect a minute or two when nobody can sign in.

1. Backend service > Variables > `DATABASE_PUBLIC_URL` > Edit: confirm the
   value is `${{Postgres.DATABASE_URL}}`. If it is a pasted address, replace
   it with that reference, let the backend deploy, and check that sign-in
   still works.
2. Postgres service > Database > Credentials (it may be named Config) >
   **Regenerate password**. Never edit `PGPASSWORD` or `POSTGRES_PASSWORD`
   by hand: that changes the variable, not the real password, and nothing
   can connect afterwards.
3. Redeploy the backend: Deployments > the Active one > three dots >
   Redeploy. Railway may not offer this by itself.
4. In the new deployment's Deploy Logs, look for
   `Database migrations completed.` and `Backend running on port`, with no
   `password authentication failed`. Then sign in on the site;
   `/api/health` does not touch the database, so it is not proof.

Carried out this way on 10 October 2026. The backup command needs no
change; it reads the password from Railway each time.

## The service worker, and what to do if it goes wrong

The site installs a service worker (`/service-worker.js`, built from
`my-pwa/src/service-worker.ts`). It keeps a copy of the app's own files so
the app opens with no connection, keeps the face-tracking files after
their first download, and shows push notifications. It never stores
anything from the API.

After a deploy, people who already have the site open see "Update
available" with a **Reload** action; the new version takes over only when
they press it, or the next time they open the site after closing all its
tabs.

**If a deploy leaves people stuck** (an old version that will not update,
or pages that will not load), publish the kill switch:

1. Vercel > Settings > Environment Variables: add `SW_KILLSWITCH` with the
   value `true` for Production.
2. Redeploy (Deployments > the latest > Redeploy).
3. Each device that opens the site then removes its service worker and
   everything it stored, and reloads from the network. The app keeps
   working, without offline use.
4. When the fault is fixed, delete `SW_KILLSWITCH` and redeploy. Devices
   install the normal worker again on their next visit.

Unset, `SW_KILLSWITCH` does nothing.

## Running a data script on the hosted database (run by you)

The data scripts (`db:backfill-companies`, `db:backfill-programs`,
`db:backfill-notification-links`, `db:fk-orphans`, `db:fk-validate`,
`privacy:purge-photos`) reach the
hosted database the
way the backup does: through a tunnel, with the Railway CLI supplying the
database's settings, so nothing is typed in and no password is shown.

1. Take a backup first (see "Backups").
2. In one terminal, open the tunnel and leave it running. It prints a port
   number. It also prints the password: do not screenshot that window.
   `railway connect Postgres --tunnel-only`
3. In a second terminal, in `backend`, run the script with that port. This
   only lists what it would do:
   `railway run --service Postgres npm run db:backfill-companies PORT`
4. To make the changes, add the word `confirm` after the port:
   `railway run --service Postgres npm run db:backfill-companies PORT confirm`
5. Close the tunnel with `Ctrl+C`.

The bare word `confirm` is used instead of `--confirm` because PowerShell
and `railway run` between them drop the `--` that a flag needs. To run a
script on the staging database instead, add `--environment staging` to
both `railway` commands.

This form has been tried against a local database standing in for the
tunnel, not yet against the host. `privacy:purge-photos` is the exception:
the photos are on the server's own disk, so it still has to run there.

## Linking students to programs (run by you, once per database)

Migration 037 adds program records and 038 fills them in. A student whose
program text is already a program's name or short code ("BSIT", "BS
Information Technology") is linked the next time their account is saved,
and new students link themselves. Students who were there before, and
spellings that match nothing ("BS Info Tech"), are linked by
`db:backfill-programs`. It is run the same way as any data script above:
on **staging first**, on test data; on **production after "make it live"**,
with a fresh backup already taken.

1. Open the tunnel (for staging add `--environment staging` to both
   `railway` commands):
   `railway connect Postgres --tunnel-only`
2. In a second terminal, in `backend`, list what it would do. Nothing is
   changed:
   `railway run --service Postgres npm run db:backfill-programs PORT`
   It prints every spelling of the program typed on students, how many
   students carry it, and the program it proposes. "exact" means the
   spelling is a program's name or short code. "no proposal" means it will
   be left alone.
3. For each "no proposal" spelling you want linked, add a line to
   `backend/src/scripts/program-mapping.json` on your computer. It maps a
   spelling to a program's name or short code:
   `{ "mappings": { "BS Info Tech": "BSIT", "Information Technology": "BSIT" } }`
   Run step 2 again and check those rows now say "mapped". A spelling you
   are not sure of is better left out: it can be set on the student's form.
4. Apply it:
   `railway run --service Postgres npm run db:backfill-programs PORT confirm`
   It says how many students were linked. Running it again links nobody.
5. Close the tunnel with `Ctrl+C`.

It only sets which program a student is linked to. The program text on
each account, and majors and blocks, are not touched: majors and blocks
are set on the Programs page or the student's form. The mapping file holds
no personal data and is read from your computer; whether to commit your
edits to it is up to you.

Tried here against a local database with a correct and an incorrect
mapping file. Not yet tried through the tunnel.

## Validating the foreign keys (optional, run by you)

Migration 006 added 15 foreign keys as `NOT VALID`: the database enforces
them for every new or changed row, but has never checked the rows that
existed before. Two scripts deal with those rows. Neither is part of the
deploy.

1. Take a database backup (above).
2. Report, read-only, from the `backend` folder:
   `railway run npm run db:fk-orphans`
   It lists each unvalidated key and how many rows point at a missing
   parent.
3. Dry run: `railway run npm run db:fk-validate` prints the statements it
   would run.
4. Apply: `railway run npm run db:fk-validate -- --confirm` validates only
   the keys with zero orphans and skips the rest. It is safe to run again.

If a key has orphans, do not delete rows to make it pass; send the report
and decide what those rows should point at first.

## Phone checks after a Phase 2 deploy

These were tested in desktop Chrome with a simulated phone, not on real
devices. Do them once on an Android phone (Chrome) and once on an iPhone
(Safari), with a test student account.

**Installing**
1. Android: open the site, sign in, open Profile. An "Install INTERNet"
   card shows; install from it. The icon appears on the home screen and
   opens without the browser's address bar.
2. iPhone: the sign-in page shows "Add INTERNet to your Home Screen".
   Follow the steps. Open the app from the Home Screen icon.
3. Long-press the icon (Android): Today's attendance, Tasks and
   Notifications are listed, and each opens the right page.

**Offline**
4. Open Today, Attendance, Tasks and Schedule once with a connection.
5. Turn on airplane mode and reopen the app. It opens, and each of those
   pages shows "Showing saved data from <time>".
6. Time in with a connection. Then, in airplane mode, press Start break.
   The app says it is saved on the phone and the panel says 1 step is
   waiting. Close and reopen the app: the break still shows.
7. Turn airplane mode off. Within a few seconds the app says the step was
   sent. As the supervisor, open that log: it says "Recorded while
   offline", and the break time is when the button was pressed.
8. In airplane mode with no log today, the Time in button is unavailable
   and the panel explains why.

**Camera**
9. Time in on each phone. The camera check runs, and the screen does not
   dim while you follow the prompts.

**Updates**
10. With the app open, deploy any change. Leave the app, wait a minute and
    come back to it: "Update available" shows. Press Reload: the app
    reloads once and the message is gone.

**A shared phone** (the data-safety check)
11. Sign in as student A, open the pages in step 4, type a few words in a
    report description without sending it, then sign out.
12. Turn on airplane mode. Open the app: it must show the sign-in page and
    nothing of student A.
13. Turn airplane mode off, sign in as student B, open Report: the
    description field must be empty.

**Notifications** (only once the three `WEB_PUSH_*` variables are set)
14. Android: accept the notification prompt, then have a supervisor verify
    a log. A notification arrives with the app closed; tapping it opens the
    right page.
15. iPhone: the prompt appears only in the app opened from the Home Screen.

Write down any step that does not behave as described, with the phone and browser used.

## Privacy notice and photo retention

**The notice.** A student is shown the privacy notice when they first tap
Time in, and agrees before the camera opens. The text is in
`backend/src/services/privacy.ts`. As shipped it is a draft, and the app
says so above it. To put the approved text in: replace the sections, fill
in the two bracketed gaps (how long records are kept, and the Data
Protection Officer's contact), set `placeholder` to `false`, and change
`version`. Changing the version asks every student to agree again.

**Making the server insist.** By default only the app asks. A phone that
still holds a copy of the app from before the notice would otherwise be
unable to time in, with no way to agree. Once everyone has the current app
(a week after the deploy is a safe wait), set `PRIVACY_CONSENT_REQUIRED` to
`true` on Railway and the server refuses a time-in without consent.

**Removing old photos (run by you).** Off until `PHOTO_RETENTION_DAYS` is
set. Nothing is removed automatically; this script is the only thing that
removes a photo, and it keeps the log, its times and its hours.

1. Back up the uploaded files first (see "Uploaded files" above).
2. Open a shell in the backend service (`railway ssh`). The photos are on
   that server's disk, so the script cannot do this from a laptop.
3. `npm run privacy:purge-photos` prints how many photos are older than
   the limit and removes nothing.
4. `npm run privacy:purge-photos -- --confirm` removes them.

Only logs that are Verified or Rejected are touched. This has been run on
a local database only, not on the host.

## Before a Round 2 release goes live

As of 14 October 2026 the release also carries migrations 046
(`removed_records`), 047 (`email_daily_counts`), 048
(`problem_reports`), 049 (one new column on `attendance`, empty for
every existing log) and 050 (`attachments`). All but 049 are each a new
table and nothing else, so the backup taken before going live must be taken after
this note was written. No new
variable and no platform setting is needed for it.

Round 2 (migrations 036 to 045) reaches the test site first and the live
site second. In order:

1. "push": `ui-redesign` deploys to the test site and its own backend.
   Wait for Railway staging to go green; the migrations run by themselves.
2. On the staging backend, check Variables has `NODE_ENV` =
   `production`. A diagnostic route (`/api/test-db`) answers when it is
   anything else.
3. Run the program backfill on staging, dry run first ("Linking students
   to programs" above).
4. Walk the three portals on the test site at phone and desktop width.
   The list of pages is in `docs/AUDIT-2026-10.md`, "Round 2 review",
   R1. The demo accounts are not on staging: use accounts made there.
5. The phone checks, on a real Android phone and an iPhone (the same
   section, R6).
6. Take a fresh production database backup ("Backups" above).
7. "make it live": `main` is fast-forwarded and both hosts deploy. Wait
   for Railway production to go green, then run the program backfill on
   production.

The backend may deploy before the frontend: the frontend from before
Round 2 was run against the new backend and schema, and its own tests
pass.

## Checks after deploying

- As coordinator, Documents > Download as ZIP with a block chosen: the ZIP
  opens and its files are named student, requirement, original name. The
  server refuses more than 500 files or 500 MB in one ZIP and says so.

- `https://<backend>/api/health` returns `{"status":"ok"}`.
- Refreshing a page such as `/student/dashboard` reloads it, not a 404.
- A time-in shows the correct Philippine time.
- Upload a document, redeploy the backend, and confirm it still downloads.
- In the browser's developer tools (Network > the page > Response
  Headers): `Permissions-Policy` includes `camera=(self)` and
  `Content-Security-Policy-Report-Only` is present. In the Console, sign
  in and open a few pages: a line mentioning "Report Only" names something
  the policy would have blocked. The offline page's own script is the one
  known case.
- On a phone, tap Time in: the camera opens, the prompts appear, and the
  photo is taken by itself. (The camera needs https, which both hosts
  provide. The Vercel build copies the face-tracking files itself.)

## Turning push notifications on

Push is built and stays off until the backend has three variables. It
costs nothing and needs no account anywhere: the browser makers' own
services deliver the notifications. Do the test site first, then the live
site, each with **its own** key pair.

1. On your own computer, in the `backend` folder, run:

   ```
   npx web-push generate-vapid-keys
   ```

   It prints a public key and a private key. Do not paste either into a
   chat, a commit or a screenshot. The private key is a secret.
2. Railway → the **staging** backend service → Variables → add:
   - `WEB_PUSH_VAPID_PUBLIC_KEY`: the public key
   - `WEB_PUSH_VAPID_PRIVATE_KEY`: the private key
   - `WEB_PUSH_SUBJECT`: `mailto:` followed by an address you read, for
     example `mailto:` and the coordinator office's address. The push
     services use it only to reach whoever runs the server.

   All three, or none: with one or two the backend refuses to start and
   says which are missing. Railway redeploys by itself.
3. Check it: open
   `https://internetupdated-staging.up.railway.app/api/push/vapid-public-key`
   in a browser. Before, it answers "not configured". After, it shows the
   public key (which is safe to see).
4. On a phone, open the test site, sign in, go to **Profile →
   Notifications → This device → Turn on for this device**, allow the
   browser's question, then press **Send a test**. A notification titled
   "INTERNet test notification" should arrive within a few seconds, also
   with the app closed. On an iPhone this only works in the app opened
   from the Home Screen.
5. Repeat steps 1 to 4 for the **production** backend with a new key
   pair, when you are ready.

**Replacing the keys later** is safe: each device makes a new
subscription by itself the next time the app is opened on it. Until then
that device gets nothing, so do it at a quiet hour.

**Turning push off again:** delete the three variables. The app stops
offering it and the in-app notification list is unaffected.

**What a notification shows.** The same title and sentence as the in-app
notification, on the phone's lock screen. It can name a task or a
student. Someone who does not want that turns it off per kind of
notification, or for the device, in Profile.

**Checked on 13 October 2026**, on this computer with throwaway keys and
desktop Chrome: turning on, a test, a real "New task assigned"
notification opening `/task`, turning off, and a device recovering after
the keys were replaced. **Not checked:** any phone, Safari, Firefox, or
delivery with the app fully closed.

## Keeping uploaded files in a bucket

Time-in photos, documents and task files are on the backend's own disk
(a Railway volume). A volume has no backup of its own. A bucket on
Cloudflare R2 keeps them somewhere durable instead.

**Before you start, two things to know.**
- R2's free allowance is 10 GB of storage a month, 1 million writes and
  10 million reads, with no charge for downloads (read from
  developers.cloudflare.com/r2/pricing on 14 October 2026). A year of
  photos for a few hundred students fits well inside it.
- Cloudflare may ask for a payment card to turn R2 on, even for the free
  allowance. I could not confirm this from their pages; you will see it
  when you try. If you would rather not give one, stay on the volume and
  keep using `npm run uploads:backup`.

**Steps, test site first.**

1. In the Cloudflare dashboard: R2 → Create bucket. Name it, for
   example, `internet-files-staging`. Leave it private (the default).
   Do not turn on public access or a public address: files are only ever
   read through the backend, which checks who is asking.
2. R2 → Manage API tokens → Create API token. Permission: **Object Read
   & Write**, limited to that one bucket. It shows an Access Key ID and a
   Secret Access Key once. Do not paste either into a chat, a commit or a
   screenshot.
3. Railway → the **staging** backend → Variables → add all four:
   `R2_ACCOUNT_ID` (your Cloudflare account id, shown on the R2 page),
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the
   bucket's name). With only some of them set the backend refuses to
   start and its log names the missing ones. Do not also set the Azure
   variables: with both, it refuses to start.
4. When Railway has redeployed, sign in to the test site as a
   coordinator → Profile → **What is switched on** → Uploaded files
   should say "Object storage". Press **Check file storage**. It writes a
   small file to the bucket, reads it back and removes it, and says so.
   If it fails, the backend's log has a line starting
   `STORAGE CHECK ERROR` with Cloudflare's reason.
5. Upload a real document as a student and open it again.

**Files uploaded before the switch** stay on the volume and still open:
the backend looks in the bucket first and on the disk second. To move
them into the bucket as well, on the server:

```
railway ssh
npm run uploads:copy-to-bucket
```

That only counts. To copy:

```
npm run uploads:copy-to-bucket -- --confirm
```

It skips what is already in the bucket, reads each copy back before
counting it, never deletes anything from the volume, and can be run
again. Keep the volume until you have seen it report nothing left to
copy.

**Going back** is deleting the four variables. New files then go to the
volume again; files that went to the bucket meanwhile would no longer be
found, so copy them back out first or do not go back.

**Production** is the same with its own bucket and its own token. Take
an uploads backup first (`npm run uploads:backup`).

**Checked on 14 October 2026**, on this computer, against a stand-in
bucket that speaks the same protocol: a new upload goes to the bucket
and not the disk, opens again, an older file on the disk still opens,
the check button, and the copy script (count, copy, run again).
**Not checked:** Cloudflare R2 itself. No account was used. The first
real proof is step 4 above.

## Seeing that something is going wrong

**In the app.** A coordinator's Profile → "What is switched on" ends with
"Problems the system noticed in the last 7 days". Each line is one kind
of fault, how many times it happened and when it last did. A fault on
the server shows the label of its log line (for example `ASSIGN TASK
ERROR`) and the kind of error; one in a browser shows the crash message
and the page. Neither says who was using the system, and a server
fault's own message is never kept, because it can quote something a
person typed. A fault not seen for 30 days drops off.

To find the full detail of a server fault, search the backend's log on
Railway for the same label.

**For the host.** `/api/health` says the server is running.
`/api/health/ready` also asks the database and answers 503 when it does
not reply within three seconds. Optional: Railway → backend service →
Settings → Healthcheck Path → `/api/health/ready`, so a deploy that
cannot reach its database is not put into service.

**No outside monitoring service is used.** Nothing about faults leaves
the system, so there is no account to create and nothing to add to the
privacy notice. The cost is that nobody is told by email or phone when a
fault happens: someone has to look at the card. If the list should ever
go to an outside service instead, that is a separate decision, because
crash reports would then leave the system.

## Phone checks for the offline time-in

None of this has run on a real phone. Do it on the test site, with a
student who has no log today, before it goes live.

1. Sign in as the student with a connection, and wait for the Today page.
2. Turn on airplane mode. Tap **Time in**. The dialog should say there is
   no connection and offer **Time in without a photo**. The camera must
   not open.
3. Confirm. A message says the time-in was saved on this phone. The
   button now offers **Out for lunch**; no second Time in is offered.
4. Tap **Out for lunch** and confirm. It is saved on the phone too.
5. Close the app completely, wait a minute, open it again, still in
   airplane mode. The day should still show the time-in and lunch, marked
   as waiting.
6. Turn airplane mode off. Within about a minute a message says the
   steps were sent. On the Attendance page the log says "Time-in recorded
   with no connection, so there is no photo. Your supervisor has to
   confirm it."
7. As the supervisor: the log is in the review queue marked "Offline
   time-in, no photo", a notification says so, it is NOT among the logs
   offered by "Verify all", and opening it shows a warning in place of a
   photo and the button "They were at work: verify" (after the student
   has timed out).
8. Set the phone's clock an hour ahead, repeat step 2 and 3, reconnect:
   the time-in should be refused with "That time is in the future", and
   the student told.

**What a supervisor should be told.** A time-in with no photo proves
nothing by itself. The system's only safeguard is that it cannot count
until the supervisor says the intern was there. If a student's time-ins
are often offline, that is something to ask about.

## Pictures on entries: what to check and what to decide

**On a phone, on the test site** (none of this has run on a real one):

1. Time out with a picture taken by the camera and one chosen from the
   gallery. Both should appear small in the dialog, with a size well
   under the original's. Give one a caption, move it, remove the other.
2. An iPhone photo in HEIC: on Safari it should be accepted (Safari can
   open it). On Chrome for Android a HEIC file should be refused with a
   sentence saying how to send it another way.
3. Write a weekly report with three pictures; a fourth cannot be added.
4. File a concern with a picture. Sign in as that student's supervisor:
   the picture must not be visible anywhere.
5. Open a picture and swipe between pictures.
6. With mobile data on, on Android Chrome: pictures should show their
   size and wait to be tapped. (Only browsers that report the kind of
   connection do this; iPhones do not, and load pictures straight away.)

**Storage.** A picture is at most 4 MB and usually 100 to 400 kB after
the app has made it smaller. Three per entry, on every time-out and
weekly report, adds up over a term: this is the best reason yet to move
uploads to a bucket (see "Keeping uploaded files in a bucket").

**A decision owed: how long pictures are kept.** `PHOTO_RETENTION_DAYS`
and `npm run photos:purge` cover time-in photos only. Pictures attached
to entries are kept with no limit, like documents. If they should also
expire, say after how long and whether a concern's pictures are an
exception, and the purge can be extended.
