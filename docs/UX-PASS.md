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
- Student · Attendance, day banner - four step tiles (Time in, Lunch break, End break, Time out) that are also the buttons; on phones two pages, Morning and Afternoon, swiped or chosen with a switch, page 2 once lunch begins; the window's opening and a countdown on Time in; "Morning · absent" with "File a reason" on an afternoon-only day; early, late and sent-later marks from the server - *Match between system and the real world: the day reads in the order it is lived, and one tile is one step.*
- Student · Attendance, figures - three cards (Hours ring with the projected finish, On time over the last 20 scheduled days, This week Sunday to Saturday) each with a tap that narrows the list below; a "Late" filter chip - *Recognition over recall: the figure, its comparison and the way to the detail sit together.*
- Student · Absences - "Part of the day": whole day, morning or afternoon - *Flexibility: a half-day is said as a half-day.*
- Time Record (all roles) - the university header with the seal, the trainee's live details and certification, the signature above the trainee's line, and a print-preview frame with Print size / Zoom 200% - *Consistency with the paper form people already sign.*
- Student · Profile - a Signature card: draw with finger, stylus or mouse (Undo, Clear, Save), or upload an image - *Accessibility: a keyboard path that is not a lesser one.*
- Coordinator · Students - a "No linked program" status chip, to find the trainees whose Time Record lacks its college line - *Error prevention: gaps are found before records are printed.*
- Header (phones) - three tracks (brand, then icons) so the brand never runs under them; below 360 px the role pill becomes a dot named "Trainee" - *Legibility at the smallest width people use.*
- Tooltips (all portals) - shown only on mouse hover and keyboard focus, closed on scroll, Escape, a press elsewhere, a route change or after 1.5 s; never on touch - *Don't get in the way of the action that was asked for.*
- Bell (trainees) - Notifications holds what asks for an act, with "Action needed"; Announcements holds the coordinator's announcements and notifications that only inform, each read in a dialog - *Signal-to-noise: what needs doing is not buried under news.*
- Every notification a trainee opens - lands on the thing itself: scrolled to, the page dimmed around it, a brief pulse, then an outline; reduced motion gets only the outline; the camera never opens by itself - *Visibility: show exactly where to act.*
- Dialogs (all portals) - focus stays inside; the page behind is blurred 8 px, with a solid wash where blur is not drawn - *Focus: one thing at a time.*
- Floating next-step button (phones) - a 56 px circle above the dock; the first tap shows "Step · Tap again", the second opens the step; one press for keyboards and screen readers - *Error prevention: no step from a stray tap.*
- Student · navigation (phones) - a floating dock: Today, Attendance, Schedule, Tasks, More; icons always, only the current label shown; it steps aside while scrolling down and while typing - *Fitts's law: the pages used most are in the thumb's reach.*
- Student · Schedule, Month - Sunday-first weeks, tinted weekends, one status dot per day, 44 px cells at 320 px, a five-dot legend (behind "Legend" on phones), "Tap a day for its details." under the switch, an ⓘ for two-week patterns - *Consistency with a wall calendar.*
- Student · Schedule, day sheet - a bottom sheet on phones (handle, swipe down) and a popover on desktop: the day, its status, schedule, times, hours, context and decision, with an appeal link; arrows or a swipe for the next day - *Progressive disclosure: everything about a day, one tap away.*
- Student · Schedule, My progress - a burn-up chart, milestones, the change since last week, and an eight-week rhythm strip, each with a text summary - *Recognition: progress shown as a path to the goal.*
- Student · Profile - grouped like a phone's settings (a row per group opening a sheet; on desktop two columns with a sticky index); every form unchanged - *Chunking: ten groups instead of one long page.*
- Student · Profile, Security and device - Passkeys: add one with the phone's screen lock, see each with when it was added and last used, remove one - *User control: a stronger check the trainee chooses.*
- Student · Lunch break, End break, Time out - the phone's screen lock is asked for when the trainee has a passkey; cancelling it never stops the step; on the strict level End break runs the camera check first, with a Skip - *Error tolerance: a failed check is recorded, not punished.*
- Supervisor · log detail and attendance list - per step: "Confirmed with passkey", "Not confirmed", "Sent later", and the End break camera check - *Visibility: how a record was made, stated plainly.*
- Public · Landing page (/) - one page that says what INTERNet is, routes each role to its door, and explains installing; the day's four steps drawn once as the page opens, at rest with reduced motion - *Match with the real world: the trainee's own four steps tell the story.*
- Public · Landing page, phone - the menu is a sheet (native dialog: focus kept inside, Escape and a tap beside it close it) - *User control and freedom.*
- Public · Landing page, Get the app - choose the app and the device (guessed from the browser), one set of steps at a time, a QR code to open the door on a phone; plainly an installable web app, no app store - *Recognition over recall.*
- Public · Landing page, Questions - native details/summary, readable without a script - *Help and documentation.*
- Trainee · door (/student/sign-in, "Badge-in") - an ID card in the Sunpath palette, the seal at its corner, one field for Student ID or email, the button kept in the thumb's reach on a phone - *Aesthetic and minimalist design.*
- Supervisor · door (/supervisor/sign-in, "Desk") - on a tablet or computer, a static example of the review queue beside the form; a help line naming the OJT coordinator for accounts - *Help users recognise where they are.*
- Coordinator · door (/coordinator/sign-in, "Console") - the Royal Seal's dark chrome, the large co-brand lockup with the seal on its white disc, and "Service reachable" once /api/health answers - *Visibility of system status.*
- All · doors - someone already signed in is taken to their own portal; a wrong password says only that door's message; links to the other two doors - *Error prevention.*
- All · Forgot password and Change password - themed as the door they came from; "Back to sign in" returns to that door - *Consistency.*
- All · installed app, first open - four slides per role, once per role on each device, Skip on every slide, swipe or Next and Back, dots; the notification slide asks only when its button is tapped - *User control; no surprise permission prompts.*
- All · Help - new Privacy notice and Contact the OJT office sections, linked from the landing page's footer - *Help and documentation.*

