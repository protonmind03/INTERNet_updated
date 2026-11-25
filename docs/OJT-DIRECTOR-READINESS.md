# INTERNet readiness for PSU Lingayen OJT: gap report and presentation brief

Version 2, 25 November 2026. It replaces the version of 22 November.

The two interview notes on how the campus runs OJT were compared against `ui-redesign` at `c1ef679`. Those notes are the "flow and requirements" summary and "1. Initial Evaluation & Prerequisites". Neither note is in git.

**Reading the status column:**
- ✅ In the system and working.
- 🟡 There, but needs revision or a decision from the university.
- ❌ Not built yet.

---

## 0. What changed since 22 November, and what was checked

**42 commits were pushed between 23 and 25 November.** They change 274 files (about 20,800 lines added) and add migrations 077 to 092. Together they build all three phases of `docs/IMPLEMENTATION-PROMPT.md` (CHANGES.md sections 41–43):

- **Phase 0:**
  - no plain-text passwords;
  - CORS fails closed;
  - hours by program;
  - deployment doc fixed;
  - PSU-like demo data.
- **Phase 1:**
  - requirements pack;
  - deployment gate and Clearance board;
  - HTE type, approval, screening, MOA and slots;
  - overtime;
  - 50/50 grade;
  - **Director portal**;
  - **IT Admin portal**;
  - privacy and offline hygiene.
- **Phase 2:**
  - location check;
  - agency choices;
  - monitoring plan;
  - hard copies and transmittal;
  - completion approval;
  - semesters;
  - steadier camera check;
  - accessibility in CI.

`main` was also moved to the same commit (`c1ef679`) on 25 November.

**Checked for this report:**

| Check | Result |
|---|---|
| Backend API tests, on a fresh database with the clock on UTC (as CI) | **322 of 322 pass** |
| Backend lint (time zones), every route named by a test | Clean; 347 routes |
| Frontend build, lint, `check:pwa` | Clean; `check:pwa` 198 of 198 |
| **GitHub CI on `c1ef679`** (both `ui-redesign` and `main`) | **Failed**, for the three reasons below |
| CI end-to-end | 136 passed, 1 failed, 2 did not run |
| CI Lighthouse (mobile, report only) | Performance: landing 91 (layout shift 0.177), Today 88, Review 86, coordinator 83. Accessibility 99–100. These are lower than October's 97–100. |

**Why CI is red:**
1. **Backend job.**
   - `docs/ARCHITECTURE.md` was not regenerated after the new routes.
   - The job stops at that check, so **CI never ran the backend tests** (they pass locally, above).
   - Fix: `cd backend && npm run docs:architecture`, then commit the file.
2. **End-to-end: `admin-portal.spec.ts:102`**, "End every session" menu item not found.
   - It passes when run alone, so it is an order-dependent flake.
   - Likely cause: the accounts list reloads while the menu is open, during the full run.
   - Fix: wait for the list to settle before opening the menu, or keep the menu open across reloads.
3. **Accessibility sweep: 16 serious findings, all on `/supervisor/journals`** (`my-pwa/src/pages/supervisor/Journals.tsx` around line 220).
   - **Nested interactive:** the "Review now" link sits inside the `<summary>` that opens the week. Move the link out of the `<summary>`, for example into the opened part or beside the row.
   - **Colour contrast:** the month label (`<i>` in `.att-date`) is too light.
   - These show only when a weekly report is still waiting, which is why the local sweep was clean and CI's data is not.

**Production is unknown.** `main` now holds a commit whose CI failed.
- **If Railway's "Wait for CI" is on:** the backend did not deploy. But Vercel may have deployed the new site, so the new site may be talking to the old API.
- **If it is off:** production ran migrations 035 to 092. That would have skipped the go-live rehearsal, unless steps 1–4 were done first.
- **The go-live checklist is out of date:** it still says "43 migrations, 035 to 077"; it is now 58, 035 to 092.
- Check production before the demo (see section 6).

---

