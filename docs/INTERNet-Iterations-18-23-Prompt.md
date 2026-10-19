# INTERNet — Iterations 18 to 23: Trainee Portal and Brand Expansion (single run)

You are working in the INTERNet repository (`backend/`, `my-pwa/`, `e2e/`, `docs/`). Carry out **all six phases below, in order, in this one session**, without stopping to ask me anything. Every open question already has a decision in Section 2; follow it. This is a **system proposal for Pangasinan State University – Lingayen Campus**, so the PSU seal is to be used throughout the product as specified.

---

## 0. Ground rules for this run

1. **Work autonomously.** Do not pause for confirmation between phases. If something is ambiguous, choose the option most consistent with this brief and the existing code, write the choice in the progress log, and continue.
2. **Progress log.** Create `docs/PROGRESS-ITER-18-23.md` first. After each phase, append: what changed (files), migrations added, tests run and their results, anything skipped and why. If the session runs out of context, the next session must be able to resume from this file alone. At the start, check whether this file already exists. If it does, continue from the last unfinished phase.
3. **Task list.** Keep a todo list with one item per numbered step in each phase. Tick items as you go.
4. **Read before you change.** For every file named here, open it and confirm the current behaviour before editing. The names come from the 18 October tree; if a file was renamed, find its successor with search and note it in the log.
5. **Git.** Create one branch per phase from the previous phase's branch: `iter-18-rules`, `iter-19-brand`, `iter-20-attendance`, `iter-21-shell`, `iter-22-passkeys`, `iter-23-landing`. Commit at the end of each phase with a clear message. **Do not push. Do not deploy. Never run anything against a hosted database or Railway/Vercel.**
6. **Tests stay green.** At the end of each phase run, in this order: `backend: npm run lint`, `npm test`, `npm run check:route-tests`; `my-pwa: npm run lint`, `npm run build`, `npm run check:pwa`; and the e2e suite if the local API and preview can be started (`e2e: npm test`). Fix what you break before moving on. If e2e cannot run in this environment, say so in the log. Do not delete or weaken an existing test to make it pass.
7. **House conventions (keep them):**
   - Migrations are additive and safe to run twice (`IF NOT EXISTS`, guarded `DO $$` blocks). Foreign keys are added `NOT VALID`. Each file opens with a plain-language comment explaining what it adds, what existing rows get, and why. This matches 049–063.
   - Philippine time everywhere through the existing helpers (`services/phTime.ts`, `lib/phTime.ts`). `npm run lint` checks time-zone use.
   - Brand tokens only: no hex values outside `my-pwa/src/brand/tokens.ts` / `brand.css`.
   - Every UI change gets one line in `docs/UX-PASS.md` in the form `screen - change - design principle`.
   - Every change that alters documented behaviour gets an entry in `PAPER-CORRECTIONS.md` under a new heading `## After the Trainee portal and brand expansion (October 2026)`.
   - New review decisions keep the `expected_version` / 409 STALE pattern (`services/versions.ts`).
   - Accessibility: every new interactive control works by keyboard and screen reader; every animation has a `prefers-reduced-motion` state; touch targets are at least 44 × 44 px.
   - No new third-party runtime services. New npm packages are allowed only where named below. Pin exact versions.
8. **Migration numbering.** The 18 October snapshot ends at `063_picture_previews.sql`; Iteration 15 added `backup_runs`, expected at **064**. List `backend/migrations` first. The new migrations below are numbered **065–070**; if the last existing number is different, shift all six so they follow it, and update every reference in this brief accordingly.
9. **Seal asset.** I have placed the seal at `my-pwa/src/brand/assets/psu-seal.png` (447 × 447 px, full colour on white). If it is not there, stop **only this asset step**, log it, use a clearly named placeholder file, and continue.

---

## 1. Context you can rely on (state on 18 October 2026)

- Student menu today: Today, Attendance, Tasks, Documents, plus More (Schedule, Weekly report). The Resolution Center opens from the avatar menu on phones.
- Attendance steps are currently labelled "Time in", "Out for lunch", "Back from lunch", "Time out". The DTR columns are Day, AM In, AM Out, PM In, PM Out, Hours, Status. A day without lunch prints "No break".
- "Late" is currently a time-in more than 15 minutes after the scheduled start (Schedule page only).
- `ojt_schedule` has one `start_time` / `end_time` per day. It has no lunch window. Two-week patterns count from a Monday anchor (`ojt_pattern_week`, migration 061).
- `absences` is `UNIQUE (student_id, date)`.
- Programs are stored by short names ("BS Information Technology", migration 038). There is no institution or campus record.
- Offline time-in with photo exists (migration 055: `device_keys`, `offline_vouchers`, `attendance.offline_attestation`; `routes/offlineTimeIn.ts`, `services/offlineAttestation.ts`, `lib/offlineTimeIn.ts`, `lib/attestation.ts`, `lib/deviceKey.ts`). The offline ledger (`offline_action_ledger.action`) records `break`, `break-end` and `time-out` with no photo or signature.
- Notifications carry `link`, `entity_type`, `entity_id` (migration 018). The link backfill ran in Iteration 16. `lib/notificationTargets.ts` and `lib/useFocusRecord.ts` exist.
- The splash is `brand/SplashScreen.tsx`. Sign-in is one `brand/LoginScreen.tsx` inside `layouts/AuthShell.tsx`. Install help is `components/InstallApp.tsx` and `lib/useInstallPrompt.ts`. There is one manifest, `public/manifest.json`.
- `student_projections` and `student_projection_snapshots` (migration 061) hold the projected finish and its daily history.

---

## 2. Decisions already made (do not reopen)

