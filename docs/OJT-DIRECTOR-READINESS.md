# INTERNet readiness for PSU Lingayen OJT: gap report and presentation brief

Prepared 22 November 2026 for the presentation to the OJT Director.

The two interview notes on how the campus runs OJT were compared against the code on `ui-redesign`. Those notes are the "flow and requirements" summary and "1. Initial Evaluation & Prerequisites". Neither note is in git.

**Reading the status column:**
- ✅ In the system and working.
- 🟡 There, but needs revision to match the campus process.
- ❌ Not built yet.

## Summary

INTERNet is already strong on **daily OJT operations**:
- attendance with a camera check;
- offline time-in;
- the CS Form 48 DTR;
- daily, weekly and monthly reports;
- the Narrative builder;
- the university's FM-AA-INT forms;
- messages and announcements;
- monitoring, KPIs and backups.

There are about 280 API tests and 22 end-to-end specs, and the axe sweep reports 0 accessibility violations.

INTERNet is weak on what happens **before deployment** and at **grading time**:
- No rule stops a student who has not cleared medical exams, clearances or academic screening.
- Required hours are a per-student default of 180, not set by program.
- Overtime is not handled.
- Only the agency's 50% of the grade is computed.
- There is no Director role, and every coordinator sees every student.

These are the gaps the Director is most likely to notice. Each one has a fix planned below, and the step-by-step prompt is in `docs/IMPLEMENTATION-PROMPT.md`.

---

## 1. What the process needs vs. what INTERNet has

### A. Before deployment
| Requirement (from the notes) | Status | In the code / what is missing |
|---|---|---|
| Academic screening: the instructor checks the portal record for failed or missing subjects | ❌ | Exists only on paper: FM-AA-INT-01 section B and FM-AA-INT-02 (`my-pwa/src/pages/student/forms/formModel.ts:171`, `:254`). No eligibility status, hold or result is recorded. |
| Internship in the 2nd semester; some programs span both semesters | 🟡 | `terms` (migration 021) with open/close and a setup checklist (`backend/src/services/termSetup.ts`). There is no semester type, and a student belongs to one term only. |
| Medical: general exam, urinalysis, chest X-ray, CBC, and a pregnancy test for female students | 🟡 | One generic "Medical" requirement (migration 006). Per-program targeting exists (`applies_to`, migration 045, `backend/src/services/deliverables.ts:32`). The separate items are not seeded, and the student record has no sex field to target the pregnancy test. |
| Anti-hepatitis for food-related programs (HM, VIT/BTVTEd, BIT Food Service, BSND) | 🟡 | Can be targeted with `applies_to`, but is not seeded. |
| NBI, police and barangay clearance | ❌ | Not present. These can be modelled as requirements. |
| SSS and Pag-IBIG numbers (optional, advised) | ❌ | No fields. Migration 060 holds contact details only. |
| **Deployment gate**: no OJT until cleared | ❌ | Time-in (`POST /api/attendance`, `backend/src/server.ts` around 2510–2630) never checks requirements or eligibility. |
| Independent (self-arranged) internship with extra clearances | ❌ | There is no placement type. |

### B. Host Training Establishments (HTE) and placement
| Requirement | Status | In the code / what is missing |
|---|---|---|
| Registry of partner agencies | ✅ | `companies` (migrations 020 and 060), `pages/coordinator/Companies.tsx` and `CompanyPage.tsx`. MOA start and expiry dates, with an "agreement ending/expired" filter. |
| Notarized MOA | ❌ | The MOA is only a *student* upload. Companies have no MOA file and no notarized flag. |
| Government vs. private | ❌ | No type field. |
| Screening of private agencies: standing, work environment, space, safety | ❌ | `site_visits` (migration 034) holds free-text findings only. |
| New-agency application or assessment form, requested by a student, the agency or the university | ❌ | |
| Slot allocation (e.g. 5 of 40) | 🟡 | `companies.slots` is shown as "X of Y taken" but is **not enforced** when a student is assigned (`backend/src/routes/extensions.ts:1773-1789`). |
| Student picks a preferred agency by program; the instructor assigns the rest | 🟡 | Direct assignment and CSV import work, and term setup counts students with no company. There is no preference or request flow. |

