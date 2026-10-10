# Corrections for the System Architectural Design Document (rev 2)

These are the edits needed so that `CC106 GROUP 9 - architecture-aligned
draft (rev 2).docx` matches the system as it stands after the October 2026
changes (see `CHANGES.md`, section 13). Nothing has been changed in the
document itself; apply the edits you agree with.

Each entry gives where the text is, what it says now, and the replacement.
Entries marked **Figure** also affect a diagram. The figures are images, so
they were not checked; the last section lists what each one has to show.

## A. Decisions to make first

**A1. Who can confirm attendance: settled, change the paper.** Part III,
section 2 says the design "ensures only supervisors can confirm
attendance". That is no longer how the system works, and the difference is
in daily use, so the paper has to follow it (entry B9 has the wording):

- The assigned supervisor still confirms or rejects each log.
- The coordinator now decides flagged logs on the Monitoring page: a log
  can be verified, rejected with a reason, returned to the supervisor's
  queue, or acknowledged. The system records which role decided
  (`verifier_role`).
- Since October 2026 a supervisor can also record an intern's time-in in
  person, with a reason, when the camera check cannot run on the intern's
  device. That log is marked as recorded by the supervisor and is verified
  when the intern times out.

Restricting the route to supervisors is no longer a one-line change: it
would remove the coordinator's flagged-log review.

**A2. File storage wording.** The paper presents Azure Blob Storage as the
production store. `DEPLOY.md` uses a persistent volume on the backend host
instead, because it needs no Azure account. Entry B4 has wording that
covers both. If you do configure Azure, the current text can stay.

**A3. Hosting.** The paper does not name where the system runs. Once it is
deployed, add one sentence to Part II (entry B5).

## B. Text corrections

### Part I, Table 1

**B1. Feature 3, Daily Report Logging, Description.** Add break tracking
and the review rule.

> Current: "Lets students log their daily time-in, time-out, and tasks
> completed during OJT. Students submit an attendance image through the
> app; camera input is offered where supported by the device browser, and
> the assigned supervisor reviews and confirms the log."

> Replace with: "Lets students log their daily time-in, break, time-out,
> and tasks completed during OJT, with one log per day. Students submit an
> attendance image through the app; camera input is offered where
> supported by the device browser. Rendered hours exclude the recorded
> break. After the student times out, the assigned supervisor confirms the
> log or rejects it with a reason."

**B2. Feature 6, Data analytics & Reports, Description.**

> Current: "...exportable as CSV or printable/savable as PDF."

> Replace with: "...exportable as CSV, downloadable as a generated PDF
> report, or printable."

**B3. Feature 8, Document/Attachment Upload, Description.** The Teacher is
listed as a user; the description now says what the Teacher does.

> Current: "Lets students upload the OJT requirements set by the
> coordinator; the assigned supervisor approves or rejects each document."

> Replace with: "Lets students upload the OJT requirements set by the
> coordinator; the assigned supervisor approves or rejects each document,
> and the coordinator sees each student's requirement progress and can
> open the submitted files."

### Part II

**B4. Data Tier, File Storage** (see A2).

> Current: "...kept in a private Azure Blob Storage container when
> AZURE_STORAGE_CONNECTION_STRING is configured, or on private local disk
> during development (not durable on ephemeral hosts)."

> Replace with: "...kept in private storage: an Azure Blob Storage
> container when AZURE_STORAGE_CONNECTION_STRING is configured, otherwise
> a private disk directory, which is a persistent volume on the deployment
> host (PRIVATE_UPLOAD_DIR) and local disk in development."

Apply the same idea to the stack line in Part III ("private Azure Blob
Storage with local-disk fallback") and the Data Tier bullet in Part III,
section 1.

**B5. Hosting** (see A3). Add after the first paragraph of Part II, once
deployed, filling in the real services:

> "The PWA is served as a static site from Vercel. The Express backend,
> the PostgreSQL database, and the file volume run on Railway as one
> always-on service, which the in-process reminder scheduler and live
> notification stream require."

**B6. Application Tier, Core API.** Nothing is deleted through the API;
accounts and requirements are deactivated, and complaints are closed.

> Current: "It handles all Create, Read, Update, and Delete (CRUD)
> operations related to attendance records, task assignments, and filed
> complaints."

> Replace with: "It handles the create, read, and update operations for
> attendance records, task assignments, documents, and filed complaints.
> Records are not deleted through the application; accounts and
> requirements are deactivated, and complaints are resolved or dismissed,
> so the history stays available."

Make the matching change in Part III, section 1, Application Tier bullet
("CRUD operations for daily reports, ...").

**B7. Application Tier, Security and Access Control.** Add the measures
that now exist. Append to the paragraph:

> "New passwords must have 12 to 128 characters with an uppercase letter,
> a lowercase letter, and a number. On the deployed system, an account
> whose password was set by someone else (the initial coordinator account
> and every account a coordinator registers) must set its own password at
> first login. Changing or resetting a password signs out the account's
> other sessions. Failed logins are also limited per network address, the
> API sends standard security headers, and in production it accepts
> browser requests only from the deployed frontend."

**B8. Application Tier, In-App Notifications.** The sentence is now true
for all three roles; add the read actions.

> Current: "...authenticated users can review them in their role-specific
> PWA views."

> Replace with: "...authenticated users can review them in their
> role-specific PWA views and mark them as read, individually or all at
> once."

### Part III

**B9. Section 2, Use Case Diagram, last paragraph** (see A1; this
replacement is needed).

> Current: "...ensures only supervisors can confirm attendance under Daily
> Report Logging (Feature 3)..."

> Replace with: "...ensures attendance under Daily Report Logging (Feature
> 3) is confirmed by the assigned supervisor, or recorded by that
> supervisor in person when the student's camera check cannot run; the
> coordinator reviews logs the system flags and can verify, reject or
> return them; and the system records which role made each decision..."