| ID | Decision |
|---|---|
| D1 | On screen, the four steps are **Time in · Lunch break · End break · Time out**. The DTR columns stay AM In, AM Out, PM In, PM Out. Rewrite the PAPER-CORRECTIONS note that told the paper not to say "break". |
| D2 | **Late from the start minute, seconds ignored.** A time-in at 08:00:59 for an 08:00 start is on time; 08:01:00 is late. Grace is a setting (`late_grace_min`, default 0). End break after the lunch end is also marked late (display only; hours already exclude lunch). |
| D3 | A missed morning is **shown, not auto-filed.** The banner and calendar show "Morning · absent". The trainee may file a morning absence with a reason (`absences.part = 'am'`). |
| D4 | **Use the PSU seal** as specified in Phase 19. Public pages say "A system proposal for Pangasinan State University – Lingayen Campus". |
| D5 | Role-distinct installs are **installable web apps** (one manifest per role). No app-store builds in this run. |
| D6 | The Time Record blackletter line uses **UnifrakturMaguntia** (`@fontsource/unifrakturmaguntia`, OFL), self-hosted. Old English Text MT is named first in the font stack for machines that have it. |
| D7 | A passkey is **requested but never blocks a step.** Without one, the step is recorded as unverified and the supervisor sees that. |
| D8 | The signature is an **image of handwriting**, not a cryptographic signature. Add it to the privacy notice text and the data download, but **do not change the notice `version`** in this run (I will bump it together with the university's approved text). Log this as a pending step for me. |
| D9 | No second factor for coordinators in this run. |

---

## 3. PHASE 18 — Rules and data foundation (branch `iter-18-rules`)

### 18.1 Migration 065 `attendance_day_rules.sql`

```sql
-- 065: when a trainee may time in, when hours start to count, what is
-- late, and when a day becomes afternoon-only.
-- (Write the full plain-language header in the house style.)

ALTER TABLE ojt_schedule
  ADD COLUMN IF NOT EXISTS lunch_start TIME,
  ADD COLUMN IF NOT EXISTS lunch_end   TIME;
-- NULL lunch: when the shift spans noon, the defaults below apply
-- (12:00-13:00); when it does not, the day has no lunch.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS session          VARCHAR(4),
  ADD COLUMN IF NOT EXISTS credited_from    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS late_minutes     INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_start  TIME,
  ADD COLUMN IF NOT EXISTS lunch_late_minutes INTEGER;
-- Existing rows keep NULL: session NULL = as before (full day),
-- credited_from NULL = hours counted from time_in, as before.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_session_check
      CHECK (session IS NULL OR session IN ('full', 'am', 'pm')) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance_rules (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO attendance_rules (key, value) VALUES
  ('early_window_min', '30'),
  ('late_grace_min', '0'),
  ('late_ignores_seconds', 'true'),
  ('default_lunch_start', '12:00'),
  ('default_lunch_end', '13:00')
ON CONFLICT (key) DO NOTHING;
```

Do not recompute hours on existing logs.

### 18.2 Migration 066 `absence_parts.sql`

- `absences.part VARCHAR(3) NOT NULL DEFAULT 'day'`, with check `part IN ('day','am','pm')` (`NOT VALID`).
- Drop the inline unique constraint on `(student_id, date)`. Find its real name from `pg_constraint` inside a `DO` block; it is probably `absences_student_id_date_key`. Then `CREATE UNIQUE INDEX IF NOT EXISTS uq_absences_student_date_part ON absences (student_id, date, part)`.
- Add a `BEFORE INSERT OR UPDATE` trigger that refuses a `day` row when an `am` or `pm` row exists for that student and date, and the reverse.
- **Search the backend for every `ON CONFLICT (student_id, date)` on `absences`** and for code that assumes one absence per day, including `services/photoRedo.ts`, which adds an Unexcused absence. Update each one to use `part`. Photo-redo absences are `day`.

### 18.3 Migration 067 `student_signatures.sql`

```sql
CREATE TABLE IF NOT EXISTS student_signatures (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  file_path   TEXT NOT NULL,          -- PNG via services/privateFileStore.ts
  svg_paths   TEXT NOT NULL,          -- stroke paths, for crisp print
  sha256      TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_signatures_active
  ON student_signatures (student_id) WHERE revoked_at IS NULL;
ALTER TABLE dtr_certifications ADD COLUMN IF NOT EXISTS trainee_signature_id INTEGER;
-- FKs NOT VALID: student_signatures.student_id -> students(student_id)
-- ON UPDATE CASCADE ON DELETE CASCADE; dtr_certifications.trainee_signature_id
-- -> student_signatures(id) ON DELETE SET NULL.
```

### 18.4 Migration 068 `institution_profile.sql`

```sql
CREATE TABLE IF NOT EXISTS institution_profile (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  republic_line   TEXT NOT NULL,
  university_name TEXT NOT NULL,
  campus_name     TEXT NOT NULL,
  locality_line   TEXT NOT NULL,
  seal_asset      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO institution_profile (id, republic_line, university_name, campus_name, locality_line, seal_asset)
VALUES (1, 'REPUBLIC OF THE PHILIPPINES', 'Pangasinan State University', 'LINGAYEN CAMPUS',
        'LINGAYEN, PANGASINAN', 'psu-seal')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS formal_name TEXT;
UPDATE programs p SET formal_name = v.formal
FROM (VALUES
  ('ABEL',   'Bachelor of Arts in English Language'),
  ('ABEcon', 'Bachelor of Arts in Economics'),
  ('BSBio',  'Bachelor of Science in Biology'),
  ('BSND',   'Bachelor of Science in Nutrition and Dietetics'),
  ('BSSW',   'Bachelor of Science in Social Work'),
  ('BPA',    'Bachelor of Public Administration'),
  ('BSBA',   'Bachelor of Science in Business Administration'),
  ('BSCS',   'Bachelor of Science in Computer Science'),
  ('BSIT',   'Bachelor of Science in Information Technology'),
  ('BSMath', 'Bachelor of Science in Mathematics'),
  ('BSHM',   'Bachelor of Science in Hospitality Management'),
  ('BSEd',   'Bachelor of Secondary Education'),
  ('BTLEd',  'Bachelor of Technology and Livelihood Education'),
  ('BTVTEd', 'Bachelor of Technical-Vocational Teacher Education'),
  ('BIT',    'Bachelor of Industrial Technology')
) AS v(code, formal)
WHERE LOWER(p.short_code) = LOWER(v.code) AND p.formal_name IS NULL;
```

- Add `formal_name` to the coordinator's Programs page editor (`routes/academics.ts`, `pages/coordinator/Programs.tsx`), audited like other program edits.
- Add a coordinator-only `GET`/`PUT /api/coordinator/institution` with an editor card on the coordinator Profile ("Institution details"), audited.

### 18.5 Server day rules (one service, used everywhere)

Create `backend/src/services/dayRules.ts` and use it from the online time-in route, the offline time-in route (`routes/offlineTimeIn.ts` / `services/offlineAttestation.ts`), the lunch and end-break routes, the offline action ledger, and the hours computation. Rules (read numbers from `attendance_rules`, cache them for 60 s):

1. **Shift for the day:** the trainee's `ojt_schedule` row for that date (respect `ojt_pattern_week`). Lunch = the row's `lunch_start`/`lunch_end`; if both are NULL and the shift spans 12:00, use the defaults; if the shift does not span 12:00, there is no lunch.
2. **Early window:** a time-in earlier than `start - early_window_min` is refused with `409 { code: "TOO_EARLY", opensAt }`.
3. **Credited start:** `credited_from = max(time_in, scheduled start)`. Hours = `time_out - credited_from - lunch taken`. Existing logs with NULL `credited_from` keep the old formula.
4. **Late:** truncate seconds; late when `time_in > start + late_grace_min`; store `late_minutes` (0 = on time, NULL = no schedule).
5. **Afternoon-only (`session = 'pm'`):** if there is no log by the lunch start, the day is afternoon-only. The afternoon start is the lunch end. The early window applies to it (the time-in opens at lunch end minus 30 min). A time-in between lunch start and that opening is refused with `TOO_EARLY`. Lunch steps are refused on a `pm` session (`409 NO_LUNCH_ON_PM`). Lateness is measured against the lunch end.
6. **Shifts that do not span noon:** a shift starting at or after 12:00 is `pm` from the start and never marks the morning absent. A morning-only shift (ends by 12:00) is `am`, with two steps and no lunch.
7. **Holidays and unscheduled days:** time-in is allowed at any time. No early refusal, no late marking. `session = 'full'`, `credited_from = time_in` (as today).
8. **End break late:** store `lunch_late_minutes` when `break_end_time > lunch_end` (display only).
9. **Offline arrivals:** evaluate every rule at the step's `occurred_at` corrected by the measured clock gap (`clock_skew_seconds`, migrations 051/055). Vouchers must not assume a morning start: issue them for afternoon-only days too.
10. Return `session`, `credited_from`, `late_minutes`, `lunch_late_minutes`, `scheduled_start` and the day's computed `opensAt`, `lunchStart`, `lunchEnd`, `pmCutoff` on the attendance responses the student app reads, so the UI never re-derives rules.

### 18.6 Tests (backend `test/`)

Cover at least: refused before the window; 07:30–07:59 credited from 08:00; 08:00:59 on time; 08:01 late; no log by 12:00 → pm; 12:10 refused (opens 12:30); 12:40 pm credited from 13:00; 13:05 pm late; lunch refused on pm; a 13:00–17:00 shift; an 08:00–12:00 shift; a holiday; a two-week pattern day; an attested offline time-in at 07:20 phone time with +5 min skew (refused); half-day absences (`am` + `pm` allowed, `day` + `am` refused). Run `check:route-tests` for the new routes.

### 18.7 Docs

Update PAPER-CORRECTIONS (Late rule, step labels, session, ERD: 065–068) and the student Help text where it explains attendance (`lib/offlineHelp.ts` if it mentions times).

---

## 4. PHASE 19 — Brand kit v4 with the PSU seal (branch `iter-19-brand`)

### 19.1 Seal assets and rules

- Asset: `my-pwa/src/brand/assets/psu-seal.png`. Also export an optimised `psu-seal-96.png` and `psu-seal-192.png` with a build-safe script (sharp is acceptable if already present; otherwise do it once and commit the outputs).
- Component `brand/PsuSeal.tsx`: `size` prop, `alt="Pangasinan State University seal"`, `decoding="async"`, picks the right file for the size.
- Rules (put them in `BrandPreview.tsx` as a "Seal" panel and enforce them in components): never recolour, crop, rotate, outline, shadow or overlay; clear space = ¼ of the diameter; minimum 24 CSS px on screen, 12 mm in print; on dark chrome, place the seal on a white disc 112% of its size.
- **Co-brand lockup:** add a `withSeal` variant to `BrandLockup.tsx`: seal, a 1 px vertical hairline, then the INTERNet wordmark; seal height = 1.6 × wordmark cap height; a caption line under the wordmark: "Pangasinan State University · Lingayen Campus".
- Where the seal appears: splash, landing hero and footer, all three sign-in doors, onboarding first slide, Time Record header, printed/PDF reports (`lib/analyticsPdf.ts` cover), About section in Help. **Not** in the in-app header bar (it would compete with the role mark at 44 px).

### 19.2 Role palettes (role-scoped tokens)

Read `brand/tokens.ts` and `brand/roles.ts` first. Keep the current INTERNet icon primary as the shared brand colour. Add the role layers below as CSS custom properties set on a root `[data-role]` attribute by `roles.ts`: `--role-primary`, `--role-on-primary`, `--role-accent`, `--role-on-accent`, `--role-surface`, `--role-ink`, `--role-chrome`, `--role-on-chrome`, `--role-decor`. Status colours (success, warning, late, absent, info) stay identical across roles.

| Role | Name | primary (on-primary) | accent (on-accent) | surface | ink | chrome (on-chrome) | decor |
|---|---|---|---|---|---|---|---|
| Trainee | Sunpath | `#A84B0B` (`#FFFFFF`) | `#FFE047` (`#3A2A12`) | `#FFF8E8` | `#3A2A12` | `#FFF8E8` (`#3A2A12`) | `#F7AB15` |
| Supervisor | Laurel Ledger | `#0F6B5C` (`#FFFFFF`) | `#7FD1AE` (`#0E2A26`) | `#EEF6F2` | `#0E2A26` | `#FFFFFF` (`#0E2A26`) | `#F7AB15` |
| Coordinator | Royal Seal | `#0A28DD` (`#FFFFFF`) | `#FFE047` (`#0B1440`) | `#F1F3FB` | `#0B1440` | `#0B1440` (`#FFFFFF`) | `#B8C2FF` |

- Late / weekend semantic tokens (all roles): `--status-late-bg: #FDE8E7; --status-late-ink: #B42318; --weekend-tint: #FFF5F5`.
- Add a unit test that computes WCAG contrast for every text pair above and the status pairs, and fails below 4.5:1 (3:1 for text 24 px and larger). Decor colours are never used for text.
- `BrandPreview.tsx`: a "v4 palettes" panel showing the three roles side by side with their contrast figures.

### 19.3 Splash: "Seal to Route"

Rebuild `brand/SplashScreen.tsx`. Total 1.1 s:
1. 0–300 ms: role chrome fills the screen; the seal (on its white disc when the chrome is dark) fades in, 40 px, top third.
2. 300–800 ms: the INTERNet icon draws its route stroke (`stroke-dashoffset`, reuse the path from `RoadGlyph.tsx`) in `--role-primary`, ending on a `--role-accent` pin.
3. 800–1100 ms: the wordmark settles; the role name ("Trainee", "Supervisor", "Coordinator") appears beneath; 160 ms cross-fade into the app.

Rules: cold start in standalone mode only; skipped under reduced motion (show the end frame for 300 ms); never blocks longer than 1.2 s; footer line in small type: "A system proposal for Pangasinan State University – Lingayen Campus". Regenerate iOS start-up images per role with `scripts/make-startup-images.mjs` (extend it to take a role).

---

## 5. PHASE 20 — Trainee attendance and Time Record (branch `iter-20-attendance`)

Read first: `pages/student/TodayAttendance.tsx`, `DayStatus.tsx`, `nextStep.ts`, `useAttendance.ts`, `TimeInDialog.tsx`, `dailylog.tsx`, `components/DtrSheet.tsx`, `pages/student/TimeRecord.tsx`, `components/charts.tsx`.

### 20.1 Day banner (the blue card)

- Rename the steps per D1 everywhere on screen (`nextStep.ts`, dialogs, toasts, FAB, notifications text, offline "Waiting to send" labels, Help).
- **Two-page pager inside the card** on widths below 600 px. Page 1 "Morning": Time in, Lunch break. Page 2 "Afternoon": End break, Time out. At 600 px and wider, show all four tiles in one row.
- **Step tile:** at least 140 px wide; icon; one-line label (13 px semibold, never truncated, no ellipsis); recorded time below in tabular figures (15 px); state: waiting / done / late (`--status-late-*`) / early ("Counts from 8:00") / sent later (offline).
- Page 1 by default. Move to page 2 automatically once Lunch break is recorded, or after the lunch start.
- Swipe with `scroll-snap-type: x mandatory`, hidden scrollbar, `overscroll-behavior-x: contain`. **Also** a small "Morning | Afternoon" segmented switch above the tiles (tap, keyboard, screen reader), with `aria-controls` / `aria-selected`.
- **Before the window opens:** the Time in tile is disabled and shows "Opens 7:30" with a live countdown under 60 minutes.
- **Afternoon-only (`session = 'pm'`):** collapse to a single page: Time in, Time out; show a "Morning · absent" chip with a "File a reason" link (opens the absence form with `part = 'am'`).
- **Morning-only shifts:** a single page, Time in and Time out.
- Use the server-returned `opensAt`, `pmCutoff`, `late_minutes` and so on; do not re-derive rules on the client.

### 20.2 Attendance figure cards (replace the current cards)

Three cards, each with a comparison, a small chart from data already loaded, and a tap action:

| Card | Shows | Tap |
|---|---|---|
| Hours | Ring: verified / pending / remaining vs required; projected finish from `student_projections`, captioned "If you keep to your schedule". | Filter list to pending logs |
| On time | Share of on-time days over the last 20 scheduled days + a 20-dot strip (late = late tint, absent = hollow, half-day = half-filled). | Filter to late days |
| This week | Sunday–Saturday bars: scheduled hours as outlines, rendered as fills; today marked. | Scroll to this week |

Below 600 px: a snap row with hidden scrollbar, edge fades and three dots. 600 px and up: a three-column grid. Count-up animation once on first load (none under reduced motion). Skeletons keep CLS < 0.1 (`e2e/tests/first-page.spec.ts` must pass).

### 20.3 Time Record header (`DtrSheet.tsx`)

Do **not** change the record grid. Add above the trainee details, centred, stacked:

1. PSU seal, exactly 2 cm × 2 cm in print (`width: 20mm; height: 20mm`).
2. `republic_line`: Times New Roman 5 pt, uppercase.
3. `university_name`: font stack `'Old English Text MT', 'UnifrakturMaguntia', serif`, 22 pt, set in title case ("Pangasinan State University").
4. `campus_name`: Times New Roman 6 pt.
5. College name, upper-cased: Times New Roman 9 pt (from the trainee's program → college).
6. `programs.formal_name`: Times New Roman 8 pt italic. Fallback: the program text. If the trainee has no linked program, omit line 5.
7. `locality_line`: Times New Roman 5 pt.
8. "Daily Time Record" (current title style).
9. "On-the-Job Training · {Month YYYY}" (current subtitle style).

- Font stack for Times lines: `'Times New Roman', 'Liberation Serif', Times, serif`. Self-host UnifrakturMaguntia via `@fontsource/unifrakturmaguntia` (latin 400 only).
- Serve the header data from one endpoint, cached offline with the rest of the student's saved data.
- On screen, render the header inside a print-preview frame with a "Print size / Zoom 200%" toggle (5 pt is unreadable on a phone).
- **Trainee details block** below the header: name, student ID, program · block, company, supervisor, required hours, verified hours to date, certification line from `dtr_certifications`. All values are read live; after any attendance change the record re-queries (invalidate the same cache keys the Attendance page uses).
- **Signature line:** above "Signature over printed name of the trainee", show the active signature (SVG preferred, PNG fallback), max 45 mm × 15 mm. For a certified month, show the signature in `trainee_signature_id`.
- Coordinators' Students page: a filter "No linked program" so header gaps can be fixed.

### 20.4 Add signature (Profile)

- `components/SignaturePad.tsx`: pointer events (finger, stylus, mouse), smoothed quadratic strokes, Undo, Clear, Save; a "Turn your phone sideways for more room" hint in portrait; keyboard users get an "Upload an image of your signature" alternative (PNG/JPEG, re-encoded on the device with the existing image helper).
- Output: SVG path data plus a 600 × 200 transparent PNG. Refuse an empty pad.
- Routes: `GET /api/student/signature` (metadata + file), `PUT` (replace: revoke old, insert new), `DELETE` (revoke). Files go through `privateFileStore.ts`. Counts against the upload quota as kind `signature`.
- Access: the student; their supervisor when viewing that student's Time Record; coordinators (audited, with the 10-minute de-duplication rule).
- When a supervisor certifies a month, store the active signature id in `trainee_signature_id`.
- Add the signature to the student data download and a sentence to the privacy notice text in `services/privacy.ts`. **Do not change `version`** (D8). Log "bump privacy notice version" as a step for me.

---

## 6. PHASE 21 — Shell, notifications, schedule, profile (branch `iter-21-shell`)

### 21.1 Header overlap

In `brand/PortalHeader.tsx`, lay the header out as a three-track grid (`auto 1fr auto`) with `min-width: 0` on the middle track. Below 360 px the "Trainee" role pill becomes a role-coloured dot with `aria-label="Trainee"`. Extend `e2e/tests/resolution-icon.spec.ts`: at 320, 360 and 390 px wide, the role pill's and the Resolution Center icon's bounding boxes do not intersect.

### 21.2 Tooltips

In `components/Tooltip.tsx`, show tooltips only for `pointerType === 'mouse'` hover and `:focus-visible`. On touch, never show them: the icon acts at once and its name is the `aria-label`. Close any open tooltip on scroll, route change, `pointerdown` elsewhere and `Escape`, and after 1.5 s at most. Add an e2e test that tapping the bell on a touch viewport leaves no tooltip in the DOM after 300 ms.

### 21.3 Notifications: action vs info — migration 070 `notification_kinds.sql`

```sql
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kind VARCHAR(10),
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acted_at TIMESTAMP;
-- check kind IN ('action','info') NOT VALID
UPDATE notifications SET kind = CASE WHEN link IS NULL THEN 'info' ELSE 'action' END
WHERE kind IS NULL;
```

- Every place that writes a notification (find them all, likely through `services/notificationLinks.ts` / `liveNotifications.ts`) sets `kind` and `action_required`. Welcome, Supervisor assigned and system notices are `info`.
- `acted_at` is set when the trainee completes the expected act (for example, retaking the photo, submitting the task). Mark it from the route that performs the act.
- **Bell:** the Notifications tab shows `action` items, with an "Action needed" chip while `action_required` and `acted_at` is null. The **Announcements tab** shows coordinator announcements **plus** `info` notifications, newest first. Tapping one opens a dialog with the full text over a blurred backdrop (`backdrop-filter: blur(8px)` with a solid fallback), focus-trapped, `Escape` closes, and it is marked read.
- Supervisor assigned (info) dialog: secondary button "View supervisor contact" → Profile › Placement.
- Routing table (put it in `lib/notificationTargets.ts`; each target has a page and a `data-focus` key):

| Notification | Opens | Spotlight target | Expected act |
|---|---|---|---|
| Photo rejected | Attendance | Retake photo button + countdown | Retake |
| Log rejected / times corrected | Schedule › day sheet for that date | Decision block | Read / appeal |
| Forgot to time out | Attendance | Time out tile | Time out or missed time-out form |
| Task assigned / released | Tasks | Task card | Open |
| Task deadline | Tasks | Submit button | Submit |
| Requirement due / returned | Documents | Requirement row | Upload |
| Weekly report returned | Weekly report | Supervisor's note | Edit and resubmit |
| Appeal decided | Resolution Center | Appeal item | Read |
| Concern reply / message | Thread | Newest reply | Reply |

- **Spotlight** (extend `lib/useFocusRecord.ts`): after navigation, wait for the target to render (max 4 s). Then scroll it to centre, dim the rest to 40% with an overlay that has a cut-out, ease the target to scale 1.03 and pulse its outline in `--role-accent` three times over about 2.4 s. Hold a static 3 px outline until the user interacts or 4 s pass. Under reduced motion, show only the static outline. Never open the camera automatically.
- e2e: clicking a "Photo rejected" notification lands on Attendance with the Retake button focused/outlined; an info notification opens the dialog.

### 21.4 Floating action button (`TimeInFab.tsx`, `TimeInProvider.tsx`)

- Collapsed: a 56 px circle with the next step's icon, above the dock, inside `env(safe-area-inset-bottom)`.
- First pointer tap: expands to a pill "{Step} · Tap again" (`aria-expanded="true"`). It collapses after 4 s or a tap elsewhere.
- Second tap: navigate to Attendance and open that step's dialog directly (`TimeInDialog.tsx`), keeping the user gesture so the camera can open.
- Keyboard Enter/Space and screen readers: one activation performs the action (label "Time out, opens the time-out dialog").
- Hidden while a sheet, dialog or the on-screen keyboard is open; still hidden on Attendance and Profile.

### 21.5 Seamless horizontal areas (`lib/useScrollPane.ts`)

One shared rule set for every horizontal area (figure cards, day pager, filters, onboarding): snap points, `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`, 16 px edge fade masks shown only when more content exists in that direction, momentum scrolling, `overscroll-behavior-x: contain`. Extend `e2e/tests/sidebar-scroll.spec.ts` with one case per area.

### 21.6 Mobile navigation dock (`layouts/StudentLayout.tsx`)

- A floating dock inset 12 px from the left, right and bottom edges, 64 px tall, rounded 20 px, on `--role-chrome` with a hairline border and soft shadow, above `env(safe-area-inset-bottom)`.
- Slots: **Today · Attendance · Schedule · Tasks · More**. More opens a sheet: Documents, Weekly report, Resolution Center, Help.
- Icons always. Only the active item shows its label inside an expanding pill (200 ms width transition), so nothing compresses down to 320 px. Badges from `lib/navCounts.ts`.
- Hides on scroll down and returns on scroll up (threshold 12 px). Hidden while the keyboard is open. No scrollbar, no horizontal scrolling.
- Desktop layout unchanged apart from Schedule moving up in the same order.
- Update the PAPER-CORRECTIONS note that documents the student menu.

### 21.7 Month calendar (`ScheduleMonth.tsx`, `components/MonthCalendar.tsx`, `lib/studentCalendar.ts`, `sched.tsx`)

- Weeks start **Sunday** and end Saturday. Pattern weeks are still looked up per date with the Monday anchor.
- Weekend columns get `--weekend-tint` on the column background only; legend item "Weekend". Late is a dot, never a fill.
- Phone cells are at least 44 × 44 px: the date number plus one status dot only; today has a ring; the selected day has a `--role-primary` fill. No words in cells. No horizontal scroll at 320 px.
- "Tap a day for its details." is right-aligned **under** the Week | Month | My progress switch, outside the calendar. Remove the sentence "Weeks are counted from Monday, …". For two-week patterns only, an ⓘ button shows the Week 1 / Week 2 explanation.
- Footer: one legend row of five dots (Verified, Pending, Late, Absent, Holiday). On phones it collapses behind a "Legend" chip.
- Fix desktop and mobile layout together; check at 320, 360, 390, 768 and 1280 px.

### 21.8 Day details sheet (replaces the pop-up; remove "Go to Attendance")

A bottom sheet on phones (drag handle, swipe down to close) and a popover on desktop, both over a blurred backdrop, focus-trapped. Contents:
- **Heading:** weekday and date, status chip (Verified, Pending, Late, Absent, Morning absent, Holiday, Weekend, Not scheduled).
- **Schedule:** shift, lunch window, "Week 1 of 2" when relevant.
- **Times:** a 2 × 2 grid (AM In, AM Out, PM In, PM Out) with early and late marks and "Sent later" for offline steps.
- **Hours:** credited hours; "Waiting for your supervisor" while pending.
- **Context:** holiday name; absence and its status; tasks worked (`attendance_tasks`); the time-out note (one line, expandable).
- **Decision:** the supervisor's decision, reason or correction, with the appeal link while within 7 days.
- **Navigation:** previous and next day by swipe and by arrow buttons.

### 21.9 My progress (`ScheduleProgress.tsx`, `useProjections.ts`, `ProjectionLine.tsx`, `ProjectionHow.tsx`)

Replace the current rectangles with four panels, in this order:
1. **Burn-up chart:** cumulative verified hours (solid), pending (dashed), scheduled plan (thin), required hours (target line), projected-finish marker. Tap or hover shows the date and values. The caption is "If you keep to your schedule" and links to `ProjectionHow`.
2. **Milestones:** 25 / 50 / 75 / 100%, each with the date reached or projected.
3. **Change since last week:** "Projected finish moved N days earlier/later", from `student_projection_snapshots`.
4. **Rhythm strip:** a weeks × days grid shaded by hours rendered; late days dotted; half days split.

Use SVG, brand tokens only, accessible names and a text summary for each chart. It must work from saved data offline.

### 21.10 Profile, grouped (`pages/student/Profile.tsx` and the components it hosts)

On phones, a settings-style grouped list where each row opens a sheet. On desktop, two columns with a sticky group index. Groups and row hints:
1. **Header card:** initials, name, student ID, program · block, company, small completion ring.
2. **Account:** name, email, password, sign out other devices.
3. **Contact:** mobile, preferred contact, emergency contact ("Missing" when empty).
4. **Placement (read-only):** program, major, block, company, supervisor and their shown contact, required hours.
5. **Signature:** pad from 20.4 ("Not set" / date).
6. **Security and device:** passkeys (Phase 22), this device's push, install the app, offline readiness ("On"/"Off").
7. **Notifications:** per-category push and email.
8. **Privacy and data:** consent and version, read the notice, download my data.
9. **Completion:** checklist and "Request completion review" ("5 of 7").
10. Sign out.

Keep every existing form's behaviour and validation. Only regroup and restyle.

### 21.11 Overall phone pass (student portal)

At 320, 360, 390 and 430 px: no horizontal page scroll; 16 px side gutters; touch targets ≥ 44 px; labels short (one line where possible), with helper text only where the field's purpose is not obvious; every page has a one-line purpose under its title (≤ 70 characters); empty states say what to do next. Run the full axe sweep (`docs/baseline/tools/axe-sweep.mjs`) at phone and desktop width with sheets and dialogs open; fix every violation.

---

## 7. PHASE 22 — Passkeys for Lunch break, End break and Time out (branch `iter-22-passkeys`)

### 22.1 Migration 069 `passkeys.sql`

```sql
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR(50) NOT NULL,
  credential_id  TEXT NOT NULL UNIQUE,      -- base64url
  public_key     BYTEA NOT NULL,
  sign_count     BIGINT NOT NULL DEFAULT 0,
  transports     TEXT[],
  backed_up      BOOLEAN NOT NULL DEFAULT FALSE,
  device_label   VARCHAR(80),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMP,
  revoked_at     TIMESTAMP
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge   TEXT PRIMARY KEY,             -- base64url, single use
  student_id  VARCHAR(50) NOT NULL,
  purpose     VARCHAR(20) NOT NULL,         -- 'register' | 'step'
  valid_date  DATE,
  step        VARCHAR(12),                  -- 'break' | 'break-end' | 'time-out'
  issued_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_student ON webauthn_challenges (student_id, valid_date);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS step_verifications JSONB;
ALTER TABLE offline_action_ledger ADD COLUMN IF NOT EXISTS verification JSONB;
-- FKs NOT VALID to students(student_id), ON UPDATE CASCADE ON DELETE CASCADE.
```

### 22.2 Behaviour

- Packages: `@simplewebauthn/server` (backend) and `@simplewebauthn/browser` (frontend), exact versions.
- Relying party ID and origin come from `FRONTEND_URL` (and `CORS_ORIGINS`). Document this in `.env.example` and DEPLOY.md.
- **Register** from Profile › Security and device: platform authenticator, `userVerification: 'required'`, `residentKey: 'preferred'`. List devices with label, created and last used dates; allow removal (revoke).
- **Steps:** on Lunch break, End break and Time out, if the trainee has a passkey, request an assertion (`userVerification: 'required'`) **before** sending the step. Store `{ method: 'passkey' | 'none' | 'failed', at, credentialId }` per step in `attendance.step_verifications`. A cancelled or failed prompt still records the step as `failed` or `none` (D7). **Never block a step.**
- **Online:** the challenge comes from `POST /api/passkeys/step-challenge`, single use, 5-minute life.
- **Offline:** when the app collects vouchers (migration 055 flow), also issue three single-use step challenges per voucher day (`valid_date`, `step`). The phone stores them with the voucher and signs offline. The ledger sends the assertion with the step. The server verifies it on arrival, marks the challenge used and writes `offline_action_ledger.verification`.
- Single use rests on the **challenge**, not on `sign_count` (synced passkeys report 0). Still update `sign_count` when it increases, and reject only a decreasing non-zero count.
- **End break:** while `students.liveness_strict` is true, also run the camera check (standard prompts) at End break online. Offline, use a voucher prompt set as for time-in.
- **Supervisor view:** in the supervisor's log detail and attendance list, show a small mark per step: "Confirmed with passkey", "Not confirmed" (none/failed), "Sent later". This describes how the record was made; it is not a verification result.
- Tests: registration and assertion with a mocked authenticator (the simplewebauthn test helpers or a stubbed verifier); a challenge used twice is refused; a step with no passkey is accepted as `none`; an offline step with a valid pre-issued challenge is accepted on sync; an expired voucher-day challenge is refused but the step is still recorded as `failed` within the offline age limits.
- Add to DEPLOY.md under a new heading "Phone checks for passkeys": the steps I must run on a real Android phone and an iPhone with the app installed from the Home Screen.

---

## 8. PHASE 23 — Landing page, role doors, downloads, onboarding (branch `iter-23-landing`)

### 23.1 Architecture

- A second Vite entry: `my-pwa/landing.html` + `my-pwa/src/landing/` (multi-page build in `vite.config.ts`). It must **not** import the authenticated app, the camera tracker or the offline store. Pre-render to static HTML at build.
- `vercel.json`: `/` serves the landing page; the role apps live under `/student/…`, `/supervisor/…`, `/coordinator/…` as today. `/login` redirects to `/#doors` (keep password-reset links working: check `ForgotPassword.tsx` and the reset link builder that uses `FRONTEND_URL`). Keep the existing CSP headers. If the landing page needs a new source (fonts, images), self-host it.
- The service worker precaches `landing.html` so `/` opens offline. Do not let the SW navigation fallback send `/` to the app shell.
- Add `/` to `e2e/lighthouse/run-lighthouse.mjs` and the axe sweep. Budget: LCP < 2.5 s (Lighthouse mobile), CLS < 0.1, landing JS < 90 kB gzipped.

### 23.2 Landing page content (design: editorial, real product, not generic)

Avoid gradient blobs, glassmorphism, stock 3D illustrations, emoji icons and invented statistics. Use an asymmetric grid, real UI fragments rendered from the app's own components or faithful static recreations, and brand tokens only. Show the co-brand lockup with the seal in the top bar.

1. **Top bar:** co-brand lockup (seal + INTERNet); nav links **Trainee**, **Supervisor**, **Coordinator** (each goes to that role's door), **Get the app**, **Help**. On phones it becomes a menu sheet.
2. **Hero:** "From first time-in to final hour." with a one-line subtitle about OJT attendance, tasks and records for PSU Lingayen. A route line draws across the hero on load and passes four stations (Time in · Lunch break · End break · Time out). A phone frame beside it shows the day banner advancing in step. A large seal watermark at 6% opacity sits behind the right column (respecting clear space). Primary button "Choose your portal", secondary "Get the app".
3. **Three doors (`#doors`):** one card per role in its palette, with a one-line promise, "Sign in" and "Get the app". Cards tilt slightly toward the pointer on desktop (max 4°, off under reduced motion) and stack on phones.
4. **How a day works:** sticky scroll story. The phone frame stays pinned while four steps scroll past, each swapping the screen it shows.
5. **What the system checks:** camera check at time-in; signed offline time-in; supervisor confirmation; audit log; privacy notice and data download; passkey confirmation. Make only claims that are true of the code (no "WCAG compliant", no "works fully offline", no "AI").
6. **Download (`#download`):** see 23.3.
7. **Questions:** native `<details>`: offline use, which phones work, privacy, who to contact.
8. **Footer:** co-brand lockup; "A system proposal for Pangasinan State University – Lingayen Campus"; columns Portals (three doors), Get the app, Help, Privacy notice, Contact the OJT office; bottom row: "© 2026 INTERNet", build version, "Lingayen, Pangasinan".

**Motion:** CSS scroll-driven animations (`animation-timeline: view()`) with an IntersectionObserver fallback. No WebGL and no animation library. Every effect has a reduced-motion end state.

### 23.3 Download module — one app per role and device

- Three new manifests beside the **unchanged** `public/manifest.json` (do not change its `id`: existing installs depend on it): `manifest-student.webmanifest`, `manifest-supervisor.webmanifest`, `manifest-coordinator.webmanifest`. Each has a distinct `id` (`/student/`, `/supervisor/`, `/coordinator/`), `name` ("INTERNet Trainee" / "INTERNet Supervisor" / "INTERNet Coordinator"), `short_name`, `start_url`, `scope`, `theme_color` and `background_color` from the role palette, role-tinted icons (192/512, any + maskable), and role shortcuts.
- Each door page and each role app shell links its own manifest. Extend `scripts/check-pwa.mjs` to validate all four.
- Module UI: a role switch (Trainee / Supervisor / Coordinator) and a device switch preselected by detection (user-agent client hints, user-agent fallback):
  - **Android:** "Install" button using `beforeinstallprompt` (`useInstallPrompt.ts`) on that role's door; if unavailable, the Chrome menu steps.
  - **iPhone / iPad:** three illustrated steps (Safari → Share → Add to Home Screen), with a warning when not in Safari.
  - **Desktop:** Chrome/Edge install button; macOS Safari "Add to Dock"; plus a **QR code** that opens the role's door on a phone (package `qrcode`, generated client-side).
- Text must say these are installable web apps.

### 23.4 Three sign-in doors (one auth API)

Routes `/student/sign-in`, `/supervisor/sign-in`, `/coordinator/sign-in`, all calling the existing sign-in endpoint with unchanged password rules, lockouts and token life. The door sets the palette and the expected role. After a successful sign-in with a different role, redirect to that user's own portal. **Never reveal whether an email exists in another role.** Each door shows the seal.

| Door | Strategy | Layout |
|---|---|---|
| Trainee · "Badge-in" | Phone-first, one hand | Sunpath palette; ID-card motif with the seal at the card's corner; one field accepting Student ID or email, then password; primary button in the thumb zone; "Use passkey" once the device has one (Phase 22: add a passkey sign-in route only if the existing auth can issue a token for a verified credential without other changes; otherwise show nothing and log it); iPhone install hint. |
| Supervisor · "Desk" | Calm, work-email first | Laurel Ledger; split view on tablet/desktop: left panel previews "Your review queue" with a static example; right panel holds the form; the help line names the OJT coordinator (email reset may be off). |
| Coordinator · "Console" | Desktop-first, institutional | Royal Seal dark chrome; large co-brand lockup with the seal on its white disc; a status strip that shows only "Service reachable" (from `/api/health`), nothing else before sign-in. |

Keep `ForgotPassword.tsx` and `ChangePassword.tsx` working from all three doors, themed per role.

### 23.5 Onboarding carousel (per role, mobile, installed app)

Shown on the first open in standalone mode, once per role per device, versioned (`internet.onboarding.{role}.v1` in localStorage, read and written inside try/catch). Four slides; Skip; swipe and Next/Back buttons; dots; the seal on slide 1. Permission primers ask only after a tap. Nothing triggers a native prompt on load.

| Role | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Trainee | Your day in four taps | The camera check and your privacy | No signal? It still counts | Turn on reminders |
| Supervisor | Your review queue | Verify, or reject the photo or the day | Record a time-in in person | Notifications |
| Coordinator | The Action list | Filters and saved views | Flagged logs and appeals | What is switched on |

Each slide: a title of 6 words or fewer, one sentence of 20 words or fewer, and a real UI fragment as the visual.

### 23.6 Architecture diagram and PR notes

- Make sure every new route, the landing entry, the role manifests, passkeys and signatures are picked up by the Mermaid generator from Iteration 17. Regenerate it and remove any older gitdiagram image from `docs/`.
- Write one PR description per branch in `docs/pr/iter-18.md` … `iter-23.md`: summary, migrations, screens changed, tests, and steps for me.

---

## 9. Final verification and report

1. Run the full test list from Section 0, rule 6, on the last branch.
2. Lighthouse mobile and the full axe sweep with the Iteration 0 settings. Write the before/after comparison to `docs/PROGRESS-ITER-18-23.md`.
3. Walk the student portal at 320 / 390 / 768 / 1280 px and the landing page and three doors at 390 / 1280 px with Playwright screenshots saved to `docs/screens/iter-18-23/`. Look at them and fix anything that overlaps, truncates or scrolls sideways.
4. Finish the progress log with:
   - one line per role: what changed for that user;
   - **Steps for me** (not done by you): real-phone checks (offline time-in, passkeys on Android and an installed iPhone app, install of each role app); bump the privacy notice version with the approved text (D8); take a database backup before deploying migrations 065–070; set nothing new on Railway unless a step above says so.
5. Stop. Do not push.
