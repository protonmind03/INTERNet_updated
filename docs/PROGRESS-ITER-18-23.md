# Progress log: Iterations 18 to 23

The brief is `docs/INTERNet-Iterations-18-23-Prompt.md`. One branch per phase, each cut
from the one before: `iter-18-rules` (from `ui-redesign` 6091b25, which added the seal),
`iter-19-brand`, `iter-20-attendance`, `iter-21-shell`, `iter-22-passkeys`, `iter-23-landing`.
Nothing is pushed or deployed. To resume, find the first phase below whose items are not
all ticked, check out its branch (or cut it from the last finished one), and carry on.

Migrations: the 18 October tree ended at `064_backup_runs.sql`, as the brief expected, so
the new ones keep the brief's numbers 065 to 070.

## Task list

### Phase 18: rules and data foundation (`iter-18-rules`)
- [x] 18.1 migration 065 attendance_day_rules
- [x] 18.2 migration 066 absence_parts, every absence write updated
- [x] 18.3 migration 067 student_signatures
- [x] 18.4 migration 068 institution_profile, program formal names, institution API and card
- [x] 18.5 services/dayRules.ts used by every attendance route
- [x] 18.6 tests
- [x] 18.7 docs (PAPER-CORRECTIONS, help text)
- [x] test run and commit

### Phase 19: brand kit v4 with the seal (`iter-19-brand`)
- [x] 19.1 seal assets, PsuSeal, co-brand lockup, Seal panel
- [x] 19.2 role palettes, contrast test, v4 palettes panel
- [x] 19.3 splash "Seal to Route", start-up images per role
- [x] test run and commit

### Phase 20: trainee attendance and Time Record (`iter-20-attendance`)
- [x] 20.1 day banner
- [x] 20.2 figure cards
- [x] 20.3 Time Record header
- [x] 20.4 signature
- [x] test run and commit

### Phase 21: shell, notifications, schedule, profile (`iter-21-shell`)
- [x] 21.1 header overlap
- [x] 21.2 tooltips
- [x] 21.3 notification kinds (migration 070), bell tabs, spotlight
- [x] 21.4 floating action button
- [x] 21.5 horizontal areas
- [x] 21.6 mobile dock
- [x] 21.7 month calendar
- [x] 21.8 day details sheet
- [x] 21.9 My progress
- [x] 21.10 Profile grouped
- [x] 21.11 phone pass and axe sweep
- [x] test run and commit

### Phase 22: passkeys (`iter-22-passkeys`)
- [x] 22.1 migration 069
- [x] 22.2 registration, step assertions, offline challenges, supervisor marks, tests, DEPLOY.md
- [x] test run and commit

### Phase 23: landing, doors, downloads, onboarding (`iter-23-landing`)
- [x] 23.1 second Vite entry, vercel.json, service worker
- [x] 23.2 landing content
- [x] 23.3 role manifests and download module
- [x] 23.4 three sign-in doors
- [x] 23.5 onboarding carousel
- [x] 23.6 architecture diagram and PR notes
- [x] final verification and report

## Decisions made during the run

(Each one: what was unclear, what I chose, why.)

### Phase 18
- **Tests at any hour.** The rules depend on the time of day, and the suites run at whatever
  hour CI does. The pure rules (services/dayRules.ts) are tested at the brief's exact times
  (07:30, 08:00:59, 12:10 ...). The route tests build each throwaway student's shift around
  the current Philippine time, and skip only within about three hours of midnight. The
  existing test "an offline break, return and time-out ..." took its steps on the demo
  student, whose 08:00 to 17:00 weekday schedule now makes any afternoon run an
  afternoon-only day with no lunch; it now uses a throwaway student with no schedule (the
  rules do not apply), with every assertion unchanged.
- **The supervisor's in-person time-in** follows the rules for session, credited start and
  late, but is never refused as too early (the supervisor is there); before the window it is
  credited from the start.
- **Lunch on morning-only shifts** is refused too (409 NO_LUNCH_ON_AM), as "two steps, no
  lunch" says, unless the schedule gives that day a lunch window of its own. The same holds for
  an afternoon shift with its own lunch window. A log from before the rules (session NULL) keeps
  its lunch steps.
- **Offline time-ins**: the rules are judged at the phone's time less its clock gap; the time
  stored is still the time the phone sent (as before), and credited_from is the later of that
  and the start. Vouchers were already issued per scheduled day with no morning assumption, so
  afternoon-only days have them; nothing changed there.
