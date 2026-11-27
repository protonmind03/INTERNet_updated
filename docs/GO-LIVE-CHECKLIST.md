# Go-live checklist: ui-redesign to production

Production (`main`) went live with this checklist on 8 November 2026 and was last updated on 25 November 2026 (`23d68da`). Going live from 11 October brought the following:

- 58 database migrations, numbered 035 to 092 (077 to 092 came with `docs/IMPLEMENTATION-PROMPT.md`, Phases 0 to 2).
- The scheduled backups. These need the new code before they can run.

For a later update, check which migrations `ui-redesign` adds since `main` (`git diff --stat main ui-redesign -- backend/migrations`) and rehearse those.

Do the steps in order. Do not skip ahead.

## Before

**1. Take a manual backup of production.**
- Use the two-terminal tunnel steps in DEPLOY.md, "Database (run by you)".
- The backup is written to `backend/backups/`. Git ignores that folder.

**2. Rehearse the migrations on a copy.**
- Restore the backup into a throwaway local database.
- Run `npm run db:migrate` against it, with every pending migration (035 to 092 the first time).
- Check that the app signs in and the record counts match.
- Done on this computer only. The copy holds real students' data: never put it in seed data, screenshots or the repository, and drop it afterwards.

**3. Push to the test site.**
- First, on the test site's database, do step 4's password hashing and its `FRONTEND_URL` check (add `--environment staging` to both `railway` commands). The new version refuses plain-text passwords and will not start without `FRONTEND_URL`, and the test site deploys it as soon as CI passes.
- Push `ui-redesign`. CI runs first.
- Then check the test site:
  - sign in as each role;
  - Today;
  - Reports;
  - the Narrative;
  - Fill and print;
  - the supervisor's intern Reports;
  - the coordinator's student record.

**4. Hash any plain-text passwords.**
- The new version refuses a password stored as plain text: such an account could no longer sign in.
- Run the script on production through the tunnel (DEPLOY.md, "Running a data script on the hosted database"). It prints counts only, never a password or an email.
  - `railway connect Postgres --tunnel-only` (leave it running; note the port);
  - `railway run --service Postgres npm run db:hash-legacy-passwords <port>`: a dry run that counts them;
  - if any count is above 0, run it again with `confirm` at the end.
- Run it again without `confirm`: every count should be 0. Rehearse it on the step 2 copy first.
- Check that the production backend has `FRONTEND_URL` set in Railway. The new version will not start in production without it (or `CORS_ORIGINS`).
- Set `PHOTO_RETENTION_DAYS` on the production backend (a whole number of days, at least 30, agreed with the university). From then on the server removes older time-in photos of decided logs by itself every night at 02:30. Back up the uploaded files first: the first night removes every photo already past the limit. (DEPLOY.md, "Privacy notice and photo retention".)

## Going live

**5. Make it live.**
- Update `main` to `ui-redesign`. It is a fast-forward, with no merge.
- Railway runs the migrations before it starts the new version (`preDeployCommand`).
- If a migration fails, the old version keeps running.

**6. Check production.**
- `/api/health` and `/api/health/ready` both answer `{"status":"ok"}`. Before going live, `/ready` answers 404.
- The public site loads.
- Sign in as each role.

## After

**7. Turn on the backup service.**
- In Railway, set the `backup` service's Root Directory to `/` (the repository root) and deploy. Its settings (the backup job, its Dockerfile and the nightly schedule) come from `.railway/railway.ts`, applied with `railway config apply` (DEPLOY.md, "Railway settings as code"). Its six variables are already set.
- Test it once: set Cron Schedule to a few minutes from now in UTC (Philippine time minus 8 hours).
- Check that the run succeeded in its Deployments log.
- Check that `backups/database/daily/<date>.dump.age` appears in the Cloudflare bucket.
- Set the schedule back to `30 17 * * *`.

**8. Back up the uploaded files every week.**
- Add the same five `BACKUP_R2_*` and `BACKUP_AGE_RECIPIENT` variables to the backend service.
- Do not add `BACKUP_DATABASE_URL` there.

**9. Push notifications (optional).**
- Add `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` to the backend. The values are in the key file given to you on 8 November.

**10. The next morning.**
- Go to Profile settings > What is switched on > Database backup. It should say "On", with last night's time.

## If something goes wrong

- **The new version fails its health check.** Railway keeps the old one running. Read the deploy log, then fix forward or roll back.
- **Rolling back the code.** In Railway, redeploy the previous deployment, and in Vercel promote the previous one. The added tables and columns stay; the old code ignores them.
- **Restoring the data.** Only restore the step 1 backup with `pg_restore` if data was damaged. Do this together, never alone under pressure.
