# Iteration 22: passkeys

Branch `iter-22-passkeys` (from `iter-21-shell`).

## Summary
- A trainee may add a passkey (the phone's screen lock) in Profile. Lunch break, End break and
  Time out then ask for it; it never stops a step. With no connection, challenges collected
  beforehand are signed on the phone and checked on arrival.
- The supervisor sees how each step was confirmed. On the strict level End break also runs the
  camera check online.

## Migrations
069_passkeys.

## Screens changed
Student: Profile (Passkeys), the step dialogs. Supervisor: review detail and attendance list.

## Tests
Backend lint, route check (246 routes), API (a software authenticator: registration, steps, replay,
counter, offline challenges), app lint and build, e2e.

## Steps for me
- Run DEPLOY.md, "Phone checks for passkeys", on an Android phone and an installed iPhone.
- Decide on the offline End break camera check (not done; see the progress log).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
