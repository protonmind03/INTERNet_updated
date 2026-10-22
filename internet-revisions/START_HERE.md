# INTERNet revisions: integration brief for Claude Code

You are working in the INTERNet repository: a PWA for Pangasinan State University (Lingayen Campus) OJT, with `my-pwa/` (React 19, Vite, Tailwind 4, vite-plugin-pwa) and `backend/` (Node/TypeScript, Postgres, numbered SQL migrations). This folder (`internet-revisions/`) holds the approved redesign, decided on a design board across 14 sections, plus the PSU seals and organisation logos.

**Your job:** apply every revision in this brief to the running system end to end (frontend, backend, database, assets, docs), keep every existing feature working, and finish with a report. Work through all phases in one go. Do not stop to ask for approval between phases. Stop only for a decision that cannot be undone, such as dropping data, and say so in the report.

---

## 0. Before touching code

1. Read the repo's own rules first: `CLAUDE.md` (if any), `DEVELOPING.md`, `DEPLOY.md`, `docs/`, `my-pwa/src/brand/*`, `my-pwa/src/landing/*`, the three layouts and the coordinator hub/nav. Their conventions win over anything here about *how* to code. This brief decides *what* it should look like and do.
2. Create a branch: `git checkout -b revisions/psu-redesign`. Commit at the end of each phase, with a message naming the phase.
3. Make a todo list from the phases below and keep it updated.
4. Write `internet-revisions/PLAN.md`. For each board in `design/` (see `design/INDEX.md`), list the real files and components it maps to, and what changes. Then continue straight into Phase 1.
5. Look at the reference material:
   - `design/screens/*.png` shows what each screen should look like. Open them with your image reader.
   - `design/boards/*.html` holds the exact CSS values: colours, spacing, radii, type sizes. Open a file when you need a value.
   - `design/text/*.txt` has all the wording on each board.

### Hard rules (apply in every phase)

- **No ghost features.** Never draw a button, figure or menu item without a working feature behind it. Never leave code that no screen uses. If a design shows something the code cannot do, build the smallest real version or leave it out and list it in the report.
- **Sample data is sample.** "Acme Corp", "Ana Reyes", "Rosa Dela Cruz", "48 BSIT trainees", "Nov 5" and the like are placeholders. Bind everything to real data.
- **Keep behaviour.** Offline queue, version checks (409 STALE), passkeys, camera check levels, photo-retake window, the 12 h / 24 h offline limits, the limit of 10 messages a day, role manifests, `check:pwa` and the landing-page size budget (90 kB script) all stay exactly as they work today.
- **No location tracking.** Geolocation is disabled in this system, so no screen may mention or imply it.
- **Status colours never use the role colour.** Every status also carries a word, a shape or a stamp, never colour alone.
- **Tooltips** appear only behind an "i" button. They open after a 0.6 s hover or on keyboard focus, and close when the pointer leaves. They hold one or two sentences.
- **Minimal wording.** One line per card. Explanations go behind the "i" or in Help.
- **Accessibility.** Touch targets of at least 44 px, visible focus rings, `prefers-reduced-motion` turns off all motion, contrast of at least 4.5:1 for text.
- **Migrations are additive** and numbered after the highest existing one. Never edit an old migration, and never drop a table or column that holds data.

---

## 1. Visual system: "beyond gradients" (Section 13)

Reference: `design/screens/F13_V0.png`, `F13_V1`, `F13_V2`, `F13_V3`.

Put this in the brand layer (`my-pwa/src/brand/tokens.ts`, `brand.css` or the Tailwind theme, whichever the repo uses) so every portal draws from one source.

| Token | Trainee | Supervisor | Coordinator |
|---|---|---|---|
| Header / chrome | `#8A3A07` flat | `#116C5C` flat | `#1A237E` flat (side menu `#121A5E`) |
| Accent (buttons, active) | `#A84A0C` | `#116C5C` | `#4F46E5` buttons, navy chrome |
| Paper (page background) | `#FBF7EF` | `#F4F9F6` | `#F7F8FC` |
| Hairline | `#EBDDC6` | `#D3E6DD` | `#E3E6F5` |
| Dock | cream `#FFF8E6`, border `#F2E3BE`, active pill `#A84A0C` | `#0C5548`, active pill white | `#1A237E`, active pill gold `#FACC15` |
| Status | green / sky / red | grey with a tick / sky / red | green / sky / red |

