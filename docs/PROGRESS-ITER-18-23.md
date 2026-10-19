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
- [ ] 19.1 seal assets, PsuSeal, co-brand lockup, Seal panel
- [ ] 19.2 role palettes, contrast test, v4 palettes panel
- [ ] 19.3 splash "Seal to Route", start-up images per role
- [ ] test run and commit

### Phase 20: trainee attendance and Time Record (`iter-20-attendance`)
- [ ] 20.1 day banner
- [ ] 20.2 figure cards
- [ ] 20.3 Time Record header
- [ ] 20.4 signature
- [ ] test run and commit

### Phase 21: shell, notifications, schedule, profile (`iter-21-shell`)
- [ ] 21.1 header overlap
- [ ] 21.2 tooltips
- [ ] 21.3 notification kinds (migration 070), bell tabs, spotlight
- [ ] 21.4 floating action button
- [ ] 21.5 horizontal areas
- [ ] 21.6 mobile dock
- [ ] 21.7 month calendar
- [ ] 21.8 day details sheet
- [ ] 21.9 My progress
- [ ] 21.10 Profile grouped
- [ ] 21.11 phone pass and axe sweep
- [ ] test run and commit

### Phase 22: passkeys (`iter-22-passkeys`)
- [ ] 22.1 migration 069
- [ ] 22.2 registration, step assertions, offline challenges, supervisor marks, tests, DEPLOY.md
- [ ] test run and commit

### Phase 23: landing, doors, downloads, onboarding (`iter-23-landing`)
- [ ] 23.1 second Vite entry, vercel.json, service worker
- [ ] 23.2 landing content
- [ ] 23.3 role manifests and download module
- [ ] 23.4 three sign-in doors
- [ ] 23.5 onboarding carousel
- [ ] 23.6 architecture diagram and PR notes
- [ ] final verification and report

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
