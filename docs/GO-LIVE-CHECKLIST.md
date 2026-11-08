# Go-live checklist: ui-redesign to production

Production (`main`) was last updated on 11 October 2026. Going live brings the following:

- Everything built since then: 233 commits.
- 42 database migrations, numbered 035 to 076.
- The scheduled backups. These need the new code before they can run.

Do the steps in order. Do not skip ahead.

## Before

**1. Take a manual backup of production.**
- Use the two-terminal tunnel steps in DEPLOY.md, "Database (run by you)".
- The backup is written to `backend/backups/`. Git ignores that folder.

**2. Rehearse the migrations on a copy.**
- Restore the backup into a throwaway local database.
- Run `npm run db:migrate` against it, with all 42 migrations.
- Check that the app signs in and the record counts match.
- Done on this computer only. The copy holds real students' data: never put it in seed data, screenshots or the repository, and drop it afterwards.

**3. Push to the test site.**
- Push `ui-redesign`. CI runs first.
- Then check the test site:
  - sign in as each role;
  - Today;
  - Reports;
  - the Narrative;
  - Fill and print;
  - the supervisor's intern Reports;
  - the coordinator's student record.

## Going live

**4. Make it live.**
- Update `main` to `ui-redesign`. It is a fast-forward, with no merge.
- Railway runs the migrations before it starts the new version (`preDeployCommand`).
- If a migration fails, the old version keeps running.

**5. Check production.**
- `/api/health` and `/api/health/ready` both answer `{"status":"ok"}`. Before going live, `/ready` answers 404.
- The public site loads.
- Sign in as each role.

## After

**6. Turn on the backup service.**
- In Railway, apply the pending changes on the `backup` service. Its six variables are already set.
- Test it once: set Cron Schedule to a few minutes from now in UTC (Philippine time minus 8 hours).
- Check that the run succeeded in its Deployments log.
- Check that `backups/database/daily/<date>.dump.age` appears in the Cloudflare bucket.
- Set the schedule back to `30 17 * * *`.

**7. Back up the uploaded files every week.**
- Add the same five `BACKUP_R2_*` and `BACKUP_AGE_RECIPIENT` variables to the backend service.
- Do not add `BACKUP_DATABASE_URL` there.

**8. Push notifications (optional).**
- Add `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` to the backend. The values are in the key file given to you on 8 November.

**9. The next morning.**
- Go to Profile settings > What is switched on > Database backup. It should say "On", with last night's time.

## If something goes wrong

- **The new version fails its health check.** Railway keeps the old one running. Read the deploy log, then fix forward or roll back.
- **Rolling back the code.** In Railway, redeploy the previous deployment, and in Vercel promote the previous one. The added tables and columns stay; the old code ignores them.
- **Restoring the data.** Only restore the step 1 backup with `pg_restore` if data was damaged. Do this together, never alone under pressure.
