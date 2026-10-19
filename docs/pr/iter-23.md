# Iteration 23: landing page, doors, role apps and first open

Branch `iter-23-landing` (from `iter-22-passkeys`).

## Summary
- "/" is a public landing page made at build time (plain HTML, a 4.2 kB script; it never loads the
  app). The app moved to app.html; Vercel rewrites every other address to it.
- Three doors: /student/sign-in ("Badge-in"), /supervisor/sign-in ("Desk"),
  /coordinator/sign-in ("Console"), each in its role's palette with the seal. /login goes to the
  doors.
- Three installable apps (INTERNet Trainee, Supervisor, Coordinator) with their own manifests,
  icons and shortcuts, beside the unchanged manifest.json. The landing page's Get the app explains
  installing per device, with a QR code.
- Four first-open slides per role in the installed app, once per device.

## Migrations
None.

## Screens changed
New: the landing page, the three doors. Changed: Forgot and Change password (themed per door),
Help (Privacy notice, Contact the OJT office), first open of each installed app.

## Tests
New API checks (landing imports and tokens, manifests, vercel.json), new e2e landing.spec (landing
without the app, menu sheet, Download module, offline "/", doors, onboarding), check:pwa checks four
manifests and the landing script budget. Lighthouse and axe include "/" and the doors.

## Steps for me
- Install each role app from its door on Android (Chrome) and on an iPhone (Safari, Add to Home
  Screen); check the name, icon and first-open slides.
- Nothing new on Vercel or Railway: vercel.json carries the rewrites.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
