# INTERNet: implementation prompt for Claude Code (VSCode)

Version 3, 23 November 2026. It replaces earlier copies of this file.

**What changed since version 1:**
- Phase 1 now adds a separate **Director portal** (1.6) and a separate **IT Admin portal** (1.7) with separate duties. Privacy moved to 1.8, and the order of Phase 1 is stated.
- New section **"Skills to use"**: which Claude Code skills to call, and when.
- New section **"Design spec for the new portals"**: palette, type, layout and copy rules for the two new portals, fitted to the existing navy/brass/mist redesign.
- New section **"PWA integration checklist for a new portal"**: every file that knows the list of roles (service worker, manifests, `check:pwa`, `vercel.json`, the offline store, the session purge).

**How to use it:**
- Open the repository root in VSCode, start Claude Code, and paste everything below the line.
- Run **one phase at a time**: paste the preamble with Phase 0, review the result, then come back for Phase 1, and so on. Each phase is large.
- If a phase stops part-way, say "continue Phase N from item X".

---

You are working on INTERNet, the OJT (internship) PWA for Pangasinan State University – Lingayen Campus.

**Repository layout**
- `backend/`: Node + Express + TypeScript + Postgres. Migrations are in `backend/migrations/NNN_name.sql` (the last is 076); routes are in `backend/src/server.ts` and `backend/src/routes/*`; services are in `backend/src/services/*`.
- `my-pwa/`: React 19 + Vite + vite-plugin-pwa (injectManifest, `src/service-worker.ts`). Offline reads go through `savedFetch` in `src/lib/offlineStore.ts`; the offline queue is `src/lib/offlineQueue.ts`.
- `e2e/`: Playwright.

**Read first, before changing anything:**
- `DEVELOPING.md`, in full: its conventions are binding.
- `docs/OJT-DIRECTOR-READINESS.md`: the gap report this work implements.
- `docs/GO-LIVE-CHECKLIST.md`.
- The parts of `DEPLOY.md` you touch.

## Skills to use

Call these with the Skill tool, or type the slash command. If a skill is not installed in this Claude Code, say so once and carry on without it. Never invent a skill's output.

| When | Skill | What to ask it |
|---|---|---|
| Before building any page of the Director or IT Admin portal (items 1.6, 1.7), and before any other new screen | `/hallmark` | Run it on the portal's planned pages with the "Design spec for the new portals" below as the brief, and apply what it finds before committing UI. |
| Same moment, as the design guide | `frontend-design` (`frontend-design:frontend-design`) | Use it to settle each new portal's token plan and layout, and check the result against the spec below. The project's existing system (`src/brand/*`, `brand.css`, the redesign commit) always wins over the skill's defaults. |
| After each item that adds a route, a role or an upload | `/security-review` | Review the pending changes: auth, role checks, ownership, the admin's separation of duties, restricted documents. |
| After each phase | `/code-review` (level `high`) | Review the phase's diff for correctness bugs, then fix what it finds. |
| After each phase | `/simplify` | Clean up duplication, for example the per-role login code and the layout copies. |
| To see a portal working | `/run` | Launch the API and the PWA and open the new portal at 390 px and 1280 px. Take one screenshot per page for me. |

## Design spec for the new portals

INTERNet already has a visual system:
- **Palette:** navy, brass and mist. Students and supervisors use surface `#0C1731` and accent `#DBA65D` (see `src/brand/roles.ts` and the commit "Three-colour redesign (navy, brass, mist)"). The coordinator theme still uses the older `NAVY`/`AMBER` constants.
- **Type:** Bricolage Grotesque for display, Public Sans for text.
- **Brand:** the PSU seal and college marks are in `public/brand/psu/`.

The new portals **extend** this system; they do not invent a new one. Each portal must be recognisable at a glance, so nobody acts in the wrong portal.

**Director portal: "the campus at a glance"**
- **Surface:** the same deep navy (`#0C1731`) with brass (`#DBA65D`) as the accent, like the trainee and supervisor portals.
- **What sets it apart:** the **row of college marks** (`college-*.png`, `@128` sizes).
  - It is the portal's signature and its main filter: CASL, CBPA, CCS, CHTM, CTE, CIT.
  - Choosing a mark scopes every page to that college; "All colleges" is the default.
  - On a phone the row scrolls sideways inside its own container. The page itself never scrolls sideways.
  - This is the one bold element. Everything around it stays quiet.
- **Role tag** "OJT Director", portal name "OJT Office".
- **Campus overview layout:**
  - A summary line first: "412 of 438 cleared for deployment · 6 agreements end this month".
  - Then a table by college: interns, cleared, on track, at risk, agreements ending.
  - Each number opens the filtered list.
  - No row of big-number tiles. No identical rounded cards. Use the table and a few chips for state (cleared, pending, at risk), in the semantic colours already used for statuses.
