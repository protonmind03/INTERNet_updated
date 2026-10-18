# Phase 4: before-and-after measurements, the architecture diagram from the code, PR descriptions

**Branch:** `iter-17-phase-4` → `ui-redesign` · **Phase 4** · no migration

## What changes for people

- **Everyone using a keyboard or switch:** a dialog taller than the screen
  (the Time in sheet on a short phone, for one) can now be reached with Tab
  and scrolled with the arrow keys. This was the one accessibility issue
  in the baseline, and the only one left.

## What is in it

- `docs/after/README.md`: the baseline's axe sweep and Lighthouse run
  repeated with the same tools, versions and settings, and compared.
  axe (WCAG 2.1 A and AA, 108 page loads, 571 states): **0 violations**,
  from 1. Lighthouse (mobile, median of 3): supervisor 78 → 98 with layout
  shift 0.521 → 0, coordinator 97 → 99 with 0.102 → 0.011, student
  98 → 99, SEO 91 → 100 on every page. Largest paint is 0.2 to 0.5 s later
  on three pages, still "good"; noted to watch. One line per role on what
  changed for them.
- `docs/ARCHITECTURE.md`, written by `npm run docs:architecture`
  (`backend/src/scripts/architecture-diagram.ts`) from the route
  registrations (the same reading as the route-test check) and the
  services' imports: a Mermaid diagram (13 route files, 234 routes, 42
  services, the nightly backup job, and the outside systems each one
  talks to), with tables of route files and of who uses each service.
- CI, backend job: "The architecture diagram matches the code"
  (`--check`), so a route file or service added without regenerating the
  diagram fails the build. The old hand-drawn prototype diagram is
  replaced with a pointer to the generated one.
- `docs/pull-requests/`: one description per workstream branch (B, D,
  A and C, F and G, H, and this one).
- `docs/baseline/tools/serve-like-vercel.mjs` (the local stand-in for
  Vercel, kept this time) and `EXTRA_PAGES` in the axe sweep for pages
  added since the baseline.
- `components/ui.tsx` `Modal`: the body takes a Tab stop, named after the
  dialog, only while it scrolls.

## Tests

- New Playwright test: on a 360 px-tall phone the "Add holiday" body is a
  named region with a Tab stop and End scrolls it; at 1280 × 900 it is
  not.
- `journeys.spec.ts`: the "time in with no connection" journey blocks the
  background offline-camera readiness, which made it depend on timing and
  failed once on CI after Iteration 16 (that fix went to `ui-redesign` on
  its own).
- Full API and browser suites, lint and build, and the diagram check.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
