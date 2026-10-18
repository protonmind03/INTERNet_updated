# UX pass, and the Chapter 9 improvements

**Branch:** `iter-16-ux-pass` → `ui-redesign` · **Workstream H** · no migration

## What changes for people

Seven changes, each logged in `docs/UX-PASS.md` as screen - change - principle:

- **Students:** the weekly schedule no longer runs off a phone screen; task
  cards no longer repeat the tab's status; a requirement with no file is one
  row with its Upload button beside it (each button names its requirement for
  screen readers).
- **Supervisors:** the "left out of Verify all" chip matches its neighbours
  and says "Verify on its own".
- **Coordinator:** on a phone the filter bar is one line that opens the
  choices; on the Students page the list controls share one row.
- **Everyone:** live notifications that arrived while the connection was down
  appear as one summary when it comes back.

## How (Chapter 9)

- Railway checks `/api/health/ready` when deploying the backend.
- Advisory locks on the scheduled loops (reminders, time-out reminders,
  summaries), so a second server could never send twice.
- Live stream: event ids, `?after=<id>` catch-up on reconnect, a 60 s
  watchdog in the browser.
- Audit: messages (never their subject or words) and the kind of each
  attendance rejection.
- DEPLOY.md: "Steps waiting for you" (CSP check, consent switch, FK
  validation through the tunnel, backups); the CSP described as enforced.

## Tests

API: catch-up, the loop lock, the new audit entries, the health path. Two
browser tests updated for the new wording. axe clean on every changed page.
**Fixed in Phase 4:** one journey ("time in with no connection") raced the
phone's background readiness for an offline camera check and failed once on
CI; it now blocks that readiness explicitly.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
