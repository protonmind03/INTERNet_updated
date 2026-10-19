# Iteration 18: attendance rules and data foundation

Branch `iter-18-rules` (from `ui-redesign`).

## Summary
- One set of day rules (`services/dayRules.ts`) used by every attendance route: the 30-minute
  early window, credited time, late from the start minute, grace, afternoon-only days, holidays.
- Absences can be for the morning, the afternoon or the whole day.
- A place for the trainee's signature, and the institution's profile (with program formal names)
  for the Time Record header.

## Migrations
065_attendance_day_rules, 066_absence_parts, 067_student_signatures, 068_institution_profile.
All additive and idempotent; foreign keys NOT VALID.

## Screens changed
Coordinator: Programs (Formal name), Profile (Institution card). Help: Attendance times.

## Tests
Backend lint, route check (236 routes), API 248 passed (10 new), app lint and build, check:pwa,
e2e 67 passed.

## Steps for me
- Take a database backup before deploying 065 to 070.
- Fill in the institution profile (coordinator Profile) on the deployed site.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
