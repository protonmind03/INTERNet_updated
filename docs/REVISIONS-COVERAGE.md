# Trainee revisions: what was asked, where it is, what checks it

This review covers three sources of instructions, line by line:

- `INTERNet_Revisions-Enhancements.docx`
- the photos of the university's forms in `Docu-20261107T183655Z-1-001/Docu`
- `change1108.txt`

For each item it gives where the item now lives and the test that checks it. Neither the docx nor the photos are in git, because they hold a real student's personal and health data.

The status column uses these words:

- **Done**: built and checked by a test.
- **Done (manual)**: built, but it has to be checked by hand or on a real phone.
- **Waiting**: needs something from the team first.

E2E specs are in `e2e/tests/`. Backend tests are in `backend/test/api.test.cjs`, cited by test title.

## 1. Revisions-Enhancements.docx

| # | Asked for | Where it is | Checked by | Status |
|---|---|---|---|---|
| 1.1 | Folder-like UI across the trainee portal, in the trainee colours, phone and web | `pages/student/StudentFolder.tsx`, `hubs.ts`, `layouts/StudentLayout.tsx` | `student-folder.spec.ts` (every address, both widths) | Done |
| 1.2 | Today: non-generic design | Priority stack, Up next cards, hours strip (`dashboard.tsx`, `AttentionCard.tsx`, `UpNextCarousel.tsx`) | `today.spec.ts` | Done |
| 1.3 | Attention items stay until handled; x top-left; confirm on first hide with urgency and why; "Don't ask me again during this session"; Clear all | `AttentionCard.tsx`, `attention.ts` | `today.spec.ts` | Done |
| 1.4 | OJT hours shrunk, above the shortcuts | `dashboard.tsx` HoursStrip | `today.spec.ts` (Up next, layout) | Done |
| 1.5 | Up next as swipeable cards above the hours | `UpNextCarousel.tsx` | `today.spec.ts` | Done |
| 1.6 | Scan button left of the bell for "Time in from your phone" | `ScanButton.tsx` | `student-folder.spec.ts` (QR on computer, next step on phone) | Done |
| 1.7 | Attendance enhanced, This week especially | `ThisWeek.tsx` | `journeys.spec.ts` (attendance) | Done |
| 1.8 | Schedule moved into Attendance | Folder tab `/schedule` | `student-folder.spec.ts` | Done |
| 1.9 | My progress enhanced | `ScheduleProgress.tsx` (rebuilt again for change1108, see 3.4) | `journeys.spec.ts` (My progress) | Done |
| 1.10 | Documents, reports and Completion under Tasks; Time record moved into Attendance | `hubs.ts` (Reports became its own folder in change1108, see 3.5) | `student-folder.spec.ts` | Done |
| 1.11 | Distinct sub-modules | Each tab is its own page with its own filters | `student-folder.spec.ts` | Done |
| 1.12 | Weekly Report renamed to cover Daily, Weekly and Monthly reports, with photos and autosaved drafts | `ProgressReports.tsx`, `DailyReports.tsx`, `MonthlyReports.tsx` | `reports.spec.ts`; backend: "daily and monthly progress reports and the narrative's parts" | Done |
| 1.13 | In-app camera; offline photos kept on the phone, sent later, trainee told | `lib/pendingPhotos.ts`, `DailyReports.tsx` | `reports.spec.ts` (offline photo) | Done (manual on a real phone) |
| 1.14 | Album in Profile, by date and source | `pages/student/Album.tsx` | `reports.spec.ts` (album); backend: album test | Done |
| 1.15 | Help out of the menu, all of it under the header's Help | `components/ScreenHelp.tsx` | `student-folder.spec.ts` | Done |
| 1.16 | Feedback inside the Resolution Center, plus an Internship Evaluation part | `ResolutionCenter.tsx`, `InternshipEvaluation.tsx` | `student-folder.spec.ts`; `journeys.spec.ts` | Done |
| 1.17 | "Messages" group renamed "Support" | `hubs.ts` | `student-folder.spec.ts` | Done |
| 1.18 | Narrative Report builder in the order of the table of contents | `Narrative.tsx`, `narrative/*` | `narrative.spec.ts`, `change1108.spec.ts` | Done |

## 2. The Docu photos (the university's forms)