Brand colours: navy `#1A237E` / `#121A5E`, gold `#FACC15`. Fonts: Bricolage Grotesque for display, Public Sans for body (both already installed through @fontsource). Use tabular numerals for every figure.

**Rules**

1. Gradients are removed from the UI: headers, cards, side menus, buttons and glows.
   - Exceptions: logos and seals keep their own artwork.
   - The single exception in the UI is the landing hero's faint role glow (opacity 0.16).
2. Grain: a 4–5 % SVG `feTurbulence` noise overlay on each portal's page (`pointer-events:none`).
3. Use hairlines instead of shadows.
   - Cards: a 1 px border, no soft drop shadow.
   - Only the floating dock and modal sheets may have a shadow.
4. Each role has one motif. Show it in one or two places, never everywhere. Build them as small reusable components:
   - **Trainee: time card.**
     - Today's day card is a white card: "Working since 7:58 AM" over a big time (e.g. "2h 14m"), with an "On time" stamp.
     - Under it: a dashed tear line with half-circle notches, then a punch row (In / Lunch / Back / Out) in a monospace font, with `--:--` for steps not done.
     - Then the action buttons: the gold primary (Time in / Time out) and an outlined secondary (Lunch break / End break).
     - The header gets a yellow lane-dash strip along its bottom edge.
     - OJT hours appear as a road strip with a pin and a finish flag.
   - **Supervisor: logbook.**
     - Faint ruled lines in the header.
     - "Today's register": initials with time-in times in a monospace font, and a "—" for anyone not in yet.
     - Underlined tabs instead of pills.
     - A grey rotated "Verified" rubber stamp for decided items.
   - **Coordinator: route map.**
     - A grid-paper background behind the cohort card.
     - The cohort drawn as a transit line with stations (initials). Status rings: red = behind, navy = on the way, green = almost done.
     - "Needs you" as a departures board, with a monospace code column (APPEAL ×3, FLAG ×2, CONCERN).
     - A split fact card for figures instead of boxed tiles.
5. Stamps such as "On time" and "Verified" are text inside a 2 px border, rotated −5 to −6°, in the status colour.

---

## 2. PSU seals and organisation marks

Assets: `assets/psu/`.
- `marks.json` is the manifest.
- `web/*.png` holds 512 px transparent PNGs. Round seals are cut to a circle.
- `web/*@128.png` holds small versions.
- `original/` holds the untouched files.

Read `MISSING_ASSETS.md` first. It covers the gaps and one wrong logo.

1. **Ship the assets.**
   - Copy `web/` to `my-pwa/public/brand/psu/`.
   - Precache only the `@128` files and `psu-seal.png` in the service worker, to keep the install small. The 512 px files load on demand.
2. **Registry.** Create `my-pwa/src/brand/psuMarks.ts` from `marks.json`.
   - Exports: `getCollegeMark(shortName)`, `getProgramMark(shortCode)`, `getMajorMark(programCode, majorName)` and `PSU_SEAL`.
   - Lookups ignore case and outer spaces.
   - `CHTM` must also match the logo's `CTHM`.
   - Skip any entry whose `status` is `replace`. The ECOSOC logo belongs to another university, so ABEcon shows a monogram until it is replaced. Entries marked `confirm` or `confirm-name` are shown, and you list them in the report.
3. **Components.**
   - `PsuSeal` replaces the stand-in seal everywhere. The existing `brand/PsuSeal.tsx` (if present) now renders `psu-seal.png`.
   - `CollegeMark` and `ProgramMark` take a size and an alt text.
   - When an image is missing, they fall back to a neutral monogram disc: the short code on the role's tint, never a fake logo.
4. **Database.** Add one additive migration:
   - Columns `mark_key TEXT NULL` on `colleges`, `programs` and `majors`, plus `org_name TEXT NULL` on `programs` and `majors`.
   - Seed them from `marks.json` by short name, short code and major name, without overwriting values already set.
   - Add the BSEd majors English, Filipino, Science and Social Studies with `ON CONFLICT DO NOTHING`, since the logos show them. Mathematics is unconfirmed (see the missing list), so leave it out.
   - Expose `mark_key` and `org_name` in the academics routes and types.
   - On the coordinator Programs page, add a picker so a coordinator can choose a college's or program's mark from the shipped set.
   - Do not add file uploads in this pass.