- **Late minutes** count from the scheduled start; the grace only decides whether it is late
  (grace 5: 08:06 is late by 6).
- **Supervisor time corrections and appeals** recompute credited_from, late_minutes and
  lunch_late_minutes on logs the rules applied to, and leave older logs as they were.
- **Lunch windows** can be sent per schedule day (`lunch_start`/`lunch_end`, both or neither,
  inside the shift) through the existing schedule routes. The coordinator's schedule editor does
  not show them yet; the defaults apply until it does. Logged as a suggestion.
- **Half-day absences**: a half may be filed for a day with a log only when the log is the other
  half (an afternoon-only log leaves the morning). Only whole-day excused absences skip a day in
  the projection. The trigger raises SQLSTATE 23505, so every writer treats it as a duplicate.
- **Institution endpoint** lives in routes/institution.ts; the seal_asset stays 'psu-seal' (not
  editable).

### Phase 19
- **No image library** (sharp is not in the project). scripts/png.mjs reads and writes PNG in
  plain Node (it also reads palette PNGs, which the seal is); make-seal-sizes.mjs wrote
  psu-seal-96.png and psu-seal-192.png once and they are committed.
- **The seal's white corners** are background, not seal: the image is clipped to its circle
  (CSS border-radius) so the white disc on dark chrome shows the seal's own edge. Nothing else
  is done to the image.
- **Role layer applied** by each portal layout (useRoleTheme) and by the splash; the sign-in page
  stays on the brand navy until the three doors (Phase 23). Existing components keep their
  colours; the --role-* properties are used by the new work from Phase 20 on.
- **Status colours**: the brief gave only late; success, warning, absent and info were chosen to
  pass 4.5:1 on their tints (6.7 to 7.6:1).
- **Splash timing**: the fade starts at 1040 ms and ends at 1200 ms, so the 1.1 s story plus the
  160 ms fade stays inside the 1.2 s limit. It no longer waits for the first page ("inb:ready"
  events are now ignored by it). Under reduced motion: the end frame, 300 ms.
- **Seal on the current sign-in screen** already (beside the INTERNet mark), before the doors.
- **Per-role start-up images** are in public/startup/<role>/ (not precached, like the others);
  the role apps link them in Phase 23.

### Phase 20
- **Step tiles are the buttons.** The next step's tile (and Time out, since lunch is optional)
  is the button, named by its step ("Time in", "Lunch break" ...); recorded tiles are read-only
  groups. Before the window opens the Time in tile is a disabled button that says when it
  opens, with a countdown in the last hour.
- **Session before a time-in** is shown from the server's plan: a morning or afternoon shift, or
  "afternoon only" once the server's pmCutoff has passed. The app compares the clock with the
  times the server sent; it works out no rule itself.
- **On time card**: late is the server's late_minutes; a log from before the rules (null) counts
  as on time. Half days are logs with session am/pm on a shift that spans noon. The client's
  old LATE_AFTER_MINUTES (15) is still used by the Schedule page's progress tab and the
  supervisor's intern page until Phase 21 replaces the progress tab; noted for the supervisor
  page as a suggestion.
- **"File a reason"** opens Attendance at #absences with the absence form already set to the
  morning (?absence=am); the form gained "Part of the day".