| Photo | Form | In INTERNet | Checked by | Status |
|---|---|---|---|---|
| 1–2 | Table of Contents (letterhead) | Narrative outline and printed letterhead (`narrative/model.ts`, `NarrativePrint.tsx`) | `narrative.spec.ts` | Done |
| 3–5 | Memorandum of Agreement | Listed in the binder; uploaded in Documents | `narrative.spec.ts` (requirements list) | Done |
| 6, 31 | FM-AA-INT-01 Application for Internship | Fill and print (`PrintForms.tsx`) | `change1108.spec.ts` (pre-OJT forms) | Done |
| 7, 32–34 | FM-AA-INT-02 Certification of Units Earned | Fill and print: name, course and major filled in, the courses-earned table (by year and term), courses still to take and the certification left for the registrar; the certified copy is uploaded in Documents | `change1108.spec.ts`; `narrative.spec.ts` (requirements) | Done |
| 9 | FM-AA-INT-03 Consent Form | Fill and print | `change1108.spec.ts` | Done |
| 10 | FM-AA-INT-06 Endorsement Letter | Uploaded (issued by the university) | requirements list | Done |
| 11–14 | CS Form 212 Personal Data Sheet (resume) | Uploaded | requirements list | Done |
| 15 | Internship Release Form | Fill and print | `change1108.spec.ts` | Done |
| 16–17 | Medical and psychological certificates | Uploaded; never in the album or exports | backend: album test (excludes health documents) | Done |
| 18 | CS Form 48 Daily Time Record | Time record (`TimeRecord.tsx`, `DtrSheet`) | `journeys.spec.ts` (time record columns) | Done |
| 19–20 | FM-AA-INT-17 Internship Timeframe | From the verified days (`forms/recordForms.ts`): Fill and print → From your record, and the Narrative report's requirement list; Print, Save as PDF or Word | `change1108.spec.ts`; `narrative.spec.ts` | Done |
| 21 | FM-AA-INT-18 Training Agreement and Liability Waiver | Fill and print | `change1108.spec.ts` | Done |
| 22–25 | FM-AA-INT-19 Practicum Weekly Report | From the weekly reports (one table for the whole OJT): Fill and print → From your record, and the Weekly reports page; Print, Save as PDF or Word; long weeks carry onto the next page with the column names repeated | `change1108.spec.ts`; `reports.spec.ts` | Done |
| 26 | FM-AA-INT-20 Student Intern's Feedback Form | Resolution Center → Internship evaluation, with the printed form beside the questions (Print, Save as PDF or Word); linked from Fill and print; the coordinator reads it and is notified | `change1108.spec.ts`; backend: feedback form test | Done |
| 27–28 | FM-AA-INT-13 Internship Evaluation (weighted, grade) | Supervisor's final evaluation; trainee's evaluation tab (`?side=supervisor`, linked from Fill and print); the university's two-page form with the rating circled, Print and Save as PDF or Word for the trainee, supervisor and coordinator | backend: "a weighted form (FM-AA-INT-13)" (grade 91) | Done |
| 29–30 | Certificate of Completion | Uploaded (issued by the company) | requirements list | Done |
| none | Internship Agreement; Training Supervisor's Feedback Form | Listed as "To follow" | none | Waiting (no photo) |

## 3. change1108.txt

| # | Asked for | Where it is | Checked by | Status |
|---|---|---|---|---|
| 3.1 | Title Page, Dedication, Acknowledgement and Company Profile drafted in a way that fits their variety; the others follow the photos | Guided builders: Title Page in 3 layouts; Agency Profile fields; Org Chart from boxes or an album photo; Services list; prompts and starting drafts for Dedication and Acknowledgement (`narrative/structured.ts`, `Builders.tsx`) | `change1108.spec.ts`; backend: guided-part fields | Done |
| 3.2 | Do the suggested next steps | Supervisor and coordinator read daily and monthly reports; weekly review shows the week's days; coordinator reads FM-AA-INT-20; Fill and print for Application, Consent, Release and Waiver | `change1108.spec.ts` | Done |
| 3.3 | No duplicated Support items between menu and folder; no stray "Back to attendance" | Menus list only folders; page actions live in the folder rim; on a phone the folder's label is left out inside a folder (the header names the page); Days is titled "Days", not a second "Attendance" | `student-folder.spec.ts` | Done |
| 3.4 | My progress understandable | Rebuilt as: journey road with milestones; where the hours are; pace with verdict; chart with empty state; rhythm | `journeys.spec.ts` | Done |
| 3.5 | Side nav regrouped; collapsed by default, opens on hover, narrower; Profile stays a badge with a tooltip; folder margins halved | `RoleShell` `rail="hover"`; Reports folder; `brand.css` | `student-folder.spec.ts` (rail, width 68 to 208 px, page does not move, tooltip, keyboard, Escape) | Done |
| 3.6 | Features work across roles | Daily/monthly reports to supervisor and coordinator; FM-AA-INT-20, narrative progress and report photos to the coordinator, with a notification for the form; notification links for every portal. On purpose: the supervisor is not notified of each daily report (noise), and what is typed into the printable forms stays on the trainee's device | `change1108.spec.ts`; backend: notification contract, feedback form | Done |
| 3.7 | "Needs your attention" presented better | Priority stack with urgency stamps, arrows, See all | `today.spec.ts` | Done |
| 3.8 | Non-generic icons and button figures | Duotone set with the accent lit on the current page; the most-seen glyphs redrawn from the system's own objects (stopwatch, notched ticket, sealed report, two bubbles, open book, completion seal, arched door); buttons pressed into the page (`components/Icon.tsx`, `ui.tsx`, `brand.css`) | Visual; every page renders them | Done (manual review) |
| 3.9 | Every Docu instruction implemented and verified | This document | Sections 1–2 | Done (two forms waiting) |
| 3.10 | Font and card scale suited to each other; more character | Slim top bar in all three portals; display-face folder names; logbook canvas, stamps and road motifs in the trainee portal; button sizes evened (small buttons 13 px) | Visual | Done (manual review) |

## Waiting on the team

- Photos of the university's **Internship Agreement** and **Training Supervisor's Feedback Form**.
- Checks on real phones:
  - camera capture;
  - offline report photos;
  - "Save to phone" on iPhone;
  - the hover rail on a touch tablet (it opens with its button there).