### C. Hours and daily operations
| Requirement | Status | In the code / what is missing |
|---|---|---|
| Program hours: PA 400, IT 480, BSBA 600 | 🟡 | Hours are set **per student, with a default of 180** (migration 002 line 61, `Students.tsx:90`, import `extensions.ts:931`). `programs` has no hours column. The first note gives PA as "400 or 480"; the second says 400. Confirm with the Director. |
| Standard 8-hour workday | 🟡 | Hours come from each student's schedule (`backend/src/services/dayRules.ts`, migration 065). The only cap is `MAX_SHIFT_HOURS = 16` (`server.ts:3585`). Credit beyond the scheduled day is not limited. |
| Overtime: an official form, at most 2 a week | ❌ | Only a printable waiver/overtime form exists (`formModel.ts:334`). |
| DTR on the Civil Service form, or the agency's DTR system | ✅ | CS Form 48 (`components/DtrSheet.tsx`, `routes/timeRecord.ts`), with monthly supervisor certification (migration 030). An agency's own DTR can only be uploaded as a generic document. |
| Biometric / face-recognition-style check | ✅ / 🟡 | MediaPipe liveness check (`my-pwa/src/lib/liveness/*`, `backend/src/services/liveness.ts`), and the supervisor reviews the photo. It is **not** face recognition, and the server trusts the phone's report. It is a deterrent, not proof. |
| Location / surroundings verification | ❌ | No geolocation. GPS data is deliberately removed from photos, and companies have no coordinates. |
| Working without signal at the agency | ✅ | Offline time-in with signed vouchers and a device key, plus the waiting queue (`lib/offlineTimeIn.ts`, `routes/offlineTimeIn.ts`, migrations 049 and 055). |
| Daily diary / tickler notebook, read at the end | ✅ | Accomplishments at time-out; daily, weekly and monthly reports; journals; the Narrative builder with Word export. |

### D. Monitoring, communication and records
| Requirement | Status | In the code / what is missing |
|---|---|---|
| A monitoring plan with periodic check-ins | 🟡 | The Monitoring page, alerts, the site-visit log and student notes. There are **no planned visits**, no visit schedule and no reminders. |
| Email, Messenger, text and calls | ✅ | In-app messages, announcements with read receipts, notifications, email (Resend) and push. **Email and push are off until they are configured.** |
| Formal forms sent officially | 🟡 | Evaluations are submitted in the app, but no transmittal or receipt is recorded. |
| Papers lost in office stacks; scan and upload to a central database | ✅ / 🟡 | Private file store, document review, ZIP export, version history and soft delete. Missing: transmittal letters and "received by / received on" for hard copies. |

### E. Evaluation and grading
| Requirement | Status | In the code / what is missing |
|---|---|---|
| 50% from the HTE evaluation | ✅ | The weighted FM-AA-INT-13 form (migration 074, `backend/src/services/evaluationGrade.ts`). Its criteria are a **sample** until the university confirms them. |
| 50% from the university / instructor: logs, punctuality, pre-internship preparation, conduct | ❌ | Only a free 1–5 "teacher" rating (migration 002), which feeds no grade. |
| Final grade = 50 / 50 | ❌ | Not computed. |
| KDCC / OJT office holds the forms; Director oversight | ❌ | The only roles are student, supervisor and coordinator. **Every coordinator sees every student** (`GET /api/coordinator/students`), and any coordinator can deactivate another (`extensions.ts:3900-3985`). |
| Completion | 🟡 | Completion checklist and review request (migration 027). The certificate is an upload from the agency, and the coordinator has no approve/close step. |

---

## 2. Flaws the Director may point out, and the fix for each

