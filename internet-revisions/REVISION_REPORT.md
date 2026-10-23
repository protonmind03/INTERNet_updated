# PSU redesign: revision report

Branch `revisions/psu-redesign`, from `ui-redesign` at `ba98e26`. Written 2026-10-23.
**Nothing has been pushed or deployed.** Production (`main`) and the test site
(`ui-redesign`) are unchanged.

| Commit | What |
|---|---|
| `459c5b0` | Phase 1: visual system, "beyond gradients" |
| `8bd6543` | Phase 2: PSU seals and organisation marks, migration 071 |
| `af94884` | Phase 3: landing page |
| `a0cb186` | Phase 4: sign-in pages |
| `a6653ed` | Phase 5: trainee portal and in-app help |
| `e585599` | Phase 6: supervisor portal |
| `6f423b0` | Phase 7: coordinator portal, KPI targets removed |
| `0f01043` | Menu review across the three portals (asked for after Phase 7), with Phases 8–10 checks and docs |
| `af65713` | Supervisor Review: no second set of counts beside the menu |

---

## 1. What changed, by section

### Visual system (Section 13, Phase 1)

- **Per-role tokens.**
  - `my-pwa/src/brand/tokens.ts` holds the palette, surface, scale and status tokens for each role:
    - trainee: terracotta `#A84A0C` with gold
    - supervisor: green `#116C5C`
    - coordinator: indigo `#4F46E5` with navy chrome `#1A237E`
  - `brand.css` generates one `[data-role]` block per role.
  - Those blocks redefine `--color-psu-*`, so existing components take the current role's colour without being edited.
- **Flat surfaces.**
  - No gradients: hairline cards, and SVG grain on the page canvas.
  - The motifs live in `brand/motifs.tsx`: stamp, lane dash, punch row, tear line, hours road, register, underline tabs, route line, departures board, split facts.
- **The "i" tooltip** (`components/InfoTip.tsx`).
  - It is the only tooltip in the app.
  - It opens after 0.6 s of hover or on keyboard focus, and closes on leave.
  - `components/Tooltip.tsx` was removed.
- **Status colours.** Status chips (`StatusBadge`, `.st-badge`) never use a role colour, and always carry a word.
- **Files:**
  - `brand/{tokens.ts,brand.css,motifs.tsx,roles.ts,PortalHeader.tsx,RouteProgress.tsx}`
  - `index.css`
  - `components/{ui.tsx,InfoTip.tsx,NotificationBell.tsx,ComposeMessage.tsx}`
  - gradient removal on student, supervisor and coordinator pages

### PSU seals and organisation marks (Section 2, Phase 2)

- **The marks.**
  - 46 PSU mark files are in `my-pwa/public/brand/psu/`, at 512 px and 128 px.
  - The service worker caches them on first use (`psu-marks-v1`).
- **Registries.**
  - `my-pwa/src/brand/psuMarks.ts` (app) and `backend/src/services/psuMarks.ts` (server) list the same keys.
  - A test checks that the two agree and that every listed file ships.
- **Migration `071_psu_marks.sql`.**
  - Adds `mark_key` to colleges, programs and majors, and `org_name` to programs and majors, with a format CHECK.
  - Fills these only where empty.
  - Adds BSEd majors (English, Filipino, Science, Social Studies) if they are missing.
  - It is additive only; nothing is dropped.