## 1. What the process needs vs. what INTERNet has now

### A. Before deployment
| Requirement (from the notes) | Status | Where it is / what is left |
|---|---|---|
| Academic screening (failed or missing subjects) | ✅ / 🟡 | Eligibility status (unchecked / eligible / deficient) with a note, recorded by the coordinator (migration 079). It is a **manual** check: grades are not imported from the university portal. |
| 2nd-semester timing; programs that span two terms | ✅ | Term semester and academic year; the semesters each program's OJT runs in; carry-over of continuing students with their hours (migration 090). |
| Medical: exam, urinalysis, chest X-ray, CBC, pregnancy test for female students | ✅ / 🟡 | Requirements pack with restricted health files, and targeting by sex (migration 078). **The items and the programs they apply to still need the Director's confirmation.** |
| Anti-hepatitis for food-related programs | ✅ / 🟡 | Targeted by program. Confirm which programs. |
| NBI, police and barangay clearance | ✅ | Restricted clearance requirements. |
| SSS and Pag-IBIG numbers | ✅ | Optional fields in the student's profile. |
| **Deployment gate** | ✅ | Clearance board, "clear anyway" with a reason, and no time-in until cleared, on every time-in path. **Off by default; the Director switches it on.** |
| Independent (self-arranged) internship | ❌ | Still no placement type. A student-arranged agency can come in as an agency suggestion, but there is no separate path with its own clearances. |

### B. Host Training Establishments (HTE) and placement
| Requirement | Status | Where it is / what is left |
|---|---|---|
| Registry, government / private / university | ✅ | Migration 083. |
| Notarized MOA | ✅ | MOA file kept privately, with a notarized flag and date. |
| Screening of private agencies | ✅ | Screenings on standing, environment, space and safety. A private agency is approved only after a pass. |
| New-agency request | ✅ | Suggestions from students and coordinators. |
| Slot allocation | ✅ | Enforced on create, edit, import and carry-over, with the company locked. |
| Student picks an agency; instructor assigns the rest | ✅ | Choice window, top 3 choices, demand against slots, assignment (migration 086). |

### C. Hours and daily operations
| Requirement | Status | Where it is / what is left |
|---|---|---|
| Program hours: PA 400, IT 480, BSBA 600 | ✅ / 🟡 | `programs.required_hours` (migration 077). **The other 12 programs are blank and fall back to 180** until the Director sets them. |
| 8-hour day; overtime at most 2 a week | ✅ | Hours stop at the scheduled end unless overtime is approved. Requests on Days, decisions in Review, shown on the DTR (migration 084). Logs from before keep their hours. |
| CS Form 48 DTR | ✅ | Unchanged. An agency's own DTR is still only a generic upload. |
| Camera check | ✅ | Liveness at about 15 readings a second, a low-light hint, and after 20 s "Continue without photo", with the reason kept (migration 091). Still not face recognition. |
| Location verification | ✅ | Optional (off / record / review when outside). Only the distance is kept, never the coordinates; a time-in is never refused (migration 085). |
| Offline time-in, diary and reports | ✅ | Unchanged, plus "Prepare for offline" in onboarding and the shared-phone sign-out. |

### D. Monitoring, communication and records
| Requirement | Status | Where it is / what is left |
|---|---|---|
| Monitoring plan and check-ins | ✅ | Planned visits, calls and message check-ins; "Planned this week" and "Overdue"; a reminder the day before; a PDF of the plan (migration 087). |
| Email, Messenger, text and calls | ✅ / 🟡 | In-app channels. **Email and push still need their production keys.** |
| Transmittal and hard copies | ✅ | Received by and on, a transmittal scan, and a printable letter (migration 088). A re-upload shows as "not received" again. |
| Central storage of scanned forms | ✅ | Unchanged. |