- **Decisions** (term rules, grade release, HTE approval) say exactly what will happen, then confirm with the same verb:
  - "Release grades for BSIT 4A" leads to "Grades released for BSIT 4A".
  - Every change shows the old and the new value before it is saved.

**IT Admin portal: "the machine room"**
- **Surface:** deliberately the **opposite**. A light mist background with navy ink and no brass, so it never looks like an academic portal.
- **Role tag** "System administrator".
- **Layout:** dense and functional.
  - Accounts is a searchable table, one action menu per row.
  - System status is a list of checks, each with a state chip: OK, Needs attention, Off.
  - Monospace is allowed only for real technical values: timestamps, IDs, migration numbers.
- **Every destructive action** (deactivate, end sessions, temporary password) opens a confirmation that names the account and the effect: "End every session of Juan Dela Cruz (coordinator). They will have to sign in again."
- **A permanent line** on the home page: "This portal cannot open students' records, documents, photos or grades."

**For both portals:**
- **Copy:**
  - Sentence case and plain verbs.
  - No all-caps eyebrows above every heading.
  - No "→" on buttons.
  - Errors say what happened and what to do.
  - Empty states say how to add the first item.
- **Layout and controls:**
  - Phone first at 390 px.
  - 44 px tap targets, visible keyboard focus, reduced motion respected.
  - Light and dark both designed, if the other portals support dark.
  - axe clean.
- **Shared parts:** reuse the shared components (`components/ui.tsx`, `PhoneFilters`, `ScreenHelp`, `Toaster`, `NotificationBell`, `RoleDock`, `RoleShell`) instead of new copies.
- **Motion:** only for answers to an action (opening, saving). No entrance animations on sections.

## PWA integration checklist for a new portal

Each new role (`director`, `admin`) must be added everywhere the app knows the list of roles. Search for `student|supervisor|coordinator` and `"coordinator"` across `my-pwa/` and check each hit. At least:

1. **Role type and theme.** `src/brand/roles.ts`: the `Role` type, the theme, the loading words in `LoadProcess` if needed.
2. **Manifest.** `src/brand/useRoleTheme.ts` gets the manifest and title. Add `public/manifest-director.webmanifest` and `manifest-admin.webmanifest`, generated by `scripts/make-role-manifests.mjs`:
   - `id: "/director/"` and `start_url: "/director/sign-in?source=app"` (the admin likewise);
   - shortcuts to the portal's main pages;
   - keep `handle_links: "not-preferred"`.
3. **Icons and splash images.** `scripts/make-role-icons.mjs` produces `public/icons/{director,admin}-{192,512}.png` and the maskable versions. `scripts/make-startup-images.mjs` produces `public/startup/{director,admin}/`.
4. **`scripts/check-pwa.mjs`.** Add the two manifests to the list it checks (around line 71).
5. **`vercel.json`.** Widen the manifest header rule `/manifest-(student|supervisor|coordinator).webmanifest` to include the new roles. Check that the CSP still allows everything the portals load.
6. **Service worker** (`src/service-worker.ts`):
   - `/director/*` and `/admin/*` are app routes, so the offline navigation fallback must serve `/app.html` for them. It already does for any path that is not `/` or `/for-*`; keep it that way.
   - If you add `for-directors.html`, widen the `for-(trainees|supervisors|coordinators)` pattern there and in `vite.config.ts` (the page map, around line 65, and the build inputs, around line 210).
7. **Offline store.**
   - `lib/offlineStore.ts` keys rows by `role|id`, so the new roles get their own rows.
   - Sign-out, an expired session and a forced password change must erase them (`lib/session.ts` around 79–86).
   - The IT admin portal caches **nothing personal**: only its own account and the maintenance banner.
8. **Help and the offline table.** `lib/offlineHelp.ts` and the table in `DEVELOPING.md` get a row for each new portal.
9. **Install and update.** The install prompt (`components/InstallApp.tsx`) and the update toast (`lib/serviceWorker.ts`) must work in the new portals; test this in their e2e specs.
10. **Push.** Push subscriptions store the role (migration 005's constraint is widened in 083). Notifications for the new roles open their own pages (`services/notificationLinks.ts`).

## Rules for every item

1. Work on branch `ui-redesign`. Make one commit per numbered item, with a plain-English message that says what changed and why.
2. **Migrations:**
   - Add new migrations from `077_...` upwards. Never edit an existing migration.
   - Every migration must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) and safe on a production database that already holds data. Defaults must keep today's behaviour unless the item says otherwise.
