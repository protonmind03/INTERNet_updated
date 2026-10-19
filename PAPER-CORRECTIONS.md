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
| 5. ERD | Students, Supervisors, and Coordinators include auth_version and must_change_password; Students includes the password hash; Attendance is marked unique on (student_id, date). Since migration 037: four more entities, Colleges, Programs, Majors and Blocks, drawn as described under E ("The ERD has four more entities"). |
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
- Password recovery, reminder emails, and browser push need email and
  VAPID settings on the server; without them those features report that
  they are not configured. Email is sent through an email provider's HTTPS
  API (or SMTP), from a domain the programme owns; the system does not run
  its own mail server.
- Coordinator dashboard, monitoring, and analytics figures load on request
  and are not live. The dashboard's lists and figures are counted by the
  server each time the page is opened.
- On Monitoring, the coordinator's date range shows each student's hours
  and logs inside the dates and filters the flagged logs. Progress toward
  the required hours is always for the whole placement.
- A page that crashes shows a recovery screen and sends the server a short
  report (error text, page path, build). There is no error dashboard; the
  reports are lines in the server log.
- There is one coordinator account by default. A coordinator can add,
  deactivate and reactivate other coordinator accounts; nobody can
  deactivate their own.
- The supervisor's final evaluation is filled in on a form whose criteria
  and scale the coordinator sets. The system ships with a sample form,
  marked as a sample; the paper should describe the university's own
  criteria only once they have been entered.
- A supervisor can correct the times on a log, with a reason the student
  sees; the times before and after are kept in the audit log. A supervisor
  can also certify a month of a student's time record. Certifying records
  who, when and how many verified hours; it is not a digital signature.
- "Projected finish" is counted from the student's weekly schedule and
  the holiday list, not from the hours they have actually been rendering.
  "At risk" means that date is after the term ends, or nothing is
  scheduled. If the paper calls this a prediction or predictive analytics,
  that overstates it: it is arithmetic on the schedule.
- The coordinator's alerts are fixed rules (reviews waiting more than 3
  days, agreements ending within 30 days, 5 scheduled days without
  attendance), worked out when the dashboard is opened.
- Summary emails to supervisors and coordinators exist in the system but
  are sent only when the server has email settings, which the hosted
  system does not have at the time of writing.
- A camera check is good for one time-in: the ticket the server issues
  for it is refused if presented a second time. This closes replaying one
  check; it does not change the limit already stated above, that the check
  runs in the student's browser and the server trusts its report.
- An announcement's "seen by" count is the number of people who have had
  it on their list of announcements (for a student, the Announcements tab
  under the bell; the Announcements page counts the same way). It does not
  show that anyone read it.
- The schedule's calendar file is a copy made when it is saved; it does
  not update itself when the schedule changes.
- Accessibility was checked with an automated tool (axe, WCAG 2.1 A and
  AA) on every page as it loads, with no failures left. Automated checks
  find only part of what the guidelines cover; the paper should not claim
  the system "is WCAG compliant".
- On their profile a student can edit their name and email, and add a
  mobile number and an emergency contact. Program, company and required
  hours are set by the coordinator.
- A student writes a weekly journal, which their supervisor marks reviewed
  or returns with a note. It is not graded and is not counted toward
  completion.
