# PSU redesign: plan

Branch `revisions/psu-redesign`, cut from `ui-redesign` (ba98e26). One commit per phase.
This maps each board in `design/` to the files that carry it today and says what changes.
The repo's rules win on *how* (DEVELOPING.md, the source tests in `backend/test/api.test.cjs`
that read the app's files); the brief decides *what*.

## Phase 1: visual system (F13_V0–V3)

| Board | Files | Change |
|---|---|---|
| F13_V0 rules | `my-pwa/src/brand/tokens.ts` (ROLE_PALETTES, new ROLE_CHROME/HAIRLINE/DOCK), `brand/brand.css` (`[data-role]` blocks), `src/index.css` (`.surface-brand`, `.surface-brand-bar`, `.app-canvas`, `--shadow-card`) | New per-role chrome, accent, paper, hairline and dock tokens. Gradients out of every surface; flat chrome; grain overlay (`.inb-grain`, SVG feTurbulence, 4.5 %); cards get a 1 px hairline instead of a shadow; only the dock and sheets keep a shadow. |
| F13_V0 stamps, status | `brand/motifs/Stamp.tsx` (new) | Text in a 2 px border, rotated −5°/−6°, in the status colour. |
| F13_V1 trainee | `brand/motifs/TimeCard.tsx`, `LaneDash.tsx`, `HoursRoad.tsx` (new) | Time card with tear line and punch row; lane-dash strip under the header; hours as a road with pin and flag. |
| F13_V2 supervisor | `brand/motifs/Register.tsx`, `UnderlineTabs.tsx`, `RuledHeader` CSS | Today's register, underlined tabs, ruled header lines, grey "Verified" stamp. |
| F13_V3 coordinator | `brand/motifs/RouteLine.tsx`, `Departures.tsx`, `SplitFacts.tsx` | Cohort transit line with initials and status rings, departures board with code column, split fact card. |
| Tooltips | `components/Tooltip.tsx`, new `components/InfoTip.tsx` | "i" button only, 0.6 s hover or focus, closes on leave. |
| Everything | `components/ui.tsx` (Card, Button, StatTile, PageHeader), the 17 files with gradients | Drop gradients and soft shadows; keep logos' own artwork. |

## Phase 2: PSU seals and organisation marks

| Item | Files | Change |
|---|---|---|
| Assets | `my-pwa/public/brand/psu/*` (from `assets/psu/web`) | Shipped; service worker precaches only `@128` files and `psu-seal.png` (`vite.config.ts` globPatterns / `service-worker.ts`). |
| Registry | `brand/psuMarks.ts` (new, from `marks.json`) | `getCollegeMark`, `getProgramMark`, `getMajorMark`, `PSU_SEAL`; case- and space-blind; CHTM ↔ CTHM; `replace` entries skipped. |
| Components | `brand/PsuSeal.tsx` (renders `psu-seal.png`), `brand/PsuMarks.tsx` (new: `CollegeMark`, `ProgramMark`, monogram fallback) | Real seal everywhere. |
| Database | `backend/migrations/071_psu_marks.sql` | `mark_key` on colleges, programs, majors; `org_name` on programs, majors; seeded without overwriting; BSEd majors English, Filipino, Science, Social Studies. |
| API | `backend/src/routes/academics*` (wherever colleges/programs/majors are served), types in `my-pwa` | `mark_key`, `org_name` read and written. |
| Picker | `pages/coordinator/Programs.tsx` | Choose a college's or program's mark from the shipped set. |
| Placements | Landing nav, coin, PSU strip, footer; sign-in footer; coordinator cohort card; trainee Profile; supervisor intern page; DTR header (`components/DtrHeader.tsx`, `lib/timeRecordHeader.ts`, jsPDF) | Only these. |

## Phase 3: landing (F01_R1D, R1E, R1F, F02_R2A, F03_R3B, F04_R4C, F09_R9B)

| Board | Files | Change |
|---|---|---|
| R1D hero | `src/landing/Landing.tsx`, `landing.css`, `main.ts`, `content.ts` | Night sky, skyline, textured road, three devices in a circle with real portal miniatures, arrows, gold switch button with tooltip, role indicator, floating notes, seal coin. |
| R1E portals | same | One card per role with motif cap, floating device, bullets, device chips, "i", "Get the … app"; navy PSU strip. |
| R1F phone | `landing.css` | Hero first with role chips, single device; cards stacked. |
| R2A how it works | same | White section; role switch restarts at step 1. |
| R3B get the app | same, `download.ts` | Per-device steps (iPhone and iPad together), Android/Apple marks, Detected badge via `navigator.userAgentData` with a UA fallback. |
| R4C checks | same | "Try to fool it" from rules that exist. |
| R9B footer | same | Navy, grain, install card, three columns, bottom row. |
| R5 installed | `pages/Door.tsx`, `lib/doors.ts` | No link back to the website in standalone mode. |