3. **New routes:**
   - Guard each one with the existing `requireRole` / `requireCoordinator` helpers (and the new `requireDirector` / `requireAdmin` helpers once items 1.6 and 1.7 exist).
   - Check ownership of every record.
   - Use parameterised SQL only.
   - Add audit rules in `backend/src/services/audit.ts` for every change.
   - Have review decisions take `expected_version` and call `staleDecision(...)` (`backend/src/services/versions.ts`).
4. **Tests:**
   - Add API tests to `backend/test/api.test.cjs` for every new route. `npm run check:route-tests` must pass.
   - Add or extend a Playwright spec in `e2e/tests/` for every new screen.
   - Never skip, weaken or delete an existing test to get green.
5. **Checks after each item:**
   - `cd backend && npm run lint && npm run check:route-tests && npm test` (Postgres as in `.github/workflows/ci.yml`).
   - `cd my-pwa && npm run build && npm run lint && npm run check:pwa`.
   - The relevant e2e spec.
   - Report the real output. If something fails, fix it or stop and tell me.
6. **UI:**
   - Follow the existing components (`components/ui.tsx`, toasts in `lib/toast.ts`, `ScreenHelp`, `PhoneFilters`) and the calm style of the recent "calm pass" commits: few words, one main button, it must work at 390 px, and tap targets of 44 px or more.
   - Every new student read screen must work offline through `savedFetch`.
   - Every error message must say what to do next.
7. **Privacy:**
   - Never add a real person's data to seeds, tests or screenshots.
   - Health and clearance documents must never appear in the album, exports or previews (keep the existing `doc_type` exclusion in `routes/traineeRecord.ts` working).
8. When a phase is done:
   - Update `docs/REVISIONS-COVERAGE.md` (new rows with the status Done / Done (manual) / Waiting), `CHANGES.md` and the relevant section of `DEVELOPING.md` / `DEPLOY.md`.
   - Give me a summary table: item, files, tests added, result.

---

## Phase 0: safe fixes before the Director demo (small, low risk)

### 0.1 Remove the plain-text password fallback
- **Script.** Add `backend/src/scripts/hash-legacy-passwords.ts` and an npm script `db:hash-legacy-passwords`. It finds `students`, `supervisors` and `coordinators` rows whose password does not start with `$2`, bcrypt-hashes them with the same rounds as `server.ts` (12), and prints only counts, never values.
- **Code.** In `verifyPassword` (`backend/src/server.ts` around line 883), delete the `plain === stored` branch so a non-bcrypt value always fails. Remove the now-dead re-hash path.
- **Tests.**
  - A plain-text row can no longer sign in.
  - The script hashes it, after which sign-in works.
- **Docs.** Add the script as a go-live step in `docs/GO-LIVE-CHECKLIST.md`, run before step 4.

### 0.2 CORS fails closed in production
In production, if neither `FRONTEND_URL` nor `CORS_ORIGINS` is set, the server must refuse to start, with a clear log line. This is the same pattern as the `JWT_SECRET` check around `server.ts:424`. Development is unchanged. Add a test if the test harness can start the server with env overrides; otherwise document why it is not tested.

### 0.3 Required hours by program
- **Migration `077_program_required_hours.sql`.**
  - Adds `programs.required_hours INTEGER NULL CHECK (required_hours BETWEEN 1 AND 5000)`.
  - Sets BPA 400, BSIT 480 and BSBA 600 by `short_code` (`038_seed_psu_lingayen.sql`), and leaves the others NULL.
  - Does not change existing students.
- **Backend.** On student create (`server.ts` around 6432–6464) and CSV import (`routes/extensions.ts` around 931), when no hours are given, use the program's hours, then fall back to 180. A per-student value always wins.
- **Coordinator UI.**
  - `pages/coordinator/Programs.tsx` shows and edits the program's hours.
  - `Students.tsx` pre-fills the hours from the chosen program (replacing the hard-coded "180" at lines 90 and 525) and shows "Program default: N h".
- **Tests.** Create and import, with and without explicit hours.

### 0.4 Fix the contradicting deployment doc
`DEPLOY.md` says that nothing removes photos automatically ("Removing old photos (run by you)"), but `services/photoPurge.ts` runs nightly once `PHOTO_RETENTION_DAYS` is set. Correct the text, and state that `PHOTO_RETENTION_DAYS` must be set before go-live.

### 0.5 Demo data that looks like PSU Lingayen
Extend `backend/src/scripts/seed-demo.ts`, without breaking what existing tests rely on:
- **Agencies:** Provincial Government of Pangasinan (Capitol, Lingayen), DepEd SDO Pangasinan I, Philippine Ports Authority PMO Pangasinan, Land Registration Authority – Registry of Deeds Lingayen, and one private company in Dagupan. Give them MOA dates and slots.
- **People:** fictional students in BSIT, BPA and BSBA with the program hours from 0.3.
- **Activity:** a week of attendance in mixed states, one pending document, and one weekly report.
- Mark the data clearly as demo data (for example, emails at `@demo.invalid`).

