# PWA hardening in CI, and the first page right after sign-in

**Branch:** `iter-14-pwa-loading` → `ui-redesign` · **Workstreams A and C** · no migration

## What changes for people

- **Everyone, after Sign in:** the first page opens at once in its own shape
  (placeholders where its figures and lists will be) and fills in place. The
  fixed 1.2 s launch screen after sign-in is gone; the page's code is fetched
  while the password is checked. (Prototype P2, the shaped skeleton, chosen
  over P1 and P3; all three stay in the brand preview.)
- **Supervisors** especially: the Review page no longer jumps while it
  loads (Lighthouse layout shift 0.49 → 0, performance 78 → 98, locally).

## How

- `my-pwa/scripts/check-pwa.mjs` (`npm run check:pwa`, CI frontend job):
  manifest fields and icon sizes read from the PNGs, the real service worker
  keeping `index.html` and `offline.html`, the Home Screen icon, `lang="en-PH"`,
  and a start-up image of the right size for each current iPhone.
- `e2e/lighthouse/run-lighthouse.mjs` (`npm run lighthouse`, CI end-to-end
  job): mobile Lighthouse on sign-in and each portal's first page; reports
  kept as the `lighthouse-reports` artifact; it reports, never fails the build.
- `public/robots.txt` (SEO 91 → 100). The brand preview exists in development
  or with `VITE_BRAND_PREVIEW=true`.
- What made pages jump: the supervisor's header buttons and chips, the Today
  strip, tile hint lines, the coordinator's filter bar.

## Tests

`first-page.spec.ts`: for each role, with the data held back, no launch
screen, the page in its loading shape at once, and layout shift under 0.1.
An API test keeps the prototypes out of sign-in. axe clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