| # | Likely objection | Fix |
|---|---|---|
| F1 | "A student can start OJT without the medical exams, clearances or academic screening." | Seed a requirements pack per program and add a **deployment gate**. Time-in is refused until the coordinator marks the student *Cleared for deployment*. An override needs a reason and is written to the audit log. |
| F2 | "The hours are wrong; it says 180." | Give each program its required hours (BPA 400, BSIT 480, BSBA 600, the others set by the Director). New and imported students take the program's hours, and a per-student override stays possible. |
| F3 | "There is no overtime rule." | Overtime requests: the student files one, the supervisor approves it. The limit is 2 per week and can be changed. Time beyond the scheduled day counts only when overtime was approved. |
| F4 | "The grade is not 50/50." | An instructor rubric: logs and diaries, punctuality (computed from submission dates), pre-internship preparation and conduct. The final grade is the HTE half plus the instructor half, worked out on the server, shown and exportable. The weights can be changed per term. |
| F5 | "How do I see every college, and how do coordinators see only their own?" | A `director` role with campus-wide view, settings and coordinator management. Coordinators are limited to their assigned colleges or programs. |
| F6 | "Is the MOA notarized? Are private agencies screened? What about slots?" | HTE type, MOA file with notarized flag and dates, a screening checklist for private agencies, an approval status, and slots **enforced** when students are assigned. |
| F7 | "The biometric check should verify the location." | An optional geofence: the HTE's location and radius. Time-in keeps only "inside / outside, about N m" and never a location trail. Outside the fence, the log goes to the supervisor instead of being refused. |
| F8 | "What about cheap phones, no data, or a camera that fails?" | These already exist: time-in without a photo (the supervisor confirms), the supervisor records the time-in in person, offline vouchers, and the QR hand-off from a computer. Show them in the demo. |
| F9 | "Is the data safe under RA 10173? The medical files?" | Finish the privacy notice (DPO and retention), turn on `PRIVACY_CONSENT_REQUIRED`, set `PHOTO_RETENTION_DAYS`, put health and clearance documents in a restricted category, and remove the plain-text password fallback. |
| F10 | "Who runs this after you graduate, and what does it cost?" | A handover: DEPLOY.md, encrypted backups, the go-live checklist, a hosting cost estimate, and a proposal that university IT/MIS owns the hosting. |

---

## 3. Concerns about using it across the whole campus

- **Hosting and scale.**
  - The backend runs as one instance (DEPLOY.md, "one instance"), and some rate limits are held in memory.
  - That is enough for one campus, but it needs a paid plan, a budget line and a named owner.
  - The Railway trial has ended, per the 24 October report.
- **Production is behind.**
  - `main` lacks 233 commits and 42 migrations.
  - The go-live checklist (`docs/GO-LIVE-CHECKLIST.md`) has not been run, and the scheduled backups are not on yet.
- **Not yet tested on real phones.**
  - The camera check, offline time-in, passkeys and push have only been tested in a browser with a fake camera.
  - Before the pilot, run a one-day device test on 5–10 phones, including a low-end Android and an iPhone.
- **Signal at the agencies.**
  - The offline queue covers this.
  - The first time-in downloads about 19 MB of face-check files, so students should open the app once on campus Wi-Fi during orientation.
- **Supervisor workload.**
  - Government supervisors are busy, so their part has to stay small: the daily digest, one Review button and a one-page guide.
  - An agency's biometric DTR printout can be uploaded as supporting evidence.
- **Policy.**
  - The process has to fit CHED CMO No. 104 s. 2017 and the PSU OJT manual. The FM-AA-INT forms are already mirrored.
  - The MOA template should carry a data-sharing clause naming INTERNet.
- **Change management.**
  - Run paper in parallel for the first 2–4 weeks.
  - Hold orientation for students, coordinators and HTE supervisors.
  - Name a help-desk contact.
- **Students without a smartphone.**
  - The supervisor can record time-in, and the QR hand-off lets a computer start the step.

---

## 4–5. Quality checklist before publishing: issue and resolution