---

## Phase 1: what the OJT process requires (before the semester)

Do the items in this order: 1.1 with 1.2 (requirements and the deployment gate), then 1.6 (Director portal), 1.7 (IT Admin portal), 1.5 (grade), 1.3 (agencies), 1.4 (overtime) and 1.8 (privacy). Migration numbers below are a guide: use the next free number when you get there.

### 1.1 Requirements pack: medical, clearances and IDs
- **Migration `078_requirements_pack.sql`:**
  - `students.sex TEXT NULL CHECK (sex IN ('female','male'))`, optional, explained in the privacy notice and used only to target requirements.
  - `students.sss_number TEXT NULL` and `students.pagibig_number TEXT NULL`, validated in format only.
  - `ojt_requirements.category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','medical','clearance','academic'))`.
  - `ojt_requirements.restricted BOOLEAN NOT NULL DEFAULT FALSE`.
  - `ojt_requirements.pre_deployment BOOLEAN NOT NULL DEFAULT FALSE`.
  - An `applies_to` key for sex (extend the JSON used by `services/deliverables.ts:32`, e.g. `{"sex":["female"]}`).
- **Seed** (`ON CONFLICT DO NOTHING`, coordinator-editable), all `pre_deployment = true`:
  - **Medical, restricted:** Medical examination, Urinalysis, Chest X-ray, CBC; Pregnancy test (female only); Anti-hepatitis (BSHM, BTVTEd, BIT Food Service Management major if majors are targetable, otherwise BIT, and BSND).
  - **Clearances, restricted:** NBI, Police, Barangay.
  - **Academic:** Certification of Units Earned (FM-AA-INT-02).
  - Mark the existing generic "Medical" item inactive rather than deleting it.
- **Restricted documents:**
  - A restricted document is visible only to its student, coordinators in scope (see 1.6) and the director. Supervisors never see it: check the supervisor document routes and `RequirementGrid.tsx`.
  - Every open or download writes an audit read entry. Use the existing read-audit pattern in `services/audit.ts`.
  - It is never shown in previews, the album or ZIP exports, except in a coordinator export that is explicitly marked as including restricted files.
- **Student UI:**
  - Profile gets optional SSS and Pag-IBIG fields, with the hint "Advised, for employment after OJT".
  - The sex field sits in Account, with a one-line reason.
- **Tests:**
  - Targeting by program and by sex.
  - The supervisor cannot see a restricted document.
  - An audit row is written when a restricted document is opened.

### 1.2 Academic eligibility and deployment clearance (the deployment gate)
- **Migration `079_deployment_clearance.sql`:**
  - `students.eligibility_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (... IN ('unchecked','eligible','deficient'))`.
  - `eligibility_note`, `eligibility_checked_by/at`.
  - `cleared_for_deployment_at TIMESTAMPTZ NULL` and `cleared_by`.
  - `clearance_override_reason TEXT NULL`.
  - A setting `deployment_gate_enabled` (a per-term or institution setting; follow how `attendance_rules` / institution profile are stored), **default false**, so production keeps working until the Director turns it on.
- **Coordinator:**
  - Add a **Clearance board** (a new page under the coordinator hub, using `PhoneFilters` and `studentScope` filters). Each student row shows:
    - eligibility;
    - each pre-deployment requirement as a chip (missing / pending / approved / rejected);
    - company assigned;
    - a "Clear for deployment" button.
  - Clearing is allowed only when the student is eligible, every pre-deployment requirement that applies is approved, and a company is assigned.
  - Otherwise "Clear anyway" requires a reason of at least 10 characters, and both actions are audited.
  - Bulk clear selected students.
  - CSV export of the board.
- **Gate:**
  - When `deployment_gate_enabled` is on and the student is not cleared, `POST /api/attendance`, offline time-in acceptance (`routes/offlineTimeIn.ts`) and supervisor-recorded time-in are refused with `403 { code: "NOT_CLEARED", missing: [names] }`.
  - An offline voucher is not issued to an uncleared student.
- **Student:**
  - A "Requirements" card on Today (`pages/student/dashboard.tsx`, AttentionCard style) lists what is missing, with a link to Documents.
  - The time-in dialog shows "Not cleared for deployment yet: Chest X-ray, NBI clearance. Your coordinator clears you once these are approved." instead of a generic error.
  - The card works offline through `savedFetch`.
