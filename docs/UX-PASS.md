# UX pass (roadmap 8.7, workstream H)

Iteration 16, 18 October 2026. Each change is one line: **screen - change -
design principle**. They came from looking at the most-used pages of each
portal at phone (390 px) and laptop (1280 px) width with realistic data
(`docs/baseline/tools/populate.mjs`), before and after.

The brief's rules held for every change: no default component-library
styling, no stock gradients, no decorative motion, and every colour and
size from the brand (the PSU blue and gold of the theme, `brand/tokens.ts`).
No new colour, shadow or animation was added; each change reuses a
component or a class already in the app.

## Changes

1. **Student · Schedule (Week), phone** - The weekly schedule no longer
   runs off the right edge: the hours column and "Add to calendar" were cut
   off because the card, a grid item, grew to its longest line. It now keeps
   to the screen and the long "focus" line shortens with an ellipsis. -
   *Legibility: everything meant to be read stays on the screen.*
2. **Student · Tasks** - A task card no longer shows a badge that only
   repeats the tab it is under ("To do" under To do, "Submitted" under
   Submitted). Badges that add something stay: Overdue, Needs changes,
   and every badge in the All tab. The title gets the full width. -
   *Signal-to-noise: say a thing once, where it is decided.*
3. **Student · Documents** - A requirement with nothing uploaded is one
   row with its Upload button beside it, instead of a "Not uploaded" badge
   and a full-width button below. With nine requirements the list is about
   a third shorter. A returned file keeps the roomier layout for the
   reviewer's note. The button stays 44 px tall. -
   *Proximity: the action sits with the thing it acts on; Fitts's law:
   the target keeps its size.*
4. **Student · Documents** - Each Upload button now has its own name for a
   screen reader ("Upload: Medical"), where before every one was just
   "Upload". The visible word comes first, so voice control still works. -
   *Recognition over recall: no need to remember which row a button is in.*
5. **Supervisor · Attendance** - The chip on a log that "Verify all"
   leaves out was dark and long ("Not in Verify all: offline time-in:
   verify it by itself"). It is now in the same quiet style as the chips
   beside it and says "Verify on its own" (or "Still on the clock").
   "Left out of Verify all" is kept for screen readers and as a tooltip.
   The chip next to it already says the time-in was offline. -
   *Consistency: one family of status chips; plain language.*
6. **Coordinator · every page with the filter bar, phone** - The filter
   bar is one line ("Which students · all", or "2 choices on") that opens
   the choices on a tap, instead of three dropdowns (about 180 px) above
   every page's content. From the small breakpoint up it is open as before.
   Its loading placeholder has the same closed shape on a phone, so the
   page still does not move when the choices arrive. -
   *Progressive disclosure: the content first, the narrowing on request.*
7. **Coordinator · Students** - Search, the status chips and "Sort by" fit
   on one row on a laptop screen; Sort by used to drop to a row of its
   own. -
   *Proximity: the list's controls read as one group.*

## Checked

- Screenshots before and after of the changed pages (phone and laptop).
- axe (WCAG 2.1 A and AA) on each changed page, the coordinator's filter
  bar both closed and open: no violations.
- The end-to-end tests that read these screens (one checked the old chip
  wording and was updated).

## Iterations 18 to 23 (October 2026)

One line per UI change, in the form screen - change - design principle.

- Coordinator · Programs, program editor - an optional "Formal name" field, printed on the Time Record - *Recognition over recall: the full name is entered once, where the program is defined.*
- Coordinator · Profile - an "Institution details" card for the lines printed above every Time Record - *Single source of truth: one place to change what every record prints.*
- Help - an "Attendance times" section: when a time-in opens, when hours count, what late means, the afternoon-only day - *Visibility of system status: the rules the server applies are written down where trainees look.*
- Splash (installed app) - "Seal to Route": the PSU seal, the route drawn in the role's colour, the wordmark and the role's name, 1.1 s, cold starts of the installed app only, the end frame alone under reduced motion - *Aesthetic and minimalist design: one short story that says whose app this is, never in the way.*
- Sign-in - the PSU seal beside the INTERNet mark, on its white disc on the navy panel - *Recognition: the university's mark where people decide whether to trust the page.*
- Help - an "About INTERNet" section with the seal and "A system proposal for Pangasinan State University – Lingayen Campus" - *Honesty: say plainly what the system is.*
- Coordinator analytics and performance PDFs - the seal and the campus line on the cover - *Consistency: printed reports carry the same identity as the app.*
- Brand preview - "Seal" and "v4 palettes" panels: the seal's rules shown by the component that enforces them; the three role palettes with every text pair's contrast - *Error prevention: the rules sit where designers look, and a test holds them.*