- **Header data and signatures** come from new routes in routes/timeRecord.ts:
  GET /api/time-record/:studentId/header, GET/PUT/DELETE /api/student/signature,
  GET /api/students/:studentId/signature (?id= for a certified month's). They are registered
  before GET /api/student/:studentId, which would otherwise catch /api/student/signature.
- **Signature upload** is JSON (svg_paths + a PNG data URL, at most 70 kB) rather than
  multipart: the device always makes the 600 x 200 PNG, from the pad or from an uploaded image
  it redraws (lib/image.ts withoutCameraDetails, then fitted). It counts in upload_ledger as
  kind "signature".
- **Coordinator's signature reads** are audited as signature.view, once in ten minutes.
- **Time Record on screen**: "Print size" draws the sheet at its real size inside a grey frame;
  "Zoom 200%" uses CSS zoom on the sheet, and print ignores the frame.
- **Seal on the record** is 76 CSS px on screen (20 mm at 96 dpi) and exactly 20 mm in print.
- **e2e at any hour**: helpers.ts gained timeInClosed() (the three journeys that time the demo
  students in skip, as they already did for "already has a log today", when the server says the
  window is closed) and shiftAroundNow() (capture.spec's own student gets a shift open now).
- **docs/ARCHITECTURE.md** regenerated (CI's --check would fail after Phases 18 and 20 added
  routes).

### Phase 21
- **Notification kinds** are decided in one place (services/notificationKinds.ts) from the
  title the server already writes; writers may override. "Action needed" is only for acts the
  trainee does (retake, time out, submit, upload, resubmit, reply); a decision to read ("log
  rejected", "times corrected", "appeal decided") is an action without the chip. acted_at is set by
  the photo redo, time-out and missed time-out, task submission, document upload, weekly report
  save, concern reply and message reply routes.
- **Appeal decided** opens the log on Attendance: a trainee's appeals live on their logs
  (pages/student/Appeals.tsx); the Resolution Center has no appeals tab.
- **Spotlight** is one module (lib/spotlight.ts) reached by ?spot=<key> (data-focus) and by the
  existing ?focus=<kind>-<id>; it focuses the target when it can take focus and never presses it.
- **FAB second tap** opens the step's dialog at once on the current page (keeping the tap for the
  camera) and goes to Attendance when the dialog closes; navigating first would unmount the dialog
  and lose the tap.
- **Dock badges** come from lib/navCounts.ts; More's badge is the sum of its items'.
- **Calendar at 320 px**: 44 px cells and 16 px gutters cannot both fit seven columns, so the grid
  alone runs nearly edge to edge (6 px) on phones; everything else keeps the gutters.
- **Day sheet** uses its own focus trap and a portal; the old Modal is not used there. The shared
  Modal gained a focus trap and the 8 px blurred backdrop for every dialog.
- **My progress** draws the scheduled plan from the saved schedule and the projection from the
  saved /projection answer, whose new `history` (the last 60 daily snapshots) gives "Change since
  last week".
- **Profile**: no route exists to sign out other devices alone; changing the password already does
  it, so the Account group says so. Groups: Account, Contact, Placement, Signature, Security and
  device (passkeys added in Phase 22), Notifications, Privacy and data, Completion, then Sign out.
- **Day rules after validation**: the camera time-in now reads the photo and the camera check, then
  applies the window, then spends the ticket; the offline time-in reads the attested record, then
  the window, then spends the voucher. A time-in refused as too early keeps its ticket or voucher.
- **Tests at night**: the existing "camera-check ticket is spent" test moved to a throwaway trainee
  with no schedule; the attested offline test's trainee is scheduled all day (00:00 to 23:59, lunch
  23:57). Three of my route tests skip between about 23:00 and 02:00 (they build a shift around
  now); the pure rule test covers those times.
- **Pre-existing, not changed**: between 00:00 and about 01:30 "a time-in recorded with no
  connection ..." (API) and the pictures e2e tests fail because a time-in made "90 (or 60) minutes
  ago" falls on the previous day. They passed in every daytime run.

### Phase 22
- **Package versions**: @simplewebauthn/server 13.3.3 and @simplewebauthn/browser 13.3.0, exact.
  14.x (2 September 2026 onward) is newer than I can vouch for; 13.x has the same flow.
- **Relying party**: rpID is FRONTEND_URL's host; expected origins are FRONTEND_URL and every
  CORS_ORIGINS entry. Documented in backend/.env.example and DEPLOY.md.
- **Challenges**: register 5 minutes; online step 5 minutes; voucher-day step challenges are good
  for their day (valid_date must equal the log's date) and up to 72 hours. A fresh set of three is
  handed out each time the phone asks for vouchers (it asks again when the connection returns).
  The purpose check allows 'login' too, kept for the doors in Phase 23.
- **Verification failures** are recorded as method 'failed' with a short reason (shown to the
  supervisor as a tooltip); the step is never refused.
- **The prompt's timing**: the step's challenge is fetched as its confirm dialog opens, so the
  screen lock is asked for within the same tap as Confirm.
- **Whether to ask**: the phone remembers that the trainee has a passkey (Profile's list, or the
  vouchers carrying challenges), so it asks only then, online or offline.
- **End break on the strict level** runs the camera check online with the standard prompts, using a
  ticket whose purpose (break-end-check) cannot time anyone in; no photo is kept. The result is
  stored in step_verifications['break-end'].camera: passed, failed, missing (skipped online) or
  offline. **Not done: the offline End break camera check** with a voucher prompt set. The time-in
  voucher is spent by the time-in, and reusing its prompts would let one recording pass both; a
  second per-day voucher for End break would need its own attestation path. Offline End break on
  the strict level is recorded as camera "offline" and the supervisor sees "not run (no
  connection)". Listed under Steps for me as a decision.
- **Tests**: a software authenticator in the API tests (a real P-256 key, a CBOR "none"
  attestation, signed assertions) covers registration, a confirmed step, a replayed assertion
  (failed, step kept), no passkey ('none'), a counter that goes back, the supervisor's list, an
  offline step with a voucher challenge (accepted on arrival) and a voucher challenge used on
  another day (failed, step kept), and the End break camera check.

### Phase 23
- **The landing page is index.html; the app moved to app.html.** The brief names a second entry
  `landing.html` with "/" serving it. On Vercel the file system is checked before rewrites, so "/"
  would always serve index.html (the app) and a rewrite of "/" to landing.html would never apply.
  So the landing page is index.html and the app is app.html; every other address that is not a file
  is rewritten to /app.html. `vite dev` and `vite preview` do the same through a small middleware in
  vite.config.ts, and the axe/Lighthouse server (docs/baseline/tools/serve-like-vercel.mjs) too.
- **Pre-rendering**: a Vite plugin renders src/landing/render.tsx with `renderToStaticMarkup` (a
  temporary Vite server's ssrLoadModule) into index.html before Vite reads the page for its files,
  so the seal's <img> is bundled with a hashed name. The browser gets plain HTML and one 4.2 kB
  (compressed) script; React is not shipped to the landing page. check-pwa.mjs measures it (budget
  90 kB) and fails if the landing page loads the app's script.
- **Service worker**: the landing page registers the same worker (production builds only), which
  keeps index.html and app.html. With no connection "/" is answered with index.html and every
  other address with app.html, never one for the other.
- **Role manifests' scope is "/"**, not /student/ etc. The trainee's pages (/daily-log, /task,
  /schedule, ...) are not under /student/, and a narrower scope would open them outside the installed
  app's window. Each has its own id (/student/, /supervisor/, /coordinator/), so the three install
  side by side. start_url is the role's door, which opens the portal for someone signed in.
  public/manifest.json and its id "/" are unchanged.
- **Which manifest a page links**: app.html links manifest.json; the doors and each portal swap the
  link to the role's manifest (brand/useRoleTheme.ts, with the palette). The landing page links
  none: installing happens at a door. The Download module's Install sends Android and desktop
  browsers to the door with ?install=1, where the browser's own Install is offered (or its menu
  steps shown).
- **Role icons**: the app icon with its navy tile recoloured to the role's primary colour
  (scripts/make-role-icons.mjs); kept in public/icons and left out of the offline precache.
- **Door redirect for a different role**: each door posts to its own role's endpoint, as before.
  Trying the other roles' endpoints after a failure was not done: it would triple the failed-login
  count per attempt and could tell someone which role an address has. Someone already signed in (any
  role) who opens any door is taken to their own portal. The failure message is the role
  endpoint's own ("Invalid supervisor email or password."), which says nothing about other roles.
- **Passkey sign-in: not added, nothing shown.** A sign-in challenge has no trainee yet, and
  webauthn_challenges.student_id is NOT NULL with a foreign key to students (migration 069). Issuing
  a login challenge would need a schema change (a migration 071 making it nullable, or a separate
  table), which the brief's condition rules out. The doors show no "Use passkey".
- **"/" inside the app** (sign-out, an expired session, a portal page opened signed out) goes to the
  door used last on this device (the trainee's when none), or to the portal of whoever is signed in.
  The session guard and the error screen send people to their role's door.
- **Supervisor slide title** shortened to "Verify, or reject photo or day" (six words); the brief's
  "Verify, or reject the photo or the day" is eight, and the brief also asks for six at most.
- **Coordinator door status**: only "Service reachable", shown once /api/health answers; nothing is
  shown while it is unreachable (the brief allows only that one line).
- **Contact and privacy**: no office phone or email is invented. The footer's "Privacy notice" and
  "Contact the OJT office" open two new Help sections that say where each thing is.
- **qrcode 1.5.4** (exact), loaded only when the Computer device is chosen. It ships no types; a
  small declaration (src/landing/qrcode.d.ts) covers the one call used, so no @types package.
- **Onboarding** shows only in standalone mode. The e2e tests make the page report standalone
  (matchMedia) to test it; the Playwright test also counts Notification.requestPermission calls (0).
- **Architecture diagram**: the generator also reads the app's pages (vite.config.ts inputs), the
  doors (App.tsx) and the manifests, and shows passkeys' outside system (the phone's screen lock).
  There was no older gitdiagram image in docs/ to remove.

## Phase reports

### Phase 18 (branch iter-18-rules)

**Changed.** Backend: migrations 065_attendance_day_rules, 066_absence_parts,
067_student_signatures, 068_institution_profile; new services/dayRules.ts and
routes/institution.ts; server.ts (camera time-in, supervisor in-person time-in, lunch and end
break, hours at time-out and missed time-out, time corrections, the student's attendance list
returns `today` and the rule columns); routes/offlineTimeIn.ts; routes/appeals.ts (restored
times); routes/extensions.ts (absences with part; lunch windows on the supervisor's schedule
read); routes/programme.ts and services/schedules.ts (lunch windows); routes/academics.ts,
services/academics.ts (formal_name); services/audit.ts (formal_name, institution.edit);
services/photoRedo.ts (whole-day absence, never beside a half); services/insights.ts (only
whole-day absences skip projection days). App: coordinator Programs (Formal name),
InstitutionCard on the coordinator Profile, Help "Attendance times", lib/offlineHelp.ts.
Docs: PAPER-CORRECTIONS (new section; the Feature 3 wording and Late notes rewritten),
UX-PASS, DEVELOPING (offline table row).

**Migrations.** 065 to 068 (numbering as in the brief: the tree ended at 064).

**Tests.** backend lint: passed. check:route-tests: all 236 routes named. API: 248 passed,
0 failed (10 new: rules at exact times, lunch windows, routes refused/credited/late, the
afternoon-only day, offline judged at the corrected time, two-week pattern day, half-day
absences, institution, formal names). App lint and build: passed. check:pwa: 58 passed.
e2e: 67 passed (run at about 19:00 Philippine time on a Monday).

**Skipped.** Nothing.

### Phase 19 (branch iter-19-brand)

**Changed.** my-pwa/src/brand: PsuSeal.tsx (new), BrandV4Panels.tsx (new: Seal and v4 palettes
panels), useRoleTheme.ts (new), assets/psu-seal-96.png and -192.png (new), tokens.ts
(ROLE_PALETTES, STATUS_COLORS, WEEKEND_TINT, SEAL, contrast helpers), brand.css (role and
status custom properties, seal classes, splash), roles.ts (applyRoleTheme), BrandLockup.tsx
(withSeal), SplashScreen.tsx ("Seal to Route" and the new LaunchGate), BrandPreview.tsx,
LoginScreen.tsx (seal), index.ts. Layouts: the three portal layouts set the role layer.
lib/analyticsPdf.ts (seal on the cover). pages/Help.tsx (About with the seal). Scripts: png.mjs,
make-seal-sizes.mjs (new), make-startup-images.mjs (takes a role); public/startup/<role>/ (33
images). Tests: three new API-suite tests (contrast of every pair, brand.css matches tokens.ts,
the seal's sizes and rules). Docs: UX-PASS, PAPER-CORRECTIONS.

**Migrations.** None.

**Tests.** backend lint, route check: passed. API: 251 passed. App lint, build: passed.
check:pwa: 58 passed. e2e: 67 passed.

**Skipped.** Nothing.

### Phase 20 (branch iter-20-attendance)

**Changed.** Backend: routes/timeRecord.ts (new), server.ts (registration, lunch step messages
renamed, "no-program" filter on the students list), routes/extensions.ts (certification keeps
trainee_signature_id; signatures in the data download), services/audit.ts (signature.view),
services/uploadQuota.ts (kind signature), services/privacy.ts (one sentence; version still
draft-4). App: pages/student/TodayAttendance.tsx (rebuilt day banner), FigureCards.tsx,
SignatureCard.tsx (new), dailylog.tsx (cards, Late filter, #absences), Absences.tsx (part of the
day, ?absence=am), useAttendance.ts (today's plan and rule fields), nextStep.ts (STEP_NAMES),
TimeInProvider.tsx, DayStatus.tsx, PhotoRedo.tsx, WaitingToSend.tsx, Profile.tsx;
components/DtrSheet.tsx, DtrHeader.tsx (new), SignaturePad.tsx (new); lib/timeRecordHeader.ts,
lib/signature.ts (new), lib/offlineQueue.ts, lib/timeColumns.ts; supervisor ReviewDetail,
InternPage, TimeRecord; coordinator Students (No linked program), RecordSections (viewer);
brand.css (banner, tiles, cards, snap row, Time Record). Package: @fontsource/unifrakturmaguntia
5.3.0 (exact). Tests: 3 new API tests; existing tests' step labels updated; e2e helpers and three
journeys and capture.spec as described. Docs: UX-PASS, PAPER-CORRECTIONS, ARCHITECTURE.md.

**Migrations.** None (067 and 068 from Phase 18 are used).

**Tests.** backend lint and route check (241 routes): passed. API: 254 passed. App lint, build:
passed. check:pwa: 58 passed. e2e: 67 passed. Screens checked at 320, 390 and 1280 px: no
horizontal scroll (a screen-reader summary inside the off-screen cards had widened the page; each
card is now its containing block).

**Skipped.** Nothing.

### Phase 21 (branch iter-21-shell)

**Changed.** Backend: migration 070_notification_kinds; services/notificationKinds.ts (new);
server.ts (kinds written, ?kind= on the list, acted_at from the act routes, window checked after the
camera check is read); routes/extensions.ts, messages.ts (acted_at); routes/offlineTimeIn.ts (window
after the attested record); routes/projections.ts (history). App: brand/PortalHeader.tsx (grid, role
dot); components/Tooltip.tsx (rebuilt), NotificationBell.tsx, TraineeAnnouncements.tsx (new),
ui.tsx (Modal focus trap, blurred backdrop), StudentDock.tsx (new), MonthCalendar.tsx (rebuilt),
DaySheet.tsx (new), folder/FolderShell.tsx (phoneTabs); lib/spotlight.ts (new),
notificationTargets.ts (trainee routing table), useFocusRecord.ts, useNotificationFeed.ts,
useNotifications.ts, studentCalendar.ts (Sunday weeks, half-day absences, dayStatus);
layouts/StudentLayout.tsx (dock, order, spotlight); pages/student TimeInFab.tsx (two taps),
ScheduleMonth.tsx, ScheduleProgress.tsx (rebuilt), sched.tsx, Profile.tsx (grouped),
ProfileGroups.tsx (new), PhotoRedo.tsx, task.tsx, Journal.tsx, document.tsx, TodayAttendance.tsx,
FigureCards.tsx (data-focus, focusable rows); brand.css. Tests: API (kinds, routing table, the
bell's lists and acted_at); e2e shell.spec.ts (new: no tooltip after a tap, photo-rejected
spotlight, info dialog), resolution-icon.spec.ts (no overlap at 320/360/390), sidebar-scroll.spec.ts
(sideways rows), student-folder.spec.ts (the dock), and updates where screens moved (FAB two taps,
dock, Profile groups via openProfileGroup, calendar sheet, progress panels). Docs: UX-PASS,
PAPER-CORRECTIONS (menu note rewritten; bell; notifications ERD; calendar; FAB), ARCHITECTURE.md.

**Migrations.** 070.

**Tests.** backend lint and route check: passed. API: 257 run; 254 passed, 1 failed (the
pre-existing midnight case above), 2 skipped (near midnight). App lint and build: passed.
e2e: daytime-equivalent run 71 passed and 1 flaky before the last fixes; the last full run, which
crossed midnight, had 4 failures, all the pre-existing midnight cases (pictures, the offline
journey) and 1 flaky (capture, the day changed under it). The Phase 21 specs then passed with no
retries (12 of 12). Axe sweep (WCAG 2.1 A and AA, 390 and 1280 px, 572 states with menus, tabs and
dialogs open): 31 findings on Attendance and the calendar (the banner clock chip and pager switch
contrast, the snap rows not focusable, other-month day numbers), all fixed; the sweep is re-run in
the final verification. Phone pass: every student page at 320, 360, 390 and 430 px has no
horizontal scroll.

**Skipped.** Nothing in the brief; see the decisions above for the two judgement calls (FAB, gutters).

### Phase 22 (branch iter-22-passkeys)

**Changed.** Backend: migration 069_passkeys; services/passkeys.ts and routes/passkeys.ts (new);
server.ts (routes registered; Lunch break, End break and Time out record how they were confirmed;
End break camera check; the supervisor's list returns step_verifications);
routes/offlineTimeIn.ts (voucher-day step challenges); .env.example. App: lib/passkeys.ts (new),
pages/student/PasskeysCard.tsx and EndBreakCheck.tsx (new), TimeInProvider.tsx (confirmation sent
with each step, challenge fetched as the dialog opens, End break camera check), useAttendance.ts,
lib/offlineTimeIn.ts (keeps the challenges), Profile.tsx; components/StepMarks.tsx (new) on the
supervisor's ReviewDetail and attendance list. Packages: @simplewebauthn/server 13.3.3,
@simplewebauthn/browser 13.3.0. Docs: DEPLOY.md "Phone checks for passkeys", UX-PASS,
PAPER-CORRECTIONS, ARCHITECTURE.md.

**Migrations.** 069.

**Tests.** backend lint, route check (246 routes): passed. API: 261 run, 258 passed, 1 failed (the
pre-existing midnight case), 2 skipped (near midnight); the 4 new passkey and camera tests pass.
App lint and build: passed. e2e (run at 00:47 to 00:57): 65 passed, 1 flaky (capture, retried
green), 4 failed: the pre-existing midnight cases in pictures.spec.ts and journeys "pictures on a
time-out note" (a log made "an hour ago" falls on the day before).

**Skipped.** The offline End break camera check (see the decision above).

### Phase 23 (branch iter-23-landing)

**Changed.** App: index.html (now the landing page), app.html (the app, moved from index.html),
src/landing/ (new: Landing.tsx, render.tsx, content.ts, main.ts, download.ts, landing.css,
qrcode.d.ts), vite.config.ts (two pages, pre-render plugin, dev/preview rewrites),
service-worker.ts (landing vs app fallback), vercel.json (rewrite to /app.html, /login redirect,
manifest headers), pages/Door.tsx and lib/doors.ts (new; pages/Login.tsx removed), App.tsx (doors,
"/" and /login), components/Onboarding.tsx and lib/onboarding.ts (new) in the three layouts,
brand/useRoleTheme.ts (role manifests), brand/SplashScreen.tsx (palette applied at first render),
brand/tokens.ts and brand.css (LANDING neutrals, door and slide styles), ForgotPassword.tsx,
ChangePassword.tsx, AuthShell.tsx (themed per door), Help.tsx (Privacy notice, Contact),
sessionGuard.ts and ErrorBoundary.tsx (to the role's door). public/manifest-{role}.webmanifest and
public/icons/ (new), scripts/make-role-icons.mjs and make-role-manifests.mjs (new),
scripts/check-pwa.mjs (four manifests, both pages, landing script budget). Package: qrcode 1.5.4.
Backend: scripts/architecture-diagram.ts. e2e: tests/landing.spec.ts (new), sidebar-scroll.spec.ts
(the slides' row), helpers.ts, first-page.spec.ts, journeys.spec.ts (doors instead of "/");
lighthouse/run-lighthouse.mjs ("/" is the landing page; the trainee door added);
docs/baseline/tools/serve-like-vercel.mjs and axe-sweep.mjs. Docs: ARCHITECTURE.md, UX-PASS,
PAPER-CORRECTIONS, docs/pr/.

**Migrations.** None.

**Tests.** See the final verification below.

**Skipped.** Passkey sign-in at the doors (see the decision above).

## Final verification (branch iter-23-landing)

Run on 20 October 2026, 01:40 to 05:20 Philippine time, on a fresh local database (every
migration, `db:seed-demo`, and for the audits `docs/baseline/tools/populate.mjs`), the clock on
UTC for the API tests, as CI does. Nothing was run against a hosted database, Railway or Vercel.

**Tests.**
- Backend: lint passed; check:route-tests: all 246 routes named; API: 265 run, 265 passed, 0 failed.
- App: lint and build passed; check:pwa: 146 passed, 0 failed (four manifests, both pages, the landing script at 4.2 kB).
- e2e: 83 passed, 0 failed, 0 flaky, 4 skipped (journeys that need today's time-in window open; the run ended at 05:20, before the demo schedule's window opens).
- The first full run on this branch found two faults, both fixed and in the counts above: an API
  check still read the removed pages/Login.tsx (it now reads pages/Door.tsx, the sign-in path), and
  the journeys test "a student adds a picture when timing out" tried an offline time-in at 01:45,
  which the Phase 18 day rules refuse; it now skips when the time-in window is closed, as the other
  journeys do.

**Accessibility (axe-core 4.10.2, WCAG 2.1 A and AA, 390 and 1280 px, Iteration 0 settings).**
Files: docs/after-iter-23/axe.json and axe-sweep.log.

| | Iteration 0 (16 Oct) | Iteration 17 (19 Oct) | Iteration 23 (20 Oct) |
|---|---|---|---|
| Page loads | 100 | 108 | 120 (the same list, plus /help, the landing page, the three doors and pages added since) |
| States checked (menus, tabs, dialogs opened) | 546 | 571 | 629 |
| Violations | 1 | 0 | **0** |

The Phase 21 sweep's 31 findings (day banner chip and pager contrast, snap rows not focusable,
other-month day numbers) are all gone.

**Lighthouse 12.8.2, mobile defaults, median of 3 runs.** Files: docs/after-iter-23/lighthouse.md
and lighthouse.json. "/" was the sign-in page before Iteration 23 and is the landing page now; the
sign-in moved to the doors, so the trainee's door is measured too.

| Page | Iteration 0 | Iteration 17 | Iteration 23 | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| "/" (sign-in, now the landing page) | 100 | 100 | **100** (a11y 100, best practices 100, SEO 100) | 0.9 s | 10 ms | 0 |
| Trainee door (sign-in) | - | - | **100** | 0.6 s | 60 ms | 0 |
| Student: Today | 98 | 99 | **97** | 2.1 s | 150 ms | 0.022 |
| Supervisor: Review | 78 | 98 | **98** | 2.1 s | 130 ms | 0 |
| Coordinator: Dashboard | 97 | 99 | **99** | 1.5 s | 110 ms | 0.011 |

The landing page meets its budget: LCP 0.9 s (budget 2.5 s), CLS 0 (budget 0.1), its script 4.2 kB
compressed (budget 90 kB; check-pwa.mjs measures it on every build). Student: Today is 2 points
lower than at Iteration 17 (the day banner, figure cards, dock and action button of Phases 20 and
21 are drawn on the first page); its LCP is unchanged at about 2 s and every page stays in
Lighthouse's "good" range. Accessibility is 100 on every page.

**Screenshots.** docs/screens/iter-18-23/: the student portal (Today, Daily log, Schedule, Tasks,
Time Record, Notifications, Profile) at 320, 390, 768 and 1280 px, and the landing page and the
three doors at 390 and 1280 px (the landing page with reduced motion, its end state, so sections
that rise into view are shown). None scrolls sideways. One overlap was found and fixed: at 320 px
the student's Today page clipped the right edge of the OJT progress card (its grid columns kept
their content's width; pages/student/dashboard.tsx, min-w-0). The other wide elements found are
intended sideways rows (figure cards, filter tabs) and the Time Record's zoomable print preview.

## Where each role stands

- **Trainee:** a day with clear rules (credited time, lateness, half days), a day banner and figure
  cards, a signed Time Record, a dock and two-tap action button, a month calendar, passkey
  confirmation of each step, and its own installable app with a "Badge-in" door and first-open
  slides.
- **Supervisor:** sees how each step was made (passkey, not confirmed, sent later, camera check),
  records time-ins in person under the same rules, and has its own app with the "Desk" door.
- **Coordinator:** sets the institution profile and program formal names for the Time Record,
  sees trainees with no linked program, notifications split into actions and information, and has
  its own app with the "Console" door.
- **Everyone else:** a public landing page at "/" that explains the system honestly and shows how
  to install each app.

## Steps for me

1. **Database backup before deploying.** Take a backup of the production database before migrations
   065 to 070 run (Railway has no automatic backups on this plan). They are additive, but a backup
   is the only way back.
2. **Privacy notice version (D8).** The notice's text changed (a sentence about signatures,
   Phase 20) but its version is still "draft-4", as the brief asks. When the text is approved, bump
   the version (services/privacy.ts) so trainees are asked to agree again.
3. **Real phones** (on the deployed address, HTTPS):
   - offline time-in on an Android phone and an iPhone: open the app with a connection, turn on
     airplane mode, time in with the camera check, reconnect and check it arrives attested;
   - passkeys on Android (Chrome) and on an installed iPhone (Safari, from the Home Screen): DEPLOY.md,
     "Phone checks for passkeys";
   - install each role app from its door (Android: Install; iPhone: Share, Add to Home Screen) and
     check its name, icon, colours, shortcuts and the four first-open slides.
4. **Decide on the offline End break camera check** (not built; see Phase 22's decisions).
5. **Passkey sign-in at the doors** was not added (see Phase 23's decisions); it needs a schema
   change if wanted.
6. **Set nothing new on Railway or Vercel.** No new settings are needed: vercel.json carries the
   landing page, the rewrite to app.html and the /login redirect; passkeys use FRONTEND_URL and
   CORS_ORIGINS, already set.
7. Nothing has been pushed. The six branches are local: iter-18-rules, iter-19-brand,
   iter-20-attendance, iter-21-shell, iter-22-passkeys, iter-23-landing (each from the one before);
   PR descriptions are in docs/pr/.