- **Tests:**
  - With the gate off, nothing changes.
  - With the gate on, an uncleared student gets NOT_CLEARED on all three paths; after clearing, time-in works; an override needs a reason.
  - e2e: Clearance board, and the student card.

### 1.3 Host Training Establishments: type, MOA, screening, approval, slots
- **Migration `080_hte_profile.sql`:**
  - `companies.hte_type TEXT NOT NULL DEFAULT 'government' CHECK (... IN ('government','private','university'))`.
  - `companies.status TEXT NOT NULL DEFAULT 'approved' CHECK (... IN ('applied','screening','approved','suspended'))`. Existing rows stay approved.
  - `moa_notarized BOOLEAN NOT NULL DEFAULT FALSE`, `moa_document_path`, `moa_notarized_on DATE`.
  - Table `company_screenings(id, company_id, screened_by, screened_on, standing, work_environment, space_capacity, safety, decision CHECK IN ('pass','conditional','fail'), notes, version)`. Each criterion is a 1–5 rating plus a note.
- **Routes:**
  - Upload and download the MOA file, coordinator only, through `services/privateFileStore.ts` with the existing upload validation.
  - CRUD for screenings.
  - Status change with `expected_version`.
- **Rules:**
  - A student can only be assigned to an `approved` company. A private company becomes approved only after a screening that passed or passed with conditions.
  - **Slots are enforced:** inside one transaction, with `SELECT ... FOR UPDATE` on the company, count the active students in the current term and refuse with `409 { code: "NO_SLOTS" }` when full. This applies to create, edit and CSV import (import reports the failing rows).
  - Slots NULL means no limit.
- **UI:**
  - In `Companies.tsx` / `CompanyPage.tsx`: type and status chips, a "MOA notarized" badge, an "MOA missing / not notarized / expiring" filter, and the screening form.
  - `CompanyPicker.tsx` hides companies that are not approved or are full, and says why.
- **HTE application requests:**
  - Table `company_requests(id, requested_by_role, requested_by_id, company_name, address, contact, reason, status CHECK IN ('submitted','screening','approved','rejected'), decided_by, decided_at, version)`.
  - A student can submit one from the Company page ("Suggest an agency"). A coordinator can create one for an agency or the university.
  - Approving creates the company in `screening` status.
- **Tests:** slots under concurrency (two assignments racing for the last slot), screening required for private companies, and the request flow.

### 1.4 Overtime and the 8-hour day
- **Migration `081_overtime.sql`:**
  - Table `overtime_requests(id, student_id, work_date, planned_start, planned_end, reason, status CHECK IN ('pending','approved','rejected','cancelled'), decided_by, decided_at, decision_note, version, created_at)`.
  - A setting `overtime_max_per_week INTEGER NOT NULL DEFAULT 2` (same storage as 1.2).
- **Student:**
  - File a request from Attendance before or on the day, with an optional upload of the signed Overtime Form.
  - Shows "1 of 2 this week".
  - Filing works online only, with a clear offline message; a draft is kept.
- **Supervisor:**
  - Approve or reject in Review, as one more chip kind next to the existing ones.
  - The limit is enforced on approval per ISO week (Monday–Sunday, Asia/Manila; use `services/phTime.ts`).
- **Crediting:**
  - Credited hours for a day are capped at the scheduled end (from `dayRules.planDay`) unless an approved overtime request covers that day, in which case they are capped at the approved end.
  - The `MAX_SHIFT_HOURS` cap stays.
  - Put the rule in one service function, used everywhere hours are computed: grep for `credited_from` and the hours sums in `server.ts`, `autoCount.ts`, `projection.ts` and `kpis.ts`.
  - **Do not change hours already verified.** The cap applies to logs created after the migration, or behind a setting that defaults to on for new terms only. Pick one and explain why.
- **DTR:** show overtime in the CS Form 48 remarks.
- **Tests:** the weekly limit, crediting with and without overtime, and that old logs are unchanged.

### 1.5 Instructor evaluation and the 50/50 final grade
- **Migration `082_final_grade.sql`:**
  - Table `instructor_evaluations(id, student_id, term_id, evaluator_id, logs_score, punctuality_score, preparation_score, conduct_score, remarks, submitted_at, version)`. Each score is 0–100.
  - Weights in a per-term setting, default 25/25/25/25.
  - Setting `grade_split_hte` default 50 (the instructor half is 100 minus it).
