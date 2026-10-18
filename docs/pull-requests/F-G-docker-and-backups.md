# Docker for development, and scheduled encrypted backups

**Branch:** `iter-15-docker-backups` → `ui-redesign` · **Workstreams F and G** · **Migration 064**

## What changes for people

- **Coordinator:** the status card ("What is switched on") shows the last good
  database backup, any failure with its reason, "Missed" when a night passes
  without one, the weekly pack of uploaded files while they are on the server's
  disk, and asks for a restore drill once a month ("Record a drill").
- **Developers:** `docker compose up` runs the whole system locally:
  PostgreSQL 16, the API (`tsx watch`), the Vite dev server, Mailpit (caught
  email) and an S3 stand-in. Development only.

## How

- `services/backups.ts`: `pg_dump -Fc` streamed through age encryption (to a
  public key; the private key stays offline) into an R2 multipart upload; a
  failed dump is abandoned before the upload is final. Nightly in a Railway
  cron service of its own (`railway.backup.json`, `backup.Dockerfile` with
  pg_dump 18, 01:30 Philippine time); a monthly copy on the 1st; a weekly
  uploads pack in the backend.
- Migration 064 `backup_runs`; `POST /api/coordinator/backups/restore-drill`
  (audited). `npm run backup:keygen`, `backup:decrypt`, `backup:uploads-now`.
- Narrow development-only allowances: SMTP without TLS only for mailpit or
  localhost when asked, the demo seed for the container named `db`.
- CI installs pg_dump 18 so the nightly-script test runs there.

## Not done (needs the owner)

The Railway service and Cloudflare bucket are not set up: DEPLOY.md,
"Scheduled backups", has the steps. Until then the manual backups apply.

## Tests

API: settings, keys by Philippine date, nothing secret in errors; streaming,
equal parts, wrong key refused, abandoned dumps; the status card logic and the
drill route; the weekly pack; the real nightly script. Checked live in Docker,
including a restore with pg_restore. Playwright: recording a drill.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
