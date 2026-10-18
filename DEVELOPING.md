# Developing INTERNet

Notes for whoever changes the code. Deploying is in `DEPLOY.md`.

## Working offline

What each role can do with no connection. The same table is on the app's
Help page (`/help`, from `my-pwa/src/lib/offlineHelp.ts`); change both
together.

| Role | Works with no connection | Waits on the phone, sent later | Needs a connection |
|---|---|---|---|
| Student | Dashboard, attendance, tasks, schedule, absences, company and profile as last loaded; drafts of journals, reports, task notes, absences and messages | Time-in (with a photo when the phone is ready, otherwise without one for the supervisor to confirm), within 12 h; out for lunch and back from lunch, within 12 h; time-out, within 24 h, with up to 3 pictures (about 400 kB each) sent after it | Submitting tasks, documents, journals and absences, and pictures on journals and concerns; messages and concerns; signing in |
| Supervisor | Interns, logs, tasks, documents, absences, weekly reports and schedules as last loaded; message drafts | Nothing: a decision is never kept for later | Every decision; recording an intern's time-in; giving tasks; messages; signing in |
| Coordinator | Notifications and announcements as last loaded; message drafts | Nothing | Every page's current figures; every decision, change, import and export; signing in |

The hours are the server's defaults. Each can be changed per deployment:
`OFFLINE_MAX_AGE_HOURS_TIME_IN`, `OFFLINE_MAX_AGE_HOURS_LUNCH`,
`OFFLINE_MAX_AGE_HOURS_TIME_OUT` (1 to 72). When one is not set the older
`OFFLINE_ACTION_MAX_AGE_HOURS` is used, and then the default
(`backend/src/services/offlineActions.ts`). Separately, the phone erases a
waiting step after 72 hours (`QUEUE_KEEP_HOURS` in `lib/offlineStore.ts`).

### How the phone decides it can send

- `navigator.onLine` is only a hint. `my-pwa/src/lib/reachability.ts` asks
  `GET /api/health` and waits at most 3 seconds. While the server cannot be
  reached it asks again after 3 s, 6 s, 12 s… up to once a minute; it asks
  again at once on `online`, `offline`, and when the app comes back to the
  front. `useReachability()` gives a component the answer.
- `my-pwa/src/lib/offlineQueue.ts` sends the waiting steps only when that
  answer is yes, in the order they were recorded. A try that does not get
  through is written on the step (`attempts`, `lastTriedAt`, `lastError`).
- `my-pwa/src/pages/student/WaitingToSend.tsx` is the "Waiting to send"
  panel on every student page: each step's age, until when the server will
  take it (`GET /api/offline/limits`), the last error, Retry, and Discard
  (after a confirmation; a time-in takes the steps after it with it).

## Two people deciding the same record

Migration 062 gives `attendance`, `tasks`, `documents`, `absences`,
`journals` and `attendance_appeals` a `version` that a trigger moves on
every change to the row. The lists reviewers decide from return it, and
every review decision sends it back as `expected_version`. If the record
has changed since, the route answers **409** with
`{ code: "STALE", message, current: { id, status, version, note } }` and
writes nothing (`backend/src/services/versions.ts`). The pages show the
message and reload.

- A request without `expected_version` is decided as before, so an older
  copy of the app still works.
- Only records the caller may see are looked at: a supervisor asking about
  another supervisor's intern gets the route's usual answer, not the 409.
- Undo routes do not check the version: they have their own time limit and
  checks.
- A new decision route should call `staleDecision(...)` right after its id
  check, and its list should select the `version` column.

## Pictures on entries

Up to three pictures on a time-out note, a weekly report or a concern
(`backend/src/routes/attachments.ts`, `my-pwa/src/lib/attachments.ts`).

- The phone redraws each picture (at most 1600 px, JPEG, which drops the
  camera's location data) and also makes a **480 px WebP preview**. Both are
  sent; the server keeps the preview as `preview_path` (migration 063).
  Lists show previews (`GET /api/attachments/:id/preview`); the picture
  itself (`/file`) is fetched when it is opened. A picture without a
  preview is shown from the picture itself.
- Each picture carries `client_ref`, the phone's id for it: a second
  upload with the same id onto the same entry returns the picture already
  there.
- **Offline:** pictures chosen for a time-out with no connection wait in the
  queue as a `"pictures"` row right after it (made smaller to about
  400 kB each), and are sent once the time-out is accepted, with the
  time-out's `occurred_at`; the server refuses them past
  `OFFLINE_MAX_AGE_HOURS_TIME_OUT`. Journals and concerns still need a
  connection, pictures included.
- **HEIC** is refused with guidance on what to change on the phone
  (roadmap decision 6); no converter is shipped.
- **Coordinator ZIP:** `include_pictures=1` on
  `/api/coordinator/documents/zip` adds the same students' pictures on
  time-out notes and weekly reports as `Pictures/<student>/...`, inside the
  same 500-file and 500 MB limits. Pictures on concerns are never included.