- **Punctuality suggestion:** computed on the server from on-time vs late submissions of reports, journals and documents (due dates in `deliverables`). It is shown as a pre-filled suggestion that the instructor can change.
- **Logs suggestion:** the share of expected daily or weekly reports submitted. Also only a suggestion.
- **Final grade service** in `backend/src/services/finalGrade.ts`:
  - HTE grade from `evaluationGrade.ts` multiplied by the HTE split, plus the instructor grade multiplied by the rest, rounded as the university does (ask me if unknown; default to 2 decimals).
  - It is only "final" when both halves exist; otherwise it shows "Waiting for HTE / instructor".
- **Coordinator UI:**
  - On the `Evaluations.tsx` page, a grade sheet for each program or block shows HTE, Instructor and Final, with CSV and PDF export (reuse `lib/csv.ts` and `lib/analyticsPdf.ts`).
  - The student's record shows the breakdown.
- **Student:** sees the final grade only after the coordinator releases it (a `released_at` column).
- **Tests:** weights, missing halves, and release.

### 1.6 Director portal and coordinator scoping (a fourth portal, `/director/*`)

The OJT Director gets a portal of their own, not extra buttons in the coordinator portal.

- **Migration `083_director_portal.sql`:**
  - A `directors` table with the same account columns as `coordinators`: id, name, email, password hash, `auth_version`, `must_change_password`, `is_active`, and the contact fields from migration 060.
  - Widen every role CHECK constraint to include `'director'` and `'admin'` (the admin is item 1.7), so both items need only this one constraint change. Drop and re-add each constraint by name, in this migration only:
    - `005` (password resets, push subscriptions);
    - `010` (announcement author);
    - `019` (audit `actor_role`);
    - `059` (message parties);
    - any other `role IN (...)` you find with `grep -n "role IN" backend/migrations/*.sql`.
  - Table `coordinator_scopes(coordinator_id, college_id NULL, program_id NULL)`.
- **Auth:**
  - Extend `signToken` (`backend/src/server.ts:1083`), the per-role account SQL map used by `requireRole` (around `:1229`) and the `AuthedRequest` role type to include `director`.
  - Add `POST /api/login/director`, reusing the existing login code path: rate limit, lockout, `must_change_password` and passkeys. Copy how `/api/login/supervisor` (around `:1967`) is built; do not write a second login implementation.
  - Make password reset, sign-out, revocation and passkeys work for the new role. Grep for `"coordinator"` in the auth helpers and check each one.
  - Add `requireDirector`.
- **Portal (front end):**
  - Add `director` to `Role` in `my-pwa/src/brand/roles.ts`, with the theme in **"Design spec for the new portals"** (the college-mark row is the signature). Run `/hallmark` and `frontend-design` first (see **"Skills to use"**), and follow the **"PWA integration checklist for a new portal"** step by step.
  - `Door` sign-in at `/director/sign-in`, a `layouts/DirectorLayout.tsx` (side menu on a computer, dock on a phone, as `CoordinatorLayout.tsx` does) and routes under `/director/*` in `App.tsx`.
  - Manifest `manifest-director.webmanifest`, icons and iOS splash images, generated by extending `scripts/make-role-manifests.mjs`, `make-role-icons.mjs` and `make-startup-images.mjs`. Register it in `useRoleTheme.ts`. `npm run check:pwa` must cover it.
  - The landing page gets a "For the OJT office" link, built like the other `for-*.html` pages. Add a `for-directors.html` only if it fits the landing structure in `src/landing/`.
- **Director pages:**
  1. **Campus overview:** KPIs per college and program (reuse `services/kpis.ts` and `insights.ts` grouped by college), deployment readiness (counts from the 1.2 Clearance board), agreements expiring, students at risk, and completion progress.
  2. **Colleges and programs:** required hours per program (0.3) and the requirement templates per program (1.1). Move editing from the coordinator's `Programs.tsx`; coordinators keep a read-only view.
  3. **Coordinators:** create, deactivate and reset, and assign scopes. Coordinator account management (`routes/extensions.ts:3900-3985`) becomes director-only.
  4. **Term rules:** deployment gate, overtime limit, grade split and weights, geofence mode (Phase 2). Each change is audited with the old and new value.
  5. **Approvals:** approve or suspend HTEs (1.3); release final grades per program or block (1.5); see every clearance override, with its reason (1.2).
  6. **Reports:** campus exports (CSV/PDF, reuse `lib/csv.ts` and `lib/analyticsPdf.ts`) and a read-only student record viewer (reuse the `studentRecord/*` components in read-only mode). Opening a record writes an audit read entry.
  7. **Privacy and institution:** the institution profile (`InstitutionCard.tsx`), and the privacy notice fields (DPO contact, retention text) that feed `services/privacy.ts` once the university supplies them.
  8. **Audit:** the existing audit view, scoped to academic actions and account actions.
  9. Messages, announcements to coordinators or everyone, notifications, Profile and Help, reusing the shared components.
