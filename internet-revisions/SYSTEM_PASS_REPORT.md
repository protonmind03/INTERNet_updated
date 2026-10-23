# System pass: whole-system review and enhancement

Branch `revisions/system-pass`, on top of `revisions/psu-redesign`. Written 2026-10-24.
**Nothing has been pushed or deployed.**

## How the system was assessed

- **Every page, both sizes.** A script signed in as each role and photographed every page on a computer (1440 px) and a phone (390 px): 15 trainee pages, 12 supervisor pages and 21 coordinator pages.
- **The landing page at 100% zoom** in the three most common desktop sizes (1366×768, 1920×1080, 1280×800), and on a phone.
- **The three sign-in pages** at 1366×768 and on a phone.
- **Two automated checks:**
  - every menu entry clicked for every role (one entry lit, no group jumping);
  - every page at ten widths (no sideways scroll, nothing under the dock).

## What was wrong, and what changed

### Landing page

| Found | Fixed |
|---|---|
| No call to action in the first screen; at 1366×768 the role controls fell below the fold | **Open your portal** and **Get the app** in the hero. On short laptop screens the stage is shorter and the devices scale, so the whole first screen fits. |
| The caption read "Trainee on a phone ." | One clean phrase |
| At 1920 px the road's lane dashes ran through the role tabs | The tabs sit on a pill |
| "Open thetraineesign-in to install" | Spaces kept |
| The trainee card's "Phone first" label was covered by the phone image | Label above the image |
| "Weekly journal" in the mockups and How it works | "Weekly report", as in the app |

### Sign-in pages

- **One template for all three doors.** The coordinator's door was a different design, a card over a blurred console, and it ran off the bottom of a 768 px screen. It now uses the same split page as the trainee and supervisor doors, in navy, with the console's four tools listed in the panel.
- **Every door is titled "Sign in".**
- **The PSU line no longer leaves a dangling "·"** when the home link wraps.
- **The trainee door says "weekly report", not "journal".**

### A visual language for the whole system

Cards, headers and lists were all the same plain white, whatever they meant. The new kit is in `my-pwa/src/components/display.tsx` and `tones.ts`:

- **Tones with one meaning each:**
  - **brand** is the role's colour, for plain subjects.
  - **info, success, warning and danger** are the status colours. They are never a role colour, and always appear with words.
  - **neutral** is for what needs nothing.

  A count of work waiting on you is amber only while it is above zero.
- **Icon tiles.** Every card header (39 of them) names its subject with an icon, and the same subject always gets the same icon.
- **Metric card:** subject icon, the figure, a meter for a share, one line of context, an "i" for what is counted, and a link to act.
- **Summary tiles.** Where a list has counted filters, the counts are the filter. **Count tiles** have the same look for counts that only inform.
- **Section titles and "On this page"** navigation for long pages.
- **New icons** for figures: hourglass, inbox, layers, shield, pie, trend-up, map-pin, list.

### Analytics, rebuilt

- **Seven titled sections**, with an "On this page" bar that follows the reader: Key figures, Attendance, Progress, Partner companies, Programs and blocks, Students, Concerns and evaluations.
- **The six key figures are metric cards.** Each has a subject icon, a meter for a share and "See the list". They remain plain figures, never coloured as a score.
- **The period summary is a highlighted sentence.** The log review uses the status colours, and how photos were taken is shown as icon rows.
- **The Students table now has:**
  - status tiles with counts that filter it (At risk, Behind, On track, Completed);
  - a search by name, ID, program or block;
  - hours drawn as a meter;
  - each reason kept to two lines;
  - 10 rows a page.

  It used to be one long table of 24 tall rows with its last column cut off. The CSV and PDF still hold every student.

### Coordinator portal, organised

**The menu, regrouped by what the coordinator is doing:**

| Group | Entries | What it's for |
|---|---|---|
| Decide | Concerns, Appeals, Needs attention | what waits on you |
| Track | Monitoring, Submissions, Evaluations, Site visits | the term as it runs |
| People | Students, Supervisors, Companies, Coordinators | who is involved |
| Setup | Terms, Programs, Holidays, Deliverables | what is set once |
| Talk | Messages, Announcements | |
| Reports | Analytics, Audit log, System status | |

The old Term group mixed one-time setup with day-to-day tracking, and Monitoring sat under Reports. Submissions and Deliverables are now separate pages; their old addresses redirect.

**Pages:**