If the Use Case Diagram is redrawn, the coordinator needs a "Review
flagged attendance" use case, and the supervisor a "Record time-in in
person" use case.

**B10. Section 2, "How the Components Interact".**

> Current: "Supervisors are notified when a log awaits verification, then
> confirm or reject it..."

> Replace with: "Supervisors are notified when a log awaits verification.
> Once the student has timed out they confirm it, or reject it with a
> reason..."

**B11. Section 2, OJT Coordinator Use Cases.** **Figure 2.**

> Current: "...Evaluate OJT Performance, View Analytics & Reports
> (extended by Export CSV/Print Report)."

> Replace with: "...Evaluate OJT Performance, View Submitted Documents,
> View Analytics & Reports (extended by Export CSV, Download PDF, and
> Print Report)."

**B12. Section 3, Context Diagram, System → OJT Coordinator.** **Figure 3.**

> Current: "Dashboard summaries, monitoring data with flagged
> discrepancies, analytics and CSV/printed reports, notifications."

> Replace with: "Dashboard summaries, monitoring data with flagged
> discrepancies, requirement progress and submitted documents, analytics
> with CSV, PDF, and printed reports, notifications."

**B13. Section 4, DFD, "How the Components Interact".** **Figure 4.** Add
after the sentence about Process 3.0:

> "Process 3.0 also returns each student's requirement progress and the
> submitted documents (D6, D8) to the coordinator for read-only oversight."

**B14. Section 5, ERD, "What the Diagram Represents".** **Figure 5.**

> Current: "...reflects the PostgreSQL migrations (001–006)."

> Replace with: "...reflects the PostgreSQL migrations (001–016)."

(There were 8 migrations when this entry was first written and 16 on
10 October 2026. Count the files in `backend/migrations` before
submitting, and use that number.)

Then, in the component list:

- Students: the entry lists no password. Add "password hash", and add
  "auth_version, must_change_password".
- Supervisors and Coordinators: add "auth_version, must_change_password".
- Attendance: add "unique (student_id, date)", and extend the description
  to "one log per student per day".

Add one sentence after the list:

> "auth_version invalidates an account's existing sessions when its
> password changes; must_change_password marks an account that still has a
> password chosen by someone else."

**B15. Section 6, Module Diagram, Coordinator Module.** **Figure 6.**

> Current: "Contains seven administrative submodules: Dashboard, OJT
> Monitoring (with flagged discrepancies), User Management, OJT
> Requirements & Schedules, Complaint Resolution, Evaluation Review &
> Rating, and Analytics & Reporting (CSV export and print)."

> Replace with: "Contains eight administrative submodules: Dashboard, OJT
> Monitoring (with flagged discrepancies), User Management, OJT
> Requirements & Schedules, Document Oversight, Complaint Resolution,
> Evaluation Review & Rating, and Analytics & Reporting (CSV export, PDF
> download, and print)."

**B16. Section 6, Search and Filter as a backend service.** Three
sentences describe Search & Filter as shared backend logic used by every
role. In the system, the backend provides the coordinator's global search
and the list endpoints; filtering by date, status, and text on each page
happens in the PWA on the records already loaded.

In the Common Services Module sentence:

> Current: "...the Deadline Reminder Scheduler, Search and Filter, private
> File Storage..."

> Replace with: "...the Deadline Reminder Scheduler, the coordinator's
> record search and the list endpoints that the page filters use, private
> File Storage..."

In "How the Components Interact":

> Current: "...rely on the analytics aggregation queries and the Search &
> Filter Service."

> Replace with: "...rely on the analytics aggregation queries and the
> record search endpoint; each page then filters its loaded records by
> student, date, status, or company in the client."

In "Centralized Infrastructure (Features 1, 7, 9, 11)":

> Current: "Placing User Authentication, Notifications, and Search &
> Filter services inside the Common Services Module prevents code
> duplication. This ensures that whether a student or a coordinator is
> logging in or searching records, they are utilizing the exact same
> secure, standardized backend logic."