5. **Where marks appear** (and nowhere else):
   - **Landing:**
     - the PSU co-brand beside the INTERNet logo in the nav
     - the turning seal coin under the hero heading (two faces, `rotateY`, stopped under reduced motion)
     - the PSU strip in "Three portals, one road"
     - the footer's About column
   - **Sign-in (all roles):** a small PSU seal in the footer line.
   - **Coordinator:**
     - When a college filter is active, the "on the road" cohort card shows the college seal.
     - When a program filter is also active, it shows the program's organisation mark beside it, with a tooltip naming the organisation.
     - When no filter is set, it shows the PSU seal.
   - **Trainee:** in More → Profile, the trainee's program mark (or major mark for BSEd) with the organisation name.
   - **Supervisor:** on an intern's page, a small program mark next to the program line.
   - **Time Record (DTR):** the header uses `institution_profile.seal_asset = 'psu-seal'` to render the real seal in screen and PDF (jsPDF) output.

---

## 3. Landing page (Sections 1–5, 8A, 9B)

The landing is rendered from `my-pwa/src/landing/` into `index.html`. Keep it separate from the app bundle, keep it under the size budget, and keep `check:pwa` green. Mostly CSS, minimal JS.

Section order:

1. **Hero (1D, refined).** References: `F01_R1D.png`, `F01_R1D_coordinator.png` and `F01_R1D_supervisor.png`.
   - **Background:** a flat night sky `#0E1550` with grain and faint stars. A low campus skyline silhouette sits on the horizon.
   - **Road:**
     - a perspective road with a texture
     - white edge lines and a few roadside posts
     - centre and side dashes moving toward the viewer
   - **Role circle:**
     - The three roles sit in a circle: Coordinator on a laptop, Trainee on a phone, Supervisor on a tablet.
     - The centre device is raised so it covers the road's horizon. The side devices are smaller and dimmed.
     - Under the selected device, a caption pill reads "[Role] on a [device]."
     - A soft contact shadow sits under the centre device. The role glow is at most 0.16 opacity.
   - **Controls:**
     - Left and right arrows rotate the roles. Clicking a side device does the same.
     - The centre gold round button, a circular-arrows symbol, switches the current role's device. Its tooltip reads "Switch device · see the [Role] portal on a [next device]".
     - Under the controls, a role indicator lists "Coordinator · Trainee · Supervisor" and underlines the current one in its role colour.
   - **Floating notes:** two paper-white notes per role, with a 3 px left strip in the role colour, e.g. "Timed in 7:58 AM · camera check passed". Bind them to real example text, not live data.
   - **Device screens:** the screens inside the devices are the real portal designs in miniature (see the board).
   - **Heading:** "One system. *Every role, every screen.*"
2. **Three portals, one road** (`F01_R1E.png`). One card per role:
   - a flat cap in the role colour with its motif: lane dashes, ruled lines or a grid
   - a device mock with a floating animation, off under reduced motion
   - three bullets
   - device chips, with the best device filled
   - an "i" explaining the device choice
   - a "Get the … app" button linking to that role's app or install page
   - Below the cards, a navy PSU strip holds the seal coin, "Part of the Pangasinan State University OJT program" and the pills: Android · iPhone and iPad · Computers · Works offline.
3. **How it works (2A).**
   - White section.
   - Choosing a role restarts at step 1.
   - The coordinator step reads "Watch what needs you".
4. **Get the app (3B).**
   - Accurate install steps per device, with iPhone and iPad combined.
   - Real Android and Apple marks.
   - A "Detected" badge from client-side detection (`navigator.userAgentData` with a `userAgent` fallback). No backend is needed.
5. **What the system checks (4C).** "Try to fool it", built only from rules that exist: camera check levels, offline time-in voucher, passkeys, photo redo window, corrections, verification.
6. **Footer (9B, install first, navy).** Reference: `F09_R9B.png`.
   - A flat navy `#1A237E` background with grain, because the section above ends in white.
   - **Install card:** a dark panel with a gold device tile and a gold "Install the app" button, plus an "Other devices" link. It uses the same device detection as 3B.
   - **Columns:** Get the app, Help and About, with gold headings.
   - **Bottom row:** © year Pangasinan State University · version · Back to top.

**Phone landing** (`F01_R1F.png`): the hero first, with role chips and a single device, then the three portal cards stacked. Every section must work from 360 px to 1920 px wide with no horizontal scroll.

**Section 5 (installed app):** inside the installed app (display-mode standalone), never link back to the marketing site.

