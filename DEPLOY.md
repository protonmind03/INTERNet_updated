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
   | `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` |
   | `JWT_SECRET` | a new random value (command below) |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | the Vercel URL from step 3 (fill in after step 3) |
   | `PRIVATE_UPLOAD_DIR` | `/data/private-uploads` |

   Generate the secret with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

   Do not set `PORT`; Railway provides it.
5. Settings > Networking > **Generate Domain**. This is the backend URL.
6. Keep the service on **one instance** and on a plan that does not sleep.
   Deadline reminders and live notifications run inside the server process.

Optional, each can be added later:

- `CORS_ORIGINS`: extra browser addresses allowed to call the API,
  comma-separated, each starting with `https://` and with no trailing
  slash. Needed when the site answers on more than one address (for
  example an old Vercel address kept beside a new one); `FRONTEND_URL` is
  always allowed and is the address used in password-reset links.
- `OFFLINE_ACTION_MAX_AGE_HOURS` (default 12, allowed 1 to 72): how old a
  break, back-to-work or time-out recorded while a phone was offline may be
  when it arrives. Older ones are refused.
- `LOGIN_MAX_FAILURES` (default 5): wrong passwords allowed on one account
  before a 15-minute lockout.
- `LOGIN_IP_MAX_FAILURES` (default 100): wrong passwords allowed from one
  network address, across all accounts, per 15 minutes. Keep it high if
  many users share one campus connection.
- Email (password recovery, deadline reminder emails): `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without all five,
  "Forgot password" reports that email is not configured.
- Browser push notifications: `WEB_PUSH_VAPID_PUBLIC_KEY`,
  `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Generate the key pair
  with `npx web-push generate-vapid-keys`. Set all three or none.
- Azure Blob Storage instead of the volume:
  `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`.

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
and runs the API tests; separately it builds and lints the site. It needs
no secrets. The result shows on the repository's Actions tab and as a tick
or cross beside each commit.

By default a failing run does **not** stop a deploy. To make it stop one:

- Railway: service > Settings > Source > turn on **Wait for CI**.
- Vercel: Settings > Git; look for the option to wait for GitHub checks
  before a production deployment. (Not confirmed on the Hobby plan. If it
  is not offered, Railway's switch still protects the backend and its
  migrations, and a red cross on GitHub is the signal not to trust the
  site build.)

Turn these on only after the workflow has passed once on `main`.

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

Then, each time you want a backup, from the `backend` folder:

```
railway run --service Postgres npm run db:backup-production
```

Type it exactly as shown; there is nothing to fill in. It writes
`backend/backups/internet-production-<date>-<time>.dump` and prints its
size. It only reads, and takes seconds.

How it works, and why not a plain `pg_dump` of `DATABASE_PUBLIC_URL`: the
backend reaches the database at `postgres.railway.internal`, an address
that exists only inside Railway, so a dump aimed at it from a laptop fails
with "could not translate host name". The script uses the database's public
address instead (Railway's TCP proxy) and takes the user, database name and
password from the Postgres service itself, so none of them is typed or
shown. **Never paste the connection string into a command or a chat: it
contains the database password.**

If it says the database has no public address: Postgres service > Settings
> Networking > add a TCP proxy for port 5432, then run it again.

### Uploaded files (run by you)

Not yet tried against the hosted volume; the commands are from Railway's
CLI reference. Do it once while nothing depends on it.

1. Open a shell in the backend service (`railway ssh`, or right-click the
   service in the dashboard > Copy SSH Command) and pack the folder:
   `tar czf /data/uploads-backup.tgz -C /data private-uploads`
2. Back on your machine, download that one file from the volume:
   `railway volume files download /uploads-backup.tgz ./uploads-backup.tgz`
   (`railway volume browse /` shows what is on the volume if the path is
   not found.)
3. In the service shell again, remove the archive so it does not use up the
   volume: `rm /data/uploads-backup.tgz`

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

## Checks after deploying

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