### E. Evaluation, grading and oversight
| Requirement | Status | Where it is / what is left |
|---|---|---|
| 50% HTE + 50% instructor | ✅ / 🟡 | Instructor's four scores, a grade sheet with CSV and PDF, release before students see it, and a 1.00–5.00 grade (migration 082). **The split, the weights, PSU's own grade table and the HTE criteria are marked pending until the university confirms them.** |
| Director oversight | ✅ | **Director portal (`/director`):** campus by college, coordinators and their scopes, programs, rules, approvals, reports. Coordinators keep the office's powers until a Director account exists. |
| System administration | ✅ | **IT Admin portal (`/admin`):** accounts, status, backups, warnings, maintenance notice, audit log. It cannot open students' records. |
| Completion | ✅ | The coordinator approves or returns a completion review (migration 089). No certificate is generated, by decision on 25 November. |

---

## 2. What the Director may still object to, and the answer

| # | Likely objection | Answer or fix |
|---|---|---|
| F1 | "Can a student start without clearances?" | Not once the deployment gate is on. Show the Clearance board and a refused time-in. The gate is off by default so nobody is locked out on deploy: **the Director decides when to turn it on.** |
| F2 | "Is the grade official?" | The 50/50 sheet works, but its split, weights, grade table and HTE criteria are **marked pending**. Ask the Director for the official values. Each is one setting or one constant. |
| F3 | "What about programs other than PA, IT and BSBA?" | Their hours are blank and fall back to 180. Ask for the hours of all 15 programs, and set them in the Director's Programs page. |
| F4 | "Who can see medical files?" | Only the student, the coordinators in scope and the Director. Supervisors and the IT admin never can, and every opening is logged. |
| F5 | "Is the privacy notice final?" | No: `draft-6` is still a placeholder. **Do not switch on `PRIVACY_CONSENT_REQUIRED` until the DPO approves the wording**, or students will be asked to agree to a draft. |
| F6 | "Does the location check track students?" | No: it keeps only the distance, never coordinates or a trail, and never refuses a time-in. It is off unless the Director turns it on. |
| F7 | "Is it tested on real phones?" | Not yet. Run the device day (section 3) before the pilot. |
| F8 | "Self-arranged internships?" | Not a separate path yet. For now they come in as an agency suggestion, then go through screening and approval. |
| F9 | "Is it stable? The build shows a red cross." | Fix the three CI causes in section 0 first (about an hour of work) so the record shows green. |
| F10 | "Who runs it?" | The IT Admin portal is built for university MIS. Name the owner and a hosting budget. |

---

## 3. Concerns about using it across the campus

- **Production state and deploy safety.** Confirm what production runs; update the go-live checklist to 092; turn on Railway's "Wait for CI". Vercel can deploy the site without waiting for CI, so a red build is a signal not to trust it.
- **Settings the university must give.** Grade split and weights, PSU's grade table, the HTE criteria, the hours of 12 programs, the medical items per program, the OJT semesters per program, the location rule and each company's point, the privacy wording, the DPO and the retention period.
- **Real phones.** Camera check, offline time-in, location prompt, passkeys, push, install on iPhone. Spend one day with 5–10 phones, including a low-end Android and an iPhone.
- **Speed.** Lighthouse performance fell to 83–91, and the landing page's layout shift is 0.177 (above 0.1). This matters on cheap phones.
- **Accounts.** Make the first accounts with `npm run admin:create` and `npm run director:create`. Each prints a temporary password once, and it must be changed.
- **Change management.** Paper in parallel for 2–4 weeks; orientation for each role; a help-desk contact.
- **Known open items** (CHANGES.md §43):
  - a term can be closed before its continuing students are carried over;
  - a re-upload loses the "hard copy received" mark;
  - an online time-in without a photo still counts as "offline" on some supervisor screens;
  - the Director and Admin portals are not yet in the CI accessibility sweep.

---

## 4–5. Quality checklist: issue and resolution