---

## 4. Sign-in (Section 6)

References: `F06_R6A.png` (phones) and `F06_R6W1`–`W3` (computers).

- **Phones:** one shared template. Per role, only these change:
  - the flat header colour (amber, green or navy)
  - the role chip
  - the ID label ("Student ID or email", "Work email", "Coordinator email")
  - the accent colour
- **Computers:** a different layout per role.
  - **Trainee:** a hand-off to the phone, with a QR code ("Time in from your phone").
  - **Supervisor:** the review-queue framing.
  - **Coordinator:** a centred card over a blurred console.
- Keep every current auth behaviour: keep me signed in, forgot password, lockout and passkeys.

---

## 5. Trainee portal (Section 7, plus 8B in-app help)

References: `F07_R7A.png`, `F07_R7A2`, `F07_R7A3` and `F07_R7R`, plus `F13_V1.png` for the motif.

- **Header:** flat amber with the lane-dash strip. It shows the bell only: no Profile icon, and Notifications are not repeated in More.
- **Dock:** cream, with Today · Attendance · Schedule · Tasks · More. The active pill is amber.
- **Today:**
  - The time card from Phase 1.
  - A red "Needs you" row for anything to act on: retake photo, missed time-out, appeal window.
  - OJT hours, e.g. "412 of 486 h · expected to finish Nov 5", with an "i" for "Only verified days count".
  - Shortcuts as hairline rows.
  - Up next.
- **Attendance:**
  - Week bars.
  - Filters: All / To fix / Pending / Verified.
  - Log rows with status badges.
  - **Retake** is a solid amber button with a camera icon. **Appeal** is an outlined button. They must never look alike.
- **More:** a grouped sheet with My OJT (Documents, Weekly journal, Completion, Time record, Profile), Messages (Messages, Announcements, Resolution Center) and Support (Help, Feedback). The account sits at the bottom with Sign out.
- **Help for this screen (8B):** a "Help" pill on each screen opens a bottom sheet of questions tagged to that screen. Keep the tags in a static file next to `offlineHelp.ts`, keyed by route. The sheet ends with "All trainee help" and "Message your supervisor".
- **Tablet and computer:** the same content in a two-column layout, with the time card larger. Time-in stays phone-first, and the hand-off QR code shows on computers.

---

## 6. Supervisor portal (Section 10)

References: `F10_S1`–`S3`, `S5`, `S6` (tablet) and `S7` (computer), plus `F13_V2.png` for the motif.

- **Phone dock:** green `#0C5548`, with Review · Interns · Tasks · Attendance · More.
- **Review:**
  - Today's register.
  - Underlined tabs: All / Time-ins / Tasks / Docs.
  - One card per decision, with a solid main action and an outlined choice. Reject asks "photo or day" in one menu.
  - Offline time-ins show chips ("No photo", "Phone clock OK") and a **"Confirm on its own"** button. They are never included in "Verify all".
  - A sticky "Verify the N ordinary time-ins" bar.
  - Decided items get the grey "Verified" stamp.
- **Intern page:**
  - Hours progress.
  - Quick actions: Record time-in, Message, Give a task.
  - Tabs: Logs, Tasks, Journal, Evaluate.
- **Tablet and computer:**
  - **Side menu:** solid green, with a company chip at the top, the user at the bottom, and collapsible groups (exclusive accordion):
    - **Review:** Time-ins, Tasks, Documents, Absences
    - **Interns**
    - **Work:** Tasks, Journals, Weekly reports
    - **Evaluate:** Final evaluations, Time records to certify
    - **Talk:** Messages, Announcements, Incidents, Staff notes
  - **Home:** a "Today at [company]" day board, with one row per intern on an 8 AM–5 PM timeline. Lunch segments are hatched, and a single "now" line is labelled only on the top row. Each row has a status chip.
  - **"To verify" panel:** emphasised, with "Verify all N" and its "i". Rows have a type label, a photo or file icon, and Reject / Return / Verify / Review / Confirm on its own.
  - **Weekly reports** has no designed screen yet. Build it in this style from the existing feature.

---

## 7. Coordinator portal (Section 11)

References: `F11_C1`, `C2`, `C3`, `C5`, `C6` (tablet) and `C7` (computer), plus `F13_V3.png` for the motif.