- The completion checklist, a card on the student's Profile, is a list
  the system counts (hours, logs, documents, tasks, the supervisor's
  evaluation, the student's rating of the company).
  "Request completion review" tells the coordinator the list is done. It
  does not complete, clear or certify anything; if the paper says the
  system "clears" or "certifies" a student, that is not accurate.
- Holidays entered by the coordinator are shown on the schedule and the
  Daily Time Record. They do not block a time-in.
- A student who leaves a log open is reminded once, an hour after their
  scheduled end. The log is not closed for them.
- Before the first time-in a student reads and agrees to a privacy notice,
  and can download a copy of their data. The notice wording in the system
  is a draft awaiting the university's approved text, and no retention
  period for attendance photos has been set: photos are kept. If the paper
  describes a retention period or an approved consent form, it is ahead of
  the system.
- The student portal's menu (rewritten for Iteration 21, October 2026):
  on a phone it is a dock at the bottom of the screen with Today,
  Attendance, Schedule and Tasks, and "More" (Documents, Weekly report,
  Resolution Center, Help). On a wider screen the folder's tabs are Today,
  Attendance, Schedule, Tasks, Documents and Weekly report.
  Notifications, Announcements, Completion, Feedback and Report a concern
  are no longer menu items. If the paper, a screenshot or the module
  diagram lists them as separate student pages or menu entries, say
  instead where each is now:
  - notifications and announcements are read from the bell in the header,
    on two tabs; for trainees (Iteration 21) the first tab holds what asks
    them to do something ("Action needed" until it is done) and the second
    the coordinator's announcements together with notifications that only
    inform; the bell shows twenty at a time and can show only the unread;
  - the completion checklist is a card on the student's Profile;
  - reporting a concern and the evaluations (those written about the
    student, and the student's rating of the company) are the two tabs of
    one page, the "Resolution Center", opened from the avatar menu on a
    phone and from the header on a desktop.
- On screen the student portal says "concern" for what a student reports.
  If the paper says "complaint" or "incident report" for the same thing,
  use one word throughout; "concern" matches the screens. (The database
  table is still named `complaints`; that is a name in the ERD, not on
  screen.)
- The student's Today page no longer carries the attendance card. It
  shows one line saying where the day stands, and the card is on the
  Attendance page. On a phone, the next step of the day (Time in, Lunch,
  Back, Time out) is a button that floats above the menu on every page
  except Attendance and Profile. A screenshot of the old Today page is out
  of date.
- The supervisor portal's top bar, since October 2026, is Review, Interns,
  Attendance, Tasks, Documents, Journals and Evaluations. What the paper
  may call "Incidents" or "Incident Reports" is "Concerns" and is opened
  from the supervisor's account menu; announcements are read from the
  bell. A screenshot or module list that shows Incidents in the top bar,
  or Announcements in the account menu, is out of date.
- One word is used on every screen for what a student or a supervisor
  reports to the coordinator: a "concern". The coordinator's page and
  sidebar entry are "Concerns". If the paper uses "complaint", "incident"
  or "incident report" for it (the feature table, the use case names, the
  module diagram), use "concern" in the text, and keep `complaints` only
  where the paper names the database table.
- The supervisor's Review queue also lists "Final evaluation due" for an
  intern within 40 hours of their required hours, or past them, who has
  no final evaluation. It is a reminder that opens the evaluation form.
  The system does not block completion on it beyond what the completion
  checklist already counts, and it does not write the evaluation.
- In the supervisor's attendance list each log is marked with how it was
  made (the intern's camera check, or recorded in person by the
  supervisor) and whether a step was recorded while the phone was
  offline. These marks describe how the record was made; they are not a
  verification result.
- A supervisor sees the name and email of the OJT coordinator in their
  account menu. The system does not assign supervisors to coordinators:
  with more than one coordinator, the one shown is the longest-serving
  active coordinator.
- The coordinator's dashboard, since October 2026, is in this order:
  today's attendance (timed in, on the clock, absent, scheduled but not
  yet in); one "Action list"; six key figures; verified hours over 14
  days; progress toward required hours; what waits with each supervisor.
  The Action list replaces the three lists the dashboard used to show
  (alerts, "Needs attention" and "Students to check on") and groups what
  needs doing by who has to do it: the coordinator, the supervisors, the
  students. A description or screenshot of the older dashboard is out of
  date.
- The dashboard and Analytics show six key figures, each against a
  target: students on track to finish within the term (90%); attendance
  on scheduled days over the last 4 weeks (95%); the median time from a
  student's time-out to the supervisor's decision (2 days or less);
  requirements complete among students past half their hours (80%); open
  concerns older than 7 days (none); agreements ending within 30 days
  (none). If the paper describes these:
  - the targets are defaults chosen for the system, fixed in the code.
    They are not the university's policy and a coordinator cannot change
    them yet. Do not present them as institutional standards;
  - "on track" is an estimate from each student's schedule, not a
    prediction of what a student will do;
  - the small eight-week chart on each card is worked out from today's
    schedules and end dates, because the system does not keep those as
    they were. It is a guide to direction, not a historical record;
  - the figures describe the programme. The system does not act on them:
    nothing is blocked, flagged or sent when a target is missed.
- The audit log also records a student agreeing to the privacy notice, a
  student downloading a copy of their data, and a coordinator opening a
  student's record, a submitted document or an uploaded photo. Opening
  the same thing again within ten minutes is one entry. It does not
  record supervisors or students viewing records, or anyone signing in.
  If the paper says the system logs "all access" or "every view", that is
  more than it does.
- The coordinator can filter the audit log by category, by who did it,
  by person, by record and by date, and can download the filtered entries
  as a CSV file (at most 10,000 at a time). The download is itself an
  entry in the log. Dates are Philippine dates.
- A student's weekly schedule is edited by the coordinator on the
  student's record (a Schedule tab), and still on the Requirements page.
  It is set one student at a time.
- The ERD has four more entities since October 2026 (migration 037), and
  Students has three more attributes. If Figure 5 is redrawn:
  - **Colleges** (id, name, short_name, is_active).
  - **Programs** (id, college_id, name, short_code, ojt_applies,
    is_active). A college has many programs.
  - **Majors** (id, program_id, name, is_active). A program has zero or
    more majors; "major" also covers a specialization.
  - **Blocks** (id, program_id, major_id, year_level, section, term_id,
    is_active). A program has many blocks; a block may be of one major
    and of one term, and either may be empty. A block has no name
    attribute: its name ("BSIT 4A") is put together from its program's
    short code, its year level and its section.
  - **Students** gains program_id, major_id and block_id, each optional.
    Students keeps its `program` text attribute, which is what is
    displayed; program_id is the link. A student belongs to at most one
    program, major and block.
  - **Terms** gains closed_block_ids (the blocks a closing switched off).
  The paper's text should say that a student's program is recorded both
  as text and as a link, and that the link may be missing for a student
  whose program was typed in a way the system does not recognise.
- The list of colleges, programs and majors in the system was entered
  from a list given to the group and has not been confirmed by the OJT
  office. If the paper lists the campus's colleges and programs, take
  them from the office, not from the system.
- "OJT applies" on a program only keeps it out of the pickers on the
  coordinator's student form. It does not stop a student of that program
  from being registered, timing in or being counted.
- The coordinator's pages (Dashboard, Monitoring, Analytics, Students,
  Documents, Evaluations, Audit log) share one filter bar: term, college,
  program, block, company, supervisor. The filtering is done by the
  server. If the paper describes "search and filter" (B16, B19, and the
  module diagram), this is what it is now. On the audit log the bar finds
  only entries about a student's own record or that name the student.
