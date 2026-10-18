# Pictures: previews in lists, pictures that wait offline, pictures in the ZIP

**Branch:** `iter-13-pictures` → `ui-redesign` · **Workstream D** · **Migration 063**

## What changes for people

- **Everyone who sees pictures:** lists load a small preview (480 px WebP,
  about 20 to 40 kB) made on the phone; the full picture loads when opened,
  and the preview stands in while it does.
- **Students:** pictures added to a time-out with no signal wait on the phone
  with it (three at most, made smaller to about 400 kB each) and are sent
  after it. A HEIC photo is refused with what to change on an iPhone or
  Android.
- **Coordinator:** "Include pictures" in the documents ZIP adds each
  student's time-out and weekly-report pictures in a `Pictures/<student>/`
  folder, inside the same 500-file and 500 MB limits (never a concern's).
- Time-out pictures now show on the coordinator record's day panel and on the
  month calendar (student and supervisor).

## How

- Migration 063: `attachments.preview_path`, `preview_size_bytes`,
  `client_ref` (unique per entry, so a picture sent twice is kept once).
- Upload takes an optional WebP preview (at most 200 kB), the phone's id, and
  the time-out's `occurred_at`, held to `OFFLINE_MAX_AGE_HOURS_TIME_OUT`.
  `GET /api/attachments/:id/preview`.
- Pictures join the offline queue right behind their time-out, before sending
  starts, and are discarded with it.
- The privacy notice (draft-4) says pictures may wait on the phone; students
  agree again once.

## Tests

API: the age limit and ZIP names, previews and who may see them, sent twice
kept once, the ZIP with pictures. Playwright: an offline time-out with a
picture, sent after with its preview; previews in lists; both screens; HEIC;
the ZIP checkbox. axe clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