- **Home:** the six fact cards are metric cards (amber while logs wait, red while trainees are behind, each with its words).
- **Students:** five summary tiles with counts (All, Active, No supervisor, No linked program, Deactivated) from the new `GET /api/coordinator/students/counts`.
- **Concerns:** status tiles with counts (new `GET /api/coordinator/complaints/counts`); each row has a category icon and a status edge; "concerns", not "complaints".
- **Monitoring, Companies, Evaluations:** their counted filters are summary tiles.
- **Deliverables:** row actions wrap on a phone (the page scrolled sideways at 360 and 390 px) and are 44 px targets.
- **Bug fixed on Home:** the subtitle read "week 43 of 3862", from a test term spanning decades. The week line now shows only for a term of believable length (at most a year).

### Supervisor portal

- **Interns:** tiles that count and filter (All, Work waiting for you, With open tasks, Almost done). Each card gets an amber edge and a labelled pill while something waits.
- **Review:** the four counts are metric cards.
- **Weekly reports, Documents and Tasks:** counted filters are summary tiles.
- **Small controls** in Attendance, Tasks and the evaluation panel are now 44 px targets.

### Trainee portal

- **Today's shortcuts say where each stands:**
  - Tasks: "1 past due · 1 open", red
  - Documents: "1 of 9 approved", amber until done
  - Time record: hours verified
  - Weekly report

  Each has an icon tile in its status colour, drawn from the completion checklist (cached for offline like Today's other data).
- **Documents:** count tiles for approved, under review, to upload and returned.
- **Tasks:** counted filters are summary tiles.

## Backend and database

- **Two new read-only routes**, each with a test:
  - `GET /api/coordinator/students/counts`
  - `GET /api/coordinator/complaints/counts`

  Each takes the list's own search and filters, so a tile's number is exactly what choosing it shows.
- **`coordinatorHome`:** `MAX_TERM_WEEKS` guards the week count. A test was added.
- **No migrations and no schema changes in this pass.** Nothing was dropped.

## Infrastructure: assessed, not changed

Nothing was deployed. The standing risks are the same as before this pass:

- **The Railway trial ends around 2 November.** The backend and database need a paid plan or a move before then.
- **There are no Railway backups.** Take one before migrations 065–071 reach production.
- **Real-phone checks are still outstanding:** passkeys, camera check, offline time-in.
- **CI runs the end-to-end tests against a production build on a fresh database.** That is the right setup; local runs need the same (see Results).

## Results

| Check | Result |
|---|---|
| `my-pwa`: type check | clean |
| `my-pwa`: lint | clean |
| `my-pwa`: build | built |
| `my-pwa`: `check:pwa` | 146 passed |
| Backend tests | 273: 271 passed, 2 skipped (they skip themselves near midnight), 0 failed |
| Backend `check:route-tests` | all 249 routes named by a test |
| Backend `docs:architecture` | regenerated; matches |
| E2E, full run against the production build, before the last fixes | 77 passed, 7 failed |
| E2E, the 7 failures | four were fixed and pass on rerun; three are the midnight case below; one depends on data, also below |
| Responsive sweep (every role's pages and the landing page at ten widths) | clean after the Deliverables and Analytics fixes |
| Menu audit | one entry lit per page, no group jumps; only in-page filters, page numbers and "On this page" sit beside the menu |
| Screenshots | refreshed in `internet-revisions/after/` (56) |

**Two kinds of e2e failure are expected on this local setup:**

- **Midnight.** Three picture tests start a time-in "an hour ago". The full run happened at 00:51 Philippine time, so that time-in fell on the previous day. They passed in the previous full run, and this pass did not change what they test.
- **Data.** One test expects a supervisor whose interns are all in one program and block. On the local database the demo supervisor now has 24 interns, most left by earlier test runs, so showing the chooser is correct. It passes on a fresh database, as in CI.

## Verified the way CI runs it, before the push

Run on a throwaway Postgres cluster on a fresh database (migrated and seeded), with the clock on UTC, against the production build and Playwright's own Chromium (`CI=1`):

| Check | Result |
|---|---|
| Backend tests | 273 of 273 passed, none skipped |
| Backend lint | clean |
| Backend `check:route-tests` | clean |
| Backend `docs:architecture` | matches |
| End to end | 85 of 85 passed: no failures, no flaky, no skips |
| Frontend lint, type check, `check:pwa` | clean |

**A flaky journey on the first CI-style run exposed an app flaw, now fixed.** When the list of an entry's pictures could not be fetched under load, the entry showed nothing, as if it had none. It now tries twice more, then says "N pictures could not be loaded", with Try again (`components/EntryPictures.tsx`).

## Not done

- **The landing page's two side device mockups are still small and faint.** They are decoration only, and the first screen now leads with the call to action instead.
- **Per-page counts were added only where a list is paged on the server and its filter has statuses** (Students, Concerns). Other lists count what they already hold.