- **Remove points and targets from every coordinator screen.** The KPI targets feature (migration 043, `KpiTargetsDialog`, `kpiDefinitions.ts` targets) must not be left as a ghost:
  - Remove the dialog, its route and the client code.
  - Keep the table: migrations are history, so do not drop it.
  - If "Behind schedule" needs a threshold, keep it as an internal constant or setting, documented in `DEVELOPING.md`.
- Remove the "Live" label.
- **Phone:**
  - Navy header ("Home", "Week N of M · [college · program]").
  - Navy dock with a gold active pill: Home · Decide · Trainees · Reports · More.
  - **Home, in order:**
    1. The cohort route card with the college seal (or the PSU seal when no filter is set).
    2. **Needs you**, made stronger:
       - a red count tile and a red-tinted card
       - the first item emphasised with a red left rule and a solid red "Decide" button
       - the other rows in code + title + age + "Open" form
    3. The split fact card: Timed in today; Waiting on supervisors.
  - **Deciding an appeal (C2):** a timeline of the day, then two choices: "Uphold, keep the decision" and "Overturn, undo it". The send button reads "Send decision to [trainee] and their supervisor".
  - **More (C3):** search at the top, then Decide, People, Term (Term setup, Schedules and holidays, Deliverables, Evaluation form, Site visits), Talk and Reports, then the profile, Help and Sign out.
- **Tablet and computer:**
  - **Side menu:** navy `#121A5E`, with a search box ("Find anyone", `/` shortcut). Collapsible, text-first groups with no decorative icon tiles:
    - **Home**
    - **Decide:** Appeals, Flagged logs, Complaints
    - **People**
    - **Term**
    - **Talk**
    - **Reports:** Analytics, audit log, system status
  - **Filters row:** college · program, term, companies, saved views.
  - **Cohort route card**, with the college seal when a college filter is set and the program mark beside it.
  - **Needs you**, with "Open Decide".
  - **"This week" list** (MOA due, site visits, journals close, holidays). Build it from existing data: deliverable due dates, site visits, holidays and term dates. Add a small console endpoint if needed.
  - **Plain fact cards:** each one is a count, one line of context and an "i". There are no targets, deltas or scores.
- **Not designed yet; build them in this style from the existing features:**
  - Import accounts
  - Reset passwords
  - Account details
  - Institution details for the Time Record, with a seal picker that uses the PSU set

---

## 8. Every device, every role

Breakpoints:
- **Under 768 px:** phone layout with the dock.
- **768–1279 px:** tablet layout with a collapsible side menu. On portrait tablets the menu collapses to a rail with labels shown on expand.
- **1280 px and up:** computer layout with the full side menu.

Test widths: 360, 390, 430, 768, 820, 1024, 1180, 1280, 1440 and 1920 px, for all three roles and the landing page. There must be no horizontal scroll and nothing hidden behind the dock. Respect the safe-area insets on iPhone, and keep installed-PWA standalone mode correct.

---

## 9. Coverage gaps to close

Reference: `F12_R12.png`. Build these too, in the new style, using existing backend features:

- trainee first-run onboarding
- supervisor weekly reports
- coordinator import accounts, reset passwords, account details and institution details
- push and email digest settings

Help answers tagged by screen and device detection are client-side, as described above.

---

## 10. Verify, then report

1. Run, from the repo's scripts:
   - **Frontend** (`my-pwa`): `npm run lint`, `npm run build` and `npm run check:pwa`.
   - **Backend:** its tests and type check. Apply the new migration to a local database and run it twice to prove it is idempotent.
   - **End to end:** if `e2e/` can run locally, run it.
   - Fix whatever you broke.
2. Use Playwright (already in the repo for e2e) to screenshot the landing page and each role's main screens at 390, 820, 1180 and 1440 px. Save them to `internet-revisions/after/`, then compare each against `design/screens/` by eye and fix clear mismatches.
3. Grep for leftovers:
   - `linear-gradient`, `radial-gradient` and `bg-gradient-` in UI code (logos excepted)
   - the stand-in seal
   - `KpiTargets`
   - hard-coded sample names
   - "Live"
4. Update `DEVELOPING.md`: the brand tokens, the marks registry, the new migration, and the removal of KPI targets.
5. Write `internet-revisions/REVISION_REPORT.md` with:
   - what changed, by section, with file lists
   - the results of the commands
   - anything not done and why
   - follow-ups for the OJT office: the assets still missing (from `MISSING_ASSETS.md`) and the confirmations needed
6. Commit. Do not push and do not deploy.
