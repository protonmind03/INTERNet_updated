# Prompt for Claude Code in VSCode

Paste everything below the line into Claude Code, opened at the repository root.

Run **one phase at a time**: paste the preamble with Phase 0, review the result, then come back for Phase 1, and so on. Each phase is large. If a phase stops part-way, say "continue Phase N from item X".

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

## Rules for every item

1. Work on branch `ui-redesign`. Make one commit per numbered item, with a plain-English message that says what changed and why.
2. **Migrations:**
   - Add new migrations from `077_...` upwards. Never edit an existing migration.
   - Every migration must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) and safe on a production database that already holds data. Defaults must keep today's behaviour unless the item says otherwise.
3. **New routes:**
   - Guard each one with the existing `requireRole` / `requireCoordinator` helpers (and the new director helper once item 1.6 exists).
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

### 1.6 Director role and coordinator scoping
- **Migration `083_director_scope.sql`:**
  - Add `'director'` to the role checks (migration 005's constraints).
  - Table `coordinator_scopes(coordinator_id, college_id NULL, program_id NULL)`.
  - A `directors` table, or `coordinators.is_director BOOLEAN DEFAULT FALSE`. Pick the smaller change that works with the existing auth (`signToken`, `requireRole`) and explain the choice.
  - **Back-compatibility:** a coordinator with no scope rows keeps seeing everything, so nothing breaks on deploy, and a banner tells the director to assign scopes.
- **Enforcement:**
  - Every `/api/coordinator/*` list and detail route filters students by scope.
  - Build one helper in `services/studentScope.ts` that returns a SQL fragment plus parameters, and use it everywhere. Grep each coordinator route and list the routes you changed.
  - A record outside the coordinator's scope returns the same 404 as a missing record.
- **Director only:**
  - Manage coordinators and their scopes (move this from any coordinator, `extensions.ts:3900-3985`).
  - Change the term settings from 1.2, 1.4 and 1.5.
  - See the campus-wide KPIs with a per-college comparison (reuse `kpis.ts` grouped by college).
  - Sign-in reuses the coordinator portal; the director sees extra hub entries.
- **Tests:**
  - A scoped coordinator cannot list, open or decide a student outside their scope (cover at least students, documents, attendance, evaluations and exports).
  - Only the director can manage coordinators.

### 1.7 Privacy and offline hygiene
- **Privacy notice.**
  - In `services/privacy.ts`, add sections for health and clearance documents, the optional sex and SSS/Pag-IBIG fields, and the geofence result (for Phase 2), each with its purpose and who can see it.
  - Keep `placeholder: true` and the bracketed DPO and retention text until I supply the university's wording.
  - Bump `version`, so students are asked to consent again.
- **Production warnings.** Coordinators and the director see a warning in Profile → "What is switched on" when any of these hold in production:
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

When each phase is done, run every check in rule 5 and report the result honestly. Then list:
- the settings I must decide or set in production;
- the go-live steps that changed;
- anything you could not finish, and why.

Do not deploy, do not push to `main`, and do not change production variables.