| Area | What was found | Resolution |
|---|---|---|
| Security | Legacy plain-text passwords are still accepted (`verifyPassword`, `server.ts:883-896`). The sign-in token is in localStorage. CORS accepts any origin if its variables are unset. Some IP limits are held in memory. | Hash the remaining plain rows with a one-off script, then delete the fallback. Refuse to start in production without `FRONTEND_URL`/`CORS_ORIGINS`. Keep the enforced CSP. The token in localStorage stays a documented, accepted risk (audit L3). |
| Privacy (RA 10173) | The notice is still `placeholder: true`, with no DPO or retention period. Photos are kept forever unless `PHOTO_RETENTION_DAYS` is set. The notice does not name health documents. Every coordinator sees every student. | Finish the notice with the Director and the DPO, and set the retention period. Put medical and clearance documents in a restricted category: only the student, the assigned coordinator and the Director can open them, and each opening is logged. Add coordinator scoping. |
| Integrity | The server trusts the phone's camera-check report. The 50/50 grade is not computed. Slots are not enforced. | The supervisor's photo review stays the final word (call it a deterrent, not proof). Compute the grade on the server. Check the slot inside the same transaction as the assignment. |
| Consistency | The 180-hour default conflicts with program rules. DEPLOY.md (removing old photos) says nothing is removed automatically, but a nightly purge exists. IDs are compared with and without trimming (audit M2). | Program defaults; correct the doc; normalise IDs when they are written. |
| Responsiveness | axe reports 0 violations; the supervisor layout shift is fixed; a ten-width sweep has been done. | Keep it that way: add the axe sweep to CI. |
| Functionality and capability | The gaps in section 1. | Phases 1 and 2 of the implementation prompt. |
| PWA and offline | IndexedDB is not encrypted (queued photos, vouchers). Data stays up to 72 h after a session ends. The first download is about 19 MB. Background Sync is not used, by design, because the service worker cannot read the token. | Delete a queued photo as soon as it is sent. Add a "Prepare for offline" step to onboarding. Add a "Shared phone: erase everything" sign-out. Document these trade-offs. |
| Error handling | Good: ErrorBoundary, client error reports, the problems log, toasts, and 409 "changed since you opened it". | When the deployment gate blocks a time-in, list exactly what is missing ("Not cleared yet: Chest X-ray, NBI clearance"). |
| Ease of use and affordance | The calm passes are done, and every screen has Help. | Add a "Requirements" card on the student's Today screen and a coordinator "Clearance board". |
| "AI" behaviour | No large language model is used. The only model is the MediaPipe face tracker for liveness. It can struggle in low light, with glasses or on slow phones. Detection runs on every frame with no throttling, and it has not been tested on phones. | Throttle detection to about 15 frames a second. After about 20 s with no pass, offer "Continue without photo (supervisor confirms)". Show a low-light hint. Never call it face recognition. |
| Policy | Rules are hard-coded or missing (overtime limit, grade weights, hours). | Make every rule a setting per term, changed only by the Director, with an audit log entry. |
| Precautions | No scheduled backups are running, and nothing outside watches the service. | Run go-live checklist steps 1–9, run a restore drill, and add a free uptime check on `/api/health`. |

---

## 6. Presentation brief

**Demo path (about 15 minutes, on a phone and a laptop):**
1. Install the student app from the landing page, then sign in.
2. Open Today, time in with the camera check, and show the hours strip.
3. Switch to airplane mode, time out, show "Waiting to send", reconnect and watch it send.
4. Show a daily report with a photo, the Narrative builder, and Fill and print for the FM-AA-INT forms.
5. As the supervisor, open Review and verify the log, then look at the intern's page.
6. As the coordinator, show Today, the KPIs, Companies with MOA dates, the student record, the DTR print and an analytics export.

**Say plainly what is not built yet:** the ❌ rows in section 1, and when each will be ready (Phases 0–2 in the implementation prompt). Being honest about the gaps earns more trust than a perfect demo.

**Do not claim** (see PAPER-CORRECTIONS.md):
- "works fully offline";
- "face recognition";
- "penetration tested";
- "WCAG certified";
- that email and push are live;
- that the evaluation criteria are the university's official ones.

**Ask the Director to decide:**
1. The required hours for every program.
2. The overtime limit, which the notes give as 2 a week.
3. The weights of the instructor half of the grade.
4. The medical and clearance items for each program.
5. The retention period and the DPO's contact details.
6. Who hosts the system, and on what budget.
7. Whether to pilot first or go campus-wide.

**Rollout options:**
- **A. Pilot, then campus-wide (lower risk).**
  - 1–2 programs (for example BSIT and BPA) for the first 4 weeks, with paper in parallel.
  - Review with the Director, then open it to every college.
  - Needs Phase 0 and the deployment gate.
- **B. Campus-wide from day one.**
  - Needs all of Phase 1, the go-live checklist done, paid hosting, and orientation for every college before the semester starts.