> Replace with: "Placing User Authentication and Notifications inside the
> Common Services Module prevents code duplication, so every role logs in
> and receives alerts through the same secure backend logic. Search &
> Filter is shared at the client level instead: the same date-range and
> text filters are reused across the role-specific pages, on records the
> backend has already restricted to what that user may see."

### Part IV, feature-to-architecture table

**B17. Row 6, Data analytics & Reports.** No change to the cells; if the
row is expanded, add "CSV and PDF export" under Related Process.

**B18. Row 8, Document/Attachment Upload, System Module.**

> Current: "Student & Supervisor Module (Document Upload & Review
> Submodule); Coordinator Module (OJT Requirements & Schedules)"

> Replace with: "Student & Supervisor Module (Document Upload & Review
> Submodule); Coordinator Module (OJT Requirements & Schedules, Document
> Oversight)"

**B19. Row 9, Search & Filter.**

> Current, System Module: "Common Services Module (Search & Filter
> Service)"

> Replace with: "PWA Client (shared page filters); Common Services Module
> (coordinator record search)"

> Current, Related Data: "...per-page filters (attendance, tasks,
> documents, monitoring)"

> Replace with: "...per-page filters by text, status, and date range
> (attendance, daily log, tasks, documents, monitoring)"

### Small fixes

- Part II, first paragraph: "INTERnet" should be "INTERNet".
- Table 1, Feature 3, Purpose/Benefit: "work done.." has two periods.
- Part IV, first sentence: "The INTERNet system" should be "the INTERNet
  system".
- Table 1, "No." column: check that rows 1 to 3 show their numbers and
  that row 9 has a period like the others.

## C. Statements checked and left as they are

These were questioned in the audit and are accurate now:

- "Lets users search and filter records by student, date, status, or
  company" for Student, Supervisor, and Teacher (Feature 9). Date-range
  filters now exist on each role's attendance view.
- "Authenticated users can review [notifications] in their role-specific
  PWA views." Supervisors and coordinators now have a notification panel;
  supervisors also have a full page.
- "Migration 006 adds foreign-key constraints, so the database enforces
  these relationships for every new or updated row." This is exact: the
  constraints apply to new and updated rows.
- "Figures are retrieved on request rather than live-pushed" for the
  coordinator's dashboard, monitoring, and analytics.

## D. What each figure has to show

The six figures were not inspected. After the text edits, each should
agree with the following:

| Figure | Check that it shows |
|---|---|
| 1. System Architecture | File storage labelled as private storage (volume or Azure Blob), per B4. The host names, if you add B5. |
| 2. Use Case | Coordinator has "View Submitted Documents"; "View Analytics & Reports" is extended by Export CSV, Download PDF, and Print Report. If you keep A1 as the system has it, the coordinator is also linked to Confirm/Reject Daily Log. |
| 3. Context | The System → OJT Coordinator arrow includes submitted documents and PDF reports. |
| 4. DFD Level 0 | Process 3.0 has an output to the OJT Coordinator, reading D6 and D8. |
| 5. ERD | Students, Supervisors, and Coordinators include auth_version and must_change_password; Students includes the password hash; Attendance is marked unique on (student_id, date). |
| 6. Module Diagram | Coordinator Module has eight submodules including Document Oversight; Analytics & Reporting mentions PDF; Search & Filter is drawn as B16 and B19 describe. |

## E. Sections the document does not have

The document has four parts: features, architecture, diagram
explanations, and feature mapping. It has no objectives, scope and
limitations, or evaluation criteria. If your instructor's template asks
for any of these, they need to be written by the group. Limitations that
are true of the system today, for a scope section:

- Most of the system needs a connection. Since October 2026 the app
  itself opens offline, a student or supervisor can read the last saved
  copy of a few records (marked with the time it was saved), text being
  typed is kept as a draft, and a break, return from break or time-out
  pressed offline is kept on the phone and sent later, marked "recorded
  while offline" for the supervisor. Time-in, every upload, and all of the
  coordinator's work need a connection. If the paper says the system is
  "online only" or "works offline", neither is accurate; use this wording.
- A student's time-in photo is taken by the app after a short camera check
  (blink, smile or turn, on prompts the server chooses); a photo chosen
  from the device is refused. The check runs in the student's browser and
  the server trusts its report, so it raises the effort needed to fake a
  time-in but does not prove presence; the supervisor's review is still
  the control. A replacement photo sent with a corrected log, and the
  supervisor's in-person photo, are ordinary uploads.
- Password recovery, reminder emails, and browser push need SMTP and VAPID
  settings on the server; without them those features report that they
  are not configured.
- Coordinator dashboard, monitoring, and analytics figures load on request
  and are not live.
- On Monitoring, the coordinator's date range shows each student's hours
  and logs inside the dates and filters the flagged logs. Progress toward
  the required hours is always for the whole placement.
- A page that crashes shows a recovery screen and sends the server a short
  report (error text, page path, build). There is no error dashboard; the
  reports are lines in the server log.
- There is one coordinator account by default and no screen for creating
  another.
- Students can edit only their name and email on their profile.
