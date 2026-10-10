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

You need the Railway CLI (`npm i -g @railway/cli`, then `railway login` and
`railway link` inside the `backend` folder) and the PostgreSQL client tools,
the same major version as the hosted database or newer.

`railway run` runs a command on your own machine with the service's
variables filled in. The variable must be read by the inner command, not by
your shell, hence the quoting:

```powershell
# PowerShell, from the backend folder
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
railway run cmd /c "pg_dump %DATABASE_PUBLIC_URL% --format=custom --no-owner --no-privileges --file internet-prod.dump"
```

Rename the file with the date afterwards.

```bash
# macOS / Linux
railway run sh -c 'pg_dump "$DATABASE_PUBLIC_URL" --format=custom --no-owner --no-privileges --file "internet-prod-$(date +%Y%m%d-%H%M).dump"'
```

The command only reads. A dump of a few megabytes takes seconds.

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

## Checks after deploying

- `https://<backend>/api/health` returns `{"status":"ok"}`.
- Refreshing a page such as `/student/dashboard` reloads it, not a 404.
- A time-in shows the correct Philippine time.
- Upload a document, redeploy the backend, and confirm it still downloads.
- On a phone, tap Time in: the camera opens, the prompts appear, and the
  photo is taken by itself. (The camera needs https, which both hosts
  provide. The Vercel build copies the face-tracking files itself.)