- **Coordinator scoping:**
  - Every `/api/coordinator/*` list and detail route filters students by the coordinator's scope.
  - Build one helper in `services/studentScope.ts` that returns a SQL fragment plus parameters, and use it everywhere. Grep each coordinator route and list the routes you changed.
  - A record outside the coordinator's scope returns the same 404 as a missing record.
- **Offline:** director read pages use `savedFetch`, like the coordinator's. Decisions need a connection. The offline table in `DEVELOPING.md` and `lib/offlineHelp.ts` gets a Director row.
- **Back-compatibility:**
  - Until at least one active director exists, coordinators keep today's powers (managing coordinators, programs, settings), and a banner on the coordinator home says "No OJT Director account yet; ask the system administrator to create one."
  - A coordinator with no scope rows sees every student, as today.
- **Tests:**
  - Director login, lockout and password change.
  - Every director-only route refuses student, supervisor, coordinator and admin with 403.
  - A scoped coordinator cannot list, open or decide a student outside the scope (students, documents, attendance, evaluations, exports).
  - The back-compatibility behaviour with no director.
  - e2e: `e2e/tests/director-portal.spec.ts` (sign-in, side menu and dock, every page at 390 px and 1280 px, axe clean).

### 1.7 IT Admin portal (a fifth portal, `/admin/*`), with separate duties

The university IT/MIS person runs the system. They do **not** see students' records, documents, photos, evaluations, grades or messages.

- **Migration `084_system_admins.sql`:** a `system_admins` table with the same account columns. The role constraint was already widened in 083.
- **First account:**
  - Created only by a CLI script, `backend/src/scripts/create-admin.ts` (`npm run admin:create -- --email ...`). It prints a one-time temporary password, and `must_change_password` is set.
  - There is no sign-up page and no route that creates an admin, except an existing admin creating another.
- **Auth:**
  - `POST /api/login/admin` through the same login code path, and `requireAdmin`.
  - The Profile page strongly recommends a passkey.
- **Portal:**
  - Role `admin` in `roles.ts`, with the light "machine room" theme in **"Design spec for the new portals"**. Run `/hallmark` and `frontend-design` first, and follow the **"PWA integration checklist for a new portal"**.
  - `Door` at `/admin/sign-in`, `layouts/AdminLayout.tsx`, routes under `/admin/*`.
  - Manifest, icons and splash images through the same scripts.
  - No link from the public landing page.
- **Admin pages:**
  1. **Accounts:** search accounts of every role by name or email. Actions:
     - unlock a locked login (`login_attempts`);
     - issue a temporary password (sets `must_change_password` and emails the owner through `services/mailer.ts`);
     - deactivate or reactivate;
     - end all sessions (bump `auth_version`);
     - create or deactivate Director and admin accounts.

     Coordinators still create students and supervisors; directors create coordinators.
  2. **System status:** move the coordinator's `SystemStatus*.tsx` and `UploadUsage.tsx` here: health and ready checks, migration level, the problems log (`services/problems.ts`), email budget (`emailBudget.ts`), push configured or not, and upload usage. Coordinators keep only a short "Something is wrong, the administrator has been told" notice.
  3. **Backups:** `backup_runs`, `photo_purge_runs`, a "Back up uploaded files now" action (reuse `services/backups.ts`), and the last restore drill date as a manual field. Keys are never shown.
  4. **Production warnings:** read-only:
     - CORS set;
     - `PRIVACY_CONSENT_REQUIRED`;
     - `PHOTO_RETENTION_DAYS`;
     - privacy notice still a placeholder;
     - VAPID set;
     - backups on.
  5. **Maintenance banner:** a message shown in every portal (stored in the database, cached for offline reading).
  6. **Audit log:** full view and CSV export, the admin's own actions included. The detail whitelist in `services/audit.ts` already keeps out personal content.
- **Separation of duties (enforced on the server):**
  - `requireAdmin` routes never return student content.
  - The admin gets 403 on every student, document, attendance, photo, evaluation, grade, journal, report and message route. Add one test that loops over these route groups.
  - Every admin action is audited and appears read-only in the Director's Audit page.
  - The admin cannot change term rules or grades. The Director cannot see backups or system internals beyond the warnings summary.
- **Tests:**
  - The admin CLI creates an account that must change its password.
  - Admin login.
  - The 403 loop above.
  - Unlock, temporary password with email sent (mock mailer), and end sessions (the old token is then refused).
  - e2e: `e2e/tests/admin-portal.spec.ts` (sign-in, Accounts, System status and Backups at 390 px and 1280 px, axe clean).

