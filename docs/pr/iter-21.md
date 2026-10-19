# Iteration 21: shell, notifications, schedule and profile

Branch `iter-21-shell` (from `iter-20-attendance`).

## Summary
- Header overlap fixed on small phones; tooltips rebuilt (no tooltip after a tap).
- Notifications split into "Needs action" and "For your information"; a notification opens its
  record with a spotlight.
- The two-tap floating action button, the student's dock, the month calendar with a day sheet, My
  progress, and Profile in groups.
- Every sideways area shares one rule set; the axe sweep's findings fixed.

## Migrations
070_notification_kinds.

## Screens changed
Student: every page (dock, header), Schedule, Profile, notifications. All roles: the bell, dialogs.

## Tests
Backend lint, route check, API (new kinds and routing tests), app lint and build, e2e (new
shell.spec; the midnight-only failures are pre-existing). Axe: 31 findings, all fixed.

## Steps for me
- Check the dock and the action button on a real phone with a notch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
