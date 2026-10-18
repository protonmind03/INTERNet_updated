# Offline-first: send only when the server answers, show what waits, refuse stale decisions

**Branch:** `iter-12-offline-first` → `ui-redesign` · **Workstream B** · **Migration 062**

## What changes for people

- **Students:** steps recorded with no signal (time-in, lunch, time-out) are
  listed under **Waiting to send** on every page, with when each was
  recorded, until when the server will still take it, and why the last try
  failed; they can retry or discard one (with a confirmation). A badge on the
  account button shows how many are waiting.
- **Supervisors and the coordinator:** a decision on a record someone else
  changed since it was opened is refused with "This … changed while you had it
  open" and the page reloads, instead of overwriting the other decision.
- **Everyone:** a Help page (`/help`) says what works with no connection, by role.

## How

- `lib/reachability.ts`: `/api/health` with a 3 s timeout and back-off; the
  phone's "online" is only a hint. The offline queue sends only when the
  server answers and records attempts, last try and last error per step.
- Per-kind age limits: `OFFLINE_MAX_AGE_HOURS_TIME_IN` / `_LUNCH` /
  `_TIME_OUT` (12/12/24), falling back to `OFFLINE_ACTION_MAX_AGE_HOURS`;
  `GET /api/offline/limits`.
- Migration 062: `version` on attendance, tasks, documents, absences,
  journals and appeals, moved by a trigger. Every review decision sends
  `expected_version`; a mismatch is 409 `STALE` with the record as it is now.
  Only records the caller may see are compared (no leak). A request with no
  version is decided as before.

## Tests

API: limits and fallback, the limits route, a 409 for each decision kind, no
leak across supervisors, the trigger. Playwright: the panel, Retry and
Discard, the health check rather than the online flag, a stale decision in
the UI, the Help page. axe clean on the new screens.

## To check on a phone

Airplane mode → Time out → the panel shows it; Wi-Fi with no internet → it
waits ("server could not be reached"); real signal → sent within a minute.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