| Area | What was found | Resolution |
|---|---|---|
| Security | Plain-text passwords and open CORS are fixed. Phase 2 had a full security review with no findings. **Phase 1's phase-wide security review was postponed** (usage limit) and is not recorded as done. | Run `/security-review` on Phase 1 (`88cc499..fc2cb34`). Keep "Wait for CI" on. |
| Privacy | Notice `draft-6` is still a placeholder. Photo retention needs `PHOTO_RETENTION_DAYS`. The Director can open health files; admins making Directors notify the office. | Final wording from the DPO, then consent on. Set retention. Review the Director accounts every term. |
| Integrity | Slots, approvals, the grade and the gate are enforced on the server. The camera check still relies on the phone's report. | Keep the supervisor's photo review as the final word. |
| Consistency | The go-live checklist says 077; the code is at 092. `docs/ARCHITECTURE.md` is stale. A no-photo online time-in counts as offline on some screens. | Update both docs; fix the label. |
| Responsiveness | Journals page: 16 serious accessibility findings in CI. Performance is lower. Landing page layout shift 0.177. | Fix Journals (section 0). Reserve space for the landing hero. Look at the Lighthouse reports in the CI artifacts. |
| Functionality | Independent internship path missing; agency DTR upload generic; no certificate (by decision). | Add a placement type if the Director wants one. |
| PWA and offline | The new portals have their own manifests and icons; "Prepare for offline" and the shared-phone sign-out are added. | Test install and update on real phones for all five portals. |
| Error handling | Gate refusals name what is missing (but not to supervisors, for privacy). Slot and approval refusals say why. | Keep. |
| Ease of use | Five portals; the Director and Admin portals look deliberately different. | One-page guide per role. |
| "AI" behaviour | Camera check throttled, low-light hint, 20-second way out. No LLM. | Never call it face recognition. |
| Policy | Every rule is a setting, changed by the Director and audited. Defaults are safe (gate off, location off). | The Director sets the rules at term setup. |
| Precautions | Backups need the go-live steps; CI is red. | Section 6, step 1. |

---

## 6. Presentation brief

**Before the demo (in this order):**
1. **Do not use production** until you know what it runs. Use the test site or a local copy with `npm run db:seed-demo`.
2. If you can, fix the three CI causes and push, so the latest commit has a green tick.
3. Make the accounts: `npm run director:create` and `npm run admin:create`, plus the demo students, supervisors and coordinator.
4. On the demo database only, turn on the deployment gate and set one company's location point, so you can show them.
5. Rehearse twice on a real phone and a laptop. Keep screenshots as a backup.

**Demo path (about 20 minutes):**
1. Student: install the app, sign in, see the Requirements card, then try a time-in and get refused because the student is not cleared.
2. Coordinator: open the Clearance board, approve the requirements, and clear the student.
3. Student: time in with the camera check, show the location result, time out offline, then reconnect.
4. Supervisor: approve an overtime request and verify the day in Review.
5. Coordinator: show Companies (MOA notarized, slots, screening), the monitoring plan, and the grade sheet.
6. **Director portal:** campus by college, coordinators and their scopes, program hours, the Rules page (gate, overtime, grade split), approvals.
7. **IT Admin portal:** accounts and system status. Point out that it cannot open students' records.

**Do not claim:**
- face recognition;
- fully offline;
- penetration tested;
- WCAG certified;
- that email and push are live;
- that the grade values or the evaluation criteria are official;
- that the privacy notice is final;
- that it has been tested on real phones.

**Ask the Director to decide:**
1. The grade split, the instructor weights, PSU's grade table and the HTE evaluation criteria.
2. The required hours for all 15 programs, and each program's OJT semesters.
3. The medical and clearance items for each program.
4. When to turn on the deployment gate and the location check.
5. The privacy wording, the DPO and the retention period.
6. Who owns the IT Admin role and the hosting budget.
7. Pilot first or campus-wide, and whether a self-arranged internship path is needed.

**Rollout options:**
- **A. Pilot first (lower risk).** 1–2 programs for 4 weeks with paper in parallel, then every college. Needs a green CI, the go-live checklist and the device day.
- **B. Campus-wide.** Needs all of A done before the semester, plus the Director's settings and orientation for every college.