### 1.8 Privacy and offline hygiene
- **Privacy notice.**
  - In `services/privacy.ts`, add sections for health and clearance documents, the optional sex and SSS/Pag-IBIG fields, and the geofence result (for Phase 2), each with its purpose and who can see it.
  - Keep `placeholder: true` and the bracketed DPO and retention text until I supply the university's wording.
  - Bump `version`, so students are asked to consent again.
- **Production warnings.** Coordinators, the director and the admin see a warning in Profile → "What is switched on" when any of these hold in production:
  - `PRIVACY_CONSENT_REQUIRED` is not true;
  - `PHOTO_RETENTION_DAYS` is unset;
  - the notice is still a placeholder.
- **Offline queue** (`lib/offlineQueue.ts` / `offlineStore.ts`): delete a queued photo blob as soon as its step is accepted by the server.
- **Shared-phone sign-out.** Add an option on the sign-out confirmation: "This is a shared phone: also erase anything waiting to send", with a warning that lists what will be lost.
- **Onboarding.** Add a "Prepare for offline" step that downloads the face-check files and vouchers with a progress bar, recommended on Wi-Fi, reusing the existing precache in `lib/offlineTimeIn.ts`.
- **Tests:** e2e for the shared-phone sign-out and the prepare step (`offline-first.spec.ts`, `precache.spec.ts`).

---

## Phase 2: during the pilot

### 2.1 Optional geofence (distance only)
- `companies.latitude`, `longitude` and `radius_m` (default 200), set by the coordinator by tapping a map pin or pasting coordinates.
- No map library from a new CDN; check the CSP in `my-pwa/vercel.json`. Plain coordinates are fine.
- Setting `geofence_mode` with the values `off` (default), `record` and `review_outside`.
- At time-in, the phone asks for the location once, only when the mode is not off.
- The server stores **only** `distance_m` (rounded to 10 m) and `inside_fence`, never the coordinates.
- Outside the fence, or with the location denied, the log goes to the supervisor's review with a chip; it is **never** refused.
- Offline time-in carries the distance computed on the phone, flagged as phone-computed.
- Update the privacy notice.
- **Tests:** inside, outside, denied, and mode off.

### 2.2 Student agency preference and assignment
- Each term, the coordinator opens a choice window.
- Students rank up to 3 approved companies that fit their program and have free slots.
- The coordinator sees demand against slots and assigns, using the slot enforcement from 1.3. Unassigned students are listed for direct assignment.
- Students are notified of their assignment.
- **Tests:** ranking, a full slot, and the window closed.

### 2.3 Monitoring plan
- `site_visits` gains `planned_on`, `kind` (visit / call / message check-in) and a planned or done status.
- The coordinator plans visits per company or student.
- Reminders run through the existing deadline-reminder service the day before.
- The Monitoring page shows "Planned this week" and "Overdue check-ins".
- An export of the monitoring plan as a PDF, for the OJT office.

### 2.4 Transmittal and receipt
- For each document and evaluation, record a hard copy: `received_by`, `received_on` and an optional scan of the transmittal letter.
- Show a "Hard copy received" chip.
- Print a transmittal letter from the app with the list of documents.

### 2.5 Completion
- The coordinator approves or returns the completion request, which sets `completion_approved_at/by`.
- Once approved, the app can generate a completion certificate (PDF in the university's style, reusing the PSU form print code in `pages/student/forms/formPdf.ts`) if the university wants one. Ask me before adding branding.
- The agency's own certificate upload stays as it is.

### 2.6 Semesters and multi-semester programs
- `terms.semester` (1st, 2nd, midyear) and the academic year.
- `program_terms` lets a program's OJT span two terms, with hours carried over.
- Term setup warns about students in programs whose OJT is in the other semester.

### 2.7 More dependable camera check
- In `components/LivenessCamera.tsx` and `lib/liveness/engine.ts`:
  - Throttle detection to about 15 fps.
  - Show a "Too dark — face a light" hint from the existing light check.
  - After 20 s without a pass, or on the `tracker`/`failed` states, show one clear button: "Continue without photo — your supervisor will confirm" (the existing no-photo path).
- Record which path was used. Never call this "face recognition" in UI text.
- e2e with the fake tracker.

### 2.8 Accessibility in CI
- Add the axe sweep (`docs/baseline/tools/axe-sweep.mjs`) as a CI step in `.github/workflows/ci.yml` that fails on serious or critical violations.

---

## Finish

When each phase is done:
1. Run every check in rule 5.
2. Then run `/code-review` and `/simplify`; for phases that add routes or roles, run `/security-review` too.
3. Fix what they find, and report the results honestly. Then list:
- the settings I must decide or set in production;
- the go-live steps that changed;
- anything you could not finish, and why.

Do not deploy, do not push to `main`, and do not change production variables.