- **Where the marks are used.**
  - Coordinator: choose a program's mark and organisation name (`Programs.tsx` + `components/MarkPicker.tsx`).
  - Seal on the Time Record, from the PSU set (Institution details on the coordinator's Account page).
  - `components/DtrHeader.tsx` prints the chosen seal.

### Landing page (Sections 1–5, 8A, 9B, Phase 3)

- **New sections:** night-sky hero rotating the three roles, Portals, How it works, Get the app (detects the device), "Try to fool it" (10 verified attendance rules), and an install card.
- **Files:**
  - `my-pwa/src/landing/{Landing.tsx,Screens.tsx,content.ts,main.ts,download.ts,landing.css}`
  - the three role manifests
- **Script size:** the landing script is 11.3 kB (4.1 kB gzipped); the limit is 90 kB.

### Sign-in (Section 6, Phase 4)

- Phone-first doors for each role (`pages/Door.tsx`):
  - the trainee desk shows a QR hand-off to a phone
  - the supervisor desk shows the queue
  - the coordinator sees a card over a blurred console
- "Keep me signed in" (`lib/keepSignedIn.ts`) and "Forgot password?".
- `brand/LoginScreen.tsx` was removed.

### Trainee portal (Sections 7, 8B, Phase 5)

- **One shared shell for all three portals** (`components/RoleShell.tsx` + `components/RoleDock.tsx`):
  - flat header with Help and the bell
  - a dock of four destinations plus More on phones
  - a side menu in the role's colour on tablets and computers
- **Today** (`pages/student/TodayCard.tsx`).
  - The day as a punched time card, with the step buttons.
  - Then "Needs you", OJT hours, shortcuts and Up next.
- **Attendance** (`dailylog.tsx`).
  - Week bars, filter chips and log rows.
  - Retake is solid amber; Appeal is outlined.
- **Help for this screen** (`components/ScreenHelp.tsx`, `lib/helpAnswers.ts`), plus the Help centre (`pages/Help.tsx`).
- **Messages page.** It is backed by `GET /api/messages/threads`.
- **Removed:** the old folder shell, dock, day status, figure cards and attendance tiles. They were replaced, not left unused.

### Supervisor portal (Section 10, Phase 6)

- **Review queue** (`pages/supervisor/dashboardsp.tsx`, `ReviewParts.tsx`):
  - a day board (computer) or register (phone)
  - decision cards: Reject asks "photo or day" in one menu
  - "Confirm on its own" for time-ins recorded offline, which are never included in "Verify all"
  - a sticky verify bar
  - grey "Verified" stamps
- **Intern page:** summary, quick actions and underline tabs.
- **Messages page**, with "Message the coordinator".

### Coordinator portal (Section 11, Phase 7)

- **Home** (`pages/coordinator/Dashboard.tsx`):
  - the cohort route card, with the college or PSU seal and the program mark
  - "Needs you" as a departures board, with appeals first and a solid red Decide
  - "This week"
  - plain fact cards
- **Data for Home.** It comes from the new `GET /api/coordinator/home` (`backend/src/services/coordinatorHome.ts`).
- **Appeal decision (C2):** a timeline of the day, Uphold or Overturn, and "Send decision to [trainee] and their supervisor".
- **KPI targets removed.**
  - Removed: the dialog, `PUT /api/coordinator/kpi-targets`, and the target logic in `kpiDefinitions.ts` and `kpis.ts`.
  - The `kpi_targets` table is kept: migrations are history.
- **"Find anyone" search.** In the side menu and in More; `/` or Ctrl K jumps to it.
- **Restyled:**
  - Messages page
  - Institution details with the seal picker
  - Import accounts, Reset password and Account details screens

### Menu review across the three portals (asked for after Phase 7)

You reported that one click in the coordinator's menu did two things, and that the same section bar appeared twice. A script that clicked every menu entry for every role confirmed it, and found more:

- **Two entries lit for one page.** For example, Appeals also lit Concerns, and Supervisors also lit Companies.
- **Clicks opened another group.** Term › Term setup opened People, and Reports › Monitoring opened Decide.
- **Hub tabs repeated the side menu.**
- **Help left the portal** and asked "I'm a…" again.
- **Menu names didn't match page titles.**

The fix is a set of rules, now in `DEVELOPING.md` ("Navigation: one page, one entry, one name"):

- **One current entry.** It is chosen by the whole address (`lib/navMatch.ts`), for the side menu, the dock and More. Only that entry's group opens.
- **Hubs only join pages of one menu group** (`pages/coordinator/hubs.ts`).
  - Evaluations, Site visits, Terms, Coordinators, Audit log and System status are their own pages again.
  - Their old tab addresses redirect, keeping whatever else the address carried.
- **No section bar twice.**
  - When the side menu is open it lists a page's sections, so the page doesn't repeat them (`HubNav`, `components/UnlessInMenu.tsx`, `components/sideMenuState.ts`).
  - Filters are chips; sections are underlined tabs.
- **Labels match page titles.**
  - Concerns, Deliverables, Submissions, Holidays, System status, Needs attention.
  - Trainee: Weekly report, Feedback.
  - Supervisor: Submitted tasks, documents and reports.
- **Profile is the account row** (foot of the side menu, bottom of More) for every role. Coordinators could not reach their Account on a phone before.
- **Help stays inside the portal:** `/student/help`, `/supervisor/help`, `/coordinator/help` (`pages/PortalHelp.tsx`).
- **State that picks an entry is in the address.** Monitoring's scope and the supervisor's Review tab survive a reload and Back.

#### Regressions from Phases 5–7, found and fixed

- **Notification spotlights.** `?spot=` links to a control, such as "retake your photo", had stopped working. The hook was dropped when the trainee layout was rebuilt.
- **Time out during lunch.** The old Attendance tiles allowed it; Today's card now does again.
- **"Missed time-out" spotlight targets** were restored.
- **Supervisor's coordinator contact card.** It only lived in the old account menu; it is back, on Profile.
- **Supervisor queue buttons.** Every button read only "Review". Each now names the item, for example "Review Absence · Tue, Nov 10, Demo Student", and still starts with the visible word.
- **Supervisor Review layout.**
  - The day board shows only on the full queue, at 6 rows until "Show all".
  - The summary cards that repeated the menu's counts show only while the menu is closed.
  - "Submitted reports" is a menu entry with its own count (`/api/supervisor/review-count` gains `by_kind`; this is additive).
- **Layout shift while the first page loads.**
  - Coordinator Home: 0.166 → 0.047.
  - Supervisor Review: 0.138 → 0.01.
  - Both are now under the 0.1 limit.
- **One level-1 heading on a student's record**, not two.
- **Key figures on Analytics** are headings again.
- **Tables no longer widen the page on phones.** An off-screen column label escaped its scroll container (`relative` added on 11 table containers). The row menu button is now 44 px.
- **Duplicate term control.** The Students page had both the term switcher and the filter bar's own Term field. The switcher is removed.
- **Backend:** the unpaged student list now breaks name ties by student ID, so its order is stable.

---

## 2. Command results

| Check | Result |
|---|---|
| `my-pwa`: `tsc -b` | clean |
| `my-pwa`: `npm run lint` | clean |
| `my-pwa`: `npm run build` | built |
| `my-pwa`: `npm run check:pwa` | 146 passed, 0 failed |
| Landing script size | 11.3 kB (4.1 kB gzipped), under 90 kB |
| Backend tests (`node --test test/api.test.cjs`, local DB, API on 5001) | 271 passed, 0 failed |
| Backend `check:route-tests` | all 247 routes named by a test |
| Backend `docs:architecture -- --check` | matches the code (regenerated) |
| Backend `lint` (time zones) | clean |
| Backend strict type check | 6 errors, the same 6 as before the redesign (`extensions.ts` 1, `server.ts` 5); none new. The backend has no tsconfig and CI does not type-check it. |
| Migration 071, applied twice by hand, then the runner twice | applies cleanly both times; the runner skips it once applied |
| E2E, against the production build (`vite preview` on 4173), the way CI runs it | 82 passed, 3 skipped, 0 failed |
| Responsive sweep: every role's pages and the landing page at 360, 390, 430, 768, 820, 1024, 1180, 1280, 1440 and 1920 px | no horizontal scroll; no control left under the dock (after the table fix) |
| Navigation audit: every side, dock and More entry clicked for each role | one entry lit, no group jumps, Help inside the portal; only filters and page numbers remain beside the menu |
| Leftover grep: `linear-gradient` | only CSS masks that fade a scrolling row's edges (`brand.css`, `index.css`); no visual gradients |
| Leftover grep: `radial-gradient`, `bg-gradient-`, "stand-in seal", `KpiTargets` | none |
| Leftover grep: hard-coded sample names | only in the dev-only brand preview and in the import CSV templates' example rows |
| Leftover grep: "Live" | none shown; one internal error message (`Live notification connection failed`) |

About the e2e numbers:

- **The 3 skips depend on the time of day.** For example, today's time-in window is already closed, or the demo trainee already has a log today.
- **Run it against a production build.**
  - Against the dev server, the camera and offline-landing tests fail: they need the hashed assets and the service worker.
  - Locally, the second demo trainee needs `npm run db:seed-demo` in `backend` (CI seeds it).
- **One test depends on order.** "A supervisor with interns of one program and block…" needs the "a block is made" journey to run first, as it does in the full suite.

**Screenshots** are in `internet-revisions/after/`: 56 files covering the landing page, three sign-in doors and each role's main screens at 390, 820, 1180 and 1440 px.

- They were compared against `design/screens/` while each phase was built.
- The final set was spot-checked, not compared board by board.

---

## 3. Not done, or done differently, and why

- **Wording that differs from the brief, for consistency.** Your request after Phase 7 put consistency first, so where the brief's word differed from the page's own name, the page's name won:
  - "Trainees" → "Students" (coordinator dock)
  - "Incidents" → "Concerns"
  - "Weekly journal" → "Weekly report"
  - "Flagged logs" → "Needs attention": that view covers flagged logs and overdue tasks, so "flagged logs" would be inaccurate
  - "Evaluation form" → "Evaluations"
  - "Term setup" → "Terms"
  - "Schedules and holidays" → "Holidays": schedules are set in Programs and Students
- **Profile in More.** The brief lists Profile among the trainee's More entries; it is now the account row at the bottom, the same for every role.
- **Supervisor phone header.** It names the page ("Review"); the greeting by name shows on the computer title bar.
- **ECOSOC logo not shipped or seeded.** The supplied file belongs to Palawan State University (see `MISSING_ASSETS.md`).
- **Not built:**
  - **A standalone Staff notes page.** Notes stay on each intern's page, where they are written.
  - **A "Missing documents" fact on Home.** There is no reliable count for it yet.
  - **Passkey sign-in on the door.** It is not in the existing backend; passkeys still sign steps, as before.
  - **"Already installed" detection on the landing page.**
  - **A "decide by" date on appeals.** Appeals have no deadline in the system; Home shows the oldest appeal's age instead.
- **The Time Record has no PDF export.** It prints from the browser, with the chosen seal; the analytics PDF still uses the bundled seal.
- **"Keep me signed in" off works per browser session.** A new tab counts as a new session.
- **Two existing problems, left as they were:** the 6 backend strict type errors (see above), and the order-dependent e2e test.

---

## 4. Follow-ups for the OJT office

### Assets to supply

| What | Why |
|---|---|
| PSU Lingayen **ECOSOC** (AB Economics) logo | The supplied file is another university's. ABEcon shows a monogram until then. |
| **CBPA college seal** | Missing; the coordinator's crest shows a "CBPA" monogram. |
| BSEd program-level organisation logo | Only the majors' logos were supplied; BSEd students with no major show the CTE seal. |
| Transparent PNG or SVG versions of CLICS, MC, SFITI, YPAG and ECOSOC, and the wide or badge marks CTHM, LG, FRHC, EC and KMAP | The supplied JPGs had backgrounds, and these can't sit on coloured surfaces. |
| Higher-resolution AFET (317 px) and FNDC (552 px) | They look soft at large sizes. |
| A larger or vector **PSU seal** | For the printed Time Record (the current one is 447 px). |

### Names and facts to confirm

| Item | Question |
|---|---|
| Hospitality college | "College of **Tourism and Hospitality** Management (CTHM)" on the logo, or "College of **Hospitality and Tourism** Management (CHTM)" in the system? |
| BTVTEd organisation | "ATTES" (on the seal) or "ATVTES" (the file name)? |
| EC | Is EC (Environmentalists) the BSEd Science organisation? |
| KMAP | The organisation's full name. |
| BSEd Mathematics | Does Lingayen offer it? If so, its organisation logo is needed. |
| BS Tourism Management | Is there a Tourism program at Lingayen? If so, its organisation logo is needed. |
| Major organisations | Do BSBA, BIT or BS Math majors have their own organisations, or does the program-level one cover them? |

### Before this goes live

- Take a database backup before migration 071 reaches production. It is additive and safe to run twice, but there are no Railway backups.
- Push to the test site (`ui-redesign`) first and check it on real phones: passkeys, camera check, offline time-in.
- Only then move it to `main`.