- Analytics and its exports report by program and by block as well as by
  company. A student not linked to a program is counted under the text on
  their account, so a program can appear under more than one spelling
  until the students are linked.
- A supervisor whose interns are of more than one program or block can
  narrow their pages to one. This is a view of their own interns only.
- **Feature 3 (attendance), wording (rewritten October 2026).** The four
  steps of a day are called "Time in", "Lunch break", "End break" and
  "Time out" on every screen. The paper may use "break": "Lunch break" is
  the start of the break and "End break" its end. (The earlier note here
  told the paper not to say "break"; that no longer holds.) The time
  record is printed with the columns Day, AM In, AM Out, PM In, PM Out,
  Hours, Status: Time in is AM In, Lunch break AM Out, End break PM In,
  Time out PM Out. The system does not ask for four
  times: lunch is optional. A day worked without one prints "No break" in
  place of AM Out and PM In, and a morning-only or afternoon-only day
  fills only its two columns. The system never prints a time that was not
  recorded; if the paper says the DTR "always shows four entries" or that
  the system "computes" the lunch hour, that is not what it does.
- **The weekly journal is now the weekly report.** One entry a week with
  four parts: What I did, What I learned, Problems encountered, and
  Solutions tried or identified (the last two optional). Beside it the
  system shows what the student wrote at time-out on each day of that
  week. The supervisor still marks it reviewed or returns it. It is not
  graded and, as before, is not counted toward completion. Use "weekly
  report" in the text; the table in the ERD is still `journals`, with one
  more attribute, `solutions`.