## Phase 4: sign-in (F06_R6A, W1–W3)

`pages/Door.tsx`, `brand/LoginScreen.tsx` (the form), `brand.css` door rules. Phone: one template, per-role header colour, chip, ID label, accent. Computer: trainee QR hand-off, supervisor review-queue framing, coordinator card over a blurred console. Keep keep-me-signed-in, forgot password, lockout, passkeys.

## Phase 5: trainee (F07_R7A, A2, A3, R7R; F08_R8B)

| Board | Files | Change |
|---|---|---|
| Header, dock | `layouts/StudentLayout.tsx`, `brand/PortalHeader.tsx`, `components/StudentDock.tsx` | Flat amber header with lane dash, bell only; cream dock Today · Attendance · Schedule · Tasks · More. |
| R7A Today | `pages/student/dashboard.tsx`, `DayStatus.tsx`, `TodayAttendance.tsx`, `FigureCards.tsx`, `TimeInFab.tsx` | Time card; red Needs you row; hours road with "i"; hairline shortcuts; Up next. |
| R7A2 Attendance | `pages/student/dailylog.tsx`, `AttendanceCorrections.tsx`, `PhotoRedo.tsx` | Week bars, filters All / To fix / Pending / Verified, log rows with badges; Retake solid amber with camera icon, Appeal outlined. |
| R7A3 More | `StudentDock.tsx` MoreSheet | Grouped My OJT / Messages / Support, account and Sign out. |
| R8B help | `lib/screenHelp.ts` (new, next to `offlineHelp.ts`), `components/ScreenHelp.tsx` | Help pill and sheet per route; "All trainee help", "Message your supervisor". |
| Wide | `StudentLayout.tsx` | Two columns, larger time card, QR hand-off on computers. |

## Phase 6: supervisor (F10_S1, S2, S3, S5, S6, S7)

| Board | Files | Change |
|---|---|---|
| Dock, side menu | `layouts/SupervisorLayout.tsx` | Green dock Review · Interns · Tasks · Attendance · More; green side menu with company chip and exclusive accordion groups. |
| S1 Review | `pages/supervisor/dashboardsp.tsx`, `TodayStrip.tsx`, `attendance.tsx` | Register, underlined tabs, one card per decision, offline chips and "Confirm on its own", sticky Verify-N bar, Verified stamp. |
| S2 intern | `pages/supervisor/InternPage.tsx` | Hours, quick actions, tabs, program mark. |
| S3 More | `SupervisorLayout.tsx` | Grouped sheet. |
| S6/S7 wide | `dashboardsp.tsx` | Day board 8 AM–5 PM with hatched lunch and one "now" line; To verify panel; this week; fact cards. |
| Weekly reports | `components/WeeklyReport.tsx`, supervisor journals page | Built in this style. |

## Phase 7: coordinator (F11_C1, C2, C3, C5, C6, C7)

| Board | Files | Change |
|---|---|---|
| Targets out | `pages/coordinator/KpiTargetsDialog.tsx`, `KpiCards.tsx`, `kpiDefinitions.ts`, the targets route | Removed; table kept; behind-schedule threshold documented. |
| Chrome | `layouts/CoordinatorLayout.tsx`, `HubNav.tsx`, `hubConfig.ts` | Navy header and dock with gold pill; navy `#121A5E` side menu with search and text-first collapsible groups. "Live" removed. |
| C1/C6/C7 Home | `pages/coordinator/Dashboard.tsx`, `FilterBar.tsx` | Cohort route card with seal and program mark; Needs you (red tile, first row emphasised); split facts; This week list (new console endpoint if needed); plain fact cards. |
| C2 appeal | `pages/coordinator/Appeals.tsx` | Timeline, Uphold / Overturn, "Send decision to …". |
| C3 More | `CoordinatorLayout.tsx` | Search, grouped list, profile, Help, Sign out. |
| Not designed | `ImportAccounts.tsx`, `ResetPassword.tsx`, `components/AccountDetailsForm.tsx`, `InstitutionCard.tsx` | Built in this style; institution seal picker from the PSU set. |

## Phase 8: every device

Breakpoints: under 768 px phone with dock; 768–1279 px collapsible side menu (rail on portrait tablets); 1280 px and up full menu. Checked with `e2e/revision-shots.mjs` at 360–1920 px.

## Phase 9: coverage gaps (F12_R12)

Trainee onboarding (`components/Onboarding.tsx`), supervisor weekly reports, coordinator import / reset / account / institution, push and email digest settings (`components/PushNotificationSettings.tsx`, `NotificationPreferences.tsx`), all restyled on the new tokens.

## Phase 10: verify and report

Lint, build, `check:pwa`, backend tests and type check, migration twice, e2e, screenshots to `internet-revisions/after/`, leftover greps, `DEVELOPING.md`, `REVISION_REPORT.md`.