- At time-out a student may tick which of their assigned tasks they
  worked on that day. It is optional and is the student's own statement:
  the system does not check it against anything, and it does not change a
  task's status. The ERD has one more entity for it, `attendance_tasks`
  (attendance_id, task_id), between Attendance and Tasks.
- The student's Schedule page has three views: the week, a month
  calendar, and "My progress". The calendar and the progress figures are
  put together on the student's device from records already loaded, and
  work from the saved copies without a connection. "Late" is worked out
  by the server since October 2026 (see "After the Trainee portal and
  brand expansion" below): a time-in after the start minute, seconds
  ignored. Nothing happens to a student who is late: it is only shown.
- **Use cases: teams (new).** A supervisor can name a team of their own
  interns and assign one task to the team. Add to the supervisor's use
  cases: "Manage teams" (create, rename, change members, remove) and
  "Assign a task to a team". The system stores a team task as one task
  per member: each member sees it as their own, submits their own work
  and is reviewed separately, and the supervisor sees how many of the
  team have submitted. It is not a shared submission; if the paper says
  "group submission" or "one output per team", that is not what was
  built. The ERD has two more entities, `task_groups` (id,
  supervisor_id, name) and `task_group_members` (group_id, student_id),
  and Tasks has two more attributes, `group_task_id` and
  `task_group_id`.
- **Use cases: notes between supervisor and coordinator (new).** For each
  student there is a thread of notes that the student's supervisor and
  the OJT coordinators write and read. The student is not an actor in
  this use case and has no access to it: it is not on any student page,
  raises no student notification, and is not in the copy of their data a
  student can download. Add "Write a note about a student" to the
  supervisor's and the coordinator's use cases, and do not draw a line
  from the student to it. A note cannot be edited or deleted. The ERD has
  one more entity, `student_notes` (id, student_id, author_role,
  author_id, author_name, message, created_at). If the paper's privacy
  section lists what a student can see about themselves, this is the one
  record about them that they cannot.
- A supervisor can set the day a task is released (`tasks.available_from`).
  Before that day the intern does not see the task and is told nothing;
  on the day they are notified once. If the paper says a student is
  notified "as soon as a task is assigned", add "or on its release day".
- The supervisor's portal has six places in its top bar: Review, Interns,
  Attendance, Tasks, Documents, Weekly reports. Evaluations is no longer
  one of them: star ratings and the final evaluation are written on each
  intern's own page (Interns > an intern > Evaluate). A screen list or
  navigation diagram that shows "Evaluations" as a supervisor page should
  show the intern page with its tabs: Overview, Attendance, Tasks,
  Documents, Weekly reports, Evaluate, Time record, Notes.
- The coordinator can send a supervisor a reminder of what is waiting for
  their review, at most once a day per supervisor. Add "Remind a
  supervisor" to the coordinator's use cases. It is recorded in the audit
  log.
- A supervisor can see when the coordinator last visited their company
  and what was left to follow up. They cannot see the coordinator's
  findings. If the paper says site visit records are "visible to the
  coordinator only", change it to "the findings are visible to the
  coordinator only".
- **Analytics: student performance (new).** The coordinator's Analytics
  page has a "Student performance" table, and each student's record opens
  with the same summary. For each active student the system counts:
  verified and required hours and the projected finish; attendance on
  scheduled days; late time-ins; attendance logs rejected and logs with
  corrected times; tasks submitted on time, tasks late and the average
  task rating; weekly reports written against weeks worked; requirements
  approved against those asked of the student; the supervisor's average
  star rating; the final evaluation's average; and concerns that name the
  student. It then shows a status word and one sentence made from those
  numbers by a fixed template.
  **The paper must not call this a score, a grade, a ranking, AI, a
  prediction or an "automated assessment".** There is no single number:
  the figures are not weighted or added together. The status word
  (Completed, At risk, Behind, On track) comes from four fixed rules that
  the page shows beside it; nothing is learned from data. If the paper
  describes "performance analytics", describe it as counts from records
  and a rule-based status, and list the rules (CHANGES.md section 31).
- **Analytics: date range and chart.** The attendance figures can cover
  any first and last day (two years at most), grouped by day, week or
  month; the chart scrolls sideways and has + and - buttons for the width
  of its columns. If the paper says analytics cover "the last 14, 30 or
  90 days" only, add the date range. There is no pinch or mouse-wheel
  zoom; do not describe one.
- **Deliverables (changes the "Set OJT Requirements" use case).** A
  requirement can now have a due date, be due by the end of a numbered
  week of the term, or be due every week; it can be reviewed by the
  coordinator instead of the supervisor; and it can be asked only of some
  programs or blocks. Add to the coordinator's use cases: "Set a
  deliverable's due date, reviewer and who it applies to" and "Review a
  deliverable" (only those set to the coordinator). The supervisor's
  "Review documents" use case now excludes deliverables set to the
  coordinator. The student's "Upload requirement" use case now includes
  uploading for one week of a weekly deliverable. A weekly deliverable is
  separate from the weekly report and is not counted among the documents
  needed to complete the OJT.
- **ERD.** New entities:
  `deliverable_items` (id, requirement_id, student_id, period_start,
  due_date, document_id, status, reminded_at), between Requirements,
  Students and Documents: one row per week per student for a weekly
  deliverable;
  `deliverable_reminders` (requirement_id, student_id, due_date,
  sent_at);
  `kpi_targets` (key, target, updated_by, updated_at);
  `filter_views` (id, coordinator_id, name, filters, created_at),
  belonging to Coordinators.
  New attributes on `ojt_requirements`: due_date, due_rule,
  reviewer_role, applies_to.
- The coordinator can download many students' documents as one ZIP
  (Documents page), limited to 500 files or 500 MB, recorded in the audit
  log with the filters used. Files are still stored in one place under
  names that cannot be guessed; if the paper describes "folders per
  student" or "per program" in storage, that is not how it is stored. The
  grouping by college, program and block exists only on the page.
- The targets of the six key figures can be changed by a coordinator
  (Dashboard > Targets) and each change is in the audit log. If the paper
  gives the targets as fixed values (90%, 95%, 2 days, 80%, 0, 0), call
  them defaults.
- One weekly schedule can be set for every student of a block at once
  (Programs or Students page), after a preview of who already has a
  different one. Schedules are no longer edited on the Requirements page;
  a screen list that shows a schedule editor there should move it to the
  student's record and the block.
- The Terms page shows a setup checklist for a term that has not started
  or has just started. Each line is worked out by the system from its
  records; the coordinator does not tick anything. Do not describe it as
  a to-do list the coordinator fills in.
- A coordinator can save the filter bar's choices under a name ("saved
  views"). They are that coordinator's own.

## After the Round 2 review (12 October 2026)

Figures and claims to use as they stood at the review, in place of older
ones wherever the paper gives them:

- **Size.** 198 API routes; database migrations 001 to 045; 166 automated
  API tests and 30 end-to-end browser tests, all passing on a developer's
  machine. If the paper gives earlier counts (53 tests, 21 journeys),
  update them or say "as of" a date.
- **Accessibility.** The claim that can be supported: "checked with
  axe-core against WCAG 2.1 levels A and AA on every page of the three
  portals at phone and desktop width, and with menus and dialogs open
  (about 450 states); one violation was found and is listed for fixing".
  Do not write "WCAG compliant", "fully accessible" or "tested with
  screen readers": an automated check finds only part of what a person
  would, and no screen reader has been tried.
- **Offline use.** What is true: the student's attendance, tasks,
  schedule, weekly reports, absences, deliverables and notifications are
  kept on the device for reading without a connection, and a time-in or
  time-out made offline is sent later. The supervisor keeps their intern
  list, schedules and notifications. The coordinator's pages keep
  nothing. All of it is erased when the account signs out. The service
  worker stores the application's own files only and never a response
  from the server. Do not write that "the system works fully offline" or
  that data is "cached by the service worker".
- **Roles.** Every API route is checked for the caller's role on the
  server, and a student or supervisor is limited to their own records.
  This was re-read for the 40 routes added in Round 2. It is a code
  review and tests, not a penetration test; do not call it one.
- **Audit log.** It records decisions and changes made to someone else's
  record. It does not record a task being assigned, changed or cancelled
  (only its review). If the paper lists what is audited, leave task
  assignment out.
- **Not yet done, so not to be claimed:** use on real phones for anything
  built in Round 2; email and push notifications (both are built and
  switched off on the hosts); the university's own final evaluation
  criteria (the form in use is a sample); a backup of uploaded files on
  the host.
- **One word still to settle:** the screens say "requirement" in some
  places and "deliverable" in others for the same list. Until that is
  decided, the paper should use "requirement" and describe due dates,
  weekly requirements and the coordinator as reviewer as properties of a
  requirement.

## After the system audit (13 October 2026)

- **Offline use, more exactly.** Lunch and time-out steps recorded
  without a connection wait on the phone and are sent later. They survive
  a session that ends by itself and are sent at the next sign-in of the
  same account, for up to 72 hours; the server still refuses any step
  older than 12 hours. A sign-out the student chooses erases them, after
  saying how many. Time-in still needs a connection.
- **Deleting records.** The paper should not say records are never
  deleted. Seven kinds of record can be removed by the person
  responsible for them; each removal keeps a full copy in
  `removed_records` with who removed it and when, and (except a
  student's own withdrawn absence notice) writes an audit line.
- **ERD.** One new table, `removed_records` (migration 046): the table
  and id of the removed row, the student it concerned if any, the row
  itself, and who removed it. It has no foreign keys.
- **Audit log coverage** now includes task assignment, change and
  cancellation and evaluations of a student. Team membership (a
  supervisor's own grouping) is not logged.
- **Sign-in token.** It is kept in the browser's local storage. What
  protects it is the content security policy (enforced, scripts from the
  site only), a 12-hour life, and that sign-out and a password change
  end it on the server.
- **Word to use:** "requirement" (decided 13 October 2026).

## After the email and push workstreams (14 October 2026)

- **Email is optional and may be off.** The paper should say that
  password recovery by email, deadline emails and summary emails work
  only when the host is given an email provider and a verified sending
  domain, and that without them a coordinator resets passwords and all
  reminders are delivered inside the app.
- **Push notifications** are delivered by the browser makers' push
  services using the Web Push standard with VAPID keys. They were seen
  working in desktop Chrome; phones are not yet tested.
- **ERD.** One more table, `email_daily_counts` (migration 047): a day
  and how many emails were sent on it. No personal data, no foreign keys.
- **A status page for the coordinator** ("What is switched on") reports
  which optional parts are configured. It is the honest answer to "is
  this feature live" and the paper can cite it.

- **File storage (14 October 2026).** The paper may say uploaded files
  are kept privately on the server's disk, in Azure Blob Storage or in an
  S3-compatible bucket (Cloudflare R2), chosen by configuration, and are
  only ever served through routes that check the reader. It should not
  say which is in use unless the coordinator's status card says so.

- **Monitoring (14 October 2026).** The system records its own faults
  (a label, the kind of error, a count, first and last time) in a table,
  `problem_reports` (migration 048, no personal data, no foreign keys),
  and shows them to coordinators. No third-party monitoring service is
  used. The paper should not claim alerting: nobody is notified.
- **The word is settled (14 October 2026): "requirement".** The earlier
  note "One word still to settle" is closed. The paper should say
  requirement throughout, and may mention that a requirement can have a
  due date, can recur weekly and can be reviewed by the coordinator.
  "Deliverable" survives only in table and route names.

## After the offline time-in (14 October 2026)

- **Time-in no longer always needs a connection.** The earlier
  correction "Time-in still needs a connection" is replaced. With no
  connection a student can record a time-in without a photo. The paper
  must say plainly that such a time-in has no camera check and no photo,
  is marked as such, and counts only after the supervisor confirms it
  for that one log.
- **Liveness claim, narrowed.** "Every time-in is verified by a camera
  liveness check" is no longer true. True: every time-in made with a
  connection is; one made without is verified by a person instead.
- **ERD.** `attendance` gains `offline_time_in_request` (migration
  049): empty for a normal time-in, the phone's request id for one
  recorded offline.
- **Limit to state.** The system cannot tell a phone that truly had no
  signal from one whose connection was switched off on purpose.

## After pictures on entries (14 October 2026)

- **New capability to describe.** Up to three pictures may be attached
  to a time-out note, a weekly report and a concern, by whoever wrote it.
- **A privacy claim the paper may make, because it is tested:** a
  picture is re-encoded on the device before upload, which removes
  embedded metadata including location. It may NOT claim this of files
  uploaded as documents or as a concern's evidence file, which are stored
  as sent.
- **Access rule worth stating.** A concern's pictures are visible to the
  person who filed it and to coordinators only, never to the student's
  supervisor.
- **ERD.** One new table, `attachments` (migration 050): what kind of
  entry and which, the student it belongs to (empty for a concern filed
  by a supervisor), who uploaded it, the stored file, its type, size,
  dimensions and SHA-256, a caption, its position, and when it was taken
  off the entry if it was. Foreign key to `students`, not validated.
- **Retention.** Pictures on entries have no retention period yet.

## After the Trainee portal and brand expansion (October 2026)

Iterations 18 to 23. Each item below changes something the paper may
describe; the earlier notes it replaces are marked there.

- **Step names.** On screen the four steps are Time in, Lunch break, End
  break and Time out. The printed time record keeps its columns AM In,
  AM Out, PM In and PM Out.
- **When a time-in opens.** A time-in opens 30 minutes before the
  scheduled start. Earlier, it is refused and the trainee is told when it
  opens. On a holiday or a day not on the schedule it is allowed at any
  time.
- **Hours start at the scheduled start.** A trainee who times in early is
  credited from the start of the shift, not from their arrival. Hours are
  time out less that start, less the lunch taken. Logs recorded before
  this change keep the hours they had: nothing was worked out again.
- **Late (replaces "more than 15 minutes").** Late means a time-in after
  the start minute, seconds ignored: 08:00:59 is on time for an 08:00
  start and 08:01 is late. A grace period can be set (it is 0). Coming
  back after the lunch end is also marked late, for display only; the
  hours already leave lunch out. These numbers are settings chosen for the
  system, not a university rule.
- **Afternoon-only days.** If a trainee has not timed in by the start of
  lunch, the day becomes afternoon-only: the time-in opens 30 minutes
  before lunch ends, hours count from the lunch end, lateness is measured
  against the lunch end, and the day has no lunch steps. The morning is
  shown as absent but is not filed as an absence by the system; the
  trainee may file a reason for the morning. A shift that starts at noon
  or later is an afternoon shift and never has a morning to miss; one
  that ends by noon is a morning shift with only Time in and Time out.
- **Steps sent later** are judged at the time they happened on the phone,
  corrected by the measured gap between the phone's clock and the
  server's.
- **Half-day absences.** An absence is for the whole day, the morning or
  the afternoon. A morning and an afternoon may both be filed for one day;
  a whole day may not sit beside either. The paper should not say
  "one absence per day" any more.
- **Lunch window.** A schedule day may carry its own lunch window. Without
  one, a shift over noon takes 12:00 to 13:00.
- **ERD, migrations 065 to 068.**
  - `ojt_schedule` gains `lunch_start`, `lunch_end`.
  - `attendance` gains `session` ('full', 'am', 'pm'), `credited_from`,
    `late_minutes`, `scheduled_start`, `lunch_late_minutes`.
  - New `attendance_rules` (key, value, updated_by, updated_at): the
    numbers above.
  - `absences` gains `part` ('day', 'am', 'pm'); one absence per student,
    day and part.
  - New `student_signatures` (student_id, file_path, svg_paths, sha256,
    width, height, created_at, revoked_at), and `dtr_certifications`
    gains `trainee_signature_id`.
  - New `institution_profile` (one row: republic_line, university_name,
    campus_name, locality_line, seal_asset), and `programs` gains
    `formal_name`. The coordinator edits both.
- **The seal and the role colours (brand kit v4).** The app shows the
  Pangasinan State University seal on the splash, the sign-in screens, Help,
  printed reports and the Time Record, and says "A system proposal for
  Pangasinan State University – Lingayen Campus". Each role has its own
  colour layer (Trainee: Sunpath, Supervisor: Laurel Ledger, Coordinator:
  Royal Seal) over the shared INTERNet navy; every text colour pair meets
  WCAG AA contrast, and a test checks it. If the paper's figures show the
  old all-navy screens, they are out of date.
- **Splash.** The splash shows only when the installed app is opened cold,
  for at most 1.2 seconds; in a browser tab there is none.
- **Time Record header and signature (Iteration 20).** The printed Daily
  Time Record now carries the university's header (seal, republic line,
  university in blackletter, campus, college, the program's formal name,
  locality), the trainee's details read at the moment of printing, and the
  trainee's signature above their line. The signature is an image of their
  handwriting drawn in Profile, not a digital or cryptographic signature; a
  certified month keeps the signature it was certified with. ERD: as in
  migration 067 above.
- **Attendance figures.** The Attendance page's four counters were replaced
  by three cards: hours (verified, waiting, to go, with the projected
  finish), on time over the last 20 scheduled days, and this week.
- **Notifications (Iteration 21, migration 070).** Each notification is an
  "action" (it opens the page where something is done, and that thing is
  highlighted) or "info" (read in a dialog). ERD: `notifications` gains
  `kind`, `action_required` and `acted_at`; the system sets `acted_at`
  when the trainee does what was asked (retakes the photo, times out,
  submits the task, resubmits the weekly report, uploads the requirement,
  replies).
- **Calendar and progress.** The trainee's month starts on Sunday;
  weekends are tinted; each day shows one status dot and opens a sheet with
  its schedule, times, hours, decision and an appeal link. "My progress" is
  a burn-up chart, milestones (25 to 100%), the change in the projected
  finish since last week, and an eight-week rhythm strip.
- **Floating button.** On a phone the next-step button takes two taps: the
  first shows the step's name, the second opens it. A keyboard or screen
  reader opens it at once.
- **Passkeys (Iteration 22, migration 069).** A trainee may register a passkey (the phone's screen
  lock) and Lunch break, End break and Time out ask for it. It is never required: a step without it
  is recorded as not confirmed and the supervisor sees how each step was made. With no connection,
  challenges collected beforehand are signed on the phone and checked when the step arrives. ERD:
  `webauthn_credentials` (student_id, credential_id, public_key, sign_count, transports, backed_up,
  device_label, created_at, last_used_at, revoked_at), `webauthn_challenges` (challenge, student_id,
  purpose, valid_date, step, issued_at, used_at), `attendance.step_verifications`,
  `offline_action_ledger.verification`. The paper may say a step "can be confirmed with the
  phone's biometric lock"; it may not say biometrics are stored or required: the server never sees
  a fingerprint or face, only a signature.
- **End break camera check.** On the strict level (after a rejected time-in photo) End break also
  runs the camera check online; no photo is kept and skipping it does not stop the step.
- **The landing page and the three doors (Iteration 23).** The address "/" is now a public page
  (made when the site is built, no sign-in) that explains the system and leads to three doors:
  /student/sign-in, /supervisor/sign-in and /coordinator/sign-in. The paper's "login page with a role
  selector" becomes "each role signs in at its own door"; the sign-in rules are unchanged (one
  endpoint per role, as before). The old /login address goes to the landing page's doors.
- **Three installable apps.** Besides the original manifest, each role has its own: "INTERNet
  Trainee", "INTERNet Supervisor" and "INTERNet Coordinator", each with its own id, colours, icon and
  shortcuts. Describe them as installable web apps (PWAs) added from the browser; not as app-store
  apps. No database change.
- **First-open slides.** The installed app shows four slides per role the first time it is opened
  from the Home Screen. The paper may say permissions are asked for only after a tap.
- **Passkey sign-in** was not added: the doors use the password only (see the progress log).

